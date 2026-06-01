# Feature Inventory & Roadmap

## Live Features

### Services

| Feature                                    | Status | Notes                                                            |
| ------------------------------------------ | ------ | ---------------------------------------------------------------- |
| Free 10-minute fit check (Calendly)        | Live   | Calendly event type created; activate in dashboard before launch |
| 30-minute support call (Stripe + Calendly) | Live   | Payment link live; Calendly booking link live                    |
| Service comparison table                   | Live   | Renders all 5 tiers with pricing and status badges               |
| Referral safety triggers                   | Live   | 16 conditions; always directs to emergency/medical care          |
| "What I Can Help With" section             | Live   | Non-clinical scope clearly communicated                          |

### Resources

| Feature                                | Status               | Notes                                                                                    |
| -------------------------------------- | -------------------- | ---------------------------------------------------------------------------------------- |
| Family Survival Guide ($19.99)         | Hidden (coming-soon) | UI shows "Available soon" badge; will go live when PDF is written + Lemon Squeezy set up |
| Appointment Prep Worksheet ($9.99)     | Hidden (coming-soon) | Same; PDF not yet written                                                                |
| Withdrawal Safety Checklist ($9.99)    | Hidden (coming-soon) | Same; PDF not yet written                                                                |
| Treatment Comparison Worksheet ($9.99) | Hidden (coming-soon) | Same; PDF not yet written                                                                |
| Relapse Prevention Plan ($9.99)        | Hidden (coming-soon) | Same; PDF not yet written                                                                |
| Sliding-scale donation                 | Live                 | Stripe donation link live                                                                |

### Email & Subscriptions

| Feature                                      | Status       | Notes                                                                                                 |
| -------------------------------------------- | ------------ | ----------------------------------------------------------------------------------------------------- |
| Newsletter signup (footer + resources page)  | Live         | Adds to MailerLite newsletter group                                                                   |
| Lead magnet — unsafe withdrawal guide (free) | Capture live | MailerLite group connected; email delivery of guide not wired                                         |
| Lead magnet — family guide (free)            | Capture live | MailerLite group connected; email delivery of guide not wired                                         |
| B2B lead magnet                              | Capture live | MailerLite group connected; email delivery not wired                                                  |
| Contact form                                 | Live         | Resend delivery; interest pre-fill from query param                                                   |
| Post-purchase confirmation (`/thank-you`)    | Live         | Two modes: `?type=call` for bookings, default for products; shows next-step CTAs + newsletter section |

### B2B Consulting

| Feature                         | Status | Notes                   |
| ------------------------------- | ------ | ----------------------- |
| Patient-Experience Training     | Live   | Contact form pre-filled |
| Withdrawal Journey Mapping      | Live   | Contact form pre-filled |
| Communication Workshops         | Live   | Contact form pre-filled |
| Dropout / Friction Analysis     | Live   | Contact form pre-filled |
| Patient Education Review        | Live   | Contact form pre-filled |
| Digital Health Startup Advisory | Live   | Contact form pre-filled |

### Infrastructure

| Feature                      | Status | Notes                                                                                                 |
| ---------------------------- | ------ | ----------------------------------------------------------------------------------------------------- |
| Firebase App Hosting backend | Live   | `nextstep-recovery` backend in `us-central1`                                                          |
| Firebase secrets             | Live   | `resend-api-key` and `mailerlite-api-key` set in Secret Manager                                       |
| Production deployment        | Live   | `nextstep-recovery--nextsteprecovery-1d5c2.us-central1.hosted.app` (Firebase-assigned URL)            |
| Custom domain                | Live   | `nextsteprecovery.io` — DNS via Cloudflare (grey-cloud A + CNAME), SSL via Google Certificate Manager |
| Analytics                    | Live   | Cloudflare Web Analytics — auto-injected at edge; no JS snippet needed in codebase                    |

---

## Coming Soon (in codebase, UI shows "coming soon")

| Feature                              | Tier     | Price      | Notes                                            |
| ------------------------------------ | -------- | ---------- | ------------------------------------------------ |
| 60-minute family / navigation call   | Tier 3   | $125–$175  | Calendly event type and Stripe link needed       |
| Two-week navigation package          | Tier 4   | $300–$600  | Scope, pricing, and booking flow to be defined   |
| Sliding-scale / sponsored slots      | Tier 5   | Subsidized | Depends on donation revenue; no booking flow yet |
| Low-cost group workshop for families | Resource | Paid       | Waitlist captured via contact; platform TBD      |

---

## Required Before Launch

These items block a clean launch:

### High priority

- [x] **Upload Firebase secrets** — done; `resend-api-key` and `mailerlite-api-key` set in Firebase Secret Manager
- [x] **Activate Calendly events** — done; availability and meeting location configured
- [x] **Verify Resend sender domain** — `from` now reads `RESEND_FROM_EMAIL` env var (falls back to `onboarding@resend.dev`); set `RESEND_FROM_EMAIL` to a verified domain address in apphosting.yaml / .env.local

### Medium priority

- [x] **Rate limiting** — Next.js middleware in `middleware.ts`; `/api/contact` 5 req/min/IP, `/api/subscribe` 10 req/min/IP; 6 tests passing
- [~] **PDF delivery** — decision made, implementation pending; recommend migrating the 5 paid PDFs to Lemon Squeezy (merchant of record, native file delivery). See [docs/pdf-delivery.md](./pdf-delivery.md).

### Lower priority

- [ ] **Lead magnet email delivery** — free guides are captured in MailerLite but the actual PDF/content is not sent to new subscribers; configure MailerLite automation to send the guide on signup
- [x] **`env.example` updated** — already updated to MailerLite; ConvertKit references removed

---

## Future Feature Ideas

These are not in the codebase but would be natural additions given the site's mission:

### Functionality

- **Intake questionnaire** — short pre-call form (linked from booking confirmation) to gather context before the fit check or support call
- **Testimonials / social proof** — anonymized peer testimonials on the home page or services page
- **Resource search / filter** — as the product catalog grows, filtering by type (guide, worksheet, call) or audience (individual, family, professional)
- **Waitlist management** — email capture for coming-soon services (family call, navigation package) with automated notification when they launch

### Email & Engagement

- **MailerLite automation sequences** — welcome series, post-call follow-up, newsletter cadence
- **Referral tracking** — URL parameters (`?ref=`) to attribute traffic from partner programs
- **Re-engagement campaigns** — for lead magnet subscribers who haven't booked a call

### B2B

- **Case studies page** — anonymized outcomes from program consulting engagements
- **Proposal / scope-of-work template** — downloadable PDF for treatment centers evaluating the consulting services
- **B2B intake form** — structured intake separate from the general contact form (org size, program type, primary challenge)

### Infrastructure

- **Error monitoring** — Sentry or similar for production error capture
- **CI/CD** — `.github/workflows/ci.yml` runs lint, tests, and build on every push and PR to `main`
