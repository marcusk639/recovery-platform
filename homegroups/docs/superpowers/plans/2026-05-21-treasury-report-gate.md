# Treasury Report Preview Gate Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Non-subscribed group admins should see a subscription prompt instead of generating a full treasury report. Active subscribers (including trialing) get the full report as-is.

**Architecture:** A single-file change to `TreasuryReportScreen.tsx`. The screen already imports `group` from Redux and `navigation` from React Navigation. Add `useTrialStatus(groupId)`, derive `isSubscriptionActive`, and guard the `generateReport` callback and the initial `loadInitialReport` effect. If not subscribed, render an upgrade prompt in place of the report.

**Tech Stack:** React Native, `useTrialStatus` hook (already in `mobile/src/hooks/useTrialStatus.ts`), React Navigation.

**Note on backend:** `TreasuryModel.generateReport` reads Firestore directly from the mobile client — it does not call a Cloud Function. The gate belongs entirely in the mobile layer. This is by design: the Firestore security rules already prevent non-members from reading transactions; the subscription gate here is a product-level paywall, not a security boundary.

---

## File Structure

| File                                                    | Action | Responsibility                                                         |
| ------------------------------------------------------- | ------ | ---------------------------------------------------------------------- |
| `mobile/src/screens/homegroup/TreasuryReportScreen.tsx` | Modify | Import `useTrialStatus`, add subscription check, render upgrade prompt |

---

### Task 1: Add subscription gate to TreasuryReportScreen

**Files:**

- Modify: `mobile/src/screens/homegroup/TreasuryReportScreen.tsx`

- [ ] **Step 1: Add the useTrialStatus import**

Find the existing imports in `TreasuryReportScreen.tsx`. After the existing selector imports (around line 23–24), add:

```typescript
import { useTrialStatus } from "../../hooks/useTrialStatus";
```

- [ ] **Step 2: Add subscription status computation**

Find the existing permission check section (around line 59–64):

```typescript
// Check permissions
const isAdmin = group?.admins.includes(currentUser?.uid || "") ?? false;
const isTreasurer =
  isTreasurerFromPosition ||
  (group?.treasurers?.includes(currentUser?.uid || "") ?? false);
const canAccessTreasury = isAdmin || isTreasurer;
```

Add immediately after it:

```typescript
const trialStatus = useTrialStatus(groupId);
const isSubscriptionActive =
  (trialStatus.isInTrial && !trialStatus.isExpired) || trialStatus.isActive;
```

- [ ] **Step 3: Guard generateReport with subscription check**

Find the `generateReport` callback (line 71). It currently starts:

```typescript
  const generateReport = useCallback(async () => {
    if (!canAccessTreasury) {
      Alert.alert('Error', 'You do not have permission to generate reports');
      return;
    }
```

Add the subscription check immediately after the `canAccessTreasury` guard:

```typescript
  const generateReport = useCallback(async () => {
    if (!canAccessTreasury) {
      Alert.alert('Error', 'You do not have permission to generate reports');
      return;
    }
    if (!isSubscriptionActive) {
      navigation.navigate('SubscriptionUpgrade', {groupId, groupName});
      return;
    }
```

- [ ] **Step 4: Update the useCallback dependency array**

The `generateReport` callback's dependency array (end of the callback, currently `[groupId, startDate, endDate, canAccessTreasury]`) must include `isSubscriptionActive` and `groupName`:

```typescript
  }, [groupId, groupName, startDate, endDate, canAccessTreasury, isSubscriptionActive, navigation]);
```

- [ ] **Step 5: Run mobile tests**

```bash
cd mobile && npm test -- --no-coverage
```

Expected: all tests pass.

- [ ] **Step 6: Commit**

```bash
git add mobile/src/screens/homegroup/TreasuryReportScreen.tsx
git commit -m "feat: gate treasury report generation behind active subscription"
```

---

## Acceptance Criteria

- [ ] Admins with `subscriptionStatus: 'active'` can generate reports as before
- [ ] Admins in an unexpired trial (`subscriptionStatus: 'trialing'`, trial not expired) can generate reports
- [ ] Admins with `subscriptionStatus: 'canceled'` or expired trial are redirected to `SubscriptionUpgradeScreen`
- [ ] The redirect happens on the initial load (not just when the button is tapped again)
- [ ] All existing mobile tests pass
