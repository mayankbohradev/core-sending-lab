import { Hono } from 'hono'
import type { Pool } from 'pg'
import { z } from 'zod'

import { type AppConfig, getConfig } from './config.js'
import { AppError, NotFoundError } from './domain/errors.js'
import {
  createRequestHash,
  idempotencyKeySchema,
  messageSubmitSchema,
  tenantIdSchema,
} from './domain/email.js'
import { createPool } from './db/pool.js'
import { JobsRepository } from './repositories/jobs.js'
import { MessagesRepository } from './repositories/messages.js'

export type AppDependencies = {
  pool?: Pool
  messagesRepository?: MessagesRepository
  jobsRepository?: JobsRepository
}

const listQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(50),
})

const jobsQuerySchema = listQuerySchema.extend({
  status: z.string().trim().min(1).max(64).optional(),
})

export function createApp(config: AppConfig = getConfig(), dependencies: AppDependencies = {}) {
  const app = new Hono()
  let ownedPool: Pool | undefined
  let messagesRepository = dependencies.messagesRepository
  let jobsRepository = dependencies.jobsRepository

  function getPool(): Pool {
    if (dependencies.pool !== undefined) {
      return dependencies.pool
    }

    ownedPool ??= createPool(config)
    return ownedPool
  }

  function getMessagesRepository(): MessagesRepository {
    messagesRepository ??= new MessagesRepository(getPool())
    return messagesRepository
  }

  function getJobsRepository(): JobsRepository {
    jobsRepository ??= new JobsRepository(getPool())
    return jobsRepository
  }

  app.get('/health', (c) => {
    return c.json({
      status: 'ok',
      service: 'core-sending-lab',
      environment: config.nodeEnv,
    })
  })

  app.post('/v1/messages', async (c) => {
    const rawBody = await c.req.json().catch(() => null)
    const parsedBody = messageSubmitSchema.safeParse(rawBody)

    if (!parsedBody.success) {
      return c.json(
        {
          error: 'validation_error',
          message: 'Message payload is invalid',
          details: parsedBody.error.flatten(),
        },
        400
      )
    }

    const tenantId = parseTenantId(c.req.header('x-tenant-id'))
    const idempotencyKey = parseIdempotencyKey(c.req.header('idempotency-key'))
    const input = parsedBody.data
    const result = await getMessagesRepository().createSubmission({
      tenantId,
      fromEmail: input.from,
      toEmail: input.to,
      subject: input.subject,
      textBody: input.text,
      htmlBody: input.html,
      idempotencyKey,
      requestHash: createRequestHash(input),
      maxAttempts: config.maxDeliveryAttempts,
    })

    return c.json(result, result.reused ? 200 : 202)
  })

  app.get('/v1/messages', async (c) => {
    const tenantId = parseTenantId(c.req.header('x-tenant-id'))
    const query = listQuerySchema.parse(Object.fromEntries(new URL(c.req.url).searchParams))
    const messages = await getMessagesRepository().listMessages(tenantId, query.limit)

    return c.json({ messages })
  })

  app.get('/v1/messages/:id', async (c) => {
    const tenantId = parseTenantId(c.req.header('x-tenant-id'))
    const message = await getMessagesRepository().getMessage(tenantId, c.req.param('id'))

    if (message === null) {
      throw new NotFoundError('Message was not found')
    }

    return c.json({ message })
  })

  app.get('/v1/messages/:id/events', async (c) => {
    const tenantId = parseTenantId(c.req.header('x-tenant-id'))
    const events = await getMessagesRepository().listEvents(tenantId, c.req.param('id'))

    return c.json({ events })
  })

  app.get('/v1/jobs', async (c) => {
    const tenantId = parseTenantId(c.req.header('x-tenant-id'))
    const query = jobsQuerySchema.parse(Object.fromEntries(new URL(c.req.url).searchParams))
    const jobs = await getJobsRepository().listJobs(tenantId, query.status, query.limit)

    return c.json({ jobs })
  })

  app.get('/v1/dlq', async (c) => {
    const tenantId = parseTenantId(c.req.header('x-tenant-id'))
    const query = listQuerySchema.parse(Object.fromEntries(new URL(c.req.url).searchParams))
    const jobs = await getJobsRepository().listDeadLetters(tenantId, query.limit)

    return c.json({ jobs })
  })

  app.post('/v1/jobs/:id/retry', async (c) => {
    const tenantId = parseTenantId(c.req.header('x-tenant-id'))
    const job = await getJobsRepository().retryDeadLetter(tenantId, c.req.param('id'))

    if (job === null) {
      throw new NotFoundError('Dead-lettered job was not found')
    }

    return c.json({ job })
  })

  app.get('/metrics', async (c) => {
    return c.text(await getJobsRepository().getMetrics())
  })

  app.onError((error, c) => {
    if (error instanceof AppError) {
      return c.json(
        {
          error: error.code,
          message: error.message,
          details: error.details,
        },
        toResponseStatus(error.statusCode)
      )
    }

    if (error instanceof z.ZodError) {
      return c.json(
        {
          error: 'validation_error',
          message: 'Request is invalid',
          details: error.flatten(),
        },
        400
      )
    }

    console.error(error)
    return c.json(
      {
        error: 'internal_error',
        message: 'Unexpected server error',
      },
      500
    )
  })

  app.notFound((c) => {
    return c.json(
      {
        error: 'not_found',
        message: 'Route not found',
      },
      404
    )
  })

  return app
}

function parseTenantId(value: string | undefined): string {
  return tenantIdSchema.parse(value ?? 'local')
}

function parseIdempotencyKey(value: string | undefined): string | undefined {
  if (value === undefined || value.trim() === '') {
    return undefined
  }

  return idempotencyKeySchema.parse(value)
}

function toResponseStatus(statusCode: number): 400 | 404 | 409 | 500 {
  if (statusCode === 400 || statusCode === 404 || statusCode === 409) {
    return statusCode
  }

  return 500
}
