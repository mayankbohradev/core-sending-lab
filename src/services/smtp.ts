import nodemailer from 'nodemailer'

import type { AppConfig } from '../config.js'
import type { StoredMessage } from '../domain/types.js'

export type SmtpSendResult = {
  smtpMessageId?: string
  response?: string
  accepted: string[]
  rejected: string[]
}

export class SmtpDeliveryClient {
  private readonly transporter: nodemailer.Transporter

  constructor(config: AppConfig) {
    this.transporter = nodemailer.createTransport({
      host: config.smtpHost,
      port: config.smtpPort,
      secure: false,
      ignoreTLS: true,
    })
  }

  async send(message: StoredMessage): Promise<SmtpSendResult> {
    const result = await this.transporter.sendMail({
      from: message.fromEmail,
      to: message.toEmail,
      subject: message.subject,
      text: message.textBody ?? undefined,
      html: message.htmlBody ?? undefined,
    })

    return {
      smtpMessageId: result.messageId,
      response: result.response,
      accepted: asStringArray(result.accepted),
      rejected: asStringArray(result.rejected),
    }
  }
}

function asStringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.map(String) : []
}

