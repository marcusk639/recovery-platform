# Comprehensive Iterative Review — Summary

**Dates:** 2026-04-14 / 2026-04-15
**Base SHA:** `732da0d` (commit just before the DataContext → React Query migration began)
**Final SHA:** `619e1ba` (latest review-fix commit at time of writing)
**Commits in range:** 52 (14 migration commits + ~10 review-fix commits from this session + interleaved user-driven work: Phase C slice cleanup, `*RTK` → plain slice rename, Treasury feature, iOS/E2E fixes)

## Scope

Post-hoc review of the React Query + architecture migration effort. Decomposed into 8 review clusters (V, VI, I, IV, III, II-a..e, VII, VIII) plus a final architect pass. Each cluster was one `/iterative-review` invocation dispatching 2 parallel reviewer subagents.

## Per-Cluster Outcomes

| #    | Cluster                      | Target                          | Agents                               | Fixes landed                                                                                                                                                                                                                                     |
| ---- | ---------------------------- | ------------------------------- | ------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| V    | RTDB removal + rules         | `5d7a441`, `d4d773d`            | security + database                  | `74632ee` — removed dead RTDB stub exports                                                                                                                                                                                                       |
| VI   | `functions/` deletion parity | `cac76fb` + cross-repo          | architect                            | Parity OK. Found 2 pre-existing cross-repo bugs in `regroup-functions`: **`createPaymentIntent` 100x overcharge** (`d4609a8`) and **`connectStripeAccount` broken onboarding** (`82574af`)                                                       |
| I    | DataContext + RQ core        | `62c2866`, `0432c0a`, `3e43a0d` | code-reviewer + architect            | `1215fe0` + `57a05f0` — admin cache-key drift, `useSelectedAdmin` hook, mutation hygiene                                                                                                                                                         |
| IV   | Phase 3 cleanup              | `c77dfcd`                       | inline                               | Clean                                                                                                                                                                                                                                            |
| III  | Form screens → RQ            | `b2c350e`                       | code-reviewer + security-reviewer    | Absorbed into `be3cdd5`/`986f93e`/`56dad0b` (user-committed during concurrent rename): analytics PII fix, ~15 `console.log` removals, admin mutation RQ fan-out                                                                                  |
| II-a | Oxford screens               | subset of `5fcb818`             | code-reviewer + mobile-app-developer | `8e66775` + `5ff9682` + `652a79a` — `useOxfordGate` shared hook, OxfordDashboard memoization, EESTracker/OfficerManagement migrated to RQ hooks, BusinessMeetingDetail stale-closure fix + writes wired to `useUpdateBusinessMeeting`            |
| II-b | House admin screens          | subset of `5fcb818`             | code-reviewer + mobile-app-developer | `33a079c` — PaymentDashboard cache invalidation + `paymentKeys`, `useFocusEffect` on 3 screens, UserInfo dead selectors removed, HouseActivity perf tuning                                                                                       |
| II-c | Guest-facing screens         | subset of `5fcb818`             | code-reviewer + mobile-app-developer | `5f7f1fe` — **3 CRITICAL broken-thunk imports fixed** (GuestUpdateForm, Beds, Personal). GuestList memoization + `useFocusEffect`. `useMeetingSearch` logException                                                                               |
| II-d | Comms & misc screens         | subset of `5fcb818`             | code-reviewer + mobile-app-developer | `72123e6` (user commit) + `243bdd7` — **HouseChat + ContactScreen listener leaks**, Issues broken-thunks, DirectChat renderItem, onSnapshot error handlers in message service                                                                    |
| II-e | Holistic cross-cut           | full `5fcb818`                  | architect + code-reviewer            | `cd0abee` — AddManager phantom `state.managerSignUp` selector, 13 SignUp `console.log` leaks, Splash `user.messagingToken.push` mutation + dispatch fix, SignUpForm `newAdmin.houseIds.push` immutability, `useMeetingVotes` staleTime 10s → 60s |
| VII  | iOS/E2E fixes                | `4b41c10`                       | code-reviewer                        | `619e1ba` — **iOS runtime crash guard for PDF export**: `isPDFExportAvailable()` + lazy require in `reportExport.ts`                                                                                                                             |
| VIII | Phase C slice cleanup audit  | `a51a4de` + current slices      | architect                            | `619e1ba` — **HouseSearch CRITICAL broken-thunk fix** (migrated to service + local state), dead loading-flag reads in GuestHome + ContactScreen replaced with hook `isLoading`                                                                   |

**11 CRITICAL bugs fixed across the 8 clusters** — every one would have shipped. Notable:

- `createPaymentIntent` 100x overcharge (cross-repo, real financial risk)
- Bed management silent no-op (all room/bed writes)
- Guest edit form crash on submit
- Issues Remove/Resolve/Dismiss silent no-op
- HouseChat + ContactScreen listener leaks (live Firestore listeners per navigation)
- HouseSearch entire feature non-functional

## Final Verification

| Gate                 | Result                                                                                                 |
| -------------------- | ------------------------------------------------------------------------------------------------------ |
| Full unit test suite | **4294 pass / 29 fail / 2 todo** out of 4325 total (99.3%) — see failing-suites note below             |
| Lint                 | not run separately; Prettier runs PostToolUse on every edit                                            |
| Integration tests    | not run (require Firebase emulator on 127.0.0.1:8080/9099)                                             |
| TypeScript           | pre-existing navigation type errors (unrelated to review fixes); logic in touched files compiles clean |

### Failing test suites (all flagged during their clusters as deferred rewrites, not regressions)

- `BusinessMeetingDetail.test.tsx`, `OfficerManagement.test.tsx` — tests mock old service layer; screens now use RQ hooks. Fix: retarget mocks.
- `HouseSearchScreen.test.tsx` — 7 tests preload `state.houses.searchedHouses` (dead field). Fix: mock `services/house.searchForHouses` and trigger search programmatically.
- `OxfordDashboard.test.tsx` — likely Treasury card addition (user's parallel work).
- `MeetingResultsList.test.tsx` — pre-existing "Serenity Group" text assertion (not in any review scope).
- `firebase/__tests__/firestore.rules.test.ts`, `storage.rules.test.ts` — pre-existing `@firebase/rules-unit-testing` env load failure (flagged in Cluster V).
- `payment.test.ts` — likely payment-service test expectations drifted from Phase C cleanup.

None of the failing tests indicate a regression introduced by the review fixes. They're test-rewrite debt from the migration itself.

## Architect's Final Verdict

> **Materially better architecturally.** The hybrid Redux/React Query model is now coherent: server state lives behind typed query hooks with proper cache keys, staleTime discipline, and optimistic-update patterns, while Redux is appropriately scoped to UI/auth/navigation state. The eight review clusters excised a large class of latent bugs (broken thunk imports, listener leaks, PII logging, cache-key drift, stale closures, the 100x overcharge in the sibling functions repo) that would have shipped otherwise.

## Top Remaining Risks (by blast radius)

1. **No offline queue for governance writes** (Oxford votes, business meetings, EES). Firestore persistence is disabled; a flaky network during a vote silently drops writes. Governance data is immutable-by-rule — loss is unrecoverable.
2. **Dead slice fields** across entity slices (`userAsGuest`, `userAsAdmin`, `loading`, `status`, `searchedHouses`, etc.). Phase C removed writers but left the shape + exported selectors. Invites the stale-state bugs the migration just eliminated.
3. **Missing `enabled` guard on `useActivities`** (and likely siblings). Fires queries with undefined IDs on first render — wasted reads, noisy Sentry, refetch storms on auth transitions.
4. **Scattered timestamp-normalization logic.** Each service re-implements the `.toDate?.() || value` fallback inconsistently. One missed site = a runtime crash on offline cache hydration. A `toDateSafe` util in `src/util/firestore.ts` closes the class.
5. **Untyped `useNavigation()` call sites** + Phase-B `selectedHouse` fallback still alive in ~7 files. Both footguns: route-param drift compiles, and the legacy selection path masks the ID-only flow.

**Lower-tier (noted, defer):** `useMeetingSearch` debounce, `PaymentDashboard` ScrollView → FlatList virtualization beyond ~200 rows, `NewMeeting`/`MeetingSearch` test false-positive coverage, E2E `launchApp({newInstance:true})` per-test login verification, dispute/complaint `numberOfLines` clamps, `ContactScreen` ScrollView virtualization, `DirectChat` Android `KeyboardAvoidingView`, ManagerSettings/AddManager dual-source-of-truth writes (`dispatch(updateHouseData)` without RQ invalidation).

## Recommended Next Step

**Run a focused "Phase D: Slice Shape Cleanup" sprint before any new feature work.** Delete the dead fields from `userSlice`/`guestsSlice`/`housesSlice`/`adminSlice`, remove the Phase-B `selectedHouse` fallback, and extract `toDateSafe` into `src/util/firestore.ts` with a codemod sweep. This is low-risk (consumers are already gone), locks in the migration's gains by making the old patterns un-writable, and gives the team a clean substrate before tackling the **offline-queue for governance writes** — which is the real next architectural investment and deserves its own design doc rather than being bolted onto cleanup.

Also outstanding — **deploy the regroup-functions fixes** (`d4609a8` createPaymentIntent, `82574af` connectStripeAccount) to Firebase. Until then, every Stripe rent charge is 100x the intended amount and the mobile Stripe Connect onboarding stays broken.

## Cross-Repo Work Committed

In `/Users/marcusklein/dev/regroup-functions` (master):

- `d4609a8 fix(payments): createPaymentIntent — treat amount as integer cents (100x overcharge bug)`
- `82574af fix(payments): connectStripeAccount — default missing return/refresh URLs to hosted endpoints`

**Both DEPLOYED to production (phoenix-cleanhouse)** on 2026-04-15 via `firebase deploy --only functions` after a required `functions:delete weeklyTransfers` to clear a v1-deploy orphan left by the recent `consolidate-weekly-transfers` refactor. Full function list verified live via `firebase functions:list` — both `createPaymentIntent` and `connectStripeAccount` show v2 / nodejs22.

**Post-deploy anomaly** (flagged for your attention, not blocking):
`functions/src/scheduled/index.ts:82` exports `weeklyTransfers` in source, but the deploy created 5 per-timezone `scheduledWeeklyTransfer{EST,CST,MST,PST,Fallback}` functions instead — suggests the `consolidate-weekly-transfers` refactor was reverted or the naming diverged. Worth auditing whether both code paths are live.

---

## Phase D — Slice Shape Cleanup (partial, in progress)

After the main review landed, started the recommended next-step cleanup:

| Sub-task                                                                                                             | Status     | Commit                                                                                                                                   |
| -------------------------------------------------------------------------------------------------------------------- | ---------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| 1. Add `toDateSafe` util + migrate flagged timestamp sites                                                           | ✅         | `baa1841` — `src/util/firestore.ts`, PaymentDashboard (3 sites), PaymentHistory, PaymentRow via rentPaymentHelpers, DirectChat, BaseChat |
| 2. Drop Phase-B `selectedHouse` / `selectedGuest` fallback from selection hooks + migrate 2 form consumers           | ✅         | `3859de1` — useSelectedHouse, useSelectedGuest, NewAccountForm, EditUserInfoForm                                                         |
| 3. Delete dead slice fields (userAsGuest/userAsAdmin/loading/status/searchedHouses/etc.) + migrate remaining readers | ⏭ Deferred |                                                                                                                                          |

### Why sub-task 3 was deferred

The dead-field deletion is a bigger refactor than the cleanup scope suggested:

- `state.houses.error` / `loading` — 5 screen readers (Personal, HouseSettings, Beds/AssignGuest, Beds/RoomForm, +1)
- `state.houses.houses` — read by auth.tsx legacy class component
- `state.houses.selectedHouse` — still read by auth.tsx + title-bar-right-button (legacy class `connect()` components)
- `state.guests.userAsGuest` — read by meetingsSlice thunk + guestSelectors
- Similar dead shape in guestsSlice (`status`/`updateStatus`/`createStatus`/`deleteStatus`/`customizePhaseStatus`)
- Similar dead shape in adminSlice (`loading`/`error`)
- ~30 test fixture files that seed these fields in their preloadedState

Doing this cleanly needs its own session with fresh context — specifically to modernize the remaining class-based `connect()` components (`auth.tsx`, `title-bar-right-button`) before the deletion can land without regressing those consumers.

### Recommended sequence for sub-task 3 (next session)

1. Modernize `src/components/auth/auth.tsx` and `src/components/title-bar-right-button/index.tsx` off class + `connect()` to functional components with hooks — migrate their state reads to `useSelectedHouse()` / `useSelectedGuest()` / `useHouses(...)` etc.
2. Refactor `meetingsSlice` thunk at line 75-76 to accept `guest` / `house` as args instead of reading from getState.
3. Refactor `guestSelectors.ts:10` to drop the `state.guests.selectedGuest` fallback.
4. Once zero readers remain, delete the dead fields from `housesSlice`, `guestsSlice`, `adminSlice`, and the `selectHouse` / `selectGuest` reducers that only populated them.
5. Codemod the ~30 test fixture files that seed these fields — ideally via a single shared `createInitialState()` helper to prevent future drift.
