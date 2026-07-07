export type DeliveryFailureClassification = {
  kind: 'transient' | 'permanent'
  reason: string
  smtpStatus?: number
}

type SmtpLikeError = {
  code?: unknown
  responseCode?: unknown
  message?: unknown
}

export function classifyDeliveryError(error: unknown): DeliveryFailureClassification {
  const smtpError = error as SmtpLikeError
  const status = typeof smtpError.responseCode === 'number' ? smtpError.responseCode : undefined
  const message = typeof smtpError.message === 'string' ? smtpError.message : 'Unknown delivery failure'

  if (status !== undefined) {
    if (status >= 500) {
      return { kind: 'permanent', reason: message, smtpStatus: status }
    }

    if (status >= 400) {
      return { kind: 'transient', reason: message, smtpStatus: status }
    }
  }

  const code = typeof smtpError.code === 'string' ? smtpError.code : undefined
  if (code !== undefined && ['ECONNREFUSED', 'ETIMEDOUT', 'ECONNRESET', 'EAI_AGAIN'].includes(code)) {
    return { kind: 'transient', reason: message }
  }

  return { kind: 'transient', reason: message }
}

