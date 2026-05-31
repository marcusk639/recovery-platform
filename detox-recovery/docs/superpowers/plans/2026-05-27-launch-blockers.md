# Launch Blockers Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Unblock public launch by fixing broken email delivery, wiring lead magnet automation, and unlocking all five paid PDF products.

**Architecture:** Three independent workstreams run in sequence. Task 1–2 fix the contact form email sender. Task 3 is MailerLite-only configuration (zero code). Tasks 4–6 complete the Lemon Squeezy migration — external product setup, code changes, then a production deploy.

**Tech Stack:** Next.js 15 App Router, Resend (transactional email), MailerLite (subscriber automation), Lemon Squeezy (digital product delivery + tax), Firebase App Hosting (Cloud Run).

---

## Files to create or modify

| Action | File                       | What changes                                                                    |
| ------ | -------------------------- | ------------------------------------------------------------------------------- |
| Modify | `app/api/contact/route.ts` | Fix `from` field — use env var directly, not as inner value of another template |
| Modify | `apphosting.yaml`          | Replace 5 Stripe PDF env vars with 5 Lemon Squeezy env vars                     |
| Modify | `lib/products-data.ts`     | 5 `ctaHref` env var renames + remove 5 `availability: "coming-soon"` fields     |
| Modify | `env.example`              | Replace 5 Stripe PDF var names with Lemon Squeezy names                         |
| Modify | `scripts/setup-env.sh`     | Same replacement in heredoc + REQUIRED_VARS array                               |
| Modify | `.github/workflows/ci.yml` | Replace 5 Stripe PDF placeholder vars with Lemon Squeezy placeholders           |

---

## Task 1: Fix the `from` field double-wrap bug

**Background:** `app/api/contact/route.ts` line 128 builds the Resend `from` field as:

```ts
from: `Withdrawal Support <${process.env.RESEND_FROM_EMAIL ?? "onboarding@resend.dev"}>`,
```

`RESEND_FROM_EMAIL` in `apphosting.yaml` is already `"Withdrawal Support <admin@regroup-app.com>"`. This makes the final value `"Withdrawal Support <Withdrawal Support <admin@regroup-app.com>>"` — a malformed email header. The fix is to use the env var as the complete `from` string.

**Files:**

- Modify: `app/api/contact/route.ts:128-130`

- [ ] **Step 1.1: Apply the one-line fix**

In `app/api/contact/route.ts`, find lines 127–135 (the `resend.emails.send` call) and change the `from` line:

```ts
const sendEmailPromise = resend.emails.send({
  from:
    process.env.RESEND_FROM_EMAIL ??
    "Withdrawal Support <onboarding@resend.dev>",
  to: toEmail,
  replyTo: safeEmail,
  subject: `New inquiry from ${safeName}`,
  text: lines.join("\n"),
});
```

The old line was:

```ts
    from: `Withdrawal Support <${
      process.env.RESEND_FROM_EMAIL ?? "onboarding@resend.dev"
    }>`,
```

- [ ] **Step 1.2: Run tests to confirm no regression**

```bash
npm run test -- --no-coverage --ci
```

Expected output:

```
Test Suites: 18 passed, 18 total
Tests:       157 passed, 157 total
```

- [ ] **Step 1.3: Commit**

```bash
git add app/api/contact/route.ts
git commit -m "fix: use RESEND_FROM_EMAIL as complete from field, not inner value"
```

---

## Task 2: Verify sending domain in Resend

**Background:** Contact form emails come FROM `admin@regroup-app.com` (set in `apphosting.yaml`). Resend requires the sender domain to be verified or emails will be rejected or marked as spam. This task verifies the domain and optionally switches it to `nextsteprecovery.io` for brand consistency.

**Files:**

- Modify: `apphosting.yaml` (only if changing the from address)

> **Decision point:** Choose one of two options before starting:
>
> **Option A — Verify `regroup-app.com`:** Keep the existing `RESEND_FROM_EMAIL` value. Verify the `regroup-app.com` domain in Resend. No code changes needed.
>
> **Option B — Switch to `nextsteprecovery.io` (recommended):** Change `RESEND_FROM_EMAIL` to `"Withdrawal Support <support@nextsteprecovery.io>"`. Verify `nextsteprecovery.io` in Resend. One-line `apphosting.yaml` edit.
>
> Option B is preferred — the site lives at nextsteprecovery.io and a matching sender domain improves deliverability and looks professional.

- [ ] **Step 2.1: Add and verify the sending domain in Resend**

1. Log in to https://resend.com
2. Navigate to **Domains** in the left sidebar
3. Click **Add domain**
4. Enter the domain you chose (`regroup-app.com` or `nextsteprecovery.io`)
5. Resend displays 3 DNS records to add (SPF TXT, DKIM CNAME × 2)
6. Log in to your DNS provider (Cloudflare, Namecheap, etc.) and add all 3 records
7. Return to Resend → Domains → click **Verify**
8. Wait for DNS propagation (usually 1–10 minutes with Cloudflare; up to 48 hours elsewhere)

Expected: Domain shows as "Verified" with a green checkmark in Resend → Domains.

- [ ] **Step 2.2: (Option B only) Update `apphosting.yaml`**

Find the `RESEND_FROM_EMAIL` entry and update the value:

```yaml
- variable: RESEND_FROM_EMAIL
  value: "Withdrawal Support <support@nextsteprecovery.io>"
  availability:
    - RUNTIME
```

- [ ] **Step 2.3: (Option B only) Commit and deploy**

```bash
git add apphosting.yaml
git commit -m "config: use nextsteprecovery.io as Resend sender domain"
```

Then deploy from your terminal (Claude cannot run `firebase deploy` — it must be run by you):

```
! firebase deploy
```

- [ ] **Step 2.4: Smoke test**

Submit the contact form at https://nextsteprecovery.io/contact with your own email address as the submitter. Confirm:

- You receive the inquiry email at `admin@regroup-app.com` (or your `RESEND_TO_EMAIL`)
- The **From** header shows `Withdrawal Support <support@nextsteprecovery.io>` (not double-wrapped)
- The email is not in your spam folder

---

## Task 3: Set up MailerLite lead magnet automations

**Background:** When someone fills in a lead magnet form on `/resources`, their email is added to a MailerLite subscriber group. The subscribe API (`POST /api/subscribe`) is working and group IDs are configured in `apphosting.yaml`. The missing piece: MailerLite does not automatically send the guide after a subscriber is added. This task creates 3 automations — one per lead magnet — that trigger on subscription and email the guide.

**No code changes.** This task is entirely in the MailerLite dashboard.

**Three lead magnets to wire up:**

| Tag sent by form     | MailerLite Group   | Group ID             | Content file                                            |
| -------------------- | ------------------ | -------------------- | ------------------------------------------------------- |
| `lead-magnet-unsafe` | Lead Magnet Unsafe | `188194958591657681` | `docs/lead-magnets/01-unsafe-withdrawal.md`             |
| `lead-magnet-family` | Lead Magnet Family | `188194958890501182` | `docs/lead-magnets/02-helping-someone-in-withdrawal.md` |
| `lead-magnet-b2b`    | Lead Magnet B2B    | `188194959207171446` | `docs/lead-magnets/03-detox-programs-lose-trust.md`     |

- [ ] **Step 3.1: Open the content for the first guide**

Open `docs/lead-magnets/01-unsafe-withdrawal.md`. Read it. You'll copy this content into the MailerLite email editor in the next step.

- [ ] **Step 3.2: Create the "Unsafe Withdrawal" automation in MailerLite**

1. Log in to https://dashboard.mailerlite.com
2. Click **Automation** in the left nav → **Create automation**
3. Name the automation: `Lead Magnet — Unsafe Withdrawal`
4. Under **When** (trigger), select **When subscriber is added to a group**
5. Select group: the group whose ID is `188194958591657681` (should be named "Lead Magnet Unsafe" or similar)
6. Click **+ Add action** → **Send email**
7. Click **Create new email** and configure:
   - **Subject:** `Your free guide: What to Do When Withdrawal Starts Feeling Unsafe`
   - **From name:** `Next Step Recovery` (or your preferred sender name)
   - **From email:** Your verified Resend domain email (e.g., `support@nextsteprecovery.io`)
   - **Content:** Paste or type the content from `docs/lead-magnets/01-unsafe-withdrawal.md`. Use MailerLite's drag-drop editor to format it with headings, body text, and a closing CTA linking to the contact page.
8. Save the email, then click **Save and continue** on the automation
9. Set the automation to **Active**

Expected: Automation is active and shows "Trigger: Added to group [name]" → "Action: Send email"

- [ ] **Step 3.3: Test the unsafe withdrawal automation**

1. In MailerLite → Automation, click **Test automation** or manually subscribe a test email address to the "Lead Magnet Unsafe" group
2. Check your test inbox within 5 minutes
3. Confirm the email arrives with correct subject and content

Expected: Email received with subject `Your free guide: What to Do When Withdrawal Starts Feeling Unsafe`

- [ ] **Step 3.4: Create the "Helping Someone in Withdrawal" automation**

Repeat Steps 3.1–3.3 for the family guide:

- Open: `docs/lead-magnets/02-helping-someone-in-withdrawal.md`
- Automation name: `Lead Magnet — Helping Someone in Withdrawal`
- Trigger group ID: `188194958890501182`
- Email subject: `Your free guide: How to Help Someone in Withdrawal Without Making It Worse`

- [ ] **Step 3.5: Create the "B2B" automation**

Repeat Steps 3.1–3.3 for the B2B lead magnet:

- Open: `docs/lead-magnets/03-detox-programs-lose-trust.md`
- Automation name: `Lead Magnet — B2B`
- Trigger group ID: `188194959207171446`
- Email subject: `Your free guide: Why Detox Programs Lose Patient Trust (And What to Do About It)` (use the actual title from the markdown file)

- [ ] **Step 3.6: End-to-end test through the site**

1. Start the dev server: `npm run dev`
2. Go to `http://localhost:3000/resources`
3. Find the "What to Do When Withdrawal Starts Feeling Unsafe" lead magnet and submit the form with a real email address
4. Check your inbox within 5 minutes

Expected: Email arrives from your verified domain with guide content.

---

## Task 4: Lemon Squeezy setup (external — no code)

**Background:** The 5 paid PDF products currently show "Available soon" because `availability: "coming-soon"` is set in `lib/products-data.ts`. Before un-gating them in code, the Lemon Squeezy store must exist and the PDFs must be uploaded so customers can receive their downloads.

**No code changes in this task.** Follow the existing runbook:

- [ ] **Step 4.1: Complete Phase 1 of the Lemon Squeezy runbook**

Open `docs/manual-tasks/2026-05-23-lemon-squeezy-migration.md` and complete **steps 1 through 6** (Create account → Create store → Verify merchant → Enable Test Mode → Create 5 products → Test one purchase).

The 5 PDF content files to upload:

| Product                        | Markdown source                                          | Output PDF name                      |
| ------------------------------ | -------------------------------------------------------- | ------------------------------------ |
| Family Survival Guide          | `docs/lead-magnets/01-family-survival-guide.md`          | `family-survival-guide.pdf`          |
| Appointment Prep Worksheet     | `docs/lead-magnets/02-appointment-prep-worksheet.md`     | `appointment-prep-worksheet.pdf`     |
| Withdrawal Safety Checklist    | `docs/lead-magnets/03-withdrawal-safety-checklist.md`    | `withdrawal-safety-checklist.pdf`    |
| Treatment Comparison Worksheet | `docs/lead-magnets/04-treatment-comparison-worksheet.md` | `treatment-comparison-worksheet.pdf` |
| Relapse Prevention Plan        | `docs/lead-magnets/05-relapse-prevention-plan.md`        | `relapse-prevention-plan.pdf`        |

> **Note:** You need actual PDF files to upload. Convert each markdown file to PDF before starting (use Pandoc, VS Code PDF export, or any tool you prefer).

Before proceeding to Task 5, confirm you have 5 test-mode Lemon Squeezy buy links that look like:
`https://nextsteprecovery.lemonsqueezy.com/buy/xxxxxxxx`

---

## Task 5: Code changes — Lemon Squeezy migration + ungate products

**Background:** Now that buy links exist, update the codebase to point to Lemon Squeezy and remove the `availability: "coming-soon"` gating. When `availability` is absent or `"available"`, `ProductCard` renders the real CTA button instead of the "Available soon" placeholder.

**Files:**

- Modify: `lib/products-data.ts`
- Modify: `apphosting.yaml`
- Modify: `env.example`
- Modify: `scripts/setup-env.sh`
- Modify: `.github/workflows/ci.yml`

- [ ] **Step 5.1: Write failing snapshot / render test (skip if no snapshot tests exist)**

The resources tests don't currently assert on "Available soon". Run them now to baseline:

```bash
npx jest __tests__/pages/resources.test.tsx --no-coverage
```

Expected: All 4 tests pass. (These tests will still pass after the change — they assert on product names and free CTAs, not on paid product button text.)

- [ ] **Step 5.2: Update `lib/products-data.ts`**

Make 10 changes: for each of the 5 paid products, change `ctaHref` and remove the `availability` field.

Replace the full `PRODUCTS` array entries for the 5 paid products as shown (keep all other products unchanged):

```ts
  {
    id: "family-survival-guide",
    name: "Family Survival Guide",
    type: "guide",
    price: "$19.99",
    description:
      "A practical guide for family members navigating a loved one's withdrawal — what to watch for, what to say, and when to act.",
    cta: "Get the guide",
    ctaHref: process.env.NEXT_PUBLIC_LEMONSQUEEZY_FAMILY_GUIDE_URL ?? "#",
  },
  {
    id: "appointment-prep",
    name: "Appointment Preparation Worksheet",
    type: "worksheet",
    price: "$9.99",
    description:
      "Step-by-step worksheet to prepare for a medical or treatment appointment — questions to ask, history to gather, goals to set.",
    cta: "Download the worksheet",
    ctaHref: process.env.NEXT_PUBLIC_LEMONSQUEEZY_APPOINTMENT_PREP_URL ?? "#",
  },
  {
    id: "withdrawal-safety-checklist",
    name: "Withdrawal Safety Checklist",
    type: "worksheet",
    price: "$9.99",
    description:
      "A structured checklist for assessing withdrawal severity and identifying when professional medical care is needed.",
    cta: "Download the checklist",
    ctaHref: process.env.NEXT_PUBLIC_LEMONSQUEEZY_SAFETY_CHECKLIST_URL ?? "#",
  },
  {
    id: "treatment-comparison",
    name: "Detox/Treatment Center Comparison Worksheet",
    type: "worksheet",
    price: "$9.99",
    description:
      "Evaluate treatment options side-by-side across key criteria: medical supervision, insurance, availability, and approach.",
    cta: "Download the worksheet",
    ctaHref: process.env.NEXT_PUBLIC_LEMONSQUEEZY_TREATMENT_COMPARISON_URL ?? "#",
  },
  {
    id: "relapse-prevention-plan",
    name: "Post-Withdrawal Relapse-Prevention Planning Worksheet",
    type: "worksheet",
    price: "$9.99",
    description:
      "A structured planning tool for the first 30–90 days after acute withdrawal — triggers, support, contingency plans.",
    cta: "Download the worksheet",
    ctaHref: process.env.NEXT_PUBLIC_LEMONSQUEEZY_RELAPSE_PREVENTION_URL ?? "#",
  },
```

- [ ] **Step 5.3: Run tests to confirm no regression**

```bash
npm run test -- --no-coverage --ci
```

Expected: All 18 suites, 157 tests pass.

- [ ] **Step 5.4: Update `apphosting.yaml`**

Find the 5 Stripe PDF entries (lines starting `NEXT_PUBLIC_STRIPE_FAMILY_GUIDE_URL` through `NEXT_PUBLIC_STRIPE_RELAPSE_PREVENTION_URL`) and replace them with the 5 Lemon Squeezy entries. Use your **test-mode** buy links here for now — you'll swap in live links in Task 6.

```yaml
- variable: NEXT_PUBLIC_LEMONSQUEEZY_FAMILY_GUIDE_URL
  value: "https://nextsteprecovery.lemonsqueezy.com/buy/REPLACE_WITH_TEST_LINK"
  availability:
    - BUILD
    - RUNTIME

- variable: NEXT_PUBLIC_LEMONSQUEEZY_APPOINTMENT_PREP_URL
  value: "https://nextsteprecovery.lemonsqueezy.com/buy/REPLACE_WITH_TEST_LINK"
  availability:
    - BUILD
    - RUNTIME

- variable: NEXT_PUBLIC_LEMONSQUEEZY_SAFETY_CHECKLIST_URL
  value: "https://nextsteprecovery.lemonsqueezy.com/buy/REPLACE_WITH_TEST_LINK"
  availability:
    - BUILD
    - RUNTIME

- variable: NEXT_PUBLIC_LEMONSQUEEZY_TREATMENT_COMPARISON_URL
  value: "https://nextsteprecovery.lemonsqueezy.com/buy/REPLACE_WITH_TEST_LINK"
  availability:
    - BUILD
    - RUNTIME

- variable: NEXT_PUBLIC_LEMONSQUEEZY_RELAPSE_PREVENTION_URL
  value: "https://nextsteprecovery.lemonsqueezy.com/buy/REPLACE_WITH_TEST_LINK"
  availability:
    - BUILD
    - RUNTIME
```

- [ ] **Step 5.5: Update `env.example`**

Replace the 5 Stripe PDF lines with Lemon Squeezy placeholders. The file currently has:

```
NEXT_PUBLIC_STRIPE_FAMILY_GUIDE_URL=https://buy.stripe.com/REPLACE
NEXT_PUBLIC_STRIPE_APPOINTMENT_PREP_URL=https://buy.stripe.com/REPLACE
NEXT_PUBLIC_STRIPE_SAFETY_CHECKLIST_URL=https://buy.stripe.com/REPLACE
NEXT_PUBLIC_STRIPE_TREATMENT_COMPARISON_URL=https://buy.stripe.com/REPLACE
NEXT_PUBLIC_STRIPE_RELAPSE_PREVENTION_URL=https://buy.stripe.com/REPLACE
```

Replace those 5 lines with:

```
# Lemon Squeezy — paid PDF products (copy buy links from lemonsqueezy.com dashboard)
NEXT_PUBLIC_LEMONSQUEEZY_FAMILY_GUIDE_URL=https://nextsteprecovery.lemonsqueezy.com/buy/REPLACE
NEXT_PUBLIC_LEMONSQUEEZY_APPOINTMENT_PREP_URL=https://nextsteprecovery.lemonsqueezy.com/buy/REPLACE
NEXT_PUBLIC_LEMONSQUEEZY_SAFETY_CHECKLIST_URL=https://nextsteprecovery.lemonsqueezy.com/buy/REPLACE
NEXT_PUBLIC_LEMONSQUEEZY_TREATMENT_COMPARISON_URL=https://nextsteprecovery.lemonsqueezy.com/buy/REPLACE
NEXT_PUBLIC_LEMONSQUEEZY_RELAPSE_PREVENTION_URL=https://nextsteprecovery.lemonsqueezy.com/buy/REPLACE
```

- [ ] **Step 5.6: Update `scripts/setup-env.sh`**

Two changes:

**5.6a.** In the `cat > "$ENV_FILE"` heredoc, replace the 5 Stripe PDF lines:

```bash
# Stripe — payment links (live mode, public, exposed to browser)
NEXT_PUBLIC_STRIPE_SUPPORT_CALL_URL=https://buy.stripe.com/14AeVffF2gmCeFI6wi3Nm00
# Lemon Squeezy — paid PDF products (copy buy links from lemonsqueezy.com)
NEXT_PUBLIC_LEMONSQUEEZY_FAMILY_GUIDE_URL=
NEXT_PUBLIC_LEMONSQUEEZY_APPOINTMENT_PREP_URL=
NEXT_PUBLIC_LEMONSQUEEZY_SAFETY_CHECKLIST_URL=
NEXT_PUBLIC_LEMONSQUEEZY_TREATMENT_COMPARISON_URL=
NEXT_PUBLIC_LEMONSQUEEZY_RELAPSE_PREVENTION_URL=
NEXT_PUBLIC_STRIPE_DONATION_URL=https://buy.stripe.com/eVq6oJ50odaqcxAf2O3Nm06
```

(Remove the 5 lines for `NEXT_PUBLIC_STRIPE_FAMILY_GUIDE_URL`, `APPOINTMENT_PREP`, `SAFETY_CHECKLIST`, `TREATMENT_COMPARISON`, `RELAPSE_PREVENTION`.)

**5.6b.** In the `REQUIRED_VARS` array, swap the same 5 names:

```bash
REQUIRED_VARS=(
  RESEND_API_KEY
  RESEND_TO_EMAIL
  MAILERLITE_API_KEY
  MAILERLITE_GROUP_ID_NEWSLETTER
  MAILERLITE_GROUP_ID_LEAD_MAGNET_UNSAFE
  MAILERLITE_GROUP_ID_LEAD_MAGNET_FAMILY
  MAILERLITE_GROUP_ID_B2B
  NEXT_PUBLIC_CALENDLY_FIT_CHECK_URL
  NEXT_PUBLIC_CALENDLY_SUPPORT_CALL_URL
  NEXT_PUBLIC_STRIPE_SUPPORT_CALL_URL
  NEXT_PUBLIC_LEMONSQUEEZY_FAMILY_GUIDE_URL
  NEXT_PUBLIC_LEMONSQUEEZY_APPOINTMENT_PREP_URL
  NEXT_PUBLIC_LEMONSQUEEZY_SAFETY_CHECKLIST_URL
  NEXT_PUBLIC_LEMONSQUEEZY_TREATMENT_COMPARISON_URL
  NEXT_PUBLIC_LEMONSQUEEZY_RELAPSE_PREVENTION_URL
  NEXT_PUBLIC_STRIPE_DONATION_URL
)
```

- [ ] **Step 5.7: Update `.github/workflows/ci.yml`**

In the `Build` step's `env:` block, replace the 5 Stripe PDF placeholder vars with Lemon Squeezy placeholders. Find these 5 lines:

```yaml
NEXT_PUBLIC_STRIPE_FAMILY_GUIDE_URL: "https://buy.stripe.com/placeholder"
NEXT_PUBLIC_STRIPE_APPOINTMENT_PREP_URL: "https://buy.stripe.com/placeholder"
NEXT_PUBLIC_STRIPE_SAFETY_CHECKLIST_URL: "https://buy.stripe.com/placeholder"
NEXT_PUBLIC_STRIPE_TREATMENT_COMPARISON_URL: "https://buy.stripe.com/placeholder"
NEXT_PUBLIC_STRIPE_RELAPSE_PREVENTION_URL: "https://buy.stripe.com/placeholder"
```

Replace with:

```yaml
NEXT_PUBLIC_LEMONSQUEEZY_FAMILY_GUIDE_URL: "https://nextsteprecovery.lemonsqueezy.com/buy/placeholder"
NEXT_PUBLIC_LEMONSQUEEZY_APPOINTMENT_PREP_URL: "https://nextsteprecovery.lemonsqueezy.com/buy/placeholder"
NEXT_PUBLIC_LEMONSQUEEZY_SAFETY_CHECKLIST_URL: "https://nextsteprecovery.lemonsqueezy.com/buy/placeholder"
NEXT_PUBLIC_LEMONSQUEEZY_TREATMENT_COMPARISON_URL: "https://nextsteprecovery.lemonsqueezy.com/buy/placeholder"
NEXT_PUBLIC_LEMONSQUEEZY_RELAPSE_PREVENTION_URL: "https://nextsteprecovery.lemonsqueezy.com/buy/placeholder"
```

- [ ] **Step 5.8: Add Lemon Squeezy vars to `.env.local` for local testing**

Add to your `.env.local` (not committed to git) using your test-mode buy links:

```
NEXT_PUBLIC_LEMONSQUEEZY_FAMILY_GUIDE_URL=https://nextsteprecovery.lemonsqueezy.com/buy/<your-test-link>
NEXT_PUBLIC_LEMONSQUEEZY_APPOINTMENT_PREP_URL=https://nextsteprecovery.lemonsqueezy.com/buy/<your-test-link>
NEXT_PUBLIC_LEMONSQUEEZY_SAFETY_CHECKLIST_URL=https://nextsteprecovery.lemonsqueezy.com/buy/<your-test-link>
NEXT_PUBLIC_LEMONSQUEEZY_TREATMENT_COMPARISON_URL=https://nextsteprecovery.lemonsqueezy.com/buy/<your-test-link>
NEXT_PUBLIC_LEMONSQUEEZY_RELAPSE_PREVENTION_URL=https://nextsteprecovery.lemonsqueezy.com/buy/<your-test-link>
```

Also delete (or comment out) the old Stripe PDF lines from `.env.local`.

- [ ] **Step 5.9: Verify locally**

```bash
npm run dev
```

Navigate to `http://localhost:3000/resources`. Confirm:

- The 5 paid products now show a real CTA button ("Get the guide" / "Download the worksheet"), not "Available soon"
- Clicking a button opens the Lemon Squeezy test-mode checkout page

- [ ] **Step 5.10: Run full suite + typecheck**

```bash
npm run typecheck && npm run test -- --no-coverage --ci
```

Expected: typecheck clean, 18 suites, 157 tests pass.

- [ ] **Step 5.11: Commit**

```bash
git add lib/products-data.ts apphosting.yaml env.example scripts/setup-env.sh .github/workflows/ci.yml
git commit -m "feat: migrate 5 paid PDFs to Lemon Squeezy, ungate products"
```

---

## Task 6: Switch to live mode + deploy + smoke test

**Background:** `apphosting.yaml` currently has test-mode buy links from Task 5. Switch Lemon Squeezy to live mode, get live buy links, update `apphosting.yaml`, and deploy.

- [ ] **Step 6.1: Get live-mode buy links from Lemon Squeezy**

1. Log in to https://app.lemonsqueezy.com
2. Toggle from **Test Mode** to **Live Mode** (top navigation bar — orange banner disappears)
3. For each of the 5 products: Products → open product → Share → Buy link → copy

> **Warning:** These links resolve to real payment sessions. Use them only in `apphosting.yaml` (production config). Keep test links in `.env.local` for local development.

- [ ] **Step 6.2: Update `apphosting.yaml` with live links**

Replace the 5 `REPLACE_WITH_TEST_LINK` placeholder values with real live-mode URLs.

- [ ] **Step 6.3: Commit**

```bash
git add apphosting.yaml
git commit -m "config: activate live-mode Lemon Squeezy buy links"
```

- [ ] **Step 6.4: Push and deploy**

```bash
git push
```

Then in your terminal:

```
! firebase deploy
```

Wait for the deploy to complete (~3–5 min). Expected output ends with `✔ Deploy complete!`

- [ ] **Step 6.5: Smoke test on the live site**

Go to https://nextsteprecovery.io/resources and confirm:

- All 5 paid products show real CTA buttons (no "Available soon" badge)
- Clicking each button opens Lemon Squeezy checkout with the correct product name and price
- The Lemon Squeezy checkout page has NO orange "Test Mode" banner

- [ ] **Step 6.6: Archive the 5 old Stripe PDF payment links**

Log in to https://dashboard.stripe.com → Payment Links. Archive these 5 (leave support-call and donation links active):

- Family Survival Guide ($19.99)
- Appointment Preparation Worksheet ($9.99)
- Withdrawal Safety Checklist ($9.99)
- Detox/Treatment Center Comparison Worksheet ($9.99)
- Post-Withdrawal Relapse-Prevention Planning Worksheet ($9.99)

---

## Verification checklist

- [ ] Contact form emails arrive with correct sender (not double-wrapped, not spam)
- [ ] Subscribing to each lead magnet triggers a delivery email within 5 minutes
- [ ] All 5 paid product CTAs on `/resources` open Lemon Squeezy live-mode checkout
- [ ] `npm run typecheck` exits 0
- [ ] `npm run test -- --no-coverage --ci` shows 18 suites passing
- [ ] CI passes on `main` (check GitHub Actions tab)
- [ ] 5 old Stripe payment links archived
