import { Hono } from 'hono'

import { type AppConfig, getConfig } from './config.js'

export function createApp(config: AppConfig = getConfig()) {
  const app = new Hono()

  app.get('/health', (c) => {
    return c.json({
      status: 'ok',
      service: 'core-sending-lab',
      environment: config.nodeEnv,
    })
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

