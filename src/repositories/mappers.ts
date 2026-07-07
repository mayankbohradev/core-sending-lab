import type { QueryResultRow } from 'pg'

import type { Queryable } from '../db/pool.js'
import { createId } from '../domain/ids.js'
import type { DeliveryEvent, DeliveryJob, JobStatus, MessageStatus, StoredMessage } from '../domain/types.js'

type TimestampValue = Date | string | null

export type MessageRow = QueryResultRow & {
  id: string
  tenant_id: string
  from_email: string
  to_email: string
  subject: string
  text_body: string | null
  html_body: string | null
  status: MessageStatus
  created_at: TimestampValue
  updated_at: TimestampValue
  delivered_at: TimestampValue
}

export type DeliveryJobRow = QueryResultRow & {
  id: string
  message_id: string
  tenant_id: string
  status: JobStatus
  attempts: number
  max_attempts: number
  next_attempt_at: TimestampValue
  leased_until: TimestampValue
  locked_by: string | null
  last_error: string | null
  created_at: TimestampValue
  updated_at: TimestampValue
}

export type DeliveryEventRow = QueryResultRow & {
  id: string
  message_id: string
  job_id: string | null
  type: string
  detail: Record<string, unknown> | string
  created_at: TimestampValue
}

export type IdempotencyRow = QueryResultRow & {
  request_hash: string
  response_body: Record<string, unknown> | string
}

export function toIso(value: TimestampValue): string {
  if (value instanceof Date) {
    return value.toISOString()
  }

  if (typeof value === 'string') {
    return new Date(value).toISOString()
  }

  throw new Error('Expected non-null timestamp value')
}

function toNullableIso(value: TimestampValue): string | null {
  return value === null ? null : toIso(value)
}

function toJsonObject(value: Record<string, unknown> | string): Record<string, unknown> {
  if (typeof value === 'string') {
    return JSON.parse(value) as Record<string, unknown>
  }

  return value
}

export function mapMessage(row: MessageRow): StoredMessage {
  return {
    id: row.id,
    tenantId: row.tenant_id,
    fromEmail: row.from_email,
    toEmail: row.to_email,
    subject: row.subject,
    textBody: row.text_body,
    htmlBody: row.html_body,
    status: row.status,
    createdAt: toIso(row.created_at),
    updatedAt: toIso(row.updated_at),
    deliveredAt: toNullableIso(row.delivered_at),
  }
}

export function mapJob(row: DeliveryJobRow): DeliveryJob {
  return {
    id: row.id,
    messageId: row.message_id,
    tenantId: row.tenant_id,
    status: row.status,
    attempts: row.attempts,
    maxAttempts: row.max_attempts,
    nextAttemptAt: toIso(row.next_attempt_at),
    leasedUntil: toNullableIso(row.leased_until),
    lockedBy: row.locked_by,
    lastError: row.last_error,
    createdAt: toIso(row.created_at),
    updatedAt: toIso(row.updated_at),
  }
}

export function mapEvent(row: DeliveryEventRow): DeliveryEvent {
  return {
    id: row.id,
    messageId: row.message_id,
    jobId: row.job_id,
    type: row.type,
    detail: toJsonObject(row.detail),
    createdAt: toIso(row.created_at),
  }
}

export async function appendDeliveryEvent(
  db: Queryable,
  input: {
    messageId: string
    jobId?: string | null
    type: string
    detail?: Record<string, unknown>
  }
): Promise<DeliveryEvent> {
  const result = await db.query<DeliveryEventRow>(
    `
      INSERT INTO delivery_events (id, message_id, job_id, type, detail)
      VALUES ($1, $2, $3, $4, $5::jsonb)
      RETURNING *
    `,
    [createId('evt'), input.messageId, input.jobId ?? null, input.type, JSON.stringify(input.detail ?? {})]
  )

  return mapEvent(result.rows[0])
}

export function parseCachedSubmission(value: Record<string, unknown> | string): {
  message: StoredMessage
  job: DeliveryJob
} {
  return toJsonObject(value) as {
    message: StoredMessage
    job: DeliveryJob
  }
}

