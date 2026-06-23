# Regroup E2E testID Backlog

**Generated:** 2026-06-23 · Companion to [`regroup-e2e-test-plan.md`](./regroup-e2e-test-plan.md)

testIDs to add so the 12 BLOCKED flows become authorable. Kebab-case, screen-prefixed,
suffix by element type (`-screen`, `-button`, `-input`, `-list`, `-item`, `-modal`).
Dynamic list items use `${id}`. Add to the component's wrapping `View`/`TextInput`/
`Pressable` — Maestro can't reliably target untagged elements.

Priority = the lowest flow priority it unblocks.

---

## P0 — unblock critical-path flows

### IntakeFormScreen (`src/screens/ResidentIntake/IntakeFormScreen.tsx`) — unblocks flow 06, 09

Zero testIDs today. Multi-step form.

- `intake-form-screen` (wrapper), `intake-step-indicator`
- Step 1: `intake-first-name-input`, `intake-last-name-input`, `intake-email-input`, `intake-phone-input`, `intake-sobriety-date-input`, `intake-drug-of-choice-input`
- Step 2: `intake-emergency-name-input`, `intake-emergency-phone-input`, `intake-emergency-relation-input`
- Buttons: `intake-continue-button`, `intake-submit-button`

### InitialLanding (`src/screens/Landing/InitialLanding.tsx`) — unblocks flow 04

Has `initial-landing-screen` only.

- `landing-role-guest`, `landing-role-manager` (radio options)
- `landing-next-button`, `landing-signin-button`, `landing-demo-link`

### OrgSetup + OperatorSetupWizard — unblocks flow 03

- OrgSetup: `org-setup-screen`✓, `add-house-button`✓, `complete-setup-button`✓ already exist; add `house-item-${id}`, `edit-house-button-${id}`, `delete-house-button-${id}`
- Wizard: `wizard-back-button`, `wizard-next-button`, `wizard-finish-button`, `wizard-page-${index}`

### HouseSearch (`src/screens/HouseSearch/HouseSearchScreen.tsx`) — unblocks flow 04

Has `house-search-screen`, `location-denied-banner`.

- `house-search-input`, `house-card-${id}`, `house-details-button-${id}`, `house-search-loading`

### SubscriptionGate / SubscriptionRequiredScreen — unblocks flow 25

- `subscription-gate` (wrapper), `subscription-required-screen`
- `btn-manage-subscription`, `btn-refresh-subscription`, `btn-sign-out`

---

## P1 — unblock secondary flows

### NewMeeting (`src/screens/StatUpdates/NewMeeting.tsx`) — unblocks flow 14

No form testIDs.

- `new-meeting-screen`, `meeting-name-input`, `meeting-type-picker`, `meeting-address-input`, `weekday-button-${day}`, `new-meeting-confirm`, `new-meeting-cancel`

### Complaints (`src/screens/Complaints/Complaints.tsx`) — unblocks flow 20

No row testIDs.

- `complaints-screen`, `complaint-row-${id}`, `complaint-reply-button-${id}`, `complaint-reply-input-${id}`, `complaints-empty-state`

### EESTracker (`src/screens/Oxford/EESTracker.tsx`) — unblocks flow 28

Zero testIDs.

- `ees-tracker-screen`, `button-generate-ees-records`, `ees-record-${id}`, `ees-status-${id}`, `ees-empty-state`

### HouseChat / DirectChat (`src/screens/HouseChat`, `src/screens/DirectChat`) — unblocks flow 33, 34

Both delegate to BaseChat with no testIDs.

- `house-chat-screen` / `direct-chat-screen`, `chat-message-list`, `chat-message-input`, `chat-send-button`, `chat-message-${id}`, `chat-empty-state`
- DirectChat header: `direct-chat-recipient-${id}`, `direct-chat-info-button`

### ContactScreen (`src/screens/Contacts/ContactScreen.tsx`) — unblocks flow 35

Zero testIDs (note: search is a no-op `executeSearch` — see below).

- `contacts-screen`, `contacts-search-input`, `contact-item-${id}`, `contact-call-button-${id}`, `contact-chat-button-${id}`, `contacts-empty-state`

---

## Cross-cutting recommendations

- **Screen wrappers everywhere.** Many P1 screens (UserInfo, GuestUpdate, PhaseCustomization, GuestInvites, BalanceDashboard, several Oxford) lack a `*-screen` wrapper. Add one per screen — cheapest assertion + navigation anchor.
- **Per-item names on lists.** `guest-list-item` is static (same id every row). Add `guest-name-${id}` so flows can assert a specific resident. Same for `overdue-resident-row`.
- **Confirmation alerts** use native `Alert.alert` (no testID). For flows that depend on a confirm step (delete guest, complete chore, approve application), prefer asserting the resulting state via `assert-firestore.js` rather than the alert.
- **Functional bug surfaced during analysis:** `ContactScreen` search (`executeSearch`) is a no-op — typing in the contacts search does nothing. File as a product bug separate from E2E.

## Suggested sequencing

1. Add the **P0** testIDs (IntakeForm, Landing, HouseSearch, OrgSetup/Wizard, SubscriptionGate) → unblocks flows 03, 04, 06, 25 and completes 09.
2. Author the **⚠️ already-authorable** flows (23 of them) against the current build — no app changes needed.
3. Add **P1** testIDs as each cluster's flows are authored.

---

## Status (2026-06-23)

- ✅ **IntakeFormScreen** — all 14 added (wrapper, step indicator wrapped, step 1+2 inputs, continue/submit).
- ✅ **HouseSearchScreen** — `house-search-input`, `house-card-${id}`, `house-details-button-${id}`, `house-search-loading` (wrapped in a View — `RatsLoadingIndicator` doesn't forward testID).
- ✅ **SubscriptionRequiredScreen** — `subscription-required-screen`, `btn-manage-subscription`, `btn-refresh-subscription`, `btn-sign-out`.
- ⚠️ **OrgSetup** — `house-item-${id}` wrapper added. Edit/delete buttons still blocked: `ActivityItemWithButtons` (shared, `src/components/card-list/`) doesn't forward `leftButtonTestID`/`rightButtonTestID`. Target by button text meanwhile.
- ⚠️ **OperatorSetupWizard** — `wizard-back/next/finish-button` added as wrappers around `SharedSetupButtons`, which already exposes `setup-buttons-back`/`setup-buttons-next` (usable directly).
- ⬜ **InitialLanding** — not done: the radios/NEXT/SIGN IN/demo live in `InitialLandingForm.tsx`. NEXT=`nav-house-search`, SIGN IN=`sign-in-button` already exist; role radios need `RatsRadioButtonGroup` to forward per-option testIDs (shared component) — tap by label text for now.
- ⬜ **SubscriptionGate** — no wrapper element to tag without changing layout; left as-is.

### Recommended shared-component follow-ups (small, non-breaking, high leverage)
1. `RatsRadioButtonGroup` — add an optional per-option `testID` prop (unblocks landing role selection by id).
2. `ActivityItemWithButtons` (card-list) — add optional `leftButtonTestID`/`rightButtonTestID` (unblocks OrgSetup edit/delete + many list rows).
3. `RatsLoadingIndicator` — accept + forward `testID` (removes the View-wrapper workaround).
