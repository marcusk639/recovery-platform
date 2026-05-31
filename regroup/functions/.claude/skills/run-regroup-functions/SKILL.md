---
name: run-regroup-functions
description: Run, start, test, or interact with the regroup-functions Firebase Cloud Functions emulator. Use when asked to launch the functions emulator, curl a function, test a callable, or verify a function change locally.
---

Firebase Cloud Functions for Regroup/RATS. Driven via `curl` against the local Firebase Functions emulator. No GUI — all interaction is HTTP. Run from the `regroup-functions/` parent directory (not `functions/`), that's where `firebase.json` lives.

## Prerequisites

- Node 20 (Firebase CLI 15 is incompatible with Node 18): `source ~/.nvm/nvm.sh && nvm use 20`
- Java 17+: `java -version` (required by Firebase emulator). Homebrew OpenJDK 17 works.
- Firebase CLI: `/usr/local/bin/firebase`
- Google Application Default Credentials: `gcloud auth application-default login`

## Build

```bash
cd /Users/marcusklein/dev/regroup-functions/functions
source ~/.nvm/nvm.sh && nvm use 20
npm run build
```

Output: `lib/` directory with compiled JS.

## Run (agent path)

Start the Functions emulator (from the `regroup-functions/` parent, not `functions/`):

```bash
source ~/.nvm/nvm.sh && nvm use 20
cd /Users/marcusklein/dev/regroup-functions
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
cd /Users/marcusklein/dev/regroup-functions/functions
source ~/.nvm/nvm.sh && nvm use 20
npm test
```

## Run (human path)

```bash
source ~/.nvm/nvm.sh && nvm use 20
cd /Users/marcusklein/dev/regroup-functions
npm run serve   # builds then starts firebase serve --only functions
```

## Loaded functions (verified 2026-05-20)

32 HTTP functions load successfully with `--only functions`. Firestore-triggered and pubsub-scheduled functions are **silently skipped** (emulator only runs functions):

- Auth: addGuestAuthorization, addAdminAuthorization, deleteAdminAuthorization, promoteGuestsToAdmin, removePrivilegesForGuests, verifyUserEmail, givePotentialSuperAdminPrivilege
- Meetings: findMeetings, userIsAtMeeting
- Payments: createPaymentIntent, listPayments, listHousePayments, getPaymentMethod, updatePaymentInfo
- Stripe Connect: connectStripeAccount, disconnectStripeAccount, getStripeAccountStatus, stripeConnectReauth, stripeConnectReturn
- Subscriptions: createOperatorSubscription, reactivateOperatorSubscription, cancelUserSubscription, updateSubscriptionGuests, updateSubscriptionHouses
- Email: sendInviteEmails, sendConfirmationEmail
- Webhooks: stripeEvents, handleStripeConnectWebhook
- Misc: universal

## Migration scripts

```bash
cd /Users/marcusklein/dev/regroup-functions/functions
source ~/.nvm/nvm.sh && nvm use 20
# Dry run:
STRIPE_SECRET_KEY=sk_live_... npm run migrate:house-sub:dry-run
# Live run:
STRIPE_SECRET_KEY=sk_live_... npm run migrate:house-sub:run
```

Scripts require `gcloud auth application-default login` for Firestore access and `STRIPE_SECRET_KEY` env var.

## Gotchas

- **Run from `regroup-functions/`, not `functions/`** — `firebase.json` is in the parent. Running `firebase emulators:start` from `functions/` fails with "No targets match".
- **Node 18 incompatible** — Firebase CLI 15.5.1 requires Node ≥ 20. Always `nvm use 20` first.
- **Emulator ports shift** if 4000/4400/4500 are already in use — hub moves to 4401, UI to 4001, logging to 4502. This is normal and printed at startup.
- **`node "22"` warning** — the `functions/package.json` requests Node 22 but emulator uses Node 20 from host. Works fine.
- **Firestore/pubsub functions silently skipped** — notify, sendContactEmail, reportBug, submitFeedback, onGuestWrite, weeklyTransfers, warmWebsite, officerTermReminder are not loaded with `--only functions`. Start full emulator suite to test those.
- **Migration script directory confusion** — `regroup-functions/scripts/` contains separate Node scripts (not Cloud Functions). The Cloud Functions migration script is at `functions/src/scripts/`. Run via `npm run migrate:house-sub:*` from `functions/`.

## Troubleshooting

| Error                                                        | Fix                                                                    |
| ------------------------------------------------------------ | ---------------------------------------------------------------------- |
| `Firebase CLI v15.5.1 is incompatible with Node.js v18.12.1` | `source ~/.nvm/nvm.sh && nvm use 20`                                   |
| `No targets in firebase.json match '--only firestore:rules'` | Run from `regroup-functions/`, not `regroup-functions/functions/`      |
| `Could not load the default credentials`                     | `gcloud auth application-default login`                                |
| `STRIPE_SECRET_KEY is required`                              | Pass the env var: `STRIPE_SECRET_KEY=sk_live_... node lib/scripts/...` |
