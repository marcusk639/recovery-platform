# Phase 4: Best Practices & Standards

## Framework & Language Findings

### Critical

1. **Conditional Hook Invocation in `Disputes.tsx`** — An early `return null` guard at line 57 sits between hook calls. Hooks above the guard (`useMemo`, `useActivities`) execute, but `useBaseActivityScreen` below it is conditionally skipped. This violates React's Rules of Hooks and will cause "Rendered fewer hooks than expected" runtime crashes when `!house || !user?.id` changes between renders. Fix: move all hooks above any guard return.

2. **Triple-Caching Creates Silent Stale Data** (confirmed independently from Phase 1) — Redux entity slices, `cacheSlice`, and React Query store the same entities with no synchronization. `GuestHome.tsx` explicitly works around this with `const currentGuest = queryGuest || guest` — a symptom of the problem. Mutations through React Query don't update Redux, so screens reading from Redux show stale data.

### High

3. **God-Hook `useBaseActivityScreen` — 16 Return Values, Mixed Concerns** — 530 lines combining modal state, search/filter, dispute CRUD, and UI button prop factories. Returns `any`-typed button props (view layer concern in a hook). No single screen uses all 16 values, yet all consumers re-render when any value changes. Should decompose into `useActivityModal`, `useActivityFilters`, `useDisputeActions`, `useActivityMetadata`.

4. **`NativeStackNavigationProp<any>` Across 58 Files** — Typed `RootStackParamList` exists in `src/navigation/types.ts` but is unused. `navigation.navigate('nonExistentRoute')` compiles without error. `BusinessMeetingDetail.tsx` also uses `route: { params: { meeting: any } }`.

5. **Mutable Entity Classes with Side Effects in Field Initializers** — `Guest.id = createGuestId()` and `BaseEntity.createdAt = new Date().toISOString()` trigger on every instantiation including deserialization. Store's `ignoredPaths` list for serialization checks is a symptom. Should migrate to interfaces + factory functions.

6. **Dual State Management for Same Entities** — `guestsSlice` and `housesSlice` contain async thunks duplicating React Query hooks that call the same service functions. `DataContext.tsx` dispatches Redux thunks while screens use React Query. Two independent fetch paths produce different results simultaneously.

7. **`moment.js` (262KB + 160KB timezone) in 25 Files** — Not tree-shakeable. Hermes JIT startup is sensitive to bundle size. All usage (formatting, arithmetic, `isBetween`) replaceable with `date-fns` (2-10KB tree-shakeable).

8. **Oxford Screens Bypass React Query for Server Data** — `BusinessMeetings.tsx` and `Voting.tsx` use manual `useState` + `useEffect` + explicit loading/error flags instead of React Query. Include a manual "Refresh" button that React Query's stale-while-revalidate makes unnecessary.

### Medium

9. **`FlatList scrollEnabled={false}` Inside `ScrollView`** — Oxford screens nest disabled-scroll FlatLists inside `RatsScrollView`, defeating virtualization. All items render upfront.

10. **94 `as any` Casts in Screen Files** — Including 9 files using `useAppSelector((state: any) => ...)`. The `store.ts` comment "Type-safe with no 'as any' casts" is inaccurate. `housesSlice` declares `error: any`.

11. **`react-native-iphone-x-helper` Used but Not in `package.json`** — Transitive dependency; fragile. Predates official `useSafeAreaInsets()` API which is already a direct dependency.

12. **`children: any` in 4 Foundational Components** — `RatsScrollView`, `RatsModal`, `RatsModalForm`, `RatsPopover` should use `React.ReactNode`.

13. **Full `lodash` Bundle Imports** — Several files import from root `lodash` (70KB). Only `src/util/admin.ts` uses per-method imports. Most `cloneDeep` uses unnecessary (Immer handles immutability in RTK mutations).

14. **`RatsFlatList` Hardcodes `removeClippedSubviews={false}`** — Globally suppresses Android memory optimization. No override possible.

15. **`housesSlice` Has 14 Boolean Loading Flags** — Instead of `AsyncStatus` union used in `guestsSlice`. Creates impossible states (`creatingHouseSuccessful: true` AND `creatingHouseFailed: true`).

16. **Inline Styles Dominating Oxford Screens** — `Voting.tsx` has 60+ inline style declarations. Creates new object references per render, defeating React bailout. Established `StyleSheet.create()` pattern exists elsewhere.

17. **Safe Area Handling Inconsistent** — Some screens use `SafeAreaView`, some use `edges={['bottom']}` only, many have none. Content can underlap navigation bars on newer iPhones.

18. **`useActivities` Hook Bypasses React Query** — Raw Firestore `onSnapshot` in `hooks/activity/useActivities.ts` alongside identically-named React Query version in `activityQueries.ts`. Unstable `Date` deps cause re-subscription on every render.

### Low

19. **Deprecated `withRats` HOC Retained** — `@deprecated` JSDoc but file remains. Duplicate `rats-hoc.tsx` and `rats-hoc.ts` exist.

20. **React Native 0.72 — Two Major Versions Behind** — Current is 0.76+. New Architecture (Fabric/JSI) stable in 0.76. Several packages require 0.73+ for latest versions.

21. **Near-Zero Accessibility Coverage** — Only 3 `accessibilityLabel` usages across all screens. Oxford screens have zero. No `accessibilityRole="button"` on TouchableOpacity press targets.

22. **47+ `console.error/warn` Calls in Production** — `ErrorBoundary.tsx` only calls `console.error`, not `Sentry.captureException`. Production errors invisible without console attached.

23. **`AuthStackParamList & SetupStackParamList` Type Overlap** — Intersection makes setup routes valid for auth context. Navigator tree doesn't match the type.

---

## CI/CD & DevOps Findings

### Critical

1. **Firebase Service Account Keys Committed to Git** (confirmed from Phase 2) — `scripts/service-key.json` contains full admin private keys for production (`phoenix-cleanhouse`) and dev projects. Not effectively gitignored (already tracked). Must rotate immediately, remove from git history.

2. **No Production Deployment Pipeline** — Zero automation for App Store / Play Store releases. No deployment staging (dev → staging → prod). No app version management. No signed production builds in CI. Cannot verify deployment history or rollback.

### High

3. **No Environment Separation or Configuration Management** — Single `.env` file. No per-environment configs (build variants/flavors). Firebase project selection happens at runtime with no build-time distinction. No iOS build schemes for dev/staging/prod. No Android build flavors.

4. **Integration Tests Not Running in CI** — `jest.config.integration.js` exists, `npm run test:integration` script defined, but not invoked in GitHub Actions. Firestore-specific functionality not tested before deployment. Test setup silently swallows emulator absence.

5. **E2E Tests Don't Validate Against Real Environment** — Emulator-only testing. Production issues (network latency, real data constraints, security rules enforcement) not caught. Emulator behavior differs from production.

6. **No Rollback Automation or Disaster Recovery** — No automated health checks post-deployment. No kill switch or feature flags for runtime control. No runbooks for incident response. Manual app store process takes 48+ hours.

### Medium

7. **No Test Coverage Requirements in CI** — Unit tests run with `--no-coverage` flag. `passWithNoTests` allows zero tests to pass. No coverage reporting to PRs. No threshold enforcement.

8. **Weak E2E Test Isolation** — Firebase emulator cleanup is manual. Tests may pass due to lucky ordering. No screenshot/video capture on failure.

9. **Outdated React Native Version 0.72** — Security vulnerabilities likely fixed in newer versions. Missing performance improvements. Breaking changes accumulate the longer upgrade is deferred.

10. **Missing Deployment Documentation** — No `DEPLOYMENT.md`, release checklist, or runbook. Deployment knowledge lives in individual heads.

### Low-Medium

11. **No Automated Security Scanning** — No `npm audit` in CI. No Dependabot for dependency updates. No SAST scanner.

12. **No Analytics or Error Monitoring Dashboard** — Sentry integration exists but no configured alerts or dashboards for post-deployment monitoring.

13. **Code Signing Not Automated in CI** — Manual signing likely required for production builds.

14. **Incomplete CI/CD Pipeline Visibility** — Test results only in GitHub Artifacts. No centralized reporting or deployment dashboard.
