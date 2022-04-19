import { improveAttachments } from './util'

const debug = require('debug')('discord-message-viewer:sql')
import { createPool } from 'mysql'
const pool = createPool({
  connectionLimit: 10,
  host: process.env.DB_HOST,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
  charset: 'utf8mb4',
})

export const query = (sql: string, ...values: any): Promise<QueryResult> => {
  return new Promise((resolve, reject) => {
    debug(sql, values)
    pool.query(sql, values, (error: any, results: any, fields: any) => {
      if (error) {
        return reject(error)
      }
      resolve({ results, fields })
    })
  })
}

export const queryAttachmentsByMessageIds = async (messageIds: Array<string>): Promise<Array<AttachmentWithFilename>> => {
  const where = messageIds.map(() => '`message_id` = ?').join(' OR ')
  const data: Array<any> = await query('SELECT `message_id`, `attachment_id`, `url`, `proxy_url` FROM `attachments` WHERE ' + where, ...messageIds).then(data => data.results)
  if (data.length === 0) {
    return []
  }
  return improveAttachments(...data.map((e) => e as AttachmentWithFilename))
}

export const queryAttachment = async (attachmentId: string, metadataOnly: boolean): Promise<AttachmentWithFilename | null> => {
  let rawData: Array<any>
  if (metadataOnly) {
    rawData = await query('SELECT `message_id`, `attachment_id`, `url`, `proxy_url` FROM `attachments` WHERE `attachment_id` = ? LIMIT 1', attachmentId).then(data => data.results)
  } else {
    rawData = await query('SELECT `message_id`, `attachment_id`, `url`, `proxy_url`, `data` FROM `attachments` WHERE `attachment_id` = ? LIMIT 1', attachmentId).then(data => data.results)
  }
  if (rawData.length === 0) {
    return null
  }
  return improveAttachments(rawData[0] as Attachment)[0]
}

export const fetchAttachmentData = (attachmentId: string): Promise<Buffer | null> =>
  query('SELECT `data` FROM `attachments` WHERE `attachment_id` = ? LIMIT 1', attachmentId).then(data => {
    if (data.results.length === 0) {
      return null
    }
    return data.results[0].data as Buffer
  })
