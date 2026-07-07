# Core Sending Lab

Core Sending Lab is a local email delivery simulator for exploring backend reliability patterns: queues, workers, retries, backoff, throttling, delivery events, local SMTP delivery, and operational debugging.

## Scope

Build a local email transport simulator that accepts message submissions, stores them durably, queues delivery jobs, sends only to a local SMTP sink, records delivery events, and exposes debugging tools for operators.

## Non-Goals

- Do not send real email to the internet.
- Do not optimize for a polished UI before the delivery pipeline works.
- Do not publish scale claims before measuring them locally.

## Planned Stack

- TypeScript backend API with Hono
- Postgres for messages, jobs, events, and idempotency records
- Redis or a local queue abstraction for worker coordination
- Worker process for delivery, retries, and DLQ handling
- Mailpit or MailHog as the local SMTP sink
- Vitest for unit/integration tests
- Docker Compose for local development
- Prometheus/OpenTelemetry-style metrics where practical

## Key Docs

- [Architecture notes](./docs/ARCHITECTURE.md)

## Local Setup

```bash
npm install
npm run compose:up
npm run dev
```

Health check:

```bash
curl http://localhost:8787/health
```

Mailpit UI:

```text
http://localhost:8025
```

## Verification

```bash
npm run typecheck
npm test
npm run build
```

## Planned Capabilities

The project should demonstrate a complete local message lifecycle:

1. API accepts a message.
2. Message is persisted with idempotency protection.
3. Worker leases and processes a delivery job.
4. SMTP delivery goes to local Mailpit/MailHog only.
5. Transient failures retry with backoff and jitter.
6. Exhausted jobs move to a dead-letter queue.
7. Debug endpoint shows timeline, attempts, and final status.
8. Documentation includes run commands, architecture notes, and test results.
