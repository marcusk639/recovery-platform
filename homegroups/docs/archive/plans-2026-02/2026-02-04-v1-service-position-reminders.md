---
archived: true
archived_at: 2026-05-25
archived_reason: Plan shipped; tracked DONE in docs/plans/README.md (with PR# or commit ref). Preserved for historical reference.
original_path: docs/plans/2026-02-04-v1-service-position-reminders.md
---

# Service Position Reminders Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Notify admins and position holders when service position terms are about to expire.

**Architecture:** Scheduled Cloud Function checks daily for expiring positions, sends push notifications at 30/7/1 day intervals.

**Tech Stack:** Firebase Cloud Functions, FCM, Firestore

**Priority:** V1.2
**Estimated Effort:** 4-6 hours
**Revenue Impact:** Retention - Groups depend on this for continuity

---

## Task 1: Add Term Dates to Service Position Schema

**Files:**
- Modify: `mobile/src/types/domain/service-position.ts`
- Modify: `mobile/src/types/schema.ts`

**Step 1: Update type definitions**

```typescript
export interface ServicePosition {
  id: string;
  name: string;
  description?: string;
  groupId: string;
  holderId?: string;
  holderName?: string;
  startDate?: Date;
  endDate?: Date;           // Term end date
  termLengthMonths?: number; // Standard term length (e.g., 6 months)
  remindersSent?: {
    thirtyDay?: boolean;
    sevenDay?: boolean;
    oneDay?: boolean;
  };
  createdAt: Date;
  updatedAt: Date;
}
```

**Step 2: Commit**

```bash
git add mobile/src/types/domain/service-position.ts mobile/src/types/schema.ts
git commit -m "feat(positions): add term dates to service position schema"
```

---

## Task 2: Update Position Assignment UI

**Files:**
- Modify: `mobile/src/screens/homegroup/AssignPositionScreen.tsx`

**Step 1: Add term length picker**

```typescript
const TERM_OPTIONS = [
  { label: '3 months', value: 3 },
  { label: '6 months', value: 6 },
  { label: '1 year', value: 12 },
  { label: '2 years', value: 24 },
  { label: 'No set term', value: null },
];

// Add state and UI for term selection
const [termLength, setTermLength] = useState<number | null>(6);
const [startDate, setStartDate] = useState(new Date());

// Calculate end date
const endDate = termLength
  ? new Date(startDate.getTime() + termLength * 30 * 24 * 60 * 60 * 1000)
  : null;
```

**Step 2: Pass term dates to assignment function**

```typescript
const handleAssign = async () => {
  await dispatch(assignServicePosition({
    positionId,
    holderId: selectedMember.id,
    holderName: selectedMember.displayName,
    startDate,
    endDate,
    termLengthMonths: termLength,
  }));
};
```

**Step 3: Commit**

```bash
git add mobile/src/screens/homegroup/AssignPositionScreen.tsx
git commit -m "feat(positions): add term length selection to assignment UI"
```

---

## Task 3: Create Position Expiry Reminder Function

**Files:**
- Create: `functions/src/triggers/pubsub/scheduledPositionReminders.ts`
- Modify: `functions/src/index.ts`

**Step 1: Create the scheduled function**

```typescript
import * as functions from 'firebase-functions';
import * as admin from 'firebase-admin';

const db = admin.firestore();
const messaging = admin.messaging();

export const scheduledPositionReminders = functions.pubsub
  .schedule('0 9 * * *') // 9 AM UTC daily
  .timeZone('UTC')
  .onRun(async (context) => {
    const now = new Date();
    const thirtyDays = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);
    const sevenDays = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
    const oneDay = new Date(now.getTime() + 1 * 24 * 60 * 60 * 1000);

    // Find positions expiring in each window
    await processExpiringPositions(thirtyDays, 'thirtyDay', 30);
    await processExpiringPositions(sevenDays, 'sevenDay', 7);
    await processExpiringPositions(oneDay, 'oneDay', 1);

    return null;
  });

async function processExpiringPositions(
  targetDate: Date,
  reminderKey: 'thirtyDay' | 'sevenDay' | 'oneDay',
  daysRemaining: number
) {
  const startOfDay = new Date(targetDate);
  startOfDay.setHours(0, 0, 0, 0);
  const endOfDay = new Date(targetDate);
  endOfDay.setHours(23, 59, 59, 999);

  // Query positions expiring on target date that haven't received this reminder
  const positionsSnapshot = await db
    .collectionGroup('servicePositions')
    .where('endDate', '>=', admin.firestore.Timestamp.fromDate(startOfDay))
    .where('endDate', '<=', admin.firestore.Timestamp.fromDate(endOfDay))
    .get();

  for (const doc of positionsSnapshot.docs) {
    const position = doc.data();

    // Skip if already sent this reminder
    if (position.remindersSent?.[reminderKey]) continue;

    // Skip if no holder
    if (!position.holderId) continue;

    const groupId = position.groupId;
    const groupDoc = await db.collection('groups').doc(groupId).get();
    const groupName = groupDoc.data()?.name || 'Your group';

    // Send to position holder
    await sendPositionReminder(
      position.holderId,
      position.name,
      groupName,
      daysRemaining,
      'holder'
    );

    // Send to group admins
    const admins = groupDoc.data()?.admins || [];
    for (const adminId of admins) {
      if (adminId !== position.holderId) {
        await sendPositionReminder(
          adminId,
          position.name,
          groupName,
          daysRemaining,
          'admin',
          position.holderName
        );
      }
    }

    // Mark reminder as sent
    await doc.ref.update({
      [`remindersSent.${reminderKey}`]: true,
    });
  }
}

async function sendPositionReminder(
  userId: string,
  positionName: string,
  groupName: string,
  daysRemaining: number,
  recipientType: 'holder' | 'admin',
  holderName?: string
) {
  const userDoc = await db.collection('users').doc(userId).get();
  if (!userDoc.exists) return;

  const userData = userDoc.data();
  if (!userData?.fcmTokens?.length) return;
  if (userData?.notificationSettings?.allowPushNotifications === false) return;

  const isUrgent = daysRemaining <= 7;

  let title: string;
  let body: string;

  if (recipientType === 'holder') {
    title = daysRemaining === 1
      ? `${positionName} term ends tomorrow`
      : `${positionName} term ends in ${daysRemaining} days`;
    body = `Your term as ${positionName} in ${groupName} is ending soon. Talk to your group about rotation.`;
  } else {
    title = `${positionName} position expiring`;
    body = daysRemaining === 1
      ? `${holderName}'s term ends tomorrow. Consider assigning a successor.`
      : `${holderName}'s term ends in ${daysRemaining} days. Plan for rotation.`;
  }

  const message: admin.messaging.MulticastMessage = {
    tokens: userData.fcmTokens,
    notification: { title, body },
    data: {
      type: 'position_expiry',
      daysRemaining: daysRemaining.toString(),
    },
    apns: {
      payload: {
        aps: {
          sound: 'default',
          ...(isUrgent && { 'interruption-level': 'time-sensitive' }),
        },
      },
    },
  };

  try {
    await messaging.sendEachForMulticast(message);
  } catch (error) {
    console.error('Failed to send position reminder:', error);
  }
}
```

**Step 2: Export from index**

```typescript
export { scheduledPositionReminders } from './triggers/pubsub/scheduledPositionReminders';
```

**Step 3: Commit**

```bash
git add functions/src/triggers/pubsub/scheduledPositionReminders.ts functions/src/index.ts
git commit -m "feat(positions): create scheduled position expiry reminders"
```

---

## Task 4: Add Position History View

**Files:**
- Create: `mobile/src/screens/homegroup/PositionHistoryScreen.tsx`

**Step 1: Create history screen** (abbreviated)

```typescript
// Show list of past holders for a position
// Query position document for history array or separate history collection
// Display: holder name, start date, end date, duration
```

**Step 2: Commit**

```bash
git add mobile/src/screens/homegroup/PositionHistoryScreen.tsx
git commit -m "feat(positions): add position history screen"
```

---

## Task 5: Deploy and Test

**Step 1: Deploy**

```bash
firebase deploy --only functions:scheduledPositionReminders
```

**Step 2: Manual test**

Create a position with endDate = tomorrow, manually trigger function, verify notification.

---

## Review Prompt

```
Review the service position reminders implementation:

1. TEST POSITION ASSIGNMENT:
   - Assign member to position with 6-month term
   - Verify endDate calculated correctly
   - Verify position displays term info

2. TEST REMINDERS (manual trigger):
   - Create position ending in 30 days
   - Run scheduledPositionReminders manually
   - Verify holder and admin receive notifications
   - Verify remindersSent.thirtyDay is true

3. TEST EDGE CASES:
   - Position with no endDate (no term) - should not trigger
   - Position with no holder - should not trigger
   - Already-sent reminders - should not duplicate

4. FIX ANY ISSUES before marking complete

Report: [PASS/FAIL] with details
```
