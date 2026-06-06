# Codebase Comparison: regroup-rn7 vs recovery-platform/regroup

**Generated:** 2026-06-01  
**Method:** Full file-tree diff of source files across both repositories  
**Direction:** Features/files present in `regroup-rn7` not present in `recovery-platform/regroup`, and vice versa

---

## Summary

The two mobile source trees (`regroup-rn7/src/` vs `recovery-platform/regroup/mobile/src/`) are **near-identical mirrors** at the file level — every screen, component, service, hook, entity, and state slice exists in both. The meaningful differences are:

1. **regroup-rn7 is ahead on recent feature commits** (invitation token flow, setup wizard fixes) that may not be synced to `recovery-platform/regroup/mobile`
2. **`recovery-platform/regroup` contains the Cloud Functions backend** (`functions/`) — an entire codebase absent from `regroup-rn7`
3. **`recovery-platform/regroup/mobile` has utility files** not present in `regroup-rn7`
4. **`regroup-rn7` has substantially more tooling, testing infrastructure, and documentation** not present in the recovery-platform version

---

## Section 1: In regroup-rn7 — Not in recovery-platform/regroup

### 1.1 Recent Commits (May Not Be Synced)

The following commits exist in `regroup-rn7/main` and represent features/fixes whose counterpart files in `recovery-platform/regroup/mobile` may be stale:

| Commit    | Description                                                               | Affected Files                                                |
| --------- | ------------------------------------------------------------------------- | ------------------------------------------------------------- |
| `6ac6b6d` | feat(invitations): inviter side issues server tokens via createInvitation | `services/invitations.ts`, `screens/Profile/GuestInvites.tsx` |
| `1508cfd` | feat(invitations): SignUpForm uses redeemInvitation when token present    | `screens/SignUp/SignUpForm.tsx`                               |
| `614e6a5` | fix(setup-wizard): grant admin claim AFTER houses are written             | `services/setup-wizard.ts` or wizard screens                  |
| `44fe639` | fix(setup-wizard): send invites AFTER houses are written                  | same setup wizard area                                        |
| `52c80d6` | chore: update workflow and deps; add feature plans                        | `package.json`, docs                                          |

**Action required:** Verify whether `recovery-platform/regroup/mobile` has received these commits. If not, the invitation token redemption flow and setup wizard ordering fixes are missing from that codebase.

### 1.2 E2E Testing Infrastructure

`regroup-rn7` has a developed E2E testing layer that `recovery-platform/regroup/mobile` lacks:

| Path                        | Description                                                                            |
| --------------------------- | -------------------------------------------------------------------------------------- |
| `e2e/`                      | Full Detox E2E test suite (auth, house setup, invitations, residents, activity)        |
| `e2e/setup/globalSetup.js`  | Firebase Emulator connectivity guard                                                   |
| `e2e/.detoxrc.js`           | Detox configuration targeting `iPhone 15-Detox`                                        |
| `docs/e2e/`                 | 15+ E2E documentation files including testing guides, status reports, blocker analysis |
| `docs/e2e/MAESTRO_GUIDE.md` | Maestro E2E evaluation guide (new, 2026-06-01)                                         |

### 1.3 Claude Code / AI Development Tooling

`regroup-rn7` has a mature `.claude/` configuration absent from recovery-platform:

| Path                          | Description                                       |
| ----------------------------- | ------------------------------------------------- |
| `.claude/architecture.md`     | Architecture reference for AI sessions            |
| `.claude/firebase.md`         | Firebase/Firestore patterns reference             |
| `.claude/testing.md`          | Testing guide (Maestro + Detox)                   |
| `.claude/conventions.md`      | Commit, component, and import conventions         |
| `.claude/agents/`             | Custom subagents for the project                  |
| `.claude/skills/`             | Project-specific Claude Code skills               |
| `.claude/settings.local.json` | Local hook configuration                          |
| `CLAUDE.md`                   | Root project instruction file for Claude sessions |

### 1.4 Unit Tests

`regroup-rn7` has extensive unit tests co-located with source; `recovery-platform/regroup/mobile` has only `App-test.tsx`:

| Test File                                                              | Coverage Area                                                |
| ---------------------------------------------------------------------- | ------------------------------------------------------------ |
| `src/__tests__/screens/HouseSettings/paymentDashboardCSV.test.tsx`     | CSV export of payment data                                   |
| `src/__tests__/screens/HouseSettings/paymentDashboardOverdue.test.tsx` | Overdue payment filtering                                    |
| `src/__tests__/screens/HouseSettings/paymentDashboardStats.test.tsx`   | Payment stats calculations                                   |
| `src/__tests__/screens/Oxford/OxfordOnboardingWizard.test.tsx`         | Oxford House onboarding flow                                 |
| `src/__tests__/screens/RentPayment/autoPay.test.tsx`                   | Auto-pay scheduling logic                                    |
| `src/components/*/__tests__/`                                          | Component-level unit tests (30+ files)                       |
| `src/integration/`                                                     | Firebase integration tests (6 test files requiring emulator) |

### 1.5 Documentation (docs/)

`regroup-rn7` has a rich `docs/` directory; recovery-platform/regroup has no equivalent:

| Category     | Files                                                                                                    |
| ------------ | -------------------------------------------------------------------------------------------------------- |
| Architecture | `ARCHITECTURE.md`, `FIRESTORE_DATA_MODEL.md`                                                             |
| Product      | `CORE_REQUIREMENTS.md`, `FULL_PLATFORM_REQUIREMENTS.md`, `FEATURE_PRIORITY_ROADMAP.md`                   |
| Business     | `PRICING_STRATEGY_OPTIONS.md`, `PRODUCT_STRATEGY_ASSESSMENT.md`, `STRATEGIC_PLATFORM_ASSESSMENT_2026.md` |
| E2E testing  | 15 files in `docs/e2e/`                                                                                  |
| Legal        | `PRIVACY_POLICY.md`, `TERMS_OF_SERVICE.md`                                                               |
| Operations   | `GAP_ANALYSIS_PRODUCTION_READINESS.md`, `PERFORMANCE_SCALABILITY_ANALYSIS.md`                            |

### 1.6 Native Project Files

`regroup-rn7` is a fully configured standalone React Native app; `recovery-platform/regroup/mobile` has a barebones native layer:

| Asset              | regroup-rn7                            | recovery-platform/mobile |
| ------------------ | -------------------------------------- | ------------------------ |
| `ios/`             | Full Xcode project, CocoaPods, Podfile | Minimal                  |
| `android/`         | Full Gradle setup                      | Minimal                  |
| Native modules     | Fully integrated                       | May differ               |
| App icons / splash | Production assets                      | May differ               |

---

## Section 2: In recovery-platform/regroup — Not in regroup-rn7

### 2.1 Cloud Functions Backend (`functions/`) — MAJOR

`recovery-platform/regroup` contains the entire Firebase Cloud Functions backend. This is absent from `regroup-rn7`:

**Callable functions:**
| File | Purpose |
|------|---------|
| `callable/auth.ts` | Auth operations (custom claims, account management) |
| `callable/homegroups.ts` | Home group management |
| `callable/invitations.ts` | Server-side invitation creation and redemption |
| `callable/meetings.ts` | Meeting management |
| `callable/oxford.ts` | Oxford House program operations |
| `callable/payments.ts` | Payment processing (Stripe integration) |
| `callable/subscriptions.ts` | Operator subscription management |

**Scheduled functions:**
| File | Purpose |
|------|---------|
| `scheduled/scheduledRentCollection.ts` | Automated rent collection |
| `scheduled/overdueRentNotification.ts` | Overdue payment alerts |
| `scheduled/officerTermReminder.ts` | Oxford officer term reminders |
| `scheduled/weeklyTransfers.ts` | Weekly Stripe payouts |

**HTTP endpoints:**
| File | Purpose |
|------|---------|
| `http/stripeConnect.ts` | Stripe Connect OAuth flow |
| `http/universal.ts` | Universal link handler |
| `webhooks/stripeWebhook.ts` | Stripe webhook processor |

**Utilities (backend-only):**
| File | Purpose |
|------|---------|
| `util/tokens.ts` | Invitation token generation/validation |
| `util/email.ts` | SendGrid email dispatch |
| `util/inviteEmails.ts` | Invitation email templates |
| `util/stripe.ts` | Stripe API wrapper |
| `util/disputes.ts` | Payment dispute handling |
| `util/geohash.ts` | Geohash utilities for house search |
| `util/houseAuth.ts` | House-level authorization guards |
| `util/authGuard.ts` | General auth guard middleware |
| `util/create-demo.ts` | Demo house/data seeding |

**Function tests** (32 test files covering all callable, scheduled, webhook, and utility layers)

**Note:** `functions/src/util/tokens.ts` is the server-side counterpart to the recent invitation token commits in `regroup-rn7`. This is likely where `createInvitation` generates the token that the mobile `SignUpForm` redeems. The sync between mobile changes and this functions code is critical.

### 2.2 Mobile Utility Files

`recovery-platform/regroup/mobile` has files not present in `regroup-rn7`:

| File                       | Purpose                                                     |
| -------------------------- | ----------------------------------------------------------- |
| `google/apikeys.ts`        | Google API key configuration                                |
| `google/timezone.ts`       | Google Timezone API client                                  |
| `scripts/migrate-admin.ts` | Admin role migration script                                 |
| `scripts/migrate-full.ts`  | Full data migration script                                  |
| `working-autocomplete.ts`  | Google Places autocomplete (appears to be WIP or reference) |

---

## Section 3: Structural Differences

### 3.1 Repository Structure

| Aspect             | regroup-rn7                       | recovery-platform/regroup             |
| ------------------ | --------------------------------- | ------------------------------------- |
| Type               | Standalone RN app                 | Monorepo (mobile + functions)         |
| Mobile path        | `src/`                            | `mobile/src/`                         |
| Backend            | External (regroup-functions repo) | Co-located in `functions/`            |
| Package management | npm                               | npm (separate for mobile + functions) |

### 3.2 Source File Alignment

After stripping path prefixes (`src/` vs `mobile/src/`), the two mobile codebases share **100% of their file names**. Every screen, component, service, hook, entity, context, state slice, and utility exists in both.

The content of those files may diverge wherever recent commits in `regroup-rn7` haven't been reflected in `recovery-platform/regroup/mobile`. The highest-risk divergence is the invitation token flow (4 recent commits).

---

## Section 4: Risk Assessment

| Risk                        | Severity   | Description                                                                                                                                                 |
| --------------------------- | ---------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Invitation flow out of sync | **HIGH**   | 4 recent commits in rn7 touch invitation/signup logic. If recovery-platform/mobile hasn't received these, the signup-with-token flow is broken there.       |
| Setup wizard ordering bugs  | **HIGH**   | 2 recent fixes (admin claim + invites sent after house writes) are critical ordering bugs. If not synced, recovery-platform/mobile has the broken ordering. |
| Cloud Functions token logic | **HIGH**   | `functions/util/tokens.ts` must match whatever `invitations.ts` in rn7 expects. These need to be reviewed together.                                         |
| Google Timezone API missing | **MEDIUM** | rn7 lacks `google/timezone.ts`. If timezone-aware features depend on this, rn7 may have a gap.                                                              |
| Migration scripts missing   | **LOW**    | `scripts/migrate-admin.ts` and `migrate-full.ts` exist only in recovery-platform. May be needed for production data operations.                             |
| Test coverage gap           | **LOW**    | recovery-platform/mobile has near-zero unit test coverage. rn7 has 30+ test files that aren't present there.                                                |

---

## Section 5: Recommended Actions

1. **Immediate:** Diff `screens/SignUp/SignUpForm.tsx` and `services/invitations.ts` between the two repos to confirm invitation token sync status
2. **Immediate:** Ensure `recovery-platform/functions/callable/invitations.ts` and `util/tokens.ts` are aligned with the mobile-side invitation changes in rn7
3. **Short-term:** Establish a sync mechanism between the two codebases — either merge recovery-platform/mobile into rn7 as a monorepo, or set up a git subtree/submodule relationship
4. **Short-term:** Port missing Google timezone utility (`google/timezone.ts`) to rn7 if timezone-aware features are needed
5. **Ongoing:** The Cloud Functions backend (`functions/`) in recovery-platform is the authoritative backend. Consider adding it as a git submodule or workspace in rn7 for co-development

---

_This document was generated by direct file-tree diff. File content differences within matched files were not exhaustively analyzed — see Section 4 for highest-risk content divergences to investigate._
