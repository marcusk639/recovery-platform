# Homegroups Wave 5: Maestro E2E Migration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a real, CI-wired Maestro E2E suite for homegroups mobile at `homegroups/mobile/maestro/` — mirroring the structure already proven for regroup at `regroup/mobile/maestro/` — covering the highest-risk flows that currently have zero or navigation-only Detox coverage: group-admin claim-and-pay, invite-code join, registration completion, QR meeting check-in, group creation, conscience-vote create-and-cast, and treasurer-handoff initiation.

**Architecture:** Flows are authored from real `testID`/text selectors read directly from component source (cross-checked against the already-proven navigation paths in the existing Detox specs under `homegroups/mobile/e2e/screens/`, since Detox and Maestro both key off React Native's `testID` prop). **No Maestro CLI or MCP server is available in this environment** — flows have not been run against a live simulator. Every selector that could not be confirmed from source alone is marked `NEEDS LIVE VERIFICATION` inline. Detox is not removed in this wave — per the existing `e2e-maestro/README.md` guidance, Maestro coexists with Detox and flows migrate incrementally as they're proven reliable.

**Tech Stack:** Maestro YAML flows, GitHub Actions (`mobile-dev-inc/action-maestro-cloud@v1`), React Native `testID`.

## Global Constraints

- App ID is `org.recoveryconnect` (confirmed from the existing scaffold at `e2e-maestro/homegroups/login-and-join-group.yaml` and `homegroups/mobile/e2e/e2e/config.json`).
- Directory structure mirrors `regroup/mobile/maestro/` exactly: `config.yaml`, `flows/`, `subflows/`. (`scripts/` is omitted in this wave — no seed/assert-firestore scripts are written yet; add them only if a later flow needs them.)
- Every flow must start with `runFlow: ../subflows/login.yaml` (except `registration-signup.yaml`, which starts from a logged-out state by design) and end with `runFlow: ../subflows/logout.yaml`.
- **First live run is mandatory before trusting these in CI as blocking.** The CI job added in Task 9 runs with `continue-on-error: true`, matching the existing regroup `maestro-smoke` job's own pattern — this is not optional laxness, it's consistent with how the one other Maestro CI job in this repo is already configured, and appropriate given the `NEEDS LIVE VERIFICATION` markers throughout.
- Do not delete or modify anything under `homegroups/mobile/e2e/` (the Detox suite) in this plan.
- The **Intergroup Tier A/B checkout flow is explicitly out of scope for this wave** — see Task 8 below, which documents why rather than building it.

## File Structure

- Create: `homegroups/mobile/maestro/config.yaml`
- Create: `homegroups/mobile/maestro/subflows/login.yaml`
- Create: `homegroups/mobile/maestro/subflows/logout.yaml`
- Create: `homegroups/mobile/maestro/flows/group-admin-claim-and-pay.yaml`
- Create: `homegroups/mobile/maestro/flows/invite-code-join.yaml`
- Create: `homegroups/mobile/maestro/flows/registration-signup.yaml`
- Create: `homegroups/mobile/maestro/flows/qr-meeting-checkin.yaml`
- Create: `homegroups/mobile/maestro/flows/group-creation.yaml`
- Create: `homegroups/mobile/maestro/flows/conscience-vote-create-and-cast.yaml`
- Create: `homegroups/mobile/maestro/flows/treasurer-handoff-completion.yaml`
- Create: `homegroups/mobile/maestro/README.md`
- Modify: `homegroups/mobile/src/components/payments/AdminValuePropModal.tsx` (add testIDs)
- Modify: `homegroups/mobile/src/components/homegroup/EnterInviteCodeModal.tsx` (add testIDs — confirm exact path in Task 1)
- Modify: `homegroups/mobile/src/screens/homegroup/CreateGroupScreen.tsx` (add testIDs)
- Modify: `.github/workflows/ci.yml` (add `homegroups-maestro-smoke` job)

---

### Task 1: Add missing testIDs to under-instrumented components

**Why first:** three of the seven flows in this plan rely on text/placeholder selectors because `AdminValuePropModal`, `EnterInviteCodeModal`, and `CreateGroupScreen` have little to no `testID` coverage on their interactive elements. Text selectors are the most flake-prone part of a Maestro suite (locale changes, copy edits, and duplicate text on screen all break them silently). Adding real testIDs now makes every downstream flow more reliable and is a small, low-risk diff.

**Files:**

- Modify: `homegroups/mobile/src/components/payments/AdminValuePropModal.tsx`
- Modify: `homegroups/mobile/src/components/homegroup/EnterInviteCodeModal.tsx` (grep first to confirm this exact path — the drafting research found it under `src/components/` but the precise subdirectory needs a fresh `find`/`grep` since component reorganization may have happened)
- Modify: `homegroups/mobile/src/screens/homegroup/CreateGroupScreen.tsx`

**Interfaces:** None — this task only adds `testID` props to existing JSX elements; no logic changes, no new exports.

- [ ] **Step 1: Locate the exact current file paths**

```bash
find homegroups/mobile/src -iname "AdminValuePropModal.tsx" -o -iname "EnterInviteCodeModal.tsx" -o -iname "CreateGroupScreen.tsx"
```

- [ ] **Step 2: Add testIDs to `AdminValuePropModal.tsx`**

Read the file, then add `testID` props to: the modal's root container (`testID="admin-value-prop-modal"`), the "Start Free Trial" CTA button (`testID="admin-value-prop-start-trial-button"`), and the close/dismiss button if one exists (`testID="admin-value-prop-close-button"`). Match the existing testID naming convention in sibling components (kebab-case, screen/component-prefixed — e.g. `group-overview-claim-button` from `GroupOverviewScreen.tsx`).

- [ ] **Step 3: Add testIDs to `EnterInviteCodeModal.tsx`**

Read the file, then add `testID` props to: the code `TextInput` (`testID="invite-code-input"`), the submit button (`testID="invite-code-submit-button"`), and the cancel/close button (`testID="invite-code-cancel-button"`).

- [ ] **Step 4: Add testIDs to `CreateGroupScreen.tsx`**

Read the file, then add `testID` props to each step's primary inputs and the "Next"/"Back" navigation buttons: group name (`testID="create-group-name-input"`), group description (`testID="create-group-description-input"`), meeting name (`testID="create-group-meeting-name-input"`), location name (`testID="create-group-location-input"`), and the step-navigation button (`testID="create-group-next-button"` — note its label changes from "Next" to "Create Group" on the final step, so the testID should stay stable across that label change).

- [ ] **Step 5: Typecheck**

Run: `cd homegroups/mobile && npx tsc --noEmit`
Expected: No errors — `testID` is a standard RN prop on every element type touched here, so this should be a no-risk addition.

- [ ] **Step 6: Run the existing Detox specs that touch these screens to confirm no regressions**

Run: `cd homegroups/mobile && npx jest` (the relevant Jest component tests, not Detox — Detox itself requires a built simulator binary and is not run in this task)
Expected: PASS — testID additions are additive and should not affect any existing Jest assertions.

- [ ] **Step 7: Commit**

```bash
git add homegroups/mobile/src/components/payments/AdminValuePropModal.tsx homegroups/mobile/src/components/homegroup/EnterInviteCodeModal.tsx homegroups/mobile/src/screens/homegroup/CreateGroupScreen.tsx
git commit -m "test(homegroups-mobile): add testIDs to AdminValuePropModal, EnterInviteCodeModal, CreateGroupScreen for e2e reliability"
```

---

### Task 2: Scaffold the Maestro workspace — config.yaml, subflows, README

**Files:**

- Create: `homegroups/mobile/maestro/config.yaml`
- Create: `homegroups/mobile/maestro/subflows/login.yaml`
- Create: `homegroups/mobile/maestro/subflows/logout.yaml`
- Create: `homegroups/mobile/maestro/README.md`

**Interfaces:** None — these are the foundation every flow task below depends on via `runFlow`.

- [ ] **Step 1: Write `config.yaml`**

```yaml
# Maestro workspace configuration for the Homegroups mobile E2E suite.
# Mirrors regroup/mobile/maestro/config.yaml. Docs: https://docs.maestro.dev/advanced/configuring-maestro-workspace
#
# NOTE: this is a second Maestro location alongside the existing scaffold at
# e2e-maestro/homegroups/ (same appId: org.recoveryconnect) — mirrors how
# regroup/mobile/maestro/ coexists with e2e-maestro/regroup/. Consolidate once one
# location is chosen as canonical (tracked in the plan's Task 10).
flows:
  - flows/*

platform:
  ios:
    disableAnimations: true
  android:
    disableAnimations: true

executionOrder:
  continueOnFailure: false

testOutputDir: maestro/output
```

- [ ] **Step 2: Write `subflows/login.yaml`**

```yaml
# Reusable login subflow. Walks LandingScreen -> LoginScreen -> authenticated
# GroupsListScreen. Selector path ported from e2e/helpers.js `login()` (Detox) and
# cross-checked against e2e/screens/auth/auth.spec.js `goToLogin()`.
#
# Parameterize the persona via env:
#   - runFlow:
#       file: ../subflows/login.yaml
#       env:
#         EMAIL: test-admin@homegroups-e2e.com
#         PASSWORD: TestPassword123!
#
# NOTE: unlike regroup/mobile, homegroups has NO "IS_E2E_TEST" launch argument anywhere in
# src/ — there is no emulator-routing launch flag. EMAIL/PASSWORD must be real credentials
# for a Firebase Auth user in whichever project/emulator this build points at (see
# e2e/.env.e2e.example / e2e/env.js for the existing Detox convention).
appId: org.recoveryconnect
---
- launchApp:
    clearState: true
- extendedWaitUntil:
    visible:
      id: "landing-screen"
    timeout: 30000
- tapOn:
    id: "landing-signin-button"
- extendedWaitUntil:
    visible:
      id: "login-screen"
    timeout: 15000
- tapOn:
    id: "login-email-input"
- inputText: ${EMAIL}
- hideKeyboard
- tapOn:
    id: "login-password-input"
- inputText: ${PASSWORD}
- tapOn:
    id: "login-signin-button"
- extendedWaitUntil:
    visible:
      id: "group-list-screen"
    timeout: 60000
```

- [ ] **Step 3: Write `subflows/logout.yaml`**

```yaml
# Reusable logout subflow. Assumes an authenticated session (group-list-screen visible).
#
# IMPORTANT — this does NOT end on landing-screen/login-screen like regroup's logout does.
# MainTabNavigator.tsx swaps the Profile tab's component to LimitedProfileScreen (title
# "Your Profile", CTA "Create Account") once isAuthenticated flips false; the app stays
# mounted on the Main tab navigator rather than routing back through AppNavigator's auth
# gate. Confirmed by reading MainTabNavigator.tsx (isLimitedMode / LimitedProfileScreen).
appId: org.recoveryconnect
---
- tapOn:
    text: "Profile"
- assertVisible:
    id: "profile-screen"
- tapOn:
    id: "profile-sign-out-button"
# Native Alert.alert('Sign Out', 'Are you sure...', [Cancel, {text:'Sign Out', destructive}])
# — ProfileScreen.tsx confirmSignOut(). NEEDS LIVE VERIFICATION: confirm Maestro can target
# the native alert's destructive button by text on both iOS and Android.
- tapOn:
    text: "Sign Out"
    optional: true
- extendedWaitUntil:
    visible:
      text: "Your Profile"
    timeout: 15000
- assertVisible:
    text: "Create Account"
```

- [ ] **Step 4: Write `maestro/README.md`**

````markdown
# Homegroups Maestro E2E Suite

Maestro flows for the Homegroups mobile app (`appId: org.recoveryconnect`).

## Run a single flow

```bash
maestro test homegroups/mobile/maestro/flows/invite-code-join.yaml
```
````

## Run the whole suite

```bash
maestro test homegroups/mobile/maestro/flows/
```

## Test accounts

Flows use env-injected credentials (`${EMAIL}` / `${PASSWORD}`) via the shared
`subflows/login.yaml`. See `homegroups/mobile/e2e/.env.e2e.example` for the existing
Detox test-account convention — the same Firebase Auth users work here.

| Persona                                    | Used by                                                                                              |
| ------------------------------------------ | ---------------------------------------------------------------------------------------------------- |
| `test-admin@homegroups-e2e.com`            | invite-code-join, qr-meeting-checkin, group-creation, conscience-vote-create-and-cast                |
| `test-unclaimed-member@homegroups-e2e.com` | group-admin-claim-and-pay (must be a MEMBER of an UNCLAIMED group — not yet seeded, see plan Task 3) |
| `test-treasurer@homegroups-e2e.com`        | treasurer-handoff-completion (must hold the Treasurer role — not yet seeded, see plan Task 8)        |

## Status

These flows have **not yet been run against a live simulator** — no Maestro CLI or MCP
server was available when they were authored. Selectors were derived from React Native
`testID` props read directly from source and cross-checked against the proven navigation
paths in the existing Detox suite (`homegroups/mobile/e2e/screens/`). Steps marked
`NEEDS LIVE VERIFICATION` in each flow file should be confirmed on a real device/simulator
before removing `continue-on-error: true` from the CI job.

## Relationship to Detox

Detox (`homegroups/mobile/e2e/`) is not being removed. Per `e2e-maestro/README.md`,
both frameworks coexist; migrate a Detox spec's coverage to Maestro only once the
equivalent Maestro flow is proven reliable in CI.

````

- [ ] **Step 5: Commit**

```bash
git add homegroups/mobile/maestro/config.yaml homegroups/mobile/maestro/subflows/login.yaml homegroups/mobile/maestro/subflows/logout.yaml homegroups/mobile/maestro/README.md
git commit -m "test(homegroups-mobile): scaffold Maestro workspace with shared login/logout subflows"
````

---

### Task 3: group-admin-claim-and-pay flow

**Files:**

- Create: `homegroups/mobile/maestro/flows/group-admin-claim-and-pay.yaml`

**Interfaces:**

- Consumes: `subflows/login.yaml` (Task 2), `subflows/logout.yaml` (Task 2), `AdminValuePropModal` testIDs (Task 1)

- [ ] **Step 1: Write the flow**

```yaml
appId: org.recoveryconnect
---
# Flow: Non-admin member claims an unclaimed group and starts the paid admin subscription,
# stopping at the in-app Stripe WebView boundary (do NOT complete payment here).
# Run: maestro test homegroups/mobile/maestro/flows/group-admin-claim-and-pay.yaml
#
# Requires a persona that is a MEMBER (not admin) of an UNCLAIMED group — i.e.
# GroupOverviewScreen.shouldShowClaimGroupButton() (isGroupUnclaimed() &&
# !isCurrentUserAdmin()) must be true. NEEDS LIVE VERIFICATION: seed this pairing — the
# shared Detox TEST_EMAIL account is already a group admin, so a separate persona is
# required (see maestro/README.md's test-account table).
- runFlow:
    file: ../subflows/login.yaml
    env:
      EMAIL: test-unclaimed-member@homegroups-e2e.com
      PASSWORD: TestPassword123!
- tapOn: "Home"
- extendedWaitUntil:
    visible:
      id: "group-list-screen"
    timeout: 15000
- tapOn:
    id: "group-list"
    index: 0
- extendedWaitUntil:
    visible:
      id: "group-info-section"
    timeout: 15000
- assertVisible:
    id: "group-overview-claim-button"
- tapOn:
    id: "group-overview-claim-button"
- assertVisible:
    id: "group-claim-modal"
- tapOn:
    id: "group-claim-message-input"
- inputText: "I am the group secretary and help run our weekly meeting."
- hideKeyboard
- tapOn:
    id: "group-claim-submit-button"
# Closes the request modal, opens AdminValuePropModal (now instrumented per Task 1).
- assertVisible:
    id: "admin-value-prop-modal"
- assertVisible: "$12"
- tapOn:
    id: "admin-value-prop-start-trial-button"
# Opens SubscriptionWebView — an in-app WebView loading a real Stripe Checkout session at
# recovery-connect-cad4b.web.app/subscribe. It has no testIDs (external content); the
# "Secure" badge text is the one static, always-visible string.
- assertVisible: "Secure"
# STRIPE BOUNDARY: do not interact further inside the WebView — a real Stripe test-key
# checkout is out of Maestro's reliable-selector territory (third-party page).
- runFlow:
    file: ../subflows/logout.yaml
```

- [ ] **Step 2: Confirm the file is valid YAML**

Run: `cd /Users/marcusklein/dev/recovery-platform && python3 -c "import yaml; list(yaml.safe_load_all(open('homegroups/mobile/maestro/flows/group-admin-claim-and-pay.yaml')))" && echo VALID`
Expected: `VALID`

- [ ] **Step 3: Commit**

```bash
git add homegroups/mobile/maestro/flows/group-admin-claim-and-pay.yaml
git commit -m "test(homegroups-mobile): add Maestro flow for group-admin claim-and-pay"
```

---

### Task 4: invite-code-join flow

**Files:**

- Create: `homegroups/mobile/maestro/flows/invite-code-join.yaml`

**Interfaces:**

- Consumes: `subflows/login.yaml`, `subflows/logout.yaml`, `EnterInviteCodeModal` testIDs (Task 1)

- [ ] **Step 1: Write the flow**

```yaml
appId: org.recoveryconnect
---
# Flow: User joins a group via a 6-character invite code.
# Entry point testID proven in e2e/screens/homegroup/groups.spec.js:
# "group-list-invite-code-button" -> EnterInviteCodeModal.
# Run: maestro test homegroups/mobile/maestro/flows/invite-code-join.yaml
- runFlow:
    file: ../subflows/login.yaml
    env:
      EMAIL: test-admin@homegroups-e2e.com
      PASSWORD: TestPassword123!
- tapOn: "Home"
- extendedWaitUntil:
    visible:
      id: "group-list-screen"
    timeout: 15000
- assertVisible:
    id: "group-list-invite-code-button"
- tapOn:
    id: "group-list-invite-code-button"
- assertVisible: "Enter Invite Code"
- tapOn:
    id: "invite-code-input"
# NEEDS LIVE VERIFICATION: a real, unused 6-char invite code must exist server-side for
# the success branch to be exercised. Seed one before trusting this flow in CI.
- inputText: "ABC123"
- hideKeyboard
- tapOn:
    id: "invite-code-submit-button"
# Success path: native Alert('Success!', "You've joined {groupName}!", [{text:'View Group'}])
# Failure path: native Alert('Unable to Join', message)
- tapOn:
    text: "View Group"
    optional: true
- tapOn:
    text: "OK"
    optional: true
- runFlow:
    file: ../subflows/logout.yaml
```

- [ ] **Step 2: Confirm the file is valid YAML**

Run: `cd /Users/marcusklein/dev/recovery-platform && python3 -c "import yaml; list(yaml.safe_load_all(open('homegroups/mobile/maestro/flows/invite-code-join.yaml')))" && echo VALID`
Expected: `VALID`

- [ ] **Step 3: Commit**

```bash
git add homegroups/mobile/maestro/flows/invite-code-join.yaml
git commit -m "test(homegroups-mobile): add Maestro flow for invite-code join"
```

---

### Task 5: registration-signup flow

**Files:**

- Create: `homegroups/mobile/maestro/flows/registration-signup.yaml`

**Interfaces:** None — this flow starts fresh via `launchApp`, it does not use `subflows/login.yaml`.

- [ ] **Step 1: Write the flow**

```yaml
appId: org.recoveryconnect
---
# Flow: New user completes the 3-step RegisterScreen signup wizard, stopping right after
# "Create Account" is tapped.
# Run: maestro test homegroups/mobile/maestro/flows/registration-signup.yaml
#
# Uses LandingScreen's direct "landing-register-button" (skips the login screen entirely —
# a shorter proven path than login-register-link).
- launchApp:
    clearState: true
- extendedWaitUntil:
    visible:
      id: "landing-screen"
    timeout: 30000
- tapOn:
    id: "landing-register-button"
- extendedWaitUntil:
    visible:
      id: "register-screen"
    timeout: 15000
# Step 1 — account credentials
- tapOn:
    id: "register-email-input"
# NEEDS LIVE VERIFICATION: Firebase will reject a duplicate email on repeat runs — this
# static address collides after the first successful run. Pass a unique EMAIL via
# `maestro test --env EMAIL=e2e-signup-$(date +%s)@homegroups-e2e.com ...` or add a
# Firebase Auth cleanup step before this flow runs in CI.
- inputText: "e2e-signup-000@homegroups-e2e.com"
- hideKeyboard
- tapOn:
    id: "register-password-input"
- inputText: "TestPassword123!"
- hideKeyboard
- tapOn:
    id: "register-confirm-password-input"
- inputText: "TestPassword123!"
- hideKeyboard
- tapOn:
    id: "register-next-button"
# Step 2 — profile
- tapOn:
    id: "register-displayname-input"
- inputText: "E2E Tester"
- hideKeyboard
- tapOn:
    id: "register-continue-button"
# Step 3 — terms. Only the Terms checkbox has a testID; the Privacy Policy checkbox has
# none. Both must be checked for "register-create-account-button" to pass validation.
# Disambiguated via Maestro's `index` on the shared text "I agree to the" (appears on both
# checkboxes). NEEDS LIVE VERIFICATION.
- tapOn:
    id: "register-terms-checkbox"
- tapOn:
    text: "I agree to the"
    index: 1
    optional: true
- tapOn:
    id: "register-create-account-button"
- extendedWaitUntil:
    visible:
      id: "group-list-screen"
    timeout: 30000
```

- [ ] **Step 2: Confirm the file is valid YAML**

Run: `cd /Users/marcusklein/dev/recovery-platform && python3 -c "import yaml; list(yaml.safe_load_all(open('homegroups/mobile/maestro/flows/registration-signup.yaml')))" && echo VALID`
Expected: `VALID`

- [ ] **Step 3: Commit**

```bash
git add homegroups/mobile/maestro/flows/registration-signup.yaml
git commit -m "test(homegroups-mobile): add Maestro flow for registration signup completion"
```

---

### Task 6: qr-meeting-checkin flow

**Files:**

- Create: `homegroups/mobile/maestro/flows/qr-meeting-checkin.yaml`

**Interfaces:**

- Consumes: `subflows/login.yaml`, `subflows/logout.yaml`

- [ ] **Step 1: Write the flow**

```yaml
appId: org.recoveryconnect
---
# Flow: Group admin opens a meeting's QR check-in code from the schedule screen.
# Navigation base (Home -> group-list -> group-info-section) proven in
# e2e/screens/homegroup/secretary-toolkit.spec.js; the schedule -> QR path itself was
# traced through GroupScheduleScreen.tsx and MeetingQRCodeScreen.tsx source (not covered
# by any existing Detox spec).
# Run: maestro test homegroups/mobile/maestro/flows/qr-meeting-checkin.yaml
#
# Requires the account to be a group ADMIN (the QR icon only renders when
# isCurrentUserAdmin is true, GroupScheduleScreen.tsx) and the group to have at least one
# meeting row.
- runFlow:
    file: ../subflows/login.yaml
    env:
      EMAIL: test-admin@homegroups-e2e.com
      PASSWORD: TestPassword123!
- tapOn: "Home"
- extendedWaitUntil:
    visible:
      id: "group-list-screen"
    timeout: 15000
- tapOn:
    id: "group-list"
    index: 0
- extendedWaitUntil:
    visible:
      id: "group-info-section"
    timeout: 15000
- tapOn:
    id: "group-overview-view-schedule-button"
# GroupScheduleScreen has no screen-level testID; wait on the first meeting row instead.
# NEEDS LIVE VERIFICATION: confirm regex `id` matching is supported by the installed
# Maestro CLI version.
- extendedWaitUntil:
    visible:
      id: "meeting-item-.*"
    timeout: 15000
# The QR TouchableOpacity has NO testID — only accessibilityLabel="Show QR code".
# NEEDS LIVE VERIFICATION: Maestro's text matcher generally also matches
# accessibilityLabel/content-description; confirm on-device.
- tapOn:
    text: "Show QR code"
- extendedWaitUntil:
    visible:
      id: "qr-code-screen"
    timeout: 15000
- assertVisible:
    id: "checkin-url"
- assertVisible:
    id: "share-btn"
- assertVisible:
    id: "copy-btn"
- runFlow:
    file: ../subflows/logout.yaml
```

- [ ] **Step 2: Confirm the file is valid YAML**

Run: `cd /Users/marcusklein/dev/recovery-platform && python3 -c "import yaml; list(yaml.safe_load_all(open('homegroups/mobile/maestro/flows/qr-meeting-checkin.yaml')))" && echo VALID`
Expected: `VALID`

- [ ] **Step 3: Commit**

```bash
git add homegroups/mobile/maestro/flows/qr-meeting-checkin.yaml
git commit -m "test(homegroups-mobile): add Maestro flow for QR meeting check-in"
```

---

### Task 7: group-creation flow

**Files:**

- Create: `homegroups/mobile/maestro/flows/group-creation.yaml`

**Interfaces:**

- Consumes: `subflows/login.yaml`, `subflows/logout.yaml`, `CreateGroupScreen` testIDs (Task 1)

- [ ] **Step 1: Write the flow**

```yaml
appId: org.recoveryconnect
---
# Flow: Admin creates a new group via the 4-step CreateGroupScreen wizard, stopping at the
# Stripe CardForm on step 4 (payment boundary — do NOT submit real card details).
# Entry testID proven in e2e/screens/homegroup/groups.spec.js: "group-list-create-button".
# Run: maestro test homegroups/mobile/maestro/flows/group-creation.yaml
- runFlow:
    file: ../subflows/login.yaml
    env:
      EMAIL: test-admin@homegroups-e2e.com
      PASSWORD: TestPassword123!
- tapOn: "Home"
- extendedWaitUntil:
    visible:
      id: "group-list-screen"
    timeout: 15000
- assertVisible:
    id: "group-list-create-button"
- tapOn:
    id: "group-list-create-button"
- extendedWaitUntil:
    visible:
      text: "Group Information"
    timeout: 15000
# Step 1 — group basics (testIDs added in Task 1)
- tapOn:
    id: "create-group-name-input"
- inputText: "E2E Test Homegroup"
- hideKeyboard
- tapOn:
    id: "create-group-description-input"
- inputText: "Created by an automated Maestro flow."
- hideKeyboard
- tapOn:
    id: "create-group-next-button"
# Step 2 — meeting details. Required-ness of fields past name/format was not traced
# end-to-end from source; treat as best-effort. NEEDS LIVE VERIFICATION.
- tapOn:
    id: "create-group-meeting-name-input"
    optional: true
- inputText: "Weekly Meeting"
- hideKeyboard
- tapOn:
    id: "create-group-next-button"
# Step 3 — location
- tapOn:
    id: "create-group-location-input"
    optional: true
- inputText: "Community Center"
- hideKeyboard
- tapOn:
    id: "create-group-next-button"
# Step 4 — payment (Stripe CardForm, in-app native card element)
- assertVisible:
    id: "create-group-card-form"
- assertVisible: "$12"
# STRIPE BOUNDARY: do not fill card details or tap the (now "Create Group"-labeled)
# create-group-next-button — this would submit a real Stripe PaymentMethod.
- runFlow:
    file: ../subflows/logout.yaml
```

- [ ] **Step 2: Confirm the file is valid YAML**

Run: `cd /Users/marcusklein/dev/recovery-platform && python3 -c "import yaml; list(yaml.safe_load_all(open('homegroups/mobile/maestro/flows/group-creation.yaml')))" && echo VALID`
Expected: `VALID`

- [ ] **Step 3: Commit**

```bash
git add homegroups/mobile/maestro/flows/group-creation.yaml
git commit -m "test(homegroups-mobile): add Maestro flow for group creation"
```

---

### Task 8: conscience-vote-create-and-cast and treasurer-handoff-completion flows

**Files:**

- Create: `homegroups/mobile/maestro/flows/conscience-vote-create-and-cast.yaml`
- Create: `homegroups/mobile/maestro/flows/treasurer-handoff-completion.yaml`

**Interfaces:**

- Consumes: `subflows/login.yaml`, `subflows/logout.yaml`

- [ ] **Step 1: Write `conscience-vote-create-and-cast.yaml`**

```yaml
appId: org.recoveryconnect
---
# Flow: Admin creates a new group-conscience vote and casts a vote on it.
# Navigation base proven in e2e/screens/homegroup/group-conscience.spec.js
# ("group-overview-conscience-tile" -> "Group Conscience" -> "new-vote-button").
# Run: maestro test homegroups/mobile/maestro/flows/conscience-vote-create-and-cast.yaml
- runFlow:
    file: ../subflows/login.yaml
    env:
      EMAIL: test-admin@homegroups-e2e.com
      PASSWORD: TestPassword123!
- tapOn: "Home"
- extendedWaitUntil:
    visible:
      id: "group-list-screen"
    timeout: 15000
- tapOn:
    id: "group-list"
    index: 0
- extendedWaitUntil:
    visible:
      id: "group-info-section"
    timeout: 15000
- tapOn:
    id: "group-overview-conscience-tile"
- extendedWaitUntil:
    visible:
      text: "Group Conscience"
    timeout: 15000
- assertVisible:
    id: "new-vote-button"
- tapOn:
    id: "new-vote-button"
- extendedWaitUntil:
    visible:
      id: "create-conscience-vote-screen"
    timeout: 15000
- tapOn:
    id: "vote-title-input"
- inputText: "E2E Test Motion - Change meeting day?"
- hideKeyboard
- tapOn:
    id: "vote-description-input"
- inputText: "Automated Maestro flow - safe to ignore/close."
- hideKeyboard
# Vote options default to ["Yes", "No", "Abstain"] — leaving them unedited is intentional.
- tapOn:
    id: "create-vote-submit-button"
- extendedWaitUntil:
    visible:
      text: "Group Conscience"
    timeout: 15000
# Cast a vote on the "Yes" option. Real testID is `option-${vote.id}-${option}` — vote.id
# is an unknown Firestore doc ID at authoring time. NEEDS LIVE VERIFICATION: if the group
# already has another open vote with a "Yes" option, this text match is ambiguous;
# index:0 assumes newest-first ordering, typical but not confirmed from source alone.
- assertVisible: "E2E Test Motion - Change meeting day?"
- tapOn:
    text: "Yes"
    index: 0
- assertVisible: "Your vote:"
- runFlow:
    file: ../subflows/logout.yaml
```

- [ ] **Step 2: Write `treasurer-handoff-completion.yaml`**

```yaml
appId: org.recoveryconnect
---
# Flow: Treasurer initiates a role handoff to another member, through both native confirm
# alerts. Full "completion" (new treasurer accepting, then the original treasurer
# confirming via HandoffConfirmationScreen — which has NO testIDs at all) is a two-account,
# multi-session flow that cannot be exercised end-to-end from a single Maestro run; this
# flow covers everything a single session can prove.
# Navigation base proven in e2e/screens/homegroup/treasury-handoff.spec.js.
# Run: maestro test homegroups/mobile/maestro/flows/treasurer-handoff-completion.yaml
#
# Requires the logged-in account to hold the Treasurer role in the target group
# (InitiateHandoffScreen gates the initiate button on this; treasury-handoff.spec.js
# itself "skips gracefully" if the test account isn't treasurer — same caveat applies here.
# NEEDS LIVE VERIFICATION: seed the test-treasurer persona, see maestro/README.md).
- runFlow:
    file: ../subflows/login.yaml
    env:
      EMAIL: test-treasurer@homegroups-e2e.com
      PASSWORD: TestPassword123!
- tapOn: "Home"
- extendedWaitUntil:
    visible:
      id: "group-list-screen"
    timeout: 15000
- tapOn:
    id: "group-list"
    index: 0
- extendedWaitUntil:
    visible:
      id: "group-info-section"
    timeout: 15000
- tapOn:
    id: "group-overview-treasury-tile"
- extendedWaitUntil:
    visible:
      id: "treasury-summary-section"
    timeout: 15000
- assertVisible:
    id: "treasury-initiate-handoff-button"
- tapOn:
    id: "treasury-initiate-handoff-button"
- extendedWaitUntil:
    visible:
      text: "Transfer Treasurer Role"
    timeout: 15000
- assertVisible:
    id: "handoff-member-list"
# Member rows have NO testID — selecting by list position. NEEDS LIVE VERIFICATION:
# confirm the group has at least one other member eligible for handoff, and that index 0
# is a real row (not the empty state).
- tapOn:
    id: "handoff-member-list"
    index: 0
# Bottom action button (text "Initiate Handoff") triggers
# Alert.alert('Confirm Handoff', ..., [Cancel, {text:'Initiate Handoff'}]). The two taps
# below hit the screen button then the alert's confirm button, which share the same text.
- tapOn: "Initiate Handoff"
- tapOn:
    text: "Initiate Handoff"
    optional: true
# Success Alert.alert('Handoff Initiated', ...) with a single "OK" button, then
# navigation.goBack() returns to Treasury.
- tapOn:
    text: "OK"
    optional: true
- extendedWaitUntil:
    visible:
      id: "treasury-summary-section"
    timeout: 15000
- runFlow:
    file: ../subflows/logout.yaml
```

- [ ] **Step 3: Confirm both files are valid YAML**

Run: `cd /Users/marcusklein/dev/recovery-platform && for f in homegroups/mobile/maestro/flows/conscience-vote-create-and-cast.yaml homegroups/mobile/maestro/flows/treasurer-handoff-completion.yaml; do python3 -c "import yaml; list(yaml.safe_load_all(open('$f')))" && echo "$f VALID"; done`
Expected: both print `VALID`

- [ ] **Step 4: Commit**

```bash
git add homegroups/mobile/maestro/flows/conscience-vote-create-and-cast.yaml homegroups/mobile/maestro/flows/treasurer-handoff-completion.yaml
git commit -m "test(homegroups-mobile): add Maestro flows for conscience voting and treasurer handoff initiation"
```

---

### Task 9: Document the deferred Intergroup checkout flow (no code — decision record)

**Why deferred:** research for this plan found that Intergroup Tier A/B checkout has **no in-app entry point in the current build**. `homegroups/mobile/src/config/featureFlags.ts` sets `SHOW_V4_ENTERPRISE_INTERGROUP = false`, and `AppNavigator.tsx` only mounts `IntergroupNavigator` (and therefore `IntergroupDashboardScreen`) when that flag is true — the source comment above the guard reads "V4.4: Intergroup stack — hidden (entire enterprise tier; premature)". No screen anywhere in `mobile/src` navigates to `IntergroupDashboard`, and no deep-link route was found either. Building a Maestro flow for a screen with no reachable entry point would produce a permanently-failing or permanently-skipped test — not useful coverage.

**Files:**

- Create: `homegroups/mobile/maestro/flows-deferred/README.md`

- [ ] **Step 1: Create the deferred-flows note**

```bash
mkdir -p homegroups/mobile/maestro/flows-deferred
```

```markdown
# Deferred Maestro Flows

## Intergroup Tier A/B checkout + upgrade

Not built. `IntergroupDashboardScreen` (and the rest of `src/screens/intergroup/`) has no
in-app entry point in the current build: `SHOW_V4_ENTERPRISE_INTERGROUP` is `false` in
`src/config/featureFlags.ts`, and `AppNavigator.tsx` only mounts `IntergroupNavigator` when
that flag is true. No screen navigates there and no deep link was found. `createIntergroup`
(the checkout-creation callable) has zero call sites in `mobile/src` — intergroup creation
appears to be a web-only flow today; mobile only has the upgrade path
(`IntergroupDashboardScreen.handleUpgrade`, which hands off to an external browser via
`Linking.openURL`, not an in-app WebView).

Build this flow once one of the following happens:

1. `SHOW_V4_ENTERPRISE_INTERGROUP` is flipped `true` for a debug/CI build, or
2. A deep-link route to `IntergroupDashboard` is added.

Until then, this is out of scope — not a gap in this migration.
```

- [ ] **Step 2: Commit**

```bash
git add homegroups/mobile/maestro/flows-deferred/README.md
git commit -m "docs(homegroups-mobile): document why Intergroup checkout has no Maestro flow yet"
```

---

### Task 10: Wire homegroups into CI's Maestro Cloud job

**Files:**

- Modify: `.github/workflows/ci.yml`

**Interfaces:**

- Consumes: the existing `maestro-smoke` job (`.github/workflows/ci.yml`, currently regroup-only) as the structural template.

- [ ] **Step 1: Read the current `maestro-smoke` job in full**

Run: `grep -n "maestro-smoke:" -A 40 .github/workflows/ci.yml`

- [ ] **Step 2: Add a homegroups Android smoke job, mirroring the regroup job exactly but pointing at `invite-code-join.yaml`** (chosen because it's the simplest flow with no Stripe/WebView boundary and the least state-dependent — best first candidate to prove the CI wiring works before adding more flows)

Insert immediately after the existing `maestro-smoke` job:

```yaml
homegroups-maestro-smoke:
  name: Maestro Cloud — smoke tests (homegroups Android)
  needs: [recovery-api, homegroups-functions, regroup-functions, detox-recovery]
  runs-on: ubuntu-latest
  # Only run on PRs — see the comment on the regroup maestro-smoke job above for why
  # this check happens at the step level via `if:`, not the job level.
  if: github.event_name == 'pull_request'
  steps:
    - uses: actions/checkout@v4

    - name: Set up Node 22
      uses: actions/setup-node@v4
      with:
        node-version: "22"
        cache: "npm"
        cache-dependency-path: homegroups/mobile/package-lock.json

    - name: Set up Java 17
      uses: actions/setup-java@v4
      with:
        distribution: temurin
        java-version: "17"

    - name: Install homegroups/mobile dependencies
      run: cd homegroups/mobile && npm ci

    - name: Build homegroups Android debug APK
      run: cd homegroups/mobile/android && ./gradlew assembleDebug --no-daemon
      env:
        GRADLE_OPTS: "-Dorg.gradle.daemon=false -Dorg.gradle.jvmargs=-Xmx4g"

    - name: Maestro smoke — homegroups (invite-code-join)
      continue-on-error: true
      uses: mobile-dev-inc/action-maestro-cloud@v1
      with:
        api-key: ${{ secrets.MAESTRO_CLOUD_API_KEY }}
        app-file: homegroups/mobile/android/app/build/outputs/apk/debug/app-debug.apk
        flow-file: homegroups/mobile/maestro/flows/invite-code-join.yaml
```

Note `continue-on-error: true` on the Maestro step — matching the existing regroup job exactly. This is intentional given the `NEEDS LIVE VERIFICATION` markers in the flow: it surfaces status without blocking merges until the flow is proven reliable.

- [ ] **Step 3: Validate the YAML is well-formed**

Run: `cd /Users/marcusklein/dev/recovery-platform && python3 -c "import yaml; yaml.safe_load(open('.github/workflows/ci.yml'))" && echo VALID`
Expected: `VALID`

- [ ] **Step 4: Commit**

```bash
git add .github/workflows/ci.yml
git commit -m "ci(homegroups-mobile): wire invite-code-join Maestro flow into CI as a non-blocking smoke test"
```

---

### Task 11: Final verification sweep

**Files:** None modified — verification only.

- [ ] **Step 1: Confirm every new flow file is valid YAML**

Run:

```bash
cd /Users/marcusklein/dev/recovery-platform
for f in homegroups/mobile/maestro/flows/*.yaml homegroups/mobile/maestro/subflows/*.yaml homegroups/mobile/maestro/config.yaml; do
  python3 -c "import yaml; list(yaml.safe_load_all(open('$f')))" && echo "$f VALID" || echo "$f INVALID"
done
```

Expected: every file prints `VALID`.

- [ ] **Step 2: Typecheck mobile after Task 1's testID additions**

Run: `cd homegroups/mobile && npx tsc --noEmit`
Expected: No errors.

- [ ] **Step 3: Confirm CI workflow YAML is still valid**

Run: `cd /Users/marcusklein/dev/recovery-platform && python3 -c "import yaml; yaml.safe_load(open('.github/workflows/ci.yml'))" && echo VALID`
Expected: `VALID`

- [ ] **Step 4: Open a PR and watch the first live Maestro Cloud run**

This is the first time any of these flows execute against a real build. Read the Maestro Cloud run output for the `invite-code-join` flow specifically — expect failures at the `NEEDS LIVE VERIFICATION` points, and use the run's screenshots/view hierarchy to correct the flow YAML before treating any of the other six flows as trustworthy.

No commit for this task — it's a verification gate.

---

## Follow-up work (not in this wave's scope)

1. **Seed the missing test personas** (`test-unclaimed-member@homegroups-e2e.com`, `test-treasurer@homegroups-e2e.com`) in whichever Firebase project the CI build points at — required before flows 3 (claim-and-pay) and 8's second flow (treasurer-handoff) can pass.
2. **Consolidate the two Maestro locations.** `e2e-maestro/homegroups/login-and-join-group.yaml` (top-level scaffold, still marked "scaffold" status) and `homegroups/mobile/maestro/` (this wave's real suite) now coexist, mirroring the same duplication already present for regroup. Pick one canonical location once this suite is proven and retire the other.
3. **Add `testID`s to `HandoffConfirmationScreen.tsx` and `SubscriptionWebView.tsx`** if/when a way to test them is designed — both currently have zero testIDs and were worked around with text selectors or skipped entirely in this wave.
4. **Once every flow here is proven green in CI**, expand `homegroups-maestro-smoke` to run the full `flows/` directory instead of just `invite-code-join.yaml`, and consider retiring the Detox spec(s) each Maestro flow supersedes (per `e2e-maestro/README.md`'s incremental-migration guidance).
