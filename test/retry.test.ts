import { describe, expect, it } from 'vitest'

import { calculateRetryDelayMs, hasAttemptsRemaining } from '../src/domain/retry.js'

describe('retry policy', () => {
  it('uses capped exponential backoff with jitter', () => {
    const delayMs = calculateRetryDelayMs(
      3,
      {
        baseMs: 1000,
        maxMs: 5000,
        jitterRatio: 0.2,
      },
      () => 0.5
    )

    expect(delayMs).toBe(4400)
  })

  it('detects exhausted attempts after the current try is counted', () => {
    expect(hasAttemptsRemaining(4, 5)).toBe(true)
    expect(hasAttemptsRemaining(5, 5)).toBe(false)
  })
})

