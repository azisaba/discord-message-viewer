const express = require('express')
const { query } = require('../src/sql')
const { processMessage, processAttachments, getContentTypeFromExtension } = require('../src/util')
const router = express.Router()

router.get('/messages/:table/:channel_id', function(req, res) {
  if (!/^[a-zA-Z_0-9]+$/.test(String(req.params.table))) {
    return res.status(400).send({ error: "invalid table name" })
  }
  if (!/^[0-9]+$/.test(String(req.params.channel_id))) {
    return res.status(400).send({ error: "invalid channel id" })
  }
  query(`SELECT * FROM ${String(req.params.table)} WHERE channel_id = ?`, String(req.params.channel_id)).then(async data => {
    const results = data.results.sort((a, b) => a.created_timestamp - b.created_timestamp)
    const messageIds = results.map((e) => e.message_id).filter((e, i, a) => a.indexOf(e) === i)
    if (messageIds.length > 0) {
      const where = messageIds.map(() => '`message_id` = ?').join(' OR ')
      const imageAttachments = (await query(`SELECT * FROM \`attachments\` WHERE (${where}) AND LOWER(\`url\`) LIKE "%.png"`, ...messageIds)).results
      const fileAttachments = (await query(`SELECT \`message_id\`, \`attachment_id\`, \`url\` FROM \`attachments\` WHERE (${where}) AND LOWER(\`url\`) NOT LIKE "%.png"`, ...messageIds)).results
      results.forEach((e) => e.attachments = [...imageAttachments, ...fileAttachments].filter((attachment) => attachment.message_id === e.message_id))
    }
    results.forEach((e) => e.content = processMessage(e.content, results))
    results.forEach((e) => e.content += processAttachments(e.attachments))
    results.forEach((e) => e.content = e.content.replace(/^\n?(.*)\n?$/, "$1"))
    res.render('index', { data: results });
  }).catch(e => {
    console.error(e.stack || e)
    res.status(404).send({ error: 'not_found' })
  })
})

router.get('/attachments/:attachment_id', function(req, res) {
  if (!/^[0-9]+$/.test(String(req.params.attachment_id))) {
    return res.status(400).send({ error: "invalid attachment id" })
  }
  query(`SELECT * FROM attachments WHERE attachment_id = ? LIMIT 1`, String(req.params.attachment_id)).then(async data => {
    const attachment = data.results[0]
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
