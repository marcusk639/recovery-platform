# Phase 2: Security & Performance Review

## Security Findings

### Critical

1. **Firebase Service Account Private Keys Committed to Git** (CVSS 9.8, CWE-798) — `scripts/service-key.json` (lines 1-38), `scripts/credentials.json` (lines 1-12) — Three complete Firebase Admin SDK private keys for `rats-fe9c3`, `rats-dev`, and `phoenix-cleanhouse` (production). Despite `.gitignore` entry for `service-key.json`, both files are already tracked. `credentials.json` is not in `.gitignore` at all. Grants full Admin SDK access: read/write all data, create/delete auth accounts, set custom claims. **ACTION: Rotate keys immediately.**

2. **`payments` Collection Has No Firestore Security Rules** (CVSS 9.1, CWE-862) — `firebase/firestore.rules` — No `match /payments/{paymentId}` rule exists. `recordManualPayment()` writes directly from client with `status: 'succeeded'` and zero server-side validation. Any authenticated user can forge payment records.

### High

3. **Email Verification Disabled — Accounts Auto-Verified** (CVSS 7.5, CWE-287) — `src/services/EnhancedAuthService.ts` — Line 179 says "Email verification removed" but line 75 still rejects unverified users. Without verification, attackers register with emails they don't own. Especially sensitive for sober living health data.

4. **Hardcoded E2E Test Credentials Against Production Firebase** (CVSS 7.2, CWE-798) — `e2e/helpers/auth.js` lines 110-131, `scripts/seed-e2e-users.js` — Test accounts with known passwords (`TestPassword123!`) exist in production Firebase (`phoenix-cleanhouse`). Anyone with repo access can authenticate as admin in production.

5. **Deep Link Invitation Parameters Not Signed** (CVSS 7.5, CWE-345) — `src/services/native-deep-links.ts` lines 26-39 — Invitation URLs encode `invitationType`, `houseId`, `email` directly. Attacker crafts URL with `invitationType=admin` to gain admin access. No server-side validation or token-based verification.

6. **Overly Permissive Firestore Rules — Multiple Collections** (CVSS 7.5, CWE-285) — `firebase/firestore.rules` — `complaints`, `bugs`, `feedback`, `guest-reports` allow read/write to ANY authenticated user across ALL houses. `admins` collection readable by any user (PII exposure). House updates allowed by any guest (including Stripe config, rent amounts).

### Medium

7. **Vote Firestore Rules Block Legitimate Vote Casting** (CVSS 5.3, CWE-863) — Rules deny `update` on votes, but `castVote()` uses `transaction.update()`. Either deployed rules differ (unauditable) or voting is broken. Also: guests can't read votes despite being primary voters.

8. **Payment Amount Not Validated — Dollar/Cent Mismatch** (CVSS 6.5, CWE-20) — `src/services/payments.ts`, `PaymentDashboard.tsx` — No max amount validation. Dollar/cent ambiguity means $500 payment could become $50,000 or $5 depending on code path.

9. **Client-Side Rate Limiting is Trivially Bypassable** (CVSS 5.3, CWE-770) — `src/services/SimpleValidationService.ts` — In-memory Map cleared by app restart. No server-side protection against brute-force.

10. **Google Maps API Key in `.env`** (CVSS 5.0, CWE-312) — Key format `AIzaSy...` in `.env`. File is gitignored but key may have unrestricted API/referrer restrictions.

11. **Direct Messages Rules Allow Sender Spoofing** (CVSS 5.3, CWE-863) — `firebase/firestore.rules` line 212 — Write rule uses `resource.data.senderId` (the written doc) instead of `request.auth.uid`, allowing message impersonation.

12. **Outdated Dependencies with Known Vulnerabilities** (CVSS varies, CWE-1395) — `react-native: ^0.72.0` (3+ years old), `@react-native-firebase/*: ^17.3.1` (current is v21+), `moment: ^2.29.4` (ReDoS), `react-native-best-viewpager` from personal GitHub fork (supply chain risk).

### Low

13. **Legacy Password Validation Missing Special Characters** — `src/services/password.ts` — Legacy `checkPasswordReqs()` doesn't require special characters, while `SimpleValidationService` does. If any screen uses legacy function, weaker passwords allowed.

14. **XSS Sanitization Incomplete** (CWE-79) — `src/services/SimpleValidationService.ts` lines 222-232 — Denylist-based regex stripping is bypassable. Lower risk in React Native (no HTML rendering) but relevant if data flows to web.

15. **Realtime Database Rules May Not Be Deployed** — `database.rules.json` has deny-all but should verify deployment matches.

---

## Performance Findings

### Critical

1. **House Entity Class Fires Firestore Call on Every Instantiation** — `src/entities/House.tsx` line 46 — `id: string = houseService.createHouseId()` calls `collection.doc().id` on every `new House()`, including deserialization and test fixtures. Hundreds of unnecessary Firestore refs per session.

2. **Triple-Caching Architecture — 2-3x Memory Overhead** — React Query cache + Redux entity slices + Redux `cacheSlice` store identical entities independently. A house with 20 guests has the guest list in three memory locations with three different staleness windows. Cache incoherence causes stale UI.

### High

3. **DataContext Waterfall Loading — 800ms-2s Added to Startup** — `src/context/DataContext.tsx` lines 94-170 — Sequential `await` calls: `getHouses()` → `getGuests()` → `selectGuest()` → `getAdmin()`. Four sequential Firestore round-trips when houses and admin data could load in parallel.

4. **Unbounded Firestore Listeners Without Lifecycle Cleanup** — Screens stay mounted in React Navigation stack, accumulating `onSnapshot` listeners. `useActivityCount` opens a full listener just for `snapshot.size` instead of using `count()` aggregation.

5. **Duplicate Data-Fetching Systems for Same Data** — React Query hooks (one-shot `.get()`) AND Firestore listener hooks (`onSnapshot`) both active for activity data. `useHouseActivities` polls every 30s redundantly while a real-time listener is already active.

6. **moment.js Bundle Bloat — 262KB+** — `moment` + `moment-timezone` imported across 38 files. Not tree-shakeable. Used only for formatting, week boundaries, and date arithmetic that `date-fns` handles in 2-10KB.

7. **updateWeekSummary Re-reads ALL Activities on Every Log** — `src/services/activity.ts` line 314 — Logging 1 activity triggers a full range query of all week activities to recalculate the summary. Should use Firestore `increment()` for atomic counter updates.

### Medium

8. **lodash Full Bundle and cloneDeep Overuse** — 40+ files import lodash. Barrel imports pull full library. 25 files use `cloneDeep` where spread suffices (e.g., `cloneDeep(guest)` just to spread into another object).

9. **PaymentDashboard Uses ScrollView for 100+ Items** — `src/screens/HouseSettings/PaymentDashboard.tsx` lines 257-309 — `.map()` in ScrollView renders all 100 payment cards simultaneously. No virtualization. VictoryChart (heavy SVG) in scroll layout.

10. **RatsFlatList Disables `removeClippedSubviews` Globally** — `src/components/rats-flat-list/index.tsx` — Forces `removeClippedSubviews={false}` on all FlatLists, defeating native memory optimization. 30-50% higher memory for all list screens.

11. **useBaseActivityScreen (530 Lines) Wide Re-render Blast Radius** — Returns 16 values. Any state change (e.g., modal visibility) re-renders entire activity screen including list, search, and filters. `filterActivitiesByType` runs `.sort()` with `moment.utc().diff()` on every render.

12. **No Lazy Loading for Navigation Screens** — `src/navigation/navigators.tsx` eagerly imports 40+ screens at startup. Feature-specific screens (Oxford, Payments) loaded even if never visited.

### Low

13. **Rate Limiter Map Memory Leak** — `SimpleValidationService.ts` — Unbounded Map grows without cleanup. ~100 bytes per unique identifier.

14. **getByAttribute Has No Limit Safety** — `src/services/crud.tsx` — Bare `.where()` with no `.limit()`. Fine for current scale but no guardrail.

15. **Activity Screen Opens Listener with limit: 500** — Downloads up to 500 documents on every Activities tab navigation. Cursor-based pagination (`useInfiniteActivities`) already exists but isn't used here.

---

## Critical Issues for Phase 3 Context

### Testing Implications

- **Service account keys in repo** — E2E tests run against production. Test infrastructure needs separate Firebase project.
- **Duplicate data paths (Oxford)** — Tests may pass against one Firestore path while production uses another.
- **Payment unit mismatch** — Financial tests must assert consistent amount units across all code paths.
- **Vote rules mismatch** — Integration tests against emulator may succeed while production rules block `update` operations.
- **Triple-caching** — Tests that verify data freshness may pass when checking one cache but fail in production when caches diverge.

### Documentation Implications

- **Firestore security rules** — No documentation of the deployed rule set or intended access control model.
- **Payment amount convention** — No documented standard for dollars vs. cents.
- **State management boundary** — No documented guidance on when to use Redux vs React Query.
- **Deep link format** — Invitation URL format is undocumented and unsigned.
