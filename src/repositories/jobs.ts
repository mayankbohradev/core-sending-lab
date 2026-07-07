import type { Pool } from 'pg'

import { NotFoundError } from '../domain/errors.js'
import type { DeliveryJob, LeasedDelivery, StoredMessage } from '../domain/types.js'
import {
  appendDeliveryEvent,
  type DeliveryEventRow,
  type DeliveryJobRow,
  mapEvent,
  mapJob,
  mapMessage,
  type MessageRow,
  toIso,
} from './mappers.js'

export class JobsRepository {
  constructor(private readonly pool: Pool) {}

  async leaseNext(workerId: string, leaseSeconds: number): Promise<LeasedDelivery | null> {
    const client = await this.pool.connect()

    try {
      await client.query('BEGIN')

      const jobResult = await client.query<DeliveryJobRow>(
        `
          WITH next_job AS (
            SELECT id
            FROM delivery_jobs
            WHERE status IN ('queued', 'retrying')
              AND next_attempt_at <= now()
              AND (leased_until IS NULL OR leased_until < now())
            ORDER BY next_attempt_at ASC, created_at ASC
            LIMIT 1
            FOR UPDATE SKIP LOCKED
          )
          UPDATE delivery_jobs
          SET status = 'leased',
              locked_by = $1,
              leased_until = now() + ($2::int * interval '1 second'),
              updated_at = now()
          WHERE id = (SELECT id FROM next_job)
          RETURNING *
        `,
        [workerId, leaseSeconds]
      )

      if (jobResult.rowCount === 0) {
        await client.query('COMMIT')
        return null
      }

      const job = mapJob(jobResult.rows[0])

      await client.query(
        `
          UPDATE messages
          SET status = 'delivering',
              updated_at = now()
          WHERE id = $1 AND status <> 'delivered'
        `,
        [job.messageId]
      )

      await appendDeliveryEvent(client, {
        messageId: job.messageId,
        jobId: job.id,
        type: 'job.leased',
        detail: {
          workerId,
          leasedUntil: job.leasedUntil,
        },
      })

      const messageResult = await client.query<MessageRow>(
        `
          SELECT *
          FROM messages
          WHERE id = $1
        `,
        [job.messageId]
      )

      await client.query('COMMIT')

      return {
        job,
        message: mapMessage(messageResult.rows[0]),
      }
    } catch (error) {
      await client.query('ROLLBACK')
      throw error
    } finally {
      client.release()
    }
  }

  async recordSmtpAttempt(job: DeliveryJob, domain: string): Promise<DeliveryJob> {
    const client = await this.pool.connect()

    try {
      await client.query('BEGIN')

      const jobResult = await client.query<DeliveryJobRow>(
        `
          UPDATE delivery_jobs
          SET attempts = attempts + 1,
              updated_at = now()
          WHERE id = $1
          RETURNING *
        `,
        [job.id]
      )

      if (jobResult.rowCount === 0) {
        throw new NotFoundError(`Job ${job.id} was not found`)
      }

      const updatedJob = mapJob(jobResult.rows[0])

      await appendDeliveryEvent(client, {
        messageId: job.messageId,
        jobId: job.id,
        type: 'smtp.attempted',
        detail: {
          domain,
          attempt: updatedJob.attempts,
        },
      })

      await client.query('COMMIT')
      return updatedJob
    } catch (error) {
      await client.query('ROLLBACK')
      throw error
    } finally {
      client.release()
    }
  }

  async scheduleDomainThrottle(job: DeliveryJob, domain: string, delayMs: number): Promise<DeliveryJob> {
    const client = await this.pool.connect()

    try {
      await client.query('BEGIN')

      const jobResult = await client.query<DeliveryJobRow>(
        `
          UPDATE delivery_jobs
          SET status = 'retrying',
              locked_by = NULL,
              leased_until = NULL,
              next_attempt_at = now() + ($2::int * interval '1 millisecond'),
              updated_at = now()
          WHERE id = $1
          RETURNING *
        `,
        [job.id, delayMs]
      )

      const updatedJob = mapJob(jobResult.rows[0])

      await appendDeliveryEvent(client, {
        messageId: job.messageId,
        jobId: job.id,
        type: 'domain.throttled',
        detail: {
          domain,
          delayMs,
        },
      })

      await client.query('COMMIT')
      return updatedJob
    } catch (error) {
      await client.query('ROLLBACK')
      throw error
    } finally {
      client.release()
    }
  }

  async markDelivered(
    job: DeliveryJob,
    detail: {
      smtpMessageId?: string
      response?: string
      accepted?: string[]
      rejected?: string[]
    }
  ): Promise<{ message: StoredMessage; job: DeliveryJob }> {
    const client = await this.pool.connect()

    try {
      await client.query('BEGIN')

      const messageResult = await client.query<MessageRow>(
        `
          UPDATE messages
          SET status = 'delivered',
              delivered_at = now(),
              updated_at = now()
          WHERE id = $1
          RETURNING *
        `,
        [job.messageId]
      )

      const jobResult = await client.query<DeliveryJobRow>(
        `
          UPDATE delivery_jobs
          SET status = 'delivered',
              locked_by = NULL,
              leased_until = NULL,
              last_error = NULL,
              updated_at = now()
          WHERE id = $1
          RETURNING *
        `,
        [job.id]
      )

      await appendDeliveryEvent(client, {
        messageId: job.messageId,
        jobId: job.id,
        type: 'smtp.delivered',
        detail,
      })

      await client.query('COMMIT')

      return {
        message: mapMessage(messageResult.rows[0]),
        job: mapJob(jobResult.rows[0]),
      }
    } catch (error) {
      await client.query('ROLLBACK')
      throw error
    } finally {
      client.release()
    }
  }

  async scheduleRetry(
    job: DeliveryJob,
    detail: {
      reason: string
      classification: string
      delayMs: number
      smtpStatus?: number
    }
  ): Promise<DeliveryJob> {
    const client = await this.pool.connect()

    try {
      await client.query('BEGIN')

      const jobResult = await client.query<DeliveryJobRow>(
        `
          UPDATE delivery_jobs
          SET status = 'retrying',
              locked_by = NULL,
              leased_until = NULL,
              last_error = $2,
              next_attempt_at = now() + ($3::int * interval '1 millisecond'),
              updated_at = now()
          WHERE id = $1
          RETURNING *
        `,
        [job.id, detail.reason, detail.delayMs]
      )

      const updatedJob = mapJob(jobResult.rows[0])

      await appendDeliveryEvent(client, {
        messageId: job.messageId,
        jobId: job.id,
        type: 'smtp.deferred',
        detail,
      })

      await appendDeliveryEvent(client, {
        messageId: job.messageId,
        jobId: job.id,
        type: 'job.retry_scheduled',
        detail: {
          nextAttemptAt: updatedJob.nextAttemptAt,
          attempts: updatedJob.attempts,
          maxAttempts: updatedJob.maxAttempts,
        },
      })

      await client.query('COMMIT')
      return updatedJob
    } catch (error) {
      await client.query('ROLLBACK')
      throw error
    } finally {
      client.release()
    }
  }

  async deadLetter(
    job: DeliveryJob,
    detail: {
      reason: string
      classification: string
      smtpStatus?: number
    }
  ): Promise<DeliveryJob> {
    const client = await this.pool.connect()

    try {
      await client.query('BEGIN')

      await client.query(
        `
          UPDATE messages
          SET status = 'failed',
              updated_at = now()
          WHERE id = $1
        `,
        [job.messageId]
      )

      const jobResult = await client.query<DeliveryJobRow>(
        `
          UPDATE delivery_jobs
          SET status = 'dead_lettered',
              locked_by = NULL,
              leased_until = NULL,
              last_error = $2,
              updated_at = now()
          WHERE id = $1
          RETURNING *
        `,
        [job.id, detail.reason]
      )

      const updatedJob = mapJob(jobResult.rows[0])

      await appendDeliveryEvent(client, {
        messageId: job.messageId,
        jobId: job.id,
        type: 'job.dead_lettered',
        detail: {
          ...detail,
          attempts: updatedJob.attempts,
          maxAttempts: updatedJob.maxAttempts,
        },
      })

      await client.query('COMMIT')
      return updatedJob
    } catch (error) {
      await client.query('ROLLBACK')
      throw error
    } finally {
      client.release()
    }
  }

  async retryDeadLetter(tenantId: string, jobId: string): Promise<DeliveryJob | null> {
    const client = await this.pool.connect()

    try {
      await client.query('BEGIN')

      const jobResult = await client.query<DeliveryJobRow>(
        `
          UPDATE delivery_jobs
          SET status = 'retrying',
              attempts = 0,
              next_attempt_at = now(),
              locked_by = NULL,
              leased_until = NULL,
              last_error = NULL,
              updated_at = now()
          WHERE id = $1
            AND tenant_id = $2
            AND status = 'dead_lettered'
          RETURNING *
        `,
        [jobId, tenantId]
      )

      if (jobResult.rowCount === 0) {
        await client.query('COMMIT')
        return null
      }

      const job = mapJob(jobResult.rows[0])

      await client.query(
        `
          UPDATE messages
          SET status = 'queued',
              updated_at = now()
          WHERE id = $1
        `,
        [job.messageId]
      )

      await appendDeliveryEvent(client, {
        messageId: job.messageId,
        jobId: job.id,
        type: 'job.retry_requested',
        detail: {
          resetAttempts: true,
        },
      })

      await client.query('COMMIT')
      return job
    } catch (error) {
      await client.query('ROLLBACK')
      throw error
    } finally {
      client.release()
    }
  }

  async listJobs(tenantId: string, status: string | undefined, limit: number): Promise<DeliveryJob[]> {
    const result = await this.pool.query<DeliveryJobRow>(
      `
        SELECT *
        FROM delivery_jobs
        WHERE tenant_id = $1
          AND ($2::text IS NULL OR status = $2)
        ORDER BY created_at DESC
        LIMIT $3
      `,
      [tenantId, status ?? null, limit]
    )

    return result.rows.map(mapJob)
  }

  async listRecentJobs(limit: number): Promise<DeliveryJob[]> {
    const result = await this.pool.query<DeliveryJobRow>(
      `
        SELECT *
        FROM delivery_jobs
        ORDER BY created_at DESC
        LIMIT $1
      `,
      [limit]
    )

    return result.rows.map(mapJob)
  }

  async listDeadLetters(tenantId: string, limit: number): Promise<DeliveryJob[]> {
    return this.listJobs(tenantId, 'dead_lettered', limit)
  }

  async getLastAttemptAtForDomain(domain: string): Promise<string | null> {
    const result = await this.pool.query<DeliveryEventRow>(
      `
        SELECT *
        FROM delivery_events
        WHERE type = 'smtp.attempted'
          AND detail->>'domain' = $1
        ORDER BY created_at DESC
        LIMIT 1
      `,
      [domain]
    )

    return result.rowCount === 0 ? null : toIso(result.rows[0].created_at)
  }

  async getMetrics(): Promise<string> {
    const jobResult = await this.pool.query<{ status: string; count: string }>(
      `
        SELECT status, count(*)::text
        FROM delivery_jobs
        GROUP BY status
        ORDER BY status
      `
    )

    const messageResult = await this.pool.query<{ status: string; count: string }>(
      `
        SELECT status, count(*)::text
        FROM messages
        GROUP BY status
        ORDER BY status
      `
    )

    const lines = [
      '# HELP core_sending_lab_jobs_total Delivery jobs by status.',
      '# TYPE core_sending_lab_jobs_total gauge',
      ...jobResult.rows.map((row) => `core_sending_lab_jobs_total{status="${row.status}"} ${row.count}`),
      '# HELP core_sending_lab_messages_total Messages by status.',
      '# TYPE core_sending_lab_messages_total gauge',
      ...messageResult.rows.map((row) => `core_sending_lab_messages_total{status="${row.status}"} ${row.count}`),
    ]

    return `${lines.join('\n')}\n`
  }
}
