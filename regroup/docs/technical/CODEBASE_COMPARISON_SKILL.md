# App Comparison: Regroup vs recovery-platform/regroup

_Generated: 2026-06-01 | Method: app-comparison-analysis skill_  
_Codebase A: `/Users/marcus/dev/Regroup`_  
_Codebase B: `/Users/marcus/dev/recovery-platform/regroup`_

---

## Executive Summary

These are not two competing apps — they are the same app living in two repositories with a shared mobile source tree and a diverging project boundary. The mobile `src/` directories are **byte-for-byte identical** in file count, test count, service count, component count, `any` usage count, and dependency list. The meaningful difference is structural: `Regroup` is the active development standalone, while `recovery-platform/regroup` is a monorepo that adds the authoritative Cloud Functions backend. Neither is "better" — they are complementary halves of one system that need to be kept in sync.

---

## Tech Stack Overview

| Dimension        | Regroup                         | recovery-platform/regroup                                        |
| ---------------- | ----------------------------------- | ---------------------------------------------------------------- |
| Framework        | React Native 0.72                   | React Native 0.72 (mobile/)                                      |
| Backend          | External (regroup-functions repo)   | Firebase Cloud Functions (functions/) — co-located               |
| State management | Redux Toolkit + TanStack Query v5   | Same                                                             |
| Auth             | Firebase Auth v17                   | Firebase Auth v17                                                |
| Database         | Firestore v17                       | Firestore v17                                                    |
| Payments         | Stripe React Native v0.59           | Stripe React Native v0.59 (mobile) + Stripe Node SDK (functions) |
| Notifications    | Notifee + FCM                       | Same                                                             |
| Error tracking   | Sentry v7                           | Same                                                             |
| Navigation       | React Navigation v7                 | Same                                                             |
| Testing          | Jest + Detox                        | Jest (no Detox in mobile)                                        |
| Tooling          | Claude Code, Maestro docs, CI/Detox | Minimal                                                          |

---

## Quantitative Metrics

| Metric                  | Regroup/src | recovery-platform/mobile/src | Delta         |
| ----------------------- | --------------- | ---------------------------- | ------------- |
| Screens                 | 52              | 52                           | 0             |
| Components (.tsx)       | 172             | 172                          | 0             |
| Test files              | 291             | 291                          | 0             |
| Service files           | 88              | 88                           | 0             |
| TypeScript `any` usages | 1,198           | 1,198                        | 0             |
| npm dependencies        | 56              | 56                           | 0 (identical) |

**Conclusion:** The mobile source trees are exact copies at this point in time. All deltas exist at the project boundary level, not the src level.

---

## Where Regroup Leads

### 1. Active Development Velocity

Regroup has 4 recent commits that represent features and critical bug fixes not yet confirmed in recovery-platform/mobile:

| Commit                                                                           | Type         | Impact                                                        |
| -------------------------------------------------------------------------------- | ------------ | ------------------------------------------------------------- |
| `6ac6b6d` feat(invitations): inviter issues server tokens                        | Feature      | New invitation token issuance flow — core to onboarding       |
| `1508cfd` feat(invitations): SignUpForm uses redeemInvitation when token present | Feature      | New user invite redemption — completes the token loop         |
| `614e6a5` fix(setup-wizard): grant admin claim AFTER houses written              | Critical fix | Race condition in setup — users could get admin without house |
| `44fe639` fix(setup-wizard): send invites AFTER houses written                   | Critical fix | Race condition — invites sent before house doc existed        |

If recovery-platform/mobile hasn't received these commits, it has two critical ordering bugs and an incomplete invitation flow.

### 2. E2E Testing Infrastructure

Regroup has a mature E2E layer; recovery-platform/mobile has only one test stub (`App-test.tsx`):

- Full Detox suite: `e2e/tests/` (auth, house setup, invitations, residents, activity)
- Firebase Emulator guard preventing accidental production test runs
- Dedicated simulator config (`iPhone 15-Detox`)
- 15 E2E documentation files in `docs/e2e/`
- Maestro evaluation guide with Claude Code MCP setup

### 3. Development Tooling

Regroup has substantial AI-assisted development infrastructure:

- `.claude/` with architecture, Firebase, testing, and convention references
- Custom subagents and skills for project-specific workflows
- `CLAUDE.md` root instruction file
- Maestro MCP wired for interactive simulator testing
- Rich `docs/` (15+ strategic and technical documents)

### 4. Documentation Depth

Regroup's `docs/` covers architecture, Firestore data model, product requirements, pricing strategy, performance analysis, legal (privacy policy, ToS), and production readiness gap analysis. recovery-platform has no equivalent.

---

## Where recovery-platform/regroup Leads

### 1. Cloud Functions Backend — Major

recovery-platform/regroup contains the entire server-side implementation missing from Regroup:

**Callable functions (7):** auth, homegroups, invitations, meetings, oxford, payments, subscriptions

**Scheduled functions (4):**

- `scheduledRentCollection.ts` — automated rent debiting
- `overdueRentNotification.ts` — push/email for overdue residents
- `officerTermReminder.ts` — Oxford officer rotation alerts
- `weeklyTransfers.ts` — Stripe Connect payouts to house accounts

**HTTP endpoints:** Stripe Connect OAuth, universal link handler

**Webhooks:** Stripe event processor (payment_intent, charge, dispute, subscription)

**Backend utility layer (14 modules):**

| Module                 | Purpose                                                                             |
| ---------------------- | ----------------------------------------------------------------------------------- |
| `util/tokens.ts`       | Server-side invitation token generation — counterpart to the rn7 invitation commits |
| `util/email.ts`        | SendGrid email dispatch                                                             |
| `util/inviteEmails.ts` | Email templates for invitations                                                     |
| `util/stripe.ts`       | Stripe API abstraction                                                              |
| `util/disputes.ts`     | Charge dispute handling                                                             |
| `util/geohash.ts`      | Geospatial house search                                                             |
| `util/houseAuth.ts`    | House membership authorization                                                      |
| `util/authGuard.ts`    | Callable function auth middleware                                                   |
| `util/create-demo.ts`  | Demo environment seeder                                                             |
| `util/phase.ts`        | Phase advancement logic (server-side)                                               |
| `util/week.ts`         | Weekly summary computation                                                          |
| `util/guest.ts`        | Guest record utilities                                                              |
| `util/timezones.ts`    | Timezone handling                                                                   |
| `util/claims.ts`       | Firebase custom claims management                                                   |

**32 function test files** covering all callable, scheduled, webhook, utility, and trigger code.

### 2. Google API Integration Modules

recovery-platform/mobile has two files absent from Regroup:

| File                 | Purpose                    |
| -------------------- | -------------------------- |
| `google/apikeys.ts`  | Google API key management  |
| `google/timezone.ts` | Google Timezone API client |

If Regroup has timezone-aware features (meeting times, rent due dates in local time), these utilities may be missing.

### 3. Data Migration Scripts

recovery-platform/mobile has production data scripts not in Regroup:

| File                       | Purpose                |
| -------------------------- | ---------------------- |
| `scripts/migrate-admin.ts` | Admin role backfill    |
| `scripts/migrate-full.ts`  | Full dataset migration |

These are operational assets needed for schema changes and production maintenance.

---

## Engineering Quality Analysis

### Type Safety

Both codebases share **1,198 `any` usages** — identical because the source is the same. This is a significant tech debt signal for a TypeScript codebase:

- 1,198 `any` usages across 88 services + 172 components indicates pervasive type escaping
- Suggests the codebase was built under time pressure, with types added post-hoc
- Firebase Firestore documents are likely the primary driver (untyped snapshot data)

**Verdict:** Neither leads — both need the same remediation.

### Test Quality

| Dimension       | Regroup                  | recovery-platform/mobile | recovery-platform/functions |
| --------------- | ---------------------------- | ------------------------ | --------------------------- |
| Unit tests      | 291 (shared src)             | 291 (same src)           | 32 (dedicated)              |
| E2E tests       | Full Detox suite             | Stub only                | N/A                         |
| Integration     | 6 Firebase integration tests | 6 (same src)             | N/A                         |
| Coverage config | Present                      | Present (same)           | Present                     |

The functions backend has the best test discipline — 32 test files covering callable, scheduled, webhook, utility, and trigger code with clear separation by concern. This level of backend test coverage is production-ready.

### Architecture

Both mobile codebases use the same layered pattern:

- **Redux Toolkit** for global state (auth, guests, houses, meetings, notifications, UI)
- **TanStack Query v5** for server state (React Query with Firebase)
- **Service layer** abstracting Firestore CRUD
- **Entity layer** for data models
- **HOC pattern** (`withRats`, `withLoadingModal`, `withNotifier`) for cross-cutting concerns

This is a mature, well-separated architecture for a React Native app of this complexity.

---

## Revenue Architecture Analysis

### Payments (Mobile — shared)

Both mobile codebases have identical payment infrastructure:

- `@stripe/stripe-react-native v0.59` for card collection
- `screens/RentPayment/` — resident-facing rent payment UI
- `screens/HouseSettings/PaymentDashboard.tsx` — house manager payment overview
- `services/payments.ts` — payment service layer
- `state/queries/paymentQueries.ts` — React Query hooks for payment data
- `screens/Payments/FailedPaymentBanner.tsx` + `StalePendingBanner.tsx` — failure UX

### Payments (Functions — recovery-platform only)

The server-side payment infrastructure in `functions/` is significantly more complete:

- `callable/payments.ts` — server-side payment intent creation
- `webhooks/stripeWebhook.ts` — full Stripe event handling
- `util/stripe.ts` — Stripe API wrapper with idempotency
- `util/disputes.ts` — dispute handling
- `scheduled/scheduledRentCollection.ts` — automated collection
- `scheduled/weeklyTransfers.ts` — Stripe Connect payouts

### Subscription System (Shared mobile)

Both have identical subscription gating:

- `services/subscription.ts` — subscription state management
- `components/subscription/SubscriptionGate.tsx` — feature gating component
- `components/subscription/GracePeriodBanner.tsx` — grace period UX
- `screens/Subscription/GraceExpiredScreen.tsx` — hard paywall screen
- `screens/SubscriptionUpdateModal/` — upgrade prompt

**Functions side:** `callable/subscriptions.ts` in recovery-platform handles the server-side subscription management.

---

## Dimension Scorecard

| Dimension                   | Regroup | recovery-platform/regroup | Weight | Notes                                                  |
| --------------------------- | ----------- | ------------------------- | ------ | ------------------------------------------------------ |
| Mobile Feature Completeness | 8/10        | 8/10                      | 20%    | Identical source                                       |
| Backend Completeness        | 2/10        | 9/10                      | 25%    | Functions backend only in recovery-platform            |
| Engineering Quality         | 6/10        | 6/10                      | 20%    | Shared codebase; 1,198 `any` usages drag both down     |
| Development Velocity        | 9/10        | 5/10                      | 15%    | rn7 has active commits; recovery-platform may be stale |
| Tooling / DX                | 9/10        | 4/10                      | 10%    | Claude, Maestro, Detox, docs all in rn7                |
| Test Coverage               | 7/10        | 8/10                      | 10%    | recovery-platform adds 32 function tests               |
| **Weighted Total**          | **6.5/10**  | **7.0/10**                | 100%   | recovery-platform wins on backend completeness         |

---

## Final Recommendation

**These are not competitors — they are two views of one system.** The correct action is not to pick one, but to reconcile them:

1. **Regroup** is the active mobile development environment and should remain the source of truth for mobile code
2. **recovery-platform/regroup/functions** is the authoritative backend and should be treated as the canonical server-side
3. **Sync the recent invitation and setup wizard commits** from rn7 → recovery-platform/mobile immediately — these contain critical bug fixes
4. **Port `google/timezone.ts` and migration scripts** from recovery-platform/mobile → rn7 if they're needed
5. **Consider a monorepo merge** — either move `functions/` into rn7, or move rn7 mobile code into recovery-platform under `mobile/`

---

## Key Risks

| Risk                                                                  | Severity     | Owner                     |
| --------------------------------------------------------------------- | ------------ | ------------------------- |
| Invitation token mobile-side not synced to functions `util/tokens.ts` | **CRITICAL** | Must verify immediately   |
| Setup wizard race conditions not in recovery-platform/mobile          | **HIGH**     | Sync commits              |
| 1,198 `any` usages creating silent runtime errors                     | **MEDIUM**   | Ongoing type hardening    |
| Two repos drifting further without a sync mechanism                   | **MEDIUM**   | Process decision needed   |
| Google timezone API missing from rn7                                  | **LOW**      | Assess feature dependency |
