# Regroup E2E Test Plan (Maestro)

**Generated:** 2026-06-23 · **Workflow:** mobile-e2e Workflow 1 (flow analysis)
**Harness:** `maestro/` (config.yaml, flows/, subflows/, scripts/) — Phase 1 already committed
**Scope:** Full mobile app — 6 feature clusters, ~50 screens analyzed
**Companion:** [`testid-backlog.md`](./testid-backlog.md) — prioritized testID additions required before authoring

> This plan describes WHAT to test and WHICH testIDs each flow needs. Flows marked
> **BLOCKED** require testIDs from the backlog before they can be authored.

---

## Architecture (existing harness — reuse, don't recreate)

| Element           | Value                                                                                                                                 |
| ----------------- | ------------------------------------------------------------------------------------------------------------------------------------- |
| Flows dir         | `maestro/flows/` (NOT `.maestro/`)                                                                                                    |
| Reusable subflows | `maestro/subflows/login.yaml`, `logout.yaml`                                                                                          |
| Seed              | `npm run maestro:seed` → `maestro/scripts/reset-and-seed.sh` → starts Firebase emulators + `e2e/setup/seedTestData.js`                |
| Run (iOS)         | `npm run maestro:ios` (`maestro test -e APP_ID=com.rats.dev maestro/flows/`)                                                          |
| Run (Android)     | `npm run maestro:android` — **blocked**: `IS_E2E_TEST` launch-arg is iOS-only (NSUserDefaults); needs a SharedPreferences path        |
| Persistence check | `maestro/scripts/assert-firestore.js` (black-box Firestore verification)                                                              |
| Emulator switch   | `IS_E2E_TEST=1` launch arg → `Settings.get()` → `connectToEmulators()` (Auth 9099 / Firestore 8080 / Storage 9199), `__DEV__`-guarded |
| App IDs           | iOS `com.rats.dev`, Android `com.regroup.app` (`${APP_ID}` param)                                                                     |
| Toolchain         | Maestro CLI ≥2.6.0, JDK 17+ (JDK 21 present), Firebase CLI                                                                            |

### Test personas (`seedTestData.js`)

| Account                         | Role                 | Use for                                                                            |
| ------------------------------- | -------------------- | ---------------------------------------------------------------------------------- |
| `test-manager@rats-e2e.com`     | operator/admin       | operator flows (house, guests, settings, payments dashboard, applications, Oxford) |
| `test-multi-house@rats-e2e.com` | multi-house operator | house switching, multi-property tier gating                                        |
| `test-guest-a@rats-e2e.com`     | resident             | guest flows (activities, chores, meetings, rent payment, disputes)                 |
| `test-guest-b@rats-e2e.com`     | resident             | second-party flows (dispute challenge, direct chat)                                |

Password (all): `TestPassword123!`

### Session model

Flows run **sequentially**, sharing one authenticated session. `login.yaml` runs once per persona suite; subsequent flows reuse the session. Each persona suite ends with `logout.yaml`.

---

## Flow Index

Status legend: ✅ exists · ⚠️ authorable now (testIDs present) · 🚧 BLOCKED (needs backlog testIDs)

| #   | Flow                                             | Suite            | Priority | Status         | Persona       |
| --- | ------------------------------------------------ | ---------------- | -------- | -------------- | ------------- |
| 00  | App launch & emulator-switch sanity              | bootstrap        | P0       | ✅ smoke.yaml  | —             |
| 01  | Login (each persona)                             | auth             | P0       | ✅ login.yaml  | all           |
| 02  | Signup → new account                             | auth             | P0       | ⚠️             | new           |
| 03  | Operator org setup wizard                        | auth/setup       | P0       | 🚧             | manager       |
| 04  | Guest house search → apply                       | guest-onboarding | P0       | 🚧             | guest         |
| 05  | Operator: house summary → manage guests          | operator         | P0       | ⚠️             | manager       |
| 06  | Operator: add guest (intake)                     | operator         | P0       | 🚧             | manager       |
| 07  | Operator: bed assignment                         | operator         | P1       | 🚧             | manager       |
| 08  | Operator: house settings → phases/chores         | operator         | P1       | 🚧             | manager       |
| 09  | Operator: applications review → approve → intake | operator         | P0       | ⚠️             | manager       |
| 10  | Operator: admin report (occupancy/compliance)    | operator         | P1       | ⚠️             | manager       |
| 11  | Guest: home dashboard stat cards                 | guest            | P0       | ⚠️             | guest         |
| 12  | Guest: log chore (+photo)                        | guest            | P0       | ⚠️             | guest         |
| 13  | Guest: meeting search → check-in                 | guest            | P1       | ⚠️             | guest         |
| 14  | Guest: create meeting                            | guest            | P1       | 🚧             | guest         |
| 15  | Guest: work hours / sponsor / medication         | guest            | P1       | ⚠️             | guest         |
| 16  | Activity feed: search/filter → dispute           | activities       | P0       | ⚠️             | guest         |
| 17  | Disputes: challenge + admin resolve              | activities       | P0       | ⚠️             | guest+manager |
| 18  | Drug testing: log test → history                 | activities       | P0       | ⚠️             | manager       |
| 19  | Issues: create → resolve                         | activities       | P1       | ⚠️             | guest+manager |
| 20  | Complaints: file → reply                         | activities       | P1       | 🚧             | guest+manager |
| 21  | Rent payment (up to Stripe boundary)             | payments         | P0       | ⚠️             | guest         |
| 22  | Payment history (read-only)                      | payments         | P0       | ⚠️             | guest         |
| 23  | Payment dashboard + manual payment               | payments         | P0       | ⚠️             | manager       |
| 24  | Balance dashboard                                | payments         | P1       | ⚠️             | manager       |
| 25  | Subscription gate (lapsed → required screen)     | billing          | P0       | 🚧             | manager       |
| 26  | Oxford onboarding wizard                         | oxford           | P0       | ⚠️             | manager       |
| 27  | Oxford: officers assign/remove                   | oxford           | P1       | ⚠️             | manager       |
| 28  | Oxford: EES generate → mark paid                 | oxford           | P1       | 🚧             | manager       |
| 29  | Oxford: business meeting create                  | oxford           | P1       | ⚠️             | manager       |
| 30  | Oxford: voting create → cast                     | oxford           | P1       | ⚠️             | manager+guest |
| 31  | Oxford: charter compliance (read)                | oxford           | P0       | ⚠️             | manager       |
| 32  | Treasury: record create → submit → approve       | oxford           | P1       | ⚠️             | manager       |
| 33  | House chat: send/receive                         | comms            | P1       | 🚧             | guest+manager |
| 34  | Direct chat: send/receive/read                   | comms            | P1       | 🚧             | guest+guest   |
| 35  | Contacts: search → call/chat                     | comms            | P1       | 🚧             | guest         |
| 36  | Notifications: view → mark read                  | comms            | P1       | ⚠️             | guest         |
| 99  | Logout                                           | teardown         | P0       | ✅ logout.yaml | all           |

**Authorable now (⚠️, testIDs present):** 02, 05, 09, 10, 11, 12, 13, 15, 16, 17, 18, 19, 21, 22, 23, 24, 26, 27, 29, 30, 31, 32, 36.
**Blocked on testIDs (🚧):** 03, 04, 06, 07, 08, 14, 20, 25, 28, 33, 34, 35.

---

## Flow descriptions (key flows)

### 00 — App launch & emulator-switch sanity (P0, ✅)

**Goal:** App boots in E2E mode and Firebase points at emulators (not prod).
**Steps:** launch with `IS_E2E_TEST=1` → assert `initial-landing-screen` → run `assert-firestore.js` to confirm a seeded doc is readable (proves emulator wiring).
**Pass:** landing renders < 60s AND seeded data visible via emulator. **Gap:** none. Validates runbook troubleshooting #1 (prod-data leak).

### 05 — Operator: house summary → manage guests (P0, ⚠️)

**testIDs:** `main-app-screen`, `house-tab`, `manage-guests-button`, `guest-list-screen`, `guest-list-item`, `compliance-dot-${id}`.
**Steps:** login(manager) → assert `main-app-screen` → tap `manage-guests-button` → assert `guest-list-screen` → assert ≥1 `guest-list-item` → tap first → assert guest detail (`guest-overview-screen`).
**Pass:** seeded guests render with compliance dots; tapping navigates. **Gap:** `guest-name-${id}` for per-guest assertion.

### 09 — Applications review → approve → intake (P0, ⚠️)

**testIDs:** `app-row-${id}`, `btn-approve`, `btn-reject`, plus intake form (mostly MISSING — see backlog).
**Steps:** login(manager) → navigate Applications → tap `app-row-${id}` → `btn-approve` → confirm → lands on intake form.
**Pass:** approval transitions status and routes to intake. **Gap:** IntakeFormScreen has zero testIDs → flow stops at approval until `input-*`/`btn-submit-intake` added.

### 12 — Guest: log chore + photo (P0, ⚠️)

**testIDs:** `guest-overview-screen`, `chores-card`, `chore-summary-screen`, `complete-chore-button`.
**Steps:** login(guest-a) → tap `chores-card` → `chore-summary-screen` → `complete-chore-button` → (skip photo) → assert success → `assert-firestore.js` confirms an `activities` doc (type CHORE) written.
**Pass:** activity persisted. **Gap:** `chore-complete-alert` for the confirmation; photo path needs simulator media.

### 16/17 — Activity feed dispute + resolve (P0, ⚠️)

**testIDs (BaseActivityScreen):** `activity-screen`, `activities-list`, `activity-item-${id}`, `dispute-modal`, `dispute-message-input`, `dispute-submit-button`, `disputes-screen`, `dispute-item-${id}`, `challenge-modal`, `submit-challenge-button`, `activity-verification-badge-${id}`.
**Steps:** guest-a long-press `activity-item-${id}` → `dispute-modal` → type `dispute-message-input` → `dispute-submit-button`; then login(manager) → `disputes-screen` → resolve → `assert-firestore.js` confirms status change.
**Pass:** dispute created then resolved; Firestore reflects both. **Gap:** `disputes-empty-state`, search/filter testIDs.

### 21 — Rent payment up to Stripe boundary (P0, ⚠️ — Stripe-bounded)

**testIDs:** `rent-payment-screen`, `balance-card`, `total-due-label`, `pay-now-button`, `payment-webview`, `payment-webview-untrusted-url`, success/error banners.
**Steps:** login(guest-a) → RentPayment → assert balance breakdown → `pay-now-button` → assert `payment-webview` loads a `checkout.stripe.com` URL (assert host allowlist) → STOP (do not complete card entry).
**Pass:** app produces a valid Stripe Checkout URL and the WebView enforces the origin allowlist. **Stripe boundary:** actual card entry + webhook confirmation NOT E2E-testable against the emulator (Stripe isn't emulated). To test completion, run the functions emulator with Stripe **test** keys and use test cards, OR mock the WebView `postMessage('payment_success')`.

### 23 — Payment dashboard + manual payment (P0, ⚠️)

**testIDs:** `payment-dashboard-screen`, `payment-stats-card`, `overdue-residents-card`, `manual-payment-fab`, `guest-pill-${id}`, `csv-export-button`.
**Steps:** login(manager) → PaymentDashboard → assert stats → `manual-payment-fab` → select `guest-pill-${id}` → enter amount/method → record → `assert-firestore.js` confirms a manual `payment_records` doc.
**Gap:** `filter-pill-${week|month|all}`, modal `modal-amount-input`/`modal-record-button`.

### 26/31 — Oxford onboarding + charter compliance (P0, ⚠️)

**testIDs:** `oxford-wizard-progress`, `oxford-wizard-slide`, `wizard-step-1..5`, `wizard-date-display`; `charter-compliance-screen`, `charter-card-${key}`, `charter-badge-${key}` (key ∈ democratic|financial|zeroTolerance).
**Steps:** login(manager, Oxford house) → complete wizard (officers optional, EES amount) → `button-finish` → `oxford-dashboard-content` → tap `oxford-charter-card` → assert 3 `charter-card-*` + badges.
**Precondition:** seeded house with `houseType=oxford`, `oxfordEnabled=true`. **Gap:** wizard `button-next/back/finish`, officer name inputs.

---

## Coverage matrix (cluster → readiness)

| Cluster                 | Screens | testID coverage                                          | Authorable flows       | Notes                                                   |
| ----------------------- | ------- | -------------------------------------------------------- | ---------------------- | ------------------------------------------------------- |
| Auth & onboarding       | 10      | Login/Signup good; Landing/Setup/Intro weak              | 02                     | 03/04 blocked (landing radios, setup wizard, intro)     |
| Operator / house        | 13      | HouseSummary/GuestList/PaymentDashboard/AdminReport good | 05, 10                 | 06/07/08 blocked (intake, beds, settings sections)      |
| Guest / resident        | 18      | Stat summaries + Apply good; Profile sub-screens weak    | 09, 11, 12, 13, 15     | 14 blocked (NewMeeting form), UserInfo/GuestUpdate weak |
| Activities & compliance | 9       | Strong (BaseActivityScreen, drug-testing, issues)        | 16–19                  | 20 blocked (complaints rows)                            |
| Payments / billing      | 14      | **Excellent** (rich testIDs throughout)                  | 21–24, 32              | 25 blocked (SubscriptionGate); Stripe boundary on 21    |
| Oxford / comms          | 11      | Oxford dashboard/charter/voting good; chat/contacts none | 26, 27, 29, 30, 31, 36 | 28/33/34/35 blocked (EES, chat, contacts)               |

---

## Production-safe subset (read-only)

For a prod smoke run (real backend, dedicated test account), include ONLY read-only flows: 00, 01, 05, 10, 11, 22, 24, 31, 36, 99. **Never** run 06, 12, 16, 17, 18, 21, 23, 28 against prod (they write/charge).

---

## Known blockers (carry-overs from the runbook)

1. **Android** — `IS_E2E_TEST` launch arg is iOS-only; implement SharedPreferences before any Android run.
2. **No simulator/build yet** — must build the `IS_E2E_TEST` debug app and boot a sim once.
3. **Stripe** — not emulated; flows 21/25 can only assert up to the Stripe boundary unless functions emulator runs with Stripe test keys.
4. **Seed fixtures untracked** — verify `seedTestData.js` emits the custom-claim shape the rules expect.
5. **testID gaps** — 12 flows blocked; see [`testid-backlog.md`](./testid-backlog.md).

---

## Authored (2026-06-23 pass)

9 flows generated under `maestro/flows/` (flat, tag-based, matching the existing
`smoke.yaml` convention; all YAML-validated). Each is self-contained: `runFlow`
the `login.yaml` subflow with a persona, act via real testIDs, then `logout.yaml`.

| File | Flow # | Persona | Notes |
| --- | --- | --- | --- |
| `signup.yaml` | 02 | new | landing→login→signup; asserts NewAccount/OrgSetup |
| `operator-manage-guests.yaml` | 05 | manager | asserts seeded `guest-list-item` |
| `operator-disputes.yaml` | 17 | manager | asserts seeded dispute (test-dispute-123) |
| `operator-house-settings.yaml` | 08 | manager | settings screen + managers section |
| `guest-home.yaml` | 11 | guest-a | stat cards render |
| `guest-log-chore.yaml` | 12 | guest-a | completes chore (writes activity) |
| `guest-rent-payment.yaml` | 21 | guest-a | balance breakdown; STOPS at Stripe boundary |
| `guest-payment-history.yaml` | 22 | guest-a | renders (empty — no seeded payments) |
| `guest-activity-dispute.yaml` | 16 | guest-a | feed + gated dispute submit |

**P0 testIDs added this pass:** IntakeFormScreen (14), HouseSearchScreen (4),
SubscriptionRequiredScreen (4), OrgSetup (`house-item-${id}`), OperatorSetupWizard
(wizard nav wrappers). See `testid-backlog.md` status.

**Deferred (still blocked):**
- **Oxford (26–32)** — no Oxford house in `seedTestData.js`; add a `houseType:'oxford'` + `oxfordEnabled` house to seed first.
- **Applications (09)** — no applications seeded; seed one or author against a created app.
- **Intake (06)** — testIDs added, but no testID'd UI entry point (reached only via app-approval). Add an "add guest" entry testID or seed an application.
- **Guest search→apply (04)** — `HouseSearch` geo query likely returns empty for the seeded houses (no coords); role radios live in `InitialLandingForm.tsx` (untargeted — tap by label text).
- **Operator setup wizard (03)** — house-item present, but edit/delete buttons need `ActivityItemWithButtons` to forward testIDs (shared component, out of scope).

**To run:** `npm run maestro:seed` then `npm run maestro:ios` (after building the
`IS_E2E_TEST` debug app + booting a simulator). iOS only until the Android
launch-arg path exists.
