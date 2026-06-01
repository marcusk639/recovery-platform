# External Service Setup

> **⚠️ STALE — Do not follow this runbook.**
> This document was written before the project migrated from ConvertKit to MailerLite and from Vercel to Firebase App Hosting. The env vars, API setup steps, and deployment instructions are outdated.
>
> Use [`docs/environment.md`](../environment.md) for current env var setup and [`docs/deployment.md`](../deployment.md) for Firebase App Hosting deployment.

---

> **Date:** 2026-05-21
> **Author:** Claude Code (review before following)
> **Estimated time:** 45–60 minutes
> **Risk level:** Low

## Context

The codebase has API routes and data files that read from environment variables for four external services: Resend (contact form email delivery), ConvertKit (newsletter and lead magnet subscriptions), Calendly (booking links), and Stripe (payment links and donation). Until these variables are set, those features fail silently or show broken `#` links. This runbook walks through creating the required accounts, generating the correct URLs and keys, and wiring them in.

## Prerequisites

Before starting, confirm:

- [ ] You have (or can create) accounts on Resend, ConvertKit, Calendly, and Stripe
- [ ] You have access to the project's `.env.local` file (create it at the project root if it doesn't exist)
- [ ] The app runs locally with `npm run dev`
- [ ] For production: you have access to the deployment platform's environment variable settings (Vercel, Render, etc.)

---

## Steps

### 1. Create `.env.local` at the project root

**Where:** Terminal, project root

Copy the example file:

```bash
cp .env.local.example .env.local
```

If `.env.local.example` doesn't exist yet, create `.env.local` manually and paste the template from the Notes section at the bottom of this doc.

**Expected result:** A `.env.local` file exists at the root. It is already in `.gitignore` and will never be committed.

---

### 2. Set up Resend (contact form email delivery)

**Where:** https://resend.com

The contact form at `/contact` sends inquiry emails via Resend. Without this, submissions are accepted by the UI but silently dropped (no email is sent).

1. Sign in or create a free Resend account.
2. Navigate to **API Keys** in the left sidebar.
3. Click **Create API Key**. Name it `withdrawal-support-contact`.
4. Copy the key (shown once).
5. In `.env.local`, set:

```
RESEND_API_KEY=<paste key here>
RESEND_TO_EMAIL=<your email address that should receive inquiries>
```

**Note on the sender address:** The code currently sends `from: "Withdrawal Support <onboarding@resend.dev>"`. This works for testing but Resend will flag it in production. To use your own domain, verify a domain in the Resend dashboard under **Domains**, then update the `from` field in `app/api/contact/route.ts` to use that domain (e.g., `"Withdrawal Support <hello@yourdomain.com>"`).

**Expected result:** Submitting the contact form at `/contact` sends an email to `RESEND_TO_EMAIL`.

---

### 3. Set up ConvertKit (newsletter + lead magnets)

**Where:** https://app.convertkit.com

The subscribe API (`/api/subscribe`) adds emails to ConvertKit forms. Four separate forms handle different subscriber segments.

#### 3a. Get your API key

1. Click your profile icon → **Settings** → **Advanced**.
2. Copy the **API Key** (not the API Secret — you need the v4 Bearer key).
3. In `.env.local`, set:

```
CONVERTKIT_API_KEY=<paste key here>
```

#### 3b. Create four forms

Create one form per subscriber tag. For each form:

1. Go to **Grow** → **Landing Pages & Forms** → **New Form** → **Inline**.
2. Name it exactly as shown below (for your own reference — names aren't used by the code).
3. After saving, click the form → **Settings** → note the **Form ID** from the URL (e.g., `https://app.convertkit.com/forms/12345` → ID is `12345`).

| Form name (for reference)             | Env var                                 |
| ------------------------------------- | --------------------------------------- |
| Withdrawal Field Notes Newsletter     | `CONVERTKIT_FORM_ID_NEWSLETTER`         |
| Lead Magnet — Unsafe Withdrawal Guide | `CONVERTKIT_FORM_ID_LEAD_MAGNET_UNSAFE` |
| Lead Magnet — Family Support Guide    | `CONVERTKIT_FORM_ID_LEAD_MAGNET_FAMILY` |
| B2B Lead Magnet                       | `CONVERTKIT_FORM_ID_B2B`                |

4. In `.env.local`, set all four:

```
CONVERTKIT_FORM_ID_NEWSLETTER=<id>
CONVERTKIT_FORM_ID_LEAD_MAGNET_UNSAFE=<id>
CONVERTKIT_FORM_ID_LEAD_MAGNET_FAMILY=<id>
CONVERTKIT_FORM_ID_B2B=<id>
```

**Expected result:** Entering an email in any signup form on the site adds it to the correct ConvertKit form. You can verify by checking the form's subscriber list in the ConvertKit dashboard.

---

### 4. Set up Calendly (booking links)

**Where:** https://calendly.com

Two Calendly event types are needed — one free fit-check, one paid support call.

#### 4a. Create the Fit Check event type

1. Click **New Event Type** → **One-on-One**.
2. Name: `Free 10-Minute Fit Check`
3. Duration: **10 minutes**
4. Price: **Free** (leave payment off)
5. After saving, click **Copy Link**. It will look like `https://calendly.com/your-username/free-10-minute-fit-check`.
6. In `.env.local`, set:

```
NEXT_PUBLIC_CALENDLY_FIT_CHECK_URL=https://calendly.com/your-username/free-10-minute-fit-check
```

#### 4b. Create the Support Call event type

1. Click **New Event Type** → **One-on-One**.
2. Name: `30-Minute Withdrawal Support Call`
3. Duration: **30 minutes**
4. **Note:** Payment for this call is handled by Stripe (Step 5), not Calendly. You can leave Calendly payment off and use the Stripe link as the primary CTA; Calendly is the "Check availability" secondary link.
5. After saving, copy the booking link.
6. In `.env.local`, set:

```
NEXT_PUBLIC_CALENDLY_SUPPORT_CALL_URL=https://calendly.com/your-username/30-minute-support-call
```

**Expected result:** The "Request a fit check" button on `/services` links to the fit check booking page. The "Check availability" link on the support call card opens the support call booking page.

---

### 5. Set up Stripe (payment links + donation)

**Where:** https://dashboard.stripe.com

Seven Stripe Payment Links are needed: one for the support call service, five for paid PDF resources, and one donation link.

> **Note:** Start in **Test mode** (toggle in the top-left of the Stripe dashboard) until you are ready to accept real payments. Test payment links begin with `https://buy.stripe.com/test_...`.

#### 5a. Create the Support Call payment link ($50)

1. Go to **Payment Links** → **New**.
2. Click **Add a product** → **Create new product**.
3. Name: `30-Minute Withdrawal Support Call`
4. Price: `$50.00` — One time
5. Click **Create link**.
6. Copy the URL.
7. In `.env.local`, set:

```
NEXT_PUBLIC_STRIPE_SUPPORT_CALL_URL=https://buy.stripe.com/...
```

#### 5b. Create payment links for five PDF resources

Repeat the steps above for each product. Use the exact names and suggested prices:

| Product name                                          | Suggested price | Env var                                       |
| ----------------------------------------------------- | --------------- | --------------------------------------------- |
| Family Survival Guide                                 | $12–$20         | `NEXT_PUBLIC_STRIPE_FAMILY_GUIDE_URL`         |
| Appointment Preparation Worksheet                     | $8–$15          | `NEXT_PUBLIC_STRIPE_APPOINTMENT_PREP_URL`     |
| Withdrawal Safety Checklist                           | $8–$15          | `NEXT_PUBLIC_STRIPE_SAFETY_CHECKLIST_URL`     |
| Detox/Treatment Center Comparison Worksheet           | $8–$15          | `NEXT_PUBLIC_STRIPE_TREATMENT_COMPARISON_URL` |
| Post-Withdrawal Relapse-Prevention Planning Worksheet | $8–$15          | `NEXT_PUBLIC_STRIPE_RELAPSE_PREVENTION_URL`   |

**Note on PDF delivery:** Stripe Payment Links alone do not deliver files. After payment, customers land on a Stripe-hosted confirmation page. You will need a separate delivery mechanism — options include: emailing the PDF via a Stripe webhook + Resend, using a service like SendOwl or Gumroad instead of raw Stripe, or adding a custom success page that shows a download link. This is a follow-up task; for now, set the payment links so the buy flow works.

#### 5c. Create a donation link

1. Go to **Payment Links** → **New**.
2. Click **Add a product** → **Create new product**.
3. Name: `Support a Low-Cost Call`
4. Price: Set as **customer chooses** (enable "Let customers decide what to pay" if available, or set a minimum of $5).
5. Click **Create link** and copy the URL.
6. In `.env.local`, set:

```
NEXT_PUBLIC_STRIPE_DONATION_URL=https://buy.stripe.com/...
```

**Expected result:** "Book a support call", "Get the guide", and "Make a donation" buttons on `/services` and `/resources` all link to live Stripe checkout pages.

---

### 6. Verify all variables are set

**Where:** Terminal, project root

Run:

```bash
grep -v "^#" .env.local | grep "="
```

Confirm all 14 variables are present with non-empty values:

```
RESEND_API_KEY
RESEND_TO_EMAIL
CONVERTKIT_API_KEY
CONVERTKIT_FORM_ID_NEWSLETTER
CONVERTKIT_FORM_ID_LEAD_MAGNET_UNSAFE
CONVERTKIT_FORM_ID_LEAD_MAGNET_FAMILY
CONVERTKIT_FORM_ID_B2B
NEXT_PUBLIC_CALENDLY_FIT_CHECK_URL
NEXT_PUBLIC_CALENDLY_SUPPORT_CALL_URL
NEXT_PUBLIC_STRIPE_SUPPORT_CALL_URL
NEXT_PUBLIC_STRIPE_FAMILY_GUIDE_URL
NEXT_PUBLIC_STRIPE_APPOINTMENT_PREP_URL
NEXT_PUBLIC_STRIPE_SAFETY_CHECKLIST_URL
NEXT_PUBLIC_STRIPE_TREATMENT_COMPARISON_URL
NEXT_PUBLIC_STRIPE_RELAPSE_PREVENTION_URL
NEXT_PUBLIC_STRIPE_DONATION_URL
```

**Expected result:** 16 lines of output (14 env vars + 2 email vars).

---

### 7. Restart the dev server

**Where:** Terminal

```bash
# Stop the running server (Ctrl+C), then:
npm run dev
```

Next.js reads `.env.local` at startup. Changes to this file require a server restart.

**Expected result:** The app starts without errors. `NEXT_PUBLIC_*` variables are now embedded in the client bundle.

---

### 8. Set variables in production

**Where:** Your deployment platform (Vercel, Render, Fly.io, etc.)

For each variable in `.env.local`, add it to your deployment platform's environment variable settings. The platform-specific paths:

- **Vercel:** Project → **Settings** → **Environment Variables** → add each key/value → **Save** → redeploy
- **Render:** Service → **Environment** → **Add Environment Variable**
- **Fly.io:** `fly secrets set KEY=value`

> **Warning:** Never commit `.env.local` to git. It is already in `.gitignore`. Only set secrets through your deployment platform's secure secrets UI.

**Expected result:** Production deploys have all variables set. Buttons on the live site link to real Stripe/Calendly pages.

---

## Verification

After completing all steps, verify end-to-end:

- [ ] Submit the contact form at `/contact` and confirm an email arrives at `RESEND_TO_EMAIL`
- [ ] Enter an email in the newsletter signup (footer or resources page) and confirm it appears in the ConvertKit "Withdrawal Field Notes Newsletter" form
- [ ] Click "Request a fit check" on `/services` and confirm it opens the Calendly booking page
- [ ] Click "Check availability" on the support call card and confirm it opens the Calendly support call page
- [ ] Click "Book a support call" and confirm it opens the Stripe checkout for $50
- [ ] Click "Get the guide" on any paid resource and confirm it opens a Stripe checkout
- [ ] Click "Make a donation" on `/resources` and confirm it opens the Stripe donation checkout

## Rollback

All steps above are non-destructive and can be re-run safely. To remove a service integration, delete the corresponding env var from `.env.local` — the API routes degrade gracefully (they return `{ success: true }` without calling the external service when keys are missing).

## Notes & Gotchas

- **`NEXT_PUBLIC_` prefix matters:** Variables prefixed `NEXT_PUBLIC_` are bundled into the browser build. Never put secret API keys in `NEXT_PUBLIC_` variables — they will be publicly visible. Calendly and Stripe URLs are public by design; Resend and ConvertKit keys are not.
- **PDF delivery is not yet wired:** The paid resource Stripe links collect payment but do not automatically deliver the PDFs. This requires a Stripe webhook handler or a third-party digital delivery service (follow-up task).
- **Resend sender domain:** The current `from` address uses `onboarding@resend.dev` (Resend's shared testing domain). Resend may throttle or flag this in production. Add and verify your own domain in the Resend dashboard for reliable delivery.
- **ConvertKit v4 API:** The subscribe route uses the v4 Bearer token API (`/v4/forms/:id/subscriptions`). The API Key field in ConvertKit settings is the correct key — do not use the API Secret.
- **Stripe test vs. live mode:** Test-mode payment links start with `https://buy.stripe.com/test_`. Switch to live mode and recreate the links before launch. Update all `NEXT_PUBLIC_STRIPE_*` env vars with live-mode URLs at that point.

## `.env.local` Template

```bash
# Resend — contact form email delivery
RESEND_API_KEY=
RESEND_TO_EMAIL=

# ConvertKit — newsletter + lead magnet subscriptions
CONVERTKIT_API_KEY=
CONVERTKIT_FORM_ID_NEWSLETTER=
CONVERTKIT_FORM_ID_LEAD_MAGNET_UNSAFE=
CONVERTKIT_FORM_ID_LEAD_MAGNET_FAMILY=
CONVERTKIT_FORM_ID_B2B=

# Calendly — booking links (public, exposed to browser)
NEXT_PUBLIC_CALENDLY_FIT_CHECK_URL=
NEXT_PUBLIC_CALENDLY_SUPPORT_CALL_URL=

# Stripe — payment links and donation (public, exposed to browser)
NEXT_PUBLIC_STRIPE_SUPPORT_CALL_URL=
NEXT_PUBLIC_STRIPE_FAMILY_GUIDE_URL=
NEXT_PUBLIC_STRIPE_APPOINTMENT_PREP_URL=
NEXT_PUBLIC_STRIPE_SAFETY_CHECKLIST_URL=
NEXT_PUBLIC_STRIPE_TREATMENT_COMPARISON_URL=
NEXT_PUBLIC_STRIPE_RELAPSE_PREVENTION_URL=
NEXT_PUBLIC_STRIPE_DONATION_URL=
```
