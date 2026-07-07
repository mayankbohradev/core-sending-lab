# Architecture Notes

Core Sending Lab is a local email delivery simulator. The architecture intentionally separates the control plane from the data plane so request handling and delivery work can evolve independently.

## Control Plane

The control plane accepts API requests, validates inputs, persists messages, enforces idempotency, creates delivery jobs, and exposes read/debug endpoints.

Responsibilities:

- request validation
- idempotency records
- message metadata
- delivery job creation
- operator read APIs
- simple metrics

## Data Plane

The data plane processes delivery jobs asynchronously.

Responsibilities:

- job leasing
- SMTP delivery to local sink
- retry scheduling
- backoff and jitter
- DLQ movement
- delivery event recording
- metrics emission

## Storage Model

Postgres is the durable system of record in v0.

Tables:

- `messages` - current message state and body metadata.
- `delivery_jobs` - queued work, lease state, attempts, and DLQ state.
- `delivery_events` - append-only timeline of lifecycle events.
- `idempotency_keys` - request hash and cached response for replay protection.

The worker leases jobs with `FOR UPDATE SKIP LOCKED`. This allows multiple workers to compete for work without double-processing the same row.

## Delivery Event Timeline

Every important state transition should append a `delivery_events` row instead of overwriting history. The debug surface should be able to reconstruct a message timeline from these events.

Example events:

- `message.accepted`
- `job.queued`
- `job.leased`
- `smtp.attempted`
- `smtp.delivered`
- `smtp.deferred`
- `job.retry_scheduled`
- `job.dead_lettered`
- `job.retry_requested`
- `domain.throttled`

## Retry And DLQ Rules

The worker increments attempts before each SMTP send. Failures are classified as transient or permanent.

- 4xx SMTP responses are treated as transient.
- 5xx SMTP responses are treated as permanent.
- local transport failures such as `ECONNREFUSED` are treated as transient.
- transient failures retry with capped exponential backoff and jitter.
- permanent failures or exhausted attempts move the job to `dead_lettered`.

Dead-lettered jobs can be reset with `POST /v1/jobs/:id/retry`.

## Domain Throttling

Before a worker attempts SMTP delivery, it checks the most recent `smtp.attempted` event for the recipient domain. If the last attempt is too recent, the job is rescheduled after `DOMAIN_THROTTLE_MS`.

This is intentionally simple in v0. It makes throttling visible in the event stream before adding provider-specific rate-limit behavior.

## Local SMTP Safety

The default delivery target must be Mailpit or MailHog. This avoids accidental real-world email sending and keeps the project safe for demos and tests.

## Runtime Processes

Typical local setup has three processes:

1. Docker Compose runs Postgres, Redis, and Mailpit.
2. The API process accepts and inspects messages.
3. The worker process leases and delivers jobs.

Redis is present for future queue-adapter work. The v0 delivery path uses Postgres-backed leasing because it keeps state transitions easier to inspect.
