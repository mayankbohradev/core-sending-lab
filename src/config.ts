import { z } from 'zod'

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().positive().default(8787),
  DATABASE_URL: z.string().url().default('postgres://core_sending_lab:core_sending_lab@localhost:5432/core_sending_lab'),
  REDIS_URL: z.string().url().default('redis://localhost:6379'),
  SMTP_HOST: z.string().min(1).default('localhost'),
  SMTP_PORT: z.coerce.number().int().positive().default(1025),
})

export type AppConfig = {
  nodeEnv: 'development' | 'test' | 'production'
  port: number
  databaseUrl: string
  redisUrl: string
  smtpHost: string
  smtpPort: number
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
  }
}

