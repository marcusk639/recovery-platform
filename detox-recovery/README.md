# Next Step Recovery

A non-clinical peer-support website for people navigating withdrawal and early recovery. Built with Next.js 15 App Router, deployed on Firebase App Hosting.

**Firebase project:** `nextsteprecovery-1d5c2`

---

## What This Site Does

Offers a tiered menu of non-clinical support services — from a free fit check call to a two-week navigation package — alongside downloadable resources, a newsletter, and B2B consulting for treatment programs. All content is written from lived experience and is explicit that this is **not** a clinical service.

## Quick Start

```bash
# Requires Node >= 20
nvm use 20

npm install
npm run setup:env       # creates .env.local with Stripe URLs pre-filled
npm run verify:services # smoke-test all external service credentials
npm run dev             # http://localhost:3000
```

## Commands

| Command                   | Purpose                                 |
| ------------------------- | --------------------------------------- |
| `npm run dev`             | Dev server on port 3000                 |
| `npm run build`           | Production build (requires Node 20+)    |
| `npm run lint`            | ESLint                                  |
| `npm run test`            | Jest test suite                         |
| `npm run test:coverage`   | Jest with v8 coverage                   |
| `npm run test:watch`      | Jest in watch mode (re-runs on save)    |
| `npm run setup:env`       | Create `.env.local` from template       |
| `npm run verify:services` | Smoke-test external service credentials |

## Pages

| Route         | Description                                        |
| ------------- | -------------------------------------------------- |
| `/`           | Home — hero, service ladder preview, trust signals |
| `/services`   | Service tiers with referral safety triggers        |
| `/consulting` | B2B consulting offers + lead magnet                |
| `/resources`  | Downloadable products, lead magnets, newsletter    |
| `/contact`    | Contact form (accepts `?interest=` pre-fill param) |
| `/thank-you`  | Post-purchase confirmation (accepts `?type=call`)  |

## API Routes

| Route            | Method | Purpose                                                 |
| ---------------- | ------ | ------------------------------------------------------- |
| `/api/contact`   | POST   | Contact form → Resend email + optional partner referral |
| `/api/subscribe` | POST   | Email signup → MailerLite subscriber group              |

See [`docs/api.md`](docs/api.md) for full request/response details.

## Stack

- **Framework:** Next.js 15 · React 19 · TypeScript · Tailwind CSS
- **Hosting:** Firebase App Hosting (Cloud Run, SSR)
- **Email delivery:** Resend
- **Email lists:** MailerLite
- **Payments:** Stripe Payment Links (plain URL redirects, no Stripe.js)
- **Scheduling:** Calendly

See [`docs/architecture.md`](docs/architecture.md) for the system diagram and data flow.

## Environment Variables

Run `npm run setup:env` to create `.env.local`. Stripe URLs are pre-filled. API keys must be added manually.

| Variable                                      | Description                                                   |
| --------------------------------------------- | ------------------------------------------------------------- |
| `RESEND_API_KEY`                              | Resend key — contact form delivery                            |
| `RESEND_TO_EMAIL`                             | Inbox that receives contact inquiries                         |
| `RESEND_FROM_EMAIL`                           | Sender address (e.g. `Withdrawal Support <hello@domain.com>`) |
| `MAILERLITE_API_KEY`                          | MailerLite key — subscriber management                        |
| `MAILERLITE_GROUP_ID_NEWSLETTER`              | Group ID for newsletter subscribers                           |
| `MAILERLITE_GROUP_ID_LEAD_MAGNET_UNSAFE`      | Group ID for unsafe-withdrawal guide leads                    |
| `MAILERLITE_GROUP_ID_LEAD_MAGNET_FAMILY`      | Group ID for family guide leads                               |
| `MAILERLITE_GROUP_ID_B2B`                     | Group ID for B2B consulting leads                             |
| `NEXT_PUBLIC_CALENDLY_FIT_CHECK_URL`          | Calendly link — free fit check                                |
| `NEXT_PUBLIC_CALENDLY_SUPPORT_CALL_URL`       | Calendly link — 30-min support call                           |
| `NEXT_PUBLIC_STRIPE_SUPPORT_CALL_URL`         | Stripe link — support call ($50)                              |
| `NEXT_PUBLIC_STRIPE_FAMILY_GUIDE_URL`         | Stripe link — Family Survival Guide ($19.99)                  |
| `NEXT_PUBLIC_STRIPE_APPOINTMENT_PREP_URL`     | Stripe link — Appointment Prep Worksheet ($9.99)              |
| `NEXT_PUBLIC_STRIPE_SAFETY_CHECKLIST_URL`     | Stripe link — Safety Checklist ($9.99)                        |
| `NEXT_PUBLIC_STRIPE_TREATMENT_COMPARISON_URL` | Stripe link — Treatment Comparison ($9.99)                    |
| `NEXT_PUBLIC_STRIPE_RELAPSE_PREVENTION_URL`   | Stripe link — Relapse Prevention Plan ($9.99)                 |
| `NEXT_PUBLIC_STRIPE_DONATION_URL`             | Stripe link — sliding-scale donation                          |
| `RECOVERY_API_URL`                            | recovery-api URL (optional — enables partner referrals)       |
| `RECOVERY_API_KEY`                            | Shared secret for recovery-api (optional)                     |

See [`docs/environment.md`](docs/environment.md) for per-service setup instructions.

## Deployment

```bash
# One-time: upload secrets to Firebase Secret Manager
firebase apphosting:secrets:set resend-api-key
firebase apphosting:secrets:set mailerlite-api-key

firebase deploy
```

See [`docs/deployment.md`](docs/deployment.md) for the full deployment guide.

## Content Constraints

This is a **non-clinical peer support** site. Copy and UX must never imply medical advice, diagnosis, or treatment.

`lib/referral-conditions.ts` lists conditions (alcohol/benzo withdrawal, seizure history, suicidal ideation, etc.) that always redirect users to emergency/medical care — not to site services. The `ReferralTriggers` component renders these on `/services`.

## Project Structure

```
app/                    Next.js App Router pages + API routes
  api/contact/          POST — contact form → Resend
  api/subscribe/        POST — email signup → MailerLite
  consulting/           B2B consulting page
  contact/              Contact form page
  resources/            Products and lead magnets page
  services/             Service tier listing page
components/
  consulting/           B2BLeadMagnet, B2BOffers, ConsultingHero
  contact/              ContactForm
  home/                 HeroSection, ServiceLadderPreview, TrustSignals
  nav/                  Header, Footer, NewsletterSignup
  resources/            LeadMagnetForm, ProductCard
  services/             ReferralTriggers, ServiceCard, ServiceComparisonTable, WhatICanHelp
  ui/                   Button, Card, Badge, Section (shared primitives)
lib/                    Static typed content (no CMS, no database)
  services-data.ts      SERVICE_TIERS — the five-tier service ladder
  consulting-data.ts    B2B_OFFERS — six consulting service cards
  products-data.ts      PRODUCTS — paid worksheets, guides, lead magnets, newsletter, donation
  referral-conditions.ts Medical referral trigger list
scripts/
  setup-env.sh          Create .env.local from template
  verify-services.sh    Smoke-test all external service credentials
docs/
  architecture.md       System design and data flow
  api.md                API route reference
  environment.md        Environment variable setup guide
  features.md           Feature inventory and roadmap
  deployment.md         Firebase App Hosting deployment guide
```

## Tests

156 tests · 28 suites · 95.95% statement coverage

```bash
npm test
npx jest __tests__/api/
npx jest --testNamePattern="renders"
```
