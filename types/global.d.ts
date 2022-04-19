import { Request as ERequest, Response as EResponse, NextFunction as ENextFunction } from 'express'

declare global {
  type Request = ERequest
  type Response = EResponse
  type NextFunction = ENextFunction

  type QueryResult = {
    results: any
    fields: any
  }

  type Attachment = {
    message_id: string
    attachment_id: string
    url: string
    proxy_url: string
    filename?: string
    data?: Buffer
  }

  type AttachmentWithFilename = Attachment & {
    filename: string
  }

  type Message = {
    guild_id: string
    guild_name: string
    channel_id: string
    channel_name: string
    author_is_bot: '0' | '1'
    author_id: string
    author_name: string
    author_discriminator: string
    message_id: string
    content: string
    edited: 0 | 1
    edited_timestamp: number
    created_timestamp: number
    is_reply: 0 | 1
    reply_to: string | null
    attachments?: Array<Attachment>
  }
}
