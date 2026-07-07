# Core Sending Lab Walkthrough

This project is not a normal inbox app. Mailpit is only the final inbox where delivered local emails appear.

Core Sending Lab is the system before that inbox:

1. It accepts a message through a local API.
2. It saves the message in Postgres.
3. It creates a background delivery job.
4. A worker leases that job.
5. The worker sends the message to Mailpit.
6. The system records an event timeline for every step.

## What The Screenshot Means

If you can see messages in Mailpit, the final delivery step worked.

That proves:

- Docker services are running.
- The worker reached the local SMTP server.
- The message was sent to Mailpit instead of the internet.

Mailpit does not show the full system. It only shows the final email. The Core Sending Lab dashboard shows the earlier steps.

## The Two Browser Pages

Open the project dashboard:

```text
http://localhost:8787
```

Use this page to check:

- recent messages
- job status
- attempt counts
- event timelines

Open Mailpit:

```text
http://localhost:8025
```

Use this page to check:

- the final email body
- headers
- raw email content

## The Simple Test Flow

Run these commands:

```bash
npm run compose:up
npm run db:migrate
npm run demo:flow
npm run dev
```

Then open:

```text
http://localhost:8787
```

Click the latest message. You should see events like:

- `message.accepted`
- `job.queued`
- `job.leased`
- `smtp.attempted`
- `smtp.delivered`

That is the core value of the project: it does not just show that an email arrived, it explains how it moved through the system.

## What To Say The Project Does

Core Sending Lab is a local delivery reliability lab. It demonstrates how backend systems accept work, persist it, process it asynchronously, retry failures, and keep an audit trail.

In simpler terms: it lets you watch an email move through a mini delivery system without sending real email.

