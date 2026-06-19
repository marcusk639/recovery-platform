# Launch-Readiness TODO

Open action items surfaced during the 2026-06-06 docs-vs-code launch-readiness review
and the Stripe Connect guide work. Companion to `03-launch-roadmap.md` (full analysis)
and `../STRIPE_CONNECT_GUIDE.md`.

Status legend: ☐ open · ◐ in progress · ☑ done

---

## Done this session

- ☑ **regroup functions build fix** — removed stray unterminated `import exa from "exa-`
  in `regroup/functions/src/callable/homegroups.ts:6`. `tsc --noEmit` now passes;
  deploy + Jest unblocked. (roadmap blocker #1)
- ☑ **homegroups secret hygiene** — removed hardcoded Google Maps API key + Stripe
  backup code from comments in `homegroups/functions/src/api/api.ts`.
- ☑ **GOOGLE_MAPS_API_KEY** synced to `recovery-connect-cad4b` Secret Manager (v1).
- ☑ **Maestro E2E scaffold** — `e2e-maestro/` flows for both RN apps.
- ☑ **Docs** — launch roadmap + Stripe Connect guide written.

---

## Stripe Connect — open items

### homegroups

- ☐ **Build the `stripe-redirect` web page.** `createStripeAccountLink.ts:75-76`
  hardcodes `https://homegroups-app.com/stripe-redirect?groupId=...&type=refresh|return`
  as the AccountLink `refresh_url` / `return_url`. This page must:
  1. Exist and resolve at the live production domain.
  2. On `type=return`, confirm onboarding and route the admin back into the app
     (deep link).
  3. On `type=refresh`, re-invoke `createStripeAccountLink` to mint a fresh AccountLink
     (links expire in minutes) and redirect to it.
  - ⚠️ If the production domain is not `homegroups-app.com`, update both URLs in
    `createStripeAccountLink.ts` (and keep them in sync with `web/src/lib/deepLinks.js`
    `WEB_ORIGIN` — see homegroups LAUNCH_BLOCKERS #5).
- ☐ Register the **`stripeConnectWebhook`** endpoint in the `recovery-connect-cad4b`
  Stripe Dashboard and subscribe to `account.updated`,
  `account.application.deauthorized`, and the `payment_intent.*` events processed.
- ☐ Confirm the **Connect webhook signing secret** is set in Secret Manager and that the
  Connect event stream verifies against the correct secret (platform vs Connect stream).
- ☐ Enable **Express** accounts + set Connect branding in the Dashboard.

### regroup

- ☐ **Commit + deploy the build fix** before any Connect work can ship (done in tree,
  needs deploy).
- ☐ Verify **`hostedBaseUrl`** (used for `stripeConnectReauth` + return URLs in
  `payments.ts:467`) points at the live Functions host; deploy `stripeConnectReauth`.
- ☐ Register the webhook endpoint in `phoenix-cleanhouse` and subscribe to
  `account.updated`, `account.application.deauthorized`, `payment_intent.succeeded`,
  `payment_intent.payment_failed`, `charge.dispute.created`, `payout.failed`, and the
  `invoice.*` / `customer.subscription.*` events.
- ☐ Confirm a house only becomes chargeable after `account.updated` flips
  `stripeStatus = "active"` (the `createPaymentIntent` guard at `payments.ts:122`).

### Both

- ☐ End-to-end test Connect on **test-mode** connected accounts: onboard →
  `account.updated` → status flips → take a destination-charge payment → verify transfer
  - application fee appear → payout.

---

## Launch blockers carried from the roadmap (not yet addressed)

### homegroups

- ☐ **Stripe default-price revenue gate** — set a default price on intergroup products
  A/B or `getDefaultPriceForProduct()` throws and all intergroup/treatment checkout
  fails (roadmap #3). Product IDs in `homegroups/functions/.env`
  (`STRIPE_PRODUCT_ID_INTERGROUP_A/B`).
- ☐ **No store submission** — every "download the app" CTA 404s; placeholder
  `id0000000000` in `web/src/lib/deepLinks.js:9` (roadmap #4).
- ☐ **Run full claim-and-pay flow E2E** as a first-time customer (roadmap #6).
- ☐ **Auth authorized domains + email sender + RATS_API_KEY binding** (roadmap #9).
- ☐ **App Check / rate limiting** — none installed; `notSpamming()` is a no-op; two
  public unauth callables (roadmap #8).
- ☐ **CRITICAL `useSelector`-in-`renderItem`** crash flagged in docs (UNVERIFIED in
  code) — confirm and fix (roadmap #14).

### regroup

- ☐ **Rotate + purge 3 leaked service-account keys** from git history (BFG, irreversible
  rewrite) — P0-A (roadmap #2).
- ☐ **Delete E2E test accounts + fake house data** from prod (roadmap #7).
- ☐ **HIPAA / 42 CFR Part 2 BAA legal decision** — do not launch until clarified
  (roadmap #5).
- ☐ **Stripe products + IAP-vs-direct billing decision** ($49/$79) (roadmap #10).
- ☐ **Phantom features vs docs** — e-sign claimed but absent; Oxford CRUD claimed as
  Cloud Functions but implemented client-side. Build them or correct docs/marketing
  (roadmap #11).
- ☐ **Tighten weak Firestore rules** — `bugs`/`feedback`/`issues create` collapse to any
  signed-in user (roadmap #8).
- ☐ **40 npm vulns (3 critical, 16 high)** + EOL stack (RN 0.72, RNFirebase v17,
  SendGrid v7) (roadmap #13).

### Both

- ☐ **ToS / Privacy** hosted at stable HTTPS + active support inboxes (roadmap #12).
- ☐ **Cross-product isolation decision (H11)** — superseded by
  `docs/launch-readiness/recovery-api-meetings-discovery-plan.md`, which consolidates
  meeting **discovery** (not attendance) into recovery-api. The earlier attendance
  proxy (regroup → recovery-api → homegroups) was reverted as dead code; no caller
  ever invoked it (roadmap #15).
