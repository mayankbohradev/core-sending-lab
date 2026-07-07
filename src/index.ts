import 'dotenv/config'

import { serve } from '@hono/node-server'

import { createApp } from './app.js'
import { getConfig } from './config.js'
import { createPool } from './db/pool.js'

const config = getConfig()
const pool = createPool(config)
const app = createApp(config, { pool })

process.on('SIGINT', () => {
  void pool.end().finally(() => {
    process.exit(0)
  })
})

process.on('SIGTERM', () => {
  void pool.end().finally(() => {
    process.exit(0)
  })
})

serve({
  fetch: app.fetch,
  port: config.port,
})

console.log(`core-sending-lab listening on http://localhost:${config.port}`)
