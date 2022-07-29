import fs from 'fs/promises'
import express from 'express'
import multer from 'multer'
import { UPLOAD_TEMP_DIRECTORY } from '../data'
import { query } from '../sql'
import { generateHexToken } from '../util'

const upload = multer({ dest: UPLOAD_TEMP_DIRECTORY })

export const router = express.Router()

const uploadSecret = process.env.UPLOAD_SECRET
const disableUpload = !uploadSecret || uploadSecret.length < 50
const uploadForceSecure = process.env.UPLOAD_FORCE_SECURE_URL === 'true'

router.post('/attachments/upload', upload.single('file'), async (req, res) => {
  if (disableUpload || uploadSecret !== req.headers.authorization) {
    // possible reasons:
    // - upload secret is not set or is set to < 50 characters
    // - invalid authorization header
    return res.status(401).send({ error: 'unauthorized' })
  }
  const host = req.headers['host']
  if (!host || host.length === 0) {
    return res.status(400).send({ error: 'Host header is required' })
  }
  if (!req.file) {
    return res.status(400).send({ error: 'invalid_request' })
  }
  try {
    const protocol = uploadForceSecure ? 'https' : req.protocol
    const attachmentId = `u${await generateHexToken(128)}`
    const buf = await fs.readFile(req.file.path)
    await query('INSERT INTO `attachments` (`attachment_id`, `url`, `data`) VALUES (?, ?, ?)', attachmentId, req.file.originalname, buf)
    res.send({
      message: 'ok',
      data: {
        attachment_id: attachmentId,
        filename: req.file.originalname,
        url: `${protocol}://${host}/attachments/${attachmentId}/${req.file.originalname}`,
      },
    })
  } catch (e) {
    console.error(e.stack || e)
    res.status(500).send({ error: 'unknown' })
  } finally {
    // we don't care about result
    fs.unlink(req.file.path).catch(() => {})
  }
})
