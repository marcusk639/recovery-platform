# Homegroups Wave 2 (P1 Quick Wins + Callable Auth/Zod Wrapper) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Close a bounded, low-risk subset of P1 High findings from the 2026-07-07 comprehensive review (`.full-review/05-final-report.md`): a real Android correctness bug (SafeAreaView), three misleading/stale documentation sections, two mechanical duplication-removal helpers, and — the higher-leverage, higher-risk piece — a shared Cloud Functions callable auth/validation wrapper, applied to close two currently-open findings (mass-assignment on group/meeting creation, and free-admin-grant on an unpaid Stripe trial). Full architecture-wide rollout of the wrapper across all ~90 callables, full rollout of the two shared helpers across all affected files, god-screen decomposition, and RN/ESLint upgrades are explicitly **out of scope** — they are large, independent efforts for future waves.

**Architecture:** No new services. Seven tasks: doc corrections; a mobile app-root fix (`SafeAreaProvider`) plus a 61-file import swap; a shared mobile model-helper module applied to its highest-duplication target; a shared Redux thunk-helper module applied to its two buggiest slices; a new shared Cloud Functions callable wrapper (auth + Zod validation) with its own tests; and two retrofits of that wrapper onto real, currently-unvalidated callables.

**Tech Stack:** React Native 0.72 + Redux Toolkit + `react-native-safe-area-context` (mobile), Firebase Cloud Functions v2 + Zod (functions — **Zod is a new dependency**, added in Task 5), Jest + ts-jest.

## Global Constraints

- All paths relative to `/Users/marcusklein/dev/recovery-platform/homegroups/` unless stated otherwise.
- **Task 5 adds exactly one new npm dependency: `zod`, to `functions/package.json`.** No other task in this plan adds a dependency.
- Functions: `HttpsError` from `firebase-functions/v2/https` for client-facing errors; `logger` (not console) for server logs; preserve each file's existing test-mocking conventions (module-scope `jest.fn()` referenced from `jest.mock(...)` factories).
- Mobile: preserve each file's existing test conventions; no new UI-library dependencies beyond the already-installed `react-native-safe-area-context`.
- Every task must leave `npx tsc --noEmit` clean and the full existing test suite green (functions: `npm test -- --passWithNoTests --forceExit`; mobile: `npm test`) in addition to its own new/changed tests.
- Do not touch any of the 12 files Wave 1 already modified except where this plan explicitly says so (none do — Wave 2 touches an entirely disjoint file set from Wave 1).
- Zod schemas in Tasks 6-7 use plain `z.object({...})` (Zod's default "strip unknown keys" mode) — this is deliberate: it silently drops any client-supplied field not on the allow-list rather than erroring (too aggressive) or passing it through (defeats the purpose).

---

## File Structure

| File                                                                       | Task | Change                                                                                                           |
| -------------------------------------------------------------------------- | ---- | ---------------------------------------------------------------------------------------------------------------- |
| `homegroups/docs/technical/architecture.md`                                | 1    | Correct model count/list, slice count, intergroup thunk names, dangling D-1 footnote, scheduled-job index caveat |
| `homegroups/mobile/CLAUDE.md`                                              | 1    | Soften the "never call Firestore directly from a slice" absolute rule to acknowledge documented drift            |
| `mobile/App.tsx`                                                           | 2    | Add `SafeAreaProvider` at the app root (prerequisite for the import swap)                                        |
| 61 mobile screen/component files                                           | 2    | Swap `SafeAreaView` import from `react-native` to `react-native-safe-area-context`                               |
| `mobile/src/models/modelHelpers.ts` (new)                                  | 3    | `withModelErrorHandling`, `getRequiredDoc` shared helpers                                                        |
| `mobile/src/models/__tests__/modelHelpers.test.ts` (new)                   | 3    | Tests for the new helpers                                                                                        |
| `mobile/src/models/MemberModel.ts`                                         | 3    | Apply the new helpers to its 7 exists-check + 5 token-refresh duplicated blocks                                  |
| `mobile/src/store/thunkHelpers.ts` (new)                                   | 4    | `createAppThunk`, `extractError` shared helpers                                                                  |
| `mobile/src/store/__tests__/thunkHelpers.test.ts` (new)                    | 4    | Tests for the new helpers                                                                                        |
| `mobile/src/store/slices/sponsorshipSlice.ts`                              | 4    | Migrate from `throw new Error`/`action.error.message` to `createAppThunk`/`action.payload`                       |
| `mobile/src/store/slices/servicePositionsSlice.ts`                         | 4    | Same migration for its 3 non-migrated thunks                                                                     |
| `functions/src/utils/callableWrapper.ts` (new)                             | 5    | `requireAuth`, `validateData` shared helpers                                                                     |
| `functions/src/utils/__tests__/callableWrapper.test.ts` (new)              | 5    | Tests for the new helpers                                                                                        |
| `functions/package.json`                                                   | 5    | Add `zod` dependency                                                                                             |
| `functions/src/callable/createGroupWithSubscription.ts`                    | 6    | Replace raw `...groupData`/`...meeting` spreads with Zod-validated allow-lists                                   |
| `functions/src/__tests__/createGroupWithSubscription.test.ts`              | 6    | New tests for the validation boundary                                                                            |
| `functions/src/callable/requestAdminAccessWithSubscription.ts`             | 7    | Require a payment method before granting admin on a trialing subscription                                        |
| `functions/src/__tests__/requestAdminAccessWithSubscription.test.ts` (new) | 7    | New test file (none existed before)                                                                              |

---

## Task 1: Documentation Corrections

**Files:**

- Modify: `homegroups/docs/technical/architecture.md`
- Modify: `homegroups/mobile/CLAUDE.md`

**Interfaces:** None — prose-only changes. No tests required (documentation has no executable assertions).

**Context:** Research for this plan found the P1 documentation findings were more specific — and in one case, already resolved by Wave 1 — than the original review stated:

- The "never call Firestore directly from a slice" absolute rule is NOT in `architecture.md` (it has no such absolute claim) — it's in `mobile/CLAUDE.md`. Fix the file that actually has the problem.
- `architecture.md`'s "16 models" claim is wrong twice over: the actual file count is 15 (not 16), and the doc's own body only names 13 of them (missing `IntergroupModel` and `MeetingInstanceModel`).
- The "24 registered; 2 dead — see ROADMAP D-1" footnote is now **fully stale**, not just broken: Wave 1 (already merged) registered both previously-dead slices (`intergroupSlice`, `brandingSlice`), so there are no dead slices anymore, and "D-1" was never a valid cross-reference for this claim in any doc (it means an unrelated pricing decision in `docs/go-to-market/`).
- `architecture.md:308-311` documents `intergroupSlice`'s thunks as `fetchIntergroupData`, `submitIntergroupReport`, `fetchAffiliatedGroups` — all three names are wrong; the real exports are `loadIntergroup`, `loadAffiliatedGroups`, `affiliateGroup`, `deaffiliateGroup`.
- `architecture.md` also has an internal inconsistency: line 6 says "26 Redux slice files" but line 140 says "27".
- The two scheduled-job rows (`scheduledMilestoneReminders`, `scheduledPositionReminders`) present both jobs as straightforwardly working, with no mention that Wave 1 (already merged) had to fix missing/misordered Firestore indexes for both.

- [ ] **Step 1: Fix `architecture.md`'s stats line and model documentation**

Read the file first to get current exact line numbers (they may have shifted slightly). At line 6, change:

```
**Codebase stats**: 26 Redux slice files (24 registered; 2 dead — see ROADMAP D-1) · 16 models · 90 callable functions · 16 active Firestore triggers (+ 1 commented out: `onGroupAdminUpdate`) · 14 Pub/Sub schedulers · 106 mobile screens
```

to:

```
**Codebase stats**: 26 Redux slice files (all registered) · 15 models · 90 callable functions · 16 active Firestore triggers (+ 1 commented out: `onGroupAdminUpdate`) · 14 Pub/Sub schedulers · 106 mobile screens
```

At line 140, change "27 Redux Toolkit slices" to "26 Redux Toolkit slices" (matching the corrected count above — verify this is in fact the discrepancy by reading the line first).

At line 336 (section 4 intro), change "16 model classes" to "15 model classes".

In section 4's body (currently lines 334-435), the 13 documented models are: UserModel, GroupModel, MemberModel, ChatModel, DirectMessageModel, MeetingModel, TreasuryModel, BusinessMeetingModel, ServicePositionModel, AnnouncementModel, ReportModel, TreasurerHandoffModel, SponsorModel. Add two new `###` subsections for `IntergroupModel` and `MeetingInstanceModel`, matching the existing subsections' format (a short description of what the model does — read `mobile/src/models/IntergroupModel.ts` and `mobile/src/models/MeetingInstanceModel.ts` yourself to write an accurate one-paragraph description each; note `IntergroupModel.ts` has a code comment marking it a stub with most reads still going through `intergroupSlice` thunks — the doc description should say so honestly, not present it as fully functional).

- [ ] **Step 2: Fix the dangling/stale D-1 footnote**

This was folded into Step 1's line-6 edit above (the parenthetical is simply removed since there's nothing dead to reference anymore). No separate action needed — just confirm the edit from Step 1 removed it.

- [ ] **Step 3: Fix `intergroupSlice`'s documented thunk names**

At the current location of (approximately line 308-311):

```
#### intergroupSlice

- **State**: intergroup organization data
- **Thunks**: `fetchIntergroupData`, `submitIntergroupReport`, `fetchAffiliatedGroups`
```

change to:

```
#### intergroupSlice

- **State**: intergroup organization data
- **Thunks**: `loadIntergroup`, `loadAffiliatedGroups`, `affiliateGroup`, `deaffiliateGroup`
```

- [ ] **Step 4: Add a caveat to the two scheduled-job table rows**

Find the "Pub/Sub Scheduled Jobs" table (around lines 715-732). In the description cell for `scheduledMilestoneReminders` (currently ~line 726) and `scheduledPositionReminders` (currently ~line 730), append a short parenthetical noting the index fix, e.g. change:

```
| `scheduledPositionReminders`      | `0 9 * * *` (9 AM UTC)           | Reminds service position holders of upcoming term end                                                                                                                   |
```

to:

```
| `scheduledPositionReminders`      | `0 9 * * *` (9 AM UTC)           | Reminds service position holders of upcoming term end (required a Firestore collection-group index fix, 2026-07-07)                                                     |
```

and the equivalent for `scheduledMilestoneReminders`'s row, noting its composite-index field-order fix.

- [ ] **Step 5: Soften the absolute Firestore-access rule in `mobile/CLAUDE.md`**

Find the line reading (or equivalent to):

> "Slices call models via `createAsyncThunk` — never call Firestore directly from a slice."

Change it to acknowledge the known, tracked drift rather than presenting an absolute rule the codebase doesn't follow, e.g.:

> "Slices call models via `createAsyncThunk` — never call Firestore directly from a slice. **Known drift:** ~12 slices and ~30 screens currently bypass this and call Firestore directly (tracked in the 2026-07-07 codebase review); treat this as the target pattern for new code, not a universally-enforced invariant yet."

Read the surrounding context in `mobile/CLAUDE.md` first to match its existing tone/formatting exactly (e.g. whether it uses bold, blockquotes, or plain prose elsewhere for similar caveats).

- [ ] **Step 6: Verify and commit**

There's no build/test step for prose docs. Just re-read both files after editing to confirm the changes are internally consistent (e.g. the model list actually has 15 entries now, the stats line matches the body).

```bash
cd /Users/marcusklein/dev/recovery-platform
git add homegroups/docs/technical/architecture.md homegroups/mobile/CLAUDE.md
git commit -m "docs(homegroups): correct model count, intergroup thunk names, stale D-1 footnote, and scheduled-job caveats"
```

---

## Task 2: Fix SafeAreaView (Android Correctness Bug)

**Files:**

- Modify: `homegroups/mobile/App.tsx`
- Modify: 61 files (full list below) — one-line import change each

**Interfaces:** No signature changes. `SafeAreaProvider` (from `react-native-safe-area-context`, already a dependency at version `4.8.2`) wraps the app root. All 61 files' `SafeAreaView` import source changes from `'react-native'` to `'react-native-safe-area-context'`.

**Context — read this before starting, it changes the brief's original assumption:** Research for this plan found `SafeAreaProvider` does **not** exist anywhere in this codebase today. Swapping the 61 screens' imports without first adding `SafeAreaProvider` at the app root would be **worse than doing nothing** — `react-native-safe-area-context`'s `SafeAreaView` requires a `SafeAreaProvider` ancestor to compute insets; without one, it silently falls back to zero insets, which could break layout on all 61 screens rather than just fixing Android. **Step 1 (adding the provider) is a hard prerequisite for Step 2 and must be verified working before touching any screen file.** Also: the original review's claim that "1 file already does this correctly" is wrong — zero files currently import `SafeAreaView` from `react-native-safe-area-context`; there's no existing correct example to copy in this repo, use the pattern given below.

- [ ] **Step 1: Add `SafeAreaProvider` at the app root**

Read `mobile/App.tsx` first to see its current exact structure (research found: `<Provider store={store}>` → `<StripeProvider>` → `<AppContent>`, where `AppContent` renders `<NavigationContainer>` → `<AppNavigator />`). Add the import:

```typescript
import { SafeAreaProvider } from "react-native-safe-area-context";
```

Wrap `AppContent` (or the outermost return, matching whatever the actual current JSX nesting is) with `<SafeAreaProvider>` as the outermost element — outside `<Provider store={store}>`, since safe-area insets are a device/OS concern independent of Redux and should be available to every consumer including anything that might render before the store is ready:

```tsx
<SafeAreaProvider>
  <Provider store={store}>
    <StripeProvider ...>
      <AppContent />
    </StripeProvider>
  </Provider>
</SafeAreaProvider>
```

Adjust to match the file's actual current nesting/prop structure exactly — this is illustrative, not a literal diff, since the exact current JSX wasn't fully captured during planning research. Read the file yourself and place `SafeAreaProvider` as the true outermost wrapper.

- [ ] **Step 2: Verify the provider works before touching any screen**

Run `cd mobile && npx tsc --noEmit` — expect exit 0 (confirms the import/JSX is syntactically and structurally valid).

Run the existing mobile test suite: `npm test` — expect all suites green, confirming `App.tsx`'s change didn't break app-level rendering assumptions in any test that mounts the app root (if any test does — check for an `App.test.tsx` or similar).

- [ ] **Step 3: Swap the import in all 61 files**

Full file list (all under `mobile/src/`, paths relative to `mobile/`):

```
src/components/chat/ChatMediaPickerScreen.tsx
src/components/groups/GroupSwitcherModal.tsx
src/components/groups/search/LocationPickerModal.tsx
src/components/payments/AdminValuePropModal.tsx
src/components/payments/SubscriptionWebView.tsx
src/navigation/MainTabNavigator.tsx
src/screens/admin/AdminPanelScreen.tsx
src/screens/announcements/AnnouncementsScreen.tsx
src/screens/auth/ForgotPasswordScreen.tsx
src/screens/auth/LandingScreen.tsx
src/screens/auth/LoginScreen.tsx
src/screens/auth/RegisterScreen.tsx
src/screens/homegroup/AddGroupResourceScreen.tsx
src/screens/homegroup/AddTransactionScreen.tsx
src/screens/homegroup/AssignChairpersonScreen.tsx
src/screens/homegroup/BusinessMeetingsListScreen.tsx
src/screens/homegroup/CreateGroupScreen.tsx
src/screens/homegroup/GroupAnnouncementDetailsScreen.tsx
src/screens/homegroup/GroupAnnouncementsScreen.tsx
src/screens/homegroup/GroupChatInfoScreen.tsx
src/screens/homegroup/GroupChatScreen.tsx
src/screens/homegroup/GroupDonationScreen.tsx
src/screens/homegroup/GroupEditDetailsScreen.tsx
src/screens/homegroup/GroupListScreen.tsx
src/screens/homegroup/GroupLiteratureBookmarksScreen.tsx
src/screens/homegroup/GroupMembersScreen.tsx
src/screens/homegroup/GroupResourceLibraryScreen.tsx
src/screens/homegroup/GroupSearchScreen.tsx
src/screens/homegroup/GroupServicePositionsScreen.tsx
src/screens/homegroup/GroupTreasuryScreen.tsx
src/screens/homegroup/HandoffConfirmationScreen.tsx
src/screens/homegroup/HandoffHistoryScreen.tsx
src/screens/homegroup/HandoffRequestScreen.tsx
src/screens/homegroup/InitiateHandoffScreen.tsx
src/screens/homegroup/MeetingQRCodeScreen.tsx
src/screens/homegroup/MeetingTopicsScreen.tsx
src/screens/homegroup/MemberDetailScreen.tsx
src/screens/homegroup/PostGroupDailyThoughtScreen.tsx
src/screens/homegroup/SavedTreasuryReportsScreen.tsx
src/screens/homegroup/TreasurerHandoffScreen.tsx
src/screens/homegroup/TreasuryReportScreen.tsx
src/screens/meetings/MeetingDetailScreen.tsx
src/screens/meetings/MeetingFinderScreen.tsx
src/screens/meetings/MeetingScreen.tsx
src/screens/messages/DirectMessageScreen.tsx
src/screens/messages/UnifiedInboxScreen.tsx
src/screens/moderation/ModerationQueueScreen.tsx
src/screens/moderation/ReportDetailScreen.tsx
src/screens/moderation/UserBansScreen.tsx
src/screens/onboarding/AdminValuePropScreen.tsx
src/screens/onboarding/OnboardingScreen.tsx
src/screens/profile/CheckInStreakScreen.tsx
src/screens/profile/ContributeLiteratureScreen.tsx
src/screens/profile/DailyReflectionScreen.tsx
src/screens/profile/LiteratureDetailScreen.tsx
src/screens/profile/LiteratureIndexScreen.tsx
src/screens/profile/ProfileManagementScreen.tsx
src/screens/profile/ProfileScreen.tsx
src/screens/profile/SobrietyCalculatorScreen.tsx
src/screens/profile/SobrietyTrackerScreen.tsx
src/screens/profile/StepTrackerScreen.tsx
```

For each file, `SafeAreaView` appears as one entry in a destructured import from `'react-native'` (sometimes single-line, e.g. `import {SafeAreaView, StyleSheet, Alert} from 'react-native';`, sometimes as one line inside a multi-line block). For each file:

1. Remove `SafeAreaView` from the `react-native` import (and its own line, if multi-line format, including the trailing comma from the line above or its own comma).
2. Add a new import line: `import {SafeAreaView} from 'react-native-safe-area-context';` (place it directly after the `react-native` import for readability).

This is mechanical and repetitive across 61 files — a script-assisted approach (e.g. a small Node/sed script operating on the known pattern) is appropriate here rather than 61 manual edits, AS LONG AS you verify the result compiles correctly afterward. Do not attempt a blind regex across all 61 files without spot-checking a sample of multi-line and single-line cases first, since the exact formatting varies file-to-file — verify your approach against 3-5 files by hand before applying it broadly, then run Step 4 to catch anything a mechanical pass got wrong.

- [ ] **Step 4: Verify all 61 files compile and no `SafeAreaView` import from `react-native` remains**

Run: `cd mobile && grep -rl "SafeAreaView" src --include="*.tsx" | xargs grep -l "from 'react-native';" | xargs grep -B5 "SafeAreaView" | grep "from 'react-native'"` (or a simpler two-pass check: confirm zero files still import `SafeAreaView` from plain `'react-native'`, and all 61 target files now import it from `'react-native-safe-area-context'`). A clean, reliable check:

```bash
cd mobile
# Should print nothing (zero remaining bad imports):
grep -rn "SafeAreaView" src --include="*.tsx" -B3 -A3 | grep -B3 "SafeAreaView" | grep "from 'react-native';" | grep -v "safe-area-context"
```

Then run `npx tsc --noEmit` — expect exit 0 across all 61 changed files.

- [ ] **Step 5: Run the full mobile test suite**

Run: `cd mobile && npm test` — expect all suites green. Since `SafeAreaView`'s import source is mocked identically in test environments regardless of which package it comes from (React Native's Jest preset typically mocks both `react-native` and `react-native-safe-area-context` at the module level), this change should not require any test file updates — but if any test breaks, read the failure before assuming it's unrelated; report anything unexpected rather than silently working around it.

- [ ] **Step 6: Commit**

```bash
cd /Users/marcusklein/dev/recovery-platform
git add homegroups/mobile/App.tsx
git add $(cd homegroups/mobile && grep -rl "safe-area-context" src --include="*.tsx" | sed 's|^|homegroups/mobile/|')
git commit -m "fix(homegroups-mobile): add SafeAreaProvider and use react-native-safe-area-context's SafeAreaView (Android correctness fix, 61 files)"
```

(Adjust the `git add` file-selection command if it doesn't cleanly capture exactly the 61 target files plus `App.tsx` — verify with `git status` before committing that no unintended files are staged.)

---

## Task 3: Shared Model Error-Handling Helper (Applied to `MemberModel.ts`)

**Files:**

- Create: `mobile/src/models/modelHelpers.ts`
- Create: `mobile/src/models/__tests__/modelHelpers.test.ts`
- Modify: `mobile/src/models/MemberModel.ts`

**Interfaces:**

- Produces: `getRequiredDoc(collectionPath: string, docId: string, notFoundMessage: string): Promise<FirebaseFirestoreTypes.DocumentSnapshot>` — fetches a doc and throws `new Error(notFoundMessage)` if it doesn't exist, else returns the snapshot.
- Produces: `withModelErrorHandling<T>(label: string, fn: () => Promise<T>): Promise<T>` — wraps `fn` in try/catch, logs `console.error(label + ':', error)` on failure, and rethrows.
- Produces: `scheduleTokenRefresh(userId: string, currentUserId: string | undefined, context: string): void` — if `currentUserId === userId`, schedules a 2-second-delayed `refreshAuthToken()` call wrapped in its own try/catch that logs `console.warn(context + ':', error)` on failure. Fire-and-forget (void return), matching the existing 5 call sites' behavior exactly.

**Context:** `MemberModel.ts` has 7 near-identical "fetch member doc → check `.exists` → throw 'Member not found in this group'" blocks and 5 near-identical "if the current user is the affected user, schedule a delayed token refresh" blocks, each with a slightly different log message. This task extracts both patterns into a shared helper module and applies it to all 12 sites in this one file — the highest-duplication target found. `GroupModel.ts` and the other 8 model files with similar (but not fully audited) duplication are explicitly **out of scope** for this task; apply the same helpers there in a future wave once this file proves the pattern works cleanly.

- [ ] **Step 1: Write failing tests for the new helpers**

Create `mobile/src/models/__tests__/modelHelpers.test.ts`. Follow this codebase's established convention for model tests (per `mobile/src/models/__tests__/MemberModel.test.ts`): rely on the global `jest.setup.js` Firebase mocks, no local `jest.mock()` calls for `@react-native-firebase/firestore` unless you need to override specific return values for a given test.

```typescript
import firestore from "@react-native-firebase/firestore";
import {
  getRequiredDoc,
  withModelErrorHandling,
  scheduleTokenRefresh,
} from "../modelHelpers";

describe("getRequiredDoc", () => {
  it("returns the snapshot when the document exists", async () => {
    const fakeSnap = {
      exists: true,
      id: "doc-1",
      data: () => ({ foo: "bar" }),
    };
    const doc = jest
      .fn()
      .mockReturnValue({ get: jest.fn().mockResolvedValue(fakeSnap) });
    (firestore as any).mockImplementationOnce?.(() => ({
      collection: () => ({ doc }),
    }));
    // If the global mock doesn't support mockImplementationOnce directly, use whatever
    // override mechanism jest.setup.js already establishes for @react-native-firebase/firestore
    // — read jest.setup.js first to confirm the exact override pattern before finalizing this test.
    const snap = await getRequiredDoc(
      "members",
      "group-1_user-1",
      "Member not found in this group",
    );
    expect(snap).toBe(fakeSnap);
  });

  it("throws with the given message when the document does not exist", async () => {
    const fakeSnap = { exists: false };
    const doc = jest
      .fn()
      .mockReturnValue({ get: jest.fn().mockResolvedValue(fakeSnap) });
    (firestore as any).mockImplementationOnce?.(() => ({
      collection: () => ({ doc }),
    }));
    await expect(
      getRequiredDoc(
        "members",
        "group-1_missing",
        "Member not found in this group",
      ),
    ).rejects.toThrow("Member not found in this group");
  });
});

describe("withModelErrorHandling", () => {
  it("returns the wrapped function result on success", async () => {
    const result = await withModelErrorHandling("Test op", async () => 42);
    expect(result).toBe(42);
  });

  it("logs and rethrows on failure", async () => {
    const consoleSpy = jest
      .spyOn(console, "error")
      .mockImplementation(() => {});
    const err = new Error("boom");
    await expect(
      withModelErrorHandling("Test op", async () => {
        throw err;
      }),
    ).rejects.toThrow("boom");
    expect(consoleSpy).toHaveBeenCalledWith("Test op:", err);
    consoleSpy.mockRestore();
  });
});

describe("scheduleTokenRefresh", () => {
  it("schedules a refresh when currentUserId matches userId", () => {
    jest.useFakeTimers();
    const refreshAuthToken = require("../../services/firebase/auth")
      .refreshAuthToken as jest.Mock;
    refreshAuthToken.mockClear();
    scheduleTokenRefresh("user-1", "user-1", "Token refresh after test");
    jest.advanceTimersByTime(2000);
    expect(refreshAuthToken).toHaveBeenCalledTimes(1);
    jest.useRealTimers();
  });

  it("does nothing when currentUserId does not match userId", () => {
    jest.useFakeTimers();
    const refreshAuthToken = require("../../services/firebase/auth")
      .refreshAuthToken as jest.Mock;
    refreshAuthToken.mockClear();
    scheduleTokenRefresh("user-1", "user-2", "Token refresh after test");
    jest.advanceTimersByTime(2000);
    expect(refreshAuthToken).not.toHaveBeenCalled();
    jest.useRealTimers();
  });
});
```

Note: `../../services/firebase/auth`'s `refreshAuthToken` export needs to be mockable — check whether `jest.setup.js` already mocks this module globally; if not, add a local `jest.mock('../../services/firebase/auth', () => ({refreshAuthToken: jest.fn().mockResolvedValue(undefined)}))` at the top of this test file before the imports. Adjust the two test cases above once you've confirmed the actual mocking mechanism available — the illustrative code above shows intent, not a guaranteed-correct final form, since this plan's research didn't fully capture `jest.setup.js`'s exact global mock shape for firestore method overrides.

- [ ] **Step 2: Run the tests to verify they fail**

Run: `cd mobile && npx jest src/models/__tests__/modelHelpers.test.ts`
Expected: FAIL — `../modelHelpers` doesn't exist yet.

- [ ] **Step 3: Implement `modelHelpers.ts`**

Create `mobile/src/models/modelHelpers.ts`:

```typescript
import firestore, {
  FirebaseFirestoreTypes,
} from "@react-native-firebase/firestore";
import { refreshAuthToken } from "../services/firebase/auth";

/**
 * Fetches a Firestore document and throws with `notFoundMessage` if it
 * doesn't exist — collapses the "fetch → check .exists → throw" preamble
 * repeated across MemberModel's mutation methods into one call.
 */
export async function getRequiredDoc(
  collectionPath: string,
  docId: string,
  notFoundMessage: string,
): Promise<FirebaseFirestoreTypes.DocumentSnapshot> {
  const snap = await firestore().collection(collectionPath).doc(docId).get();
  if (!snap.exists) {
    throw new Error(notFoundMessage);
  }
  return snap;
}

/**
 * Wraps an async model operation in the standard log-and-rethrow pattern
 * used throughout the models layer, so each method doesn't hand-roll its
 * own try/catch with a slightly different log message.
 */
export async function withModelErrorHandling<T>(
  label: string,
  fn: () => Promise<T>,
): Promise<T> {
  try {
    return await fn();
  } catch (error) {
    console.error(`${label}:`, error);
    throw error;
  }
}

/**
 * If the acting user is the same as the affected user, schedules a
 * delayed auth-token refresh so newly-synced custom claims (admin,
 * treasurer, etc.) take effect without requiring a manual re-login.
 * Fire-and-forget by design — failures are logged, never thrown, since
 * this is a best-effort UX nicety, not a critical path.
 */
export function scheduleTokenRefresh(
  userId: string,
  currentUserId: string | undefined,
  context: string,
): void {
  if (currentUserId && currentUserId === userId) {
    setTimeout(async () => {
      try {
        await refreshAuthToken();
      } catch (e) {
        console.warn(`${context}:`, e);
      }
    }, 2000);
  }
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `cd mobile && npx jest src/models/__tests__/modelHelpers.test.ts`
Expected: PASS.

- [ ] **Step 5: Apply the helpers to `MemberModel.ts`**

Read the file first to get current exact line numbers (Wave 2 planning research captured them, but re-verify since the file may have shifted). Apply `getRequiredDoc` to all 7 sites currently shaped as:

```typescript
const memberDoc = await memberDocRef.get();

if (!memberDoc.exists) {
  throw new Error("Member not found in this group");
}
```

replacing with (adjusting the variable name and collection/doc-id expression to match each call site's actual context):

```typescript
const memberDoc = await getRequiredDoc(
  "members",
  `${groupId}_${userId}`,
  "Member not found in this group",
);
```

The 7 methods to update: `removeMember`, `makeAdmin` (also has a second `groups` existence check — leave that one as-is, out of scope), `removeAdmin`, `updateTreasurerStatus`, `updateMemberPosition`, `updateSobrietyDateVisibility`, `updatePhoneNumberVisibility`.

Apply `scheduleTokenRefresh` to all 5 sites currently shaped as:

```typescript
const currentUser = auth().currentUser;
if (currentUser && currentUser.uid === userId) {
  setTimeout(async () => {
    try {
      await refreshAuthToken();
    } catch (e) {
      console.warn("Token refresh after <X>:", e);
    }
  }, 2000);
}
```

replacing with:

```typescript
scheduleTokenRefresh(
  userId,
  auth().currentUser?.uid,
  "Token refresh after <X>",
);
```

preserving each site's own distinct message (`after joining group`, `after leaving group`, `after admin change`, `after admin removal`, `after treasurer change`) exactly as it is today. The 5 methods to update: `addMember`, `removeMember`, `makeAdmin`, `removeAdmin`, `updateTreasurerStatus`.

Do NOT apply `withModelErrorHandling` in this task — MemberModel.ts's outer try/catch blocks are intertwined with method-specific logic in ways that need individual attention; scope this task to the two mechanical, unambiguous extractions above (doc-fetch + token-refresh) and leave the broader try/catch wrapping for a future pass.

Add the import at the top of `MemberModel.ts`:

```typescript
import { getRequiredDoc, scheduleTokenRefresh } from "./modelHelpers";
```

- [ ] **Step 6: Run MemberModel's existing test file to verify nothing broke**

Run: `cd mobile && npx jest src/models/__tests__/MemberModel.test.ts`
Expected: PASS (this file tests `fromFirestore` conversion logic, not the methods you just changed — confirm it still passes as a basic sanity check, then also manually trace through 1-2 of the changed methods by reading the diff to confirm behavior is identical, since no test currently exercises the async Firestore-hitting methods directly).

- [ ] **Step 7: Typecheck and run the full mobile suite**

Run: `cd mobile && npx tsc --noEmit && npm test`
Expected: both exit 0.

- [ ] **Step 8: Commit**

```bash
cd /Users/marcusklein/dev/recovery-platform
git add homegroups/mobile/src/models/modelHelpers.ts homegroups/mobile/src/models/__tests__/modelHelpers.test.ts homegroups/mobile/src/models/MemberModel.ts
git commit -m "refactor(homegroups-mobile): extract shared model error-handling helpers, apply to MemberModel"
```

---

## Task 4: Shared Redux Thunk Helper (Applied to Two Leaky-Error-Contract Slices)

**Files:**

- Create: `mobile/src/store/thunkHelpers.ts`
- Create: `mobile/src/store/__tests__/thunkHelpers.test.ts`
- Modify: `mobile/src/store/slices/sponsorshipSlice.ts`
- Modify: `mobile/src/store/slices/servicePositionsSlice.ts`

**Interfaces:**

- Produces: `extractError(error: unknown, fallback: string): string` — returns `error.message` if `error` is an `Error` with a truthy message, else `fallback`.
- No new thunk-factory wrapper is introduced (see design note below) — this task's real deliverable is the shared `extractError` helper plus migrating both slices' thunks from `throw new Error(...)` to `rejectWithValue(extractError(...))`, unifying their error contract with the other 24 slices in the codebase.

**Design note (read before starting):** The original review suggested a `createAppThunk` factory wrapping the whole try/catch. Planning research found this codebase already has an established, widely-used pattern for this instead: `createAsyncThunk<Return, Arg, {rejectValue: string}>(name, async (arg, {rejectWithValue}) => { try {...} catch (error: any) { return rejectWithValue(error.message || 'fallback'); } })` — used in 10+ slices already (`businessMeetingsSlice`, `announcementsSlice`, `intergroupSlice`, `literatureSlice`, and others), including one thunk (`deleteServicePosition`) already inside `servicePositionsSlice.ts` itself. Introducing a competing thunk-factory abstraction would fragment the codebase further rather than unify it. **This task instead: (a) adds one small `extractError` helper to reduce the `error.message || fallback` duplication, and (b) migrates the two buggy slices onto the pattern the rest of the codebase already uses** — this is lower-risk and more consistent than inventing a new abstraction.

**Context:** `sponsorshipSlice.ts` and `servicePositionsSlice.ts` (3 of its 4 thunks) `throw new Error(...)` instead of using `rejectWithValue`, so their `.rejected` reducers read `action.error.message` — RTK's default, unsanitized error surface — instead of `action.payload`. This is a real bug: it surfaces raw, potentially Firestore-internal error text directly to end users via whatever UI reads `state.sponsorship.error`/`state.servicePositions.error`, inconsistent with how the other 24 slices behave.

- [ ] **Step 1: Write a failing test for `extractError`**

Create `mobile/src/store/__tests__/thunkHelpers.test.ts`:

```typescript
import { extractError } from "../thunkHelpers";

describe("extractError", () => {
  it("returns the error message when given a real Error with a message", () => {
    expect(extractError(new Error("boom"), "fallback")).toBe("boom");
  });

  it("returns the fallback when given an Error with an empty message", () => {
    expect(extractError(new Error(""), "fallback")).toBe("fallback");
  });

  it("returns the fallback when given a non-Error value", () => {
    expect(extractError("a plain string", "fallback")).toBe("fallback");
    expect(extractError(null, "fallback")).toBe("fallback");
    expect(extractError(undefined, "fallback")).toBe("fallback");
    expect(extractError({ not: "an error" }, "fallback")).toBe("fallback");
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd mobile && npx jest src/store/__tests__/thunkHelpers.test.ts`
Expected: FAIL — `../thunkHelpers` doesn't exist yet.

- [ ] **Step 3: Implement `thunkHelpers.ts`**

Create `mobile/src/store/thunkHelpers.ts`:

```typescript
/**
 * Extracts a user-safe error message from an unknown caught value, matching
 * the `error.message || fallback` pattern already used across ~24 of this
 * codebase's 26 Redux slices — centralized here so it's typed correctly
 * (the caught value in a catch block is `unknown`, not `any`) rather than
 * repeated with an implicit `any` cast at every call site.
 */
export function extractError(error: unknown, fallback: string): string {
  if (error instanceof Error && error.message) {
    return error.message;
  }
  return fallback;
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `cd mobile && npx jest src/store/__tests__/thunkHelpers.test.ts`
Expected: PASS.

- [ ] **Step 5: Migrate `sponsorshipSlice.ts`'s 10 `throw new Error` sites**

Read the file first to confirm current exact line numbers. For each of the 10 `throw new Error('...')` call sites (in `requestSponsorship` — 3 sites, `acceptSponsorshipRequest` — 3 sites, `rejectSponsorshipRequest` — 2 sites, `updateSponsorAvailability` — 2 sites), the thunk needs to change from a plain `createAsyncThunk('name', async (arg) => {...})` (no `rejectWithValue` destructured, no try/catch) to the established typed pattern. For example, `requestSponsorship`'s current shape (illustrative — verify against actual current code):

```typescript
export const requestSponsorship = createAsyncThunk(
  "sponsorship/request",
  async (data: RequestSponsorshipArgs) => {
    const currentUser = auth().currentUser;
    if (!currentUser) throw new Error("User not authenticated");
    // ... more logic with 2 more throws ...
  },
);
```

becomes:

```typescript
export const requestSponsorship = createAsyncThunk<
  Sponsorship,
  RequestSponsorshipArgs,
  { rejectValue: string }
>("sponsorship/request", async (data, { rejectWithValue }) => {
  try {
    const currentUser = auth().currentUser;
    if (!currentUser) return rejectWithValue("User not authenticated");
    // ... same logic, other throws become `return rejectWithValue('...')` too ...
  } catch (error: unknown) {
    return rejectWithValue(
      extractError(error, "Failed to request sponsorship"),
    );
  }
});
```

Apply the same transformation to `acceptSponsorshipRequest`, `rejectSponsorshipRequest`, `updateSponsorAvailability` — wrap each in try/catch, change every internal `throw new Error(msg)` to `return rejectWithValue(msg)`, and add a final `catch (error: unknown) { return rejectWithValue(extractError(error, '<thunk-specific fallback>')); }`. Use the exact `Return`/`Arg` generic types already implied by each thunk's existing return value and argument (read the thunk body to infer these correctly rather than guessing — e.g. if the thunk currently returns a `Sponsorship` object, that's the `Return` generic).

Then update all 8 `.rejected` reducers in `extraReducers` that currently read `action.error.message || '...'` to instead read `action.payload as string`, e.g.:

```typescript
// Before:
state.error = action.error.message || "Failed to fetch sponsorships";
// After:
state.error = (action.payload as string) || "Failed to fetch sponsorships";
```

(The 8 reducers correspond to the thunks at the original lines ~532, 545, 553, 613, 639, 662, 685, 701 — re-verify exact count/locations against current file content, since planning research found 8 instances, more than the 4 originally cited by the review.)

Add the import: `import {extractError} from '../thunkHelpers';`

- [ ] **Step 6: Migrate `servicePositionsSlice.ts`'s 3 remaining `throw new Error` sites**

Apply the identical transformation to `fetchServicePositionsForGroup`, `createServicePosition`, `updateServicePosition` (the 3 thunks NOT already using `rejectWithValue` — `deleteServicePosition` already does and needs no change, though you may update its own `error.message || fallback` call to use the new `extractError` helper for consistency, optional). Update the corresponding 3 `.rejected` reducers (currently at ~lines 197, 216, 271) from `action.error.message` to `action.payload as string`, matching `deleteServicePosition`'s own reducer (line 290) which is already correct and can serve as the in-file reference pattern.

Add the import: `import {extractError} from '../thunkHelpers';`

- [ ] **Step 7: Write regression tests confirming the error contract changed**

Neither slice has an existing test file (confirmed during planning research) — create `mobile/src/store/slices/__tests__/sponsorshipSlice.test.ts` and `mobile/src/store/slices/__tests__/servicePositionsSlice.test.ts`, following the structure/conventions already established in `mobile/src/store/slices/__tests__/groupsSlice.test.ts` (read it first). At minimum, for each slice, write one test per migrated thunk asserting that when the underlying model call throws, the resulting `.rejected` action's `payload` (not `error.message`) contains the expected string, and that dispatching the resulting action into the slice's reducer sets `state.error` from `action.payload`. Example shape for one thunk:

```typescript
it("requestSponsorship: rejects with a payload string when the model call throws", async () => {
  jest
    .spyOn(
      MemberModel,
      /* whatever method requestSponsorship's implementation actually calls */ "someMethod",
    )
    .mockRejectedValueOnce(new Error("Firestore permission denied"));
  const store = configureStore({
    reducer: { sponsorship: sponsorshipReducer },
  });
  await store.dispatch(requestSponsorship({/* valid args */}) as any);
  const state = store.getState().sponsorship;
  expect(state.error).toBe("Firestore permission denied");
});
```

Adapt the exact mocked dependency/method per thunk by reading each thunk's actual implementation — the plan's research captured the thunks' shape but not every internal model call each one makes.

- [ ] **Step 8: Typecheck and run the full mobile suite**

Run: `cd mobile && npx tsc --noEmit && npm test`
Expected: both exit 0, including the 2 new test files.

- [ ] **Step 9: Commit**

```bash
cd /Users/marcusklein/dev/recovery-platform
git add homegroups/mobile/src/store/thunkHelpers.ts homegroups/mobile/src/store/__tests__/thunkHelpers.test.ts homegroups/mobile/src/store/slices/sponsorshipSlice.ts homegroups/mobile/src/store/slices/servicePositionsSlice.ts homegroups/mobile/src/store/slices/__tests__/sponsorshipSlice.test.ts homegroups/mobile/src/store/slices/__tests__/servicePositionsSlice.test.ts
git commit -m "fix(homegroups-mobile): migrate sponsorshipSlice/servicePositionsSlice off raw error.message onto the established rejectWithValue contract"
```

---

## Task 5: Shared Callable Auth/Validation Wrapper (Foundation)

**Files:**

- Create: `functions/src/utils/callableWrapper.ts`
- Create: `functions/src/utils/__tests__/callableWrapper.test.ts`
- Modify: `functions/package.json` (add `zod` dependency)

**Interfaces:**

- Produces: `requireAuth<T>(request: CallableRequest<T>): string` — throws `HttpsError("unauthenticated", "Must be authenticated.")` if `request.auth` is absent, else returns `request.auth.uid`.
- Produces: `validateData<S extends z.ZodSchema>(schema: S, data: unknown): z.infer<S>` — parses `data` against `schema`; throws `HttpsError("invalid-argument", <joined issue messages>)` on failure, else returns the validated (and allow-list-stripped, per Zod's default object-parsing behavior) data.

**Context:** This is the foundational piece — it does not touch any existing callable yet (that's Tasks 6-7). The original review's root-cause finding was "no shared callable auth wrapper across ~90 functions, 3 competing auth-check styles." This task builds the two composable primitives (auth check, schema validation) rather than a single monolithic higher-order wrapper, since planning research found this codebase's callables have too much per-function variance (some check group membership, some check admin status, some check neither) for one generic `withAuth(handler)` wrapper to fit cleanly — composable functions called explicitly at the top of each handler (matching the exact calling convention already established by `assertGroupActive` in `utils/subscriptionGuard.ts`) are a better fit for this codebase's existing style than a new HOF pattern.

- [ ] **Step 1: Add the `zod` dependency**

Run: `cd functions && npm install zod`
Expected: `zod` appears in `functions/package.json`'s `dependencies` and `package-lock.json` is updated. Confirm the installed version is compatible with this project's TypeScript `^4.5.4` (Zod 3.x supports TS 4.5+; if `npm install zod` pulls a version requiring newer TypeScript, pin to the latest 3.x release compatible with TS 4.5, e.g. `npm install zod@^3.22.0`).

- [ ] **Step 2: Write failing tests**

Create `functions/src/utils/__tests__/callableWrapper.test.ts`:

```typescript
export {};

jest.mock("firebase-functions/v2/https", () => ({
  HttpsError: class HttpsError extends Error {
    code: string;
    details?: unknown;
    constructor(code: string, message: string, details?: unknown) {
      super(message);
      this.code = code;
      this.details = details;
    }
  },
}));

import { z } from "zod";
import { requireAuth, validateData } from "../callableWrapper";

describe("requireAuth", () => {
  it("returns the uid when request.auth is present", () => {
    const request = { auth: { uid: "user-1" } } as any;
    expect(requireAuth(request)).toBe("user-1");
  });

  it("throws unauthenticated when request.auth is absent", () => {
    const request = { auth: undefined } as any;
    expect(() => requireAuth(request)).toThrow(
      expect.objectContaining({ code: "unauthenticated" }),
    );
  });
});

describe("validateData", () => {
  const schema = z.object({
    name: z.string().min(1),
    age: z.number().int().positive(),
  });

  it("returns the parsed data when input is valid", () => {
    const result = validateData(schema, { name: "Alice", age: 30 });
    expect(result).toEqual({ name: "Alice", age: 30 });
  });

  it("strips unknown fields not on the schema (allow-list behavior)", () => {
    const result = validateData(schema, {
      name: "Alice",
      age: 30,
      stripeCustomerId: "cus_should_be_stripped",
    });
    expect(result).toEqual({ name: "Alice", age: 30 });
    expect((result as any).stripeCustomerId).toBeUndefined();
  });

  it("throws invalid-argument with a descriptive message when input is invalid", () => {
    expect(() => validateData(schema, { name: "", age: -1 })).toThrow(
      expect.objectContaining({ code: "invalid-argument" }),
    );
  });

  it("throws invalid-argument when required fields are missing entirely", () => {
    expect(() => validateData(schema, {})).toThrow(
      expect.objectContaining({ code: "invalid-argument" }),
    );
  });
});
```

- [ ] **Step 3: Run the tests to verify they fail**

Run: `cd functions && npx jest src/utils/__tests__/callableWrapper.test.ts`
Expected: FAIL — `../callableWrapper` doesn't exist yet.

- [ ] **Step 4: Implement `callableWrapper.ts`**

Create `functions/src/utils/callableWrapper.ts`:

```typescript
import { CallableRequest, HttpsError } from "firebase-functions/v2/https";
import { z } from "zod";

/**
 * Asserts the caller is authenticated and returns their UID. Centralizes
 * the `if (!request.auth) throw ...` check that's currently reimplemented
 * ~89 times across this codebase's callables in 3 slightly different
 * styles (two-step guard, inline one-liner, destructure-rename).
 */
export function requireAuth<T>(request: CallableRequest<T>): string {
  if (!request.auth) {
    throw new HttpsError("unauthenticated", "Must be authenticated.");
  }
  return request.auth.uid;
}

/**
 * Validates `data` against `schema` and returns the parsed result. Zod's
 * default object-parsing mode strips any field not declared on the schema
 * — this is deliberate allow-list behavior: a client cannot inject a field
 * (e.g. `admins`, `stripeCustomerId`) that the schema doesn't define,
 * regardless of what's in the raw request payload.
 */
export function validateData<S extends z.ZodSchema>(
  schema: S,
  data: unknown,
): z.infer<S> {
  const result = schema.safeParse(data);
  if (!result.success) {
    const issues = result.error.issues
      .map((issue) => `${issue.path.join(".") || "(root)"}: ${issue.message}`)
      .join("; ");
    throw new HttpsError("invalid-argument", issues);
  }
  return result.data;
}
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `cd functions && npx jest src/utils/__tests__/callableWrapper.test.ts`
Expected: PASS.

- [ ] **Step 6: Typecheck and run the full functions suite**

Run: `cd functions && npx tsc --noEmit && npm test -- --passWithNoTests --forceExit`
Expected: both exit 0. If `tsc` reports an error related to Zod's type-inference requiring a newer TypeScript feature, downgrade to an older Zod 3.x minor version compatible with TS `^4.5.4` rather than upgrading the project's TypeScript (out of scope for this task).

- [ ] **Step 7: Commit**

```bash
cd /Users/marcusklein/dev/recovery-platform
git add homegroups/functions/package.json homegroups/functions/package-lock.json homegroups/functions/src/utils/callableWrapper.ts homegroups/functions/src/utils/__tests__/callableWrapper.test.ts
git commit -m "feat(homegroups-functions): add shared callable auth/validation wrapper (requireAuth, validateData) with Zod"
```

---

## Task 6: Close the Mass-Assignment Gap in `createGroupWithSubscription`

**Files:**

- Modify: `functions/src/callable/createGroupWithSubscription.ts`
- Modify: `functions/src/__tests__/createGroupWithSubscription.test.ts`

**Interfaces:** `createGroupWithSubscription`'s `CreateGroupWithSubscriptionData` input type is unchanged at the type level, but at runtime, `request.data.groupData` and each element of `request.data.meetings` are now validated against an explicit Zod allow-list before use — any field not on the allow-list is silently stripped rather than passed through to Firestore.

**Context:** The handler currently spreads the entire client-supplied `groupData` object (typed only as `Partial<HomeGroup>`, not runtime-validated) into the new group document, overwriting only 11 specific server-controlled fields afterward — any other field the client includes (arbitrary keys) passes through unvalidated. Same issue for each `meeting` object (4 fields overwritten, everything else passes through). This task replaces both spreads with `validateData` calls against explicit allow-list schemas covering exactly the legitimate client-settable fields.

- [ ] **Step 1: Write failing tests**

In `functions/src/__tests__/createGroupWithSubscription.test.ts`, add tests inside the existing test structure (read the file's existing mock setup first — it has a hand-rolled in-memory Firestore mock via `buildMockDb`, `mockBatchSet`, etc., and a `makeRequest(uid, data)` helper per the plan's research). Add:

```typescript
it("strips unvalidated/dangerous fields from client-supplied groupData before writing", async () => {
  setupDefaults();
  const request = makeRequest("user-1", {
    groupData: {
      ...BASE_GROUP_DATA,
      admins: ["attacker-uid"], // should be overwritten by server logic regardless
      stripeCustomerId: "cus_injected", // should be stripped by validation before even reaching the overwrite step
      arbitraryField: "should not survive", // should be stripped
    },
    meetings: BASE_MEETINGS,
    paymentMethodId: "pm_test",
  });
  await (createGroupWithSubscription as any)(request);
  const groupWriteCall = mockBatchSet.mock.calls.find(
    (call: any[]) =>
      typeof call[0]?.path === "string" && call[0].path.includes("groups/"),
  );
  const writtenGroup = groupWriteCall[1];
  expect(writtenGroup.arbitraryField).toBeUndefined();
  expect(writtenGroup.admins).toEqual(["user-1"]); // server-controlled value wins, not the injected one
});

it("strips unvalidated fields from each client-supplied meeting before writing", async () => {
  setupDefaults();
  const request = makeRequest("user-1", {
    groupData: BASE_GROUP_DATA,
    meetings: [
      { ...BASE_MEETINGS[0], arbitraryMeetingField: "should not survive" },
    ],
    paymentMethodId: "pm_test",
  });
  await (createGroupWithSubscription as any)(request);
  const meetingWriteCall = mockBatchSet.mock.calls.find(
    (call: any[]) =>
      typeof call[0]?.path === "string" && call[0].path.includes("meetings/"),
  );
  const writtenMeeting = meetingWriteCall[1];
  expect(writtenMeeting.arbitraryMeetingField).toBeUndefined();
});

it("still rejects when groupData.name is missing (existing validation preserved)", async () => {
  setupDefaults();
  const request = makeRequest("user-1", {
    groupData: { ...BASE_GROUP_DATA, name: undefined },
    meetings: BASE_MEETINGS,
    paymentMethodId: "pm_test",
  });
  await expect(
    (createGroupWithSubscription as any)(request),
  ).rejects.toMatchObject({
    code: "invalid-argument",
  });
});
```

Adapt the exact mock-inspection mechanism (`mockBatchSet.mock.calls.find(...)`) to however this test file's actual mock structure exposes batch writes — read the file's existing passing tests first to copy the correct inspection pattern rather than guessing the mock's exact shape.

- [ ] **Step 2: Run the tests to verify they fail**

Run: `cd functions && npx jest src/__tests__/createGroupWithSubscription.test.ts`
Expected: the 2 new "strips" tests FAIL (no validation exists yet); the "still rejects when name is missing" test may already PASS (existing behavior) — that's fine, it's there as a regression guard for Step 3.

- [ ] **Step 3: Add Zod schemas and apply them**

Near the top of `createGroupWithSubscription.ts`, after the existing imports, add:

```typescript
import { z } from "zod";
import { validateData } from "../utils/callableWrapper";

// Allow-list of client-settable fields on group creation. Excludes the 11
// server-controlled fields (id, createdAt, updatedAt, admins, memberCount,
// stripeCustomerId, stripeSubscriptionId, subscriptionStatus,
// stripeSubscriptionItemId, stripePriceIdGroup, stripeProductIdGroup) and
// fields that shouldn't be client-settable at creation time regardless
// (isClaimed, pendingAdminRequests, treasury, meetings — meetings validated
// separately below).
const groupDataSchema = z.object({
  name: z.string().min(1),
  description: z.string().optional(),
  location: z.string().optional(),
  address: z.string().optional(),
  city: z.string().optional(),
  state: z.string().optional(),
  zip: z.string().optional(),
  lat: z.number().optional(),
  lng: z.number().optional(),
  foundedDate: z.string().optional(),
  placeName: z.string().optional(),
  type: z.string().optional(),
  publicProfileEnabled: z.boolean().optional(),
});

// Allow-list for each client-supplied meeting. Excludes the 4
// server-controlled fields (id, groupId, createdAt, updatedAt).
const meetingDataSchema = z.object({
  name: z.string().min(1),
  type: z.string(),
  day: z.string(),
  time: z.string(),
  country: z.string().optional(),
  street: z.string().optional(),
  address: z.string().optional(),
  city: z.string().optional(),
  state: z.string().optional(),
  zip: z.string().optional(),
  lat: z.number().optional(),
  lng: z.number().optional(),
  location: z.string().optional(),
  isOnline: z.boolean(),
  onlineLink: z.string().optional(),
  onlineNotes: z.string().optional(),
  verified: z.boolean().optional(),
  addedBy: z.string().optional(),
  format: z.string().optional(),
  locationName: z.string().optional(),
  geohash: z.string().optional(),
  temporaryNotice: z.string().nullable().optional(),
  isCancelledTemporarily: z.boolean().optional(),
});
```

Then, where the handler currently validates `groupData.name` and reads `meetings` (find the existing validation block, roughly lines 32-58), add validated versions:

```typescript
const validatedGroupData = validateData(groupDataSchema, groupData);
const validatedMeetings = meetings.map((m) =>
  validateData(meetingDataSchema, m),
);
```

Keep the existing `meetings.length` / `paymentMethodId` / `productIdGroup` checks exactly as they are — this only replaces the trust boundary on the OBJECT CONTENTS of `groupData` and each meeting, not the existing presence/count checks.

Then change the group spread (currently lines ~166-179) from `...groupData` to `...validatedGroupData`:

```typescript
const newGroup: Partial<HomeGroup> = {
  ...validatedGroupData,
  id: groupRef.id,
  createdAt: admin.firestore.FieldValue.serverTimestamp(),
  updatedAt: admin.firestore.FieldValue.serverTimestamp(),
  admins: [userId],
  memberCount: memberCount,
  stripeCustomerId: stripeCustomerId,
  stripeSubscriptionId: stripeSubscriptionId,
  subscriptionStatus: subscriptionStatus,
  stripeSubscriptionItemId: subscriptionItemId,
  stripePriceIdGroup: groupPriceId,
  stripeProductIdGroup: productIdGroup,
};
```

And the meeting spread (currently lines ~210-216) — change the loop to iterate `validatedMeetings` instead of the raw `meetings`, and spread the validated object:

```typescript
firestoreBatch.set(db.collection("meetings").doc(meetingId), {
  ...validatedMeeting, // the validated version of `meeting` for this loop iteration
  id: meetingId,
  groupId: groupRef.id,
  createdAt: admin.firestore.FieldValue.serverTimestamp(),
  updatedAt: admin.firestore.FieldValue.serverTimestamp(),
});
```

Read the actual surrounding loop code first to wire `validatedMeetings` in correctly (e.g. if the loop is `for (const meeting of meetings)`, either change it to `for (const validatedMeeting of validatedMeetings)` or index into `validatedMeetings` at the same position — match whatever the existing loop structure is).

- [ ] **Step 4: Run the tests to verify they pass**

Run: `cd functions && npx jest src/__tests__/createGroupWithSubscription.test.ts`
Expected: PASS, including all pre-existing tests in the file (this file has extensive existing coverage per the research — verify nothing broke, since `BASE_GROUP_DATA`/`BASE_MEETINGS` fixtures must satisfy the new schemas; if a pre-existing fixture is missing a now-required field like `isOnline` on a meeting, fix the fixture, not the schema, unless the fixture reveals the schema is wrong for a genuinely valid real-world case — use judgment and note in your report).

- [ ] **Step 5: Typecheck and run the full functions suite**

Run: `cd functions && npx tsc --noEmit && npm test -- --passWithNoTests --forceExit`
Expected: both exit 0.

- [ ] **Step 6: Commit**

```bash
cd /Users/marcusklein/dev/recovery-platform
git add homegroups/functions/src/callable/createGroupWithSubscription.ts homegroups/functions/src/__tests__/createGroupWithSubscription.test.ts
git commit -m "fix(homegroups-functions): validate groupData/meetings against an explicit allow-list in createGroupWithSubscription"
```

---

## Task 7: Close the Free-Admin-on-Unpaid-Trial Gap in `requestAdminAccessWithSubscription`

**Files:**

- Modify: `functions/src/callable/requestAdminAccessWithSubscription.ts`
- Create: `functions/src/__tests__/requestAdminAccessWithSubscription.test.ts`

**Interfaces:** `RequestAdminAccessWithSubscriptionData`'s `paymentMethodId` field changes from optional to conditionally-required — specifically, required whenever a new Stripe subscription needs to be created (i.e., when `subscriptionId` is not already supplied from a completed web-based checkout). No change to the callable's success-path response shape.

**Context:** The handler creates a Stripe subscription with `trial_period_days` and accepts `default_payment_method: paymentMethodId` where `paymentMethodId` is optional — Stripe will still return a `trialing`-status subscription with no payment method attached if it's omitted, and the subsequent admin-grant guard only checks `subscriptionStatus !== "active" && subscriptionStatus !== "trialing"`, which a card-less trial satisfies. Net effect: any authenticated user can claim free admin of an unclaimed group with zero payment commitment. Fix: require `paymentMethodId` before attempting to create a new subscription (the `subscriptionId`-supplied path, used for completed web checkouts, is unaffected since a real subscription already exists in that case).

- [ ] **Step 1: Write failing tests**

Create `functions/src/__tests__/requestAdminAccessWithSubscription.test.ts` from scratch — no test file exists for this callable today. Follow the exact mock-setup structure already established in `functions/src/__tests__/createGroupWithSubscription.test.ts` (read it in full first — same `jest.mock` blocks for `firebase-admin`, `firebase-functions/v2/https`, the hand-rolled in-memory Firestore mock, the Stripe mock, `makeRequest` helper) so this new file is stylistically consistent with its sibling.

```typescript
// (Header comment matching the sibling file's style, adjust per actual read)
export {};

// ... same jest.mock blocks as createGroupWithSubscription.test.ts for
// firebase-admin, firebase-functions/v2/https, firebase-functions/logger ...

// ... same Stripe mock structure, wired for subscriptions.create ...

// ... same hand-rolled Firestore mock (buildMockDb, etc.) ...

import { requestAdminAccessWithSubscription } from "../callable/requestAdminAccessWithSubscription";

describe("requestAdminAccessWithSubscription — payment method requirement", () => {
  it("rejects with invalid-argument when creating a new subscription without a paymentMethodId", async () => {
    // seed an unclaimed group with no existing subscription
    const request = makeRequest("user-1", {
      groupId: "group-1",
      // paymentMethodId intentionally omitted
    });
    await expect(
      (requestAdminAccessWithSubscription as any)(request),
    ).rejects.toMatchObject({ code: "invalid-argument" });
  });

  it("proceeds when paymentMethodId is provided and grants admin on a trialing subscription with a card attached", async () => {
    mockStripeSubscriptionsCreate.mockResolvedValueOnce({
      id: "sub_test",
      status: "trialing",
      latest_invoice: { payment_intent: {} },
    });
    const request = makeRequest("user-1", {
      groupId: "group-1",
      paymentMethodId: "pm_test_card",
    });
    const result = await (requestAdminAccessWithSubscription as any)(request);
    expect(result).toMatchObject({ success: true });
    expect(mockStripeSubscriptionsCreate).toHaveBeenCalledWith(
      expect.objectContaining({ default_payment_method: "pm_test_card" }),
      expect.anything(),
    );
  });

  it("does not require paymentMethodId when subscriptionId is already supplied (completed web checkout path)", async () => {
    const request = makeRequest("user-1", {
      groupId: "group-1",
      subscriptionId: "sub_already_created",
      // paymentMethodId intentionally omitted — should be fine, subscription already exists
    });
    // seed the group/Stripe mocks so this subscriptionId resolves to an active/trialing status
    // ... (adapt to however the file's Firestore/Stripe mocks represent an existing subscription lookup)
    await expect(
      (requestAdminAccessWithSubscription as any)(request),
    ).resolves.toMatchObject({ success: true });
  });
});
```

Adapt mock variable names (`mockStripeSubscriptionsCreate`, `makeRequest`, group-seeding helpers) to whatever `createGroupWithSubscription.test.ts` actually establishes — read that file fully before finalizing this one, since the illustrative names above are best-guesses based on planning research, not confirmed exact identifiers.

- [ ] **Step 2: Run the tests to verify they fail as expected**

Run: `cd functions && npx jest src/__tests__/requestAdminAccessWithSubscription.test.ts`
Expected: the "rejects without paymentMethodId" test FAILS (no such guard exists yet); the other two tests' pass/fail status depends on whether your mock setup is already correct — get all three test bodies right first (they may need iteration), then confirm test 1 fails against current code before implementing the fix.

- [ ] **Step 3: Add the payment-method requirement**

Read the file first to find the exact current branch (planning research located it around lines 201-247, the `if (!stripeSubscriptionId || subscriptionStatus === "canceled" || ...)` block that creates a new subscription). Immediately inside that branch, before the `stripe.subscriptions.create(...)` call, add:

```typescript
if (!paymentMethodId) {
  throw new HttpsError(
    "invalid-argument",
    "A payment method is required to request admin access for this group.",
  );
}
```

This only gates the "creating a new subscription" branch — the `subscriptionId`-supplied path (web checkout already completed, a real subscription already exists in Stripe) is untouched, since that path never calls `stripe.subscriptions.create` and doesn't need a fresh payment method.

Update the input interface (currently lines 16-24) to reflect that `paymentMethodId` is conditionally required — TypeScript can't express "required unless X" cleanly in an interface, so leave the type as `paymentMethodId?: string` but add a comment noting the runtime requirement:

```typescript
paymentMethodId?: string; // For in-app payment (Android). Required at runtime
  // when creating a new subscription (i.e. when subscriptionId is not
  // already supplied) — see the guard in the handler body.
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `cd functions && npx jest src/__tests__/requestAdminAccessWithSubscription.test.ts`
Expected: PASS, all 3 tests.

- [ ] **Step 5: Typecheck and run the full functions suite**

Run: `cd functions && npx tsc --noEmit && npm test -- --passWithNoTests --forceExit`
Expected: both exit 0.

- [ ] **Step 6: Commit**

```bash
cd /Users/marcusklein/dev/recovery-platform
git add homegroups/functions/src/callable/requestAdminAccessWithSubscription.ts homegroups/functions/src/__tests__/requestAdminAccessWithSubscription.test.ts
git commit -m "fix(homegroups-functions): require a payment method before granting admin access on a new trial subscription"
```

---

## Self-Review Notes

- **Spec coverage:** all 7 tasks map to the confirmed Wave 2 scope (5 bounded quick-wins + wrapper foundation + 2 real retrofits). The full-rollout items explicitly deferred (all 10 model files, all 24 slices, all ~90 callables, god-screen decomposition, RN/ESLint upgrades, staging environment, incident runbook) are named in the plan header so this isn't mistaken for "P1 complete."
- **Placeholder scan:** no TBD/"add error handling" language. Several steps (Task 3 Step 1's firestore mock override, Task 4 Step 7's per-thunk test mocking, Task 6/7's exact mock variable names) explicitly instruct reading the actual current file/sibling file first rather than guessing blind — this is the same bounded, disclosed exception pattern used successfully in the Wave 1 plan for cases where research couldn't capture 100% of every file's boilerplate.
- **Type consistency:** `requireAuth`/`validateData` (Task 5) are consumed with matching signatures in Tasks 6-7. `extractError` (Task 4) is consumed identically in both migrated slices. `getRequiredDoc`/`scheduleTokenRefresh` (Task 3) signatures match their Step 5 call sites.
- **Corrections applied during planning:** the original review's "16 models"/"1 correct SafeAreaView file" claims were found inaccurate during research and corrected in Task 1/Task 2 respectively; the `SafeAreaProvider`-missing finding (not in the original review at all) was added as a hard prerequisite in Task 2 to prevent the fix from making Android rendering worse, not better.
