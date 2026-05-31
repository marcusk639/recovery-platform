# Phase 1: Code Quality & Architecture Review

## Code Quality Findings

### Critical

1. **Oxford Service Layer Has Zero Error Handling** — `src/services/oxford/index.ts`, `businessMeetings.ts`, `votes.ts` — Every function performs raw Firestore operations with no try/catch, no error logging, and no user-friendly error wrapping. Compare with `src/services/activity.ts` where every function wraps operations in try/catch with `logException`. A network blip surfaces as an unhandled Firestore exception.

2. **Duplicate Oxford Service Implementations — Conflicting Firestore Paths** — `src/services/oxford/index.ts` uses flat top-level collections (`firestore.collection('businessMeetings')`) while `src/services/oxford/businessMeetings.ts` uses subcollections (`houses/{houseId}/business-meetings`). These write to **different Firestore locations**, causing invisible data loss depending on which module a consumer imports.

3. **Payment Amount Unit Mismatch (Dollars vs Cents)** — `src/services/payments.ts` line 167 (`recordManualPayment` accepts dollars), `src/screens/Payments/ResidentPayment.tsx` line 104 (converts to cents), `src/screens/HouseSettings/PaymentDashboard.tsx` line 192 (displays assuming dollars). Mixing manual payments (dollars) with Stripe payments (cents) in the same collection produces incorrect financial reports.

### High

4. **Pervasive `NativeStackNavigationProp<any>` Defeats Type Safety** — 58 screen files use `<any>` instead of `RootStackParamList`, meaning `navigation.navigate('nonExistentRoute')` compiles without error and route parameters are not type-checked.

5. **`useBaseActivityScreen` is a God-Hook (530 Lines, 16 Return Values)** — `src/hooks/useBaseActivityScreen.ts` — Combines modal state, dispute CRUD, activity filtering, button prop generation, Firebase writes, and notification building. Cyclomatic complexity well above 10. Should be decomposed into `useActivityModal`, `useDisputeActions`, `useActivityButtonProps`, `useActivityFilter`.

6. **Untyped Redux Selectors Using `(s: any)`** — `src/screens/Payments/ResidentPayment.tsx` lines 125-126, `src/screens/HouseSettings/PaymentDashboard.tsx` lines 48-52 — Cast Redux state to `any`, bypassing the typed `useAppSelector` hook.

7. **`console.error` in Production Code** — `src/state/queries/activityQueries.ts` line 270, `src/screens/HouseSettings/PaymentDashboard.tsx` line 374, `src/config/firebase-emulator.ts` — Direct console calls instead of `logException` won't route to crash reporting.

### Medium

8. **Entity Classes Use Mutable Properties with Defaults** — `src/entities/Guest.tsx`, `House.tsx`, `BaseEntity.tsx` — All entity classes use mutable properties, leading to 25 files importing `cloneDeep` from lodash for defensive copies before mutation.

9. **Heavy `cloneDeep` Usage Instead of Structural Sharing** — 25 files — Deep cloning entire entity trees to update a single property. Should use spread-based immutable updates.

10. **Fire-and-Forget Firestore Writes** — `src/hooks/useBaseActivityScreen.ts` lines 203-205, 330-332, 364-366 — Dispute writes launch with `.catch(console.warn)` while local Redux state is already updated, creating local/server divergence.

11. **`moment` Used Alongside Native Date Operations** — `PaymentDashboard.tsx` uses moment, `activity.ts` uses native Date, `useBaseActivityScreen.ts` uses `moment.utc`. Adds 262KB bundle size and inconsistent timezone handling.

12. **Defensive `try/require` for Core Dependencies** — `src/screens/Payments/ResidentPayment.tsx` lines 26-75 — `@stripe/stripe-react-native` and payments service loaded via try/catch require() with stub fallbacks. TypeScript cannot type-check these imports.

13. **Rate Limiter Memory Leak** — `src/services/SimpleValidationService.ts` lines 304-329 — `rateLimitMap` is a static Map that grows unboundedly. No cleanup of expired entries.

### Low

14. **Email Verification Disabled but Code Still Checks It** — `src/services/EnhancedAuthService.ts` — Contradictory: line 179 says "Email verification removed" but lines 73-81 still reject unverified users.

15. **Vote Calculation Includes Abstentions in Threshold** — `src/services/oxford/votes.ts` lines 85-105 — Abstentions count toward `totalVotes`, making 80% threshold effectively unreachable. Oxford House rules typically exclude abstentions.

16. **Entity `.tsx` Extensions for Non-JSX Files** — Multiple entities use `.tsx` despite containing zero JSX.

17. **Missing Input Validation on Payment Service Functions** — `src/services/payments.ts` — `createRentPaymentIntent` and `recordManualPayment` don't validate `amount > 0` or non-empty IDs at the service boundary.

---

## Architecture Findings

### Critical

1. **Dual State Management — Redux Thunks + React Query for Same Entities** — Houses, Guests, and Admins have both Redux async thunks (`housesSlice.ts`) AND React Query hooks (`houseQueries.ts`) calling the same service functions. The same House entity can exist in three separate caches (Redux entity slice, React Query cache, Redux cacheSlice) with no synchronization. A mutation via React Query won't update Redux, and vice versa.

2. **Firestore Security Rules Not Version-Controlled** — `database.rules.json` only covers Realtime Database (which is unused). The actual Firestore security rules governing all data access are not in this repository. Either they're managed externally or default deny-all rules are in effect, masked by emulator overrides.

### High

3. **Triple-Caching Anti-Pattern** — Three independent caching layers: React Query cache (`staleTime` 30-120s), Redux entity slices (`housesRTK.houses`), and Redux `cacheSlice` (TTL-based with `lastFetched`). The `cacheSlice` and React Query solve the same problem with different semantics and no coordination.

4. **Mutable Class Entities with Side Effects** — `House.id` field initializer calls `houseService.createHouseId()` which triggers a Firestore call on every instantiation, even if you just want the type. Class instances fail Redux serialization checks (store has to ignore multiple paths).

5. **Flat Firestore Collection Design Lacks Tenant Isolation** — All Oxford collections (`officers`, `businessMeetings`, `votes`, etc.) and activities are top-level collections filtered by `houseId` at query time. Harder to write correct security rules, worse query performance at scale vs. subcollections under `houses/{houseId}/`.

### Medium

6. **Service Layer Pattern Inconsistency** — Three competing data access patterns: (A) Generic CRUD via `crud.tsx`, (B) Direct Firestore in `activity.ts`/`oxford/`, (C) Cloud Functions in `payments.ts`. The `payments.ts` file exposes the same CF operation twice with different names and parameter signatures.

7. **DataContext as God Object with Waterfall Loading** — `src/context/DataContext.tsx` provides a single context containing user, house, guest, and admin data. Sequential async dispatches serialize initial load. Any change to any entity re-renders all consumers.

8. **Inconsistent Error Handling Contracts** — `activity.ts` catches+logs+rethrows generic; `house.tsx` sometimes rethrows original, sometimes wraps; `payments.ts` has no error handling; `oxford/index.ts` lets raw Firestore errors pass through. Redux slices store errors as `any` vs `string | null`.

9. **Type Safety Gaps** — `RTK` suffixed store keys (migration artifact), `operator: any` in thunk params, `as any` casts for serverTimestamp, `@ts-ignore` in auth context.

### Low

10. **Monolithic Navigator (50+ Screens in One File)** — `src/navigation/navigators.tsx` registers all screens in one file with inline connector components that create new instances on every render.

---

## Critical Issues for Phase 2 Context

The following findings should directly inform the Security and Performance reviews:

### Security-Relevant

- **Firestore security rules are not version-controlled** — the security review must assess what rules exist (if any) and whether client-side data access is properly gated.
- **Flat collection design** — security rules for flat collections are harder to write correctly than subcollection rules.
- **Payment amount unit mismatch** — financial data integrity issue that could affect billing accuracy.
- **Duplicate Firestore paths for Oxford data** — data could be written to unprotected collection paths.

### Performance-Relevant

- **Triple-caching** — memory overhead and cache incoherence risk.
- **God-hook (530 lines)** — likely causes unnecessary re-renders in activity screens.
- **DataContext waterfall loading** — serialized initial load hurts app startup time.
- **`moment.js` bundle size** — 262KB for a library in maintenance mode.
- **`cloneDeep` on full entity trees** — deep cloning where spread would suffice.
- **Unbounded rate limiter Map** — memory leak over long sessions.
