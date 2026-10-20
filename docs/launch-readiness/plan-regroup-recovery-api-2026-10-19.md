# Launch readiness — regroup + recovery-api — 2026-10-19

**Targets:** `regroup/mobile`, `regroup/web`, `regroup/functions` (project `phoenix-cleanhouse`); `recovery-api` (only where regroup calls it).
**Docs reconciled:** 53 documents under `regroup/docs` (stubs and archives carry nothing to check), 148 claims. The full ledger is [ledger-regroup-recovery-api-2026-10-19.md](ledger-regroup-recovery-api-2026-10-19.md).
**Code base:** `origin/main` at `f5bef2c` (#98). PR #99 (transfer reversals) is open and has not been merged.
**Previous plans:** [plan-regroup-2026-10-02.md](plan-regroup-2026-10-02.md) and [plan-regroup-functions-2026-10-19.md](plan-regroup-functions-2026-10-19.md).

## 1. Verdict

No. An operator can pay today: monthly checkout runs against live prices and the tier flag is on in production. But they can't get what they paid for. **The setup wizard can't create a house for a new operator.** Checkout grants only the unscoped `potentialSuperAdmin` claim. The wizard's batch write needs an `admin` or `superAdmin` claim for that house, and that claim is only granted after the write. The `createHouse` callable meant to break this loop doesn't exist. The rules emulator confirms the denial, and the deployed rules are the same. With no house there is no Connect account, no residents and no rent.

Three engineering fixes stand between here and the first paying customer:

- server-side house creation;
- an invitation signup that doesn't fail;
- account deletion, which App Store review requires.

Beyond those, everything is ops: create the live annual prices, deploy everything merged since 2026-10-13 in the right order, and submit the store builds.

## 2. Go-live backlog

Level is the highest verification reached: L1 means the code was read, L3 means the emulator ran, and L5 means the live system was read.

### BLOCKER — prevents the first paying customer (dependency order)

| #   | Item                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        | ENG/OPS | Ledger IDs                        | Level                                                                                       | Confidence | Effort                    | Depends on                      |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------- | --------------------------------- | ------------------------------------------------------------------------------------------- | ---------- | ------------------------- | ------------------------------- |
| B1  | **Create the house on the server.** Add a `createHouse` callable that checks `potentialSuperAdmin` and an active tier subscription, writes `houses/{id}` and the `admins` doc with the Admin SDK, and grants the house-scoped `superAdmin` claim. Then point `initializeHouses` at it. Today `mobile/src/services/setup-wizard.ts:239-243` commits the batch _before_ `addAdminAuthorization`. `firestore.rules:196` (`houses` create: `isAdmin([houseId])`) and `:130` (`admins` create) both deny an operator who holds only `potentialSuperAdmin` (`functions/src/util/superAdminClaim.ts:6-9`: "belongs to a future `createHouse` callable"). No rule references `potentialSuperAdmin`. | ENG     | REV-A3                            | **L3**: emulator probe failed with PERMISSION_DENIED; deployed rules :188-190 are identical | High       | 1–2 days                  | —                               |
| B2  | **Stop invitation signup from failing after the claim is granted.** `SignUpForm.tsx:154-156` calls `updateSubscriptionGuests({ownerUserId: invitation.ownerId})`. On the token flow `ownerId` is `''` (`native-deep-links.ts:107`), and the schema needs `min(1)` (`callable/subscriptions.ts:127,133`). The callable also requires `ownerUserId === request.auth.uid` (`:454`), which is never true for a resident. `redeemInvitation` already records occupancy, so delete the call.                                                                                                                                                                                                      | ENG     | REV-A1                            | L1 (both sides read)                                                                        | High       | Hours                     | —                               |
| B3  | **Add in-app account deletion.** Nothing in mobile, web or functions deletes the Auth user, the guest doc, the Stripe customer or Storage files. The only deletion is an orphan cleanup at `web/src/app/services/auth-service.service.ts:255`. App Store guideline 5.1.1(v) rejects apps that allow account creation without account deletion.                                                                                                                                                                                                                                                                                                                                              | ENG     | REV-A2, ledger PRIV rows          | L1 (grep across all three packages)                                                         | High       | 2–4 days                  | —                               |
| B4  | **Create live annual prices and set all six `STRIPE_PRICE_*_ANNUAL` values** (or hide the annual toggle). Every deployed annual ID is a test-mode ID: retrieving `price_1TnBmGKsstp3aqoPHD06jOuG` in live mode returns "No such price … exists in test mode". The web signup and pricing pages both offer annual, so annual checkout fails.                                                                                                                                                                                                                                                                                                                                                 | OPS     | RLR-1, P1002 rows                 | **L5** (live Stripe read)                                                                   | High       | Hours                     | —                               |
| B5  | **Ship what's merged, in order:** merge #99 → `npm run deploy:rules` (Firestore + Storage) → `firebase deploy --only functions` (_not_ `deploy:batched`, see M10) → `firebase deploy --only firestore:indexes` → run `migrateBalanceToCents --apply --deployed-at=<that deploy's time>`. Live functions were last deployed 2026-10-13, so #84–#98 are not live. Live rules lack the #96 `stripeAccountApi` guard and the #98 guests both-houses check (14 lines differ). The `ees-records` (houseId, createdAt DESC) index is committed but not deployed.                                                                                                                                   | OPS     | REV-03 (functions plan), DEP rows | **L5** (functions list, rules release, indexes list)                                        | High       | Hours                     | B1–B3 (redeploy once they land) |
| B6  | **Build and submit iOS and Android releases.** Launch requires a store release (confirmed in plan-regroup-2026-10-02). The AGP is now 8.1.1 (`mobile/android/build.gradle:52`), but **no build was run this pass**.                                                                                                                                                                                                                                                                                                                                                                                                                                                                         | OPS     | —                                 | L1 only                                                                                     | Medium     | Days, plus review latency | B1–B3                           |

### MUST-FIX BEFORE LIVE — puts real customers' money, data, PII or trust at risk

| #   | Item                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           | ENG/OPS | Ledger IDs                 | Level                                    | Confidence | Effort                       | Depends on |
| --- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------- | -------------------------- | ---------------------------------------- | ---------- | ---------------------------- | ---------- |
| M1  | **Fix resident activity logging.** `logActivity` saves the activity and then runs a client transaction on `week-summaries` (`mobile/src/services/activity.ts:99-104, 438-482`). The rules allow only admins to write there (`firestore.rules:437`; deployed :429). So every log a resident makes shows "Failed to log activity", although the activity was saved (`activity.ts:113-115`), and their week summary never updates. Move the increment into an `onCreate` trigger on `activities`. | ENG     | FDM-1                      | **L3** (emulator: resident write denied) | High       | ~1 day                       | —          |
| M2  | **Make a subscription lapse actually reach the house.** `updateHouseSubscriptionStatus` (`webhooks/stripeWebhook.ts:231-258`) queries `adminIds`/`adminId` using the operator's **uid**. Houses store Admin doc auto-IDs (`setup-wizard.ts:160,184-185`). So cancelling or missing payments never restricts the house, and the test fixture (`stripeWebhook.test.ts:1719`) ratifies the wrong key. A correct helper already exists at `api/firestore.ts:136`.                                  | ENG     | REV-M1                     | L1 (main-session verified)               | High       | Hours                        | —          |
| M3  | **Hide the autopay toggle, or build resident card-on-file.** `guests.stripeCustomerId` is never written. `defaultPaymentMethodId` is written only by `updatePaymentInfo`, against the operator's customer. So the toggle at `RentPaymentScreen.tsx:243-249` can never cause a charge, and a resident who turns it on believes rent is being paid.                                                                                                                                              | ENG     | REV-M2                     | L1 (main-session verified)               | High       | Hours to hide; days to build | —          |
| M4  | **Hide the "two-factor authentication" screen.** `TwoFactorSetup.tsx:17` links a phone provider (`linkWithCredential`). It doesn't enrol an MFA factor, yet it tells the user the account is "now protected with two-factor authentication".                                                                                                                                                                                                                                                   | ENG     | REV-A11                    | L1                                       | High       | Hours                        | —          |
| M5  | **Stop residents reading housemates' recovery and financial data, and stop guest docs being created in arbitrary houses.** Under `guests` read (`isGuest([houseId])`), every resident can read `drugOfChoice`, `sobrietyDate`, `rentOwed` and emergency contacts for the whole house. `guests` create allows `isSameUser(userId)` for any `houseId`. Move sensitive fields to an admin-only subdocument and require a claim on create.                                                         | ENG     | REV-A6, REV-A7             | L1 (rules read)                          | High       | 1–2 days, with rules tests   | —          |
| M6  | **Stop selling features that don't exist.** The pricing page lists per-tier "Automated rent collection", "Compliance export" and "Analytics & ROI reporting". `automatedRentCollection` is defined in config and the catalog but never enforced. `complianceExport` and `rentRoiMetrics` have no UI caller in mobile or web. Fix the copy or ship the UI.                                                                                                                                      | ENG     | SPEC9-*, TRACK-4, MON rows | L1                                       | High       | Hours (copy)                 | —          |
| M7  | **Payment history and offline resolution are likely denied by the rules.** `payments.guestUserId` is never written, but the read rule keys on it (rules 306-307). `markPaymentResolvedOffline` writes to `payments`, where update is `if false`. These are agent-reported and not main-verified: add an emulator test before fixing.                                                                                                                                                           | ENG     | REV-M6, REV-M7             | L1 (agent)                               | Medium     | Hours                        | —          |
| M8  | **Make production errors visible.** The mobile `ErrorBoundary` still only logs to the console ("Sentry can be added later", `components/ErrorBoundary.tsx:27`), although `Sentry.init` runs (`App.tsx:34`). The rent-job alert policies exist only as templates.                                                                                                                                                                                                                               | ENG+OPS | RLR-4                      | L1                                       | High       | Hours                        | —          |
| M9  | **Verify the recovery-api meetings contract in production.** Regroup calls `findMeetings` server-to-server (`functions/src/api/recoveryApi.ts`) with a service key and app id `phoenix-cleanhouse`. Neither the key provisioning nor the header names against `requireServiceAuth` were checked.                                                                                                                                                                                               | OPS     | REV-A14                    | Not checked                              | Low        | Hours                        | B5         |
| M10 | **Retire or fix `scripts/deploy-batched.sh`.** It still hardcodes 40 names (55 functions are live), still lists the dead `sendInviteEmails` (`:19`), and turns batch failures into success with `\|\| echo` (`:40`). It remains `npm run deploy:batched`.                                                                                                                                                                                                                                      | ENG     | DEP rows                   | L1                                       | High       | Hours                        | —          |

### SHOULD-FIX

| #   | Item                                                                                                                                                                          | ENG/OPS | Ledger IDs     | Level      | Confidence | Effort  | Depends on |
| --- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------- | -------------- | ---------- | ---------- | ------- | ---------- |
| S1  | `addAdminAuthorization` spreads two `createClaims` results built from the same snapshot, so the stale `admin` map wins (`callable/auth.ts`). The operator path is unaffected. | ENG     | REV-A4         | L1         | Medium     | Hours   | —          |
| S2  | Role changes don't refresh the affected user's token. A removed admin keeps access for up to about an hour.                                                                   | ENG     | REV-A5         | L1         | High       | ~1 day  | —          |
| S3  | `redeemInvitation` doesn't require `email_verified`, and the invitation signup skips verification.                                                                            | ENG     | REV-A9         | L1         | Medium     | Hours   | B2         |
| S4  | The legacy no-token invite branches in `SignUpForm` always fail at `assertCanGrantClaimForHouses`. Delete them, or show "ask for a new invite".                               | ENG     | REV-A10        | L1         | High       | Hours   | B2         |
| S5  | The demo account's credentials are in the client (`InitialLandingForm.tsx:76`). Firestore scopes it, but Storage rules and callables have no demo guard.                      | ENG     | REV-A8         | L1         | Medium     | Hours   | —          |
| S6  | `users` update lets clients set `potentialSuperAdmin`, and `houses` update lets them set `oxfordEnabled`/`superAdminIds`. Server entitlement remains the real control.        | ENG     | REV-A12        | L1         | Medium     | Hours   | —          |
| S7  | Storage: `users/{uid}/avatar` can be read by any signed-in user, and the chore-photo path can be written by any house member.                                                 | ENG     | REV-A13        | L1         | High       | Hours   | —          |
| S8  | Rent idempotency key collides on the same day. Grace isn't cleared when a subscription is deleted. `currentPeriodEnd` is taken from `billing_cycle_anchor`.                   | ENG     | money pass §2 (same-day key), REV-M8 | L1 (agent) | Medium     | Hours   | —          |
| S9  | Delete the three test-mode webhook endpoints that point at production (`we_1TnPYQKsstp3aqoPA6Zv8Knd`, `we_1H1DoVKsstp3aqoPUxN8KTrm`, `we_1TnPYRKsstp3aqoPhoIKwfts`).          | OPS     | —              | L5         | High       | Minutes | —          |
| S10 | Drop stale deployed indexes: guests autoPayEnabled+balance, and two `na-meetings` indexes on `gehoash`.                                                                       | OPS     | DEP rows       | L5         | High       | Minutes | B5         |
| S11 | No 90-day purge for applications. The contact domain is inconsistent (`regroup.app` vs `regroup-app.com`).                                                                    | ENG     | PRIV rows      | L1         | Medium     | Hours   | —          |

### DEFERRED — real work, not needed for launch

| Item                                                                                                                | Why it can wait                                                                                                                | Ledger IDs         |
| ------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------ | ------------------ |
| Requirements still MISSING: waitlist, passes/overnights, incidents/infractions, e-sign, announcements, mood/journal | None of them sits on the path from signup to rent landing in the house. They are product-scope decisions (see Open questions). | REQ rows           |
| PARTIAL requirements: resident legal status, reporting, documents, curfew check-in                                  | The core flows work without them.                                                                                              | REQ rows           |
| Accounts v2                                                                                                         | Stripe hasn't granted access. v1 is live and is the default (`config.ts` `connectAccountsApi()`).                              | —                  |
| Web Connect onboarding                                                                                              | Mobile onboarding works, and operators set up from mobile.                                                                     | money reverse pass |
| "Hours saved" ROI metric                                                                                            | The spec itself marks it "Deferred" (TRACK:3).                                                                                 | TRACK-3            |
| Consolidating the 14 E2E docs                                                                                       | Documentation debt. It doesn't affect customers.                                                                               | E2E rows           |

## 3. Already done

| Previously reported                                                 | Evidence it's resolved                                                                                                                                                                    | Doc that still says otherwise                              |
| ------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------- |
| Autopay rent never reached the house (functions plan REV-01)        | `functions/src/scheduled/rentDestination.ts` reads `houses/{id}.stripeAccountId` and requires `stripeStatus === 'active'` (#98)                                                           | `docs/technical/ARCHITECTURE.md` (weekly-transfers model)  |
| Admins could re-home another house's guest                          | `firestore.rules` guests update needs `isAdmin` on both `resource` and `request.resource` houseId (#98). **Not deployed yet (B5).**                                                       | —                                                          |
| Connect needs Accounts v2                                           | v1 Express path, with v2 behind `CONNECT_ACCOUNTS_API` (#96). Deployed value is unset, meaning v1 (L5).                                                                                   | `functions/CLAUDE.md` (Connect in `subscriptions.ts`)      |
| Balance→cents migration unsafe to run                               | `scripts/migrateBalanceToCents.ts` uses `scriptBootstrap`, runs as a dry run by default, and needs `--apply` (#94)                                                                        | `functions/CLAUDE.md` (payments "dollars")                 |
| `regroup/mobile` couldn't bundle (no `metro.config.js`)             | Resolved 2026-10-03 per plan-regroup-2026-10-02                                                                                                                                           | —                                                          |
| Android build blocked on AGP 7.4.2                                  | `mobile/android/build.gradle:52` sets `agpVersion = "8.1.1"`. **The build was not run.**                                                                                                  | plan-regroup-2026-10-02 item 10                            |
| `regroup/web` `npm run build` failed at `copy:hosting`              | `web/package.json:14` now runs `build:ssr && build:functions` with no `copy:hosting`. **The build was not run.**                                                                          | plan-regroup-2026-10-02 item 11                            |
| `scheduledRentCollection` reported SUCCESS when every charge failed | `scheduled/scheduledRentCollection.ts:338-342` rethrows                                                                                                                                   | plan-regroup-2026-10-02 item 6                             |
| `TIER_BILLING_ENABLED` not set in production                        | Deployed value is `true` (L5)                                                                                                                                                             | billing runbook (flag-off claims)                          |
| Tier products have no default price, so checkout throws             | The code uses env price IDs (`util/tierPricing.ts:58`). The live monthly env IDs match live prices (L5). The skill's "no default price" fact doesn't apply here.                          | `.claude/skills/launch-readiness-plan/SKILL.md` repo facts |
| Callable region drift                                               | The server sets no region (`functions/src/init.ts`), mobile uses the default `FirebaseFunctions()`, and web has no `REGION` provider, so everything is us-central1                        | —                                                          |
| Refunds and disputes never reverse the house transfer               | `webhooks/transferReversals.ts` with tests, plus the live endpoint is subscribed to `charge.refund.updated` and `charge.dispute.closed`. **PR #99 is open, so this isn't on `main` yet.** | `docs/operations/stripe-testing.md` (fixed on #99)         |

## 4. Risks

- **High: a paying operator is stranded.** Without B1, an operator completes checkout, starts a trial and hits "Failed to create houses." There is no recovery path in the app. If anyone signs up before B1 ships, the house has to be created by hand in the console.
- **High: residents are told their action failed when it didn't.** M1 means a resident can log a meeting twice after seeing an error. Their weekly compliance summary, which feeds court-facing exports, stays empty.
- **High: housemates can read each other's recovery and financial data.** M5 needs only a modified client or a direct SDK query using the resident's own credentials.
- **Medium: a lapsed operator keeps full access** (M2). That's revenue loss, not customer harm.
- **Medium: deploying from the wrong path.** Anyone who follows `npm run deploy:batched` ships 40 of 55 functions and sees success (M10).
- **Medium: rules drift.** The live rules are already 14 lines behind `main`, and these rules are the security boundary. Deploy rules in the same change window as functions (B5).

## 5. Open questions

- **OPEN QUESTION —** Do any real operators or houses exist in production today, and how were their houses created? (needed to decide: whether B1 also needs a backfill or claim repair for existing accounts.)
- **OPEN QUESTION —** Will annual billing be offered at launch? (needed to decide: whether B4 means creating six live prices or hiding the toggle.)
- **OPEN QUESTION —** Which of waitlist, passes, incidents, e-sign, announcements and journal are launch scope for the first customer? (needed to decide: whether any DEFERRED requirement moves up.)
- **OPEN QUESTION —** Should autopay ship at launch? (needed to decide: whether M3 is a one-hour hide or a multi-day resident card-on-file build.)
- **OPEN QUESTION —** Is the recovery-api service key provisioned for `phoenix-cleanhouse` in the `recovery-platform` project? (needed to decide: whether the meeting search works in production; M9.)
- **OPEN QUESTION —** Pricing, willingness to pay and conversion are not answerable from the repo. None of them is estimated here.

## 6. Doc corrections to hand off (`doc-code-audit`)

- `docs/product/decisions.md`, `roadmap.md` and `monetization/model.md` are superseded stubs with broken links.
- `docs/technical/gap-analysis-production-readiness.md` is stale wholesale; archive it.
- `docs/technical/FIRESTORE-DATA-MODEL.md` has the `houses`/`admins` read rules wrong (FDM-2, FDM-3) and is missing collections (FDM-8).
- `docs/technical/ARCHITECTURE.md` is missing functions, gives the wrong source for `week-summaries`, and still describes five weekly transfers.
- `functions/CLAUDE.md` refers to `auth.ts`, Connect in `subscriptions.ts`, and `triggers/rtdb`, and says payments are "dollars" (FDM-9).
- In the GTM roadmap, "2% fee" and autopay/Oxford wizard listed as "planned" are stale.
- `monetization.md` §4.2 and §4.4 are contradicted (see ledger).
- `RG-SPEC-09` has a stub section.
- The billing runbook's flag-off and API-version claims are stale.
- `regroup/CLAUDE.md` says the legacy subscription path was deleted, but `createOperatorSubscription` still falls back to `initializeCustomer` when the flag is off.
- The 14 E2E docs contradict each other; consolidate them.

## 7. Changes since last plan

- **Newly resolved:**
  - autopay destination (#98);
  - cross-house guest re-homing (#98, undeployed);
  - Accounts v1 (#96);
  - safe cents migration (#94);
  - AGP 8.1.1 and web `copy:hosting` (both L1 only);
  - rent job fails loudly;
  - `TIER_BILLING_ENABLED` confirmed live.
- **Newly discovered:**
  - B1 house creation;
  - B2 invite signup;
  - B4 is now L5-confirmed rather than inferred from file comments;
  - M1 resident logging;
  - M2 lapse lookup;
  - M3 autopay can't fire;
  - M4 2FA;
  - M5 PHI exposure;
  - M6 features sold but missing.
- **Still blocked:**
  - account deletion (B3);
  - the deploy path (M10, the old item 2);
  - indexes deploy target, though the `deploy:indexes` script exists only uncommitted in the main checkout;
  - ErrorBoundary (M8, the old item 5);
  - avatar visibility (S7, the old item 9).
- **Open questions answered:**
  - "Is `TIER_BILLING_ENABLED` true in deployed config?" Yes (L5).
  - "Are the annual price IDs live?" No (L5), which is now B4.
  - "Has autopay ever charged a real resident?" Very unlikely: autopay needs `guests.stripeCustomerId`, which nothing writes (M3). Not confirmed against live data.

## 8. How this was verified

- **Verdict counts across the ledger** (148 claims): 37 IMPLEMENTED · 23 PARTIAL · 12 MISSING · 16 CONTRADICTED · 25 STALE-DOC · 30 UNVERIFIABLE-HERE · 5 not re-checked. There are another 23 reverse-pass findings (REV-M1–M9, REV-A1–A14).
- **Highest level reached per area:**

  | Area                | Level                                                                                  |
  | ------------------- | -------------------------------------------------------------------------------------- |
  | Money path          | L5 (live Stripe prices and env; deployed function list and flags)                      |
  | Auth and onboarding | L3 (rules emulator)                                                                    |
  | Deploy and config   | L5 (deployed rules release and indexes via the firebaserules and Firestore admin APIs) |
  | Store               | L1                                                                                     |
  | Retention           | L1 (partial)                                                                           |
  | Ops                 | L1                                                                                     |
  | recovery-api        | L1 (regroup side only)                                                                 |

- **What was run:**
  - a throwaway rules-emulator probe (`firebase-tools@15 emulators:exec`, removed after the run): a fresh operator batch-creating a house and admin was denied, and a resident writing their own week summary was denied;
  - read-only live checks: Stripe price retrieval in live mode, the deployed functions list and env, the Firestore rules release, and the index list.
- **What was read:**
  - every doc under `regroup/docs`, by three ledger agents;
  - money-path and auth/onboarding reverse passes, by two agents;
  - main-session re-verification of every BLOCKER and MUST-FIX marked "main-session verified" or L3/L5.
- **Approval:**
  - Production reads were read-only, with no writes.
  - Deleting the test-mode webhook endpoints was refused by the permission classifier earlier in the session, so it stays as S9 for the Dashboard.
- **Not checked, and why:**
  - store builds weren't run, because Xcode and Gradle runs were out of scope for this pass;
  - the recovery-api side of the service-auth contract;
  - FCM token storage, because the retention trace was cut short;
  - REV-M6 and REV-M7 at L3;
  - the web Angular signup beyond `cloud-function.service.ts`;
  - live `payments` data, which would need an approved production read.
