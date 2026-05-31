# Phase 3: Testing & Documentation Review

## Test Coverage Findings

### Critical

1. **E2E Tests Run Against Production Firebase** — `e2e/setup/globalSetup.js` uses `projectId: 'phoenix-cleanhouse'` (production). Test data written to production. Test accounts with known passwords exist in production auth. Tests that create data permanently mutate production state.

2. **Oxford Module Has Two Divergent Implementations; Tests Cover Only One** — `oxford/index.ts` (flat collections) and `oxford/votes.ts` (subcollections) write to completely different Firestore paths. `Voting.tsx` imports the subcollection version; `oxfordQueries.ts` imports the flat version. Data written by the screen is never read by the query layer. Unit tests pass for each in isolation because both are fully mocked.

3. **Payment Amount Unit Mismatch Not Validated at Integration Boundary** — `RentPaymentScreen.test.tsx` asserts `amount: 150` (dollars). `ResidentPayment.tsx` test correctly converts to cents (`2500` for $25.00). Neither test validates they call the same Cloud Function with the same unit convention. If CF expects cents, RentPayment charges $1.50 instead of $150.00.

### High

4. **Firestore Security Rules Tests Cover 1 of 13 Collections** — Only `houses/{houseId}/guests/{guestId}/paymentMethods` is tested. No tests for cross-house read isolation on `/houses`, `/admins` PII exposure, `/guest-reports` cross-house writes, or votes immutability rule that blocks legitimate `update` operations.

5. **E2E Tests Use Empty Catch Blocks — Tests Always Pass** — `e2e/tests/resident-payment.test.js` contains 9 empty `catch {}` blocks. Tests silently pass regardless of what the app shows. No regression signal.

6. **Oxford Service Functions Have Zero Error Path Tests** — All tests are happy-path only. `resolves.toBeDefined()` passes for any return value including `undefined`. No tests for Firestore permission-denied, network failures, or document-not-found.

7. **Triple-Cache Architecture Has No Cross-Cache Staleness Tests** — Redux slices never invalidated when React Query cache updates. Guest compliance status from Redux can remain stale after activity logged via React Query. No cross-cache consistency tests exist.

8. **RentPaymentScreen Passes Dollar Amount to Function Expecting Cents** — Test asserts `amount: 150` for `guest.rentOwed = 150` (dollars). ResidentPayment correctly sends `2500` for $25.00. Two payment paths are inconsistent.

### Medium

9. **Integration Tests Silently Skip When Emulator Not Running** — `src/integration/setup.ts` swallows connection failure with `console.warn`. No evidence `test:integration` runs in CI. Integration tests for activity, guest CRUD, meetings may be completely unexecuted in pipeline.

10. **~59% of Screen Directories Lack Tests** — Untested: Invites (critical onboarding), PhaseSetup (controls compliance requirements), HouseOverview screens, MeetingSearch. Storage service and complaints service have no test files.

11. **Oxford Tests Are Behavioral No-ops for Read Functions** — `getOfficers` tested with `resolves.toBeDefined()` — passes if function returns `undefined`, `null`, or `[]`. No assertion that `where('houseId', '==', houseId)` is called or results are correctly mapped.

### Low

12. **No Performance Tests; React Query Stale Times Not Tested** — `staleTime` values (30s, 10s, 60s) and `refetchInterval` (30s) not covered by any test. Misconfiguration would pass all existing tests.

### Test Pyramid Analysis

| Layer                            | Count                    | Ratio |
| -------------------------------- | ------------------------ | ----- |
| Unit tests (Jest, mocked)        | ~4,200 cases / 235 files | 87%   |
| Integration tests (emulator)     | ~60 cases / 6 files      | 1%    |
| Security rules tests (emulator)  | ~15 cases / 2 files      | <1%   |
| E2E tests (Detox, prod Firebase) | ~100 cases / 16 files    | 2%    |

The pyramid is inverted at the integration layer. Unit tests can't catch cross-service path divergence. Integration tier is critically thin and manually gated. E2E tier is contaminated by production usage and catch-all blocks.

---

## Documentation Findings

### Critical

1. **No Root-Level README** — Cloning the repository shows nothing. No setup instructions, technology overview, or pointer to `/docs/`. A new developer sees an opaque directory structure with no entry point.

2. **No Development Environment Setup Guide** — Required steps scattered or missing: Node version, React Native prerequisites, Firebase project config, Xcode 26 Podfile fix (exists only in Claude session memory, not project docs), Stripe test keys, emulator setup.

3. **No Firestore Schema Reference** — No central document listing collections, fields, types, relationships. Entity TypeScript interfaces exist but aren't indexed. Developer can't quickly find "What does the `results` field in Vote contain?"

4. **Zero Cloud Function API Documentation** — ~10+ callable functions used by mobile app with no documented input schema, output schema, authorization requirements, error codes, or side effects. Payment amount unit (cents vs dollars) is undocumented.

### High

5. **Payment Amount Convention Undocumented** — `createRentPaymentIntent()` accepts `amount: number` with no unit documentation. Developers adding new payment flows could easily pass dollars instead of cents, causing 100x error in charges.

6. **IMPLEMENTATION_PLAN.md Contradicts Current Architecture** — Recommends "KEEP the embedded Week model" but WeekSummary is now operative. Still listed as "Active Plans" in docs/README.md. Developer following this doc would implement wrong architecture. Phase 3 review recommended supersession banner — still not added.

7. **Embedded functions/ Directory Deleted but ACTIVE_PLAN Still Documents It** — ACTIVE_PLAN Part 1 describes 7 embedded Cloud Functions that no longer exist on disk. Neither intentional deletion nor accidental loss is documented.

8. **Three-Component System Not Diagrammed** — rats-v2 (mobile), regroup-functions (Cloud Functions), rats-web (web portal), Firebase, Stripe — no system architecture diagram, no data flow description, no deployment topology.

9. **Firebase Security Rules Not Documented** — No document confirming which rules are deployed to which environment. `database.rules.json` has `".read": true, ".write": true` — either development-only or critical security vulnerability.

10. **No Secrets Management Guide** — Multiple secrets (Firebase credentials, Stripe keys, SendGrid, Google Maps) with no centralized list, storage locations, rotation procedures, or new developer access instructions.

11. **No Privacy/Data Classification Document** — App collects sobriety dates, drug history, medication schedules, payment info. No data classification, retention policy, third-party sharing documentation, or HIPAA analysis.

### Medium

12. **No Architecture Decision Records** — Major decisions (Week model migration, Stripe Connect type, single-app for traditional + Oxford houses, dual-repo resolution) have no ADR trail.

13. **Oxford Anonymous Voting Toggle Undocumented** — Complex transaction logic for `isAnonymous` votes (skips `individualVotes` write) has no design rationale, re-voting behavior, or data model explanation.

14. **Oxford Screen Implementation Status Ambiguous** — ACTIVE_PLAN says "Route registered, unknown if implemented" while GTM plan says "ready now." Actual code exists but functional completeness (60%? 80%? 100%?) is undocumented.

### Low

15. **No Contributing Guide** — No `CONTRIBUTING.md` with coding conventions, branching strategy, commit format, PR process, or test requirements.

16. **Service Layer JSDoc Coverage ~40%** — `payments.ts` and `compliance.ts` have good JSDoc; `oxford/votes.ts`, `password.ts`, `admin.ts` have none. Inconsistent.
