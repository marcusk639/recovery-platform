# Environment Variables

## Setup

```bash
npm run setup:env       # creates .env.local with Stripe URLs pre-filled
npm run verify:services # confirms every var is set and credentials are valid
```

Never commit `.env.local` — it is in `.gitignore`. In production, secrets are stored in Firebase Secret Manager (see [`docs/deployment.md`](deployment.md)).

---

## Resend — contact form delivery

**Where:** https://resend.com/api-keys

The `/api/contact` route sends inquiry emails via Resend. Without these vars, submissions are accepted by the UI but silently dropped.

| Variable          | Description                                        |
| ----------------- | -------------------------------------------------- |
| `RESEND_API_KEY`  | API key from the Resend dashboard                  |
| `RESEND_TO_EMAIL` | Email address that receives contact form inquiries |

**Setup:**

1. Sign in to Resend → **API Keys** → **Create API Key** (name it `withdrawal-support-contact`)
2. Copy the key (shown once)
3. Add both vars to `.env.local`

**Production note:** The `from` address is set via `RESEND_FROM_EMAIL` (e.g. `"Withdrawal Support <hello@yourdomain.com>"`). It falls back to `onboarding@resend.dev` (Resend's shared testing domain) when the variable is absent. Before launch, verify your domain in the Resend dashboard → **Domains** and set `RESEND_FROM_EMAIL` in `apphosting.yaml`.

---

## MailerLite — newsletter + lead magnet subscribers

**Where:** https://app.mailerlite.com → **Integrations** → **API**

The `/api/subscribe` route adds subscribers to MailerLite groups. Four groups correspond to four subscriber segments.

| Variable                                 | Description                                                              |
| ---------------------------------------- | ------------------------------------------------------------------------ |
| `MAILERLITE_API_KEY`                     | API key from the MailerLite integrations page                            |
| `MAILERLITE_GROUP_ID_NEWSLETTER`         | Group ID for "Withdrawal Field Notes" newsletter                         |
| `MAILERLITE_GROUP_ID_LEAD_MAGNET_UNSAFE` | Group ID for "What to Do When Withdrawal Starts Feeling Unsafe"          |
| `MAILERLITE_GROUP_ID_LEAD_MAGNET_FAMILY` | Group ID for "How to Help Someone in Withdrawal Without Making It Worse" |
| `MAILERLITE_GROUP_ID_B2B`                | Group ID for B2B consulting leads                                        |

**Setup:**

1. MailerLite dashboard → **Subscribers** → **Groups** → create one group per segment above
2. Note each group's numeric ID (visible in the URL when viewing the group)
3. MailerLite → **Integrations** → **API** → copy your API key
4. Add all five vars to `.env.local`

**Group IDs for this project** are stored in `apphosting.yaml` (committed, non-secret). The API key is stored as a Firebase secret — never committed.

---

## Calendly — booking links

**Where:** https://calendly.com

Two Calendly event types are needed. Both URLs are `NEXT_PUBLIC_` — they are bundled into the browser build and are not secret.

| Variable                                | Description                                   |
| --------------------------------------- | --------------------------------------------- |
| `NEXT_PUBLIC_CALENDLY_FIT_CHECK_URL`    | Booking link for the free 10-minute fit check |
| `NEXT_PUBLIC_CALENDLY_SUPPORT_CALL_URL` | Booking link for the 30-minute support call   |

**Setup:**

1. Calendly → **New Event Type** → **One-on-One**
2. Create "Free 10-Minute Fit Check" (10 min, free) and "30-Minute Withdrawal Support Call" (30 min)
3. Activate each event type and set your availability hours + meeting location
4. Copy the public booking URL for each
5. Add to `.env.local`

**Note:** Both event types were created via API and exist in Calendly but may still be set to inactive. Activate them in the Calendly dashboard before launch.

---

## Stripe — payment links + donation

**Where:** https://dashboard.stripe.com → **Payment Links**

Seven Stripe Payment Links. All are `NEXT_PUBLIC_` — safe to expose in the browser. These are plain URL redirects; the site uses no Stripe.js.

| Variable                                      | Product                                               | Price            |
| --------------------------------------------- | ----------------------------------------------------- | ---------------- |
| `NEXT_PUBLIC_STRIPE_SUPPORT_CALL_URL`         | 30-Minute Withdrawal Support Call                     | $50              |
| `NEXT_PUBLIC_STRIPE_FAMILY_GUIDE_URL`         | Family Survival Guide                                 | $19.99           |
| `NEXT_PUBLIC_STRIPE_APPOINTMENT_PREP_URL`     | Appointment Preparation Worksheet                     | $9.99            |
| `NEXT_PUBLIC_STRIPE_SAFETY_CHECKLIST_URL`     | Withdrawal Safety Checklist                           | $9.99            |
| `NEXT_PUBLIC_STRIPE_TREATMENT_COMPARISON_URL` | Detox/Treatment Center Comparison Worksheet           | $9.99            |
| `NEXT_PUBLIC_STRIPE_RELAPSE_PREVENTION_URL`   | Post-Withdrawal Relapse-Prevention Planning Worksheet | $9.99            |
| `NEXT_PUBLIC_STRIPE_DONATION_URL`             | Support a Low-Cost Call (donation)                    | Customer chooses |

All seven links are pre-filled in `apphosting.yaml` and in `npm run setup:env` — they should already be set in `.env.local` after running setup.

**PDF delivery note:** Stripe Payment Links collect payment but do not automatically deliver PDF files. A delivery mechanism (Stripe webhook + email, or a service like Gumroad/SendOwl) is needed before paid resources are sold. See [`docs/features.md`](features.md).

---

## recovery-api — partner referrals (optional)

**Where:** Internal service — https://github.com/your-org/recovery-api

When a contact form submission indicates interest in sober living or 12-step support, the server fires a referral to this shared API. Both vars are optional — the referral silently no-ops if either is missing.

| Variable           | Description                                                            |
| ------------------ | ---------------------------------------------------------------------- |
| `RECOVERY_API_URL` | Base URL of the recovery-api service                                   |
| `RECOVERY_API_KEY` | Shared secret (must match `RECOVERY_PLATFORM_API_KEY` in that service) |

**Local dev:** `RECOVERY_API_URL=http://localhost:8080`  
**Generate a key:** `openssl rand -hex 32`

---

## Security notes

- `NEXT_PUBLIC_*` variables are bundled into the browser build. Only use this prefix for values that are safe to expose publicly (URLs, not API keys).
- Never put `RESEND_API_KEY` or `MAILERLITE_API_KEY` in `NEXT_PUBLIC_` variables.
- In production, `RESEND_API_KEY` and `MAILERLITE_API_KEY` are stored in Firebase Secret Manager — not in `apphosting.yaml`. See [`docs/deployment.md`](deployment.md).
