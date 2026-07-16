# detox-recovery/CLAUDE.md

This is the **Detox Recovery** product within the `recovery-platform` monorepo (`recovery-platform/detox-recovery/`). It is a Next.js 15 marketing and lead-capture website for peer-support detox navigation.

**Target users:** Individuals or families seeking detox/treatment guidance. Non-clinical peer support only.

**Production:** https://nextsteprecovery.io (Firebase App Hosting — `nextsteprecovery-1d5c2` backend, alias `nextstep-recovery`)

---

## Commands

```bash
npm run dev          # start Next.js dev server on http://localhost:3000
npm run build        # production build
npm run lint         # ESLint
npm run test         # Jest (all tests)
npm run test:watch   # Jest watch mode
npm run test:coverage # Jest with v8 coverage report
npm run setup:env       # create .env.local from template
npm run verify:services # smoke-test external service credentials

# Run a single test file
npx jest __tests__/components/ContactForm.test.tsx

# Run tests matching a name pattern
npx jest --testNamePattern="renders"
```

## Architecture

**Next.js 15 App Router** with React 19, TypeScript, and Tailwind CSS.

### Pages and API routes (`app/`)

| Route                 | Purpose                                            |
| --------------------- | -------------------------------------------------- |
| `/`                   | Home — hero, service ladder preview, trust signals |
| `/services`           | Full service tier listing                          |
| `/consulting`         | B2B consulting offers + lead magnet                |
| `/resources`          | Downloadable products and lead magnets             |
| `/contact`            | Contact form (accepts `?interest=` query param)    |
| `/thank-you`          | Post-purchase confirmation (accepts `?type=call`)  |
| `/privacy`            | Privacy policy                                     |
| `/terms`              | Terms of service                                   |
| `POST /api/contact`   | Sends email via Resend                             |
| `POST /api/subscribe` | Adds subscriber to MailerLite group by tag         |

### Data layer (`lib/`)

All site content lives in static typed data files — no CMS, no database:

- `services-data.ts` — `SERVICE_TIERS[]`: the service ladder (free fit check → navigation package)
- `consulting-data.ts` — `B2B_OFFERS[]`: consulting services for treatment centers/startups
- `products-data.ts` — `PRODUCTS[]`: digital products, lead magnets, newsletter, donations
- `referral-conditions.ts` — `REFERRAL_CONDITIONS`: conditions that require medical referral (used in `ReferralTriggers` component)
- `scope-of-practice.ts` — `CAN_HELP_WITH` / `CANNOT_HELP_WITH`: canonical non-clinical scope-of-practice copy rendered by `TrustSignals` and `WhatICanHelp`. Editing this is a clinical-safety change — the parity test in `__tests__/lib/scope-of-practice.test.tsx` enforces both components stay in sync.
- `abuse-protection.ts` — origin allow-list + honeypot + 60s/IP rate-limit primitives used by both API routes. See [Security pipeline](#security-pipeline) below.

`NEXT_PUBLIC_*` Stripe/Calendly URLs are injected at module load time via `process.env.NEXT_PUBLIC_*` with `?? "#"` fallbacks. When adding new CTAs, add the env var to `env.example` and inject it in the relevant data file.

`products-data.ts` has an `availability?: "coming-soon"` field on `Product`. Set it for any product that isn't deliverable yet — `ProductCard` renders a disabled "Available soon" button instead of the CTA. The 5 paid PDFs are currently gated this way pending content writing.

**PDF delivery platform:** Lemon Squeezy (not Stripe) — handles file delivery, VAT, and confirmation email in one step. Do not create new Stripe payment links for PDF products. See `docs/manual-tasks/2026-05-23-lemon-squeezy-migration.md`.

### Components (`components/`)

Organized by domain: `home/`, `services/`, `consulting/`, `contact/`, `resources/`, `nav/`.

`components/ui/` holds shared primitives: `Button`, `Card`, `Badge`, `Section`. `Button` always renders as a Next.js `Link` — it is not an interactive `<button>` element.

### External services and env vars

Copy `env.example` to `.env.local` and fill in values. Missing vars are handled gracefully:

- **Resend** (`RESEND_API_KEY`, `RESEND_TO_EMAIL`): contact form email delivery. Missing → silent success.
- **MailerLite** (`MAILERLITE_API_KEY`, `MAILERLITE_GROUP_ID_*`): newsletter and lead magnet subscriptions. Uses distinct group IDs per audience segment via a `tag` field in the POST body. Missing → silent success.
- **Stripe** (`NEXT_PUBLIC_STRIPE_*`): payment links (not Stripe.js — plain URL redirects). Missing → `#` href.
- **Calendly** (`NEXT_PUBLIC_CALENDLY_*`): booking links. Missing → `#` href.
- **Origin allow-list** (`ALLOWED_ORIGINS`, optional): comma-separated overrides for the default origin allow-list in `lib/abuse-protection.ts`. Missing → defaults (production + localhost).

### Security pipeline

`lib/abuse-protection.ts` ships three primitives that **every POST route handler must call before any handler logic**:

```text
if (!checkOrigin(req).ok)        → 403 Forbidden
if (!checkRateLimit(req, ...).ok) → 429 Too Many Requests + Retry-After
parse JSON body
if (!checkHoneypot(body).ok)     → 200 { success: true }   (silent drop)
```

`/api/contact` and `/api/subscribe` follow this order today. New POST routes must too. Skipping any of the three is a security regression.

Every user-facing form must include `<HoneypotInput />` from `components/forms/HoneypotInput.tsx`. The 4 production forms (Contact, Newsletter, LeadMagnet, B2BLeadMagnet) already do. When adding a new form, add it.

The silent-success contract (honeypot trip, missing env vars, MailerLite idempotent dupes — all return `200 { success: true }`) is documented in `docs/api.md`. **Do not "fix" the silent honeypot drop by returning `400` — it defeats the anti-bot design.**

### Contact form pre-fill pattern

`/contact?interest=Patient-Experience%20Training` pre-fills the `interest` dropdown. B2B consulting CTAs in `consulting-data.ts` encode the interest in the `ctaHref`. `ContactForm` accepts a `defaultInterest` prop populated from `searchParams`.

### Tests (`__tests__/`)

Mirrors source structure: `__tests__/components/`, `__tests__/api/`, `__tests__/pages/`. Uses `@testing-library/react` with `jest-environment-jsdom`. API route tests mock `node-fetch`/`Resend` and assert on `NextResponse` behavior.

### Business planning docs (`docs/`)

`docs/` contains business context referenced for product decisions:

- `financial-model-master-2026-05-24.md` — canonical financial model (service tier pricing, capacity ceiling, launch timeline)
- `business-case-2026-05-24.md` — strategic partner business case
- `market-opportunity-analysis-2026-05-24.md` — TAM/SAM/SOM and competitive landscape
- `roadmap-2026-05-24.md` — feature roadmap

### Disabled integrations

`app/api/contact/route.ts` has referral firing logic for `recovery-api` (triggers on "Sober Living / Housing" and "12-Step / Homegroup Support" contact interests). It is intentionally disabled — env vars are commented out in `apphosting.yaml` pending partner agreement negotiation. Do not activate without explicit instruction.

When activated, detox originates referrals to recovery-api as app-id `nextstep-recovery` with system uid `detox-anon` (anonymous lead capture — no detox user account). recovery-api resolves the display-name `toApp` to a canonical app-id via its registry (`recovery-api/src/config/apps.ts`). Requests must send `X-App-Id` and `X-User-Uid` headers, not just `X-Service-Key`.

The referral is dispatched via `Promise.allSettled([sendEmailPromise, referralPromise])` — both run in parallel, both are awaited, and referral rejection is logged but does not fail the user response. **Do not refactor this to `void fireReferral(...)`.** Firebase App Hosting (Cloud Run) throttles background CPU after the handler returns, so a fire-and-forget POST may be cut mid-handshake. There is no `waitUntil()` equivalent here. See `docs/architecture.md` "Referral Routing" for the full rationale.

## Deployment

**Production:** https://nextsteprecovery.io (Firebase App Hosting — `nextsteprecovery-1d5c2` backend, alias `nextstep-recovery`, `us-central1`)

`firebase deploy` must be run in the **user's terminal** (`! firebase deploy`) — the `firebase` CLI is not in Claude's shell PATH.

## Important constraints

This is a **non-clinical peer support** site. Copy and UX must never imply medical advice, diagnosis, or treatment. `REFERRAL_CONDITIONS` drives the `ReferralTriggers` component — conditions on that list always point users to emergency/medical care, not to site services.

<claude-mem-context>

</claude-mem-context>
