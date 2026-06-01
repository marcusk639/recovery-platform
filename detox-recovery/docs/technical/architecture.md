# Architecture

## Overview

Next Step Recovery is a Next.js 15 App Router application deployed on Firebase App Hosting (Cloud Run). There is no database — all site content lives in static TypeScript data files in `lib/`. The server-rendered pages are thin wrappers around those data files and a small set of UI components.

## System Diagram

```
Browser
  │
  ├── Static pages (SSG)
  │     /          → app/page.tsx
  │     /services  → app/services/page.tsx
  │     /consulting → app/consulting/page.tsx
  │     /resources  → app/resources/page.tsx
  │
  ├── Dynamic pages (SSR — read searchParams)
  │     /contact   → app/contact/page.tsx   (?interest= pre-fills form)
  │     /thank-you → app/thank-you/page.tsx (?type=call → call confirmation; default → product confirmation)
  │
  └── API routes (server-only, Node.js runtime)
        POST /api/contact   → Resend (email) + recovery-api (referral)
        POST /api/subscribe → MailerLite (subscriber groups)

External services (outbound from server only):
  Resend              — contact form email delivery
  MailerLite          — newsletter + lead magnet subscriber lists
  recovery-api — partner referral relay (optional)

External services (browser → direct, no server involved):
  Stripe Payment Links — checkout for paid products + donations
  Calendly            — booking for fit check + support call
```

## Data Layer

All content is static TypeScript — no CMS, no database, no build-time data fetching.

| File                         | Export                | Purpose                                                     |
| ---------------------------- | --------------------- | ----------------------------------------------------------- |
| `lib/services-data.ts`       | `SERVICE_TIERS`       | The five-tier service ladder                                |
| `lib/consulting-data.ts`     | `B2B_OFFERS`          | Six B2B consulting service cards                            |
| `lib/products-data.ts`       | `PRODUCTS`            | Paid worksheets, guides, lead magnets, newsletter, donation |
| `lib/referral-conditions.ts` | `REFERRAL_CONDITIONS` | Medical conditions that require emergency/clinical referral |

`NEXT_PUBLIC_*` Stripe and Calendly URLs are injected into the data files at module load time via `process.env.NEXT_PUBLIC_*` with `?? "#"` fallbacks, so pages render without crashing even when env vars are missing.

## Component Map

```
app/layout.tsx
  └── Header (nav/Header.tsx)
  └── {children}
  └── Footer (nav/Footer.tsx)
        └── NewsletterSignup (nav/NewsletterSignup.tsx)

app/page.tsx (Home)
  ├── HeroSection
  ├── ServiceLadderPreview
  └── TrustSignals

app/services/page.tsx
  ├── WhatICanHelp
  ├── ReferralTriggers        ← renders REFERRAL_CONDITIONS
  ├── ServiceComparisonTable  ← renders SERVICE_TIERS
  └── ServiceCard[]           ← one per SERVICE_TIER

app/consulting/page.tsx
  ├── ConsultingHero
  ├── B2BOffers               ← renders B2B_OFFERS
  └── B2BLeadMagnet

app/resources/page.tsx
  └── ProductCard[]           ← one per PRODUCT
        └── LeadMagnetForm    ← inline for lead-magnet type products

app/contact/page.tsx
  └── ContactForm             ← reads ?interest= from searchParams
```

## Shared UI Primitives

`components/ui/` holds four primitives used across all domains:

- **Button** — always renders as a Next.js `Link` (not an interactive `<button>`)
- **Card** — white rounded container with optional shadow
- **Badge** — small pill label (used for pricing, status)
- **Section** — full-width section wrapper with consistent vertical padding

## API Routes

### POST /api/contact

Server-only. Validates name/email/message, sanitizes all fields, sends an email via Resend, and optionally fires a referral to the recovery-api when the interest matches a known partner.

Input sanitization:

- `name` — trimmed, max 100 chars, CRLF stripped
- `email` — regex validated, CRLF stripped
- `organization` — max 200 chars, trimmed
- `interest` — validated against `KNOWN_INTERESTS` allowlist (9 values); rejected if not in set
- `message` — max 5000 chars

Graceful degradation: returns `{ success: true }` without sending if `RESEND_API_KEY` or `RESEND_TO_EMAIL` is missing.

### POST /api/subscribe

Server-only. Validates email, validates tag against `KNOWN_TAGS` allowlist, maps tag to a MailerLite group ID, and adds the subscriber. 8-second network timeout on the MailerLite request.

Tags: `newsletter-withdrawal-field-notes`, `lead-magnet-unsafe`, `lead-magnet-family`, `lead-magnet-b2b`

Graceful degradation: returns `{ success: true }` without subscribing if `MAILERLITE_API_KEY` or the relevant group ID is missing.

## Contact Form Pre-fill Pattern

`/contact?interest=Patient-Experience%20Training` pre-fills the interest dropdown. The B2B consulting CTAs in `consulting-data.ts` encode the interest in their `ctaHref`. `app/contact/page.tsx` reads `searchParams.interest` and passes it to `ContactForm` as `defaultInterest`. `ContactForm` validates the value against `INTERESTS` before using it.

## Referral Routing

When a contact form submission has `interest === "Sober Living / Housing"` or `"12-Step / Homegroup Support"`, the server dispatches a referral to `recovery-api`. The integration is currently env-gated and inactive in production — `SHARED_API_URL` and `INTERNAL_API_KEY` are intentionally unset (see commented block in `apphosting.yaml`). The code path is exercised only when both env vars are present.

**Dispatch pattern: `Promise.allSettled` (not `void`).**

The referral POST runs in parallel with the Resend email send, awaited via `Promise.allSettled([sendEmailPromise, referralPromise])`. Both have hard timeouts (`AbortSignal.timeout(5000)` on the referral, future ticket P-M2 covers an equivalent on Resend). Referral rejection is logged and the user-facing response still returns `200` because the email already succeeded — but the request is _awaited_, not abandoned.

> **Do not refactor this to `void fireReferral(...)`.** Firebase App Hosting runs on Cloud Run, which throttles a request's CPU to near-zero the moment the handler returns. A `void`-dispatched fetch may be cut off mid-TLS-handshake and silently dropped. There is no `waitUntil()` equivalent here, and Next.js 15's `after()` is not currently documented as supported on App Hosting. The cost of `Promise.allSettled` is `max(email, referral)` — not the sum — because both promises run concurrently with bounded timeouts.

If the partner integration is ever activated, also implement the per-interest allow-list described in finding S-M3 (`.full-review/02-security-performance.md`) so a new entry in `INTEREST_TO_APP` cannot silently fire a referral the contract doesn't cover.

## Deployment Architecture

Firebase App Hosting wraps the Next.js app in Cloud Run:

- SSR pages render server-side on each request
- Static pages (/, /services, /consulting, /resources) are pre-rendered at build time
- API routes run as serverless Node.js functions
- Secrets (`resend-api-key`, `mailerlite-api-key`) are stored in Firebase Secret Manager and injected at runtime — never in the git repo
- Public env vars (`NEXT_PUBLIC_*`) are committed in `apphosting.yaml` and bundled into the browser build at deploy time
