import 'dotenv/config'

import { getConfig } from '../config.js'
import { createPool } from '../db/pool.js'
import { migrate } from '../db/schema.js'
import { createRequestHash, messageSubmitSchema } from '../domain/email.js'
import { JobsRepository } from '../repositories/jobs.js'
import { MessagesRepository } from '../repositories/messages.js'
import { SmtpDeliveryClient } from '../services/smtp.js'
import { DeliveryWorker, sleep } from '../worker.js'

const config = getConfig()
const pool = createPool(config)

try {
  await migrate(pool)

  const messagesRepository = new MessagesRepository(pool)
  const jobsRepository = new JobsRepository(pool)
  const timestamp = Date.now()
  const input = messageSubmitSchema.parse({
    from: 'sender@example.test',
    to: `receiver@demo-${timestamp}.local.test`,
    subject: `Core Sending Lab demo ${timestamp}`,
    text: 'This message was accepted, queued, and delivered to local Mailpit by Core Sending Lab.',
  })

  const submission = await messagesRepository.createSubmission({
    tenantId: 'demo',
    fromEmail: input.from,
    toEmail: input.to,
    subject: input.subject,
    textBody: input.text,
    htmlBody: input.html,
    idempotencyKey: `demo-${timestamp}`,
    requestHash: createRequestHash(input),
    maxAttempts: config.maxDeliveryAttempts,
  })

  const worker = new DeliveryWorker(config, {
    jobsRepository,
    smtpClient: new SmtpDeliveryClient(config),
  })

  const workerResults = []
  for (let iteration = 0; iteration < 5; iteration += 1) {
    const result = await worker.tick()
    workerResults.push(result)

    if (result.status === 'delivered' || result.status === 'dead_lettered' || result.status === 'idle') {
      break
    }

    if (result.status === 'throttled') {
      await sleep(result.delayMs)
    }
  }

  const message = await messagesRepository.getMessage('demo', submission.message.id)
  const events = await messagesRepository.listEvents('demo', submission.message.id)

  console.log(
    JSON.stringify(
      {
        submitted: submission,
        workerResults,
        finalMessage: message,
        events,
        mailpit: 'http://localhost:8025',
      },
      null,
      2
    )
  )
} finally {
  await pool.end()
}

