import type { DeliveryEvent, DeliveryJob, StoredMessage } from '../domain/types.js'

export function renderDashboard(input: { messages: StoredMessage[]; jobs: DeliveryJob[] }): string {
  const latestMessage = input.messages[0]
  const latestHref = latestMessage === undefined ? '#' : `/messages/${latestMessage.id}/timeline`

  return page(
    'Core Sending Lab',
    `
      <main class="shell">
        <section class="hero">
          <div>
            <p class="eyebrow">Local email delivery simulator</p>
            <h1>Follow a message from API acceptance to local inbox delivery.</h1>
            <p class="lead">
              This dashboard shows the part Mailpit cannot show: stored messages, queued jobs, worker state,
              and delivery timelines.
            </p>
          </div>
          <div class="hero-actions">
            <a class="button primary" href="${latestHref}">Latest timeline</a>
            <a class="button" href="http://localhost:8025">Open Mailpit</a>
          </div>
        </section>

        <section class="explain-grid" aria-label="What this system does">
          ${explainStep('1', 'API accepts', 'A message is submitted through the local HTTP API.')}
          ${explainStep('2', 'Postgres stores', 'The message, job, and event history are saved durably.')}
          ${explainStep('3', 'Worker delivers', 'A background worker leases one job and sends it to SMTP.')}
          ${explainStep('4', 'Mailpit receives', 'Mailpit catches the email locally; no real email is sent.')}
        </section>

        <section class="layout">
          <div class="panel">
            <div class="panel-header">
              <h2>Recent Messages</h2>
              <span>${input.messages.length} shown</span>
            </div>
            ${input.messages.length === 0 ? emptyState() : messageTable(input.messages)}
          </div>

          <div class="panel">
            <div class="panel-header">
              <h2>Recent Jobs</h2>
              <span>${input.jobs.length} shown</span>
            </div>
            ${input.jobs.length === 0 ? emptyState() : jobTable(input.jobs)}
          </div>
        </section>

        <section class="panel">
          <h2>How To Check It</h2>
          <ol class="checklist">
            <li>Run <code>npm run compose:up</code> to start Postgres, Redis, and Mailpit.</li>
            <li>Run <code>npm run db:migrate</code> so the tables exist.</li>
            <li>Run <code>npm run demo:flow</code> to submit and deliver one message.</li>
            <li>Open this dashboard and click a message timeline.</li>
            <li>Open Mailpit to see the final delivered email.</li>
          </ol>
        </section>
      </main>
    `
  )
}

export function renderMessageTimeline(input: { message: StoredMessage; events: DeliveryEvent[] }): string {
  return page(
    `Timeline ${input.message.id}`,
    `
      <main class="shell">
        <nav class="top-nav">
          <a href="/">Dashboard</a>
          <a href="http://localhost:8025">Mailpit</a>
        </nav>

        <section class="panel detail">
          <p class="eyebrow">Message timeline</p>
          <h1>${escapeHtml(input.message.subject)}</h1>
          <dl class="facts">
            <div><dt>Status</dt><dd>${statusBadge(input.message.status)}</dd></div>
            <div><dt>From</dt><dd>${escapeHtml(input.message.fromEmail)}</dd></div>
            <div><dt>To</dt><dd>${escapeHtml(input.message.toEmail)}</dd></div>
            <div><dt>Tenant</dt><dd>${escapeHtml(input.message.tenantId)}</dd></div>
          </dl>
        </section>

        <section class="panel">
          <div class="panel-header">
            <h2>Events</h2>
            <span>${input.events.length} recorded</span>
          </div>
          <ol class="timeline">
            ${input.events.map(renderEvent).join('')}
          </ol>
        </section>
      </main>
    `
  )
}

export function renderSetupProblem(error: unknown): string {
  const message = error instanceof Error ? error.message : 'Unknown setup problem'

  return page(
    'Setup Needed',
    `
      <main class="shell">
        <section class="hero">
          <div>
            <p class="eyebrow">Setup needed</p>
            <h1>The dashboard could not read the local database.</h1>
            <p class="lead">Start the local services and run the migration first.</p>
          </div>
        </section>

        <section class="panel">
          <h2>Run These Commands</h2>
          <pre><code>npm run compose:up
npm run db:migrate
npm run demo:flow
npm run dev</code></pre>
          <p class="muted">Last error: ${escapeHtml(message)}</p>
        </section>
      </main>
    `
  )
}

function messageTable(messages: StoredMessage[]): string {
  return `
    <table>
      <thead>
        <tr>
          <th>Subject</th>
          <th>Recipient</th>
          <th>Status</th>
          <th>Tenant</th>
          <th>Created</th>
        </tr>
      </thead>
      <tbody>
        ${messages
          .map(
            (message) => `
              <tr>
                <td><a href="/messages/${message.id}/timeline">${escapeHtml(message.subject)}</a></td>
                <td>${escapeHtml(message.toEmail)}</td>
                <td>${statusBadge(message.status)}</td>
                <td>${escapeHtml(message.tenantId)}</td>
                <td>${formatDate(message.createdAt)}</td>
              </tr>
            `
          )
          .join('')}
      </tbody>
    </table>
  `
}

function jobTable(jobs: DeliveryJob[]): string {
  return `
    <table>
      <thead>
        <tr>
          <th>Job</th>
          <th>Status</th>
          <th>Attempts</th>
          <th>Next Attempt</th>
        </tr>
      </thead>
      <tbody>
        ${jobs
          .map(
            (job) => `
              <tr>
                <td><a href="/messages/${job.messageId}/timeline">${escapeHtml(job.id)}</a></td>
                <td>${statusBadge(job.status)}</td>
                <td>${job.attempts}/${job.maxAttempts}</td>
                <td>${formatDate(job.nextAttemptAt)}</td>
              </tr>
            `
          )
          .join('')}
      </tbody>
    </table>
  `
}

function renderEvent(event: DeliveryEvent): string {
  return `
    <li>
      <div class="event-marker"></div>
      <div>
        <div class="event-head">
          <strong>${escapeHtml(event.type)}</strong>
          <time>${formatDate(event.createdAt)}</time>
        </div>
        <pre><code>${escapeHtml(JSON.stringify(event.detail, null, 2))}</code></pre>
      </div>
    </li>
  `
}

function explainStep(step: string, title: string, description: string): string {
  return `
    <div class="step">
      <span>${step}</span>
      <h2>${escapeHtml(title)}</h2>
      <p>${escapeHtml(description)}</p>
    </div>
  `
}

function emptyState(): string {
  return `
    <div class="empty">
      <p>No rows yet.</p>
      <p>Run <code>npm run demo:flow</code>, then refresh this page.</p>
    </div>
  `
}

function statusBadge(status: string): string {
  const tone = status === 'delivered' ? 'good' : status === 'dead_lettered' || status === 'failed' ? 'bad' : 'neutral'
  return `<span class="status ${tone}">${escapeHtml(status)}</span>`
}

function page(title: string, body: string): string {
  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>${escapeHtml(title)}</title>
    <style>
      :root {
        color-scheme: light;
        --bg: #f6f7f9;
        --surface: #ffffff;
        --surface-strong: #eef2f5;
        --text: #17202a;
        --muted: #5d6875;
        --line: #d9dee5;
        --accent: #146c63;
        --accent-strong: #0e514a;
        --good-bg: #e8f6ef;
        --good-text: #16633e;
        --bad-bg: #fae8e8;
        --bad-text: #8a1f1f;
        --neutral-bg: #eef1f5;
        --neutral-text: #334155;
      }

      * { box-sizing: border-box; }
      body {
        margin: 0;
        background: var(--bg);
        color: var(--text);
        font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
        letter-spacing: 0;
      }

      a { color: var(--accent); text-decoration: none; }
      a:hover { text-decoration: underline; }
      code {
        background: var(--surface-strong);
        border: 1px solid var(--line);
        border-radius: 4px;
        padding: 0.08rem 0.28rem;
        font-size: 0.9em;
      }
      pre {
        margin: 0.75rem 0 0;
        overflow-x: auto;
        background: #17202a;
        color: #edf3f8;
        border-radius: 6px;
        padding: 0.9rem;
      }
      pre code {
        background: transparent;
        border: 0;
        color: inherit;
        padding: 0;
      }

      .shell {
        width: min(1180px, calc(100vw - 32px));
        margin: 0 auto;
        padding: 32px 0 56px;
      }
      .hero {
        display: flex;
        justify-content: space-between;
        gap: 24px;
        align-items: end;
        padding: 28px 0;
      }
      .hero h1,
      .detail h1 {
        max-width: 760px;
        margin: 0;
        font-size: clamp(2rem, 5vw, 4rem);
        line-height: 1.02;
        font-weight: 760;
      }
      .lead {
        max-width: 760px;
        color: var(--muted);
        font-size: 1.08rem;
        line-height: 1.6;
      }
      .eyebrow {
        margin: 0 0 10px;
        color: var(--accent);
        font-weight: 700;
        text-transform: uppercase;
        font-size: 0.78rem;
      }
      .hero-actions,
      .top-nav {
        display: flex;
        gap: 10px;
        flex-wrap: wrap;
      }
      .button,
      .top-nav a {
        display: inline-flex;
        align-items: center;
        min-height: 40px;
        border: 1px solid var(--line);
        border-radius: 6px;
        padding: 0 14px;
        color: var(--text);
        background: var(--surface);
        font-weight: 650;
      }
      .button.primary {
        background: var(--accent);
        border-color: var(--accent);
        color: white;
      }
      .layout,
      .explain-grid {
        display: grid;
        grid-template-columns: repeat(2, minmax(0, 1fr));
        gap: 16px;
        margin-bottom: 16px;
      }
      .explain-grid {
        grid-template-columns: repeat(4, minmax(0, 1fr));
      }
      .panel,
      .step {
        background: var(--surface);
        border: 1px solid var(--line);
        border-radius: 8px;
      }
      .panel {
        padding: 20px;
        margin-bottom: 16px;
      }
      .panel-header {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 12px;
        margin-bottom: 12px;
      }
      .panel h2,
      .step h2 {
        margin: 0;
        font-size: 1rem;
      }
      .panel-header span,
      .muted,
      .step p,
      .empty p {
        color: var(--muted);
      }
      .step {
        padding: 16px;
      }
      .step span {
        display: inline-grid;
        place-items: center;
        width: 30px;
        height: 30px;
        border-radius: 999px;
        background: var(--surface-strong);
        color: var(--accent-strong);
        font-weight: 760;
        margin-bottom: 12px;
      }
      table {
        width: 100%;
        border-collapse: collapse;
        table-layout: fixed;
      }
      th,
      td {
        text-align: left;
        padding: 12px 8px;
        border-top: 1px solid var(--line);
        vertical-align: top;
        overflow-wrap: anywhere;
      }
      th {
        color: var(--muted);
        font-size: 0.78rem;
        text-transform: uppercase;
      }
      .status {
        display: inline-flex;
        align-items: center;
        min-height: 24px;
        border-radius: 999px;
        padding: 0 9px;
        font-size: 0.82rem;
        font-weight: 720;
      }
      .status.good { background: var(--good-bg); color: var(--good-text); }
      .status.bad { background: var(--bad-bg); color: var(--bad-text); }
      .status.neutral { background: var(--neutral-bg); color: var(--neutral-text); }
      .timeline {
        list-style: none;
        margin: 0;
        padding: 0;
      }
      .timeline li {
        display: grid;
        grid-template-columns: 20px minmax(0, 1fr);
        gap: 12px;
        padding: 12px 0;
        border-top: 1px solid var(--line);
      }
      .event-marker {
        width: 12px;
        height: 12px;
        margin-top: 5px;
        border-radius: 999px;
        background: var(--accent);
      }
      .event-head {
        display: flex;
        justify-content: space-between;
        gap: 12px;
        flex-wrap: wrap;
      }
      .event-head time {
        color: var(--muted);
      }
      .facts {
        display: grid;
        grid-template-columns: repeat(4, minmax(0, 1fr));
        gap: 12px;
        margin: 20px 0 0;
      }
      .facts div {
        border-top: 1px solid var(--line);
        padding-top: 12px;
      }
      dt {
        color: var(--muted);
        font-size: 0.8rem;
        margin-bottom: 6px;
      }
      dd {
        margin: 0;
        overflow-wrap: anywhere;
      }
      .checklist {
        margin-bottom: 0;
        color: var(--muted);
        line-height: 1.9;
      }

      @media (max-width: 860px) {
        .hero {
          display: block;
        }
        .layout,
        .explain-grid,
        .facts {
          grid-template-columns: 1fr;
        }
        table {
          display: block;
          overflow-x: auto;
        }
      }
    </style>
  </head>
  <body>
    ${body}
  </body>
</html>`
}

function formatDate(value: string): string {
  return new Intl.DateTimeFormat('en', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(value))
}

function escapeHtml(value: string): string {
  return value.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;')
}

