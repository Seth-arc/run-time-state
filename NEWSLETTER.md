# Runtime State · Newsletter Runbook

The dispatch newsletter is fully self-hosted on Vercel: serverless functions in
`/api/*`, a subscriber list in Vercel KV (Upstash Redis), and transactional
email via Resend. No third-party UI owns any part of the pipeline.

---

## One-time setup

### 1. Resend (email provider)

1. Sign up at https://resend.com and create a project.
2. Add `runtimestate.org` as a sending domain in **Domains**.
3. Copy the DKIM, SPF, and return-path (MAIL FROM) DNS records Resend shows you,
   and add them at your DNS registrar. Wait until Resend marks the domain as
   **Verified**.
4. Create an **API key** under *API Keys → Create API Key*, scope it to "Full
   access". Keep this string safe; it only shows once.

### 2. Vercel KV (subscriber storage)

1. In the Vercel dashboard, open the `runtime-state` project.
2. Go to **Storage → Create Database → KV (Upstash Redis)**.
3. Name it `runtime-state-subscribers` and link it to the project.
4. Vercel injects `KV_REST_API_URL` and `KV_REST_API_TOKEN` automatically into
   the project's environment variables. Nothing else to do.

### 3. Environment variables

In **Vercel → Project → Settings → Environment Variables**, add:

| Variable          | Value                                                |
| ----------------- | ---------------------------------------------------- |
| `RESEND_API_KEY`  | The key you copied from Resend                       |
| `FROM_EMAIL`      | `Runtime State <dispatch@runtimestate.org>`          |
| `SITE_URL`        | `https://runtimestate.org`                           |
| `ADMIN_TOKEN`     | A long random string you generate yourself *         |

\* Generate `ADMIN_TOKEN` locally, for example:

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

Paste the output into Vercel as the env var value. Keep a copy in a password
manager. This is the bearer token that gates `/api/broadcast`.

### 4. Deploy

```bash
vercel deploy --prod
```

First deploy installs `@vercel/kv` and `resend`, provisions the functions, and
wires the KV binding. Subsequent deploys are incremental.

---

## How readers subscribe

Every page has a `<form class="subscribe">`:

- Home (`index.html`), About (`about.html`), and all six post pages.
- The form `POST`s JSON `{ "email": "..." }` to `/api/subscribe`.
- `api/subscribe.js` validates the email, writes a `pending` record to KV, and
  sends a confirmation email through Resend.
- Reader clicks the confirm link → `api/confirm.js` flips the record to
  `confirmed`, adds it to `list:confirmed`, creates a long-lived unsubscribe
  token, and redirects to `/confirmed.html`.
- Unsubscribe link in any dispatch → `api/unsubscribe.js` removes the reader
  from `list:confirmed` and redirects to `/unsubscribed.html`. Supports both
  `GET` clicks and `POST` one-click per RFC 8058.

---

## Sending a dispatch

When a new post is published, broadcast it with a single `curl`. There is no
admin UI on purpose — the less surface area, the fewer mistakes.

```bash
curl -X POST "https://runtimestate.org/api/broadcast" \
  -H "Authorization: Bearer $ADMIN_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "title": "Capacity vs. Capability: Reading the Public Service Amendment Act Against the Auditor-General'\''s Books",
    "url": "/posts/psaa-capacity-capability",
    "description": "The Act builds new plumbing. The Auditor-General'\''s numbers describe the pressure the plumbing must survive.",
    "kicker": "Policy Analysis · April 2026"
  }'
```

### Dry-run first (highly recommended)

Add `"dryRun": true` to the body. The endpoint returns the total recipient
count plus three sample addresses without sending anything:

```bash
curl -X POST "https://runtimestate.org/api/broadcast" \
  -H "Authorization: Bearer $ADMIN_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"title":"test","url":"/","dryRun":true}'
```

Response example:

```json
{
  "dryRun": true,
  "total": 47,
  "sampleRecipients": ["a@example.com", "b@example.com", "c@example.com"],
  "post": { "title": "test", "url": "/", "description": "", "kicker": "" }
}
```

### Real send

Remove `dryRun` (or set it to `false`). The endpoint sends sequentially with a
550ms pause between each, which stays well under Resend's 2-req/sec rate limit
and gives us time to fail gracefully per recipient. The response reports
`{ total, sent, failed, errors }`.

```json
{
  "total": 47,
  "sent": 47,
  "failed": 0,
  "confirmedInList": 47,
  "errors": []
}
```

A 60s function timeout covers roughly 100 sequential sends. For larger lists,
chunk the broadcast (see *Scaling up* below).

---

## House rules

- **No em dashes** in any copy (policy, emails, buttons). See `api/_lib/mail.js`
  templates.
- **Double opt-in is mandatory.** Never flip a subscriber to `confirmed`
  without a click on the confirmation link. This is what keeps the sender
  reputation high on Resend.
- **One-click unsubscribe is mandatory.** Every dispatch includes both an
  `<a href>` in the footer and `List-Unsubscribe` / `List-Unsubscribe-Post`
  headers so Gmail, Outlook, and Apple Mail can unsubscribe with one tap.

---

## Inspecting the list

You can read KV directly from the Vercel dashboard under **Storage → your KV
database → Data Browser**. Useful keys:

| Key                          | Contents                                                      |
| ---------------------------- | ------------------------------------------------------------- |
| `list:confirmed`             | Set of currently-subscribed emails. `SMEMBERS` to list.       |
| `subscriber:{email}`         | Hash with `status`, `createdAt`, `confirmedAt`, `unsubscribeToken`. |
| `token:confirm:{token}`      | Pending confirm tokens. Expire after 24h automatically.       |
| `token:unsub:{token}`        | Long-lived unsubscribe tokens. Never expire.                  |

Counts:

```bash
# Total confirmed subscribers
vercel kv scard list:confirmed
```

---

## Rotating the admin token

If you suspect `ADMIN_TOKEN` has leaked, rotate it in Vercel → Settings →
Environment Variables, then redeploy. The old token stops working the moment
the new deployment goes live.

---

## Revoking a single subscriber

If someone emails you asking to be removed and you cannot wait for them to
click an unsubscribe link, use the Vercel KV browser:

1. `HSET subscriber:<email> status unsubscribed`
2. `SREM list:confirmed <email>`

They stop receiving dispatches immediately.

---

## Scaling up

These defaults assume a few hundred confirmed subscribers on the Resend free
tier (3,000 emails/month, 100/day). When you approach either limit:

- **Move to Resend Pro** ($20/month, 50k emails/month, higher daily cap).
- **Chunk broadcasts** by passing `?offset=N&limit=M` to a future endpoint so a
  single invocation sends to a slice of the list, and queue the next slice
  when the first returns.
- **Consider batch API** — Resend supports `resend.batch.send([...])` up to 100
  emails per call. Worth wiring in when the list crosses ~500.

---

## Files

```
/api/
  subscribe.js          — POST /api/subscribe
  confirm.js            — GET  /api/confirm?token=
  unsubscribe.js        — GET/POST /api/unsubscribe?token=
  broadcast.js          — POST /api/broadcast   (admin)
  _lib/
    validation.js       — email + token validation
    store.js            — KV keyspace + subscriber CRUD
    mail.js             — Resend client + HTML email templates
/confirmed.html         — double-opt-in landing page
/unsubscribed.html      — unsubscribe landing page
/css/shell.css          — .subscribe, .subscribe-block styles
/js/main.js             — initSubscribe() form handler
package.json            — @vercel/kv + resend deps, Node 20
```
