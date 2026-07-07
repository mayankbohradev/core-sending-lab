# Architecture Notes

Core Sending Lab is a local email transport simulator. The architecture intentionally separates the control plane from the data plane.

## Control Plane

The control plane accepts API requests, validates inputs, persists messages, enforces idempotency, and creates delivery jobs.

Responsibilities:

- request validation
- idempotency records
- message metadata
- delivery job creation
- operator read APIs

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

## Local SMTP Safety

The default delivery target must be Mailpit or MailHog. This avoids accidental real-world email sending and keeps the project safe for demos and tests.

