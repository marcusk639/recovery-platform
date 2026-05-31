# Phase 2: Security & Performance Review

## Security Findings (from Phase 2A)

**Overall Security Posture: 42/100 (Poor)**
**Total: 21 findings — 5 Critical, 7 High, 6 Medium, 3 Low**

### Critical

**S-C1: Firebase Realtime Database Rules Completely Open** (CWE-284)
`database.rules.json` has `".read": true, ".write": true`. RTDB is used for house group chat. Any person with the Firebase project ID (embedded in app binary) can read all house chat messages — which include recovery status, disputes, substance use incidents, personal crises. Documented in PRODUCT_STRATEGY_ASSESSMENT.md as "Risk 1" with "1 hour fix" but not in any sprint plan.

**S-C2: Payment Functions Have No Authorization** (CWE-862)
`listPayments` and `savePaymentMethod` have zero authorization checks. Any authenticated user can call `listPayments` with any guest ID to retrieve full payment history across all houses. Any user can call `savePaymentMethod` to attach payment methods to other guests' accounts. ACTIVE_PLAN acknowledges this: "Privacy violation, potential legal liability." Fix is Task 5.3 in unexecuted Sprint 5.

**S-C3: Oxford Subcollections Have Zero Firestore Rules** (CWE-284)
`houses/{houseId}/officers`, `/meetings`, `/votes`, `/ees` subcollections have no security rules. Any signed-in user can read/write any house's Oxford governance data, including anonymous votes (expulsion votes), officer assignments, and Equal Expense Share financial records. ACTIVE_PLAN marks this P0; fix is Task 5.4, unexecuted.

**S-C4: `handleStripeConnectWebhook` Not Implemented** (CWE-841)
Function is exported but body does not exist. Stripe `account.updated` and `account.deauthorized` events are silently dropped. Operators who complete Express account onboarding never transition from PENDING → ACTIVE. Resident payments fail. GTM plan confirms: "Operators stuck in PENDING state."

**S-C5: Stripe Secret Key Rotation Unverified** (CWE-798)
GAP*ANALYSIS (Dec 2025) documents a hardcoded `sk_live*`key in`regroup-functions/functions/src/api/stripe.ts`. ACTIVE_PLAN claims migration to Secret Manager, but documentation does not confirm the key was rotated in Stripe Dashboard. Even if removed from code HEAD, the key may remain in git history.

---

### High

**S-H1: No Privacy Framework for Sensitive Health-Adjacent Data** (CWE-359)
App collects medication tracking, sobriety dates, drug test results (UA/BA), AA/NA meeting attendance, mental health indicators, GPS location, SSN last 4, DoB, and court-ordered placement status. No data classification policy, retention schedule, deletion procedures, or breach notification plan. HIPAA compliance is explicitly in Kill List as "Deferred." ToS and Privacy Policy are Sprint 9 tasks — after user acquisition begins.

**S-H2: `subscriptionIsActive()` Returns False for 'trialing'** (CWE-863)
Every paywall guard that calls this function blocks legitimate trialing operators. GTM plan confirms the bug and states all call sites need auditing. Inverse risk: statuses like `past_due` / `unpaid` may not be checked, allowing continued access after payment failure.

**S-H3: Dual-Repo Deployment Could Overwrite Production Functions** (CWE-436)
Payment functions exist in both `functions/` (mobile repo) and `regroup-functions/` (external repo). Running `firebase deploy --only functions` from the wrong repo overwrites production payment functions with potentially older, insecure versions. ACTIVE_PLAN flags as "Key risk / must resolve before go-live" but Task 5.5 allocates only 2 hours.

**S-H4: Webhook Signature Verification Status Unconfirmed** (CWE-345)
PRODUCT_STRATEGY_ASSESSMENT: "Stripe webhook endpoint registration unconfirmed." Without `stripe.webhooks.constructEvent()`, forged webhook events can simulate payment completions, subscription changes, or account status updates — marking unpaid rent as paid or granting Oxford subscriptions without payment.

**S-H5: 2FA Deferred to Sprint 9 (~36 days out)** (CWE-308)
Operator accounts have full access to all resident data across all houses. No second factor protects against compromised operator passwords. Fix exists (Firebase MFA) but is last in the sprint queue despite operators holding the most sensitive data.

**S-H6: `phoenix-cleanhouse` Environment Ambiguity** (CWE-1188)
GTM plan lists as Critical Open Question: "Is `phoenix-cleanhouse` production or staging?" Sending real users to staging exposes their health-adjacent data to a non-production environment. GTM plan says confirm before marketing launch; not answered anywhere in docs.

**S-H7: Server-Side Rate Limiting Absent** (CWE-770)
Rate limiting is client-side only (in `EnhancedAuthService`). All 29 callable and 6 HTTPS Cloud Functions have no server-side rate limiting. Attackers bypass client-side limits entirely, enabling data enumeration, brute-force, and billing DoS via excessive Stripe payment intents.

---

### Medium

- S-M1: `admins` and `guest-reports` Firestore collections are "overly permissive" (no specifics documented)
- S-M2: Zero security-focused E2E tests for payment flows (cross-house access, auth boundaries, failed payment handling)
- S-M3: CLOUD_FUNCTIONS_REVIEW.md is outdated AI transcript — security assessments relying on it get wrong function signatures and authorization patterns
- S-M4: GAP_ANALYSIS contradictory security state — shows hardcoded key as active issue when ACTIVE_PLAN claims it's fixed
- S-M5: ToS/Privacy Policy not published while app is live and collecting health-adjacent data (Apple/Google policy violation, CCPA exposure)
- S-M6: `oxfordEnabled` flag set via HTTP-callable without documented authorization check — potential for premium feature bypass

---

### Low

- S-L1: Test credentials (`password: 'CustomPass123!'`) inlined in E2E documentation
- S-L2: No security event logging or audit trail for role changes, payment operations, admin privilege escalation
- S-L3: No CI/CD for regroup-functions — 49 payment/auth Cloud Functions deployed manually, no automated security linting gates

---

## Performance Findings (from Phase 2B)

**Total: 18 findings — 2 Critical, 5 High, 9 Medium, 3 Low**
**12 of 18 findings have no sprint task assigned**

### Critical

**P-C1: N+1 Cloud Function Calls on Payment Dashboard**
ACTIVE_PLAN Part 3 explicitly documents: payment dashboard calls `listPayments` once per resident → 15 concurrent Cloud Function cold-start invocations for a 15-person house → 5-10 second load time. Sprint 6.1 proposes the correct fix (`listHousePayments(houseId)`) but the documented fix spec has no pagination, no React Query `staleTime`, and no Firestore index — the fix as written may replace 15 slow calls with one unbounded call.

**P-C2: Sequential Per-Guest Subcollection Reads in `onWeekWrite` Health Trigger**
`ACTIVITY_SYSTEM_MIGRATION.md` Section 5.3 shows a `for...of await` loop over all guests, issuing one sequential subcollection read per guest to compute house health score. 15-resident house = 17 Firestore reads (1 guest, 1 house, 15 week subcollection) per activity write, sequentially. At 100 triggers/day × 17 reads × 100 houses = 170,000 sequential reads/day. No sprint addresses this.

---

### High

**P-H1: Five Timezone-Variant Scheduled Functions Share Identical Logic**
`scheduledWeeklyTransferEST/CST/MST/PST/Fallback` — separate deployed functions with duplicate code. ACTIVE_PLAN notes "potential over-engineering" but no consolidation sprint task exists.

**P-H2: `activities` Array Inside Week Document Is Unbounded**
`ACTIVITY_SYSTEM_MIGRATION.md` estimates "~50 activities max" but provides no enforcement mechanism. `getGuestActivities()` fetches the entire document and sorts in memory. Every write bills for the entire document. No overflow strategy to a subcollection is specified.

**P-H3: `house-activities` Write Fan-out**
Every resident activity writes to 2 locations atomically. With 3 composite indexes on `house-activities`, each activity generates 4 Firestore write operations (1 document + 3 index updates). At 75 activities/day × 4 = 300 writes/day per house. No cost estimate at target scale documented.

**P-H4: `endOfDayReminder` Nested N Sequential Reads**
Nested `for...of await` loops: all houses → all guests → one subcollection read per guest. 100 houses × 12 guests = 1,200 sequential subcollection reads per execution. At 50-100ms/read, this approaches Cloud Function timeout at modest scale. No sprint task, no scale ceiling documented.

**P-H5: No Cursor/Pagination Strategy for Activity Feed**
`getHouseActivityFeed()` accepts `startAfter` cursor but no documentation describes client cursor state management, how real-time listener updates reconcile with paginated results, or FlatList memory behavior with 500+ items. `ACTIVITY_SYSTEM_TEST_PLAN.md` specifies 500ms query SLA but no performance test case exists.

---

### Medium (9)

- P-M1: `disputes` map in house document grows unboundedly; no TTL or pruning documented
- P-M2: House score trigger issues sequential per-guest subcollection reads (could read flat guest docs to avoid all subcollection reads)
- P-M3: `subscriptionMetadata` loaded once at login, never refreshed via listener — lapsed subs show as active mid-session
- P-M4: 13 independent `useAppSelector` calls in `App.tsx` (Sprint 1 Task 5 fixes this — verify pattern doesn't repeat in other high-frequency screens)
- P-M5: Wildcard lodash imports block Metro tree-shaking (Sprint 4 addresses; no before/after bundle measurement planned)
- P-M6: Only one performance SLA documented: "Dashboard loads <2s for 20 residents" — no latency budget for auth, activity feed, payment initiation, or PDF export
- P-M7: Zero E2E tests measure timing or assert latency despite 500ms query SLA in test plan
- **P-M8: Firestore composite indexes documented but `firestore.indexes.json` not in any sprint** — first production query on `house-activities` with `orderBy('createdAt')` will fail at runtime
- P-M9: RTDB vs. Firestore architectural decision for live activity feed never formally closed in documentation

---

### Low

- P-L1: Firestore offline persistence not configured (GAP_ANALYSIS: 10% complete; no sprint assigned)
- P-L2: Dual-repo deployment could silently regress Cloud Functions from v2 (no cold starts) back to v1 (1-3s cold starts)
- P-L3: No bundle size measurement planned before or after Sprint 4 lodash cleanup

---

## Critical Issues for Phase 3 Context

The following findings from Phase 2 should directly inform the Testing & Documentation review in Phase 3:

1. **Zero payment E2E security tests** (S-M2) — critical path for revenue launch; need cross-house auth, failed payment, and operator onboarding test coverage
2. **No performance tests despite documented SLAs** (P-M7) — 500ms query SLA exists in spec but no test enforces it
3. **`firestore.indexes.json` not deployed** (P-M8) — this is a 30-minute fix that prevents runtime query failures the moment house-activities queries run in production; should be added to Sprint 5
4. **`handleStripeConnectWebhook` not implemented** (S-C4) — operator onboarding flow has no tests because the function doesn't exist
5. **Activity system migration status undocumented** — testing documentation (ACTIVITY_SYSTEM_TEST_PLAN) may be targeting a migration that is partially complete or abandoned
6. **HIPAA deferred but PHI collected** (S-H1) — test plans should include data minimization verification and deletion flow testing
7. **12 performance findings with no sprint tasks** — documentation (sprint plans) needs to be updated to include these items or explicitly deprioritize them with rationale
