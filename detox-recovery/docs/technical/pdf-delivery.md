# PDF Delivery — Decision Doc

**Status:** Decision made, implementation pending
**Author:** Implementer (Task #3)
**Date:** 2026-05-23

## Problem

The site sells 5 paid digital products via Stripe Payment Links:

| Product                                 | Price  | Env var                                       |
| --------------------------------------- | ------ | --------------------------------------------- |
| Family Survival Guide                   | $19.99 | `NEXT_PUBLIC_STRIPE_FAMILY_GUIDE_URL`         |
| Appointment Prep Worksheet              | $9.99  | `NEXT_PUBLIC_STRIPE_APPOINTMENT_PREP_URL`     |
| Withdrawal Safety Checklist             | $9.99  | `NEXT_PUBLIC_STRIPE_SAFETY_CHECKLIST_URL`     |
| Treatment Comparison Worksheet          | $9.99  | `NEXT_PUBLIC_STRIPE_TREATMENT_COMPARISON_URL` |
| Post-Withdrawal Relapse-Prevention Plan | $9.99  | `NEXT_PUBLIC_STRIPE_RELAPSE_PREVENTION_URL`   |

Stripe collects payment, but the customer never receives the PDF. The buyer
gets a Stripe receipt and nothing else.

## Options considered

### Option A — Stripe webhook + Resend + Firebase Storage

Build a `/api/webhooks/stripe` endpoint that listens for
`checkout.session.completed`, looks up which PDF was purchased by `price_id`,
generates a time-limited signed URL from Firebase Storage, and emails it to
the buyer via Resend.

**Pros**

- Keeps payment processing on Stripe (consistent with the support-call flow)
- No new vendor account or per-transaction fees beyond Stripe's
- Full control over email content, branding, and delivery cadence

**Cons**

- Net-new code: webhook handler, signature verification, price→file mapping,
  signed-URL generation, retry/replay handling
- Adds `stripe` npm package (currently not a dependency) → bundle size and
  one more package to keep patched
- Adds a new secret (`STRIPE_WEBHOOK_SECRET`) to Firebase Secret Manager
- Need to host the PDFs — most likely Firebase Storage with a private bucket
  and signed-URL generation. Requires `firebase-admin` SDK + service account
  credentials in the runtime
- Need to handle sales-tax/VAT compliance ourselves (US/EU digital-goods rules)
- More moving parts → more failure modes → more on-call surface area for a
  small, mission-driven site

### Option B — Migrate paid PDFs to Lemon Squeezy

Recreate the 5 paid products on [Lemon Squeezy](https://www.lemonsqueezy.com/).
The platform handles checkout, file delivery, license keys (if ever needed),
and is a **merchant of record** — it collects and remits VAT/sales tax for
digital goods globally on our behalf. Customer pays → Lemon Squeezy emails the
file. Done.

Replace the 5 `NEXT_PUBLIC_STRIPE_*` URLs with `NEXT_PUBLIC_LEMONSQUEEZY_*`
URLs. The Stripe support-call payment link stays untouched.

**Pros**

- Zero new code in the repo — only env var swaps in
  `apphosting.yaml` + `env.example` and an update to `lib/products-data.ts`
- Merchant of record → no sales-tax/VAT bookkeeping for us
- Native PDF delivery is battle-tested (this is their core product, not an
  extension)
- Receipts, refunds, dispute handling, and resend-download-link flows all
  built in
- No new secrets to rotate
- No `firebase-admin`, no `stripe` SDK, no storage bucket to configure

**Cons**

- New vendor account to set up and pay (Lemon Squeezy fee: 5% + $0.50 per
  transaction, vs. Stripe's 2.9% + $0.30 — modest difference at this price
  point: ~$0.40 more on a $19.99 sale)
- Split-stack: Stripe for the support-call service + Lemon Squeezy for digital
  downloads. This is actually a clean separation by product type
- Different checkout UX (Lemon Squeezy hosted page vs. Stripe hosted page) —
  both are clean, conversion-comparable
- The 5 existing Stripe payment links become unused (no cost to leave them;
  can be archived in the Stripe dashboard)

## Recommendation: **Option B — Lemon Squeezy**

For this site's scale (low-volume, mission-driven, single maintainer) and
product mix (5 static PDF files), **the marginal Stripe fee savings are
outweighed by Option A's ongoing maintenance burden** (webhook secret
rotation, Firebase Storage signed-URL generation, sales-tax compliance,
`stripe` + `firebase-admin` SDK upgrades, and the test surface for the
webhook handler itself).

Option B gets paid PDFs delivering to customers in a single afternoon.
Option A is a real engineering project (estimated 1–2 days end-to-end
including PDF authoring, hosting setup, webhook tests, and Stripe dashboard
configuration).

**Lemon Squeezy is chosen over Gumroad** because:

- Cleaner checkout (no upsell/cross-promo against unrelated indie products)
- Better tax handling for international buyers
- More professional brand fit for a healthcare-adjacent site

## Migration steps (Option B)

### 1. Create the Lemon Squeezy store

1. Sign up at [app.lemonsqueezy.com](https://app.lemonsqueezy.com)
2. Create a store: "Next Step Recovery" (or matching brand name)
3. Verify the merchant account (business details, payout bank)
4. Upload the 5 PDF files in **Products → New Product → Digital file**

   | Lemon Squeezy product          | Price  | File to upload                             |
   | ------------------------------ | ------ | ------------------------------------------ |
   | Family Survival Guide          | $19.99 | `family-survival-guide.pdf` _(TODO)_       |
   | Appointment Prep Worksheet     | $9.99  | `appointment-prep.pdf` _(TODO)_            |
   | Withdrawal Safety Checklist    | $9.99  | `withdrawal-safety-checklist.pdf` _(TODO)_ |
   | Treatment Comparison Worksheet | $9.99  | `treatment-comparison.pdf` _(TODO)_        |
   | Relapse-Prevention Plan        | $9.99  | `relapse-prevention-plan.pdf` _(TODO)_     |

   > **Blocker:** The PDF files themselves still need to be authored. This
   > is out of scope for this engineering task and tracked separately.

5. For each product, copy the **Buy now link** from Share → Buy link.

### 2. Replace env vars

In `env.example` and `apphosting.yaml`, replace:

```diff
- NEXT_PUBLIC_STRIPE_FAMILY_GUIDE_URL=https://buy.stripe.com/REPLACE
- NEXT_PUBLIC_STRIPE_APPOINTMENT_PREP_URL=https://buy.stripe.com/REPLACE
- NEXT_PUBLIC_STRIPE_SAFETY_CHECKLIST_URL=https://buy.stripe.com/REPLACE
- NEXT_PUBLIC_STRIPE_TREATMENT_COMPARISON_URL=https://buy.stripe.com/REPLACE
- NEXT_PUBLIC_STRIPE_RELAPSE_PREVENTION_URL=https://buy.stripe.com/REPLACE
+ NEXT_PUBLIC_LEMONSQUEEZY_FAMILY_GUIDE_URL=https://nextsteprecovery.lemonsqueezy.com/buy/REPLACE
+ NEXT_PUBLIC_LEMONSQUEEZY_APPOINTMENT_PREP_URL=https://nextsteprecovery.lemonsqueezy.com/buy/REPLACE
+ NEXT_PUBLIC_LEMONSQUEEZY_SAFETY_CHECKLIST_URL=https://nextsteprecovery.lemonsqueezy.com/buy/REPLACE
+ NEXT_PUBLIC_LEMONSQUEEZY_TREATMENT_COMPARISON_URL=https://nextsteprecovery.lemonsqueezy.com/buy/REPLACE
+ NEXT_PUBLIC_LEMONSQUEEZY_RELAPSE_PREVENTION_URL=https://nextsteprecovery.lemonsqueezy.com/buy/REPLACE
```

Keep `NEXT_PUBLIC_STRIPE_SUPPORT_CALL_URL` and
`NEXT_PUBLIC_STRIPE_DONATION_URL` — those are not file deliveries and stay on
Stripe.

### 3. Update `lib/products-data.ts`

Swap the env var references on the 5 affected `PRODUCTS` entries — the
`ctaHref` line of each, no other structural changes. Example:

```diff
- ctaHref: process.env.NEXT_PUBLIC_STRIPE_FAMILY_GUIDE_URL ?? "#",
+ ctaHref: process.env.NEXT_PUBLIC_LEMONSQUEEZY_FAMILY_GUIDE_URL ?? "#",
```

### 4. Update setup script (if applicable)

`npm run setup:env` pre-fills Stripe URLs — update the script to prompt for
Lemon Squeezy URLs for the 5 products instead. (Out of scope for this task;
flag for follow-up.)

### 5. Archive the old Stripe payment links

In the Stripe dashboard → Payment Links → archive the 5 product links so
they're no longer reachable. The `NEXT_PUBLIC_STRIPE_*` env vars in App
Hosting can be removed in the same deploy.

### 6. Smoke test

For each product page, click the CTA → confirm Lemon Squeezy checkout opens
→ complete a $0.50 test purchase (Lemon Squeezy test mode) → confirm the
delivery email arrives with the correct PDF attachment/download link.

### 7. Update docs

- `docs/features.md` — flip the 5 PDF-delivery rows from
  "Live (payment only)" to "Live"
- `docs/environment.md` — replace the 5 Stripe vars with Lemon Squeezy vars
- `README.md` — if it lists Stripe-only payments, mention Lemon Squeezy as
  the digital-product processor

## Estimated effort (Option B)

| Step                                                            | Time                                     |
| --------------------------------------------------------------- | ---------------------------------------- |
| Sign up + verify Lemon Squeezy store                            | 30 min                                   |
| Create 5 products + upload PDFs                                 | 45 min (assuming PDFs already authored)  |
| Update `env.example`, `apphosting.yaml`, `lib/products-data.ts` | 20 min                                   |
| Deploy + smoke test all 5 products                              | 30 min                                   |
| Update docs (`features.md`, `environment.md`)                   | 15 min                                   |
| **Total**                                                       | **~2.5 hours** (excluding PDF authoring) |

**Blocker:** the PDFs themselves need to be authored before any delivery
mechanism — Option A or B — can be wired end-to-end.

---

## Appendix: Option A scaffold (fallback reference)

If the team rejects Option B and wants to keep delivery in-house, here is
the intended structure for `app/api/webhooks/stripe/route.ts`. **Not
implemented** — included for reference. Would also require:

- `npm install stripe`
- `STRIPE_WEBHOOK_SECRET` in `apphosting.yaml` (via Firebase Secret Manager)
- A `PRICE_ID_TO_PRODUCT` map keyed by Stripe Price IDs
- Firebase Storage bucket with the 5 PDFs uploaded
- `firebase-admin` SDK + service account for signed-URL generation
- A new Resend email template for delivery

```typescript
// app/api/webhooks/stripe/route.ts
//
// import Stripe from "stripe"; // requires: npm install stripe
// import { Resend } from "resend";
import { NextResponse } from "next/server";

// Stripe webhooks must read the raw request body to verify the signature.
// Disable Next.js's default body parsing.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// TODO: when `stripe` is installed, instantiate the client:
// const stripe = new Stripe(process.env.STRIPE_SECRET_KEY ?? "", {
//   apiVersion: "2024-06-20",
// });

// TODO: map Stripe Price IDs → PDF metadata
// const PRICE_ID_TO_PRODUCT: Record<string, { name: string; storagePath: string }> = {
//   "price_xxx_family_guide": { name: "Family Survival Guide", storagePath: "pdfs/family-survival-guide.pdf" },
//   // ...4 more
// };

export async function POST(req: Request): Promise<Response> {
  const signature = req.headers.get("stripe-signature");
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;

  if (!signature || !webhookSecret) {
    return NextResponse.json(
      { error: "Missing signature or webhook secret" },
      { status: 400 },
    );
  }

  // Stripe requires the raw bytes for signature verification
  const rawBody = await req.text();

  // TODO: verify signature
  // let event: Stripe.Event;
  // try {
  //   event = stripe.webhooks.constructEvent(rawBody, signature, webhookSecret);
  // } catch (err) {
  //   console.error("[stripe-webhook] invalid signature:", err);
  //   return NextResponse.json({ error: "Invalid signature" }, { status: 400 });
  // }

  // TODO: handle event.type === "checkout.session.completed"
  // - retrieve line items from event.data.object
  // - look up PRICE_ID_TO_PRODUCT mapping
  // - generate signed URL from Firebase Storage (firebase-admin)
  // - email link to event.data.object.customer_details.email via Resend
  // - return 200 even on partial failure to avoid Stripe retry loops, but log

  return NextResponse.json({ received: true });
}
```

Estimated effort for Option A: **8–12 hours** (scaffold + Firebase Storage
setup + signed-URL generation + Resend template + price ID mapping + tests
for signature verification, idempotency, and email delivery).
