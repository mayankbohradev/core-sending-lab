export const messageStatuses = ['queued', 'delivering', 'delivered', 'failed'] as const
export type MessageStatus = (typeof messageStatuses)[number]

export const jobStatuses = ['queued', 'leased', 'retrying', 'delivered', 'dead_lettered'] as const
export type JobStatus = (typeof jobStatuses)[number]

export type StoredMessage = {
  id: string
  tenantId: string
  fromEmail: string
  toEmail: string
  subject: string
  textBody: string | null
  htmlBody: string | null
  status: MessageStatus
  createdAt: string
  updatedAt: string
  deliveredAt: string | null
}

export type DeliveryJob = {
  id: string
  messageId: string
  tenantId: string
  status: JobStatus
  attempts: number
  maxAttempts: number
  nextAttemptAt: string
  leasedUntil: string | null
  lockedBy: string | null
  lastError: string | null
  createdAt: string
  updatedAt: string
}

export type DeliveryEvent = {
  id: string
  messageId: string
  jobId: string | null
  type: string
  detail: Record<string, unknown>
  createdAt: string
}

export type MessageSubmission = {
  tenantId: string
  fromEmail: string
  toEmail: string
  subject: string
  textBody?: string
  htmlBody?: string
  idempotencyKey?: string
  requestHash: string
  maxAttempts: number
}

export type MessageSubmissionResult = {
  reused: boolean
  message: StoredMessage
  job: DeliveryJob
}

export type LeasedDelivery = {
  job: DeliveryJob
  message: StoredMessage
}

