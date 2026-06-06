> ⚠️ **Legacy document.** Carried over from the standalone `detox-recovery` repository, archived on 2026-06-06. Historical reference only — may be outdated and is NOT part of current `detox-recovery` documentation.

# PDF Delivery — Lemon Squeezy Migration

> **Date:** 2026-05-23
> **Author:** Claude Code (review before following)
> **Estimated time:** 2.5–3 hours (excluding PDF authoring)
> **Risk level:** Low — all changes are reversible; existing Stripe support-call and donation links are untouched

## Context

The site sells 5 paid digital products via Stripe Payment Links, but customers never receive their PDFs after purchase — Stripe collects payment and that's it. The decision was made to migrate the 5 PDF products from Stripe to Lemon Squeezy, which handles checkout, tax compliance, and file delivery natively. The support-call Stripe link and donation Stripe link stay on Stripe.

This runbook covers: creating the Lemon Squeezy store, uploading the 5 PDFs, updating the 4 code files that reference the old Stripe env vars, deploying, smoke testing, and cleaning up the old Stripe links.

## Prerequisites

Before starting, confirm:

- [ ] All 5 PDFs have been authored and are saved locally as files
  - `family-survival-guide.pdf`
  - `appointment-prep-worksheet.pdf`
  - `withdrawal-safety-checklist.pdf`
  - `treatment-comparison-worksheet.pdf`
  - `relapse-prevention-plan.pdf`
- [ ] You have an email address available for the Lemon Squeezy account
- [ ] You have bank/payout details ready for merchant verification (routing number, account number)
- [ ] You have access to the Firebase App Hosting console (`firebase login` works)
- [ ] The codebase builds locally (`npm run build` passes)

> **Note:** If the PDFs are not yet authored, stop here. The Lemon Squeezy products cannot be created without files to upload, and the env vars cannot be filled without product URLs.

---

## Steps

### Phase 1 — Lemon Squeezy Setup

---

### 1. Create a Lemon Squeezy account

**Where:** https://app.lemonsqueezy.com/register

1. Navigate to https://app.lemonsqueezy.com/register
2. Fill in your name, email, and a password, then click **Create account**
3. Verify your email address via the confirmation email
4. Log in to the Lemon Squeezy dashboard

**Expected result:** You land on the Lemon Squeezy dashboard at `app.lemonsqueezy.com/dashboard`

---

### 2. Create and configure your store

**Where:** Lemon Squeezy dashboard → **Stores** (top-left menu) → **Create store**

1. Click **Create store** (or it may prompt automatically on first login)
2. Fill in:
   - **Store name:** `Next Step Recovery`
   - **Store slug:** `nextsteprecovery` (this becomes part of your checkout URLs: `nextsteprecovery.lemonsqueezy.com`)
   - **Country:** United States (or your country)
   - **Currency:** USD
3. Click **Create store**

**Expected result:** Your store is created. Dashboard now shows the store name "Next Step Recovery" in the top-left.

---

### 3. Verify your merchant account (required for payouts)

**Where:** Lemon Squeezy dashboard → **Settings** → **Payouts**

1. Click your store name in the top-left → **Settings** → **Payouts**
2. Click **Add payout method**
3. Fill in your bank account or PayPal details as prompted
4. Complete any identity verification steps Lemon Squeezy requires (may include business details or government ID)

**Expected result:** Payout method shows as "Verified" or "Pending verification". Lemon Squeezy will email you when verification is complete — this can take 1–2 business days but does not block creating products or test purchases.

---

### 4. Enable Test Mode

**Where:** Lemon Squeezy dashboard → toggle in the top navigation bar

1. Look for the **Test Mode** toggle in the top bar (it may say "Live" with a toggle switch)
2. Click it to switch to **Test Mode**
3. Confirm the bar turns orange/yellow — this indicates test mode is active

You will create all 5 products in test mode first, verify delivery works, then switch to live mode.

**Expected result:** Dashboard shows an orange "Test Mode" banner. All test transactions are free and no real money moves.

---

### 5. Create the 5 digital products

**Where:** Lemon Squeezy dashboard → **Products** → **New product**

Repeat the following steps for each of the 5 products. Details for each product are in the table at the bottom of this step.

**For each product:**

1. Click **Products** in the left sidebar → **New product**
2. Click **Digital product** (not physical)
3. Fill in:
   - **Name:** _(see table below)_
   - **Description:** _(see table below — optional but recommended)_
4. Click **Add files** and upload the corresponding PDF
5. Click **Pricing** and set:
   - **Price:** _(see table below)_
   - **Payment type:** One-time payment
6. Click **Save product**
7. On the product page that opens, click **Share** → **Buy link**
8. Copy the buy link — it will look like `https://nextsteprecovery.lemonsqueezy.com/buy/xxxxxxxx`
9. Paste the link into the tracking table below

| Product                                               | PDF file                             | Price  | Env var to set                                      | Buy link (fill in) |
| ----------------------------------------------------- | ------------------------------------ | ------ | --------------------------------------------------- | ------------------ |
| Family Survival Guide                                 | `family-survival-guide.pdf`          | $19.99 | `NEXT_PUBLIC_LEMONSQUEEZY_FAMILY_GUIDE_URL`         |                    |
| Appointment Preparation Worksheet                     | `appointment-prep-worksheet.pdf`     | $9.99  | `NEXT_PUBLIC_LEMONSQUEEZY_APPOINTMENT_PREP_URL`     |                    |
| Withdrawal Safety Checklist                           | `withdrawal-safety-checklist.pdf`    | $9.99  | `NEXT_PUBLIC_LEMONSQUEEZY_SAFETY_CHECKLIST_URL`     |                    |
| Detox/Treatment Center Comparison Worksheet           | `treatment-comparison-worksheet.pdf` | $9.99  | `NEXT_PUBLIC_LEMONSQUEEZY_TREATMENT_COMPARISON_URL` |                    |
| Post-Withdrawal Relapse-Prevention Planning Worksheet | `relapse-prevention-plan.pdf`        | $9.99  | `NEXT_PUBLIC_LEMONSQUEEZY_RELAPSE_PREVENTION_URL`   |                    |

**Expected result:** 5 products exist in your Lemon Squeezy store. You have 5 buy links copied.

---

### 6. Test one purchase end-to-end in test mode

**Where:** Your browser — use the buy link from one product

1. Open the buy link for the Family Survival Guide (the most expensive — worth confirming first)
2. Lemon Squeezy checkout opens. Use test card details:
   - **Card number:** `4242 4242 4242 4242`
   - **Expiry:** any future date (e.g. `12/30`)
   - **CVC:** any 3 digits (e.g. `123`)
   - **Email:** your email address
3. Complete the purchase
4. Confirm you receive an email from Lemon Squeezy with a download link or attachment
5. Confirm the PDF is accessible

**Expected result:** Delivery email arrives within 2 minutes. PDF opens and is the correct file.

---

### Phase 2 — Code Changes

You now have 5 Lemon Squeezy buy links. Do not proceed until all 5 are filled in the table above.

---

### 7. Update `env.example`

**Where:** `env.example` at the project root — open in your editor

Find the Stripe PDF payment link section (lines beginning `NEXT_PUBLIC_STRIPE_FAMILY_GUIDE_URL` through `NEXT_PUBLIC_STRIPE_RELAPSE_PREVENTION_URL`) and replace it:

```diff
 # Stripe Payment Links — copy from Stripe dashboard → Payment Links
 # (pre-filled automatically by: npm run setup:env)
 NEXT_PUBLIC_STRIPE_SUPPORT_CALL_URL=https://buy.stripe.com/REPLACE
-NEXT_PUBLIC_STRIPE_FAMILY_GUIDE_URL=https://buy.stripe.com/REPLACE
-NEXT_PUBLIC_STRIPE_APPOINTMENT_PREP_URL=https://buy.stripe.com/REPLACE
-NEXT_PUBLIC_STRIPE_SAFETY_CHECKLIST_URL=https://buy.stripe.com/REPLACE
-NEXT_PUBLIC_STRIPE_TREATMENT_COMPARISON_URL=https://buy.stripe.com/REPLACE
-NEXT_PUBLIC_STRIPE_RELAPSE_PREVENTION_URL=https://buy.stripe.com/REPLACE
 NEXT_PUBLIC_STRIPE_DONATION_URL=https://buy.stripe.com/REPLACE
+
+# Lemon Squeezy — paid PDF products (copy buy links from lemonsqueezy.com dashboard)
+NEXT_PUBLIC_LEMONSQUEEZY_FAMILY_GUIDE_URL=https://nextsteprecovery.lemonsqueezy.com/buy/REPLACE
+NEXT_PUBLIC_LEMONSQUEEZY_APPOINTMENT_PREP_URL=https://nextsteprecovery.lemonsqueezy.com/buy/REPLACE
+NEXT_PUBLIC_LEMONSQUEEZY_SAFETY_CHECKLIST_URL=https://nextsteprecovery.lemonsqueezy.com/buy/REPLACE
+NEXT_PUBLIC_LEMONSQUEEZY_TREATMENT_COMPARISON_URL=https://nextsteprecovery.lemonsqueezy.com/buy/REPLACE
+NEXT_PUBLIC_LEMONSQUEEZY_RELAPSE_PREVENTION_URL=https://nextsteprecovery.lemonsqueezy.com/buy/REPLACE
```

Save the file.

**Expected result:** `env.example` no longer references the 5 Stripe PDF vars. The two remaining Stripe vars (`SUPPORT_CALL_URL` and `DONATION_URL`) are untouched.

---

### 8. Update `apphosting.yaml`

**Where:** `apphosting.yaml` at the project root — open in your editor

Find the 5 Stripe PDF entries (search for `NEXT_PUBLIC_STRIPE_FAMILY_GUIDE_URL`) and replace them with the 5 Lemon Squeezy entries, filling in your actual buy links:

```diff
-  - variable: NEXT_PUBLIC_STRIPE_FAMILY_GUIDE_URL
-    value: "https://buy.stripe.com/fZu3cx9gEeeugNQaMy3Nm01"
-    availability:
-      - BUILD
-      - RUNTIME
-
-  - variable: NEXT_PUBLIC_STRIPE_APPOINTMENT_PREP_URL
-    value: "https://buy.stripe.com/4gM28t78wgmCdBE5se3Nm02"
-    availability:
-      - BUILD
-      - RUNTIME
-
-  - variable: NEXT_PUBLIC_STRIPE_SAFETY_CHECKLIST_URL
-    value: "https://buy.stripe.com/3cIeVf9gEb2icxA4oa3Nm03"
-    availability:
-      - BUILD
-      - RUNTIME
-
-  - variable: NEXT_PUBLIC_STRIPE_TREATMENT_COMPARISON_URL
-    value: "https://buy.stripe.com/eVq9AVgJ62vM1SW8Eq3Nm04"
-    availability:
-      - BUILD
-      - RUNTIME
-
-  - variable: NEXT_PUBLIC_STRIPE_RELAPSE_PREVENTION_URL
-    value: "https://buy.stripe.com/14A00ldwU7Q6eFIaMy3Nm05"
-    availability:
-      - BUILD
-      - RUNTIME
+  - variable: NEXT_PUBLIC_LEMONSQUEEZY_FAMILY_GUIDE_URL
+    value: "https://nextsteprecovery.lemonsqueezy.com/buy/REPLACE_WITH_REAL_LINK"
+    availability:
+      - BUILD
+      - RUNTIME
+
+  - variable: NEXT_PUBLIC_LEMONSQUEEZY_APPOINTMENT_PREP_URL
+    value: "https://nextsteprecovery.lemonsqueezy.com/buy/REPLACE_WITH_REAL_LINK"
+    availability:
+      - BUILD
+      - RUNTIME
+
+  - variable: NEXT_PUBLIC_LEMONSQUEEZY_SAFETY_CHECKLIST_URL
+    value: "https://nextsteprecovery.lemonsqueezy.com/buy/REPLACE_WITH_REAL_LINK"
+    availability:
+      - BUILD
+      - RUNTIME
+
+  - variable: NEXT_PUBLIC_LEMONSQUEEZY_TREATMENT_COMPARISON_URL
+    value: "https://nextsteprecovery.lemonsqueezy.com/buy/REPLACE_WITH_REAL_LINK"
+    availability:
+      - BUILD
+      - RUNTIME
+
+  - variable: NEXT_PUBLIC_LEMONSQUEEZY_RELAPSE_PREVENTION_URL
+    value: "https://nextsteprecovery.lemonsqueezy.com/buy/REPLACE_WITH_REAL_LINK"
+    availability:
+      - BUILD
+      - RUNTIME
```

Replace each `REPLACE_WITH_REAL_LINK` with the actual buy link from step 5 (the part after `lemonsqueezy.com/buy/`, or paste the full URL).

> **Important:** Use your **live mode** Lemon Squeezy buy links in `apphosting.yaml` — not test mode links. Switch Lemon Squeezy to Live Mode before copying the final URLs (see step 14).

**Expected result:** `apphosting.yaml` has 5 Lemon Squeezy env var entries with real buy links. The 2 Stripe entries that remain (`SUPPORT_CALL_URL`, `DONATION_URL`) are untouched.

---

### 9. Update `lib/products-data.ts`

**Where:** `lib/products-data.ts` at the project root — open in your editor

Make 5 targeted changes — one per product. Only the `ctaHref` line of each changes:

```diff
   {
     id: "family-survival-guide",
     ...
-    ctaHref: process.env.NEXT_PUBLIC_STRIPE_FAMILY_GUIDE_URL ?? "#",
+    ctaHref: process.env.NEXT_PUBLIC_LEMONSQUEEZY_FAMILY_GUIDE_URL ?? "#",
   },
   {
     id: "appointment-prep",
     ...
-    ctaHref: process.env.NEXT_PUBLIC_STRIPE_APPOINTMENT_PREP_URL ?? "#",
+    ctaHref: process.env.NEXT_PUBLIC_LEMONSQUEEZY_APPOINTMENT_PREP_URL ?? "#",
   },
   {
     id: "withdrawal-safety-checklist",
     ...
-    ctaHref: process.env.NEXT_PUBLIC_STRIPE_SAFETY_CHECKLIST_URL ?? "#",
+    ctaHref: process.env.NEXT_PUBLIC_LEMONSQUEEZY_SAFETY_CHECKLIST_URL ?? "#",
   },
   {
     id: "treatment-comparison",
     ...
-    ctaHref: process.env.NEXT_PUBLIC_STRIPE_TREATMENT_COMPARISON_URL ?? "#",
+    ctaHref: process.env.NEXT_PUBLIC_LEMONSQUEEZY_TREATMENT_COMPARISON_URL ?? "#",
   },
   {
     id: "relapse-prevention-plan",
     ...
-    ctaHref: process.env.NEXT_PUBLIC_STRIPE_RELAPSE_PREVENTION_URL ?? "#",
+    ctaHref: process.env.NEXT_PUBLIC_LEMONSQUEEZY_RELAPSE_PREVENTION_URL ?? "#",
   },
```

Every other field (`id`, `name`, `type`, `price`, `description`, `cta`) stays the same. Only `ctaHref` changes.

**Expected result:** 5 `ctaHref` lines reference `NEXT_PUBLIC_LEMONSQUEEZY_*` env vars. All other product data is unchanged.

---

### 10. Update `scripts/setup-env.sh`

**Where:** `scripts/setup-env.sh` — open in your editor

Two places to update:

**10a.** In the `cat > "$ENV_FILE"` heredoc, replace the 5 Stripe PDF lines with Lemon Squeezy placeholders:

```diff
-NEXT_PUBLIC_STRIPE_FAMILY_GUIDE_URL=https://buy.stripe.com/fZu3cx9gEeeugNQaMy3Nm01
-NEXT_PUBLIC_STRIPE_APPOINTMENT_PREP_URL=https://buy.stripe.com/4gM28t78wgmCdBE5se3Nm02
-NEXT_PUBLIC_STRIPE_SAFETY_CHECKLIST_URL=https://buy.stripe.com/3cIeVf9gEb2icxA4oa3Nm03
-NEXT_PUBLIC_STRIPE_TREATMENT_COMPARISON_URL=https://buy.stripe.com/eVq9AVgJ62vM1SW8Eq3Nm04
-NEXT_PUBLIC_STRIPE_RELAPSE_PREVENTION_URL=https://buy.stripe.com/14A00ldwU7Q6eFIaMy3Nm05
+# Lemon Squeezy — PDF products (copy live buy links from lemonsqueezy.com)
+NEXT_PUBLIC_LEMONSQUEEZY_FAMILY_GUIDE_URL=
+NEXT_PUBLIC_LEMONSQUEEZY_APPOINTMENT_PREP_URL=
+NEXT_PUBLIC_LEMONSQUEEZY_SAFETY_CHECKLIST_URL=
+NEXT_PUBLIC_LEMONSQUEEZY_TREATMENT_COMPARISON_URL=
+NEXT_PUBLIC_LEMONSQUEEZY_RELAPSE_PREVENTION_URL=
```

**10b.** In the `REQUIRED_VARS` array, swap the same 5 variable names:

```diff
   NEXT_PUBLIC_STRIPE_SUPPORT_CALL_URL
-  NEXT_PUBLIC_STRIPE_FAMILY_GUIDE_URL
-  NEXT_PUBLIC_STRIPE_APPOINTMENT_PREP_URL
-  NEXT_PUBLIC_STRIPE_SAFETY_CHECKLIST_URL
-  NEXT_PUBLIC_STRIPE_TREATMENT_COMPARISON_URL
-  NEXT_PUBLIC_STRIPE_RELAPSE_PREVENTION_URL
+  NEXT_PUBLIC_LEMONSQUEEZY_FAMILY_GUIDE_URL
+  NEXT_PUBLIC_LEMONSQUEEZY_APPOINTMENT_PREP_URL
+  NEXT_PUBLIC_LEMONSQUEEZY_SAFETY_CHECKLIST_URL
+  NEXT_PUBLIC_LEMONSQUEEZY_TREATMENT_COMPARISON_URL
+  NEXT_PUBLIC_LEMONSQUEEZY_RELAPSE_PREVENTION_URL
   NEXT_PUBLIC_STRIPE_DONATION_URL
```

**Expected result:** `npm run setup:env` creates a `.env.local` with Lemon Squeezy placeholders and correctly reports them as missing when not filled in.

---

### 11. Add Lemon Squeezy vars to your local `.env.local`

**Where:** `.env.local` at the project root (not committed to git)

Add the 5 new variables using your **test mode** buy links (for local verification before production):

```bash
NEXT_PUBLIC_LEMONSQUEEZY_FAMILY_GUIDE_URL=<your test-mode family guide buy link>
NEXT_PUBLIC_LEMONSQUEEZY_APPOINTMENT_PREP_URL=<your test-mode appointment prep buy link>
NEXT_PUBLIC_LEMONSQUEEZY_SAFETY_CHECKLIST_URL=<your test-mode safety checklist buy link>
NEXT_PUBLIC_LEMONSQUEEZY_TREATMENT_COMPARISON_URL=<your test-mode treatment comparison buy link>
NEXT_PUBLIC_LEMONSQUEEZY_RELAPSE_PREVENTION_URL=<your test-mode relapse prevention buy link>
```

Also remove or comment out the 5 old Stripe PDF vars if they exist in `.env.local`.

**Expected result:** `.env.local` has 5 Lemon Squeezy vars set. Local dev server will use them.

---

### 12. Verify locally

**Where:** Terminal + browser at `http://localhost:3000`

```bash
npm run dev
```

1. Navigate to `http://localhost:3000/resources`
2. Click **Get the guide** on the Family Survival Guide
3. Confirm the Lemon Squeezy checkout page opens (in test mode)
4. Repeat for the other 4 products
5. Run the test suite to confirm no regressions:

```bash
npm test
```

> Note: Tests mock env vars and use `?? "#"` fallbacks — all tests should pass. The buy links themselves are only exercised in the browser.

**Expected result:** All 5 PDF product CTAs open Lemon Squeezy checkout. All tests pass.

---

### Phase 3 — Production Deployment

---

### 13. Switch Lemon Squeezy to Live Mode and get live buy links

**Where:** Lemon Squeezy dashboard — toggle test mode off

> **Warning:** Once you switch to Live Mode and accept real payments, transactions are real. Complete all testing in test mode before this step.

1. Click the **Test Mode** toggle in the Lemon Squeezy dashboard to switch to **Live Mode**
2. The orange banner disappears — you are now in Live Mode
3. Navigate to **Products** → open each product → **Share** → **Buy link**
4. Copy each live-mode buy link (it will look identical but resolves to a real payment session)
5. Replace the `REPLACE_WITH_REAL_LINK` values in `apphosting.yaml` (from step 8) with the live-mode links

**Expected result:** `apphosting.yaml` contains 5 live-mode Lemon Squeezy buy links.

---

### 14. Deploy to Firebase App Hosting

**Where:** Terminal at the project root

```bash
nvm use 20
firebase deploy
```

Wait for the deploy to complete (~3–5 minutes). You will see:

```
✔ Deploy complete!
Hosting URL: https://nextstep-recovery--nextsteprecovery-1d5c2.us-central1.hosted.app
```

**Expected result:** Deployment succeeds with no errors. The live site is updated.

---

### 15. Smoke test on the live site

**Where:** Browser — open the live site URL from step 14

For each of the 5 products:

1. Navigate to `/resources`
2. Click the product CTA button (**Get the guide** or **Download the worksheet**)
3. Confirm the Lemon Squeezy checkout page opens in live mode (no orange test banner)
4. Do **not** complete a real purchase — just confirm the checkout page loads with the correct product name and price

For a full end-to-end test on one product (optional but recommended):

5. Complete a real purchase of the cheapest product ($9.99)
6. Confirm you receive the Lemon Squeezy delivery email within 2 minutes
7. Confirm the PDF downloads and opens correctly

**Expected result:** All 5 product CTAs open live Lemon Squeezy checkout. At least one full purchase delivers the PDF to your inbox.

---

### 16. Archive the 5 old Stripe payment links

**Where:** https://dashboard.stripe.com → **Payment Links**

The 5 Stripe PDF links are now unused. Archiving them prevents accidental purchases via direct URL (the links still work if shared but won't be linked from the site).

1. Log in to the Stripe dashboard
2. Navigate to **Payment Links** in the left sidebar
3. For each of the 5 PDF products, click the link → **Archive**
4. Confirm the archive prompt

Leave the support-call link and donation link active — those are still in use.

| Link to archive                                       | Price  | Status after archiving |
| ----------------------------------------------------- | ------ | ---------------------- |
| Family Survival Guide                                 | $19.99 | Archived (unreachable) |
| Appointment Preparation Worksheet                     | $9.99  | Archived               |
| Withdrawal Safety Checklist                           | $9.99  | Archived               |
| Detox/Treatment Center Comparison Worksheet           | $9.99  | Archived               |
| Post-Withdrawal Relapse-Prevention Planning Worksheet | $9.99  | Archived               |

**Expected result:** 5 payment links are archived in Stripe. 2 remain active (support call, donation).

---

### 17. Update `docs/features.md`

**Where:** `docs/features.md` — open in your editor

In the Resources table, update the 5 PDF product rows from "Live (payment only)" to "Live":

```diff
-| Family Survival Guide ($19.99)         | Live (payment only) | Stripe link live; PDF delivery not wired |
+| Family Survival Guide ($19.99)         | Live                | Lemon Squeezy — payment + PDF delivery   |

-| Appointment Prep Worksheet ($9.99)     | Live (payment only) | Stripe link live; PDF delivery not wired |
+| Appointment Prep Worksheet ($9.99)     | Live                | Lemon Squeezy — payment + PDF delivery   |

-| Withdrawal Safety Checklist ($9.99)    | Live (payment only) | Stripe link live; PDF delivery not wired |
+| Withdrawal Safety Checklist ($9.99)    | Live                | Lemon Squeezy — payment + PDF delivery   |

-| Treatment Comparison Worksheet ($9.99) | Live (payment only) | Stripe link live; PDF delivery not wired |
+| Treatment Comparison Worksheet ($9.99) | Live                | Lemon Squeezy — payment + PDF delivery   |

-| Relapse Prevention Plan ($9.99)        | Live (payment only) | Stripe link live; PDF delivery not wired |
+| Relapse Prevention Plan ($9.99)        | Live                | Lemon Squeezy — payment + PDF delivery   |
```

Also update the "Medium priority" checklist:

```diff
-- [~] **PDF delivery** — decision made, implementation pending; recommend migrating the 5 paid PDFs to Lemon Squeezy (merchant of record, native file delivery). See [docs/pdf-delivery.md](./pdf-delivery.md).
+- [x] **PDF delivery** — migrated to Lemon Squeezy; handles checkout, tax, and file delivery natively.
```

**Expected result:** `docs/features.md` accurately reflects the live state of the product catalog.

---

## Verification

- [ ] All 5 PDF product CTAs on `/resources` open the correct Lemon Squeezy checkout page
- [ ] The support-call Stripe link still works (unchanged)
- [ ] The donation Stripe link still works (unchanged)
- [ ] At least one full end-to-end purchase delivers the PDF to your inbox
- [ ] The 5 archived Stripe links are no longer reachable
- [ ] `npm test` passes with no regressions
- [ ] `docs/features.md` updated to "Live" for all 5 products

## Rollback

If anything goes wrong after deployment:

1. **Revert `apphosting.yaml`** — restore the 5 original `NEXT_PUBLIC_STRIPE_*` entries and redeploy. The Stripe links still exist and will work immediately.
2. **Revert `lib/products-data.ts`** — restore the 5 original `NEXT_PUBLIC_STRIPE_*` env var references.
3. **Un-archive the Stripe links** — Stripe links can be unarchived from the dashboard if needed.

All steps are reversible. No data is deleted.

## Notes & Gotchas

- **Test mode vs. live mode buy links are different URLs.** Using a test-mode buy link in production means customers hit Lemon Squeezy's test environment and payments don't go through. Always use live-mode links in `apphosting.yaml`.
- **`NEXT_PUBLIC_*` vars are bundled at build time.** Updating them in `apphosting.yaml` requires a full redeploy — a runtime change is not enough. This is why the deploy step comes after `apphosting.yaml` is updated.
- **Lemon Squeezy is merchant of record.** They collect and remit sales tax for digital goods globally. You do not need to handle VAT or US state sales tax separately — this is a significant advantage over the Stripe-only approach.
- **The `?? "#"` fallback in `products-data.ts`** means if a Lemon Squeezy var is missing, the CTA becomes a no-op `#` link rather than crashing the page. This is safe for local dev but must not happen in production.
- **Do not put actual Stripe live keys anywhere in the repo.** The Stripe env vars in `apphosting.yaml` are public payment link URLs (safe to expose). The Stripe secret key is never referenced in this codebase.
- **Lemon Squeezy fee:** 5% + $0.50 per transaction vs. Stripe's 2.9% + $0.30. On a $9.99 sale, Lemon Squeezy takes ~$1.00 vs. Stripe's ~$0.59 — about $0.40 more per sale. This is the trade-off for zero-code delivery and tax compliance.
