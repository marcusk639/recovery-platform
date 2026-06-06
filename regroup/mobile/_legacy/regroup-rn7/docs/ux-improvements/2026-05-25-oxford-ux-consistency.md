> ⚠️ **Legacy document.** Carried over from the standalone `regroup-rn7` repository, archived on 2026-06-06. Historical reference only — may be outdated and is NOT part of current `mobile` documentation.

# Oxford Module UX Consistency Improvements

**Date:** 2026-05-25
**Scope:** `src/screens/Oxford/` (7 screens)
**Status:** Applied

---

## Summary

A UX audit of the Oxford House module identified six categories of inconsistency with the rest of the app. All fixes were applied in the same session. No new TypeScript errors were introduced (error count stayed at 137 pre-existing).

---

## Changes Applied

### 1. Back Button Missing on Sub-Screens

**Problem:** `OfficerManagement`, `BusinessMeetings`, `EESTracker`, and `Voting` showed no back arrow in their `ScreenHeader`. The rest of the app consistently shows `renderBackButton` on all non-root screens. Users had no visible way to navigate back other than iOS swipe gesture.

**Screens affected:** `OfficerManagement.tsx`, `BusinessMeetings.tsx`, `EESTracker.tsx`, `Voting.tsx`

**Fix:** Added `renderBackButton` prop to all `ScreenHeader` instances in each affected screen, including loading and error-state early-return paths. The "Assign Officer" sub-screen also gets `onBackPress={() => setAssigningRole(null)}` so it cancels the assignment rather than navigating away entirely.

**Before:**

```tsx
<ScreenHeader header="Officer Management" />
```

**After:**

```tsx
<ScreenHeader header="Officer Management" renderBackButton />
```

---

### 2. Raw User IDs Displayed Instead of Names

**Problem:** Two screens displayed raw Firebase UIDs to users:

- `OxfordDashboard.tsx` rendered `officer.userId` (a Firebase UID string) in the Current Officers summary card.
- `BusinessMeetings.tsx` rendered `Created by: ${item.createdBy}` using a raw Firebase UID.

**Fix:** Both screens now resolve UIDs to display names via a `guestByUserId` map built from the Redux `guests` store. The same `guest.userId` → name lookup pattern used in `OfficerManagement` was applied consistently.

**Files changed:** `OxfordDashboard.tsx`, `BusinessMeetings.tsx`

**Before (OxfordDashboard):**

```tsx
<RatsText text={officer.userId} ... />
```

**After:**

```tsx
<RatsText text={getGuestName(officer.userId)} ... />
```

**Before (BusinessMeetings):**

```tsx
<RatsText text={`Created by: ${item.createdBy}`} ... />
```

**After:**

```tsx
<RatsText text={`Created by: ${getCreatorName(item.createdBy)}`} translate={false} ... />
```

---

### 3. Orphaned Manual "Refresh" Buttons

**Problem:** `OfficerManagement` and `EESTracker` both had a `RatsButton title="Refresh"` at the bottom of the screen. Both screens also already had `RefreshControl` wired to their `RatsScrollView` — the standard app-wide pull-to-refresh pattern. The manual button was redundant and inconsistent with every other screen in the app.

**Fix:** Removed the orphaned `RatsButton` from both screens. Pull-to-refresh via `RefreshControl` remains fully functional.

**Files changed:** `OfficerManagement.tsx`, `EESTracker.tsx`

---

### 4. Inconsistent Header Title in EESTracker

**Problem:** `EESTracker` used two different strings for the same screen header:

- Loading state: `"EES Tracker"`
- Main content state: `"Equal Expense Share"`

This caused the header to visibly change as data loaded, which is jarring UX.

**Fix:** Standardized all `ScreenHeader` instances in `EESTracker` to `"Equal Expense Share"`, including the loading state, the not-allowed state, and the main render.

**File changed:** `EESTracker.tsx`

---

### 5. Custom Checkbox vs Native Switch

**Problem:** `Voting.tsx` implemented the "Anonymous voting" toggle using a custom `TouchableOpacity` + `View` that manually drew a checkbox with a `✓` text character. This:

- Does not match native iOS/Android checkbox/toggle conventions
- Has no accessibility semantics (screen readers cannot identify it as a toggle)
- Requires manual state management for checked appearance

The rest of the app uses React Native's native `Switch` component for boolean toggles.

**Fix:** Replaced the custom checkbox implementation with a native `Switch` component using the app's theme colors (`color.baby_blue` for the track, `color.light_grey` for the off state).

**File changed:** `Voting.tsx`

**Before:**

```tsx
<TouchableOpacity testID="anonymous-toggle" onPress={() => setIsAnonymous(prev => !prev)} ...>
  <View style={{ width: 24, height: 24, borderRadius: 4, ... backgroundColor: isAnonymous ? color.baby_blue : color.white }}>
    {isAnonymous && <RatsText text="✓" ... />}
  </View>
  <RatsText text="Anonymous voting" ... />
</TouchableOpacity>
```

**After:**

```tsx
<View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: normalize(12) }}>
  <Switch
    testID="anonymous-toggle"
    value={isAnonymous}
    onValueChange={setIsAnonymous}
    trackColor={{ false: color.light_grey, true: color.baby_blue }}
    ios_backgroundColor={color.light_grey}
    style={{ marginRight: normalize(8) }}
  />
  <RatsText translate={false} text="Anonymous voting" ... />
</View>
```

---

## Not Changed (Deliberate Decisions)

### Container Pattern: `View + ScrollView` vs `RatsScrollView`

`OxfordDashboard` and `CharterCompliance` use `View + ScrollView` while the other Oxford screens use `RatsScrollView`. This is **intentional** — `RatsScrollView` applies `alignItems: 'center'` and `flexGrow: 1` to its contentContainerStyle (it wraps `KeyboardAwareScrollView`). Screens with full-width card grid layouts use `View + ScrollView` to maintain proper width. This is consistent with other full-width layouts elsewhere in the app. No change needed.

### Inline Styles in BusinessMeetings, EESTracker, Voting

These screens use heavy inline styles rather than `StyleSheet.create()`. Migrating to `StyleSheet` is a code quality improvement (better performance due to style ID caching, better readability) but has no user-visible impact. Recommended as a follow-up refactor but excluded from this UX pass.

---

## Recommended Follow-Up Items (Roadmap)

The following were identified but deferred:

| Item                                                                                                          | Priority | Effort |
| ------------------------------------------------------------------------------------------------------------- | -------- | ------ |
| Migrate Oxford inline styles to `StyleSheet.create()`                                                         | Low      | M      |
| Fix pre-existing TS error: `navigate('BusinessMeetingDetail', ...)` should use `Routes.BusinessMeetingDetail` | Medium   | S      |
| Fix `tx.type` possibly undefined in `OxfordDashboard` `renderTransactionsContent`                             | Medium   | S      |
| Add `translate={false}` to remaining dynamic `RatsText` values in Oxford screens                              | Low      | S      |
| Oxford onboarding wizard (see `docs/superpowers/plans/2026-05-25-oxford-onboarding-wizard.md`)                | High     | L      |
