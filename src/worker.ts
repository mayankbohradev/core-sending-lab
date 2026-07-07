import type { AppConfig } from './config.js'
import { classifyDeliveryError } from './domain/classifier.js'
import { getEmailDomain } from './domain/email.js'
import { calculateRetryDelayMs, hasAttemptsRemaining } from './domain/retry.js'
import type { JobsRepository } from './repositories/jobs.js'
import type { SmtpDeliveryClient } from './services/smtp.js'

export type DeliveryWorkerDependencies = {
  jobsRepository: JobsRepository
  smtpClient: SmtpDeliveryClient
}

export type WorkerTickResult =
  | { status: 'idle' }
  | { status: 'throttled'; jobId: string; domain: string; delayMs: number }
  | { status: 'delivered'; jobId: string; messageId: string }
  | { status: 'retrying'; jobId: string; messageId: string; delayMs: number }
  | { status: 'dead_lettered'; jobId: string; messageId: string; reason: string }

export class DeliveryWorker {
  constructor(
    private readonly config: AppConfig,
    private readonly dependencies: DeliveryWorkerDependencies
  ) {}

  async tick(): Promise<WorkerTickResult> {
    const leased = await this.dependencies.jobsRepository.leaseNext(
      this.config.workerId,
      this.config.jobLeaseSeconds
    )

    if (leased === null) {
      return { status: 'idle' }
    }

    const { job, message } = leased
    const domain = getEmailDomain(message.toEmail)
    const lastAttemptAt = await this.dependencies.jobsRepository.getLastAttemptAtForDomain(domain)

    if (lastAttemptAt !== null) {
      const elapsedMs = Date.now() - new Date(lastAttemptAt).getTime()
      const remainingThrottleMs = this.config.domainThrottleMs - elapsedMs

      if (remainingThrottleMs > 0) {
        const delayMs = Math.ceil(remainingThrottleMs)
        await this.dependencies.jobsRepository.scheduleDomainThrottle(job, domain, delayMs)
        return { status: 'throttled', jobId: job.id, domain, delayMs }
      }
    }

    const attemptedJob = await this.dependencies.jobsRepository.recordSmtpAttempt(job, domain)

    try {
      const result = await this.dependencies.smtpClient.send(message)
      await this.dependencies.jobsRepository.markDelivered(attemptedJob, {
        smtpMessageId: result.smtpMessageId,
        response: result.response,
        accepted: result.accepted,
        rejected: result.rejected,
      })

      return { status: 'delivered', jobId: attemptedJob.id, messageId: attemptedJob.messageId }
    } catch (error) {
      const classification = classifyDeliveryError(error)

      if (classification.kind === 'permanent' || !hasAttemptsRemaining(attemptedJob.attempts, attemptedJob.maxAttempts)) {
        await this.dependencies.jobsRepository.deadLetter(attemptedJob, {
          reason: classification.reason,
          classification: classification.kind,
          smtpStatus: classification.smtpStatus,
        })

        return {
          status: 'dead_lettered',
          jobId: attemptedJob.id,
          messageId: attemptedJob.messageId,
          reason: classification.reason,
        }
      }

      const delayMs = calculateRetryDelayMs(attemptedJob.attempts, {
        baseMs: this.config.retryBaseMs,
        maxMs: this.config.retryMaxMs,
      })

      await this.dependencies.jobsRepository.scheduleRetry(attemptedJob, {
        reason: classification.reason,
        classification: classification.kind,
        delayMs,
        smtpStatus: classification.smtpStatus,
      })

      return {
        status: 'retrying',
        jobId: attemptedJob.id,
        messageId: attemptedJob.messageId,
        delayMs,
      }
    }
  }
}

export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms)
  })
}

