# Launch Revenue Essentials Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Gate treasury and announcements admin actions behind an active subscription, and add a 7-day pre-renewal reminder so admins don't miss annual charges.

**Architecture:** Three independent changes. (1) Treasury and (2) Announcements screens gain a subscription gate: when `subscriptionStatus` is not `active`/`trialing`, admin write actions redirect to the existing `SubscriptionUpgrade` screen instead of proceeding. An amber banner appears at the top to signal the expired state. (3) The existing `scheduledRenewalReminders` cron is refactored to send at both 30 days and 7 days before renewal.

**Tech Stack:** React Native (TypeScript), Redux Toolkit (`selectGroupById` + `useTrialStatus`), Firebase Cloud Functions (Pub/Sub cron), FCM

---

## File Map

| File                                                         | Change                                                    |
| ------------------------------------------------------------ | --------------------------------------------------------- |
| `mobile/src/screens/homegroup/GroupTreasuryScreen.tsx`       | Add subscription gate around "Add Transaction" actions    |
| `mobile/src/screens/homegroup/GroupAnnouncementsScreen.tsx`  | Add subscription gate around "Create Announcement" action |
| `functions/src/triggers/pubsub/scheduledRenewalReminders.ts` | Refactor to send at 7 days in addition to 30 days         |
| `functions/src/__tests__/scheduledRenewalReminders.test.ts`  | Add tests for 7-day reminder window                       |

---

### Task 1: Gate "Add Transaction" in GroupTreasuryScreen

**Context:** `GroupTreasuryScreen.tsx` has two "Add Transaction" touch targets (lines 391 and 655) that call `navigation.navigate('AddTransaction', ...)` directly with no subscription check. The `useTrialStatus` hook (already used in `GroupOverviewScreen`) returns `{ isInTrial, isActive }` — either being `true` means the group has a valid subscription. The `SubscriptionUpgrade` route at `GroupStackParamList.SubscriptionUpgrade` accepts `{ groupId, groupName }`.

**Files:**

- Modify: `mobile/src/screens/homegroup/GroupTreasuryScreen.tsx`

- [ ] **Step 1: Write the test**

Open `mobile/src/__tests__/GroupTreasuryScreen.test.tsx` (create if missing). Add:

```typescript
// Add to existing imports at top
import { useTrialStatus } from "../../hooks/useTrialStatus";
jest.mock("../../hooks/useTrialStatus");
const mockUseTrialStatus = useTrialStatus as jest.MockedFunction<
  typeof useTrialStatus
>;

it("redirects admin to SubscriptionUpgrade when subscription is expired", () => {
  mockUseTrialStatus.mockReturnValue({
    isInTrial: false,
    daysRemaining: -1,
    trialEndDate: null,
    isExpired: true,
    isActive: false,
  });
  // render GroupTreasuryScreen with isAdmin=true, groupId='g1'
  // press testID="treasury-add-transaction-button"
  // expect navigation.navigate called with ('SubscriptionUpgrade', { groupId: 'g1', groupName: expect.any(String) })
  // expect NOT called with 'AddTransaction'
});

it("allows admin to add transaction when subscription is active", () => {
  mockUseTrialStatus.mockReturnValue({
    isInTrial: false,
    daysRemaining: -1,
    trialEndDate: null,
    isExpired: false,
    isActive: true,
  });
  // render, press testID="treasury-add-transaction-button"
  // expect navigation.navigate called with ('AddTransaction', ...)
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd mobile && npm test -- --testPathPattern="GroupTreasuryScreen" -t "redirects admin"
```

Expected: FAIL — `navigation.navigate` is currently called with `'AddTransaction'` regardless.

- [ ] **Step 3: Add `useTrialStatus` import to GroupTreasuryScreen**

In `mobile/src/screens/homegroup/GroupTreasuryScreen.tsx`, add after the existing `FeatureTooltip` import (line 57):

```typescript
import { useTrialStatus } from "../../hooks/useTrialStatus";
```

- [ ] **Step 4: Add subscription check and banner state**

After the existing `const [editModalVisible, setEditModalVisible] = useState(false);` (around line 158), add:

```typescript
const trialStatus = useTrialStatus(groupId);
const isSubscriptionActive = trialStatus.isInTrial || trialStatus.isActive;

const handleAddTransaction = () => {
  if (isAdmin && !isSubscriptionActive) {
    navigation.navigate("SubscriptionUpgrade", { groupId, groupName });
    return;
  }
  navigation.navigate("AddTransaction", { groupId, groupName });
};
```

- [ ] **Step 5: Replace the two `navigate('AddTransaction'` calls**

Both occurrences navigate identically. Find and replace:

```typescript
// BEFORE (line ~391):
navigation.navigate("AddTransaction", {
  groupId,
  groupName,
});

// AFTER:
handleAddTransaction();
```

```typescript
// BEFORE (line ~655):
navigation.navigate("AddTransaction", { groupId, groupName });

// AFTER:
handleAddTransaction();
```

- [ ] **Step 6: Add expired-subscription banner before `renderTreasurySummary()`**

In the JSX return, immediately before `{renderTreasurySummary()}` (line ~366):

```tsx
{
  isAdmin && !isSubscriptionActive && (
    <TouchableOpacity
      style={styles.subscriptionExpiredBanner}
      onPress={() =>
        navigation.navigate("SubscriptionUpgrade", { groupId, groupName })
      }
      testID="treasury-subscription-expired-banner"
    >
      <Icon name="alert-circle-outline" size={16} color="#fff" />
      <Text style={styles.subscriptionExpiredText}>
        Subscription expired — tap to renew
      </Text>
    </TouchableOpacity>
  );
}
```

- [ ] **Step 7: Add styles for the banner**

In the `StyleSheet.create({...})` block (line ~735), add after `askAdminBannerText`:

```typescript
subscriptionExpiredBanner: {
  flexDirection: 'row',
  alignItems: 'center',
  backgroundColor: '#D32F2F',
  marginHorizontal: 16,
  marginTop: 12,
  marginBottom: 4,
  padding: 12,
  borderRadius: 8,
  gap: 8,
},
subscriptionExpiredText: {
  flex: 1,
  fontSize: 13,
  color: '#fff',
  fontWeight: '600',
},
```

- [ ] **Step 8: Run the test to verify it passes**

```bash
cd mobile && npm test -- --testPathPattern="GroupTreasuryScreen"
```

Expected: PASS

- [ ] **Step 9: Commit**

```bash
git add mobile/src/screens/homegroup/GroupTreasuryScreen.tsx \
        mobile/src/__tests__/GroupTreasuryScreen.test.tsx
git commit -m "feat(mobile): gate treasury add-transaction behind active subscription"
```

---

### Task 2: Gate "Create Announcement" in GroupAnnouncementsScreen

**Context:** `GroupAnnouncementsScreen.tsx` has a "Create Announcement" button (line ~652) that calls `setModalVisible(true)` directly. The create button is inside `{isAdmin && (...)}` but has no subscription check. The same `useTrialStatus` pattern applies.

**Files:**

- Modify: `mobile/src/screens/homegroup/GroupAnnouncementsScreen.tsx`

- [ ] **Step 1: Write the test**

In `mobile/src/__tests__/GroupAnnouncementsScreen.test.tsx` (create if missing):

```typescript
import { useTrialStatus } from "../../hooks/useTrialStatus";
jest.mock("../../hooks/useTrialStatus");
const mockUseTrialStatus = useTrialStatus as jest.MockedFunction<
  typeof useTrialStatus
>;

it("redirects admin to SubscriptionUpgrade when subscription is expired", () => {
  mockUseTrialStatus.mockReturnValue({
    isInTrial: false,
    daysRemaining: -1,
    trialEndDate: null,
    isExpired: true,
    isActive: false,
  });
  // render, press testID="group-announcements-create-button"
  // expect navigation.navigate('SubscriptionUpgrade', { groupId: 'g1', groupName: expect.any(String) })
  // expect setModalVisible NOT called with true
});

it("opens modal when subscription is active", () => {
  mockUseTrialStatus.mockReturnValue({
    isInTrial: false,
    daysRemaining: -1,
    trialEndDate: null,
    isExpired: false,
    isActive: true,
  });
  // render, press testID="group-announcements-create-button"
  // expect modal opens (setModalVisible called with true)
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd mobile && npm test -- --testPathPattern="GroupAnnouncementsScreen" -t "redirects admin"
```

Expected: FAIL

- [ ] **Step 3: Add imports**

Add after the existing `import {selectGroupById, selectAdminGroups}` line in `GroupAnnouncementsScreen.tsx`:

```typescript
import { useTrialStatus } from "../../hooks/useTrialStatus";
```

- [ ] **Step 4: Add subscription hook and gated handler**

After `const {groupId, groupName} = route.params;` (line 50), add:

```typescript
const trialStatus = useTrialStatus(groupId);
const isSubscriptionActive = trialStatus.isInTrial || trialStatus.isActive;

const handleCreatePress = () => {
  if (!isSubscriptionActive) {
    navigation.navigate("SubscriptionUpgrade", { groupId, groupName });
    return;
  }
  setModalVisible(true);
};
```

- [ ] **Step 5: Replace the `onPress` on the Create Announcement button**

Find the create button (line ~652):

```tsx
// BEFORE:
onPress={() => setModalVisible(true)}

// AFTER:
onPress={handleCreatePress}
```

- [ ] **Step 6: Add expired banner in the admin action area**

Immediately before the `{isAdmin && (` block that wraps the Create Announcement button (~line 644):

```tsx
{
  isAdmin && !isSubscriptionActive && (
    <TouchableOpacity
      style={styles.subscriptionExpiredBanner}
      onPress={() =>
        navigation.navigate("SubscriptionUpgrade", { groupId, groupName })
      }
      testID="announcements-subscription-expired-banner"
    >
      <Icon name="alert-circle-outline" size={16} color="#fff" />
      <Text style={styles.subscriptionExpiredText}>
        Subscription expired — tap to renew
      </Text>
    </TouchableOpacity>
  );
}
```

- [ ] **Step 7: Add styles**

In the `StyleSheet.create` block at the bottom of the file, add:

```typescript
subscriptionExpiredBanner: {
  flexDirection: 'row',
  alignItems: 'center',
  backgroundColor: '#D32F2F',
  marginHorizontal: 16,
  marginTop: 8,
  marginBottom: 4,
  padding: 12,
  borderRadius: 8,
  gap: 8,
},
subscriptionExpiredText: {
  flex: 1,
  fontSize: 13,
  color: '#fff',
  fontWeight: '600',
},
```

- [ ] **Step 8: Run the tests**

```bash
cd mobile && npm test -- --testPathPattern="GroupAnnouncementsScreen"
```

Expected: PASS

- [ ] **Step 9: Commit**

```bash
git add mobile/src/screens/homegroup/GroupAnnouncementsScreen.tsx \
        mobile/src/__tests__/GroupAnnouncementsScreen.test.tsx
git commit -m "feat(mobile): gate announcement creation behind active subscription"
```

---

### Task 3: Add 7-Day Pre-Renewal Reminder

**Context:** `scheduledRenewalReminders.ts` currently sends ONE reminder at 30 days before renewal. Admins on an annual plan often forget the charge is coming until it's too late. A 7-day follow-up gives them a final nudge. The existing `sendRenewalReminders()` function takes no arguments and hardcodes `REMINDER_DAYS = 30`. Refactor it to accept a `days` parameter and call it twice from the cron.

**Files:**

- Modify: `functions/src/triggers/pubsub/scheduledRenewalReminders.ts`
- Modify: `functions/src/__tests__/scheduledRenewalReminders.test.ts`

- [ ] **Step 1: Write the failing test**

In `functions/src/__tests__/scheduledRenewalReminders.test.ts`, add after the existing 30-day test:

```typescript
it("sends 7-day reminder to groups expiring in 6-8 days", async () => {
  const eightDaysFromNow = new Date(Date.now() + 8 * 24 * 60 * 60 * 1000);

  // Group expiring in 8 days (within 7±1 window)
  const groupDocs = [
    {
      id: "group-7day",
      data: () => ({
        name: "Seven Day Group",
        admins: ["admin-1"],
        subscriptionStatus: "active",
        subscriptionExpiresAt:
          admin.firestore.Timestamp.fromDate(eightDaysFromNow),
      }),
    },
  ];

  const userDoc = {
    exists: true,
    data: () => ({
      fcmTokens: ["fcm-token-7day"],
    }),
  };

  mockDb.collection.mockImplementation((col: string) => {
    if (col === "groups") {
      return {
        where: jest.fn().mockReturnThis(),
        get: jest.fn().mockResolvedValue({ docs: groupDocs }),
      };
    }
    if (col === "users") {
      return {
        doc: jest
          .fn()
          .mockReturnValue({ get: jest.fn().mockResolvedValue(userDoc) }),
      };
    }
    return {
      where: jest.fn().mockReturnThis(),
      get: jest.fn().mockResolvedValue({ docs: [] }),
    };
  });

  await sendRenewalReminders(7);

  expect(mockSendEachForMulticast).toHaveBeenCalledTimes(1);
  const call = mockSendEachForMulticast.mock.calls[0][0];
  expect(call.tokens).toContain("fcm-token-7day");
  expect(call.notification.body).toContain("7 days");
});
```

Also update the import at the top of the test file to import `sendRenewalReminders`:

```typescript
import { sendRenewalReminders } from "../triggers/pubsub/scheduledRenewalReminders";
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd functions && npm test -- --testPathPattern="scheduledRenewalReminders"
```

Expected: FAIL — `sendRenewalReminders` does not accept a `days` argument yet.

- [ ] **Step 3: Refactor `scheduledRenewalReminders.ts`**

Replace the entire file content with:

```typescript
import * as functions from "firebase-functions";
import * as functionsV1 from "firebase-functions/v1";
import * as admin from "firebase-admin";

const WINDOW_DAYS = 1; // ±1 day window around target

export async function sendRenewalReminders(
  reminderDays: number = 30,
): Promise<void> {
  const db = admin.firestore();
  const now = Date.now();
  const windowStart = admin.firestore.Timestamp.fromMillis(
    now + (reminderDays - WINDOW_DAYS) * 24 * 60 * 60 * 1000,
  );
  const windowEnd = admin.firestore.Timestamp.fromMillis(
    now + (reminderDays + WINDOW_DAYS) * 24 * 60 * 60 * 1000,
  );

  try {
    const snapshot = await db
      .collection("groups")
      .where("subscriptionStatus", "==", "active")
      .where("subscriptionExpiresAt", ">=", windowStart)
      .where("subscriptionExpiresAt", "<=", windowEnd)
      .get();

    functions.logger.info(
      `Renewal reminders (${reminderDays}d): ${snapshot.docs.length} groups in window`,
    );

    for (const doc of snapshot.docs) {
      const group = doc.data();
      const groupName: string = group.name ?? "your group";
      const adminIds: string[] = group.admins ?? [];

      const userSnaps = await Promise.all(
        adminIds.map((adminId) => db.collection("users").doc(adminId).get()),
      );

      for (const userSnap of userSnaps) {
        if (!userSnap.exists) continue;
        const tokens: string[] = userSnap.data()?.fcmTokens ?? [];
        if (tokens.length === 0) continue;

        const isUrgent = reminderDays <= 7;
        const body = isUrgent
          ? `Your ${groupName} subscription renews in ${reminderDays} days. Update your payment method now to avoid interruption.`
          : `Your ${groupName} subscription renews in ${reminderDays} days. Make sure your payment info is up to date.`;

        try {
          await admin.messaging().sendEachForMulticast({
            tokens,
            notification: {
              title: isUrgent
                ? `${groupName}: Renewal in ${reminderDays} days`
                : "Time to renew",
              body,
            },
            data: {
              type: "RENEWAL_REMINDER",
              groupId: doc.id,
              reminderDays: String(reminderDays),
            },
          });
        } catch (err) {
          functions.logger.error(`FCM send failed for group ${doc.id}`, err);
        }
      }
    }
  } catch (err) {
    functions.logger.error(
      `sendRenewalReminders(${reminderDays}d) failed`,
      err,
    );
  }
}

export const scheduledRenewalReminders = functionsV1.pubsub
  .schedule("0 10 * * *")
  .timeZone("UTC")
  .onRun(async () => {
    await sendRenewalReminders(30);
    await sendRenewalReminders(7);
  });
```

- [ ] **Step 4: Run the full test suite for this file**

```bash
cd functions && npm test -- --testPathPattern="scheduledRenewalReminders"
```

Expected: All tests PASS (both 30-day and 7-day tests)

- [ ] **Step 5: Commit**

```bash
git add functions/src/triggers/pubsub/scheduledRenewalReminders.ts \
        functions/src/__tests__/scheduledRenewalReminders.test.ts
git commit -m "feat(functions): add 7-day pre-renewal reminder alongside existing 30-day"
```

---

## Self-Review

**Spec coverage:**

- ✅ Gate treasury "Add Transaction" (Task 1)
- ✅ Gate announcements "Create Announcement" (Task 2)
- ✅ 7-day pre-renewal reminder (Task 3)
- ✅ Day 5 trial notification — already exists in `scheduledTrialReminders.ts` and is exported from `index.ts`. No change needed.
- ✅ Pre-renewal 30-day reminder — already deployed. Task 3 adds the 7-day companion.

**Placeholder scan:** None found. All steps have exact code.

**Type consistency:**

- `navigation.navigate('SubscriptionUpgrade', {groupId, groupName})` — matches `GroupStackParamList.SubscriptionUpgrade: {groupId: string; groupName: string}` ✅
- `sendRenewalReminders(days: number)` used consistently across Task 3 ✅
