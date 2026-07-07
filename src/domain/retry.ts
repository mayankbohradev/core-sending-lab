export type RetryPolicy = {
  baseMs: number
  maxMs: number
  jitterRatio?: number
}

export function calculateRetryDelayMs(attemptNumber: number, policy: RetryPolicy, random = Math.random): number {
  const baseDelay = policy.baseMs * 2 ** Math.max(attemptNumber - 1, 0)
  const cappedDelay = Math.min(baseDelay, policy.maxMs)
  const jitterRatio = policy.jitterRatio ?? 0.2
  const jitter = Math.floor(cappedDelay * jitterRatio * random())

  return Math.min(cappedDelay + jitter, policy.maxMs)
}

export function hasAttemptsRemaining(attempts: number, maxAttempts: number): boolean {
  return attempts < maxAttempts
}

