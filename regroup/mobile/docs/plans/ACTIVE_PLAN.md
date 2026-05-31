# RATS — Active Plan (Single Source of Truth)

**Date:** May 22, 2026 (v3 — false alarm resolved, score updated)
**Previous revision:** February 27, 2026 (v2 — backend repo context)
**Branch:** main
**Status:** Sprints 1-4 executed. Payment system and Oxford House MVP shipped. Backend (regroup-functions) migrated to Cloud Functions v2. Moving to production hardening and go-to-market.

This document replaces all prior planning documents. Strategy docs (`FEATURE_PRIORITIZATION.md`, `PRICING_STRATEGY.md`, `PRODUCT_ROADMAP.md`) remain the north star for business decisions.

---

## Part 1: Full Ecosystem State

### regroup-rn7 (React Native mobile app)

- **232 test files**, CI via GitHub Actions (unit + e2e)
- **70+ screens** including 6 payment screens and 5 Oxford House screens
- **16 RTK slices**, 8 React Query hook files, memoized selectors
- Sentry initialized, StripeProvider wrapping app, iOS deployment target 13.0

### regroup-functions (Firebase Cloud Functions — separate repo)

- **49 deployed Cloud Functions** (29 callable, 6 HTTPS, 7 Firestore triggers, 7 scheduled, 1 RTDB)
- **Migrated to v2 SDK** (firebase-functions v7.x, firebase-admin v13.x, strict TypeScript)
- **122 tests passing**
- Key functions: payment intent creation, Stripe Connect, role management, meeting geolocation, invite emails, scheduled weekly transfers, webhook handling (11 Stripe event types)

### Embedded functions/ — Removed (migrated to regroup-functions)

- **Removed.** The 7 Stripe-specific Cloud Functions (createPaymentIntent, listPayments, savePaymentMethod, connectStripeAccount, disconnectStripeAccount, getStripeAccountStatus, stripeWebhook) have been migrated to `regroup-functions/functions/src/callable/payments.ts`.
- `regroup-functions` is the canonical deployment source. The `rats-v2/functions/` directory no longer exists.

### Frontend-Backend Function Alignment

| Mobile Call                        | In Embedded `/functions/` | In `regroup-functions` | Issue                                                                                                              |
| ---------------------------------- | ------------------------- | ---------------------- | ------------------------------------------------------------------------------------------------------------------ |
| `createPaymentIntent`              | Removed                   | Yes                    | Resolved — canonical in regroup-functions                                                                          |
| `createRentPaymentIntent`          | No                        | Yes (aliased)          | Resolved — `createRentPaymentIntent` at `src/services/payments.ts:65` wraps the canonical `createPaymentIntent` CF |
| `listPayments`                     | Removed                   | Yes                    | Resolved — canonical in regroup-functions                                                                          |
| `savePaymentMethod`                | Removed                   | Yes                    | Resolved — canonical in regroup-functions                                                                          |
| `connectStripeAccount`             | Removed                   | Yes                    | Resolved — canonical in regroup-functions                                                                          |
| `disconnectStripeAccount`          | Removed                   | Yes                    | Resolved — canonical in regroup-functions                                                                          |
| `getStripeAccountStatus`           | Removed                   | Yes                    | Resolved — canonical in regroup-functions                                                                          |
| `sendInviteEmails`                 | No                        | Yes                    | OK                                                                                                                 |
| `promoteGuestsToAdmin`             | No                        | Yes                    | OK                                                                                                                 |
| `addAdminAuthorization`            | No                        | Yes                    | OK                                                                                                                 |
| `addGuestAuthorization`            | No                        | Yes                    | OK                                                                                                                 |
| `deleteAdminAuthorization`         | No                        | Yes                    | OK                                                                                                                 |
| `givePotentialSuperAdminPrivilege` | No                        | Yes                    | OK                                                                                                                 |
| `updateSubscriptionGuests`         | No                        | Yes                    | OK                                                                                                                 |
| `updateSubscriptionHouses`         | No                        | Yes                    | OK                                                                                                                 |
| `userIsAtMeeting`                  | No                        | Yes                    | OK                                                                                                                 |

**Resolved:** regroup-functions is the canonical deployment source. The embedded rats-v2/functions/ directory has been removed.

---

## Part 2: Production Readiness Score

### Score: 85/100

| Component                 | Score   | Evidence                                                                                                                                             |
| ------------------------- | ------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| Mobile App                | **93%** | 232 tests, 70+ screens, payment + Oxford shipped, CI green                                                                                           |
| Backend (Cloud Functions) | **90%** | 49 deployed (v2), 122 tests, Secret Manager, dual-repo resolved                                                                                      |
| Testing                   | **92%** | 354 total test files across both repos                                                                                                               |
| Security                  | **68%** | Missing Firestore rules for payments + Oxford. `listPayments` and `savePaymentMethod` have no authorization checks (any authed user can read/write). |
| Architecture              | **95%** | Named imports, split components, memoized selectors, React Query                                                                                     |
| Documentation             | **85%** | Sprint plans good, dual-repo relationship documented and resolved                                                                                    |
| DevOps                    | **72%** | CI for mobile (unit + e2e), no CI for regroup-functions, manual deploy                                                                               |

### Score Timeline

| Date     | Score       | Key Change                                                                                                                                          |
| -------- | ----------- | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| Feb 5    | **62/100**  | Baseline                                                                                                                                            |
| Feb 22   | **72/100**  | +10: tests, secrets removed, nav migrated                                                                                                           |
| Feb 27   | **85/100**  | +13: payments shipped, Oxford MVP, backend v2, 354 tests                                                                                            |
| May 2026 | **~90/100** | +5: App Store prep shipped (Fastlane, metadata, E2E screenshots), StalePendingBanner, PaymentHistory stale clock, dead code removed, E2E sync fixed |

---

## Part 3: Detailed Gap Analysis — Payments, Oxford, Operator Dashboard

### A. Resident Payment System (75% → target 95%)

**What's built and working well:**

- RentPaymentScreen with balance breakdown (rent + chore fees + total due)
- Preset payment buttons (Full Due / Half / Full Balance / Custom amount)
- Stripe PaymentSheet integration with defensive fallback for pre-linking
- PaymentWebView for Stripe-hosted card entry
- Payment history list with retry on error
- React Query hooks with optimistic updates
- Rent reminder push notifications (Friday 9am → Monday due date)
- Cloud Functions: intent creation with 2% platform fee, idempotency keys, Express account routing
- Stripe webhook handling for 11 event types including disputes, subscription updates, payout failures

**UX gaps that hurt revenue:**

| Gap                                             | User Impact                                                                                                                        | Revenue Impact                                                                                       | Fix                                                                                                                                  |
| ----------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| **No saved cards / auto-pay**                   | Resident must re-enter card info every time                                                                                        | Every friction point reduces collection rate. Industry data: auto-pay increases collection by 20-40% | Add "Save card" checkbox → `savePaymentMethod` already exists. Add auto-pay toggle → create `scheduledRentCollection` Cloud Function |
| **No payment confirmation email**               | Resident pays but gets no receipt                                                                                                  | Reduces trust. Some residents will dispute charges they don't have proof of                          | Trigger SendGrid email on `payment_intent.succeeded` webhook (SendGrid already configured in backend)                                |
| ~~**`createRentPaymentIntent` may not exist**~~ | **Resolved** — `createRentPaymentIntent` at `src/services/payments.ts:65` wraps the canonical `createPaymentIntent` Cloud Function | —                                                                                                    | —                                                                                                                                    |
| **Two payment service files**                   | Developer confusion, risk of calling wrong endpoint                                                                                | Bug risk, maintenance cost                                                                           | Consolidate into single `payments.ts`                                                                                                |
| **`listPayments` has no authorization**         | Any signed-in user can list any guest's payment history                                                                            | Privacy violation, potential legal liability                                                         | Add house membership check in Cloud Function                                                                                         |
| **`savePaymentMethod` has no authorization**    | Any user could save payment methods for other guests                                                                               | Security vulnerability                                                                               | Add guest/house role check                                                                                                           |

**UX improvements that drive adoption:**

| Improvement                                                                    | Why It Matters                                           | Effort   |
| ------------------------------------------------------------------------------ | -------------------------------------------------------- | -------- |
| **Payment success celebration** — confetti/checkmark animation after payment   | Positive reinforcement drives repeat behavior            | 1 day    |
| **Balance badge on tab bar** — red badge with "$X due" on the House tab        | Passive reminder without being pushy                     | 0.5 days |
| **Payment receipt deep link** — tap notification to see receipt                | Closes the loop on the push notification flow            | 0.5 days |
| **Split payment option** — "Pay half now, half Friday" with scheduled reminder | Accommodates tight budgets; partial payment > no payment | 2 days   |

### B. Operator Payment Dashboard (40% → target 90%)

**What exists:**

- FlatList of all resident payments with guest name, amount, date, status badge
- "Total Collected" summary at top
- Color-coded status (green = succeeded, red = failed)

**Critical UX problems:**

| Problem                                   | What Happens                                                                                                             | Fix                                                                                                                 |
| ----------------------------------------- | ------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------- |
| **N+1 Cloud Function calls**              | Dashboard calls `listPayments` once per guest. 15 residents = 15 cold Cloud Function invocations = 5-10 second load time | Create `listHousePayments(houseId)` → single query. Migrate to React Query with `staleTime`                         |
| **No "who owes what" view**               | Manager sees past payments but can't quickly see who hasn't paid                                                         | Add "Overdue Residents" card at the top showing names + amounts. Sort by most overdue first                         |
| **No time-range filtering**               | Shows all payments ever, no way to see "this week" or "this month"                                                       | Add pill-style date filter: This Week / This Month / All Time                                                       |
| **No manual payment recording**           | Cash and check payments are invisible                                                                                    | Add "Record Payment" FAB button → modal with amount, method (Cash/Check/Venmo/Zelle), guest, notes                  |
| **No revenue chart**                      | Just a single number — manager can't see trends                                                                          | Add simple bar chart: weekly revenue for last 8 weeks. Use existing `react-native-chart-kit` or minimal custom bars |
| **No CSV/PDF export**                     | Operators need accounting data for bookkeepers/taxes                                                                     | Reuse `reportExport.ts` pattern for payment summary PDF. Add "Export CSV" button that generates and shares a file   |
| **No push notification for overdue rent** | Manager has to manually check dashboard                                                                                  | Add scheduled check: if guest.rentOwed > 0 three days past due date → notify manager                                |

**UX design principles for the dashboard:**

- **Top section:** Summary stats (Total Collected This Month / Outstanding Balance / Collection Rate %)
- **Middle section:** "Needs Attention" — overdue residents sorted by amount, tap to message
- **Bottom section:** Recent payments timeline, filterable
- **FAB:** Record Manual Payment
- **Header action:** Export (CSV/PDF)

### C. Oxford House Support (55% → target 85% for pilot)

**What's built:**

- OxfordDashboard with summary cards (Officers, Meetings, EES Transactions) + Elections quick link
- Subscription gate with upgrade CTA ($49/mo, 14-day trial, feature preview cards)
- Full React Query CRUD hooks for officers, meetings, votes, elections, EES, financial records
- Oxford service layer (officers.ts with batch role replacement)
- All 6 entity type definitions
- 5 navigation routes registered

**What's missing for a usable pilot:**

| Screen                | Current State                            | What's Needed                                                                                                                                         | Effort   |
| --------------------- | ---------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- | -------- |
| **OfficerManagement** | Route registered, unknown if implemented | Full CRUD: list officers by role, assign new officer (deactivates previous), show term start/end dates, "Term expires in X days" warning badge        | 3-4 days |
| **BusinessMeetings**  | Route registered, unknown if implemented | Meeting list (upcoming + past), create meeting with date/agenda, attendance toggle per resident, minutes text area, "Meeting happened" confirmation   | 3-4 days |
| **EESTracker**        | Route registered, unknown if implemented | Per-resident EES amount display, auto-calculation (total expenses / active residents), record payment from resident, transaction history              | 2-3 days |
| **OxfordVoting**      | Route registered, unknown if implemented | Create election (officer position or motion), cast vote with yes/no/abstain, show results with threshold (80% for new members), anonymous mode toggle | 2-3 days |

**Oxford-specific UX needs:**

| Feature                        | Why Oxford Houses Need It                                                                                                                           | Effort                                                                                     |
| ------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------ |
| **Officer rotation reminder**  | Oxford Houses must rotate officers every 6 months (charter requirement). Without reminders, houses forget and lose charter compliance               | 2 days — add `termEndDate` to Officer, create scheduled notification 30 days before expiry |
| **EES auto-recalculation**     | When someone moves in/out, the per-person share changes. Currently manual. Oxford treasurers cite this as their #1 pain point                       | 2 days — Firestore trigger on guest add/remove that updates EES amounts per resident       |
| **Meeting quorum indicator**   | Oxford meetings require a quorum (majority of residents). Show "X of Y present — quorum met/not met" during attendance taking                       | 1 day                                                                                      |
| **Vote threshold display**     | New member acceptance requires 80% yes. Show threshold bar during voting with real-time count                                                       | 1 day                                                                                      |
| **Charter compliance summary** | Oxford Houses have specific requirements (weekly meetings, officer elections, financial transparency). Show a compliance scorecard on the dashboard | 2-3 days — extend existing compliance.ts with Oxford-specific rules                        |
| **Anonymous voting**           | Expulsion votes and some officer elections should be anonymous. Add `isAnonymous` flag to Election entity, hide voter identities in results         | 1 day                                                                                      |

**Firestore security gap (P0):**

- `houses/{houseId}/officers`, `/meetings`, `/votes`, `/ees` subcollections have **zero security rules**
- Any signed-in user can currently read any house's Oxford data
- Fix: Add explicit subcollection match rules with house role checks
- Effort: 2-4 hours

---

## Part 4: Execution Plan — UX Quality & Revenue Focus

### Sprint 5: Payment System Ship-Ready (Days 1-5)

**Goal:** A resident can pay rent end-to-end, and a manager can see it. Zero lost payments.

| #   | Task                                                                                                                                                          | Type         | Effort |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------ | ------ |
| 5.1 | ~~Resolve `createRentPaymentIntent` vs `createPaymentIntent` naming~~ — **DONE:** `createRentPaymentIntent` in `payments.ts` correctly wraps the canonical CF | Bug fix      | —      |
| 5.2 | Consolidate `payment.ts` + `payments.ts` → single service                                                                                                     | Cleanup      | 2 hrs  |
| 5.3 | Add authorization to `listPayments` and `savePaymentMethod`                                                                                                   | Security     | 4 hrs  |
| 5.4 | Add Firestore rules for payments + Oxford subcollections                                                                                                      | Security     | 3 hrs  |
| 5.5 | ~~Resolve dual-repo function deployment~~ — **DONE:** regroup-functions is canonical                                                                          | Architecture | —      |
| 5.6 | Set real Stripe publishable key via react-native-config                                                                                                       | Config       | 30 min |
| 5.7 | Configure Stripe webhook secret in Cloud Functions env                                                                                                        | Config       | 30 min |
| 5.8 | End-to-end payment test with Stripe test card on physical device                                                                                              | Validation   | 1 day  |

### Sprint 6: Manager Dashboard — Make Money Visible (Days 6-12)

**Goal:** Manager opens app, instantly sees revenue flowing and who's behind.

| #   | Task                                                                           | Type        | Effort   |
| --- | ------------------------------------------------------------------------------ | ----------- | -------- |
| 6.1 | Create `listHousePayments(houseId)` Cloud Function                             | Backend     | 1 day    |
| 6.2 | Rebuild PaymentDashboard with React Query, single endpoint                     | Performance | 1 day    |
| 6.3 | Add "Overdue Residents" card at top (names, amounts, tap-to-message)           | Revenue     | 1 day    |
| 6.4 | Add manual payment recording (Cash/Check/Venmo/Zelle) with FAB button          | Revenue     | 1.5 days |
| 6.5 | Add date filter pills (This Week / This Month / All Time)                      | UX          | 0.5 days |
| 6.6 | Add revenue summary stats (Total This Month / Outstanding / Collection Rate %) | UX          | 1 day    |
| 6.7 | Add weekly revenue bar chart                                                   | UX          | 1 day    |

### Sprint 7: Resident Payment — Reduce Friction (Days 13-20)

**Goal:** Residents enroll in auto-pay. Payment happens without thinking.

| #   | Task                                                                         | Type          | Effort   |
| --- | ---------------------------------------------------------------------------- | ------------- | -------- |
| 7.1 | "Save card for future payments" checkbox on payment screen                   | Retention     | 2 days   |
| 7.2 | Auto-pay enrollment toggle on RentPaymentScreen                              | Revenue       | 2 days   |
| 7.3 | `scheduledRentCollection` Cloud Function (charges saved methods on due date) | Revenue       | 2 days   |
| 7.4 | Payment confirmation email via SendGrid on webhook success                   | Trust         | 1 day    |
| 7.5 | Payment success celebration animation                                        | UX delight    | 0.5 days |
| 7.6 | Balance badge on tab bar ("$X due")                                          | Passive nudge | 0.5 days |
| 7.7 | CSV export on PaymentDashboard                                               | Operator need | 1 day    |
| 7.8 | Manager notification when rent is 3+ days overdue                            | Revenue       | 1 day    |

### Sprint 8: Oxford House — Pilot-Ready (Days 21-35)

**Goal:** An Oxford House can run its entire governance through the app.

| #   | Task                                                                           | Type       | Effort   |
| --- | ------------------------------------------------------------------------------ | ---------- | -------- |
| 8.1 | OfficerManagement screen — full CRUD with term dates and role badges           | Core       | 3-4 days |
| 8.2 | BusinessMeetings screen — create, attendance toggle, minutes, quorum indicator | Core       | 3-4 days |
| 8.3 | EESTracker screen — per-resident amounts, record payments, transaction history | Core       | 2-3 days |
| 8.4 | EES auto-recalculation trigger on guest add/remove                             | UX quality | 2 days   |
| 8.5 | OxfordVoting screen — create election, cast vote, threshold bar, results       | Core       | 2-3 days |
| 8.6 | Anonymous voting toggle                                                        | Feature    | 1 day    |
| 8.7 | Officer term rotation reminders (notification 30 days before expiry)           | Compliance | 2 days   |
| 8.8 | Meeting quorum indicator and vote threshold display                            | UX         | 1 day    |

### Sprint 9: Quality & Launch Prep (Days 36-45)

| #   | Task                                                               | Type           | Effort   |
| --- | ------------------------------------------------------------------ | -------------- | -------- |
| 9.1 | Execute `migrate-full.ts` data migration (dry-run → execute)       | Data integrity | 4 hrs    |
| 9.2 | Fix 2FA to use Firebase MFA enrollment (not signInWithPhoneNumber) | Security       | 1-2 days |
| 9.3 | Add CI for regroup-functions (GitHub Actions)                      | DevOps         | 1 day    |
| 9.4 | Verify Sentry captures errors in production builds                 | Monitoring     | 4 hrs    |
| 9.5 | Test PDF compliance export on physical iOS device + `pod install`  | QA             | 4 hrs    |
| 9.6 | Publish ToS/Privacy pages at regroup.app/terms and /privacy        | Legal          | 2 hrs    |
| 9.7 | Oxford charter compliance scorecard on dashboard                   | Feature        | 2-3 days |
| 9.8 | Document dual-repo deployment process                              | DevOps         | 2 hrs    |

---

## Part 5: Kill List

Unchanged:

| Feature                                   | Decision          | Reason                 |
| ----------------------------------------- | ----------------- | ---------------------- |
| Web app modernization (Angular → Next.js) | **Kill**          | Mobile-first           |
| Alumni network                            | **Defer Year 2+** | No critical mass       |
| QuickBooks integration                    | **Defer Year 2+** | CSV sufficient         |
| v2 clean-port rewrite                     | **Kill**          | Absorbed incrementally |
| HIPAA compliance                          | **Defer**         | Not needed at scale    |
| Document management                       | **Defer**         | Not a revenue driver   |

---

## Part 6: Success Metrics

### 3-Month — May 2026

- [ ] Payments live in 3+ houses with real money
- [ ] Auto-pay enrolled by 20%+ of residents
- [ ] $500+/month in processing revenue
- [ ] Dashboard loads <2s for 20 residents
- [ ] Firestore rules cover all collections
- [ ] 354+ tests in CI across both repos

### 6-Month — August 2026

- [ ] Oxford pilot with 5+ houses
- [ ] $2,000+/month total revenue
- [ ] 30+ houses, manual payment recording used by 50%+ of managers
- [ ] CSV/PDF exports in production use

### 12-Month — February 2027

- [ ] 100+ houses, $10K+/month revenue
- [ ] Oxford features used by 50+ houses
- [ ] 60%+ auto-pay adoption
- [ ] 3+ regional markets

---

**This file is the single source of truth for what remains to be built. Update it when sprints are completed.**
