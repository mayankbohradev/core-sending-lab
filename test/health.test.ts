import { describe, expect, it } from 'vitest'

import { createApp } from '../src/app.js'
import type { AppConfig } from '../src/config.js'

const testConfig: AppConfig = {
  nodeEnv: 'test',
  port: 8787,
  databaseUrl: 'postgres://core_sending_lab:core_sending_lab@localhost:55432/core_sending_lab',
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

describe('health route', () => {
  it('returns service health', async () => {
    const app = createApp(testConfig)
    const response = await app.request('/health')

    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toEqual({
      status: 'ok',
      service: 'core-sending-lab',
      environment: 'test',
    })
  })
})
