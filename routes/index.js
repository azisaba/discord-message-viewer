const express = require('express')
const { query } = require('../src/sql')
const { processMessage, processAttachments, getContentTypeFromExtension } = require('../src/util')
const router = express.Router()
const MESSAGES_PER_PAGE = 250
const MAX_ATTACHMENTS_CACHE_SIZE = process.env.MAX_ATTACHMENTS_CACHE_SIZE || 10
const attachmentsCache = []
let attachmentsCacheIndex = 0

const pushAttachmentToCache = (attachment) => {
  if (MAX_ATTACHMENTS_CACHE_SIZE === 0) return
  attachmentsCache[attachmentsCacheIndex++ % MAX_ATTACHMENTS_CACHE_SIZE] = attachment
}

const findAttachmentFromCache = (id) => {
  if (attachmentsCache.length === 0) return null
  return attachmentsCache.find((e) => e.attachment_id === id)
}

const getChannels = async data => {
  const promises = []
  const tables = []
  for (let table of data.results.map((e) => e.table_name)) {
    const promise = query('SELECT DISTINCT `channel_name`, `channel_id` FROM `' + table + '`').catch(() => ({results:[]})).then(data => {
      const channels = {}
      data.results.forEach((e) => {
        channels[e.channel_id] = e.channel_name
      })
      tables.push({ name: table, channels: Object.keys(channels).map((id) => ({ id, name: channels[id] })) })
    })
    promises.push(promise)
  }
  await Promise.all(promises)
  return tables
}

router.get('/messages/list', async (req, res) => {
  query('SELECT table_name FROM information_schema.tables WHERE table_schema = ?', String(process.env.DB_NAME)).then(async data => {
    const tables = await getChannels(data)
    res.render('list', { tables });
  }).catch(e => {
    console.error(e.stack || e)
    res.status(500).send({ error: 'something_went_wrong' })
  })
})

router.get('/messages/:table/:channel_id', async (req, res) => {
  if (!/^[a-zA-Z0-9_\-]+$/.test(String(req.params.table))) {
    return res.status(400).send({ error: "invalid table name" })
  }
  if (!/^[0-9]+$/.test(String(req.params.channel_id))) {
    return res.status(400).send({ error: "invalid channel id" })
  }
  let page = parseInt((req.query || {})['page'] || 0)
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
    if (data.results.length === 0) {
      return res.status(404).send({ error: 'not_found' })
    }
    const messageIds = data.results.map((e) => e.message_id).filter((e, i, a) => a.indexOf(e) === i)
    if (messageIds.length > 0) {
      const where = messageIds.map(() => '`message_id` = ?').join(' OR ')
      const imageAttachments = (await query(`SELECT * FROM \`attachments\` WHERE (${where}) AND LOWER(\`url\`) LIKE "%.png"`, ...messageIds)).results
      const fileAttachments = (await query(`SELECT \`message_id\`, \`attachment_id\`, \`url\` FROM \`attachments\` WHERE (${where}) AND LOWER(\`url\`) NOT LIKE "%.png"`, ...messageIds)).results
      data.results.forEach((e) => e.attachments = [...imageAttachments, ...fileAttachments].filter((attachment) => attachment.message_id === e.message_id))
    }
    data.results.forEach((e) => e.content = processMessage(e.content, data.results))
    data.results.forEach((e) => e.content += processAttachments(e.attachments))
    data.results.forEach((e) => e.content = e.content.replace(/^\n?(.*)\n?$/, "$1"))
    res.render('index', { data: data.results, page, maxPage });
  }).catch(e => {
    console.error(e.stack || e)
    res.status(404).send({ error: 'not_found' })
  })
})

router.get('/attachments/:attachment_id', async (req, res) => {
  if (!/^[0-9]+$/.test(String(req.params.attachment_id))) {
    return res.status(400).send({ error: "invalid attachment id" })
  }
  const cached = findAttachmentFromCache(String(req.params.attachment_id))
  if (cached) {
    const split = cached.url.split('/')
    const fileName = split[split.length - 1]
    res.writeHead(200, {
      'Content-Type': getContentTypeFromExtension(cached.url),
      'Content-disposition': `filename=${fileName}`,
      'Content-Length': cached.data.length,
    })
    res.end(cached.data)
    return
  }
  query(`SELECT * FROM attachments WHERE attachment_id = ? LIMIT 1`, String(req.params.attachment_id)).then(async data => {
    const attachment = data.results[0]
    pushAttachmentToCache(attachment)
    const split = attachment.url.split('/')
    const fileName = split[split.length - 1]
    res.writeHead(200, {
      'Content-Type': getContentTypeFromExtension(attachment.url),
      'Content-disposition': `filename=${fileName}`,
      'Content-Length': attachment.data.length,
    })
    res.end(attachment.data)
  }).catch(e => {
    console.error(e.stack || e)
    res.status(404).send({ error: 'not_found' })
  })
})

module.exports = router
