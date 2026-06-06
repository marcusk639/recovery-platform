> ⚠️ **Legacy document.** Carried over from the standalone `detox-recovery` repository, archived on 2026-06-06. Historical reference only — may be outdated and is NOT part of current `detox-recovery` documentation.

# Next Step Recovery — Delivery Gaps

**Last updated:** May 2026  
**Source:** Full codebase audit (May 2026)  
**Purpose:** Reference document for everything currently advertised or sold on the site that is not yet fully delivered to the customer.

---

## Overview

Items are organized into three severity tiers based on risk:

| Tier            | Description                                     | Count          | Risk                           |
| --------------- | ----------------------------------------------- | -------------- | ------------------------------ |
| 🔴 **Critical** | Payment collected, nothing delivered            | 5 products     | Refund exposure + trust damage |
| 🟡 **High**     | Email/trust captured, nothing sent              | 3 lead magnets | Conversion funnel broken       |
| 🔵 **Planned**  | Service listed on site, no booking/payment path | 4 services     | Expectation mismatch           |

---

## 🔴 Tier 1 — Paid Products with No Delivery

These five products have live Stripe payment links. A customer can complete checkout and pay real money — and receive nothing in return. **These should be temporarily hidden or replaced with a "pre-order" notice until delivery is implemented.**

---

### 1.1 Family Survival Guide

| Field                | Value                                                                                                                         |
| -------------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| **Listed price**     | $19.99                                                                                                                        |
| **Payment status**   | Live Stripe checkout URL                                                                                                      |
| **Env var**          | `NEXT_PUBLIC_STRIPE_FAMILY_GUIDE_URL`                                                                                         |
| **Listed in**        | `lib/products-data.ts`, `/resources` page                                                                                     |
| **Promise to buyer** | "A practical guide for family members navigating a loved one's withdrawal — what to watch for, what to say, and when to act." |
| **Current delivery** | ❌ None — PDF not authored, no delivery mechanism                                                                             |
| **Fix required**     | 1. Write the guide (PDF) 2. Set up file delivery (Lemon Squeezy, SendOwl, or Stripe webhook → Resend)                         |
| **Effort estimate**  | 4–8 hrs writing + 2 hrs technical setup                                                                                       |
| **Priority**         | Highest — most expensive product                                                                                              |

---

### 1.2 Appointment Preparation Worksheet

| Field                | Value                                                                                                                           |
| -------------------- | ------------------------------------------------------------------------------------------------------------------------------- |
| **Listed price**     | $9.99                                                                                                                           |
| **Payment status**   | Live Stripe checkout URL                                                                                                        |
| **Env var**          | `NEXT_PUBLIC_STRIPE_APPOINTMENT_PREP_URL`                                                                                       |
| **Listed in**        | `lib/products-data.ts`, `/resources` page                                                                                       |
| **Promise to buyer** | "Step-by-step worksheet to prepare for a medical or treatment appointment — questions to ask, history to gather, goals to set." |
| **Current delivery** | ❌ None                                                                                                                         |
| **Fix required**     | 1. Create worksheet (PDF) 2. Wire to delivery system                                                                            |
| **Effort estimate**  | 1–2 hrs writing + shared delivery setup                                                                                         |

---

### 1.3 Withdrawal Safety Checklist

| Field                | Value                                                                                                                |
| -------------------- | -------------------------------------------------------------------------------------------------------------------- |
| **Listed price**     | $9.99                                                                                                                |
| **Payment status**   | Live Stripe checkout URL                                                                                             |
| **Env var**          | `NEXT_PUBLIC_STRIPE_SAFETY_CHECKLIST_URL`                                                                            |
| **Listed in**        | `lib/products-data.ts`, `/resources` page                                                                            |
| **Promise to buyer** | "A structured checklist for assessing withdrawal severity and identifying when professional medical care is needed." |
| **Current delivery** | ❌ None                                                                                                              |
| **Fix required**     | 1. Create checklist (PDF) 2. Wire to delivery system                                                                 |
| **Effort estimate**  | 1–2 hrs writing + shared delivery setup                                                                              |

---

### 1.4 Detox/Treatment Center Comparison Worksheet

| Field                | Value                                                                                                                      |
| -------------------- | -------------------------------------------------------------------------------------------------------------------------- |
| **Listed price**     | $9.99                                                                                                                      |
| **Payment status**   | Live Stripe checkout URL                                                                                                   |
| **Env var**          | `NEXT_PUBLIC_STRIPE_TREATMENT_COMPARISON_URL`                                                                              |
| **Listed in**        | `lib/products-data.ts`, `/resources` page                                                                                  |
| **Promise to buyer** | "Evaluate treatment options side-by-side across key criteria: medical supervision, insurance, availability, and approach." |
| **Current delivery** | ❌ None                                                                                                                    |
| **Fix required**     | 1. Create worksheet (PDF) 2. Wire to delivery system                                                                       |
| **Effort estimate**  | 1–2 hrs writing + shared delivery setup                                                                                    |

---

### 1.5 Post-Withdrawal Relapse-Prevention Planning Worksheet

| Field                | Value                                                                                                                |
| -------------------- | -------------------------------------------------------------------------------------------------------------------- |
| **Listed price**     | $9.99                                                                                                                |
| **Payment status**   | Live Stripe checkout URL                                                                                             |
| **Env var**          | `NEXT_PUBLIC_STRIPE_RELAPSE_PREVENTION_URL`                                                                          |
| **Listed in**        | `lib/products-data.ts`, `/resources` page                                                                            |
| **Promise to buyer** | "A structured planning tool for the first 30–90 days after acute withdrawal — triggers, support, contingency plans." |
| **Current delivery** | ❌ None                                                                                                              |
| **Fix required**     | 1. Create worksheet (PDF) 2. Wire to delivery system                                                                 |
| **Effort estimate**  | 1–2 hrs writing + shared delivery setup                                                                              |

---

### Delivery Implementation Options (all five products share the same path)

**Option A — Lemon Squeezy (Recommended for simplicity)**

- Replace all five Stripe links with Lemon Squeezy product links
- Lemon Squeezy handles: payment, tax, PDF hosting, automatic email delivery
- Setup: ~2 hrs one-time; no custom code
- Cost: 5% + payment processing per transaction
- Migration task: `docs/manual-tasks/2026-05-23-lemon-squeezy-migration.md`

**Option B — Stripe + Resend webhook**

- Keep Stripe links; set up a webhook at `/api/stripe-webhook`
- On `checkout.session.completed`: look up product → send Resend email with PDF link
- PDFs hosted in Firebase Storage or Cloudflare R2
- Setup: ~4–6 hrs development
- Requires secure, time-limited download links

**Interim action (do today):** Until delivery is live, either temporarily hide the five Stripe links or replace them with a "pre-order / ships in [N] days" notice. Do not leave live purchase flows open for products that cannot be delivered.

---

## 🟡 Tier 2 — Lead Magnets with No Delivery

These three lead magnets have functional email capture forms (emails land in MailerLite groups) but no automated delivery. A person who signs up receives nothing — no guide, no confirmation of value, no nurture sequence.

> **Impact:** Every email captured since launch is sitting cold. Subscribers who signed up expecting a guide and received nothing have likely already disengaged.

---

### 2.1 "What to Do When Withdrawal Starts Feeling Unsafe"

| Field                | Value                                                                                                                              |
| -------------------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| **Listed as**        | Free guide (lead magnet)                                                                                                           |
| **Capture form**     | `/resources` page, `LeadMagnetForm` component                                                                                      |
| **Tag on signup**    | `lead-magnet-unsafe`                                                                                                               |
| **MailerLite group** | `MAILERLITE_GROUP_ID_LEAD_MAGNET_UNSAFE` (`188194958591657681`)                                                                    |
| **Promise**          | "A free guide on recognizing danger signs during withdrawal and what to do."                                                       |
| **Current delivery** | ❌ Email captured, nothing sent                                                                                                    |
| **Fix required**     | 1. Write the guide (PDF or email-native) 2. Set up MailerLite automation for this group: trigger → deliver guide → 3-email nurture |
| **Automation plan**  | `docs/manual-tasks/2026-05-23-mailerlite-automation-setup.md`                                                                      |
| **Content priority** | **Highest** — matches highest-intent search queries (SEO gap identified in discovery strategy)                                     |

---

### 2.2 "How to Help Someone in Withdrawal Without Making It Worse"

| Field                | Value                                                                                                              |
| -------------------- | ------------------------------------------------------------------------------------------------------------------ |
| **Listed as**        | Free guide (lead magnet)                                                                                           |
| **Capture form**     | `/resources` page, `LeadMagnetForm` component                                                                      |
| **Tag on signup**    | `lead-magnet-family`                                                                                               |
| **MailerLite group** | `MAILERLITE_GROUP_ID_LEAD_MAGNET_FAMILY` (`188194958890501182`)                                                    |
| **Promise**          | "A free guide for family and friends — how to support without shaming, enabling, or escalating crisis."            |
| **Current delivery** | ❌ Email captured, nothing sent                                                                                    |
| **Fix required**     | 1. Write guide 2. Set up MailerLite automation → deliver → nurture sequence → offer Family Survival Guide ($19.99) |
| **Content priority** | High — family members are higher ARPU and more reachable                                                           |

---

### 2.3 "10 Ways Detox Programs Lose Patient Trust Before Treatment Even Starts"

| Field                | Value                                                                                                                                                        |
| -------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **Listed as**        | B2B lead magnet (consulting page)                                                                                                                            |
| **Capture form**     | `/consulting` page, `B2BLeadMagnet` component                                                                                                                |
| **Tag on signup**    | `lead-magnet-b2b`                                                                                                                                            |
| **MailerLite group** | `MAILERLITE_GROUP_ID_B2B` (`188194959207171446`)                                                                                                             |
| **Promise**          | B2B-positioned guide for treatment center staff and administrators                                                                                           |
| **Current delivery** | ❌ Email captured, nothing sent                                                                                                                              |
| **Fix required**     | 1. Write guide (likely a concise 2–4 page PDF formatted professionally) 2. Set up MailerLite automation → deliver → 3-email B2B nurture → consultation offer |
| **Content priority** | High — directly feeds B2B consulting pipeline                                                                                                                |

---

### Shared Lead Magnet Fix Plan

All three follow the same setup path:

1. **Write the guide** — PDF (1,000–2,500 words) or inline email (easier to start)
2. **Host it** — Upload to MailerLite file manager, Firebase Storage, or Dropbox
3. **Create MailerLite automation** per group:
   - Trigger: subscriber joins group
   - Email 1 (immediate): deliver the guide + short welcome note
   - Email 2 (Day 3): related tip or insight
   - Email 3 (Day 7): CTA to paid product or fit check
4. **Test the flow** before publishing

---

## 🔵 Tier 3 — Services Listed on Site with No Booking or Payment Path

These services appear on the `/services` page with CTAs but have no end-to-end flow. Visitors clicking through reach a dead end (the contact form) rather than a booking or payment experience.

---

### 3.1 60-Minute Family / Navigation Call

| Field                 | Value                                                                                                                                                                                                                                                                                 |
| --------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Listed price**      | $125–$175                                                                                                                                                                                                                                                                             |
| **Status badge**      | Coming soon                                                                                                                                                                                                                                                                           |
| **Current CTA**       | "Plan support for someone you love" → `/contact`                                                                                                                                                                                                                                      |
| **What's missing**    | Calendly event (60-min booking), Stripe payment link, env vars in `apphosting.yaml`                                                                                                                                                                                                   |
| **Build path**        | 1. Create Calendly event type (60-min, Family/Navigation) 2. Create Stripe payment link at $150 (fixed midpoint) 3. Add `NEXT_PUBLIC_CALENDLY_FAMILY_CALL_URL` and `NEXT_PUBLIC_STRIPE_FAMILY_CALL_URL` to `apphosting.yaml` 4. Update `lib/services-data.ts` status to `"available"` |
| **Target launch**     | Month 5–7 (after Tier 2 patterns are established)                                                                                                                                                                                                                                     |
| **Revenue at launch** | +$150 per session; capacity shared with Tier 2                                                                                                                                                                                                                                        |

---

### 3.2 Two-Week Navigation Package

| Field              | Value                                                                                                                                                                                                                        |
| ------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Listed price**   | $300–$600                                                                                                                                                                                                                    |
| **Status badge**   | Coming soon                                                                                                                                                                                                                  |
| **Current CTA**    | "Ask about navigation support" → `/contact`                                                                                                                                                                                  |
| **What's missing** | Scope definition, intake questionnaire, session structure, Stripe payment link, Calendly multi-session setup                                                                                                                 |
| **Build path**     | 1. Define what the package includes (e.g., 3 calls + async check-ins) 2. Set a fixed price ($450 recommended) 3. Create intake form (Typeform or Google Form) 4. Create Stripe payment link 5. Update `lib/services-data.ts` |
| **Target launch**  | Month 14–18 (Year 2) — requires Tier 3 to establish patterns first                                                                                                                                                           |
| **Design note**    | Consider requiring completion of at least 2 Tier 3 calls before selling this package (natural upgrade path)                                                                                                                  |

---

### 3.3 Sliding-Scale / Sponsored Slots

| Field              | Value                                                                                                                                                                                          |
| ------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Listed price**   | Subsidized                                                                                                                                                                                     |
| **Status badge**   | Coming soon                                                                                                                                                                                    |
| **Current CTA**    | "Ask about sliding-scale availability" → `/contact`                                                                                                                                            |
| **What's missing** | Eligibility criteria, funding source, booking flow, application/intake                                                                                                                         |
| **Dependency**     | Donation revenue or external sponsor funding                                                                                                                                                   |
| **Build path**     | 1. Define eligibility criteria (income threshold, substance type, etc.) 2. Establish a simple application via contact form 3. Fund from donations or SAMHSA/state grant funding when available |
| **Target launch**  | Year 2 once donation volume supports 2–4 subsidized slots/month                                                                                                                                |

---

### 3.4 Low-Cost Group Workshop for Families

| Field              | Value                                                                                                                                                                                                                                     |
| ------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Listed price**   | "paid" (no price specified)                                                                                                                                                                                                               |
| **Status badge**   | Waitlist via contact form                                                                                                                                                                                                                 |
| **Current CTA**    | "Join the waitlist" → `/contact`                                                                                                                                                                                                          |
| **What's missing** | Format, price, platform (Zoom/Circle), registration page, payment link, curriculum                                                                                                                                                        |
| **Build path**     | 1. Define format (e.g., 90-minute Zoom, 8–12 participants) 2. Set price ($45–$75/seat) 3. Create registration and payment (Stripe or Lemon Squeezy) 4. Build a simple landing page or Eventbrite listing 5. Update `lib/products-data.ts` |
| **Target launch**  | Month 10–14, when email list supports a minimum viable cohort (50+ subscribers)                                                                                                                                                           |
| **Revenue model**  | 10 participants × $60 = $600/workshop; 2/month = $1,200/month at scale                                                                                                                                                                    |

---

## Infrastructure Gaps That Block Delivery

These are not services but technical issues that affect delivery quality.

| Gap                                        | Impact                                                                                 | Fix                                                                   | Effort               |
| ------------------------------------------ | -------------------------------------------------------------------------------------- | --------------------------------------------------------------------- | -------------------- |
| `apphosting.yaml` line 89: `RUNTIMEi` typo | Newsletter signups may silently fail — subscribers not added to MailerLite             | Change `RUNTIMEi` → `RUNTIME` and redeploy                            | 5 minutes            |
| No post-payment thank-you page             | Customers completing Stripe checkout land on generic Stripe confirmation, not on site  | Create `/thank-you` page; add success URL to each Stripe link         | 1–2 hrs              |
| No analytics (GA4/Plausible/Fathom)        | Can't measure which pages convert, which channels work, or whether fixes are effective | Install Plausible (privacy-respecting, 10-min setup)                  | 30 minutes           |
| No error monitoring (Sentry)               | Production errors silent — broken flows may go undetected                              | Add Sentry Next.js SDK                                                | 1 hr                 |
| Custom domain not wired                    | Site lives at Firebase default URL, not `nextsteprecovery.com`                         | Point DNS to Firebase App Hosting per deployment docs                 | 30 min + propagation |
| No intake questionnaire before calls       | First call starts with no context about the person's situation                         | Add a Typeform or Google Form linked from Calendly confirmation email | 1–2 hrs              |

---

## Recommended Fix Sequence

Ordered by urgency × revenue impact:

| Priority             | Action                                                                                 | Why                                                     |
| -------------------- | -------------------------------------------------------------------------------------- | ------------------------------------------------------- |
| **1 (Today)**        | Fix `apphosting.yaml` typo (`RUNTIMEi`)                                                | Stops active list-building leakage                      |
| **2 (Today)**        | Hide or "pre-order" the 5 Stripe PDF links                                             | Prevents charging for undeliverable products            |
| **3 (Week 1)**       | Write "What to Do When Withdrawal Starts Feeling Unsafe" guide + MailerLite automation | Activates highest-traffic lead magnet; direct SEO match |
| **4 (Week 1)**       | Wire custom domain + install Plausible analytics                                       | Credibility + measurement baseline                      |
| **5 (Week 2)**       | Write "How to Help Someone in Withdrawal" guide + automation                           | Activates family lead magnet funnel                     |
| **6 (Week 2)**       | Write B2B guide + automation                                                           | Activates B2B nurture pipeline                          |
| **7 (Month 1–2)**    | Choose and implement PDF delivery (Lemon Squeezy recommended)                          | Enables re-activation of all 5 paid products            |
| **8 (Month 1)**      | Create `/thank-you` page                                                               | Post-purchase UX; email capture opportunity             |
| **9 (Month 5–7)**    | Launch Tier 3 (60-min family call)                                                     | Next service ladder rung; +$150/call                    |
| **10 (Month 10–14)** | Launch group workshop                                                                  | Scales family revenue beyond 1:1 capacity               |

---

## Content Writing Priority Order

If writing all guides in sequence, prioritize by SEO value + funnel position:

1. **"What to Do When Withdrawal Starts Feeling Unsafe"** — highest-intent search match, used in individual lead magnet
2. **Withdrawal Safety Checklist** ($9.99) — short, high-value, pairs with above
3. **"How to Help Someone in Withdrawal Without Making It Worse"** — family audience, second-highest traffic
4. **Family Survival Guide** ($19.99) — highest-priced product; builds on lead magnet
5. **Appointment Preparation Worksheet** ($9.99) — practical, pairs with support calls
6. **"10 Ways Detox Programs Lose Patient Trust"** — B2B guide; needed for consulting pipeline
7. **Treatment Comparison Worksheet** ($9.99) — useful but lower urgency
8. **Relapse Prevention Planning Worksheet** ($9.99) — useful but later-stage; lower urgency

---

_This document should be reviewed and updated monthly until all items reach "delivered" status. Reference the financial projections document (`docs/financial-projections-2026-05-24.md`) for revenue impact of each fix._
