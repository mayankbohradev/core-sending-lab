import 'dotenv/config'

import { getConfig } from './config.js'
import { createPool } from './db/pool.js'
import { JobsRepository } from './repositories/jobs.js'
import { SmtpDeliveryClient } from './services/smtp.js'
import { DeliveryWorker, sleep } from './worker.js'

const config = getConfig()
const pool = createPool(config)
const worker = new DeliveryWorker(config, {
  jobsRepository: new JobsRepository(pool),
  smtpClient: new SmtpDeliveryClient(config),
})

let stopping = false

process.on('SIGINT', () => {
  stopping = true
})

process.on('SIGTERM', () => {
  stopping = true
})

console.log(`delivery worker ${config.workerId} started`)

try {
  while (!stopping) {
    const result = await worker.tick()

    if (result.status !== 'idle') {
      console.log(JSON.stringify(result))
    }

    await sleep(result.status === 'idle' ? config.workerPollMs : 0)
  }
} finally {
  await pool.end()
  console.log(`delivery worker ${config.workerId} stopped`)
}

