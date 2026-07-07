import 'dotenv/config'

import { getConfig } from '../config.js'
import { createPool } from '../db/pool.js'
import { migrate } from '../db/schema.js'

const config = getConfig()
const pool = createPool(config)

try {
  await migrate(pool)
  console.log('database schema is up to date')
} finally {
  await pool.end()
}

