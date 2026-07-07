import { z } from 'zod'

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().positive().default(8787),
  DATABASE_URL: z.string().url().default('postgres://core_sending_lab:core_sending_lab@localhost:55432/core_sending_lab'),
  REDIS_URL: z.string().url().default('redis://localhost:6379'),
  SMTP_HOST: z.string().min(1).default('localhost'),
  SMTP_PORT: z.coerce.number().int().positive().default(1025),
  WORKER_ID: z.string().min(1).default('local-worker'),
  WORKER_POLL_MS: z.coerce.number().int().nonnegative().default(1000),
  JOB_LEASE_SECONDS: z.coerce.number().int().positive().default(30),
  MAX_DELIVERY_ATTEMPTS: z.coerce.number().int().positive().default(5),
  RETRY_BASE_MS: z.coerce.number().int().positive().default(1000),
  RETRY_MAX_MS: z.coerce.number().int().positive().default(60000),
  DOMAIN_THROTTLE_MS: z.coerce.number().int().nonnegative().default(500),
})

export type AppConfig = {
  nodeEnv: 'development' | 'test' | 'production'
  port: number
  databaseUrl: string
  redisUrl: string
  smtpHost: string
  smtpPort: number
  workerId: string
  workerPollMs: number
  jobLeaseSeconds: number
  maxDeliveryAttempts: number
  retryBaseMs: number
  retryMaxMs: number
  domainThrottleMs: number
}

export function getConfig(env: NodeJS.ProcessEnv = process.env): AppConfig {
  const parsed = envSchema.parse(env)

  return {
    nodeEnv: parsed.NODE_ENV,
    port: parsed.PORT,
    databaseUrl: parsed.DATABASE_URL,
    redisUrl: parsed.REDIS_URL,
    smtpHost: parsed.SMTP_HOST,
    smtpPort: parsed.SMTP_PORT,
    workerId: parsed.WORKER_ID,
    workerPollMs: parsed.WORKER_POLL_MS,
    jobLeaseSeconds: parsed.JOB_LEASE_SECONDS,
    maxDeliveryAttempts: parsed.MAX_DELIVERY_ATTEMPTS,
    retryBaseMs: parsed.RETRY_BASE_MS,
    retryMaxMs: parsed.RETRY_MAX_MS,
    domainThrottleMs: parsed.DOMAIN_THROTTLE_MS,
  }
}
