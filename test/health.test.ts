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

