> ⚠️ **Legacy document.** Carried over from the standalone `regroup-rn7` repository, archived on 2026-06-06. Historical reference only — may be outdated and is NOT part of current `mobile` documentation.

# RATS — Performance & Scalability Analysis

**Date:** February 27, 2026
**Reviewer role:** Performance Engineer
**Scope:** Documentation review only — `docs/` and `e2e/` directories
**Not in scope:** Live code profiling, Firestore console metrics, runtime benchmarks

---

## Executive Summary

The RATS documentation describes a system that is architecturally aware of Firestore performance at the design level but has several concrete gaps that will materially hurt performance as the app scales beyond a handful of houses. The most serious documented issues — an N+1 Cloud Function pattern on the operator payment dashboard, five duplicate timezone-split scheduled functions, a Firestore trigger fanout that issues sequential subcollection reads inside a single trigger invocation, and a complete absence of performance or load testing in the E2E suite — are all known to the planning team but none has a concrete sprint task that addresses the root cause. A secondary concern is the ongoing dual-repo deployment ambiguity, which creates operational risk that could mask performance regressions and delay incident response.

The migration from the embedded `currentWeek` / `previousWeek` model to the `WeekSummary` subcollection model is the most important architectural change documented. The migration document is thorough and performance-aware. However, several patterns it introduces create new concerns that it does not fully address: unbounded `activities` array growth inside week documents, a hot-write fan-out on `house-activities` for every resident action, and a sequential per-guest Firestore read loop inside the health-score Cloud Function trigger.

---

## Finding Index

| #    | Title                                                                                      | Severity | Impact Area                                   |
| ---- | ------------------------------------------------------------------------------------------ | -------- | --------------------------------------------- |
| F-01 | N+1 Cloud Function calls on operator payment dashboard                                     | Critical | Network / Cold starts                         |
| F-02 | Sequential per-guest reads inside `onWeekWrite` health trigger                             | Critical | Firestore read cost / Trigger latency         |
| F-03 | Five timezone-variant scheduled functions share identical logic                            | High     | Cloud Function cold start budget              |
| F-04 | `activities` array in week document is unbounded                                           | High     | Firestore document size / Write amplification |
| F-05 | `house-activities` hot-write fan-out                                                       | High     | Firestore write cost                          |
| F-06 | `endOfDayReminder` scheduled function issues N reads per guest                             | High     | Firestore cost at scale                       |
| F-07 | No pagination or cursor documented for house activity feed                                 | High     | Mobile memory / read cost                     |
| F-08 | `disputes` map embedded in house document is unbounded                                     | Medium   | Firestore document size                       |
| F-09 | House score trigger issues sequential per-guest subcollection reads                        | Medium   | Trigger latency / Read cost                   |
| F-10 | `subscriptionMetadata` loaded once at login, never refreshed                               | Medium   | Stale state / Revenue correctness             |
| F-11 | 13 independent `useAppSelector` calls in `App.tsx`                                         | Medium   | React render performance                      |
| F-12 | Wildcard lodash imports block Metro tree-shaking                                           | Medium   | JS bundle size                                |
| F-13 | No performance SLAs defined except one dashboard goal                                      | Medium   | Observability gap                             |
| F-14 | Zero load or stress testing in E2E suite                                                   | Medium   | Unknown breaking point                        |
| F-15 | Firestore indexes documented but no `firestore.indexes.json` deployment step in any sprint | Medium   | Query performance                             |
| F-16 | RTDB vs Firestore choice for live feed not finalized                                       | Low      | Latency / cost tradeoff                       |
| F-17 | Offline persistence not configured                                                         | Low      | Mobile UX under poor connectivity             |
| F-18 | Dual-repo deployment ambiguity creates performance regression blind spot                   | Low      | Operational risk                              |

---

## Detailed Findings

---

### F-01 — N+1 Cloud Function Calls on Operator Payment Dashboard

**Severity: Critical**
**Source document:** `ACTIVE_PLAN.md`, Part 3, Section B ("Operator Payment Dashboard")

**What the documentation says:**

> "N+1 Cloud Function calls — Dashboard calls `listPayments` once per guest. 15 residents = 15 cold Cloud Function invocations = 5-10 second load time."

This is the only place in the documentation where a concrete latency number is cited for a user-facing interaction. A 5-10 second load time on the primary revenue dashboard is a critical performance defect.

**Root cause as documented:**

The current payment dashboard fires one `listPayments` callable invocation per resident. With Cloud Functions v2 cold start times of 1-3 seconds (per `ACTIVITY_SYSTEM_MIGRATION.md` Section 2.2) and a typical sober living house of 10-15 residents, the dashboard incurs 10-45 sequential cold-start penalties on first load.

**Sprint 6 proposes the correct fix:**

> "6.1 Create `listHousePayments(houseId)` Cloud Function | Backend | 1 day"
> "6.2 Rebuild PaymentDashboard with React Query, single endpoint | Performance | 1 day"

**Gap in documentation:**

The Sprint 6 task is described but there is no specification for what `listHousePayments` should return, how it should paginate, what `staleTime` React Query should use, or whether the data should be cached in Redux. Without those details, Sprint 6.2 may produce a single-call endpoint that still loads all payment history for all residents (unbounded), simply combining N calls into one slow call.

**Recommendation:**

Document `listHousePayments` as returning paginated results (30 payments per page, cursor-based). Specify `staleTime: 5 * 60 * 1000` and `cacheTime: 30 * 60 * 1000` in the React Query hook. Add a Firestore composite index on `payments` by `(houseId, createdAt DESC)` to the index documentation. Add a Firestore security rule that allows this query only for house admins.

**Estimated impact if unaddressed:** Dashboard remains unusable at 10+ residents. Direct revenue harm because operators cannot see payment status.

---

### F-02 — Sequential Per-Guest Reads Inside `onWeekWrite` Health Trigger

**Severity: Critical**
**Source document:** `ACTIVITY_SYSTEM_MIGRATION.md`, Section 5.3 ("House Score Calculation")

**What the documentation shows:**

```typescript
// Documented in ACTIVITY_SYSTEM_MIGRATION.md
for (const guestDoc of guests.docs) {
  const weekDoc = await db
    .collection('guests')
    .doc(guestDoc.id)
    .collection('weeks')
    .doc(currentWeekId)
    .get();
  // ...
}
```

This trigger fires on every write to `guests/{guestId}/weeks/{weekId}`. Inside the trigger, it sequentially awaits a subcollection read for each guest in the house before computing the aggregate health score. For a 15-resident house, this means 15 sequential Firestore reads inside a single trigger invocation, plus 2 reads to load the guest and house documents — 17 total reads per activity event.

**Compounding factor:**

Every activity a resident logs (meeting, chore, medication, curfew check-in) triggers this chain. A house with 15 residents logging activities throughout the day could trigger this path 50-100 times per day, each time reading 17 documents.

**Cost implication:**

At 100 triggers/day x 17 reads = 1,700 reads/day per house. At 100 houses, that is 170,000 reads/day from trigger overhead alone, at Firestore pricing of $0.06/100K reads = roughly $3.70/day or $110/month at 100 houses from trigger reads only.

**What the documentation does not address:**

There is a debounce check in the documented code (`scoreLastCalculated > fiveMinutesAgo`) but the reads that occur to _check_ this condition still happen on every trigger invocation, including the guest read and house read. The debounce only skips the per-guest loop — it does not skip the 2 prerequisite reads.

The documented trigger also does not parallelize the per-guest reads with `Promise.all`. All 15 guest week reads execute sequentially, adding latency proportional to guest count.

**Recommendation:**

1. Parallelize the inner loop: replace the `for...of await` pattern with `await Promise.all(guests.docs.map(...))`.
2. Store the current week's `healthScore` on the week document itself (already done in the schema) and denormalize only the house aggregate. Avoid re-reading all guest weeks from inside a trigger — instead have the week document write update only `house.health[date]` using the guest's pre-computed `healthScore`, not a full recalculation of all guests.
3. Document this architectural change in the migration guide. The current guide describes the naive sequential approach as the reference implementation.

**Estimated impact:** At scale (50+ houses), this trigger pattern becomes the dominant cost driver in Firestore reads.

---

### F-03 — Five Timezone-Variant Scheduled Functions Share Identical Logic

**Severity: High**
**Source document:** `ACTIVE_PLAN.md`, Phase 1 context (Phase 5, "Scheduled functions run 5 separate timezone variants for weekly transfer")

**Context from the documentation:**

The five timezone-variant scheduled functions (`weeklyTransferET`, `weeklyTransferCT`, `weeklyTransferMT`, `weeklyTransferPT`, `weeklyTransferAK` or equivalent) all call the same underlying `transferStats()` function with different timezone parameters. The ACTIVE_PLAN identifies this as "potential over-engineering."

**Performance implications not addressed in any sprint:**

1. Each variant is a separate deployed Cloud Function, which means 5 separate cold-start instances maintained by GCP. The Cloud Functions v2 migration (referenced in ACTIVE_PLAN.md) charges per-invocation and has minimum instance configuration. Running 5 identical functions that call the same logic wastes both cold-start budget and increases the infrastructure surface that must be maintained.

2. None of the sprint plans (Sprint 1 through Sprint 9 in ACTIVE_PLAN.md) includes a task to consolidate these into a single function that accepts timezone as a parameter and is called from a single scheduled trigger.

3. The `CLOUD_FUNCTIONS_REVIEW.md` shows the replacement `transferStats` function already accepts a `timezone` parameter — meaning the consolidation is architecturally ready but no one has written the task to actually collapse the 5 functions into 1.

**Recommendation:**

Add a task to Sprint 9 (Quality and Launch Prep): "Consolidate 5 timezone-variant weekly transfer functions into a single parameterized function triggered by one Cloud Scheduler job per timezone. Reduce deployed function count from 5 to 1." This is low risk (logic already separated) and reduces the cold-start budget by 80% for this function group.

---

### F-04 — `activities` Array in Week Document Is Unbounded

**Severity: High**
**Source document:** `ACTIVITY_SYSTEM_MIGRATION.md`, Section 4.2

**What the documentation says:**

> "Size: ~2-5KB per week (activities array adds ~200 bytes per activity, ~50 activities max)"

The documentation estimates a maximum of 50 activities per week but provides no enforcement mechanism. A resident who logs curfew check-ins daily (7), meetings daily (7), work hours daily (7), chore completion daily (7), medication daily (7), and has disputes initiated (variable) could easily exceed 50 entries — particularly if dispute-related activities (`dispute_initiated`, `dispute_resolved`) are logged per the documented `ActivityType` union.

**The critical issue:**

Every activity write uses `FieldValue.arrayUnion(activityEntry)` to append to the `activities` array inside the week document. Firestore bills for the entire document on each write, not just the changed field. A week document that has grown to 30KB (150+ activities, disputed and re-resolved multiple times) incurs a write cost proportional to its full size, not just the 200-byte increment.

**No cap or pagination documented:**

The documentation does not specify:

- A maximum `activities` array length before overflow to a separate subcollection
- A TTL or pruning strategy for resolved disputes within the array
- How the client renders the activity list if the array contains 200+ entries (is the entire array fetched and rendered?)

The `getGuestActivities()` method in Section 5.1 reads the entire week document and returns the full `activities` array sorted in memory — no pagination:

```typescript
static async getGuestActivities(guestId: string): Promise<ActivityLogEntry[]> {
  const weekDoc = await getWeekRef(guestId, getWeekId()).get();
  const week = weekDoc.data() as WeekDocument;
  return (week.activities || []).sort(...);
}
```

**Recommendation:**

1. Document a maximum array length of 100 entries. When exceeded, overflow activities to a `guests/{guestId}/weeks/{weekId}/overflow-activities` subcollection.
2. Add a note to the migration guide that the activities array is read-once and sorted in memory — if it grows large, this becomes a mobile memory concern. Add cursor-based pagination to `getGuestActivities`.
3. Separate the `activities` array (needed for disputes) from the display history feed. The house-activities collection already serves the display purpose; the week document array serves dispute reference only and can be pruned of `resolved` entries after 30 days.

---

### F-05 — `house-activities` Hot-Write Fan-Out

**Severity: High**
**Source document:** `ACTIVITY_SYSTEM_MIGRATION.md`, Section 3.3 (Data Flow Examples)

**What the documentation describes:**

Every activity a resident logs — meeting attendance, work hours, chore completion, medication, curfew check-in — writes to two locations atomically:

1. `guests/{guestId}/weeks/{weekId}` (the week document)
2. `house-activities/{activityId}` (the shared collection)

This means the `house-activities` collection receives a write for every individual activity across all residents in all houses. For a 15-resident house where each resident logs 5 activities per day (meetings, chore, work, medication, curfew), that is 75 writes/day to `house-activities` for one house, or 7,500 writes/day at 100 houses.

**The concern not documented:**

The `house-activities` collection is queried with a real-time listener (`subscribeToHouseActivityFeed`) filtered by `houseId`. Firestore charges for listener updates on every document matching the subscription. The listener has a `limit(50)` clause, but any write to any `house-activities` document where `houseId` matches will wake the listener and transmit data to the mobile client, even if the new document falls outside the visible 50-item window in some implementations.

Additionally, the collection is queried by multiple composite indexes (`houseId + createdAt`, `houseId + type + createdAt`, `houseId + disputeStatus`). Each write to `house-activities` must update all relevant indexes. With three composite indexes, each write triggers three index updates in addition to the document write itself — 4 write operations per activity.

**Recommendation:**

1. Document the write amplification factor explicitly: 1 activity = 4 Firestore writes (1 week doc update, 1 house-activities document, 2 index updates for the compound query indexes).
2. Evaluate whether the real-time listener on `house-activities` should be replaced with a manual refresh pattern or a RTDB-backed live feed as already suggested in Section 2.3 of the migration document. The RTDB suggestion is currently documented as a "recommendation" but not scheduled in any sprint.
3. Add a cost estimate to the migration document's Section 8 for the write amplification at the 100-house scale target.

---

### F-06 — `endOfDayReminder` Scheduled Function Issues N Reads Per Guest

**Severity: High**
**Source document:** `ACTIVITY_SYSTEM_MIGRATION.md`, Section 5.3 (Push Notifications Trigger)

**What the documented code does:**

```typescript
for (const guestDoc of guests.docs) {
  const weekDoc = await db
    .collection('guests')
    .doc(guestDoc.id)
    .collection('weeks')
    .doc(currentWeekId)
    .get();
```

The `endOfDayReminder` runs at 9 PM and loads all houses, then for each house loads all guests, then for each guest does a sequential subcollection read to check today's stats. With 100 houses averaging 12 residents:

- 1 read for all houses
- 100 reads for all guests per house (via `where('houseId', '==', ...)`)
- 1,200 sequential subcollection reads (one per guest)

Total: approximately 1,301 Firestore reads per execution, all sequential.

**No parallelization documented:**

The code uses a nested `for...of` with `await` for the inner subcollection reads. At Firestore read latency of ~50-100ms per document, 1,200 sequential reads = 60-120 seconds of sequential I/O. Cloud Functions v1 has a 540-second timeout; v2 has a configurable limit. This scheduled function approaches timeout limits at modest scale.

**Recommendation:**

1. Parallelize with `Promise.all` at the guest-week read level.
2. Consider storing `todaysStats` as a lightweight field on the guest document (updated on each stat write) to avoid the subcollection read entirely. This is a denormalization trade-off already used elsewhere in the model.
3. Document a scale ceiling: "This function architecture supports up to ~50 houses (600 guests) before Cloud Function timeout becomes a risk. Beyond 50 houses, use Cloud Tasks to fan out per-house."

---

### F-07 — No Pagination or Cursor Strategy Documented for House Activity Feed

**Severity: High**
**Source document:** `ACTIVITY_SYSTEM_MIGRATION.md`, Section 5.1 (`getHouseActivityFeed`)

**What the documentation shows:**

```typescript
static async getHouseActivityFeed(
  houseId: string,
  options: { limit?: number; startAfter?: Timestamp; type?: ActivityType } = {},
) {
  let query = firestore
    .collection('house-activities')
    .where('houseId', '==', houseId)
    .orderBy('createdAt', 'desc')
    .limit(options.limit || 50);
```

The service method accepts `startAfter` for cursor-based pagination. However:

1. No documentation describes how the mobile client should manage cursor state, when to load the next page, or how to merge new real-time updates with previously paginated results.
2. The real-time subscription (`subscribeToHouseActivityFeed`) always fetches the latest 50 items but has no mechanism to load older items. These are two separate methods with no documented reconciliation pattern.
3. The `ACTIVITY_SYSTEM_TEST_PLAN.md` specifies "All queries <500ms" as a performance SLA but does not include a test case for paginated feed loading or for the feed after 1,000+ activities have accumulated.
4. No documentation addresses what happens to the mobile app's memory when a user scrolls through a very long feed — whether the FlatList uses `removeClippedSubviews` or windowing, for example.

**Recommendation:**

Document a cursor reconciliation pattern: the real-time listener covers the most recent 50 items; the `startAfter` cursor is stored in component state and used for "load more" button presses, appending to a local list. Add a test case to `ACTIVITY_SYSTEM_TEST_PLAN.md` for "load more" pagination correctness and for memory behavior with 500+ items in the list.

---

### F-08 — `disputes` Map Embedded in House Document Is Unbounded

**Severity: Medium**
**Source document:** `ACTIVITY_SYSTEM_MIGRATION.md`, Section 4.4

**What the documentation says:**

Disputes are stored as `houses/{houseId}.disputes.{disputeId}` — a map field on the house document. The house document is already a heavy document (it contains `phases`, `health` history, `chores`, and now `disputes`). The documentation notes disputes auto-resolve after 48 hours, but does not specify what happens to resolved dispute records.

**The concern:**

If resolved disputes are retained in the `disputes` map (which the `resolveDispute` function does — it sets `status: 'resolved'` but does not delete the entry), the map grows unboundedly. A house with 15 residents and an active dispute culture could accumulate hundreds of resolved dispute entries over months. Firestore documents have a 1MB limit. The documentation does not specify a TTL or pruning strategy for resolved dispute entries.

**Recommendation:**

Add to Section 4.4: "Resolved disputes are pruned from `house.disputes` after 30 days. A monthly Cloud Function archives resolved disputes to `dispute-archive/{houseId}/{year}` and removes them from the house document." This is a one-sentence addition to the spec that prevents a slow document bloat failure.

---

### F-09 — House Score Trigger Issues Sequential Per-Guest Subcollection Reads

**Severity: Medium**
**Source document:** `ACTIVITY_SYSTEM_MIGRATION.md`, Section 5.3 (the `updateHouseScore` trigger, separate from F-02)

**Overlap with F-02:**

This finding is distinct from F-02. The `onWeekWrite` health score trigger documented in Section 5.3 explicitly shows a sequential `for...of` loop over `guests.docs` with `await` on each iteration to read the guest's current week subcollection. The debounce (`scoreLastCalculated > fiveMinutesAgo`) reduces execution frequency but does not eliminate the sequential reads when the debounce condition is not met.

**Specific code from documentation:**

```typescript
for (const guestDoc of guests.docs) {
  const weekDoc = await db
    .collection('guests')
    .doc(guestDoc.id)
    .collection('weeks')
    .doc(currentWeekId)
    .get();
  if (weekDoc.exists) {
    totalScore += weekDoc.data().healthScore || 0;
    guestCount++;
  }
}
```

The fix is already partially in place — the week document already stores `healthScore` as a pre-computed field. The aggregate can be computed without reading each guest's week if instead the guest document itself stores its current `healthScore`. The trigger would then read only the `guests` collection documents (not their subcollections) to compute the house aggregate.

**Recommendation:**

Amend the architecture documentation: when a week document is written, the `onWeekWrite` trigger should update `guest.currentHealthScore` on the parent guest document using the already-computed `healthScore` field. The house aggregate trigger then reads only from the `guests` collection (flat documents, no subcollections), reducing the read depth from 2 levels to 1 and enabling `Promise.all` parallelism.

---

### F-10 — `subscriptionMetadata` Loaded Once at Login, Never Refreshed

**Severity: Medium**
**Source document:** GTM action plan (`docs/plans/2026-02-23-gtm-action-plan.md`, Section 2, Fix B)

**What the documentation says:**

> "`userRTK.user.subscriptionMetadata` is loaded once at login and never updated via live Firestore listener. Operators whose payment fails mid-session see stale state."

This is documented as Fix B in the revenue infrastructure section, but it has no corresponding sprint task in Sprint 5 through Sprint 9. The GTM plan identifies it but the ACTIVE_PLAN does not assign it to any sprint.

**Performance and revenue implication:**

An operator whose Stripe subscription lapses mid-session will continue to see the full app because their Redux state still shows `subscriptionIsActive: true`. Conversely, an operator whose payment processes during a session won't see the paywall lift without restarting. This stale-state problem is also relevant to the `oxfordEnabled` flag: if an operator subscribes to Oxford tier, they must restart the app to access Oxford features.

**Recommendation:**

Assign this as task 9.X in Sprint 9. The fix is a single `onSnapshot` listener on the user's Firestore document that dispatches a Redux action when `subscriptionMetadata` changes. The performance cost is one persistent listener per active user session — negligible. The revenue protection is significant.

---

### F-11 — 13 Independent `useAppSelector` Calls in `App.tsx`

**Severity: Medium**
**Source document:** `docs/plans/2026-02-23-sprint-1-stability.md`, Task 5

**What the documentation says:**

> "Lines 74-87 have 13 separate `useAppSelector` calls — each creates an independent Redux subscription. Any state change in `userRTK` triggers all 13. Collapsing them into `createSelector` memoized selectors reduces re-renders by 60-70%."

Sprint 1 includes the correct fix (Task 5: memoize with `createSelector`). This is documented and scheduled.

**Residual concern not addressed:**

The Sprint 1 plan only addresses `App.tsx`. The documentation does not audit other high-frequency render components (e.g., `GuestList`, `HouseScreen`, `ActivitiesScreen`) for similar unmemoized selector patterns. With 16 RTK slices documented in the ACTIVE_PLAN, this pattern is likely replicated in other screens.

**Recommendation:**

Add a post-Sprint-1 follow-up: "Audit all screen components for multiple independent `useAppSelector` calls. Apply `createSelector` wherever 3+ selectors reference the same slice." This is a one-day audit task, not a large refactor.

---

### F-12 — Wildcard Lodash Imports Block Metro Tree-Shaking

**Severity: Medium**
**Source document:** `docs/plans/2026-02-23-sprint-4-architecture.md`, task context

**What the documentation says:**

Sprint 4 replaces wildcard lodash imports (`import _ from 'lodash'`) with named imports across 40+ files. The stated rationale is "so Metro's tree-shaker can drop unused functions."

**What the documentation does not quantify:**

The current bundle size impact of including all of lodash is not documented. Lodash is approximately 530KB unminified / 70KB minified+gzipped. If only 10-15 functions are actually used across the codebase, named imports could save 30-50KB of the minified bundle. This is a meaningful reduction for a React Native app targeting iOS 13.0 where older devices have tighter memory constraints.

Sprint 4 is scheduled and addresses the root cause. The gap is that no before/after bundle size measurement is planned or documented — so the team cannot verify the improvement after Sprint 4 completes.

**Recommendation:**

Add to Sprint 4's verification checklist: "Run Metro bundle analyzer before and after lodash migration. Document bundle size delta." The Metro bundler supports `--bundle-output` and `react-native-bundle-visualizer` can report per-package sizes.

---

### F-13 — No Performance SLAs Defined Except One Dashboard Goal

**Severity: Medium**
**Source document:** `ACTIVE_PLAN.md`, Part 6 (Success Metrics); `ACTIVITY_SYSTEM_TEST_PLAN.md`, Section 1

**What the documentation provides:**

The ACTIVE_PLAN defines one latency SLA:

> "Dashboard loads <2s for 20 residents"

The ACTIVITY_SYSTEM_TEST_PLAN adds:

> "Performance: All queries <500ms, writes <200ms"

**What is missing:**

No other screen has a documented latency budget. There are no SLAs for:

- Activity feed initial load time
- Authentication flow completion (login to home screen)
- Guest stats screen render after navigation
- Dispute resolution confirmation round-trip
- Cloud Function response times for payment intent creation
- PDF compliance report generation time

The 500ms query SLA in the test plan applies to the activity system specifically and is not tested in the E2E suite (see F-14). There is no mechanism to verify it is met in production.

**Recommendation:**

Add a "Performance Budget" section to `ACTIVE_PLAN.md` that defines SLAs for the 5 most user-critical flows: login, dashboard load, activity feed, payment initiation, and PDF export. Tie these to observable Sentry transaction metrics (Sentry is already initialized per the ACTIVE_PLAN).

---

### F-14 — Zero Load or Stress Testing in E2E Suite

**Severity: Medium**
**Source document:** `e2e/` directory (all test files); `ACTIVITY_SYSTEM_TEST_PLAN.md`

**What exists:**

The E2E suite (`e2e/tests/`) contains 12 test files covering: auth login, auth signup, activity verification, authorization RBAC, dispute system, guest invitation, guest stats, house setup, manager invitation, operator complete setup, signup via invite, and resident payment. These are all functional correctness tests.

**What is absent:**

No E2E or integration test in the entire documentation set describes:

- Concurrent write behavior (two residents logging activities simultaneously)
- Dashboard load time measurement under representative data volume (e.g., 15 residents with 4 weeks of history)
- Activity feed scroll performance with 200+ items
- Cloud Function response time measurement
- Firestore listener re-connection behavior after network loss
- Payment flow latency under real Stripe sandbox conditions

The `ACTIVITY_SYSTEM_TEST_PLAN.md` specifies "All queries <500ms, writes <200ms" but Section 3.3 (E2E Tests) lists only functional flows (`completeChore.e2e.ts`, `logMeeting.e2e.ts`). There is no `performance.e2e.ts` or timing assertion in any documented test.

**Recommendation:**

Add a performance test suite entry to `ACTIVITY_SYSTEM_TEST_PLAN.md` Section 5 with 3 minimum test cases:

1. Measure and assert activity feed initial load time <1s with 100 seeded house-activities documents.
2. Measure and assert week stats screen render time <500ms after navigation.
3. Measure and assert Cloud Function `createPaymentIntent` p95 response time <3s using Stripe test mode.

These can use Detox's built-in performance utilities and do not require external load testing infrastructure.

---

### F-15 — Firestore Indexes Documented but No Deployment Step in Any Sprint

**Severity: Medium**
**Source document:** `ACTIVITY_SYSTEM_MIGRATION.md`, Sections 4.3 and 4.6

**What the documentation provides:**

Section 4.3 and 4.6 of the migration document are the most thorough performance-aware documentation in the entire docs/ directory. They explicitly enumerate all required composite indexes:

```json
{ collection: "house-activities", fields: ["houseId ASC", "createdAt DESC"] }
{ collection: "house-activities", fields: ["houseId ASC", "type ASC", "createdAt DESC"] }
{ collection: "house-activities", fields: ["houseId ASC", "disputeStatus ASC"] }
{ collection: "weeks", fields: ["startDate DESC"] }
```

**What is missing:**

None of the sprint plans (Sprint 5 through Sprint 9 in ACTIVE_PLAN.md) include a task to create or deploy `firestore.indexes.json`. Without deployed indexes, queries on `house-activities` with `orderBy('createdAt')` will fail with Firestore's "index required" error on first production query. The migration plan's Phase 1 tasks include "Create Firestore Indexes" (`firebase deploy --only firestore:indexes`) but this migration plan is not on any active sprint.

**Recommendation:**

Add to Sprint 5 task 5.X: "Create `firestore.indexes.json` with the 4 composite indexes from `ACTIVITY_SYSTEM_MIGRATION.md` Section 4.6. Deploy to Firebase project before any house-activities queries go live." This is a 30-minute task that prevents production query failures.

---

### F-16 — RTDB vs Firestore Choice for Live Feed Not Finalized

**Severity: Low**
**Source document:** `ACTIVITY_SYSTEM_MIGRATION.md`, Section 2.3

**What the documentation says:**

> "Recommendation: Consider Realtime Database for a live 'house activity feed' showing real-time updates of all guest activities."

The document recommends RTDB for the house activity feed but proposes Firestore (`house-activities`) as the implementation. The RTDB recommendation is marked as "Consider" with no follow-up decision or justification for why Firestore was chosen instead.

**Performance implication:**

RTDB at `activity-feed/{houseId}/{activityId}` with 7-day TTL would cost significantly less for the real-time listener pattern than the Firestore `house-activities` listener. RTDB charges $5/GB of storage and $1/GB of downloads, with no per-read cost. For a high-frequency activity feed with many mobile clients listening, RTDB's flat per-GB pricing is more predictable than Firestore's per-read model.

The decision to use Firestore for this pattern was made implicitly by the implementation proceeding with Firestore, but the architectural tradeoff was never closed out in documentation.

**Recommendation:**

Add a "Decision Record" subsection to `ACTIVITY_SYSTEM_MIGRATION.md` Section 2.3: "Decision: Use Firestore `house-activities` (not RTDB) for the activity feed. Rationale: unified security rules, single data source for dispute status, no separate TTL management. Trade-off: higher per-read cost at scale. Revisit if real-time listener costs exceed $X/month."

---

### F-17 — Offline Persistence Not Configured

**Severity: Low**
**Source document:** `GAP_ANALYSIS_PRODUCTION_READINESS.md`, Section 1.4

**What the documentation says:**

> "No `@react-native-community/netinfo` usage found. No offline queue implementation. No explicit Firestore offline persistence configuration."

The GAP_ANALYSIS rates Offline Support at 10%. Sober living homes are frequently located in areas with poor cellular coverage. Residents logging activity compliance from remote locations (meetings outside cellular coverage, overnight stays) would lose data if offline persistence is not configured.

**Current sprint coverage:**

No sprint (Sprint 5 through Sprint 9) includes an offline persistence task. The GAP_ANALYSIS item is marked "Kill List" adjacent — not scheduled.

**Performance implication:**

Firestore's native offline persistence (`enablePersistence()` / `initializeFirestore` with `localCache`) caches data locally and serves reads from cache on reconnect. Without it, every app restart triggers a full re-fetch of all subscribed collections. For a guest with week stats, house data, and a payment history, this means 3-5 Firestore reads on every cold app launch. With offline persistence enabled, only changed documents are fetched.

**Recommendation:**

Add to Sprint 5 (or Sprint 9 at the latest): "Enable Firestore offline persistence with `persistentLocalCache()` on app initialization. Test that week stats are readable when device is in airplane mode." This is a 2-line initialization change with significant UX impact for users with intermittent connectivity.

---

### F-18 — Dual-Repo Deployment Ambiguity Creates Performance Regression Blind Spot

**Severity: Low**
**Source document:** `ACTIVE_PLAN.md`, Parts 1 and 2

**What the documentation says:**

> "Which deploy is canonical? If both deploy under the same function name, one will overwrite the other."

The ACTIVE_PLAN identifies 5 Cloud Functions that exist in both the embedded `functions/` directory and the external `regroup-functions` repo. Task 5.5 (Sprint 5) allocates 2 hours to resolve this.

**Performance-specific risk:**

If the embedded `functions/` repo (which ACTIVE_PLAN describes as having "comprehensive tests, 90% line/function coverage target") deploys over the `regroup-functions` version without the v2 SDK migration (noted as complete in `regroup-functions`), the deployed functions may regress from v2 to v1. Firebase Functions v2 has meaningfully lower cold start times (200-500ms vs 1-3s for v1) and better concurrency. An unintended v1 deployment would silently restore the cold start penalty that the v2 migration was intended to eliminate.

There is no CI pipeline documented for `regroup-functions`, which means this regression could not be caught automatically.

**Recommendation:**

Add to Sprint 5 task 5.5: "Verify that after dual-repo resolution, the deployed functions use the v2 SDK. Add a post-deploy smoke test that measures cold start time for `createPaymentIntent` and asserts <1s response time. Block deployment if test fails."

---

## Summary Table: Sprint Coverage of Performance Findings

| Finding                                | Sprint with Task              | Coverage Status                        |
| -------------------------------------- | ----------------------------- | -------------------------------------- |
| F-01 N+1 payment calls                 | Sprint 6.1, 6.2               | Partially covered — no pagination spec |
| F-02 Sequential trigger reads          | None                          | Not addressed                          |
| F-03 5x timezone functions             | None                          | Not addressed                          |
| F-04 Unbounded activities array        | None                          | Not addressed                          |
| F-05 house-activities write fan-out    | None                          | Not addressed                          |
| F-06 endOfDayReminder sequential reads | None                          | Not addressed                          |
| F-07 No feed pagination docs           | None                          | Not addressed                          |
| F-08 Unbounded disputes map            | None                          | Not addressed                          |
| F-09 Sequential guest reads in trigger | None                          | Not addressed                          |
| F-10 Stale subscriptionMetadata        | GTM plan only, no sprint task | Not assigned                           |
| F-11 App.tsx selector storm            | Sprint 1 Task 5               | Covered                                |
| F-12 Lodash wildcard imports           | Sprint 4                      | Covered, no measurement planned        |
| F-13 Missing performance SLAs          | None                          | Not addressed                          |
| F-14 No load testing in E2E            | None                          | Not addressed                          |
| F-15 Indexes not in any sprint         | None                          | Not addressed                          |
| F-16 RTDB vs Firestore decision        | None                          | Not closed                             |
| F-17 Offline persistence               | Not scheduled                 | Deferred indefinitely                  |
| F-18 Dual-repo CI blind spot           | Sprint 5.5 (partial)          | Partially covered                      |

---

## Recommended Priority Order

The following findings should be addressed before the 3-month (May 2026) milestone defined in `ACTIVE_PLAN.md`:

1. **F-15** — Deploy Firestore indexes (30 minutes, prevents production query failures on launch)
2. **F-01** — Document `listHousePayments` pagination spec before Sprint 6.1 implementation begins
3. **F-02 + F-09** — Parallelize trigger reads with `Promise.all` in the migration documentation; update reference implementation
4. **F-04** — Document `activities` array cap at 100 entries; add overflow strategy to migration spec
5. **F-10** — Assign `subscriptionMetadata` refresh to Sprint 9
6. **F-13** — Add performance budgets to ACTIVE_PLAN.md Part 6
7. **F-14** — Add 3 performance test cases to `ACTIVITY_SYSTEM_TEST_PLAN.md`
8. **F-03** — Add scheduled function consolidation to Sprint 9 kill list
9. **F-06** — Document scale ceiling for `endOfDayReminder` and add `Promise.all` note to migration guide
10. **F-07** — Add cursor reconciliation pattern to migration documentation

Findings F-05, F-08, F-16, F-17, F-18 can be addressed post-launch without blocking the May 2026 milestone.

---
*Last reviewed: 2026-05-24 | Audience: developer | Type: concept*
