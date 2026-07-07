import { serve } from '@hono/node-server'

import { createApp } from './app.js'
import { getConfig } from './config.js'

const config = getConfig()
const app = createApp(config)

serve({
  fetch: app.fetch,
  port: config.port,
})

console.log(`core-sending-lab listening on http://localhost:${config.port}`)

