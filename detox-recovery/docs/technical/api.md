# API Reference

The site has two server-side API routes. Both are JSON-only, server-rendered, and degrade gracefully when env vars are missing.

Both routes pass through the abuse-protection pipeline (`lib/abuse-protection.ts`) before any handler logic runs. See [Abuse Protection](#abuse-protection) for the origin, honeypot, and rate-limit contracts that affect every request — including the examples below.

---

## POST /api/contact

Sends an inquiry email via Resend and optionally fires a referral to a partner app.

### Request

```
Content-Type: application/json
```

| Field          | Type   | Required | Constraints                                    |
| -------------- | ------ | -------- | ---------------------------------------------- |
| `name`         | string | Yes      | Non-empty, max 100 chars                       |
| `email`        | string | Yes      | Must match `/^[^\s@]+@[^\s@]+\.[^\s@]+$/`      |
| `message`      | string | Yes      | Non-empty, max 5000 chars                      |
| `organization` | string | No       | Max 200 chars                                  |
| `interest`     | string | No       | Must be one of the known interests (see below) |

**Known interests** (others are silently ignored):

- `Patient-Experience Training`
- `Withdrawal Journey Mapping`
- `Communication Workshops`
- `Dropout / Friction Analysis`
- `Patient Education Review`
- `Digital Health Startup Advisory`
- `Sober Living / Housing`
- `12-Step / Homegroup Support`
- `Other`

### Responses

| Status | Body                                                        | Meaning                                                                            |
| ------ | ----------------------------------------------------------- | ---------------------------------------------------------------------------------- |
| 200    | `{ "success": true }`                                       | Email sent — OR a [silent-success](#silent-success-contract) path was taken        |
| 400    | `{ "error": "Name is required" }`                           | Validation failure                                                                 |
| 400    | `{ "error": "Valid email is required" }`                    | Email format invalid                                                               |
| 400    | `{ "error": "Message is required" }`                        | Message empty                                                                      |
| 400    | `{ "error": "Invalid JSON body" }`                          | Malformed request body                                                             |
| 403    | `{ "error": "Forbidden" }`                                  | Missing or non-allowed `Origin` header — see [Abuse Protection](#abuse-protection) |
| 429    | `{ "error": "Too many requests. Please try again later." }` | Per-IP rate limit hit; `Retry-After` header included                               |
| 502    | `{ "error": "Failed to send message. Please try again." }`  | Resend API error                                                                   |

### Side Effects

1. **Resend email** — sent to `RESEND_TO_EMAIL`, plain-text, `replyTo` set to submitter's email.
2. **Partner referral** (conditional, currently env-gated and inactive) — if `interest` is `"Sober Living / Housing"` or `"12-Step / Homegroup Support"`, a POST is dispatched to `SHARED_API_URL/api/referrals` in parallel with the Resend send and awaited via `Promise.allSettled`. Referral failure is logged but does not fail the user response. Requires `SHARED_API_URL` and `INTERNAL_API_KEY`; intentionally unset in production. See `docs/architecture.md` "Referral Routing" for why this is not `void`-dispatched on Cloud Run.

### Example Request

```bash
curl -X POST https://nextsteprecovery.io/api/contact \
  -H "Content-Type: application/json" \
  -H "Origin: https://nextsteprecovery.io" \
  -d '{
    "name": "Jane Smith",
    "email": "jane@example.com",
    "organization": "Recovery Center X",
    "interest": "Patient-Experience Training",
    "message": "We would like to discuss staff training for our detox unit."
  }'
```

The `Origin` header is required — requests without it return `403 Forbidden`. Browser fetch calls send it automatically; `curl` and server-to-server callers must add it explicitly.

---

## POST /api/subscribe

Adds an email address to a MailerLite subscriber group.

### Request

```
Content-Type: application/json
```

| Field   | Type   | Required | Constraints                               |
| ------- | ------ | -------- | ----------------------------------------- |
| `email` | string | Yes      | Must match `/^[^\s@]+@[^\s@]+\.[^\s@]+$/` |
| `tag`   | string | Yes      | Must be one of the known tags (see below) |

**Known tags:**

| Tag                                 | MailerLite Group              | Used by                                                          |
| ----------------------------------- | ----------------------------- | ---------------------------------------------------------------- |
| `newsletter-withdrawal-field-notes` | Newsletter group              | Footer and resources newsletter signup                           |
| `lead-magnet-unsafe`                | Unsafe withdrawal guide group | "What to Do When Withdrawal Starts Feeling Unsafe" form          |
| `lead-magnet-family`                | Family guide group            | "How to Help Someone in Withdrawal Without Making It Worse" form |
| `lead-magnet-b2b`                   | B2B group                     | B2B consulting lead magnet form                                  |

### Responses

| Status | Body                                                        | Meaning                                                                            |
| ------ | ----------------------------------------------------------- | ---------------------------------------------------------------------------------- |
| 200    | `{ "success": true }`                                       | Subscribed — OR a [silent-success](#silent-success-contract) path was taken        |
| 400    | `{ "error": "Valid email is required" }`                    | Email missing or invalid                                                           |
| 400    | `{ "error": "Invalid subscription tag" }`                   | Tag not in known set                                                               |
| 400    | `{ "error": "Invalid JSON body" }`                          | Malformed request body                                                             |
| 403    | `{ "error": "Forbidden" }`                                  | Missing or non-allowed `Origin` header — see [Abuse Protection](#abuse-protection) |
| 429    | `{ "error": "Too many requests. Please try again later." }` | Per-IP rate limit hit; `Retry-After` header included                               |
| 502    | `{ "error": "Subscription failed. Please try again." }`     | MailerLite API error or network timeout                                            |

### Example Request

```bash
curl -X POST https://nextsteprecovery.io/api/subscribe \
  -H "Content-Type: application/json" \
  -H "Origin: https://nextsteprecovery.io" \
  -d '{
    "email": "reader@example.com",
    "tag": "newsletter-withdrawal-field-notes"
  }'
```

---

## Rate Limiting

Requests flow through two rate-limit layers, in execution order:

### Layer 1 — middleware (coarse, edge)

`middleware.ts` runs first, at the edge of the request pipeline, before any route handler:

| Route            | Limit             |
| ---------------- | ----------------- |
| `/api/contact`   | 5 req/min per IP  |
| `/api/subscribe` | 10 req/min per IP |

Responses beyond the limit return HTTP 429 with `Retry-After`, `X-RateLimit-Limit`, `X-RateLimit-Remaining`, and `X-RateLimit-Reset` headers.

### Layer 2 — abuse-protection (per-route, in-handler)

Inside each handler, `checkRateLimit(req, route)` (from `lib/abuse-protection.ts`) enforces a tighter 60s/IP per-route window. See [Abuse Protection](#abuse-protection) below.

Both layers are in-memory and single-instance — state resets on cold start and does not coordinate across Cloud Run instances. For multi-instance fan-out, swap the `Map` in each layer for an Upstash Redis KV store.

## Abuse Protection

Every request to `/api/contact` and `/api/subscribe` passes through three checks defined in `lib/abuse-protection.ts` before any handler logic runs. These layer on top of the middleware limiter above — defense in depth.

### 1. Origin allow-list

`checkOrigin(req)` runs first. Requests without an `Origin` header, or with an `Origin` not in the allow-list, return `403 Forbidden`. Default allow-list:

- `https://nextsteprecovery.io`
- `https://www.nextsteprecovery.io`
- `http://localhost:3000`
- `http://127.0.0.1:3000`

Override via the `ALLOWED_ORIGINS` env var (comma-separated). Browser `fetch` calls send `Origin` automatically; server-to-server clients and `curl` must add `-H "Origin: …"` explicitly — see the curl examples above.

**Debugging an unexpected 403:**

1. Inspect the request: `curl -v …` or browser DevTools → Network tab. Confirm an `Origin` header is being sent and note its exact value.
2. Confirm the value is in the allow-list. If running against the production host, it should be `https://nextsteprecovery.io`. Preview / staging deployments must set `ALLOWED_ORIGINS` to include their hostname.
3. Check the runtime env: in Firebase App Hosting, `ALLOWED_ORIGINS` is read from `apphosting.yaml` (currently unset → defaults apply). When unset, only the four hard-coded defaults are accepted.

### 2. Honeypot field

Each form ships an invisible `<input name="website">` (rendered by `components/forms/HoneypotInput.tsx`). Real users never see or fill it; most automated bots do. If `body.website` is a non-empty string, the route returns `200 { "success": true }` and drops the submission — see [Silent-Success Contract](#silent-success-contract).

All four user-facing forms (Contact, Newsletter, LeadMagnet, B2BLeadMagnet) include the honeypot. New forms must include `<HoneypotInput />` in their JSX.

### 3. Per-route per-IP rate limit

`checkRateLimit(req, route)` allows one request per `<ip, route>` pair per 60 seconds. Excess requests return `429 Too Many Requests` with a `Retry-After: <seconds>` header. IPs are read from `x-forwarded-for` (first entry) or `x-real-ip`; if neither is present (dev / direct connection / tests) the check is skipped.

State is in-memory (single-instance, resets on cold start). For multi-instance fan-out, swap the `Map` for an Upstash Redis KV store.

## Silent-Success Contract

Some paths through both routes deliberately return `200 { "success": true }` without performing the side effect. This is by design — clients should treat `200` as "request handled" not "side effect confirmed."

| Trigger                                                  | Why                                                                                                                                                                                                    |
| -------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Honeypot `website` field is non-empty                    | Anti-enumeration. A `400` would let an attacker discover the honeypot field name; returning the same `200` shape as a legitimate submission keeps the bot uncertain.                                   |
| `RESEND_API_KEY` or `RESEND_TO_EMAIL` missing            | Local-dev / preview environments without credentials must not surface errors in the UI. Production must configure both vars — verify with `npm run verify:services`.                                   |
| `MAILERLITE_API_KEY` or the relevant group id missing    | Same rationale as above.                                                                                                                                                                               |
| MailerLite returns `200` for an already-subscribed email | MailerLite's subscriber API is idempotent — there's no distinct "duplicate" branch in our handler, just the normal success return. Worth knowing because resubmitting the same form is _not_ an error. |

This contract is intentionally **not visible from the response shape today** — `{ "success": true }` looks identical regardless of which branch was taken. A future change (tracked as Phase 2 P-M4 / A-M1 in `.full-review/`) may evolve this to `{ "ok": true, "delivered": false }` so the silent paths become observable. **Do not "fix" the silent honeypot drop by returning `400` — it would defeat the anti-bot design.**
