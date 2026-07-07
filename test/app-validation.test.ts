import { describe, expect, it } from 'vitest'

import { createApp } from '../src/app.js'
import type { AppConfig } from '../src/config.js'

const testConfig: AppConfig = {
  nodeEnv: 'test',
  port: 8787,
  databaseUrl: 'postgres://core_sending_lab:core_sending_lab@localhost:5432/core_sending_lab',
  redisUrl: 'redis://localhost:6379',
  smtpHost: 'localhost',
  smtpPort: 1025,
  workerId: 'test-worker',
  workerPollMs: 1000,
  jobLeaseSeconds: 30,
  maxDeliveryAttempts: 5,
  retryBaseMs: 1000,
  retryMaxMs: 60000,
  domainThrottleMs: 500,
}

describe('message API validation', () => {
  it('rejects message submissions without a body', async () => {
    const app = createApp(testConfig)
    const response = await app.request('/v1/messages', {
      method: 'POST',
      body: JSON.stringify({}),
      headers: {
        'content-type': 'application/json',
      },
    })

    expect(response.status).toBe(400)
    await expect(response.json()).resolves.toMatchObject({
      error: 'validation_error',
    })
  })
})

