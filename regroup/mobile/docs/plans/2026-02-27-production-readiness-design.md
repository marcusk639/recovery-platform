# RATS: Production Readiness Design

> **Generated:** February 27, 2026
> **Scope:** End-to-April (8-week) plan to reach three milestones: first real payment, Oxford pilot live, App Store submission
> **Strategy:** Two parallel tracks (Traditional payments + Oxford completion) converging at week 7 for launch prep

---

## Milestones

| #   | Milestone            | Target | Definition of Done                                                                                             |
| --- | -------------------- | ------ | -------------------------------------------------------------------------------------------------------------- |
| 1   | First real payment   | Week 4 | Resident pays rent on physical iOS device; money flows to operator via Stripe Connect; confirmation email sent |
| 2   | Oxford pilot live    | Week 5 | Real Oxford House completes one full governance cycle in-app (officers → meeting → EES → vote)                 |
| 3   | App Store submission | Week 8 | Production build submitted to Apple after successful TestFlight external review                                |

---

## Architecture: Two-Track Parallel Execution

### Week 0 — Shared Foundation (this week)

Both tracks are blocked until these are resolved:

**Deployment clarity**

- Confirm `regroup-functions` is the canonical Cloud Functions deployment source (embedded `rats-v2/functions` was removed last session)
- Update ACTIVE_PLAN to reflect single-repo backend

**Launch blockers** (all ≤1 day each)

1. `subscriptionIsActive()` — add `'trialing'` to active states; audit all paywall guards across codebase
2. `OxfordDashboard.tsx:136` — replace `Linking.openURL('https://regroup-app.com/my-account')` with `navigation.navigate(Routes.SubscriptionHandler)`
3. `SubscriptionUpdateModal.tsx:98` — same `goToAccount` issue
4. Officer name display — fix `userId` vs `guestId` lookup in `OfficerManagement.tsx`
5. `BusinessMeetings.tsx` date field — swap raw `TextInput` for `RatsDatepicker` (~1 hour)

**Security P0s** 6. Add authorization checks to `listPayments` (house membership check) and `savePaymentMethod` (guest/house role check) 7. Add Firestore security rules for payments + Oxford subcollections (`officers`, `meetings`, `votes`, `ees`)

---

### Weeks 1–3 — Parallel Tracks

#### Track A: Traditional Payments

| Task                                                                            | Sprint Ref | Notes                                          |
| ------------------------------------------------------------------------------- | ---------- | ---------------------------------------------- |
| Fix `createRentPaymentIntent` naming + consolidate `payment.ts` + `payments.ts` | 5.1–5.2    | Verify function name matches deployed function |
| Create `listHousePayments(houseId)` Cloud Function                              | 6.1        | Single query replacing N+1 calls               |
| Rebuild PaymentDashboard with React Query, single endpoint                      | 6.2        | `staleTime` configured                         |
| "Overdue Residents" card — names, amounts, tap-to-message                       | 6.3        | Top of dashboard                               |
| Manual payment recording (Cash/Check/Venmo/Zelle) via FAB                       | 6.4        | Modal with amount, method, guest, notes        |
| Date filter pills (This Week / This Month / All Time)                           | 6.5        | Pill-style                                     |
| Revenue summary stats (Total / Outstanding / Collection Rate)                   | 6.6        | Top section                                    |
| Weekly revenue bar chart (8 weeks)                                              | 6.7        | Minimal charting                               |

#### Track B: Oxford Completion

| Task                                                                                 | Sprint Ref | Notes                                     |
| ------------------------------------------------------------------------------------ | ---------- | ----------------------------------------- |
| Verify Oxford mode fits cleanly in `OperatorSetupWizard` UX; add minimal step if not | —          | Gate before full Oxford work              |
| `OfficerManagement` — full CRUD, term dates, role badges                             | 8.1        | "Term expires in X days" warning          |
| `BusinessMeetings` — create, attendance toggle, minutes, quorum indicator            | 8.2        | Requires `RatsDatepicker` fix from Week 0 |
| `EESTracker` — per-resident amounts, record payment, transaction history             | 8.3        | —                                         |
| EES auto-recalculation Firestore trigger on guest add/remove                         | 8.4        | —                                         |
| `OxfordVoting` — create election, cast vote, threshold bar, results                  | 8.5        | —                                         |
| Anonymous voting toggle                                                              | 8.6        | `isAnonymous` flag on Election entity     |
| Officer term rotation reminders (push notification 30 days before expiry)            | 8.7        | —                                         |
| Meeting quorum + vote threshold display                                              | 8.8        | —                                         |

---

### Weeks 4–5 — Deepen Both Tracks

#### Track A

| Task                                                                          | Sprint Ref |
| ----------------------------------------------------------------------------- | ---------- |
| "Save card for future payments" checkbox on payment screen                    | 7.1        |
| Auto-pay enrollment toggle on RentPaymentScreen                               | 7.2        |
| `scheduledRentCollection` Cloud Function                                      | 7.3        |
| Payment confirmation email via SendGrid on `payment_intent.succeeded` webhook | 7.4        |
| Payment success celebration animation                                         | 7.5        |
| Balance badge on tab bar ("$X due")                                           | 7.6        |
| CSV export on PaymentDashboard                                                | 7.7        |
| Manager push notification when rent 3+ days overdue                           | 7.8        |

#### Track B

| Task                                                                        | Sprint Ref |
| --------------------------------------------------------------------------- | ---------- |
| Charter compliance scorecard on OxfordDashboard                             | 9.7        |
| Oxford pilot: onboard 1 real house through full governance cycle            | —          |
| Configure Stripe webhook secret + publishable key via `react-native-config` | 5.6–5.7    |

---

### Weeks 6–7 — Convergence

Both tracks merge:

| Task                                                                             | Sprint Ref |
| -------------------------------------------------------------------------------- | ---------- |
| CI for `regroup-functions` (GitHub Actions: build → test → deploy on main merge) | 9.3        |
| Data migration dry-run → execute (`migrate-full.ts`)                             | 9.1        |
| Sentry production error verification                                             | 9.4        |
| End-to-end payment test on physical iOS device with Stripe test card             | 5.8        |
| End-to-end Oxford governance cycle on physical iOS device                        | —          |
| Fix 2FA to use Firebase MFA enrollment (not `signInWithPhoneNumber`)             | 9.2        |
| PDF compliance export tested on physical device                                  | 9.5        |
| ToS + Privacy pages published at `regroup.app/terms` and `/privacy`              | 9.6        |
| Document dual-repo deployment process                                            | 9.8        |

---

### Week 8 — App Store Submission

| Task                                                       |
| ---------------------------------------------------------- |
| TestFlight internal build submitted and tested             |
| TestFlight external review (target: no critical bugs)      |
| App Store metadata: description, screenshots, review notes |
| Production build submitted to Apple                        |

---

## Key Technical Decisions

### 1. Auto-Pay: Stripe Setup Intents (Option A)

Use `SetupIntent` to vault resident's card at time of "Save card" opt-in. Store resulting `PaymentMethod` ID on the `Guest` Firestore doc. `scheduledRentCollection` Cloud Function retrieves the stored method and creates a `PaymentIntent` on due date.

Rationale: No Stripe Customer record needed per resident (or leverages existing `stripeCustomerId` field if present). No schema migration required. Canonical Stripe pattern for future-use charges.

### 2. Oxford Onboarding: Existing Wizard (Option A, conditional)

Use `OperatorSetupWizard` with a house model selector (Oxford vs Traditional). The `house.houseModel` field already exists. A separate Oxford wizard is deferred to post-launch.

**Condition:** Verify in week 1 that the current wizard UX cleanly accommodates Oxford mode. If not, add one minimal Oxford-specific step (elect initial officers, set EES amount) rather than building a separate wizard.

### 3. `regroup-functions` CI

GitHub Actions workflow: install → build → test → on merge to main, deploy via service account key stored as `FIREBASE_SERVICE_ACCOUNT` GitHub secret.

Workload Identity Federation is the secure long-term approach but deferred post-launch.

### 4. App Store Path

Week 7: TestFlight internal → TestFlight external
Week 8: App Store submission
1-week buffer for Apple review response built into schedule.

---

## Testing & Milestone Verification

### Milestone 1: First Real Payment

**Test gates (must pass before milestone is claimed):**

- `listHousePayments` Cloud Function has integration test against Firestore emulator
- `listPayments` and `savePaymentMethod` authorization unit tests passing
- PaymentDashboard renders correctly with React Query

**End-to-end verification checklist:**

- [ ] Resident pays on physical iOS device with Stripe test card
- [ ] Stripe Connect Express account status: ACTIVE (not PENDING)
- [ ] `handleStripeConnectWebhook` routes `account.updated` → syncs house doc
- [ ] PaymentDashboard shows charge with correct amount and status
- [ ] Stripe Dashboard shows 2% platform fee applied
- [ ] Payment confirmation email arrives in inbox via SendGrid

### Milestone 2: Oxford Pilot Live

**Test gates:**

- All 4 Oxford screens have component tests covering happy path
- `subscriptionIsActive` unit tests cover `'trialing'` state
- Officer `userId`/`guestId` fix has regression test

**End-to-end verification checklist:**

- [ ] Officers assigned with term dates — names display correctly (not "Unknown")
- [ ] Business meeting created; attendance taken; quorum indicator correct
- [ ] EES calculated and displayed per resident
- [ ] Vote created and completed with threshold bar
- [ ] Subscription upgrade completes in-app (not via Safari)
- [ ] Trialing operator passes all paywalls

### Milestone 3: App Store Submission

**Test gates:**

- 354+ tests passing in CI across both repos
- Firestore rules tested with Firebase emulator (no unauthorized reads possible)
- Full E2E test run on physical device (payment + Oxford governance)

**Submission checklist:**

- [ ] Production build compiles clean — no blocking Xcode warnings
- [ ] Sentry captures test error in production build
- [ ] `regroup.app/terms` and `regroup.app/privacy` live
- [ ] All Stripe keys are production keys (no hardcoded test keys in binary)
- [ ] CI for `regroup-functions` green on main
- [ ] TestFlight external: no critical bugs reported

---

## Kill List (unchanged from ACTIVE_PLAN)

| Feature                                   | Decision          |
| ----------------------------------------- | ----------------- |
| Web app modernization (Angular → Next.js) | Kill              |
| Alumni network                            | Defer Year 2+     |
| QuickBooks integration                    | Defer Year 2+     |
| HIPAA compliance                          | Defer             |
| Document management                       | Defer             |
| Separate Oxford onboarding wizard         | Defer post-launch |
| Workload Identity Federation for CI       | Defer post-launch |

---

## Success Metrics

### 4-Week Check (end of Track A/B initial phases)

- [ ] PaymentDashboard loads in <2s for 20 residents
- [ ] All 6 launch blockers fixed and tested
- [ ] At least 1 Oxford House completing governance in-app

### 8-Week (end of April)

- [ ] App Store submission complete
- [ ] Payments live end-to-end on physical device with real Stripe test flow
- [ ] Oxford pilot with 1+ real houses
- [ ] CI green for both repos
- [ ] Firestore rules covering all collections
- [ ] 354+ tests passing
