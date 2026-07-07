# Core Sending Lab

Core Sending Lab is a local email delivery simulator for learning and testing the reliability patterns behind transactional email systems.

It accepts an email-like message, stores it durably, queues a delivery job, processes it with a worker, sends it only to a local SMTP sink, records a timeline of delivery events, and exposes small operator-friendly debugging endpoints.

This is a first working version. The goal of v0 is not polish. The goal is to make the full message lifecycle visible and testable on a laptop.

## Why This Exists

Most email examples stop at "call sendMail" or "drop a message in Mailpit." Real delivery systems have more moving parts:

- accepting requests safely
- protecting retries with idempotency
- queueing work outside the request path
- leasing jobs so workers do not double-process the same message
- deciding whether failures should retry or stop
- moving exhausted jobs to a dead-letter queue
- keeping an event timeline that explains what happened

This project started as a small local lab for that middle layer: the part between "the API accepted a message" and "an operator can explain what happened to it."

## How It Is Useful

Core Sending Lab is useful when you want to inspect the moving parts of delivery reliability without sending real email.

Compared with Mailpit or MailHog:

- Mailpit is excellent for catching local emails.
- Core Sending Lab uses Mailpit as the sink, but adds API acceptance, persistence, job leasing, retries, DLQ, and event timelines.

Compared with a generic queue like BullMQ:

- BullMQ is great for background jobs.
- Core Sending Lab focuses on the email-delivery lifecycle around the queue: message state, SMTP attempts, retry classification, and operator debugging.

Compared with running a real mail transfer agent:

- Real mail systems are powerful, but they are too operationally heavy for safe local experimentation.
- Core Sending Lab stays local by default, so the behavior is easy to reset, inspect, and test.

## Current v0 Capabilities

- `POST /v1/messages` accepts a local message submission.
- `Idempotency-Key` protects repeated submissions.
- Postgres stores messages, jobs, idempotency records, and delivery events.
- A worker leases queued jobs with `FOR UPDATE SKIP LOCKED`.
- Delivery goes to local Mailpit over SMTP.
- Transient failures retry with exponential backoff and jitter.
- Permanent or exhausted failures move to a dead-letter queue.
- Domain-level throttling spaces out attempts to the same recipient domain.
- Debug endpoints show messages, jobs, DLQ entries, events, and simple metrics.

## Visual Dashboard

Start the API server and open the dashboard:

```bash
npm run dev
```

```text
http://localhost:8787
```

The dashboard is the easiest way to understand the project. It shows recent messages, delivery jobs, and clickable event timelines.

Mailpit is still available at:

```text
http://localhost:8025
```

Use the dashboard to inspect the delivery system. Use Mailpit to inspect the final local email.

## Architecture

The architecture separates request handling from delivery work.

```text
HTTP API -> Postgres -> worker lease -> local SMTP -> Mailpit
            |            |
            |            +-> retry / DLQ decisions
            |
            +-> append-only delivery events
```

The API is the control plane. It validates requests, persists messages, creates jobs, and serves debugging views.

The worker is the data plane. It leases jobs, performs SMTP delivery, classifies failures, schedules retries, and writes delivery events.

More detail: [Architecture notes](./docs/ARCHITECTURE.md)

Beginner walkthrough: [Core Sending Lab Walkthrough](./docs/WALKTHROUGH.md)

## Local Setup

```bash
npm install
npm run compose:up
npm run db:migrate
npm run dev
```

In another terminal, start the worker:

```bash
npm run worker
```

Mailpit UI:

```text
http://localhost:8025
```

## Quick Smoke Demo

This command migrates the database, submits one demo message, runs the worker path, and prints the final message timeline:

```bash
npm run compose:up
npm run demo:flow
```

After it runs, open Mailpit:

```text
http://localhost:8025
```

## API Usage

Submit a message:

```bash
curl -X POST http://localhost:8787/v1/messages \
  -H 'content-type: application/json' \
  -H 'idempotency-key: demo-message-1' \
  -d '{
    "from": "sender@example.test",
    "to": "receiver@example.test",
    "subject": "Local delivery test",
    "text": "Hello from Core Sending Lab"
  }'
```

Run one worker tick manually:

```bash
npm run worker:once
```

Inspect recent messages:

```bash
curl http://localhost:8787/v1/messages
```

Inspect delivery events for one message:

```bash
curl http://localhost:8787/v1/messages/<message_id>/events
```

Inspect queued, retrying, delivered, or dead-lettered jobs:

```bash
curl 'http://localhost:8787/v1/jobs?status=delivered'
curl http://localhost:8787/v1/dlq
```

Retry a dead-lettered job:

```bash
curl -X POST http://localhost:8787/v1/jobs/<job_id>/retry
```

Simple metrics:

```bash
curl http://localhost:8787/metrics
```

## Verification

```bash
npm run typecheck
npm test
npm run build
```

## Configuration

Copy `.env.example` to `.env` if you want to override defaults.

Important knobs:

- `DATABASE_URL` - Postgres connection string. Docker Compose maps Postgres to host port `55432` to avoid common local Postgres conflicts.
- `SMTP_HOST` and `SMTP_PORT` - local SMTP sink.
- `MAX_DELIVERY_ATTEMPTS` - maximum attempts before DLQ.
- `RETRY_BASE_MS` and `RETRY_MAX_MS` - retry backoff bounds.
- `DOMAIN_THROTTLE_MS` - minimum spacing between attempts to the same domain.

## Design Notes

The first version uses Postgres as both the durable store and the job lease coordinator. That keeps the system easy to understand: every important state change is visible in one database.

The project keeps delivery events append-only. Message and job rows show the current state, but events explain how the system got there.

Mailpit is deliberately the only default SMTP target. This makes the project safe for repeatable local testing and prevents accidental internet delivery.

Redis is included in Docker Compose for later queue experiments, but v0 starts with a Postgres-backed queue because it is simpler to inspect and reason about.

## TODO

- [x] Scaffold TypeScript API and local Docker services.
- [x] Add Postgres schema for messages, jobs, idempotency, and events.
- [x] Add message submission API with idempotency support.
- [x] Add worker leasing, SMTP delivery, retry scheduling, and DLQ handling.
- [x] Add local smoke demo and focused unit tests.
- [ ] Add integration tests against Docker Compose services.
- [ ] Add Redis-backed queue adapter for comparison with Postgres leasing.
- [x] Add an operator dashboard for message timelines and delivery jobs.
- [ ] Add dashboard actions for DLQ retry and demo message submission.
- [ ] Add provider simulator modes for throttling, 4xx, and 5xx SMTP responses.
- [ ] Add load test scripts and publish measured local results.
- [ ] Add OpenTelemetry traces for API, queue, worker, and SMTP spans.
- [ ] Add GitHub Actions for typecheck, tests, and build.
- [ ] Add a versioned example dataset for repeatable demos.

## Non-Goals

- This project does not send real email to the internet.
- This project is not a production email service.
- This project does not claim delivery performance until benchmarks exist.
- This project favors inspectability over throughput in v0.
