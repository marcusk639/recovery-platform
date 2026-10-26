# Bug-class checklist

The 14 recurring classes, mined from merged PRs and fix commits. `routing.json` decides which classes a run
applies, from the paths a PR touches. Classes 13 and 14 always apply. Evidence entries are history to learn
from, not open issues. Finding `class` numbers in `findings.json` use the numbers below.

## 1. Client-supplied IDs trusted for authorisation or money routing

- **Look for:** a callable or webhook that takes `userId`, `guestId`, `houseId`, `groupId`, a role, or a
  destination account from `request.data` (or Stripe metadata the client influenced) and uses it to decide
  access or where money goes, without deriving it from `request.auth` and a server-side lookup. Also admin
  actions that don't check the target belongs to the caller's own house or group.
- **Trigger paths:** `*/functions/src/callable/**`, `regroup/functions/src/webhooks/**`, `regroup/functions/src/util/houseAuth.ts`, `regroup/functions/src/util/authGuard.ts`, `recovery-api/src/middleware/auth.ts`.
- **Evidence:** #88, #98.

## 2. Money paths not exactly-once

- **Look for:** missing or weak idempotency keys (a key that omits the amount, or the wrong time granularity),
  a webhook event marked done before the work, non-transactional read-modify-write on balances or counters,
  retries that can double-charge, and two writers to one payment document.
- **Trigger paths:** `regroup/functions/src/callable/payments.ts`, `regroup/functions/src/webhooks/stripeWebhook.ts`, `regroup/functions/src/scheduled/scheduledRentCollection.ts`, `homegroups/functions/src/http/stripeWebhook.ts`, `regroup/mobile/src/services/payments.ts`.
- **Evidence:** #74, #80.

## 3. Dollars vs cents across the wire

- **Look for:** `/ 100` or `* 100` added or removed, amounts crossing a callable or Firestore boundary without a
  stated unit, a field documented in one unit and written in another, and plain `number` where the package uses
  branded cents types (`regroup/functions/src/util/money.ts`).
- **Trigger paths:** payment callables and services in both products, `regroup/functions/src/util/rentFee.ts`, analytics and reporting callables, web billing pages.
- **Evidence:** #82, #86.

## 4. Plan-cap or entitlement bypass, and client-only paywalls

- **Look for:** caps checked against state the caller can reset (delete and re-create, re-run setup, a flag on
  a client-writable doc), gates enforced only in mobile or web, and grants that don't survive an add-then-remove
  sequence. The server entitlement (`regroup/functions/src/util/entitlement.ts`, `regroup/functions/src/util/tierCaps.ts`) is the authority.
- **Trigger paths:** `regroup/functions/src/callable/subscriptions.ts`, `regroup/functions/src/callable/houses.ts`, `regroup/functions/src/util/subscriptionHouses.ts`, `regroup/functions/src/util/residentCapacity.ts`, `regroup/mobile/src/hooks/useSubscriptionGate.ts`, `homegroups/functions/src/utils/subscriptionGuard.ts`.
- **Evidence:** #103, #104 (and #59 for the client-only paywall it replaced).

## 5. Firestore rules or index drift, and list queries the rules can't satisfy

- **Look for:** a new `.where` / `.orderBy` combination without a composite index, an index file edit with no
  matching query, a client read or write on a path with no rules block, and list queries whose `where` clauses
  don't prove the rule's condition. See firestore-rules and firestore-indexes in `contract-map-homegroups.md`.
- **Trigger paths:** `homegroups/firestore.rules`, `homegroups/firestore.indexes.json`, `regroup/mobile/firebase/firestore.rules`, `regroup/mobile/firebase/firestore.indexes.json`, `recovery-api/firestore.indexes.json`, any client query.
- **Evidence:** commits 72ba685 and 6bacfef (missing and misordered composite indexes).

## 6. Callable region mismatch, including the v1/v2 `onCall` trap

- **Look for:** a `region` added to a callable or to `setGlobalOptions` without updating every client call site,
  and a v1 `functions.https.onCall(config, handler)` whose `region` is silently ignored at deploy.
- **Trigger paths:** `*/functions/src/index.ts`, `regroup/functions/src/init.ts`, `recovery-api/src/config.ts`, `*/functions/src/callable/**`, client Firebase setup (`regroup/mobile/firebase-setup.ts`, `regroup/web/src/app/app.module.ts`), `regroup/web/firebase.json`.
- **Evidence:** the 2026-08-01 invite-join outage written up in `homegroups/functions/CLAUDE.md`, with regression tests in `homegroups/functions/src/__tests__/joinGroupByInviteCode.test.ts`.

## 7. Overly permissive rules, and PII exposed through data

- **Look for:** rules widened to "any member" or "any admin" for fields only the server should write, reads
  of other users' docs, attendance or recovery-status data visible to people who shouldn't see it, storage
  reads without a membership check, and client state (redux or query caches) not cleared on sign-out or user switch.
- **Trigger paths:** both products' `firestore.rules` and `storage.rules`, `*/mobile/src/**` state stores, callables returning user documents.
- **Evidence:** #79, #61.

## 8. PII in logs

- **Look for:** see logging in `contract-map-cross-product.md`. Names, emails, phones, addresses, sobriety dates,
  health or recovery status, tokens, and whole request bodies in any log call, server or client.
- **Trigger paths:** any `logger.*` / `console.*` change, `regroup/mobile/src/util/logging.ts`, `regroup/mobile/src/util/simple-debug-logger.ts`.
- **Evidence:** #84 (closing the residuals of #23).

## 9. Silent failure reported as success

- **Look for:** `catch` blocks that return `[]`, `null` or `{ success: true }`, fire-and-forget promises on paths
  the caller relies on, `Promise.allSettled` results never inspected, HTTP calls that don't check the response
  status, triggers that return early on a missing field without logging, and UI that shows success before the write lands.
- **Trigger paths:** callables, triggers, schedules, `*/functions/src/api/recoveryApi.ts`, `detox-recovery/app/api/**`, client services.
- **Evidence:** #85, #105.

## 10. Tests that can't fail

- **Look for:** mocks that replace the unit under test, assertions that would still pass with the fix reverted,
  fixtures with fields or ids production never writes, snapshot churn, weakened or removed assertions, and suites
  CI never runs. `.claude/agent-gates/verify-diff.sh` lists the mechanical categories.
- **Trigger paths:** `**/__tests__/**`, `**/*.test.*`, `**/*.spec.ts`, `regroup/e2e/**`, Maestro flows.
- **Evidence:** #104, #98.

## 11. Config and environment mistakes

- **Look for:** localhost or preview origins in production allowlists, scripts or emulators that pick up the
  ambient Firebase project, test webhook endpoints or test keys pointed at production (or the reverse),
  committed secrets or secret-shaped values in any file type, including `.md` and env files, env var renames
  that miss a consumer, and nested workflows that never run.
- **Trigger paths:** `*/firebase.json`, `*/.firebaserc`, env examples, `regroup/e2e/launch-config.json`, `regroup/functions/src/validation/index.ts`, `regroup/functions/src/config.ts`, `homegroups/functions/src/utils/appConfig.ts`, `detox-recovery/apphosting.yaml`, `scripts/**`, `.github/workflows/**`.
- **Evidence:** #94, #99.

## 12. Unbounded reads and fan-out

- **Look for:** queries without `limit`, loops issuing one read per item (O(N) or O(N²) round trips), schedules
  that scan a whole collection, `Promise.all` over unbounded arrays, and notification fan-out to every member
  without batching.
- **Trigger paths:** callables, schedules (`*/functions/src/scheduled/**`, `homegroups/functions/src/triggers/pubsub/**`), triggers, `recovery-api/src/callable/findMeetings.ts`.
- **Evidence:** #75.

## 13. PR text that claims things the code doesn't do

- **Look for:** the PR body or commit messages say a path is fixed, tested, gated or migrated, and the diff
  doesn't show it, or shows it on only one side of a contract. Don't re-raise items the PR body already
  dispositions.
- **Trigger paths:** every PR.
- **Evidence:** #68, #61.

## 14. Cross-product isolation violations

- **Look for:** a new `initializeApp` with another product's `projectId` or credentials, another product's
  project id in a package, `.collection()` on another product's collection names, relative imports that leave
  the package, service-account JSON under `src/`, and referrals or identity flows that skip recovery-api. The
  allowed exception is the non-exported `recovery-api/src/scripts/migrateNaMeetings.ts`.
- **Trigger paths:** every PR. Highest signal in `*/functions/src/**`, `recovery-api/src/**`, `detox-recovery/app/**`.
- **Evidence:** #12, #13 (app-id registry made the single source of truth).
