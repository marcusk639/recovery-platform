---
name: regroup-run-functions
description: Run, start, build, test, or interact with the Regroup Firebase Cloud Functions emulator. Use when asked to launch the functions emulator, curl a function, test a callable, or verify a function change locally.
---

> **Unit:** `regroup/` — all relative paths below resolve from there. From the repo root:
> `cd "${CLAUDE_PROJECT_DIR:-$(pwd)}/regroup"` first.
Firebase Cloud Functions for Regroup/RATS. Driven via `curl` against the local Firebase Functions emulator. No GUI — all interaction is HTTP. Run from `regroup/` (this skill's unit's parent — the directory containing `firebase.json`), not `regroup/functions/`.

All paths below are relative to `regroup/`. If your shell is elsewhere, `cd` there first, e.g. `cd "${CLAUDE_PROJECT_DIR}/regroup"`.

## Prerequisites

- Node 20 (Firebase CLI 15 is incompatible with Node 18): `source ~/.nvm/nvm.sh && nvm use 20`
- Java 17+: `java -version` (required by Firebase emulator). Homebrew OpenJDK 17 works.
- Firebase CLI: `/usr/local/bin/firebase`
- Firestore credentials: `regroup/functions/service-key.json`, keyed by `"phoenix-cleanhouse"`.
  `src/scripts/scriptBootstrap.ts` does an **unconditional** `require("../../service-key.json")["phoenix-cleanhouse"]`
  at module load, so Application Default Credentials are never consulted — `gcloud auth application-default login`
  and `GOOGLE_APPLICATION_CREDENTIALS` do **not** work here. The file is gitignored and is currently absent;
  without it every script throws `MODULE_NOT_FOUND` before reaching Firebase. Obtain it from the Firebase console first.

## Build

```bash
cd functions
source ~/.nvm/nvm.sh && nvm use 20
npm run build
```

Output: `lib/` directory with compiled JS.

## Run (agent path)

Start the Functions emulator (from `regroup/`, not `regroup/functions/`):

```bash
source ~/.nvm/nvm.sh && nvm use 20
firebase emulators:start --only functions --project phoenix-cleanhouse
```

Wait until you see: `✔  All emulators ready!`

Functions are served at: `http://127.0.0.1:5001/phoenix-cleanhouse/us-central1/{functionName}`

**Curl an HTTP function** (stripeConnectReauth, stripeConnectReturn, universal):

```bash
curl -s -w "\nHTTP:%{http_code}" http://127.0.0.1:5001/phoenix-cleanhouse/us-central1/universal
```

**Curl a callable function** (expects auth — will return 401 without a token, confirming the function is live):

```bash
curl -s -w "\nHTTP:%{http_code}" -X POST \
  -H "Content-Type: application/json" \
  -d '{"data":{}}' \
  http://127.0.0.1:5001/phoenix-cleanhouse/us-central1/findMeetings
# Returns: {"error":{"message":"Login required","status":"UNAUTHENTICATED"}} HTTP:401
```

**Call a callable with an auth token** (from an authenticated Firebase client session):

```bash
TOKEN="<firebase-id-token>"
curl -s -X POST \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $TOKEN" \
  -d '{"data":{"lat":37.7749,"lon":-122.4194,"radius":10}}' \
  http://127.0.0.1:5001/phoenix-cleanhouse/us-central1/findMeetings
```

**Run tests** (no emulator needed):

```bash
cd functions
source ~/.nvm/nvm.sh && nvm use 20
npm test
```

## Run (human path)

**UNVERIFIED — likely broken as a single command.** `npm run serve` (`build && firebase serve --only functions`) is defined in `functions/package.json` — there is no `regroup/package.json`, so `npm run serve` must be invoked with cwd = `functions/` for npm to find the script at all. But per the Gotchas below, this repo's `firebase.json` lives in `regroup/` and the Firebase CLI here has been observed to require cwd = the directory containing `firebase.json`, not an ancestor lookup — so `firebase serve` running with npm's cwd pinned to `functions/` may not find it. Not able to verify either way without actually running the emulator (out of scope for this pass). Prefer the agent-path `firebase emulators:start --only functions --project phoenix-cleanhouse` from `regroup/` instead, which is confirmed to work:

```bash
source ~/.nvm/nvm.sh && nvm use 20
firebase emulators:start --only functions --project phoenix-cleanhouse
```

If you do want `npm run serve`, try it from `functions/` and fall back to the above if it errors on missing `firebase.json`:

```bash
cd functions
source ~/.nvm/nvm.sh && nvm use 20
npm run serve
```

## Loaded functions (re-derived 2026-09-03 from `functions/src/index.ts` and its re-exports)

This list drifts as functions are added — regenerate it instead of trusting the snapshot below:

```bash
cd functions
grep -n '^export ' src/callable/*.ts src/http/*.ts | grep -v '^.*export \(type\|interface\|const ROLES\)'
grep -n 'as stripeEvents\|as handleStripeConnectWebhook' src/webhooks/*.ts
```

37 callable + HTTP functions load with `--only functions` (callables are served over HTTP too, so both count). Firestore-triggered and pubsub-scheduled functions are **silently skipped** by `--only functions` — see Gotchas:

- Auth (`callable/auth.ts`, 7): addGuestAuthorization, addAdminAuthorization, deleteAdminAuthorization, promoteGuestsToAdmin, removePrivilegesForGuests, verifyUserEmail, givePotentialSuperAdminPrivilege
- Meetings (`callable/meetings.ts`, 2): findMeetings, userIsAtMeeting
- Payments (`callable/payments.ts`, 5): createPaymentIntent, listPayments, listHousePayments, getPaymentMethod, updatePaymentInfo
- Stripe Connect (`callable/payments.ts`, 3): connectStripeAccount, disconnectStripeAccount, getStripeAccountStatus
- Subscriptions (`callable/subscriptions.ts`, 8): createOperatorSubscription, reactivateOperatorSubscription, cancelUserSubscription, updateSubscriptionGuests, updateSubscriptionHouses, applyBundleDiscount, createBillingPortalSession, sendConfirmationEmail
- Oxford House (`callable/oxford.ts`, 2): setOxfordEnabled, castOxfordVote
- Compliance (`callable/compliance.ts`, 1): complianceExport
- Analytics (`callable/analytics.ts`, 1): rentRoiMetrics
- Invitations (`callable/invitations.ts`, 3): createInvitation, peekInvitation, redeemInvitation
- HTTP (`http/stripeConnect.ts`, `http/universal.ts`, 3): stripeConnectReauth, stripeConnectReturn, universal
- Webhooks (`webhooks/stripeWebhook.ts`, 2): stripeEvents (deployed name — module exports it as `stripeWebhook`), handleStripeConnectWebhook

`sendInviteEmails`, which appeared in an earlier version of this list, is **no longer a deployed function** — invite email sending now happens inside the `createInvitation`/`peekInvitation`/`redeemInvitation` flow via the internal `util/inviteEmails.ts` helper, not a standalone callable.

## Migration scripts

For the full safety sequence (build → dry-run → confirm → live), use the `/regroup-run-migration` skill. Quick reference:

```bash
cd functions
source ~/.nvm/nvm.sh && nvm use 20
# Dry run:
STRIPE_SECRET_KEY=sk_test_... npm run migrate:house-sub:dry-run   # use a TEST key for dry runs
# Live run:
STRIPE_SECRET_KEY=sk_live_... npm run migrate:house-sub:run       # live key ONLY for the confirmed live run
```

Scripts require `functions/service-key.json` for Firestore access (NOT ADC — see Prerequisites) and a `STRIPE_SECRET_KEY` env var.

## Gotchas

- **Run from `regroup/`, not `regroup/functions/`** — `firebase.json` is in `regroup/`. Running `firebase emulators:start` from `functions/` fails with "No targets match".
- **Node 18 incompatible** — Firebase CLI 15.5.1 requires Node ≥ 20. Always `nvm use 20` first.
- **Emulator ports shift** if 4000/4400/4500 are already in use — hub moves to 4401, UI to 4001, logging to 4502. This is normal and printed at startup.
- **`node "22"` warning** — the `functions/package.json` requests Node 22 but emulator uses Node 20 from host. Works fine.
- **Firestore/scheduled functions silently skipped** — `--only functions` does not load Firestore triggers (`triggers/firestore/index.ts`: notify, notifyNewHouseCreated, sendContactEmail, sendSubscriptionUpdateEmail, reportBug, submitFeedback, onGuestWrite, notifyOperatorOnApplication) or scheduled functions (`scheduled/`: updateDisputes, weeklyTransfers, warmWebsite, officerTermReminder, overdueRentNotification, scheduledRentCollection). Start the full emulator suite (drop `--only functions`, or add `--only functions,firestore,pubsub`) to test those.
- **Migration script directory confusion** — `regroup/scripts/` (e.g. `deploy-batched.sh`, `preflight-billing.js`) contains separate Node/shell scripts (not Cloud Functions). The Cloud Functions migration scripts live at `functions/src/scripts/` (`migrateGuestWeeks.ts`, `migrateHouseSubscriptionStatus.ts`, `migrateBalanceToCents.ts`, `scriptBootstrap.ts`). Run via `npm run migrate:house-sub:*` from `functions/`.

## Troubleshooting

| Error                                                        | Fix                                                                    |
| ------------------------------------------------------------ | ---------------------------------------------------------------------- |
| `Firebase CLI v15.5.1 is incompatible with Node.js v18.12.1` | `source ~/.nvm/nvm.sh && nvm use 20`                                   |
| `No targets in firebase.json match '--only firestore:rules'` | Run from `regroup/`, not `regroup/functions/`                          |
| `Cannot find module '../../service-key.json'`                | Place `service-key.json` in `functions/` (gitignored; from Firebase console) |
| `STRIPE_SECRET_KEY is required`                              | Pass the env var: `STRIPE_SECRET_KEY=sk_test_... node lib/scripts/...` |
