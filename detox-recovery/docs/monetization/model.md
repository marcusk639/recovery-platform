# Monetization — Next Step Recovery & Broader Ecosystem

**Prepared:** May 2026  
**Scope:** Manual Stripe setup steps + monetization strategy for detox-recovery (nextsteprecovery.io)
and the broader recovery ecosystem (Homegroups, Regroup)

---

## Part 1 — Stripe Manual Setup (detox-recovery)

### 1.1 Current Payment Link Inventory

| Env Var                                       | Status               | Stripe URL                                              |
| --------------------------------------------- | -------------------- | ------------------------------------------------------- |
| `NEXT_PUBLIC_STRIPE_SUPPORT_CALL_URL`         | Active               | `https://buy.stripe.com/14AeVffF2gmCeFI6wi3Nm00`        |
| `NEXT_PUBLIC_STRIPE_DONATION_URL`             | Active               | `https://buy.stripe.com/eVq6oJ50odaqcxAf2O3Nm06`        |
| `NEXT_PUBLIC_STRIPE_FAMILY_GUIDE_URL`         | Hidden (coming-soon) | Archived — migrate to Lemon Squeezy when PDF is written |
| `NEXT_PUBLIC_STRIPE_APPOINTMENT_PREP_URL`     | Hidden (coming-soon) | Archived — migrate to Lemon Squeezy when PDF is written |
| `NEXT_PUBLIC_STRIPE_SAFETY_CHECKLIST_URL`     | Hidden (coming-soon) | Archived — migrate to Lemon Squeezy when PDF is written |
| `NEXT_PUBLIC_STRIPE_TREATMENT_COMPARISON_URL` | Hidden (coming-soon) | Archived — migrate to Lemon Squeezy when PDF is written |
| `NEXT_PUBLIC_STRIPE_RELAPSE_PREVENTION_URL`   | Hidden (coming-soon) | Archived — migrate to Lemon Squeezy when PDF is written |

### 1.2 Success URL Configuration (Do this now)

Both active payment links need their success URL set so buyers land on `/thank-you`.

**Support Call ($50) → `/thank-you?type=call`**

1. Go to [Stripe Dashboard → Payment Links](https://dashboard.stripe.com/payment-links)
2. Find the support call link (`14AeVffF2gmCeFI6wi3Nm00`)
3. Click the link → Edit → Confirmation page → set to:  
   `https://nextsteprecovery.io/thank-you?type=call`
4. Save

**Donation → `/thank-you`**

1. Find the donation link (`eVq6oJ50odaqcxAf2O3Nm06`)
2. Edit → Confirmation page → set to:  
   `https://nextsteprecovery.io/thank-you`
3. Save

### 1.3 Tier 3 — 60-Minute Family Call ($150)

Create this link when Tier 3 launches (target: Q3 2026).

**Steps:**

1. Stripe Dashboard → Payment Links → New payment link
2. Product: "60-Minute Family / Navigation Call"
3. Price: $150 fixed (or $125–$175 flexible if you want customer choice)
4. Confirmation page: `https://nextsteprecovery.io/thank-you?type=call`
5. Copy the resulting `buy.stripe.com/...` URL
6. Add to Firebase App Hosting environment variables:
   - Key: `NEXT_PUBLIC_STRIPE_FAMILY_CALL_URL`
   - Value: the new link
7. Add to `env.example` and `apphosting.yaml` (under `runConfig.environmentVariables`)
8. Update `lib/services-data.ts`: set `ctaHref` for `id: "family-call"` to use the env var
9. Change `status: "coming-soon"` → `"available"` on the family-call service tier
10. Deploy

### 1.4 Tier 4 — Two-Week Navigation Package ($450 mid-point)

Create this link when Tier 4 launches (target: Q2 2027).

**Steps:**

1. Stripe Dashboard → Payment Links → New payment link
2. Product: "Two-Week Navigation Package"
3. Price: use a fixed midpoint ($450) or offer two SKUs ($300 and $600)
4. Confirmation page: `https://nextsteprecovery.io/thank-you?type=call`
5. Add env var: `NEXT_PUBLIC_STRIPE_NAV_PACKAGE_URL`
6. Wire into `lib/services-data.ts` and set `status: "available"`

### 1.5 PDF Products — Stripe → Lemon Squeezy Migration

The 5 PDF Stripe links are currently hidden. Do NOT un-hide them until the PDF is written AND hosted in Lemon Squeezy. The full migration runbook is in `docs/manual-tasks/2026-05-23-lemon-squeezy-migration.md`.

**Migration sequence per product:**

1. Write the PDF
2. Upload to Lemon Squeezy → create product → get checkout URL
3. Replace the `NEXT_PUBLIC_STRIPE_*` env var in Firebase with the Lemon Squeezy URL  
   (or keep the Stripe var but point it at the Lemon Squeezy URL — simpler)
4. Remove `availability: "coming-soon"` from `products-data.ts` for that product
5. Deploy → verify checkout flow → verify delivery email fires

**Do NOT create new Stripe payment links for PDFs.** Lemon Squeezy handles delivery, VAT, and email delivery in one step. Stripe does none of that for digital downloads.

### 1.6 B2B Consulting — Stripe Invoice Flow

B2B engagements are priced at $1,500–$7,500. Do not use payment links for these — use Stripe Invoices.

**Per-engagement steps:**

1. Stripe Dashboard → Invoices → New invoice
2. Customer: create if new (company name, billing email)
3. Line items: engagement description + agreed price
4. Payment due: net-7 or due on receipt
5. Send invoice — Stripe sends a payment page link
6. Optional: attach a PDF scope-of-work to the invoice as a memo

**No code changes needed** — B2B billing is entirely manual.

### 1.7 Stripe Radar / Fraud Rules

For a solo practice processing low volumes, default Stripe Radar rules are sufficient. No custom rules needed at this stage.

### 1.8 Tax Configuration

1. Stripe Dashboard → Settings → Tax
2. Enable Stripe Tax (automatic tax calculation)
3. Set your business address (used to determine your nexus)
4. For digital products (PDFs): mark products as "digital goods" — this affects EU VAT rules
5. For services (calls): mark as "services" — different tax treatment
6. Review annually as you add states/countries

---

## Part 2 — Next Step Recovery Monetization Strategy

### 2.1 Revenue Architecture

```
Free Fit Check (lead gen)
        ↓
30-min Support Call @ $50  ← primary revenue today
        ↓
60-min Family Call @ $150  ← Q3 2026
        ↓
2-week Nav Package @ $450  ← Q2 2027
        ↑
Digital Products ($9.99–$19.99) ← passive, compound over time
        ↑
B2B Consulting ($1,500–$7,500) ← high-value, low-volume
        ↑
Donations (subsidize sliding-scale slots)
```

### 2.2 Near-Term Revenue Unlock Sequence

**Month 1–2: Content unblock**

- Write both lead magnets → activate email automations → start list compounding
- Every subscriber is a future buyer of calls and PDFs

**Month 3–4: PDF launch**

- Write 2–3 PDFs → publish via Lemon Squeezy → flip coming-soon → passive revenue begins
- Target: $100–$300/month from PDFs by end of Month 6

**Month 5–7: Tier 3 launch**

- Family call at $150 doubles ARPU for a segment of buyers
- Single Tier 3 call per week = $600/month incremental

**Month 8+: B2B pipeline**

- Warm outreach to treatment centers + recovery startups
- One engagement ($3,500 avg) per quarter = $14,000/year incremental

### 2.3 Capacity Ceiling and Pricing Levers

At 5 paid calls/week, maximum call revenue is:

- **All Tier 2:** 20 calls × $50 = $1,000/month
- **Mixed Tier 2/3:** 10 × $50 + 10 × $150 = $2,000/month
- **All Tier 3:** 20 calls × $150 = $3,000/month

When capacity fills, raise prices first — do not hire before $5K/month MRR.

### 2.4 B2B Monetization Detail

**Target buyers:**

| Buyer Type            | Entry Point                      | Ask              |
| --------------------- | -------------------------------- | ---------------- |
| Detox center / IOP    | Patient-experience training      | $1,500–$3,000    |
| Hospital SUD unit     | Journey mapping + staff training | $3,000–$5,000    |
| Recovery startup      | Product advisory (ongoing)       | $1,500–$3,500/mo |
| Behavioral health org | Communication workshops          | $2,000–$4,000    |

**Sales motion:** Direct outreach → fit call → scoped proposal → Stripe invoice.  
No marketing spend required until Year 2.

### 2.5 Year 2+ — Medicaid Billing (Decision Point)

If you pursue Medicaid billing (peer support specialist certification):

- Reimbursement varies by state ($8–$25/15 min)
- Requires state-specific certification and NPI registration
- Enables group programs (up to 10 clients/hour)
- High administrative overhead — evaluate only if volume justifies

**Recommendation:** Defer until Year 2 MRR > $3,000/month and you have a VA handling admin.

---

## Part 3 — Homegroups (App) Monetization

### 3.1 Product Context

Homegroups is a peer support app for AA/NA/SMART homegroup tracking — meeting attendance, step work logging, sponsor relationships, group communication.

### 3.2 Revenue Model

**Freemium + Institutional B2B**

| Tier          | Audience           | Price              | What's included                                     |
| ------------- | ------------------ | ------------------ | --------------------------------------------------- |
| Free          | Individual members | $0                 | Attendance tracking, group join, basic step logging |
| Premium       | Power users        | $4.99/mo or $39/yr | Advanced step work, sponsor tools, meeting export   |
| Group/Org     | Homegroup officers | $9.99/mo           | Group management, attendance reports, announcements |
| Institutional | Treatment programs | $150–$500/mo       | Multi-group management, alumni tracking, reporting  |

### 3.3 Monetization Sequencing

1. **Launch free tier** — maximum adoption, prove utility, build network effects
2. **Gate premium features** — once DAU > 500, introduce individual premium
3. **Pitch treatment programs** — the institutional tier is the high-value play; treatment centers want alumni engagement data
4. **Homegroups as Next Step Recovery referral engine** — users in crisis get directed to nextsteprecovery.io for support calls; creates cross-product revenue

### 3.4 Stripe Setup for Homegroups

- **Individual subscriptions:** Stripe Checkout with `mode: "subscription"` — this requires the Stripe JS SDK (not just payment links)
- **Institutional billing:** Stripe invoices (same as Next Step Recovery B2B)
- **Apple/Google In-App Purchase:** Required for iOS/Android app stores — Stripe cannot process payments inside native apps; use RevenueCat as the subscription management layer

### 3.5 RevenueCat Integration (Required for Mobile)

RevenueCat unifies App Store, Play Store, and Stripe billing into one API. Setup:

1. Create RevenueCat account, add app
2. Wire App Store Connect and Google Play Console API keys
3. Define entitlements (e.g., "premium") and offerings (monthly, annual)
4. Replace direct Stripe calls with RevenueCat SDK in Regroup
5. Use RevenueCat webhooks to update user entitlement state in your backend

---

## Part 4 — Regroup (Sober Living App) Monetization

### 4.1 Product Context

Regroup is a sober living house management app — resident tracking, chore scheduling, house rules, accountability check-ins, house manager tools.

### 4.2 Revenue Model

**B2B SaaS — sober living operators are the customer**

| Tier        | Target                          | Price        | What's included                                           |
| ----------- | ------------------------------- | ------------ | --------------------------------------------------------- |
| House       | Single sober living house       | $49–$99/mo   | Up to 12 residents, check-ins, chore board, announcements |
| Multi-house | Operators with 2–5 houses       | $149–$249/mo | Multi-house dashboard, cross-house reporting              |
| Network     | Recovery housing networks       | $499+/mo     | Unlimited houses, compliance reporting, API access        |
| Resident    | Individual residents (optional) | $4.99/mo     | Personal accountability dashboard, alumni network         |

**Key insight:** The operator pays, not the resident. Residents get free access (or cheap add-on). This removes the pricing barrier at the most vulnerable moment.

### 4.3 Stripe Setup for Regroup

- **Operator subscriptions:** Stripe Checkout with `mode: "subscription"`, monthly billing, metered by house count
- **Trial:** 30-day free trial (Stripe trial_period_days: 30) — operator proves value before paying
- **Stripe Customer Portal:** Enable so operators can self-manage billing, pause/cancel without support tickets
- **Env vars needed:** `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, price IDs for each tier

### 4.4 Go-To-Market

- Direct outreach to sober living operators (Oxford Houses, state-certified facilities)
- Integration with state Oxford House chapter directories
- **Cross-product gate:** Once Regroup has 10+ houses, pitch Next Step Recovery consulting to those programs

---

## Part 5 — regroup-web + regroup-functions Monetization

### 5.1 Product Context

`regroup-web` is the web companion to Regroup — house manager dashboard, resident portal. `regroup-functions` is the Firebase Cloud Functions backend serving both Regroup and regroup-web.

### 5.2 Revenue Model

**regroup-web and regroup-functions are infrastructure, not separate products.** They serve the same operator and resident customers as Regroup. Monetization is entirely through Regroup's Stripe subscriptions.

There is no separate billing surface for regroup-web or regroup-functions.

### 5.3 Cost Structure to Monitor

As users scale, watch Firebase costs:

- Firestore reads/writes (free tier: 50K reads/day, 20K writes/day)
- Cloud Functions invocations (2M free/month)
- Storage (5GB free)
- At 100 paying houses (~1,200 residents), Firebase costs should be < $50/month

### 5.4 Potential Future Revenue — API Access

At scale (50+ houses), there is an enterprise opportunity:

- Expose compliance reporting API to state housing authorities or insurance companies
- Charge for API access ($500–$2,000/month per integration)
- This is a Year 3+ play — do not architect for it now

---

## Part 6 — Cross-Ecosystem Flywheel

```
nextsteprecovery.io
(withdrawal support → treatment navigation)
         ↓  refers to sober living
    Regroup / regroup-web
(sober living management)
         ↓  residents join homegroups
    Homegroups
(peer support community)
         ↑  members in crisis contact
nextsteprecovery.io
```

### 6.1 Referral Flow

| From                    | To                            | Trigger                                       | Revenue impact                 |
| ----------------------- | ----------------------------- | --------------------------------------------- | ------------------------------ |
| nextsteprecovery.io     | Regroup                   | Client needs sober living after detox         | New operator lead for Regroup  |
| Regroup             | nextsteprecovery.io           | Resident in crisis / needs withdrawal support | New support call booking       |
| Homegroups         | nextsteprecovery.io           | Member relapse risk / family in crisis        | New fit check → support call   |
| nextsteprecovery.io B2B | Homegroups Institutional | Consulting client wants peer-support tools    | New institutional subscription |

### 6.2 Sequencing for Maximum Flywheel Impact

1. **nextsteprecovery.io first** — live, generating revenue, proving the model (done)
2. **Homegroups pilot** — Oxford house pilot creates testimonials + referral channel
3. **Regroup launch** — operator-facing B2B SaaS, compounding with Oxford pilot network
4. **B2B consulting cross-sell** — once consulting has 3+ treatment center clients, offer Regroup as their sober living management tool (package deal)
5. **Institutional tier** — Homegroups + Regroup sold together to treatment programs as a post-discharge continuity package

### 6.3 Shared Infrastructure Investments

These investments benefit all products and should be built once:

- **Shared identity / auth** — single user account across nextsteprecovery.io, Homegroups, and Regroup (Firebase Auth already used in regroup-functions; extend to web)
- **Notification service** — regroup-functions already has FCM; expose as a shared service
- **Analytics pipeline** — single event schema (user_id, product, event, properties) feeding one analytics tool — avoids rebuilding dashboards per product

### 6.4 Revenue Summary at Ecosystem Scale (Year 3 targets)

| Product             | Model                    | Target MRR          |
| ------------------- | ------------------------ | ------------------- |
| nextsteprecovery.io | Service + digital + B2B  | $3,000–$8,000       |
| Homegroups     | Freemium + institutional | $2,000–$5,000       |
| Regroup / web   | B2B SaaS                 | $5,000–$15,000      |
| **Ecosystem total** |                          | **$10,000–$28,000** |

At $10K+ MRR across all products, the ecosystem is self-sustaining and fundable.

---

## Appendix — Stripe Environment Variables Reference

### detox-recovery (nextsteprecovery.io)

| Variable                                      | Purpose                              | Where set                |
| --------------------------------------------- | ------------------------------------ | ------------------------ |
| `NEXT_PUBLIC_STRIPE_SUPPORT_CALL_URL`         | 30-min call payment link             | Firebase App Hosting env |
| `NEXT_PUBLIC_STRIPE_DONATION_URL`             | Donation link                        | Firebase App Hosting env |
| `NEXT_PUBLIC_STRIPE_FAMILY_CALL_URL`          | 60-min call (create when ready)      | Firebase App Hosting env |
| `NEXT_PUBLIC_STRIPE_NAV_PACKAGE_URL`          | 2-week package (Year 2)              | Firebase App Hosting env |
| `NEXT_PUBLIC_STRIPE_FAMILY_GUIDE_URL`         | PDF → replace with Lemon Squeezy URL | Firebase App Hosting env |
| `NEXT_PUBLIC_STRIPE_APPOINTMENT_PREP_URL`     | PDF → replace with Lemon Squeezy URL | Firebase App Hosting env |
| `NEXT_PUBLIC_STRIPE_SAFETY_CHECKLIST_URL`     | PDF → replace with Lemon Squeezy URL | Firebase App Hosting env |
| `NEXT_PUBLIC_STRIPE_TREATMENT_COMPARISON_URL` | PDF → replace with Lemon Squeezy URL | Firebase App Hosting env |
| `NEXT_PUBLIC_STRIPE_RELAPSE_PREVENTION_URL`   | PDF → replace with Lemon Squeezy URL | Firebase App Hosting env |

### Regroup / regroup-web (when implemented)

| Variable                          | Purpose                                |
| --------------------------------- | -------------------------------------- |
| `STRIPE_SECRET_KEY`               | Server-side Stripe operations          |
| `STRIPE_WEBHOOK_SECRET`           | Validate Stripe webhook events         |
| `STRIPE_PRICE_HOUSE_MONTHLY`      | Price ID for single-house monthly plan |
| `STRIPE_PRICE_MULTIHOUSE_MONTHLY` | Price ID for multi-house plan          |
| `STRIPE_PRICE_NETWORK_MONTHLY`    | Price ID for network plan              |
| `REVENUECAT_API_KEY`              | Mobile subscription management         |
