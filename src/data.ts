import { promises as fs, constants as fsConstants } from 'fs'
import { improveAttachments } from './util'

export const INVALID_FILENAME_REGEX = /[^a-z\d_\-.]/ig
export const DATA_DIRECTORY = `.data`
export const MESSAGE_ATTACHMENT_JSON = `${DATA_DIRECTORY}/message_attachments.json`
export const ATTACHMENTS_DIRECTORY = `${DATA_DIRECTORY}/attachments`
export const ATTACHMENTS_METADATA_DIRECTORY = `${DATA_DIRECTORY}/attachments_metadata`

export const filterIllegalCharsForFile = (name: string) => name.replace(INVALID_FILENAME_REGEX, '_')

export const ensureDirectoryExists = async () => {
  await fs.mkdir(ATTACHMENTS_DIRECTORY, { recursive: true })
  await fs.mkdir(ATTACHMENTS_METADATA_DIRECTORY, { recursive: true })
}

export const isExists = (file: string) =>
  fs.access(file, fsConstants.F_OK)
    .then(() => true)
    .catch(() => false)

export const getAttachmentData = async (name: string): Promise<Buffer | null> => {
  await ensureDirectoryExists()
  const id = filterIllegalCharsForFile(String(name))
  if (!(await isExists(`${ATTACHMENTS_DIRECTORY}/${id}`))) {
    return null
  }
  return await fs.readFile(`${ATTACHMENTS_DIRECTORY}/${id}`)
}

export const putAttachmentData = async (name: string, data: Buffer): Promise<void> => {
  await ensureDirectoryExists()
  const id = filterIllegalCharsForFile(String(name))
  await fs.writeFile(`${ATTACHMENTS_DIRECTORY}/${id}`, data)
}

export const getAttachmentMetadata = async (name: string): Promise<AttachmentWithFilename | null> => {
  await ensureDirectoryExists()
  const id = filterIllegalCharsForFile(String(name))
  if (!(await isExists(`${ATTACHMENTS_METADATA_DIRECTORY}/${id}.json`))) {
    return null
  }
  const content = await fs.readFile(`${ATTACHMENTS_METADATA_DIRECTORY}/${id}.json`).then(buf => buf.toString('utf-8'))
  try {
    return improveAttachments(JSON.parse(content) as Attachment)[0]
  } catch (e) {
    throw new Error(`cannot parse the json of ${ATTACHMENTS_METADATA_DIRECTORY}/${id}.json`)
  }
}

export const putAttachmentMetadata = async (name: string, attachment: AttachmentWithFilename): Promise<void> => {
  await ensureDirectoryExists()
  const id = filterIllegalCharsForFile(String(name))
  await fs.writeFile(
    `${ATTACHMENTS_METADATA_DIRECTORY}/${id}.json`,
    JSON.stringify({
      message_id: attachment.message_id,
      attachment_id: attachment.attachment_id,
      url: attachment.url,
      proxy_url: attachment.proxy_url,
    }),
  )
}

export const loadAttachmentMessageJson = async (): Promise<{ [messageId: string]: Array<string> }> => {
  let json: { [messageId: string]: Array<string> } = {}
  if (await isExists(MESSAGE_ATTACHMENT_JSON)) {
    json = JSON.parse(await fs.readFile(MESSAGE_ATTACHMENT_JSON).then(buf => buf.toString('utf-8')))
  }
  return json
}

export const putAttachmentIdByMessageId = async (messageId: string, attachmentIds: Array<string>): Promise<void> => {
  const data = await loadAttachmentMessageJson()
  data[messageId] = attachmentIds
  await fs.writeFile(MESSAGE_ATTACHMENT_JSON, JSON.stringify(data))
}
