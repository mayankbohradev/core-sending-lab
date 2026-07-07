import { createHash } from 'node:crypto'

import { z } from 'zod'

const emailSchema = z.string().trim().email().max(320).toLowerCase()

export const messageSubmitSchema = z
  .object({
    from: emailSchema,
    to: emailSchema,
    subject: z.string().trim().min(1).max(998),
    text: z.string().max(100_000).optional(),
    html: z.string().max(250_000).optional(),
  })
  .refine((value) => value.text !== undefined || value.html !== undefined, {
    message: 'Either text or html must be provided',
    path: ['text'],
  })

export const tenantIdSchema = z.string().trim().min(1).max(128).regex(/^[a-zA-Z0-9_.-]+$/)
export const idempotencyKeySchema = z.string().trim().min(1).max(256)

export type MessageSubmitInput = z.infer<typeof messageSubmitSchema>

export function createRequestHash(input: MessageSubmitInput): string {
  const canonical = JSON.stringify({
    from: input.from,
    to: input.to,
    subject: input.subject,
    text: input.text ?? null,
    html: input.html ?? null,
  })

  return createHash('sha256').update(canonical).digest('hex')
}

export function getEmailDomain(address: string): string {
  return address.split('@').at(1)?.toLowerCase() ?? 'unknown'
}

