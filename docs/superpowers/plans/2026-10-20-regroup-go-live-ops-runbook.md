# Regroup Go-Live Ops Runbook (B4, B5, B6)

> **For agentic workers:** These are operations steps, not code. Steps marked **HUMAN** need a person at a console or holding credentials. Agents may prepare commands and verify results, but must not write to production Stripe, deploy, or run `--apply` migrations without the user's explicit go-ahead for that step.

**Goal:**

- annual checkout works in live mode;
- everything merged to `main` is running in `phoenix-cleanhouse`, in an order that can't corrupt payment amounts;
- iOS and Android builds containing B1–B3 are in store review.

**Architecture:** The order is fixed by dependencies:

1. B4, prices, can happen any time.
2. B5 runs twice:
   - **B5a** now, which ships #84–#99;
   - **B5b** after the B1–B3 PRs merge.
3. B6 follows B5b, because the store builds need the `createHouses` and `deleteAccount` callables to be live.

**Spec:** `docs/launch-readiness/plan-regroup-recovery-api-2026-10-19.md`, items B4, B5 and B6.

## Global Constraints

- Project `phoenix-cleanhouse`. Use npm `firebase-tools` (`npx -y firebase-tools@15`), never Homebrew's.
- Deploy functions with `firebase deploy --only functions`, **never** `npm run deploy:batched`. That script ships 40 of 55 functions and reports success on failure (M10).
- The live env file is `regroup/functions/.env`. It is gitignored, never printed, and never committed.
- Record every deploy's start time in ISO-8601 UTC. The payment migration needs it exactly.

## Review Focus

1. **A test-mode price ID left in the env.** Step B4.3 checks all twelve IDs against live mode, not just the six annual ones.
2. **The migration cutoff.** `--deployed-at` must be the B5a functions deploy time. A later guess re-opens the cents/dollars defect for every payment in between (`scripts/migratePaymentAmountsToCents.ts:18-31`).
3. **Rules deployed after functions.** The new code assumes the #96 and #98 rule guards. Rules go first.
4. **Functions deploy that partially fails.** Read the deploy output for any `Failed to update function`. Compare the function count against `functions/src/index.ts` exports (55 at `f5bef2c`, plus 2 after B1 and B3).
5. **Store build pointing at the wrong backend.** The release build must use the production Firebase config and the live Stripe publishable key.

---

### B4: Live annual prices

- [ ] **B4.1 HUMAN.** In the Stripe Dashboard, **test mode**, open each of the six annual prices whose IDs are currently in `.env` as `STRIPE_PRICE_{TRAD_STARTER,TRAD_PROFESSIONAL,TRAD_ENTERPRISE,OXFORD_STANDARD,OXFORD_PLUS,OXFORD_NETWORK}_ANNUAL`. Note each one's `unit_amount`, currency, and `recurring.interval = year`.
- [ ] **B4.2 HUMAN.** In **live mode**, on the matching live tier product (Traditional `prod_UhV6sgrWbOgsyg`, Oxford `prod_UhV71tzKC4XToy`), create six prices with the same amounts, `recurring.interval = year` and the same nickname pattern as the live monthly prices. Put the new IDs in `regroup/functions/.env` under the six `*_ANNUAL` names. If annual is not offered at launch, hide the annual toggle on the web signup and pricing pages instead, and skip B4.2.
- [ ] **B4.3 Verify all twelve IDs are live.** From `regroup/functions`, with the Stripe CLI logged into `acct_1GfryQKsstp3aqoP`:
  ```bash
  for v in $(grep -oE '^STRIPE_PRICE_[A-Z_]+' .env); do id=$(grep "^$v=" .env | cut -d= -f2); \
    printf '%s ' "$v"; stripe prices retrieve "$id" --live | node -e 'const p=JSON.parse(require("fs").readFileSync(0));console.log(p.livemode,p.active,p.recurring?.interval)'; done
  ```
  Expected: every line reads `true true month` for the base vars and `true true year` for the `_ANNUAL` vars. Any `No such price` means the ID is still a test ID.
- [ ] **B4.4** Run `npm run preflight:billing` and expect it to pass. Annual checkout goes live with the next functions deploy (B5a step 3).

### B5a: Ship what is merged now (#84–#99)

- [ ] **5a.1 HUMAN.** Merge #99, then check out `origin/main` in a clean worktree. Run `cd regroup/functions && npm ci && npm run build && npx jest` and expect it to pass.
- [ ] **5a.2 Rules and Storage.**
  - Run `cd regroup/mobile && npm run deploy:rules:dry`, then `npm run deploy:rules`.
  - Verify: `npx -y firebase-tools@15 firestore:rules:get --project phoenix-cleanhouse` (or the console) shows the `stripeAccountApi` guard and the guests both-houses check.
- [ ] **5a.3 Functions.**
  - Write down `DEPLOYED_AT=$(date -u +%Y-%m-%dT%H:%M:%SZ)`, then run `cd regroup/functions && npx -y firebase-tools@15 deploy --only functions --project phoenix-cleanhouse`.
  - Verify: the output has no `Failed`, and `npx -y firebase-tools@15 functions:list --project phoenix-cleanhouse | grep -c '│'` matches the export count.
- [ ] **5a.4 Indexes.**
  - Run `cd regroup/mobile/firebase && npx -y firebase-tools@15 deploy --only firestore:indexes --project phoenix-cleanhouse`.
  - Answer **No** to deleting indexes not in the file; the stale ones are SHOULD-FIX S10, handled separately.
  - Verify: the `ees-records` (houseId ASC, createdAt DESC) index shows `READY`.
- [ ] **5a.5 Balance migration.**
  - Run `npm run migrate:balance-cents:dry-run` and have a person review the report.
  - **HUMAN go-ahead**, then `npm run migrate:balance-cents:apply`.
- [ ] **5a.6 Payment-amount migration.**
  - Rehearse first against the emulator, as the script header says.
  - Then run `node lib/scripts/migratePaymentAmountsToCents.js --deployed-at=$DEPLOYED_AT` (read-only) and have a person review it.
  - **HUMAN go-ahead**, then the same command with `--apply`.
- [ ] **5a.7 Smoke test (live).**
  - Run one live test checkout on the monthly plan and one on the annual plan, with a real card, then refund both.
  - Expected: both subscriptions are created, the webhook events land in `webhookEvents`, and the refund creates the house-share reversal (from #99) or a "no transfer" log for the subscription.

### B5b: Ship B1–B3

- [ ] **5b.1** After the B1, B2 and B3 PRs merge, deploy in this order:
  1. **Rules first.** Repeat 5a.2. This release closes client house creation, restricts house delete to superAdmins, and guards `superAdminId`/`superAdminIds`/`adminId`. It must be live before the new functions, because `createHouses` running against the old, looser rules can be abused to mint superAdmin. Old app builds can't create houses today anyway, so closing the rule costs them nothing.
  2. **Indexes, and wait.** Run `cd regroup/mobile && npm run deploy:indexes` (added by B3). In the console, wait until the collection-group single-field indexes on `applications.applicantUid` and `chat.senderId` show `READY`. Until they do, every account deletion fails at its personal-data step.
  3. **Functions.** Repeat 5a.3, which now includes `createHouses`, the house-delete tombstone trigger and `deleteAccount`.
  4. **App.** The new mobile build (B6) is released only after steps 1–3 are live. Otherwise the wizard calls a callable that doesn't exist yet.
  There is no migration.
- [ ] **5b.2 Smoke test (live).** On a fresh operator account:
  - sign up on web and finish monthly checkout;
  - complete the mobile setup wizard, and expect the house to be created;
  - invite a resident, sign them up from the link, and expect them to land on New Account;
  - delete the resident's account from Personal → Delete account, then the operator's.
  - Expected: no errors, and the house shows `subscriptionStatus: "canceled"` with `closedAt` set.

### B6: Store builds and submission

- [ ] **6.1** Bump `versionCode` (currently 39) and `versionName` ("0.55") in `regroup/mobile/android/app/build.gradle:111-112`, and the matching iOS build number and version in Xcode. Commit with `chore(regroup-mobile): bump version for store release`.
- [ ] **6.2 iOS.**
  - Archive and export the release IPA to `/tmp/regroup-export/rats.ipa`, the path the `beta` lane expects.
  - Run `cd regroup/mobile && bundle exec fastlane ios beta`. Expected: the build uploads to TestFlight.
- [ ] **6.3 Android.**
  - Run `cd regroup/mobile/android && ./gradlew bundleRelease`. Expected: `app/build/outputs/bundle/release/app-release.aab`. AGP 8.1.1 is untested here, so the plan's B6 risk applies: fix build errors with the build-error-resolver agent before going further.
  - Upload to the Play internal track.
- [ ] **6.4 HUMAN.** Run TestFlight and internal-track installs through the 5b.2 smoke test on a physical device of each platform.
- [ ] **6.5 HUMAN.** Submit for review.
  - In the App Store review notes, state where account deletion lives: "Personal → Delete account".
  - Provide a demo login that is **not** the in-app demo credentials (`InitialLandingForm.tsx:76`, S5).
  - Make the privacy labels match what's collected (health-adjacent: sobriety date, drug of choice).
  - Do the Play Data safety form likewise.
