import { describe, expect, it } from 'vitest'

import { classifyDeliveryError } from '../src/domain/classifier.js'

describe('delivery error classifier', () => {
  it('treats 4xx SMTP responses as retryable', () => {
    expect(classifyDeliveryError({ responseCode: 451, message: 'try later' })).toEqual({
      kind: 'transient',
      reason: 'try later',
      smtpStatus: 451,
    })
  })

  it('treats 5xx SMTP responses as permanent failures', () => {
    expect(classifyDeliveryError({ responseCode: 550, message: 'mailbox unavailable' })).toEqual({
      kind: 'permanent',
      reason: 'mailbox unavailable',
      smtpStatus: 550,
    })
  })

  it('treats local transport failures as retryable', () => {
    expect(classifyDeliveryError({ code: 'ECONNREFUSED', message: 'smtp unavailable' })).toEqual({
      kind: 'transient',
      reason: 'smtp unavailable',
    })
  })
})

