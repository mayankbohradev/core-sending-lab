import type { Pool } from 'pg'

import { ConflictError } from '../domain/errors.js'
import { createId } from '../domain/ids.js'
import type { DeliveryEvent, MessageSubmission, MessageSubmissionResult, StoredMessage } from '../domain/types.js'
import {
  appendDeliveryEvent,
  type DeliveryEventRow,
  type DeliveryJobRow,
  type IdempotencyRow,
  mapEvent,
  mapJob,
  mapMessage,
  type MessageRow,
  parseCachedSubmission,
} from './mappers.js'

export class MessagesRepository {
  constructor(private readonly pool: Pool) {}

  async createSubmission(input: MessageSubmission): Promise<MessageSubmissionResult> {
    const client = await this.pool.connect()

    try {
      await client.query('BEGIN')

      if (input.idempotencyKey !== undefined) {
        const existing = await client.query<IdempotencyRow>(
          `
            SELECT request_hash, response_body
            FROM idempotency_keys
            WHERE tenant_id = $1 AND key = $2
            FOR UPDATE
          `,
          [input.tenantId, input.idempotencyKey]
        )

        if (existing.rowCount === 1) {
          const cached = existing.rows[0]

          if (cached.request_hash !== input.requestHash) {
            throw new ConflictError('Idempotency key was already used for a different message')
          }

          await client.query('COMMIT')
          const response = parseCachedSubmission(cached.response_body)
          return {
            reused: true,
            message: response.message,
            job: response.job,
          }
        }
      }

      const messageId = createId('msg')
      const jobId = createId('job')

      const messageResult = await client.query<MessageRow>(
        `
          INSERT INTO messages (id, tenant_id, from_email, to_email, subject, text_body, html_body, status)
          VALUES ($1, $2, $3, $4, $5, $6, $7, 'queued')
          RETURNING *
        `,
        [
          messageId,
          input.tenantId,
          input.fromEmail,
          input.toEmail,
          input.subject,
          input.textBody ?? null,
          input.htmlBody ?? null,
        ]
      )

      const jobResult = await client.query<DeliveryJobRow>(
        `
          INSERT INTO delivery_jobs (id, message_id, tenant_id, status, max_attempts)
          VALUES ($1, $2, $3, 'queued', $4)
          RETURNING *
        `,
        [jobId, messageId, input.tenantId, input.maxAttempts]
      )

      await appendDeliveryEvent(client, {
        messageId,
        type: 'message.accepted',
        detail: {
          tenantId: input.tenantId,
          idempotent: input.idempotencyKey !== undefined,
        },
      })

      await appendDeliveryEvent(client, {
        messageId,
        jobId,
        type: 'job.queued',
        detail: {
          maxAttempts: input.maxAttempts,
        },
      })

      const message = mapMessage(messageResult.rows[0])
      const job = mapJob(jobResult.rows[0])
      const responseBody = { message, job }

      if (input.idempotencyKey !== undefined) {
        await client.query(
          `
            INSERT INTO idempotency_keys (tenant_id, key, request_hash, message_id, response_body)
            VALUES ($1, $2, $3, $4, $5::jsonb)
          `,
          [input.tenantId, input.idempotencyKey, input.requestHash, messageId, JSON.stringify(responseBody)]
        )
      }

      await client.query('COMMIT')

      return {
        reused: false,
        ...responseBody,
      }
    } catch (error) {
      await client.query('ROLLBACK')
      throw error
    } finally {
      client.release()
    }
  }

  async listMessages(tenantId: string, limit: number): Promise<StoredMessage[]> {
    const result = await this.pool.query<MessageRow>(
      `
        SELECT *
        FROM messages
        WHERE tenant_id = $1
        ORDER BY created_at DESC
        LIMIT $2
      `,
      [tenantId, limit]
    )

    return result.rows.map(mapMessage)
  }

  async listRecentMessages(limit: number): Promise<StoredMessage[]> {
    const result = await this.pool.query<MessageRow>(
      `
        SELECT *
        FROM messages
        ORDER BY created_at DESC
        LIMIT $1
      `,
      [limit]
    )

    return result.rows.map(mapMessage)
  }

  async getMessage(tenantId: string, messageId: string): Promise<StoredMessage | null> {
    const result = await this.pool.query<MessageRow>(
      `
        SELECT *
        FROM messages
        WHERE tenant_id = $1 AND id = $2
      `,
      [tenantId, messageId]
    )

    return result.rowCount === 0 ? null : mapMessage(result.rows[0])
  }

  async getMessageById(messageId: string): Promise<StoredMessage | null> {
    const result = await this.pool.query<MessageRow>(
      `
        SELECT *
        FROM messages
        WHERE id = $1
      `,
      [messageId]
    )

    return result.rowCount === 0 ? null : mapMessage(result.rows[0])
  }

  async listEvents(tenantId: string, messageId: string): Promise<DeliveryEvent[]> {
    const result = await this.pool.query<DeliveryEventRow>(
      `
        SELECT delivery_events.*
        FROM delivery_events
        INNER JOIN messages ON messages.id = delivery_events.message_id
        WHERE messages.tenant_id = $1 AND delivery_events.message_id = $2
        ORDER BY delivery_events.created_at ASC
      `,
      [tenantId, messageId]
    )

    return result.rows.map(mapEvent)
  }

  async listEventsByMessageId(messageId: string): Promise<DeliveryEvent[]> {
    const result = await this.pool.query<DeliveryEventRow>(
      `
        SELECT *
        FROM delivery_events
        WHERE message_id = $1
        ORDER BY created_at ASC
      `,
      [messageId]
    )

    return result.rows.map(mapEvent)
  }
}
