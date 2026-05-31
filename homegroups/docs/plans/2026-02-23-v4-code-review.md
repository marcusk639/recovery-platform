# V4 Code Review — 2026-02-23

**Status: ALL CRITICAL AND IMPORTANT ISSUES RESOLVED — ready for final QA**

All four V4 feature sets were reviewed via parallel code review agents after merge to `main` (commit `34c993d`). All critical and important issues identified have been fixed. 428 tests pass across 31 suites.

---

## Critical Issues — All Resolved

### V4.1 Advanced Governance

**C1. ✅ ElectionDetailScreen voting transition is broken at runtime**
- Fixed: `openElectionVoting` callable CF created; `handleTransitionToVoting` routes through it.
- Commits: `335c8bc`, `e1c9287` (export wired)

**C2. ✅ `approveMeetingMinutes` missing cross-group ownership check**
- Fixed: reads `minutesData.groupId` and throws `permission-denied` if it doesn't match `data.groupId`.
- Commit: `b8622f0`

### V4.2 Content & Resources

**C3. ✅ Reflections library is incomplete — 151 entries, not 365**
- Fixed: all 365 entries written to `reflectionsLibrary.ts`.

**C4. ✅ `seedDailyReflections` idempotency check is a no-op**
- Fixed: checks `daily_reflections/001` existence before batch; returns `{ seeded: 0, skipped: 365 }` if already seeded and `force` is false.
- Commit: `854c60e`

**C5. ✅ `v4.2-content-resources.test.ts` has a broken assertion**
- Fixed: asserts `result.itemId`; uses `mockDocSet` not `mockDocAdd`.

### V4.3 Analytics & Insights

**C6. ✅ `getGroupHealthTimeSeries` engagement trend always returns zero**
- Fixed: passes `Date` objects directly to Firestore `.where()` queries.
- Commit: `5a99c72`

**C7. ✅ `TreasuryTrendsScreen` quarterly CSV export contains wrong date range**
- Fixed: multiplies `periods` by 3 months when `granularity === 'quarterly'`.
- Commit: `66225dd`

### V4.4 Enterprise Features

**C8. ✅ Intergroup webhook handlers never wired into dispatcher**
- Fixed: `handleIntergroupSubscriptionUpdated` and `handleIntergroupSubscriptionDeleted` imported and called in both switch cases.
- Commit: `c941c8c`

**C9. ✅ Firestore rule allows unauthenticated intergroup document creation**
- Fixed: `allow create: if false` on `intergroups` collection.
- Commit: `8a4e2ba`

**C10. ✅ `exportFacilityComplianceReport` accepts `format: 'pdf'` but produces `.txt`**
- Fixed: PDF removed from accepted formats; throws `invalid-argument` if requested.
- Commit: `6a242c4`

---

## Important Issues — All Resolved

### V4.1
- ✅ `closeElection` now requires `voting_open` status (rejects `nominations_open`). Commit: `b3004d0`
- ✅ `ratifyBylaws` checks for duplicate `voteId` and throws `failed-precondition`.
- ✅ `pending_vote` dead code removed from schema and UI.
- ✅ "Start Election" button added to `GroupServicePositionsScreen`. Commit: `a08ed37`

### V4.2
- ✅ `bookmarkLiteratureForGroup` checks `isApproved` before bookmarking. Commit: `ba69b23`
- ✅ Firebase Storage rules created at `storage.rules` (auth + 10 MB limit). Commit: `4aa5f67`
- ✅ `LiteratureDetailScreen` has "Add to Group Library" admin button. Commit: `1f024ab`
- ✅ `ContributeLiteratureScreen` implemented and wired into ProfileNavigator. Commit: `b34a692`

### V4.3
- ✅ `getTreasuryTrends` refactored to single full-range query + in-memory partitioning.
- ✅ `tsconfig.json` exclude block restored — test files excluded from build.
- ✅ `MyRecoveryJourneyScreen` streak unit corrected from "weeks" to "days".
- ✅ `getAttendanceAnalytics` `dayOfWeekIndex` moved inside forEach. Commit: `e1c9287`
- ✅ `getMemberEngagementMetrics` `dataAvailabilityNote` overwrite fixed. Commit: `e1c9287`

### V4.4
- ✅ `findSubscriptionItemId` fixed to match `item.price.product` for intergroup subscriptions. Commit: `07578d3`
- ✅ `onMilestoneWrite` now increments `milestonesThisYear`. Commit: `4c21364`
- ✅ `uploadBrandingLogo` uses a signed URL (1-year expiry). Commit: `35e7c58`
- ✅ `exportFacilityComplianceReport` checks active subscription status. Commit: `6a242c4`
- ✅ `configureSSO` DOMAIN_REGEX relaxed to accept single-char SLDs. Commit: `e1c9287`

---

## Test Coverage

| Suite | Tests |
|---|---|
| Original baseline (commit `34c993d`) | 357 |
| After all fixes | **428** |
| Net new tests added | +71 |

All 428 tests pass across 31 suites (excludes `security-rules` which requires emulator).

---

## What Is Working

- All CF auth patterns correct and consistent
- All navigation wiring complete (routes registered, typed, entry points present)
- Redux slice structure follows established patterns across all four feature sets
- Firestore security rules block all direct client writes on new collections
- `onServicePositionWrite` trigger is correct (atomic arrayUnion, self-trigger guard)
- V4.4 SSO domain index design is O(1) lookup
- V4.4 privacy handling in exports correctly strips sensitive fields
- `ContributeLiteratureScreen` submits to pending moderation queue (`isApproved: false`)
- Firebase Storage rules enforce auth + 10 MB limit on group resource uploads
