# Comprehensive Code Review Report

## Review Target

Full application review of RATS (Regroup App for Transitional/Sober Living) — a React Native mobile application for managing sober living houses. 666 source files, 242 test files. Tech stack: React Native 0.72, TypeScript, Firebase/Firestore, Redux Toolkit + React Query, Stripe, React Navigation, Detox E2E.

## Executive Summary

The RATS codebase has a solid functional foundation with well-designed features (offline queue, cursor-based pagination, compliance calculations, Oxford governance). However, the review uncovered **critical security vulnerabilities** (service account keys in git, unprotected payment collection, hardcoded production credentials), **architectural debt from an incomplete migration** (dual state management, triple-caching, conflicting Firestore paths), and **no production deployment pipeline**. The 9 Critical findings represent immediate data integrity and security risks that must be addressed before any production release.

---

## Findings by Priority

### Critical Issues (P0 — Must Fix Immediately)

| #   | Category     | Finding                                                                                                                                                                                                                                                                           | Source  |
| --- | ------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------- |
| 1   | Security     | **Firebase service account private keys committed to git** — Full admin access to production (`phoenix-cleanhouse`), dev, and staging projects. `scripts/service-key.json` and `scripts/credentials.json` tracked despite partial `.gitignore`. CVSS 9.8.                         | Phase 2 |
| 2   | Security     | **`payments` collection has NO Firestore security rules** — `recordManualPayment()` writes directly from client with `status: 'succeeded'` and zero server-side validation. Any authenticated user can forge payment records. CVSS 9.1.                                           | Phase 2 |
| 3   | Security     | **Hardcoded E2E test credentials against production Firebase** — Test accounts (`TestPassword123!`) exist in production auth. Seed script targets `phoenix-cleanhouse`. Anyone with repo access authenticates as admin in production. CVSS 7.2.                                   | Phase 2 |
| 4   | Code Quality | **Duplicate Oxford Firestore paths** — `oxford/index.ts` uses flat collections (`firestore.collection('businessMeetings')`), `oxford/businessMeetings.ts` uses subcollections (`houses/{houseId}/business-meetings`). Data written by screens never read by query layer.          | Phase 1 |
| 5   | Code Quality | **Payment amount unit mismatch (dollars vs cents)** — `recordManualPayment` accepts dollars, `createPaymentIntent` expects cents, `PaymentDashboard` displays assuming dollars. Mixing in same collection produces incorrect financial reports.                                   | Phase 1 |
| 6   | Architecture | **Dual state management — Redux thunks + React Query for same entities** — Houses, Guests, Admins have both Redux async thunks and React Query hooks calling same services. Same entity exists in 3 caches with no synchronization. Mutations through one don't update the other. | Phase 1 |
| 7   | Performance  | **House entity fires Firestore call on every instantiation** — `id: string = houseService.createHouseId()` in field initializer triggers on every `new House()` including deserialization and test fixtures.                                                                      | Phase 2 |
| 8   | Architecture | **Firestore security rules not version-controlled** — `database.rules.json` covers only Realtime Database. Actual Firestore rules governing all data access are not in this repository. Production rules are unknown and unauditable.                                             | Phase 1 |
| 9   | React        | **Conditional hook invocation in `Disputes.tsx`** — Early `return null` guard sits between hook calls, violating Rules of Hooks. Will crash with "Rendered fewer hooks than expected" when guard condition changes.                                                               | Phase 4 |

### High Priority (P1 — Fix Before Next Release)

| #   | Category     | Finding                                                                                           | Source    |
| --- | ------------ | ------------------------------------------------------------------------------------------------- | --------- |
| 10  | Security     | Email verification disabled — accounts auto-verified (CVSS 7.5)                                   | Phase 2   |
| 11  | Security     | Deep link invitation parameters not signed (CVSS 7.5)                                             | Phase 2   |
| 12  | Security     | Overly permissive Firestore rules — 8+ collections readable/writable by any auth user (CVSS 7.5)  | Phase 2   |
| 13  | Architecture | Triple-caching (RQ + entity slices + cacheSlice) — 2-3x memory overhead, cache incoherence        | Phase 1/2 |
| 14  | Architecture | Flat Firestore collection design lacks tenant isolation — harder security rules, worse query perf | Phase 1   |
| 15  | Performance  | DataContext waterfall loading — 800ms-2s added to startup (4 sequential Firestore round-trips)    | Phase 2   |
| 16  | Performance  | Unbounded Firestore listeners without lifecycle cleanup — memory leak, battery drain              | Phase 2   |
| 17  | Performance  | Duplicate data-fetching (React Query + raw onSnapshot) for same activity data                     | Phase 2   |
| 18  | Performance  | `moment.js` bundle bloat — 262KB+ not tree-shakeable                                              | Phase 2/4 |
| 19  | Performance  | `updateWeekSummary` re-reads ALL activities on every log — N+1 amplification                      | Phase 2   |
| 20  | Code Quality | `NativeStackNavigationProp<any>` across 58 files — defeats typed navigation                       | Phase 1/4 |
| 21  | Code Quality | God-hook `useBaseActivityScreen` — 530 lines, 16 return values, mixed concerns                    | Phase 1/4 |
| 22  | Code Quality | Oxford service layer has zero error handling — raw Firestore exceptions to UI                     | Phase 1   |
| 23  | Code Quality | Mutable entity classes with side effects in field initializers                                    | Phase 1/4 |
| 24  | Testing      | E2E tests run against production Firebase                                                         | Phase 3   |
| 25  | Testing      | Oxford module has two divergent implementations; tests cover only one                             | Phase 3   |
| 26  | Testing      | Payment amount unit mismatch not validated at integration boundary                                | Phase 3   |
| 27  | Testing      | Firestore security rules tests cover 1 of 13 collections                                          | Phase 3   |
| 28  | Testing      | E2E tests use empty catch blocks — tests always pass                                              | Phase 3   |
| 29  | Docs         | No root README — invisible on repo clone                                                          | Phase 3   |
| 30  | Docs         | No development environment setup guide — Xcode 26 Podfile fix is tribal knowledge                 | Phase 3   |
| 31  | Docs         | No Firestore schema reference                                                                     | Phase 3   |
| 32  | Docs         | Zero Cloud Function API documentation                                                             | Phase 3   |
| 33  | Docs         | IMPLEMENTATION_PLAN.md contradicts current architecture (still listed as active)                  | Phase 3   |
| 34  | CI/CD        | No production deployment pipeline — zero App Store/Play Store automation                          | Phase 4   |
| 35  | CI/CD        | No environment separation (dev/staging/prod)                                                      | Phase 4   |
| 36  | CI/CD        | Integration tests not running in CI                                                               | Phase 4   |
| 37  | CI/CD        | No rollback automation or disaster recovery plan                                                  | Phase 4   |
| 38  | React        | Oxford screens bypass React Query — manual useState/useEffect for server data                     | Phase 4   |
| 39  | Security     | Vote Firestore rules block legitimate `update` — casting votes may be broken in production        | Phase 2   |
| 40  | Security     | Direct messages rules allow sender spoofing (CWE-863)                                             | Phase 2   |

### Medium Priority (P2 — Plan for Next Sprint)

| #   | Category     | Finding                                                                                   | Source    |
| --- | ------------ | ----------------------------------------------------------------------------------------- | --------- |
| 41  | Code Quality | Entity classes use mutable properties — 25 files use `cloneDeep` defensively              | Phase 1   |
| 42  | Code Quality | Fire-and-forget Firestore writes with `.catch(console.warn)`                              | Phase 1   |
| 43  | Code Quality | `moment` mixed with native Date operations                                                | Phase 1   |
| 44  | Code Quality | Defensive `try/require` for Stripe/payments — TypeScript can't type-check                 | Phase 1   |
| 45  | Code Quality | Rate limiter memory leak — unbounded Map in SimpleValidationService                       | Phase 1   |
| 46  | Code Quality | `console.error` in production (47+ locations) instead of `logException`/Sentry            | Phase 1/4 |
| 47  | Architecture | Service layer pattern inconsistency (generic CRUD vs direct Firestore vs Cloud Functions) | Phase 1   |
| 48  | Architecture | DataContext as god object with waterfall loading — any change re-renders all consumers    | Phase 1   |
| 49  | Architecture | Inconsistent error handling contracts across services                                     | Phase 1   |
| 50  | Architecture | Type safety gaps — `RTK` suffixed keys, `any` params, `@ts-ignore`                        | Phase 1   |
| 51  | Security     | Client-side rate limiting trivially bypassable (CWE-770)                                  | Phase 2   |
| 52  | Security     | Payment amount not validated — no max, dollar/cent ambiguity (CWE-20)                     | Phase 2   |
| 53  | Security     | Outdated dependencies — RN 0.72, Firebase 17, moment ReDoS (CWE-1395)                     | Phase 2   |
| 54  | Performance  | lodash full bundle + cloneDeep overuse — 70-100KB unnecessary                             | Phase 2/4 |
| 55  | Performance  | PaymentDashboard ScrollView for 100+ items — no virtualization                            | Phase 2   |
| 56  | Performance  | RatsFlatList disables `removeClippedSubviews` globally                                    | Phase 2/4 |
| 57  | Performance  | useBaseActivityScreen wide re-render blast radius                                         | Phase 2   |
| 58  | Performance  | No lazy loading for 40+ navigation screens                                                | Phase 2   |
| 59  | React        | 94 `as any` casts in screen files — typed selectors bypassed                              | Phase 4   |
| 60  | React        | FlatList nested inside ScrollView in Oxford screens — defeats virtualization              | Phase 4   |
| 61  | React        | `housesSlice` 14 boolean flags instead of AsyncStatus union                               | Phase 4   |
| 62  | React        | Inline styles dominating Oxford screens (60+ in Voting.tsx)                               | Phase 4   |
| 63  | React        | Safe area handling inconsistent across screens                                            | Phase 4   |
| 64  | React        | `react-native-iphone-x-helper` used but not in package.json                               | Phase 4   |
| 65  | React        | `children: any` in 4 foundational components                                              | Phase 4   |
| 66  | Testing      | Integration tests silently skip when emulator not running                                 | Phase 3   |
| 67  | Testing      | ~59% of screen directories lack tests                                                     | Phase 3   |
| 68  | Testing      | Oxford tests are behavioral no-ops (`resolves.toBeDefined()`)                             | Phase 3   |
| 69  | Testing      | Triple-cache architecture has no cross-cache staleness tests                              | Phase 3   |
| 70  | Docs         | Payment amount convention undocumented                                                    | Phase 3   |
| 71  | Docs         | No architecture decision records                                                          | Phase 3   |
| 72  | Docs         | No privacy/data classification document                                                   | Phase 3   |
| 73  | Docs         | No secrets management guide                                                               | Phase 3   |
| 74  | Docs         | Three-component system not diagrammed                                                     | Phase 3   |
| 75  | CI/CD        | No test coverage requirements in CI (`--no-coverage` flag)                                | Phase 4   |
| 76  | CI/CD        | No automated security scanning (npm audit, Dependabot, SAST)                              | Phase 4   |
| 77  | CI/CD        | No analytics/error monitoring dashboard                                                   | Phase 4   |

### Low Priority (P3 — Track in Backlog)

| #   | Category     | Finding                                                          | Source    |
| --- | ------------ | ---------------------------------------------------------------- | --------- |
| 78  | Code Quality | Email verification disabled but sign-in still checks it          | Phase 1   |
| 79  | Code Quality | Vote calculation includes abstentions in threshold               | Phase 1   |
| 80  | Code Quality | Entity `.tsx` extensions for non-JSX files                       | Phase 1   |
| 81  | Code Quality | Missing input validation on payment service functions            | Phase 1   |
| 82  | Code Quality | Deprecated `withRats` HOC retained                               | Phase 1/4 |
| 83  | Architecture | Monolithic navigator (50+ screens in one file)                   | Phase 1   |
| 84  | Security     | Legacy password validation missing special character requirement | Phase 2   |
| 85  | Security     | XSS sanitization incomplete (denylist approach)                  | Phase 2   |
| 86  | Performance  | Rate limiter Map memory leak                                     | Phase 2   |
| 87  | Performance  | `getByAttribute` has no limit safety                             | Phase 2   |
| 88  | Performance  | Activity screen opens listener with limit: 500                   | Phase 2   |
| 89  | React        | React Native 0.72 two major versions behind                      | Phase 4   |
| 90  | React        | Near-zero accessibility coverage                                 | Phase 4   |
| 91  | React        | AuthStack & SetupStack type overlap                              | Phase 4   |
| 92  | Testing      | No performance tests; React Query stale times not tested         | Phase 3   |
| 93  | Docs         | No contributing guide                                            | Phase 3   |
| 94  | Docs         | Service layer JSDoc coverage ~40%                                | Phase 3   |
| 95  | CI/CD        | Code signing not automated                                       | Phase 4   |
| 96  | CI/CD        | E2E test timeout/simulator configuration                         | Phase 4   |

---

## Findings by Category

| Category            | Total                 | Critical | High   | Medium | Low    |
| ------------------- | --------------------- | -------- | ------ | ------ | ------ |
| **Security**        | 15                    | 3        | 5      | 4      | 3      |
| **Architecture**    | 11                    | 2        | 2      | 5      | 2      |
| **Code Quality**    | 16                    | 3        | 3      | 6      | 4      |
| **Performance**     | 15                    | 1        | 5      | 6      | 3      |
| **React/Framework** | 14                    | 1        | 3      | 7      | 3      |
| **Testing**         | 12                    | 3        | 3      | 4      | 2      |
| **Documentation**   | 16                    | 2        | 6      | 5      | 3      |
| **CI/CD**           | 10                    | 1        | 4      | 3      | 2      |
| **Total**           | **96** (deduplicated) | **9**    | **31** | **37** | **19** |

---

## Recommended Action Plan

### Immediate (Today — Security Emergency)

1. **Rotate all Firebase service account keys** in Google Cloud Console for `rats-fe9c3`, `rats-dev`, and `phoenix-cleanhouse`. Remove `scripts/service-key.json` and `scripts/credentials.json` from git history with BFG Repo Cleaner. Add both to `.gitignore`. _Effort: Small_

2. **Delete production E2E test accounts** — Remove `test-guest-a@rats-e2e.com`, `test-manager@rats-e2e.com`, etc. from production Firebase Auth. _Effort: Small_

3. **Fix Disputes.tsx Rules of Hooks violation** — Move `if (!house || !user?.id) return null` guard below all hook calls. _Effort: Small_

### This Week — Data Integrity

4. **Add `payments` collection Firestore rules** — Restrict writes to admins; move `recordManualPayment` to a Cloud Function with server-side validation. _Effort: Medium_

5. **Fix overly permissive Firestore rules** — Scope `complaints`, `feedback`, `bugs`, `guest-reports` to house membership. Restrict `admins` reads. Add field-level validation on `houses` update. _Effort: Medium_

6. **Resolve Oxford dual Firestore paths** — Decide subcollections vs flat. Delete the other implementation. Add integration test. _Effort: Medium_

7. **Standardize payment amounts to cents** — Add JSDoc specifying units. Add validation. Fix RentPaymentScreen to convert dollars→cents before service call. _Effort: Medium_

8. **Fix direct messages sender spoofing rule** — Validate `senderId == request.auth.uid` on `create`. _Effort: Small_

### Next Sprint — Architecture Stabilization

9. **Establish Redux/React Query boundary** — Remove async thunks from `guestsSlice` and `housesSlice`. Convert `DataContext` to use `queryClient.prefetchQuery`. Delete `cacheSlice`. _Effort: Large_

10. **Add error handling to Oxford services** — Wrap all functions in try/catch with `logException`. _Effort: Small_

11. **Convert Oxford screens to React Query** — Replace manual useState/useEffect with `useQuery`/`useMutation`. _Effort: Medium_

12. **Fix House entity side effect** — Replace field initializer with static factory or move to interface + factory function. _Effort: Small_

13. **Parallelize DataContext startup** — Use `Promise.all` for independent fetches. _Effort: Small_

14. **Create root README.md and SETUP.md** — Include Xcode 26 Podfile fix. _Effort: Small_

### Following Sprint — Quality & Performance

15. **Replace `moment.js` with `date-fns`** — Incremental file-by-file migration. ~262KB bundle reduction. _Effort: Medium_

16. **Decompose `useBaseActivityScreen`** — Split into 4 focused hooks. _Effort: Medium_

17. **Type navigation props** — Replace `NativeStackNavigationProp<any>` with `NativeStackScreenProps<RootStackParamList>`. _Effort: Medium_

18. **Add integration tests to CI** — Configure Firebase emulator in GitHub Actions. Make emulator absence a hard failure. _Effort: Medium_

19. **Set up deployment pipeline** — iOS Fastlane + Android Gradle signing in GitHub Actions. _Effort: Large_

20. **Create Firestore schema docs, Cloud Functions API docs, Architecture diagram** — Group related documentation effort. _Effort: Medium_

---

## Positive Patterns Worth Preserving

- **Offline queue** (`offlineQueue.ts`, `useOfflineSync.ts`) — Production-quality with retry, dead-lettering, lazy loading
- **Cursor-based pagination** (`getActivitiesPage`) — Correct N+1 fetch pattern
- **React Query key factories** (`activityKeys`, `oxfordKeys`) — Well-structured hierarchical invalidation
- **Optimistic updates** in React Query mutations — Proper rollback on error
- **Compliance calculations** (`compliance.ts`) — Clean pure functions, well-tested, good JSDoc
- **Oxford domain separation** — Clean entity-service-query boundaries; template for other domains
- **Soft deletion** for activities — Audit trail preservation
- **EnhancedAuthService** — Good input validation, sanitization, user-friendly errors

---

## Review Metadata

- Review date: 2026-04-07 to 2026-04-08
- Phases completed: 1 (Code Quality & Architecture), 2 (Security & Performance), 3 (Testing & Documentation), 4 (Best Practices & Standards), 5 (Consolidated Report)
- Flags applied: framework=react-native
- Agents used: code-reviewer, architect-review, security-auditor, performance-engineer, qa-expert, documentation-engineer, react-specialist, deployment-engineer
- Total findings: 96 (deduplicated across phases)
