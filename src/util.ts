import { filterIllegalCharsForFile } from './data'

import { randomBytes } from 'crypto'

export const MD_URL_REGEX = /\[(.*?)]\((.*?)\)/g
export const MD_BOLD_REGEX = /\*\*(.*?)\*\*/g
export const MD_ITALIC_REGEX = /(\*(.*?)\*)|(_(.*?)_)/g
export const MD_UNDERLINE_REGEX = /__(.*?)__/g
export const MD_STRIKETHROUGH_REGEX = /~~([^]*?)~~/g
export const URL_REGEX = /(https?:\/\/.+?(?=\s|$))/g
export const USER_MENTION_REGEX = /(&lt;@!?(\d+)&gt;)/
export const MD_CODE1_REGEX = /`(.+?)`/
export const MD_CODE2_REGEX = /``(.+?)``/
export const MD_CODE3_REGEX = /```([^]+?)```/
export const MD_CODE4_REGEX = /```(.*?)[\n ]([^]+?)```/

export const getContentTypeFromExtension = (o: any) => {
  const s = String(o).toLowerCase()
  if (s.endsWith('.png')) return 'image/png'
  if (s.endsWith('.jpeg')) return 'image/jpeg'
  if (s.endsWith('.jpg')) return 'image/jpg'
  if (s.endsWith('.gif')) return 'image/gif'
  if (s.endsWith('.mpeg') || s.endsWith('.mp3')) return 'audio/mpeg'
  if (s.endsWith('.mp4')) return 'video/mp4'
  if (s.endsWith('.midi') || s.endsWith('.mid')) return 'audio/midi'
  if (s.endsWith('.pdf')) return 'application/pdf'
  if (s.endsWith('.txt')) return 'text/plain; charset=utf-8'
  if (s.endsWith('.wav')) return 'audio/wav'
  if (s.endsWith('.weba')) return 'audio/webm'
  if (s.endsWith('.webm')) return 'video/webm'
  if (s.endsWith('.webp')) return 'image/webp'
  if (s.endsWith('.csv')) return 'text/csv'
  if (s.endsWith('.css')) return 'text/css'
  return 'application/octet-stream'
}

export const escapeHtml = (unsafe: string): string => unsafe
  .replaceAll('&', '&amp;')
  .replaceAll('<', '&lt;')
  .replaceAll('>', '&gt;')
  .replaceAll('"', '&quot;')
  .replaceAll("'", '&#039;')

export const escapeHtml2 = (unsafe: string) => escapeHtml(unsafe)
  .replaceAll('`', '&#96;')

export const postProcessMessage = (message: string) => {
  if (MD_CODE4_REGEX.test(message)) {
    message = message.replace(MD_CODE4_REGEX, '<div class="code">$2</div>')
  }
  if (MD_CODE3_REGEX.test(message)) {
    message = message.replace(MD_CODE3_REGEX, '<div class="code">$1</div>')
  }
  if (MD_CODE2_REGEX.test(message)) {
    message = message.replace(MD_CODE2_REGEX, '<span class="code">$1</span>')
  }
  if (MD_CODE1_REGEX.test(message)) {
    message = message.replace(MD_CODE1_REGEX, '<span class="code">$1</span>')
  }
  message.match(URL_REGEX)?.forEach((url: string) => {
    message = message.replace(url, `<a href="${encodeURI(url)}">${escapeHtml(url)}</a>`)
    if (getContentTypeFromExtension(url).startsWith('image/')) {
      message += `\n<a href="${encodeURI(url)}"><img src="${encodeURI(url)}" alt="Image"/></a>`
    }
  })
  return message
}

export const processAttachments = (attachments: Array<Attachment>) => {
  const html = new Array<string>()
  attachments.forEach((attachment) => {
    const split = attachment.url.split('/')
    const filename = filterIllegalCharsForFile(split[split.length - 1])
    const fileURL = `/attachments/${attachment.attachment_id}/${filename}`
    if (attachment.url.toLowerCase().endsWith('.png')) {
      if (attachment.data) {
        html.push(`<a href="${fileURL}"><img src="data:image/png;base64,${Buffer.from(attachment.data).toString('base64')}" alt="Image" /></a>`)
      } else {
        html.push(`<a href="${fileURL}"><img src="${fileURL}" alt="Image" /></a>`)
      }
    } else {
      html.push(`<a href="${fileURL}">[${filename}] をダウンロード</a>`)
    }
  })
  if (html.length === 0) return ''
  return '\n' + html.join('\n')
}

export const processMessage = (message: string, results: any[]) => {
  let result = ''
  let pending = ''
  for (let i = 0; i < message.length; i++) {
    const char = message.charAt(i)
    pending += escapeHtml(char)
    // skip if char is number and not last char
    if (/\d/.test(char) && i !== (message.length - 1)) continue
    // the order is *VERY* important!
    if (MD_URL_REGEX.test(pending)) {
      // noinspection HtmlUnknownTarget
      pending = pending.replace(MD_URL_REGEX, '<a href="$2">$1</a>')
      result += pending
      pending = ''
    }
    if (MD_BOLD_REGEX.test(pending)) {
      pending = pending.replace(MD_BOLD_REGEX, '<b>$1</b>')
      result += pending
      pending = ''
    }
    if (MD_ITALIC_REGEX.test(pending)) {
      const exec = MD_ITALIC_REGEX.exec(pending)
      if (exec) {
        let text = exec[2]
        if (typeof text === 'undefined') text = exec[4]
        pending = pending.replace(MD_ITALIC_REGEX, `<i>${text}</i>`)
        result += pending
        pending = ''
      }
    }
    if (MD_UNDERLINE_REGEX.test(pending)) {
      pending = pending.replace(MD_UNDERLINE_REGEX, '<u>$1</u>')
      result += pending
      pending = ''
    }
    if (MD_STRIKETHROUGH_REGEX.test(pending)) {
      pending = pending.replace(MD_STRIKETHROUGH_REGEX, '<s>$1</s>')
      result += pending
      pending = ''
    }
    if (USER_MENTION_REGEX.test(pending)) {
      const exec = USER_MENTION_REGEX.exec(pending)
      if (exec) {
        const userId = exec[2]
        const msg = results.find((e) => e.author_id === userId)
        if (msg) {
          result += `<span class="mention" title="${escapeHtml2(msg.author_name)}#${msg.author_discriminator} (ID: ${userId})">@${escapeHtml(msg.author_name)}</span>`
        } else {
          result += `<span class="mention" title="(ID: ${userId})">${pending}</span>`
        }
        pending = ''
      }
    }
  }
  result += pending
  return postProcessMessage(result)
}

export const improveAttachments = (...attachments: Array<Attachment>): Array<AttachmentWithFilename> => {
  const mapped = attachments.map((e) => e as AttachmentWithFilename)
  mapped.forEach(attachment => {
    if ((attachment.message_id !== '0' && !attachment.message_id) || !attachment.attachment_id) {
      throw new Error('invalid attachment: ' + JSON.stringify(attachment))
    }
    const split = attachment.url?.split('/')
    if (split && split.length > 0) {
      attachment.filename = split[split.length - 1]
    } else {
      attachment.filename = ''
    }
  })
  return mapped
}

export const generateHexToken = (maxLen: number) => new Promise((resolve, reject) => {
  randomBytes(maxLen / 2, (err, buffer) => {
    if (err !== null) {
      return reject(err)
    }
    resolve(buffer.toString('hex'))
  })
});
