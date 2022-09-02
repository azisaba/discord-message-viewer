import { InputType, gunzip as gunzipCb } from 'node:zlib'
import express from 'express'
import { fetchAttachmentData, query, queryAttachment, queryAttachmentsByMessageIds } from '../sql'
import { processMessage, processAttachments, getContentTypeFromExtension } from '../util'
import decompress from 'decompress'
import {
  filterIllegalCharsForFile,
  getAttachmentData,
  getAttachmentMetadata, loadMessageJson,
  putAttachmentData, putMessageId,
  putAttachmentMetadata,
} from '../data'

const debug = require('debug')('discord-message-viewer:routes')

const gunzip = (input: InputType): Promise<Buffer> => new Promise((resolve, reject) => {
  gunzipCb(input, (err, result) => {
    if (err) {
      return reject(err)
    }
    resolve(result)
  })
})

const unBzip2 = async (input: Buffer): Promise<Buffer> => {
  const files = await decompress(input, { plugins: [require('decompress-bzip2')()] })
  if (files.length === 0) {
    throw new Error('No files in bzip2 archive')
  }
  return files[0].data
}

export const router = express.Router()
export const MESSAGES_PER_PAGE = 250

const getChannels = async (tableNames: Array<string>) => {
  const promises = []
  const tables = new Array<{ name: string, channels: Array<{ id: string, name: string }> }>()
  for (const table of tableNames) {
    const promise = query('SELECT DISTINCT `channel_name`, `channel_id` FROM `' + table + '`').catch(() => ({results:[]})).then(data => {
      const channels: { [channelId: string]: string } = {}
      data.results.forEach((e: { channel_name: string, channel_id: string }) => {
        channels[e.channel_id] = e.channel_name
      })
      tables.push({ name: table, channels: Object.keys(channels).map((id) => ({ id, name: channels[id] })) })
    })
    promises.push(promise)
  }
  await Promise.all(promises)
  return tables
}

router.get('/messages/list', async (req: Request, res: Response) => {
  query('SELECT table_name FROM information_schema.tables WHERE table_schema = ?', String(process.env.DB_NAME)).then(async data => {
    const tables = await getChannels(data.results.map((e: { table_name: string }) => e.table_name))
    tables.sort((a, b) => a.name.localeCompare(b.name))
    res.render('list', { tables });
  }).catch(e => {
    console.error(e.stack || e)
    res.status(500).send({ error: 'something_went_wrong' })
  })
})

router.get('/messages/:table/:channel_id', async (req: Request, res: Response) => {
  if (!/^[a-zA-Z\d_\-]+$/.test(String(req.params.table))) {
    return res.status(400).send({ error: "invalid table name" })
  }
  if (!/^\d+$/.test(String(req.params.channel_id))) {
    return res.status(400).send({ error: "invalid channel id" })
  }
  let page = parseInt(String((req.query || {})['page'] || 0))
  if (page < 0) page = 0
  const maxEntries = await query(`SELECT COUNT(*) FROM \`${String(req.params.table)}\` WHERE channel_id = ?`, String(req.params.channel_id))
      .then(data => data.results[0]['COUNT(*)'])
      .catch(e => {
        console.error(e.stack || e)
        res.status(404).send({ error: 'not_found' })
        return -1
      })
  if (maxEntries === -1) return
  if (maxEntries === 0) {
    return res.status(404).send({ error: 'not_found' })
  }
  const maxPage = Math.floor(maxEntries / MESSAGES_PER_PAGE)
  query(`SELECT * FROM \`${String(req.params.table)}\` WHERE channel_id = ? ORDER BY created_timestamp ASC LIMIT ?, ?`, String(req.params.channel_id), page * MESSAGES_PER_PAGE, MESSAGES_PER_PAGE).then(async data => {
    const messages = data.results as Array<Message>
    if (messages.length === 0) {
      return res.status(404).send({ error: 'not_found' })
    }
    const channelId = messages[0].channel_id
    const messagesToFetchAttachments = new Array<string>()
    const cachedMessageAttachments = await loadMessageJson(channelId)
    for (const msg of messages) {
      msg.attachments = []
      const attachmentIds = cachedMessageAttachments[msg.message_id]
      if (attachmentIds === null || typeof attachmentIds === 'undefined') {
        messagesToFetchAttachments.push(msg.message_id)
        continue
      }
      if (attachmentIds.length === 0) {
        continue
      }
      for (const attachmentId of attachmentIds) {
        const attachment = await getAttachmentMetadata(attachmentId)
        if (attachment) {
          msg.attachments.push(attachment)
        }
      }
    }
    if (messagesToFetchAttachments.length > 0) {
      const attachments = await queryAttachmentsByMessageIds(messagesToFetchAttachments)
      // ^ does not include attachment data, only metadata is present
      for (const e of messages) {
        if (attachments.length === 0) {
          await putMessageId(channelId, e.message_id, [])
        } else {
          e.attachments = attachments.filter((attachment) => attachment.message_id === e.message_id)
          for (const attachment of e.attachments) {
            const cached = await getAttachmentMetadata(attachment.attachment_id)
            if (cached == null) {
              await putAttachmentMetadata(attachment.attachment_id, attachment)
            }
          }
          await putMessageId(channelId, e.message_id, e.attachments.map((attachment) => attachment.attachment_id))
        }
      }
    }
    messages.forEach((e) => e.content = processMessage(e.content, messages))
    messages.forEach((e) => e.content += processAttachments(e.attachments!))
    messages.forEach((e) => e.content = e.content.replace(/^\n?(.*)\n?$/, "$1"))
    res.render('index', { data: messages, page, maxPage });
  }).catch(e => {
    console.error(e.stack || e)
    res.status(404).send({ error: 'not_found' })
  })
})

router.get('/attachments/:attachment_id/:filename?', async (req: Request, res: Response) => {
  const doDecompress = String(req.query['decompress']) === 'true'
  const attachmentId = String(req.params.attachment_id)
  try {
    const paramFilename = filterIllegalCharsForFile(String(req.params.filename))
    let attachment = await getAttachmentMetadata(attachmentId)
    if (!attachment) {
      attachment = await queryAttachment(attachmentId, true)
      if (attachment) {
        await putAttachmentMetadata(attachmentId, attachment)
      }
    }
    if (!attachment) {
      return res.status(404).send({ error: 'not_found' })
    }
    if (!(filterIllegalCharsForFile(attachment.filename) === paramFilename || (typeof req.params.filename === 'undefined' && filterIllegalCharsForFile(attachment.filename).length === 0))) {
      // attachment does not exist or filename does not match
      return res.status(404).send({ error: 'not_found' })
    }

    const writeBody = async (body: Buffer, actuallyDecompressData: boolean = true) => {
      // decompress data if necessary
      let newBody = body
      let newFilename = attachment!.filename
      if (doDecompress) {
        if (newFilename.endsWith('.bz2')) {
          if (actuallyDecompressData) {
            newBody = await unBzip2(newBody)
          }
          newFilename = newFilename.substring(0, newFilename.length - 4)
        }
        if (newFilename.endsWith('.gz')) {
          if (actuallyDecompressData) {
            newBody = await gunzip(newBody)
          }
          newFilename = newFilename.substring(0, newFilename.length - 3)
        }
        if (actuallyDecompressData) {
          putAttachmentData(attachment!.attachment_id + '.__decompressed__', newBody)
            .then(() => debug(`Cached decompressed attachment data for ${attachment!.attachment_id}`))
        }
      }

      // actually write the response
      res.writeHead(200, {
        'Content-Type': getContentTypeFromExtension(newFilename),
        'Content-disposition': `filename=${newFilename}`,
        'Content-Length': newBody.length,
      })
      res.end(newBody)
    }

    const decompressedCached = await getAttachmentData(attachmentId + '.__decompressed__')
    if (decompressedCached) {
      // cached decompressed data
      return writeBody(decompressedCached, false)
    }

    const cached = await getAttachmentData(attachment.attachment_id)
    if (cached) {
      // cached
      return writeBody(cached)
    }
    // not cached
    const data = await fetchAttachmentData(attachment.attachment_id)
    if (data) {
      // cached
      putAttachmentData(attachment.attachment_id, data).then(() => debug(`Cached attachment data for ${attachment!.attachment_id}`))
      await writeBody(data)
    } else {
      // attachment disappeared for some reason
      res.status(404).send({ error: 'not_found' })
    }
  } catch (e) {
    console.error(e.stack || e)
    res.status(500).send({ error: 'unknown' })
  }
})
