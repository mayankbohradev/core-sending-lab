import 'dotenv/config'

import { getConfig } from './config.js'
import { createPool } from './db/pool.js'
import { JobsRepository } from './repositories/jobs.js'
import { SmtpDeliveryClient } from './services/smtp.js'
import { DeliveryWorker } from './worker.js'

const config = getConfig()
const pool = createPool(config)
const worker = new DeliveryWorker(config, {
  jobsRepository: new JobsRepository(pool),
  smtpClient: new SmtpDeliveryClient(config),
})

try {
  const result = await worker.tick()
  console.log(JSON.stringify(result, null, 2))
} finally {
  await pool.end()
}

