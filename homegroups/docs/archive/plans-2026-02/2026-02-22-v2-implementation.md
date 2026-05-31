---
archived: true
archived_at: 2026-05-25
archived_reason: Plan shipped; tracked DONE in docs/plans/README.md (with PR# or commit ref). Preserved for historical reference.
original_path: docs/plans/2026-02-22-v2-implementation.md
---

# V2 Implementation Plan: Retention & Stickiness

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Deliver the highest-impact V2 retention features — daily engagement hooks, treasury completion, meeting enhancements, and communication polish — building on the solid V1 foundation already shipped.

**Architecture:** Each feature extends existing Redux slices (chatSlice, meetingsSlice, transactionsSlice) and Cloud Functions patterns already established. No new third-party native SDKs are required beyond `react-native-calendars` for V2.2; all other work stays within the existing Firebase/Redux stack. Features are sequenced so each can be implemented and shipped independently.

**Tech Stack:** React Native (TypeScript), Firebase Cloud Functions v1 pubsub + callable, Firestore, FCM, Redux Toolkit entity adapters, `@react-native-firebase/*`, `react-native-calendars`, `@react-native-community/datetimepicker` (already used)

**Priority Order:** V2.3 (Communication Polish / Unread) → V2.1 (Treasury Completion) → V2.0 (Daily Engagement) → V2.2 (Meeting Enhancements)

**Reasoning for order:**
- V2.3 unread tracking is fully designed in `2026-02-04-mvp-p0-group-chat-unread.md` and the Redux hooks (`markChatAsRead`, `fetchUnreadCount`, `incrementUnreadCount`) are already in `chatSlice.ts` — only the UI badge and model method are missing.
- V2.1 treasury completion is low-risk, additive category changes with high treasurer satisfaction.
- V2.0 daily engagement hooks are new collections with no schema migration risk.
- V2.2 meeting enhancements require a new native library (`react-native-calendars`) and more complex scheduling logic.

**Estimated Total Effort:** 30–38 hours across 4 feature sections.

---

## Section 1: V2.3 — Communication Polish (Group Chat Unread Tracking)

**Effort:** 3–4 hours
**Why:** The Redux state (`unreadCounts`, `markChatAsRead`, `incrementUnreadCount`) and the plan already exist. Only the `ChatModel.markGroupChatAsRead` / `getUnreadCount` model methods and the UI badge are missing.

---

### Task 1.1: Add `markGroupChatAsRead` and `getUnreadCount` to ChatModel

**Files:**
- Modify: `mobile/src/models/ChatModel.ts`

**Step 1: Read the current ChatModel to find the right insertion point**

```bash
grep -n "static\|export" /Users/marcusklein/dev/RecoveryConnect/mobile/src/models/ChatModel.ts | head -40
```

Expected: See list of static methods. Find the last method before `export default`.

**Step 2: Add `markGroupChatAsRead` and `getUnreadCount` static methods**

At the end of the `ChatModel` class body (before the closing `}`), insert:

```typescript
/**
 * Mark group chat as read for current user.
 * Updates lastReadAt timestamp in group_chats/{groupId}.readStatus.{userId}
 */
static async markGroupChatAsRead(
  groupId: string,
  lastMessageId?: string,
): Promise<void> {
  const currentUser = auth().currentUser;
  if (!currentUser) return;

  const chatRef = firestore().collection('group_chats').doc(groupId);
  const now = firestore.Timestamp.now();

  await chatRef.set(
    {
      [`readStatus.${currentUser.uid}`]: {
        lastReadAt: now,
        ...(lastMessageId ? {lastReadMessageId: lastMessageId} : {}),
      },
      updatedAt: now,
    },
    {merge: true},
  );
}

/**
 * Count messages in group_chats/{groupId}/messages created after the user's lastReadAt.
 * Returns 0 if group_chats doc doesn't exist yet.
 */
static async getUnreadCount(
  groupId: string,
  userId: string,
): Promise<number> {
  const chatRef = firestore().collection('group_chats').doc(groupId);
  const chatDoc = await chatRef.get();
  if (!chatDoc.exists) return 0;

  const readStatus = chatDoc.data()?.readStatus?.[userId];

  if (!readStatus?.lastReadAt) {
    // Never read — count all messages
    const snap = await chatRef.collection('messages').count().get();
    return snap.data().count;
  }

  const unreadSnap = await chatRef
    .collection('messages')
    .where('sentAt', '>', readStatus.lastReadAt)
    .count()
    .get();
  return unreadSnap.data().count;
}
```

**Step 3: Verify TypeScript**

```bash
cd /Users/marcusklein/dev/RecoveryConnect/mobile && npx tsc --noEmit 2>&1 | head -20
```

Expected: No new errors.

**Step 4: Commit**

```bash
cd /Users/marcusklein/dev/RecoveryConnect && git add mobile/src/models/ChatModel.ts
git commit -m "feat(chat): add markGroupChatAsRead and getUnreadCount to ChatModel"
```

---

### Task 1.2: Update Firestore Rules for `group_chats` readStatus

**Files:**
- Modify: `firestore.rules`

**Step 1: Read current group_chats rule block**

```bash
grep -n "group_chats\|readStatus" /Users/marcusklein/dev/RecoveryConnect/firestore.rules | head -20
```

**Step 2: Add or update the `group_chats` rule to allow members to update their own readStatus**

Find the existing `match /group_chats/{groupId}` rule. Add an `allow update` branch that permits members to write only their `readStatus` key:

```
match /group_chats/{groupId} {
  allow read: if isGroupMember(groupId);
  allow create: if isGroupMember(groupId);
  allow update: if isGroupMember(groupId) && (
    request.resource.data.diff(resource.data).affectedKeys()
      .hasOnly(['readStatus', 'updatedAt', 'lastMessageAt', 'lastMessage'])
  );
  allow delete: if false;
}
```

**Step 3: Commit**

```bash
cd /Users/marcusklein/dev/RecoveryConnect && git add firestore.rules
git commit -m "feat(chat): update Firestore rules to allow readStatus writes by members"
```

---

### Task 1.3: Add `UnreadBadge` component and wire up to GroupChatScreen tab

**Files:**
- Verify: `mobile/src/components/chat/UnreadBadge.tsx` (already exists — check if it has the right exports)
- Modify: `mobile/src/navigation/GroupStackNavigator.tsx`

**Step 1: Check existing UnreadBadge**

```bash
cat /Users/marcusklein/dev/RecoveryConnect/mobile/src/components/chat/UnreadBadge.tsx
```

If it renders a badge but is not connected to Redux, we need a connected wrapper.

**Step 2: Create `UnreadBadgeConnected` inline in the navigator OR update the badge component**

Read `mobile/src/navigation/GroupStackNavigator.tsx` to find where `GroupChat` screen tab icon is rendered. In the header button or in the group overview tile, add:

```typescript
import {selectUnreadCount} from '../store/slices/chatSlice';
import {useAppSelector} from '../store';

// Connected badge for the chat navigation tile
const ChatUnreadBadge: React.FC<{groupId: string}> = ({groupId}) => {
  const count = useAppSelector(state => selectUnreadCount(state, groupId));
  if (count <= 0) return null;
  return (
    <View style={chatBadgeStyles.badge}>
      <Text style={chatBadgeStyles.badgeText}>
        {count > 99 ? '99+' : String(count)}
      </Text>
    </View>
  );
};

const chatBadgeStyles = StyleSheet.create({
  badge: {
    position: 'absolute',
    top: -4,
    right: -8,
    backgroundColor: '#E53935',
    borderRadius: 8,
    minWidth: 16,
    height: 16,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 3,
  },
  badgeText: {fontSize: 10, color: '#fff', fontWeight: '700'},
});
```

Find the navigation entry for GroupChat (it is a Stack.Screen in GroupStackNavigator). Find the `GroupOverviewScreen` or `GroupChatInfoScreen` where a "Chat" button is rendered, and wrap the icon with `ChatUnreadBadge`.

**Step 3: Mark chat as read on GroupChatScreen focus**

`GroupChatScreen.tsx` already calls `dispatch(markChatAsRead({groupId}))` in `useFocusEffect`. Confirm it also dispatches `fetchUnreadCount` after loading:

```bash
grep -n "fetchUnreadCount\|markChatAsRead" /Users/marcusklein/dev/RecoveryConnect/mobile/src/screens/homegroup/GroupChatScreen.tsx
```

If `fetchUnreadCount` is not called after messages load, add it to the `initChat` async block:

```typescript
await dispatch(fetchUnreadCount(groupId));
```

**Step 4: Fetch all unread counts on app start**

In `mobile/src/navigation/AppNavigator.tsx` or the top-level authenticated component, add:

```bash
grep -n "fetchAllUnreadCounts\|userGroups\|homeGroups" /Users/marcusklein/dev/RecoveryConnect/mobile/src/navigation/AppNavigator.tsx | head -10
```

If not present, add a `useEffect` after groups load:

```typescript
import {fetchAllUnreadCounts} from '../store/slices/chatSlice';
import {selectUserGroupIds} from '../store/slices/groupsSlice';

const groupIds = useAppSelector(selectUserGroupIds);
useEffect(() => {
  if (groupIds.length > 0) {
    dispatch(fetchAllUnreadCounts(groupIds));
  }
}, [groupIds.length]);
```

**Step 5: Verify TypeScript**

```bash
cd /Users/marcusklein/dev/RecoveryConnect/mobile && npx tsc --noEmit 2>&1 | head -20
```

**Step 6: Commit**

```bash
cd /Users/marcusklein/dev/RecoveryConnect && git add mobile/src/navigation/GroupStackNavigator.tsx mobile/src/screens/homegroup/GroupChatScreen.tsx mobile/src/navigation/AppNavigator.tsx
git commit -m "feat(chat): wire up group chat unread badge to Redux and ChatModel"
```

---

### Task 1.4: Typing Indicators in Group Chat

**Architecture:** Write to `group_chats/{groupId}` field `typing: { [userId]: { name: string, at: Timestamp } }`. Debounce writes on keystroke. Read from the doc via a Firestore listener in GroupChatScreen. Expire entries older than 6 seconds client-side.

**Files:**
- Modify: `mobile/src/screens/homegroup/GroupChatScreen.tsx`

**Step 1: Add Firestore typing state to GroupChatScreen**

Locate the `isTyping` local state (already exists at line 106). Replace the local-only isTyping with a Firestore-backed approach:

```typescript
const typingTimerRef = useRef<NodeJS.Timeout | null>(null);
const [otherTypers, setOtherTypers] = useState<string[]>([]); // names of other users typing

// Subscribe to typing field on the group_chats doc
useEffect(() => {
  if (!groupId || !currentUser) return;

  const chatRef = firestore().collection('group_chats').doc(groupId);
  const unsubscribe = chatRef.onSnapshot(snap => {
    if (!snap.exists) return;
    const typingMap: Record<string, {name: string; at: any}> =
      snap.data()?.typing || {};
    const now = Date.now();
    const active = Object.entries(typingMap)
      .filter(
        ([uid, val]) =>
          uid !== currentUser.uid &&
          now - val.at.toMillis() < 6000,
      )
      .map(([, val]) => val.name);
    setOtherTypers(active);
  });

  return () => unsubscribe();
}, [groupId, currentUser?.uid]);

// Call on every keystroke
const handleTyping = (text: string) => {
  setMessageText(text);

  if (!currentUser || !groupId) return;

  // Write typing indicator
  firestore()
    .collection('group_chats')
    .doc(groupId)
    .set(
      {
        typing: {
          [currentUser.uid]: {
            name: currentUser.displayName || 'Someone',
            at: firestore.Timestamp.now(),
          },
        },
      },
      {merge: true},
    )
    .catch(() => {}); // Ignore errors — non-critical

  // Clear after 5s of inactivity
  if (typingTimerRef.current) clearTimeout(typingTimerRef.current);
  typingTimerRef.current = setTimeout(() => {
    firestore()
      .collection('group_chats')
      .doc(groupId)
      .update({[`typing.${currentUser.uid}`]: firestore.FieldValue.delete()})
      .catch(() => {});
  }, 5000);
};

// Clear typing on send
const handleSend = async () => {
  if (typingTimerRef.current) clearTimeout(typingTimerRef.current);
  firestore()
    .collection('group_chats')
    .doc(groupId)
    .update({[`typing.${currentUser!.uid}`]: firestore.FieldValue.delete()})
    .catch(() => {});
  // ... existing send logic ...
};
```

**Step 2: Render typing indicator below messages**

Find where the message list ends and the `MessageInput` begins. Add above `MessageInput`:

```typescript
{otherTypers.length > 0 && (
  <View style={styles.typingIndicator}>
    <Text style={styles.typingText}>
      {otherTypers.length === 1
        ? `${otherTypers[0]} is typing...`
        : `${otherTypers.slice(0, 2).join(', ')} are typing...`}
    </Text>
  </View>
)}
```

Add styles:

```typescript
typingIndicator: {
  paddingHorizontal: 16,
  paddingVertical: 4,
},
typingText: {
  fontSize: 12,
  color: '#9E9E9E',
  fontStyle: 'italic',
},
```

**Step 3: Wire `handleTyping` to MessageInput**

The existing `MessageInput` already accepts `onChangeText`. Change the call from `setMessageText` directly to `handleTyping`:

```typescript
<MessageInput
  value={messageText}
  onChangeText={handleTyping}  // was: setMessageText
  onSend={handleSend}
  // ...
/>
```

**Step 4: Update Firestore rules to allow typing field writes**

The `group_chats` rule updated in Task 1.2 covers `updatedAt` only. Add `'typing'` to the allowed keys:

```
request.resource.data.diff(resource.data).affectedKeys()
  .hasOnly(['readStatus', 'updatedAt', 'lastMessageAt', 'lastMessage', 'typing'])
```

**Step 5: Verify TypeScript and commit**

```bash
cd /Users/marcusklein/dev/RecoveryConnect/mobile && npx tsc --noEmit 2>&1 | head -20
cd /Users/marcusklein/dev/RecoveryConnect && git add mobile/src/screens/homegroup/GroupChatScreen.tsx firestore.rules
git commit -m "feat(chat): add real-time typing indicators to group chat"
```

---

### Task 1.5: Thread Muting for DMs

**Architecture:** Add `mutedThreads: string[]` to `UserDocument`. When sending DM notifications, check if the recipient has muted the thread. Client-side filter in `ConversationsListScreen` shows a mute icon.

**Files:**
- Modify: `mobile/src/types/schema.ts` (add `mutedThreads` to `UserDocument`)
- Modify: `mobile/src/screens/messages/ConversationsListScreen.tsx`
- Modify: `mobile/src/screens/messages/DirectMessageScreen.tsx`
- Modify: `functions/src/triggers/firestore/onDirectMessageCreate.ts` (or wherever DM push is sent)

**Step 1: Add `mutedThreads` to UserDocument**

In `mobile/src/types/schema.ts`, find `UserDocument` interface and add:

```typescript
mutedThreads?: string[]; // Thread IDs the user has muted
```

**Step 2: Add mute toggle UI to DirectMessageScreen header**

Find the navigation header options in DirectMessageScreen. Add a "Mute" button that toggles the thread ID in the user's `mutedThreads` Firestore field:

```typescript
const [isMuted, setIsMuted] = useState(false);

// Load mute state on mount
useEffect(() => {
  if (!currentUser || !actualThreadId) return;
  firestore()
    .collection('users')
    .doc(currentUser.uid)
    .get()
    .then(doc => {
      const mutedThreads: string[] = doc.data()?.mutedThreads || [];
      setIsMuted(mutedThreads.includes(actualThreadId));
    })
    .catch(() => {});
}, [currentUser?.uid, actualThreadId]);

const handleToggleMute = async () => {
  if (!currentUser || !actualThreadId) return;
  const userRef = firestore().collection('users').doc(currentUser.uid);
  try {
    if (isMuted) {
      await userRef.update({
        mutedThreads: firestore.FieldValue.arrayRemove(actualThreadId),
      });
      setIsMuted(false);
    } else {
      await userRef.update({
        mutedThreads: firestore.FieldValue.arrayUnion(actualThreadId),
      });
      setIsMuted(true);
    }
  } catch {
    Alert.alert('Error', 'Failed to update mute settings.');
  }
};
```

In `navigation.setOptions` at the top of the component:

```typescript
useEffect(() => {
  navigation.setOptions({
    headerRight: () => (
      <TouchableOpacity onPress={handleToggleMute} style={{marginRight: 16}}>
        <Icon
          name={isMuted ? 'bell-off' : 'bell'}
          size={22}
          color={isMuted ? '#9E9E9E' : '#2196F3'}
        />
      </TouchableOpacity>
    ),
  });
}, [isMuted, handleToggleMute]);
```

**Step 3: Show mute icon in ConversationsListScreen**

In the conversation row render, add a muted indicator. Read the user's `mutedThreads` from Firestore once on screen load and pass it down:

```typescript
const [mutedThreads, setMutedThreads] = useState<string[]>([]);

useEffect(() => {
  const currentUser = auth().currentUser;
  if (!currentUser) return;
  firestore()
    .collection('users')
    .doc(currentUser.uid)
    .get()
    .then(doc => setMutedThreads(doc.data()?.mutedThreads || []))
    .catch(() => {});
}, []);

// In conversation row render:
{mutedThreads.includes(item.threadId) && (
  <Icon name="bell-off" size={14} color="#9E9E9E" style={{marginLeft: 4}} />
)}
```

**Step 4: Skip FCM notification for muted threads in Cloud Function**

Find the Cloud Function that sends DM push notifications (likely `onDirectMessageCreate.ts` or similar):

```bash
ls /Users/marcusklein/dev/RecoveryConnect/functions/src/triggers/firestore/ | grep -i message
```

In that function, before sending the push notification to a recipient, check if the thread is in their `mutedThreads`:

```typescript
const recipientDoc = await db.collection('users').doc(recipientId).get();
const mutedThreads: string[] = recipientDoc.data()?.mutedThreads || [];
if (mutedThreads.includes(threadId)) {
  functions.logger.info(`Thread ${threadId} is muted by ${recipientId}, skipping push`);
  continue;
}
```

**Step 5: Verify TypeScript and commit**

```bash
cd /Users/marcusklein/dev/RecoveryConnect/mobile && npx tsc --noEmit 2>&1 | head -20
cd /Users/marcusklein/dev/RecoveryConnect/functions && npm run build 2>&1 | tail -5
cd /Users/marcusklein/dev/RecoveryConnect && git add mobile/src/types/schema.ts mobile/src/screens/messages/DirectMessageScreen.tsx mobile/src/screens/messages/ConversationsListScreen.tsx
git commit -m "feat(chat): add DM thread muting — UI toggle and FCM suppression"
```

---

## Section 2: V2.1 — Treasury Completion

**Effort:** 8–10 hours
**Why first (within section):** Category additions are trivially low-risk. Recurring transactions are the highest-value treasury feature. Year-end summary leverages `FinancialReport` and `TreasuryModel.generateReport()` which already exist.

---

### Task 2.1: Add 12-Step Contribution Categories

**Files:**
- Modify: `mobile/src/types/domain/treasury.ts`
- Modify: `mobile/src/screens/homegroup/AddTransactionScreen.tsx`
- Modify: `mobile/src/components/treasury/EditTransactionModal.tsx`

**Step 1: Expand `ExpenseCategory` type**

In `mobile/src/types/domain/treasury.ts`, update `ExpenseCategory`:

```typescript
export type ExpenseCategory =
  | 'Rent'
  | 'Literature'
  | 'Refreshments'
  | 'Events'
  | 'Contributions to Service Bodies'
  | 'Area Contribution'        // NEW
  | 'Region Contribution'      // NEW
  | 'World Service'            // NEW
  | 'Supplies'
  | 'Printing'
  | 'Insurance'
  | 'Other Expenses';
```

**Step 2: Update `EXPENSE_CATEGORIES` arrays in AddTransactionScreen**

In `mobile/src/screens/homegroup/AddTransactionScreen.tsx`, update the `expenseCategories` array (around line 77):

```typescript
const expenseCategories: ExpenseCategory[] = [
  'Rent',
  'Literature',
  'Refreshments',
  'Events',
  'Contributions to Service Bodies',
  'Area Contribution',
  'Region Contribution',
  'World Service',
  'Supplies',
  'Printing',
  'Insurance',
  'Other Expenses',
];
```

**Step 3: Update `EXPENSE_CATEGORIES` in EditTransactionModal**

In `mobile/src/components/treasury/EditTransactionModal.tsx`, update `EXPENSE_CATEGORIES` (around line 44):

```typescript
const EXPENSE_CATEGORIES: ExpenseCategory[] = [
  'Rent',
  'Literature',
  'Refreshments',
  'Events',
  'Contributions to Service Bodies',
  'Area Contribution',
  'Region Contribution',
  'World Service',
  'Supplies',
  'Printing',
  'Insurance',
  'Other Expenses',
];
```

**Step 4: Update `expensesByCategory` type in FinancialReport**

In `mobile/src/types/domain/treasury.ts`, since `ExpenseCategory` now includes the new items, `expensesByCategory` automatically covers them (it's typed as `{[key in ExpenseCategory]?: number}`). No change needed.

**Step 5: Verify TypeScript**

```bash
cd /Users/marcusklein/dev/RecoveryConnect/mobile && npx tsc --noEmit 2>&1 | head -20
```

Expected: No errors.

**Step 6: Commit**

```bash
cd /Users/marcusklein/dev/RecoveryConnect && git add mobile/src/types/domain/treasury.ts mobile/src/screens/homegroup/AddTransactionScreen.tsx mobile/src/components/treasury/EditTransactionModal.tsx
git commit -m "feat(treasury): add Area/Region/World Service contribution categories"
```

---

### Task 2.2: Recurring Transactions — Schema and Cloud Function

**Architecture:** New top-level Firestore collection `recurring_transactions`. A daily scheduled Cloud Function (`scheduledRecurringTransactions`) runs at midnight UTC, finds records with `nextDate <= today` and `isActive === true`, creates the transaction document, and advances `nextDate`.

**Files:**
- Modify: `mobile/src/types/schema.ts`
- Create: `functions/src/triggers/pubsub/scheduledRecurringTransactions.ts`
- Modify: `functions/src/index.ts`

**Step 1: Add `RecurringTransactionDocument` to schema.ts**

In `mobile/src/types/schema.ts`, after `TransactionDocument` (around line 51):

```typescript
export type RecurrenceFrequency = 'weekly' | 'monthly' | 'quarterly' | 'yearly';

export interface RecurringTransactionDocument {
  id: string;
  groupId: string;
  type: 'income' | 'expense';
  amount: number;
  description: string;
  category: string;
  frequency: RecurrenceFrequency;
  nextDate: FirebaseFirestoreTypes.Timestamp; // Next date to generate on
  dayOfMonth?: number; // 1-28 for monthly/quarterly/yearly
  isActive: boolean;
  createdBy: string;
  createdAt: FirebaseFirestoreTypes.Timestamp;
  updatedAt: FirebaseFirestoreTypes.Timestamp;
}
```

Also add the collection path to `COLLECTION_PATHS`:

```typescript
RECURRING_TRANSACTIONS: 'recurring_transactions',
```

**Step 2: Create `scheduledRecurringTransactions.ts`**

```typescript
// functions/src/triggers/pubsub/scheduledRecurringTransactions.ts
import * as functionsV1 from 'firebase-functions/v1';
import * as functions from 'firebase-functions';
import * as admin from 'firebase-admin';
import {db} from '../../utils/firebase';

/**
 * Runs daily at 00:30 UTC.
 * Finds all active recurring transactions whose nextDate is today or earlier,
 * creates the actual transaction, and advances nextDate.
 */
export const scheduledRecurringTransactions = functionsV1.pubsub
  .schedule('30 0 * * *')
  .timeZone('UTC')
  .onRun(async () => {
    const now = admin.firestore.Timestamp.now();
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const todayTimestamp = admin.firestore.Timestamp.fromDate(today);

    const dueSnapshot = await db
      .collection('recurring_transactions')
      .where('isActive', '==', true)
      .where('nextDate', '<=', todayTimestamp)
      .get();

    if (dueSnapshot.empty) {
      functions.logger.info('No recurring transactions due today.');
      return null;
    }

    functions.logger.info(
      `Processing ${dueSnapshot.size} recurring transaction(s)`,
    );

    for (const doc of dueSnapshot.docs) {
      const data = doc.data();
      try {
        // Create the actual transaction
        const txRef = db
          .collection('groups')
          .doc(data.groupId)
          .collection('transactions')
          .doc();

        await txRef.set({
          id: txRef.id,
          groupId: data.groupId,
          type: data.type,
          amount: data.amount,
          description: `[Recurring] ${data.description}`,
          category: data.category,
          createdBy: data.createdBy,
          createdAt: now,
          updatedAt: now,
          recurringId: doc.id,
        });

        // Advance nextDate
        const nextDate = computeNextDate(
          data.nextDate.toDate(),
          data.frequency as string,
        );
        await doc.ref.update({
          nextDate: admin.firestore.Timestamp.fromDate(nextDate),
          updatedAt: now,
        });

        // Update treasury balance (same pattern as onTransactionWrite trigger)
        await updateTreasuryBalance(data.groupId, data.type, data.amount);

        functions.logger.info(
          `Created recurring transaction for group ${data.groupId}, next: ${nextDate.toISOString()}`,
        );
      } catch (error) {
        functions.logger.error(
          `Failed to process recurring transaction ${doc.id}:`,
          error,
        );
      }
    }

    return null;
  });

function computeNextDate(current: Date, frequency: string): Date {
  const next = new Date(current);
  switch (frequency) {
    case 'weekly':
      next.setDate(next.getDate() + 7);
      break;
    case 'monthly':
      next.setMonth(next.getMonth() + 1);
      break;
    case 'quarterly':
      next.setMonth(next.getMonth() + 3);
      break;
    case 'yearly':
      next.setFullYear(next.getFullYear() + 1);
      break;
  }
  return next;
}

async function updateTreasuryBalance(
  groupId: string,
  type: 'income' | 'expense',
  amount: number,
): Promise<void> {
  const treasuryRef = db
    .collection('groups')
    .doc(groupId)
    .collection('treasury')
    .doc('overview');

  await db.runTransaction(async tx => {
    const doc = await tx.get(treasuryRef);
    const existing = doc.exists ? doc.data()! : {balance: 0, monthlyIncome: 0, monthlyExpenses: 0};
    const delta = type === 'income' ? amount : -amount;
    const incomeUpdate = type === 'income' ? amount : 0;
    const expenseUpdate = type === 'expense' ? amount : 0;
    tx.set(
      treasuryRef,
      {
        balance: existing.balance + delta,
        monthlyIncome: existing.monthlyIncome + incomeUpdate,
        monthlyExpenses: existing.monthlyExpenses + expenseUpdate,
        lastUpdated: admin.firestore.FieldValue.serverTimestamp(),
        groupId,
      },
      {merge: true},
    );
  });
}
```

**Step 3: Add export to `functions/src/index.ts`**

Under the `// --- Pub/Sub Scheduled Functions ---` comment:

```typescript
export {scheduledRecurringTransactions} from './triggers/pubsub/scheduledRecurringTransactions';
```

**Step 4: Build and verify**

```bash
cd /Users/marcusklein/dev/RecoveryConnect/functions && npm run build 2>&1 | tail -5
```

Expected: Zero errors.

**Step 5: Commit**

```bash
cd /Users/marcusklein/dev/RecoveryConnect && git add mobile/src/types/schema.ts functions/src/triggers/pubsub/scheduledRecurringTransactions.ts functions/src/index.ts
git commit -m "feat(treasury): add scheduledRecurringTransactions Cloud Function and schema"
```

---

### Task 2.3: Recurring Transactions — Redux Slice and Domain Type

**Files:**
- Create: `mobile/src/types/domain/recurring-transaction.ts`
- Create: `mobile/src/store/slices/recurringTransactionsSlice.ts`
- Modify: `mobile/src/store/index.ts`

**Step 1: Create domain type**

```typescript
// mobile/src/types/domain/recurring-transaction.ts
export type RecurrenceFrequency = 'weekly' | 'monthly' | 'quarterly' | 'yearly';

export interface RecurringTransaction {
  id: string;
  groupId: string;
  type: 'income' | 'expense';
  amount: number;
  description: string;
  category: string;
  frequency: RecurrenceFrequency;
  nextDate: string; // ISO string
  dayOfMonth?: number;
  isActive: boolean;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
}
```

**Step 2: Create the Redux slice**

```typescript
// mobile/src/store/slices/recurringTransactionsSlice.ts
import {
  createSlice,
  createAsyncThunk,
  createEntityAdapter,
  createSelector,
} from '@reduxjs/toolkit';
import firestore from '@react-native-firebase/firestore';
import auth from '@react-native-firebase/auth';
import {RootState} from '../types';
import {RecurringTransaction, RecurrenceFrequency} from '../../types/domain/recurring-transaction';

const adapter = createEntityAdapter<RecurringTransaction>({
  sortComparer: (a, b) => a.nextDate.localeCompare(b.nextDate),
});

export interface RecurringTransactionsState {
  entities: ReturnType<typeof adapter.getInitialState>;
  groupIds: Record<string, string[]>;
  status: 'idle' | 'loading' | 'succeeded' | 'failed';
  error: string | null;
}

const initialState: RecurringTransactionsState = {
  entities: adapter.getInitialState(),
  groupIds: {},
  status: 'idle',
  error: null,
};

function docToRecurring(doc: any, id: string): RecurringTransaction {
  const d = doc;
  return {
    id,
    groupId: d.groupId,
    type: d.type,
    amount: d.amount,
    description: d.description,
    category: d.category,
    frequency: d.frequency as RecurrenceFrequency,
    nextDate: d.nextDate.toDate().toISOString(),
    dayOfMonth: d.dayOfMonth,
    isActive: d.isActive,
    createdBy: d.createdBy,
    createdAt: d.createdAt?.toDate().toISOString() ?? new Date().toISOString(),
    updatedAt: d.updatedAt?.toDate().toISOString() ?? new Date().toISOString(),
  };
}

export const fetchRecurringTransactions = createAsyncThunk(
  'recurringTransactions/fetch',
  async (groupId: string, {rejectWithValue}) => {
    try {
      const snap = await firestore()
        .collection('recurring_transactions')
        .where('groupId', '==', groupId)
        .orderBy('nextDate', 'asc')
        .get();
      const items = snap.docs.map(doc => docToRecurring(doc.data(), doc.id));
      return {groupId, items};
    } catch (error: any) {
      return rejectWithValue(error.message || 'Failed to fetch recurring transactions');
    }
  },
);

export const createRecurringTransaction = createAsyncThunk(
  'recurringTransactions/create',
  async (
    params: {
      groupId: string;
      type: 'income' | 'expense';
      amount: number;
      description: string;
      category: string;
      frequency: RecurrenceFrequency;
      startDate: Date;
    },
    {rejectWithValue},
  ) => {
    try {
      const currentUser = auth().currentUser;
      if (!currentUser) throw new Error('Not authenticated');

      const ref = firestore().collection('recurring_transactions').doc();
      const now = firestore.Timestamp.now();
      await ref.set({
        id: ref.id,
        groupId: params.groupId,
        type: params.type,
        amount: params.amount,
        description: params.description,
        category: params.category,
        frequency: params.frequency,
        nextDate: firestore.Timestamp.fromDate(params.startDate),
        isActive: true,
        createdBy: currentUser.uid,
        createdAt: now,
        updatedAt: now,
      });

      return docToRecurring(
        {
          ...params,
          nextDate: {toDate: () => params.startDate},
          isActive: true,
          createdAt: {toDate: () => new Date()},
          updatedAt: {toDate: () => new Date()},
        },
        ref.id,
      );
    } catch (error: any) {
      return rejectWithValue(error.message || 'Failed to create recurring transaction');
    }
  },
);

export const toggleRecurringActive = createAsyncThunk(
  'recurringTransactions/toggleActive',
  async ({id, isActive}: {id: string; isActive: boolean}, {rejectWithValue}) => {
    try {
      await firestore()
        .collection('recurring_transactions')
        .doc(id)
        .update({isActive, updatedAt: firestore.Timestamp.now()});
      return {id, isActive};
    } catch (error: any) {
      return rejectWithValue(error.message || 'Failed to update recurring transaction');
    }
  },
);

export const deleteRecurringTransaction = createAsyncThunk(
  'recurringTransactions/delete',
  async (id: string, {rejectWithValue}) => {
    try {
      await firestore().collection('recurring_transactions').doc(id).delete();
      return id;
    } catch (error: any) {
      return rejectWithValue(error.message || 'Failed to delete recurring transaction');
    }
  },
);

const recurringTransactionsSlice = createSlice({
  name: 'recurringTransactions',
  initialState,
  reducers: {},
  extraReducers: builder => {
    builder
      .addCase(fetchRecurringTransactions.pending, state => {
        state.status = 'loading';
        state.error = null;
      })
      .addCase(fetchRecurringTransactions.fulfilled, (state, action) => {
        state.status = 'succeeded';
        adapter.upsertMany(state.entities, action.payload.items);
        state.groupIds[action.payload.groupId] = action.payload.items.map(i => i.id);
      })
      .addCase(fetchRecurringTransactions.rejected, (state, action) => {
        state.status = 'failed';
        state.error = action.payload as string;
      })
      .addCase(createRecurringTransaction.fulfilled, (state, action) => {
        adapter.upsertOne(state.entities, action.payload);
        const g = action.payload.groupId;
        state.groupIds[g] = [...(state.groupIds[g] || []), action.payload.id];
      })
      .addCase(toggleRecurringActive.fulfilled, (state, action) => {
        adapter.updateOne(state.entities, {
          id: action.payload.id,
          changes: {isActive: action.payload.isActive},
        });
      })
      .addCase(deleteRecurringTransaction.fulfilled, (state, action) => {
        adapter.removeOne(state.entities, action.payload);
      });
  },
});

export default recurringTransactionsSlice.reducer;

const selectors = adapter.getSelectors(
  (state: RootState) => state.recurringTransactions.entities,
);

export const selectRecurringByGroup = createSelector(
  [
    (state: RootState) => state.recurringTransactions.groupIds,
    selectors.selectEntities,
    (_: RootState, groupId: string) => groupId,
  ],
  (groupIds, entities, groupId) =>
    (groupIds[groupId] || [])
      .map(id => entities[id])
      .filter((r): r is RecurringTransaction => r !== undefined),
);

export const selectRecurringStatus = (state: RootState) =>
  state.recurringTransactions.status;
```

**Step 3: Register in store**

In `mobile/src/store/index.ts`, add:

```typescript
import recurringTransactionsReducer from './slices/recurringTransactionsSlice';

// In combineReducers:
recurringTransactions: recurringTransactionsReducer,
```

**Step 4: Verify TypeScript**

```bash
cd /Users/marcusklein/dev/RecoveryConnect/mobile && npx tsc --noEmit 2>&1 | head -20
```

**Step 5: Commit**

```bash
cd /Users/marcusklein/dev/RecoveryConnect && git add mobile/src/types/domain/recurring-transaction.ts mobile/src/store/slices/recurringTransactionsSlice.ts mobile/src/store/index.ts
git commit -m "feat(treasury): add recurringTransactionsSlice with CRUD thunks"
```

---

### Task 2.4: Recurring Transactions — ManageRecurringScreen

**Files:**
- Create: `mobile/src/screens/homegroup/ManageRecurringScreen.tsx`
- Modify: `mobile/src/types/navigation/index.ts`
- Modify: `mobile/src/navigation/GroupStackNavigator.tsx`
- Modify: `mobile/src/screens/homegroup/GroupTreasuryScreen.tsx` (add navigation entry)

**Step 1: Create `ManageRecurringScreen.tsx`**

```typescript
// mobile/src/screens/homegroup/ManageRecurringScreen.tsx
import React, {useEffect, useState} from 'react';
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  StyleSheet,
  Alert,
  Modal,
  TextInput,
  Switch,
  ActivityIndicator,
  ScrollView,
} from 'react-native';
import {Picker} from '@react-native-picker/picker';
import {useRoute, RouteProp, useNavigation} from '@react-navigation/native';
import {StackNavigationProp} from '@react-navigation/stack';
import {GroupStackParamList} from '../../types/navigation';
import {useAppDispatch, useAppSelector} from '../../store';
import {
  fetchRecurringTransactions,
  createRecurringTransaction,
  toggleRecurringActive,
  deleteRecurringTransaction,
  selectRecurringByGroup,
  selectRecurringStatus,
} from '../../store/slices/recurringTransactionsSlice';
import {RecurrenceFrequency} from '../../types/domain/recurring-transaction';
import {IncomeCategory, ExpenseCategory} from '../../types/domain/treasury';

type RouteProps = RouteProp<GroupStackParamList, 'ManageRecurring'>;

const INCOME_CATEGORIES: IncomeCategory[] = [
  '7th Tradition', 'Literature Sales', 'Event Income',
  'Group Contributions', 'Other Income',
];
const EXPENSE_CATEGORIES: ExpenseCategory[] = [
  'Rent', 'Literature', 'Refreshments', 'Events',
  'Contributions to Service Bodies', 'Area Contribution',
  'Region Contribution', 'World Service',
  'Supplies', 'Printing', 'Insurance', 'Other Expenses',
];
const FREQUENCIES: {label: string; value: RecurrenceFrequency}[] = [
  {label: 'Weekly', value: 'weekly'},
  {label: 'Monthly', value: 'monthly'},
  {label: 'Quarterly', value: 'quarterly'},
  {label: 'Yearly', value: 'yearly'},
];

const ManageRecurringScreen: React.FC = () => {
  const route = useRoute<RouteProps>();
  const {groupId} = route.params;
  const dispatch = useAppDispatch();
  const items = useAppSelector(state => selectRecurringByGroup(state, groupId));
  const status = useAppSelector(selectRecurringStatus);

  const [modalVisible, setModalVisible] = useState(false);
  const [txType, setTxType] = useState<'income' | 'expense'>('expense');
  const [amount, setAmount] = useState('');
  const [description, setDescription] = useState('');
  const [category, setCategory] = useState<string>(EXPENSE_CATEGORIES[0]);
  const [frequency, setFrequency] = useState<RecurrenceFrequency>('monthly');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    dispatch(fetchRecurringTransactions(groupId));
  }, [dispatch, groupId]);

  const handleSave = async () => {
    const parsed = parseFloat(amount);
    if (!description.trim() || isNaN(parsed) || parsed <= 0) {
      Alert.alert('Error', 'Please fill in all fields with a valid amount.');
      return;
    }
    setSaving(true);
    try {
      await dispatch(
        createRecurringTransaction({
          groupId,
          type: txType,
          amount: parsed,
          description: description.trim(),
          category,
          frequency,
          startDate: new Date(),
        }),
      ).unwrap();
      setModalVisible(false);
      setAmount('');
      setDescription('');
    } catch (err: any) {
      Alert.alert('Error', err || 'Failed to create recurring transaction.');
    } finally {
      setSaving(false);
    }
  };

  const handleToggle = (id: string, isActive: boolean) => {
    dispatch(toggleRecurringActive({id, isActive: !isActive}));
  };

  const handleDelete = (id: string) => {
    Alert.alert('Delete', 'Stop this recurring transaction?', [
      {text: 'Cancel', style: 'cancel'},
      {
        text: 'Delete',
        style: 'destructive',
        onPress: () => dispatch(deleteRecurringTransaction(id)),
      },
    ]);
  };

  const renderItem = ({item}: any) => (
    <View style={styles.card}>
      <View style={styles.cardHeader}>
        <Text style={styles.cardTitle}>{item.description}</Text>
        <Switch
          value={item.isActive}
          onValueChange={() => handleToggle(item.id, item.isActive)}
        />
      </View>
      <Text style={styles.cardMeta}>
        {item.type === 'income' ? '+' : '-'}${item.amount.toFixed(2)} ·{' '}
        {item.category} · {item.frequency}
      </Text>
      <Text style={styles.cardNext}>
        Next: {new Date(item.nextDate).toLocaleDateString()}
      </Text>
      <TouchableOpacity
        style={styles.deleteBtn}
        onPress={() => handleDelete(item.id)}>
        <Text style={styles.deleteBtnText}>Delete</Text>
      </TouchableOpacity>
    </View>
  );

  return (
    <View style={styles.container}>
      <FlatList
        data={items}
        keyExtractor={item => item.id}
        renderItem={renderItem}
        ListEmptyComponent={
          status === 'loading' ? (
            <ActivityIndicator style={{marginTop: 40}} />
          ) : (
            <Text style={styles.empty}>No recurring transactions yet.</Text>
          )
        }
        contentContainerStyle={{padding: 16, flexGrow: 1}}
      />
      <TouchableOpacity
        style={styles.fab}
        onPress={() => setModalVisible(true)}>
        <Text style={styles.fabText}>+</Text>
      </TouchableOpacity>

      <Modal visible={modalVisible} animationType="slide" transparent>
        <View style={styles.modalOverlay}>
          <ScrollView style={styles.modalContent}>
            <Text style={styles.modalTitle}>New Recurring Transaction</Text>
            {/* Type selector */}
            <View style={styles.typeRow}>
              {(['income', 'expense'] as const).map(t => (
                <TouchableOpacity
                  key={t}
                  style={[styles.typeBtn, txType === t && styles.typeBtnActive]}
                  onPress={() => {
                    setTxType(t);
                    setCategory(t === 'income' ? INCOME_CATEGORIES[0] : EXPENSE_CATEGORIES[0]);
                  }}>
                  <Text style={[styles.typeBtnText, txType === t && styles.typeBtnTextActive]}>
                    {t.charAt(0).toUpperCase() + t.slice(1)}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
            <TextInput
              style={styles.input}
              placeholder="Amount"
              keyboardType="decimal-pad"
              value={amount}
              onChangeText={setAmount}
            />
            <TextInput
              style={styles.input}
              placeholder="Description (e.g. Meeting hall rent)"
              value={description}
              onChangeText={setDescription}
            />
            <Picker
              selectedValue={category}
              onValueChange={v => setCategory(v)}>
              {(txType === 'income' ? INCOME_CATEGORIES : EXPENSE_CATEGORIES).map(c => (
                <Picker.Item key={c} label={c} value={c} />
              ))}
            </Picker>
            <Picker
              selectedValue={frequency}
              onValueChange={v => setFrequency(v as RecurrenceFrequency)}>
              {FREQUENCIES.map(f => (
                <Picker.Item key={f.value} label={f.label} value={f.value} />
              ))}
            </Picker>
            <TouchableOpacity
              style={[styles.saveBtn, saving && {opacity: 0.6}]}
              onPress={handleSave}
              disabled={saving}>
              <Text style={styles.saveBtnText}>
                {saving ? 'Saving...' : 'Save'}
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.cancelBtn}
              onPress={() => setModalVisible(false)}>
              <Text style={styles.cancelBtnText}>Cancel</Text>
            </TouchableOpacity>
          </ScrollView>
        </View>
      </Modal>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {flex: 1, backgroundColor: '#F5F5F5'},
  card: {
    backgroundColor: '#fff', borderRadius: 8, padding: 14,
    marginBottom: 12, elevation: 2, shadowColor: '#000',
    shadowOffset: {width: 0, height: 1}, shadowOpacity: 0.1, shadowRadius: 2,
  },
  cardHeader: {flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center'},
  cardTitle: {fontSize: 15, fontWeight: '600', color: '#333', flex: 1},
  cardMeta: {fontSize: 13, color: '#666', marginTop: 4},
  cardNext: {fontSize: 12, color: '#888', marginTop: 2},
  deleteBtn: {marginTop: 8, alignSelf: 'flex-end'},
  deleteBtnText: {color: '#e74c3c', fontSize: 13},
  empty: {textAlign: 'center', color: '#999', marginTop: 60},
  fab: {
    position: 'absolute', bottom: 24, right: 24,
    backgroundColor: '#2196F3', width: 56, height: 56,
    borderRadius: 28, justifyContent: 'center', alignItems: 'center', elevation: 6,
  },
  fabText: {color: '#fff', fontSize: 28, lineHeight: 32},
  modalOverlay: {flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'flex-end'},
  modalContent: {backgroundColor: '#fff', borderTopLeftRadius: 16, borderTopRightRadius: 16, padding: 20, maxHeight: '85%'},
  modalTitle: {fontSize: 18, fontWeight: '700', marginBottom: 16, color: '#333'},
  typeRow: {flexDirection: 'row', marginBottom: 12, gap: 8},
  typeBtn: {flex: 1, paddingVertical: 10, borderRadius: 8, borderWidth: 1, borderColor: '#DDD', alignItems: 'center'},
  typeBtnActive: {backgroundColor: '#2196F3', borderColor: '#2196F3'},
  typeBtnText: {color: '#555'},
  typeBtnTextActive: {color: '#fff', fontWeight: '600'},
  input: {borderWidth: 1, borderColor: '#DDD', borderRadius: 8, padding: 10, marginBottom: 12, fontSize: 15},
  saveBtn: {backgroundColor: '#2196F3', borderRadius: 8, padding: 14, alignItems: 'center', marginTop: 8},
  saveBtnText: {color: '#fff', fontWeight: '700', fontSize: 16},
  cancelBtn: {marginTop: 10, padding: 12, alignItems: 'center'},
  cancelBtnText: {color: '#666'},
});

export default ManageRecurringScreen;
```

**Step 2: Add route to navigation types**

In `mobile/src/types/navigation/index.ts`, add:

```typescript
ManageRecurring: {groupId: string; groupName: string};
```

**Step 3: Register screen in GroupStackNavigator**

```typescript
import ManageRecurringScreen from '../screens/homegroup/ManageRecurringScreen';

// In the Stack.Navigator:
<Stack.Screen
  name="ManageRecurring"
  component={ManageRecurringScreen}
  options={({route}) => ({title: 'Recurring Transactions'})}
/>
```

**Step 4: Add navigation entry from GroupTreasuryScreen**

In `GroupTreasuryScreen.tsx`, find the treasurer-only action buttons area. Add:

```typescript
{isTreasurer && (
  <TouchableOpacity
    style={styles.manageRecurringBtn}
    onPress={() => navigation.navigate('ManageRecurring', {groupId, groupName})}>
    <Icon name="repeat" size={16} color="#2196F3" />
    <Text style={styles.manageRecurringBtnText}>Manage Recurring</Text>
  </TouchableOpacity>
)}
```

**Step 5: Add Firestore security rules for `recurring_transactions`**

In `firestore.rules`, after the `transactions` rules:

```
match /recurring_transactions/{recurringId} {
  allow read: if request.auth != null && (
    isGroupMember(resource.data.groupId) ||
    isGroupAdmin(resource.data.groupId)
  );
  // Only treasurer or admin can create/update/delete
  allow create: if request.auth != null && isGroupAdmin(request.resource.data.groupId);
  allow update, delete: if request.auth != null && isGroupAdmin(resource.data.groupId);
}
```

**Step 6: Verify TypeScript**

```bash
cd /Users/marcusklein/dev/RecoveryConnect/mobile && npx tsc --noEmit 2>&1 | head -20
```

**Step 7: Commit**

```bash
cd /Users/marcusklein/dev/RecoveryConnect && git add mobile/src/screens/homegroup/ManageRecurringScreen.tsx mobile/src/types/navigation/index.ts mobile/src/navigation/GroupStackNavigator.tsx mobile/src/screens/homegroup/GroupTreasuryScreen.tsx firestore.rules
git commit -m "feat(treasury): add ManageRecurringScreen and navigation"
```

---

### Task 2.5: Year-End Treasury Summary Screen

**Architecture:** Leverage the existing `TreasuryModel.generateReport()` and `FinancialReport` type. The new `YearEndSummaryScreen` lets the treasurer select a calendar year, generates the report in-app, and displays a shareable summary with totals by category. No PDF generation (scope reduction — share via text/screenshot).

**Files:**
- Create: `mobile/src/screens/homegroup/YearEndSummaryScreen.tsx`
- Modify: `mobile/src/types/navigation/index.ts`
- Modify: `mobile/src/navigation/GroupStackNavigator.tsx`
- Modify: `mobile/src/screens/homegroup/GroupTreasuryScreen.tsx`

**Step 1: Read TreasuryModel.generateReport to understand params**

```bash
grep -n "generateReport\|startDate\|endDate" /Users/marcusklein/dev/RecoveryConnect/mobile/src/models/TreasuryModel.ts | head -20
```

**Step 2: Create `YearEndSummaryScreen.tsx`**

```typescript
// mobile/src/screens/homegroup/YearEndSummaryScreen.tsx
import React, {useState} from 'react';
import {
  View, Text, ScrollView, TouchableOpacity, StyleSheet,
  ActivityIndicator, Alert, Share,
} from 'react-native';
import {useRoute, RouteProp} from '@react-navigation/native';
import {GroupStackParamList} from '../../types/navigation';
import {TreasuryModel} from '../../models/TreasuryModel';
import {FinancialReport} from '../../types/domain/treasury';

type RouteProps = RouteProp<GroupStackParamList, 'YearEndSummary'>;

const YearEndSummaryScreen: React.FC = () => {
  const route = useRoute<RouteProps>();
  const {groupId, groupName} = route.params;

  const currentYear = new Date().getFullYear();
  const [selectedYear, setSelectedYear] = useState(currentYear);
  const [report, setReport] = useState<FinancialReport | null>(null);
  const [loading, setLoading] = useState(false);

  const years = Array.from({length: 5}, (_, i) => currentYear - i);

  const generateReport = async () => {
    setLoading(true);
    try {
      const startDate = new Date(selectedYear, 0, 1); // Jan 1
      const endDate = new Date(selectedYear, 11, 31, 23, 59, 59); // Dec 31
      const generated = await TreasuryModel.generateReport(
        groupId, startDate, endDate,
      );
      setReport(generated as FinancialReport);
    } catch (error: any) {
      Alert.alert('Error', error.message || 'Failed to generate report.');
    } finally {
      setLoading(false);
    }
  };

  const handleShare = async () => {
    if (!report) return;
    const lines = [
      `${groupName} — ${selectedYear} Year-End Summary`,
      '',
      `Starting Balance:  $${report.startingBalance.toFixed(2)}`,
      `Total Income:      $${report.totalIncome.toFixed(2)}`,
      `Total Expenses:    $${report.totalExpenses.toFixed(2)}`,
      `Ending Balance:    $${report.endingBalance.toFixed(2)}`,
      `Prudent Reserve:   $${report.prudentReserve.toFixed(2)}`,
      '',
      '-- Income by Category --',
      ...Object.entries(report.incomeByCategory)
        .filter(([, v]) => v && v > 0)
        .map(([k, v]) => `  ${k}: $${(v as number).toFixed(2)}`),
      '',
      '-- Expenses by Category --',
      ...Object.entries(report.expensesByCategory)
        .filter(([, v]) => v && v > 0)
        .map(([k, v]) => `  ${k}: $${(v as number).toFixed(2)}`),
    ];
    await Share.share({message: lines.join('\n')});
  };

  return (
    <ScrollView style={styles.container} contentContainerStyle={{padding: 16}}>
      <Text style={styles.heading}>Year-End Summary</Text>

      {/* Year picker */}
      <View style={styles.yearRow}>
        {years.map(y => (
          <TouchableOpacity
            key={y}
            style={[styles.yearBtn, selectedYear === y && styles.yearBtnActive]}
            onPress={() => {setSelectedYear(y); setReport(null);}}>
            <Text style={[styles.yearBtnText, selectedYear === y && styles.yearBtnTextActive]}>
              {y}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      <TouchableOpacity
        style={[styles.generateBtn, loading && {opacity: 0.6}]}
        onPress={generateReport}
        disabled={loading}>
        <Text style={styles.generateBtnText}>
          {loading ? 'Generating...' : `Generate ${selectedYear} Report`}
        </Text>
      </TouchableOpacity>

      {loading && <ActivityIndicator style={{marginTop: 24}} />}

      {report && !loading && (
        <View style={styles.reportCard}>
          <Text style={styles.reportTitle}>{selectedYear} Financial Summary</Text>
          <View style={styles.summaryRow}>
            <Text style={styles.summaryLabel}>Starting Balance</Text>
            <Text style={styles.summaryValue}>${report.startingBalance.toFixed(2)}</Text>
          </View>
          <View style={styles.summaryRow}>
            <Text style={styles.summaryLabel}>Total Income</Text>
            <Text style={[styles.summaryValue, {color: '#27ae60'}]}>
              +${report.totalIncome.toFixed(2)}
            </Text>
          </View>
          <View style={styles.summaryRow}>
            <Text style={styles.summaryLabel}>Total Expenses</Text>
            <Text style={[styles.summaryValue, {color: '#e74c3c'}]}>
              -${report.totalExpenses.toFixed(2)}
            </Text>
          </View>
          <View style={[styles.summaryRow, styles.summaryRowBold]}>
            <Text style={styles.summaryLabelBold}>Ending Balance</Text>
            <Text style={styles.summaryValueBold}>${report.endingBalance.toFixed(2)}</Text>
          </View>
          <View style={styles.summaryRow}>
            <Text style={styles.summaryLabel}>Prudent Reserve</Text>
            <Text style={styles.summaryValue}>${report.prudentReserve.toFixed(2)}</Text>
          </View>

          <Text style={styles.sectionTitle}>Income by Category</Text>
          {Object.entries(report.incomeByCategory)
            .filter(([, v]) => v && (v as number) > 0)
            .map(([k, v]) => (
              <View key={k} style={styles.catRow}>
                <Text style={styles.catLabel}>{k}</Text>
                <Text style={styles.catValue}>${(v as number).toFixed(2)}</Text>
              </View>
            ))}

          <Text style={styles.sectionTitle}>Expenses by Category</Text>
          {Object.entries(report.expensesByCategory)
            .filter(([, v]) => v && (v as number) > 0)
            .map(([k, v]) => (
              <View key={k} style={styles.catRow}>
                <Text style={styles.catLabel}>{k}</Text>
                <Text style={[styles.catValue, {color: '#e74c3c'}]}>
                  ${(v as number).toFixed(2)}
                </Text>
              </View>
            ))}

          <TouchableOpacity style={styles.shareBtn} onPress={handleShare}>
            <Text style={styles.shareBtnText}>Share Summary</Text>
          </TouchableOpacity>
        </View>
      )}
    </ScrollView>
  );
};

const styles = StyleSheet.create({
  container: {flex: 1, backgroundColor: '#F5F5F5'},
  heading: {fontSize: 22, fontWeight: '700', color: '#333', marginBottom: 16},
  yearRow: {flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 16},
  yearBtn: {paddingHorizontal: 14, paddingVertical: 8, borderRadius: 20, borderWidth: 1, borderColor: '#DDD', backgroundColor: '#fff'},
  yearBtnActive: {backgroundColor: '#2196F3', borderColor: '#2196F3'},
  yearBtnText: {color: '#555'},
  yearBtnTextActive: {color: '#fff', fontWeight: '600'},
  generateBtn: {backgroundColor: '#2196F3', borderRadius: 8, padding: 14, alignItems: 'center', marginBottom: 16},
  generateBtnText: {color: '#fff', fontWeight: '700', fontSize: 16},
  reportCard: {backgroundColor: '#fff', borderRadius: 12, padding: 16, elevation: 2, shadowColor: '#000', shadowOffset: {width: 0, height: 1}, shadowOpacity: 0.1, shadowRadius: 2},
  reportTitle: {fontSize: 17, fontWeight: '700', color: '#333', marginBottom: 12},
  summaryRow: {flexDirection: 'row', justifyContent: 'space-between', marginBottom: 8},
  summaryRowBold: {borderTopWidth: 1, borderTopColor: '#EEE', paddingTop: 8, marginTop: 4},
  summaryLabel: {fontSize: 14, color: '#555'},
  summaryValue: {fontSize: 14, color: '#333', fontWeight: '500'},
  summaryLabelBold: {fontSize: 15, color: '#333', fontWeight: '700'},
  summaryValueBold: {fontSize: 15, color: '#333', fontWeight: '700'},
  sectionTitle: {fontSize: 15, fontWeight: '600', color: '#333', marginTop: 16, marginBottom: 8, borderBottomWidth: 1, borderBottomColor: '#EEE', paddingBottom: 4},
  catRow: {flexDirection: 'row', justifyContent: 'space-between', marginBottom: 6},
  catLabel: {fontSize: 13, color: '#555', flex: 1},
  catValue: {fontSize: 13, color: '#27ae60', fontWeight: '500'},
  shareBtn: {backgroundColor: '#34495e', borderRadius: 8, padding: 12, alignItems: 'center', marginTop: 16},
  shareBtnText: {color: '#fff', fontWeight: '600'},
});

export default YearEndSummaryScreen;
```

**Step 3: Add route to navigation types**

```typescript
YearEndSummary: {groupId: string; groupName: string};
```

**Step 4: Register screen in GroupStackNavigator**

```typescript
import YearEndSummaryScreen from '../screens/homegroup/YearEndSummaryScreen';

<Stack.Screen
  name="YearEndSummary"
  component={YearEndSummaryScreen}
  options={{title: 'Year-End Summary'}}
/>
```

**Step 5: Add navigation entry from GroupTreasuryScreen**

In `GroupTreasuryScreen.tsx`, next to the existing "Manage Recurring" button (treasurer only):

```typescript
<TouchableOpacity
  onPress={() => navigation.navigate('YearEndSummary', {groupId, groupName})}
  style={styles.yearEndBtn}>
  <Icon name="file-chart" size={16} color="#2196F3" />
  <Text style={styles.yearEndBtnText}>Year-End Summary</Text>
</TouchableOpacity>
```

**Step 6: Verify TypeScript and commit**

```bash
cd /Users/marcusklein/dev/RecoveryConnect/mobile && npx tsc --noEmit 2>&1 | head -20
cd /Users/marcusklein/dev/RecoveryConnect && git add mobile/src/screens/homegroup/YearEndSummaryScreen.tsx mobile/src/types/navigation/index.ts mobile/src/navigation/GroupStackNavigator.tsx mobile/src/screens/homegroup/GroupTreasuryScreen.tsx
git commit -m "feat(treasury): add YearEndSummaryScreen with category breakdown and share"
```

---

## Section 3: V2.0 — Daily Engagement Hooks

**Effort:** 10–12 hours
**Why:** No schema migration risk. New collections only. The sobriety date (`sobrietyStartDate`) is already on `UserDocument` so streak calculation is straightforward.

---

### Task 3.1: Gratitude Journal — Schema, Redux, and Screen

**Architecture:** New subcollection `users/{userId}/gratitudeEntries/{YYYY-MM-DD}`. Document stores up to 3 gratitudes. The screen shows today's entry form and a list of past entries.

**Files:**
- Modify: `mobile/src/types/schema.ts` (add `GratitudeEntryDocument`)
- Create: `mobile/src/store/slices/gratitudeSlice.ts`
- Modify: `mobile/src/store/index.ts`
- Create: `mobile/src/screens/profile/GratitudeJournalScreen.tsx`
- Modify: `mobile/src/types/navigation/index.ts` (ProfileStackParamList)
- Modify: `mobile/src/navigation/ProfileNavigator.tsx`

**Step 1: Add `GratitudeEntryDocument` to schema.ts**

After `UserDocument`:

```typescript
export interface GratitudeEntryDocument {
  date: string; // YYYY-MM-DD
  entries: string[]; // Up to 3 items
  createdAt: Timestamp;
  updatedAt: Timestamp;
}
```

Add to `COLLECTION_PATHS`:

```typescript
GRATITUDE_ENTRIES: (userId: string) => `users/${userId}/gratitudeEntries`,
```

**Step 2: Create `gratitudeSlice.ts`**

```typescript
// mobile/src/store/slices/gratitudeSlice.ts
import {createSlice, createAsyncThunk, createEntityAdapter} from '@reduxjs/toolkit';
import firestore from '@react-native-firebase/firestore';
import auth from '@react-native-firebase/auth';
import {RootState} from '../types';

export interface GratitudeEntry {
  id: string; // YYYY-MM-DD
  date: string;
  entries: string[];
  createdAt: string;
  updatedAt: string;
}

const adapter = createEntityAdapter<GratitudeEntry>({
  sortComparer: (a, b) => b.date.localeCompare(a.date),
});

interface GratitudeState {
  entities: ReturnType<typeof adapter.getInitialState>;
  status: 'idle' | 'loading' | 'succeeded' | 'failed';
  error: string | null;
}

const initialState: GratitudeState = {
  entities: adapter.getInitialState(),
  status: 'idle',
  error: null,
};

export const fetchGratitudeEntries = createAsyncThunk(
  'gratitude/fetchAll',
  async (_, {rejectWithValue}) => {
    try {
      const user = auth().currentUser;
      if (!user) throw new Error('Not authenticated');
      const snap = await firestore()
        .collection(`users/${user.uid}/gratitudeEntries`)
        .orderBy('date', 'desc')
        .limit(30)
        .get();
      return snap.docs.map(doc => ({
        id: doc.id,
        date: doc.data().date,
        entries: doc.data().entries || [],
        createdAt: doc.data().createdAt?.toDate().toISOString() ?? new Date().toISOString(),
        updatedAt: doc.data().updatedAt?.toDate().toISOString() ?? new Date().toISOString(),
      } as GratitudeEntry));
    } catch (error: any) {
      return rejectWithValue(error.message);
    }
  },
);

export const saveGratitudeEntry = createAsyncThunk(
  'gratitude/save',
  async ({date, entries}: {date: string; entries: string[]}, {rejectWithValue}) => {
    try {
      const user = auth().currentUser;
      if (!user) throw new Error('Not authenticated');
      const now = firestore.Timestamp.now();
      const docRef = firestore()
        .collection(`users/${user.uid}/gratitudeEntries`)
        .doc(date);
      await docRef.set({date, entries, updatedAt: now, createdAt: now}, {merge: true});
      return {id: date, date, entries, createdAt: now.toDate().toISOString(), updatedAt: now.toDate().toISOString()};
    } catch (error: any) {
      return rejectWithValue(error.message);
    }
  },
);

const gratitudeSlice = createSlice({
  name: 'gratitude',
  initialState,
  reducers: {},
  extraReducers: builder => {
    builder
      .addCase(fetchGratitudeEntries.pending, state => {state.status = 'loading';})
      .addCase(fetchGratitudeEntries.fulfilled, (state, action) => {
        state.status = 'succeeded';
        adapter.setAll(state.entities, action.payload);
      })
      .addCase(fetchGratitudeEntries.rejected, (state, action) => {
        state.status = 'failed';
        state.error = action.payload as string;
      })
      .addCase(saveGratitudeEntry.fulfilled, (state, action) => {
        adapter.upsertOne(state.entities, action.payload);
      });
  },
});

export default gratitudeSlice.reducer;

const selectors = adapter.getSelectors(
  (state: RootState) => state.gratitude.entities,
);
export const selectAllGratitudeEntries = selectors.selectAll;
export const selectTodayGratitude = (state: RootState) => {
  const today = new Date().toISOString().split('T')[0];
  return selectors.selectById(state, today);
};
export const selectGratitudeStatus = (state: RootState) => state.gratitude.status;
```

**Step 3: Register in store**

```typescript
import gratitudeReducer from './slices/gratitudeSlice';
// in combineReducers:
gratitude: gratitudeReducer,
```

**Step 4: Create `GratitudeJournalScreen.tsx`**

The screen shows 3 text inputs for today's gratitudes (pre-filled if entry exists) plus a scrollable history of past entries.

```typescript
// mobile/src/screens/profile/GratitudeJournalScreen.tsx
import React, {useEffect, useState} from 'react';
import {
  View, Text, TextInput, TouchableOpacity, FlatList,
  StyleSheet, ActivityIndicator, Alert, KeyboardAvoidingView, Platform,
} from 'react-native';
import {useAppDispatch, useAppSelector} from '../../store';
import {
  fetchGratitudeEntries, saveGratitudeEntry,
  selectAllGratitudeEntries, selectTodayGratitude, selectGratitudeStatus,
} from '../../store/slices/gratitudeSlice';

const GratitudeJournalScreen: React.FC = () => {
  const dispatch = useAppDispatch();
  const today = new Date().toISOString().split('T')[0];
  const todayEntry = useAppSelector(selectTodayGratitude);
  const allEntries = useAppSelector(selectAllGratitudeEntries);
  const status = useAppSelector(selectGratitudeStatus);

  const [gratitude1, setGratitude1] = useState('');
  const [gratitude2, setGratitude2] = useState('');
  const [gratitude3, setGratitude3] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    dispatch(fetchGratitudeEntries());
  }, [dispatch]);

  useEffect(() => {
    if (todayEntry) {
      setGratitude1(todayEntry.entries[0] || '');
      setGratitude2(todayEntry.entries[1] || '');
      setGratitude3(todayEntry.entries[2] || '');
    }
  }, [todayEntry]);

  const handleSave = async () => {
    const entries = [gratitude1, gratitude2, gratitude3].filter(e => e.trim());
    if (entries.length === 0) {
      Alert.alert('Error', 'Please enter at least one gratitude.');
      return;
    }
    setSaving(true);
    try {
      await dispatch(saveGratitudeEntry({date: today, entries})).unwrap();
      Alert.alert('Saved', 'Your gratitudes have been saved!');
    } catch (err: any) {
      Alert.alert('Error', err || 'Failed to save.');
    } finally {
      setSaving(false);
    }
  };

  const pastEntries = allEntries.filter(e => e.date !== today);

  return (
    <KeyboardAvoidingView style={{flex: 1}} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <FlatList
        data={pastEntries}
        keyExtractor={item => item.date}
        ListHeaderComponent={
          <View style={styles.header}>
            <Text style={styles.heading}>Today's Gratitudes</Text>
            <Text style={styles.dateLabel}>{new Date(today).toLocaleDateString('en-US', {weekday: 'long', month: 'long', day: 'numeric'})}</Text>
            {[
              [gratitude1, setGratitude1, 'I am grateful for...'],
              [gratitude2, setGratitude2, 'I appreciate...'],
              [gratitude3, setGratitude3, 'Something good today...'],
            ].map(([val, setter, placeholder], i) => (
              <TextInput
                key={i}
                style={styles.input}
                value={val as string}
                onChangeText={setter as (t: string) => void}
                placeholder={placeholder as string}
                multiline
                maxLength={200}
              />
            ))}
            <TouchableOpacity
              style={[styles.saveBtn, saving && {opacity: 0.6}]}
              onPress={handleSave}
              disabled={saving}>
              <Text style={styles.saveBtnText}>{saving ? 'Saving...' : 'Save Gratitudes'}</Text>
            </TouchableOpacity>
            {pastEntries.length > 0 && (
              <Text style={styles.pastHeading}>Past Entries</Text>
            )}
          </View>
        }
        renderItem={({item}) => (
          <View style={styles.pastCard}>
            <Text style={styles.pastDate}>{new Date(item.date + 'T12:00:00').toLocaleDateString('en-US', {weekday: 'short', month: 'short', day: 'numeric'})}</Text>
            {item.entries.map((e, i) => (
              <Text key={i} style={styles.pastEntry}>• {e}</Text>
            ))}
          </View>
        )}
        ListEmptyComponent={
          status === 'loading' ? <ActivityIndicator style={{marginTop: 20}} /> : null
        }
        contentContainerStyle={{padding: 16}}
      />
    </KeyboardAvoidingView>
  );
};

const styles = StyleSheet.create({
  header: {marginBottom: 8},
  heading: {fontSize: 22, fontWeight: '700', color: '#333', marginBottom: 4},
  dateLabel: {fontSize: 14, color: '#888', marginBottom: 16},
  input: {
    borderWidth: 1, borderColor: '#DDD', borderRadius: 8,
    padding: 12, marginBottom: 10, fontSize: 15, minHeight: 60,
    textAlignVertical: 'top', backgroundColor: '#fff',
  },
  saveBtn: {backgroundColor: '#2196F3', borderRadius: 8, padding: 14, alignItems: 'center', marginTop: 4},
  saveBtnText: {color: '#fff', fontWeight: '700', fontSize: 16},
  pastHeading: {fontSize: 17, fontWeight: '600', color: '#333', marginTop: 24, marginBottom: 12},
  pastCard: {backgroundColor: '#fff', borderRadius: 8, padding: 12, marginBottom: 10, elevation: 1, shadowColor: '#000', shadowOffset: {width: 0, height: 1}, shadowOpacity: 0.05, shadowRadius: 1},
  pastDate: {fontSize: 13, fontWeight: '600', color: '#555', marginBottom: 6},
  pastEntry: {fontSize: 14, color: '#333', marginBottom: 2},
});

export default GratitudeJournalScreen;
```

**Step 5: Add navigation route**

In `mobile/src/types/navigation/index.ts`, add to `ProfileStackParamList`:

```typescript
GratitudeJournal: undefined;
```

**Step 6: Register in ProfileNavigator**

```bash
grep -n "ProfileNavigator\|ProfileMain\|SobrietyTracker" /Users/marcusklein/dev/RecoveryConnect/mobile/src/navigation/ProfileNavigator.tsx | head -10
```

Add import and Stack.Screen for `GratitudeJournalScreen`.

**Step 7: Add entry point from ProfileMain screen**

```bash
grep -n "GratitudeJournal\|SobrietyTracker\|navigation.navigate" /Users/marcusklein/dev/RecoveryConnect/mobile/src/screens/profile/ProfileMainScreen.tsx | head -10
```

Add a "Gratitude Journal" row button that navigates to `GratitudeJournal`.

**Step 8: Add Firestore rules for gratitude entries**

```
match /users/{userId}/gratitudeEntries/{date} {
  allow read, write: if request.auth != null && request.auth.uid == userId;
}
```

**Step 9: Verify TypeScript and commit**

```bash
cd /Users/marcusklein/dev/RecoveryConnect/mobile && npx tsc --noEmit 2>&1 | head -20
cd /Users/marcusklein/dev/RecoveryConnect && git add mobile/src/types/schema.ts mobile/src/store/slices/gratitudeSlice.ts mobile/src/store/index.ts mobile/src/screens/profile/GratitudeJournalScreen.tsx mobile/src/types/navigation/index.ts mobile/src/navigation/ProfileNavigator.tsx firestore.rules
git commit -m "feat(engagement): add gratitude journal with daily entry form and history"
```

---

### Task 3.2: Daily Reflection Push Notification (Cloud Function)

**Architecture:** A scheduled Cloud Function at 9 AM UTC sends a push to all opted-in users. Content is a rotating set of recovery-themed reflections stored in a hardcoded array (no database needed for MVP). Users can opt out via `notificationSettings.dailyReflections`.

**Files:**
- Modify: `mobile/src/types/schema.ts` (add `dailyReflections` to `notificationSettings`)
- Create: `functions/src/triggers/pubsub/scheduledDailyReflection.ts`
- Modify: `functions/src/index.ts`

**Step 1: Add `dailyReflections` to `notificationSettings` in UserDocument**

In `mobile/src/types/schema.ts`, extend the `notificationSettings` field:

```typescript
notificationSettings?: {
  meetings?: boolean;
  announcements?: boolean;
  celebrations?: boolean;
  groupChatMentions?: boolean;
  allowPushNotifications?: boolean;
  dailyReflections?: boolean; // NEW — opt-in for daily reflection push
};
```

**Step 2: Create `scheduledDailyReflection.ts`**

```typescript
// functions/src/triggers/pubsub/scheduledDailyReflection.ts
import * as functionsV1 from 'firebase-functions/v1';
import * as functions from 'firebase-functions';
import {db, messaging} from '../../utils/firebase';

const REFLECTIONS = [
  {title: "One Day at a Time", body: "Recovery is a journey taken one day at a time. Today is all you need to focus on."},
  {title: "Progress, Not Perfection", body: "You don't have to be perfect. Progress toward recovery is what matters."},
  {title: "Gratitude Opens Doors", body: "Start today by naming three things you're grateful for. Gratitude shifts perspective."},
  {title: "You Are Not Alone", body: "Thousands of others are walking this road with you. Reach out to your group today."},
  {title: "Keep It Simple", body: "When life feels overwhelming, return to the basics. One breath. One moment. One step."},
  {title: "Service Heals", body: "Helping someone else today is one of the most powerful tools in recovery."},
  {title: "The Present Moment", body: "The past is behind you and the future isn't here yet. All you have is now — use it wisely."},
  {title: "Ask For Help", body: "Strength in recovery means knowing when to ask for help. Reach out to your sponsor today."},
  {title: "Your Story Matters", body: "Every day you stay in recovery, you write a new chapter. Your story inspires others."},
  {title: "Small Steps, Big Change", body: "Big changes happen through small daily actions. Keep showing up."},
  {title: "Surrender to Win", body: "Letting go of what you cannot control is freedom. Trust the process."},
  {title: "Honesty Heals", body: "Being honest with yourself and others is the foundation of lasting recovery."},
  {title: "Community Is Strength", body: "No one recovers alone. Lean into your community — they want to support you."},
  {title: "Celebrate Today", body: "Every sober day is a victory. Acknowledge how far you've come."},
];

/**
 * Runs daily at 09:00 UTC (adjustable).
 * Sends a daily reflection push to all opted-in users.
 */
export const scheduledDailyReflection = functionsV1.pubsub
  .schedule('0 9 * * *')
  .timeZone('UTC')
  .onRun(async () => {
    // Select reflection for today (index by day of year)
    const dayOfYear = Math.floor(
      (Date.now() - new Date(new Date().getFullYear(), 0, 0).getTime()) /
        86400000,
    );
    const reflection = REFLECTIONS[dayOfYear % REFLECTIONS.length];

    // Get all users who want daily reflections
    // Process in batches to avoid memory issues
    const usersSnap = await db
      .collection('users')
      .where('notificationSettings.allowPushNotifications', '!=', false)
      .get();

    const tokens: string[] = [];
    usersSnap.docs.forEach(doc => {
      const data = doc.data();
      // Only send if dailyReflections is not explicitly false
      const wantsReflections = data.notificationSettings?.dailyReflections !== false;
      if (wantsReflections && data.fcmTokens?.length) {
        tokens.push(...data.fcmTokens);
      }
    });

    if (tokens.length === 0) {
      functions.logger.info('No eligible recipients for daily reflection.');
      return null;
    }

    // Send in batches of 500 (FCM multicast limit)
    const batchSize = 500;
    for (let i = 0; i < tokens.length; i += batchSize) {
      const batch = tokens.slice(i, i + batchSize);
      await messaging.sendEachForMulticast({
        tokens: batch,
        notification: {
          title: reflection.title,
          body: reflection.body,
        },
        data: {
          type: 'daily_reflection',
        },
        android: {priority: 'normal'},
        apns: {payload: {aps: {sound: 'default'}}},
      });
    }

    functions.logger.info(
      `Daily reflection sent to ${tokens.length} tokens: "${reflection.title}"`,
    );
    return null;
  });
```

**Step 3: Export from `functions/src/index.ts`**

```typescript
export {scheduledDailyReflection} from './triggers/pubsub/scheduledDailyReflection';
```

**Step 4: Build and verify**

```bash
cd /Users/marcusklein/dev/RecoveryConnect/functions && npm run build 2>&1 | tail -5
```

**Step 5: Add notification settings toggle in the app**

In the existing notification settings screen, add a toggle for `dailyReflections`:

```bash
grep -rn "notificationSettings\|allowPushNotifications\|NotificationSettings" /Users/marcusklein/dev/RecoveryConnect/mobile/src/screens/profile/ | head -10
```

Find the screen and add a `Switch` row for "Daily Reflection":

```typescript
<View style={styles.settingRow}>
  <Text style={styles.settingLabel}>Daily Reflection (9 AM)</Text>
  <Switch
    value={notificationSettings?.dailyReflections !== false}
    onValueChange={val => updateSetting('dailyReflections', val)}
  />
</View>
```

**Step 6: Commit**

```bash
cd /Users/marcusklein/dev/RecoveryConnect && git add mobile/src/types/schema.ts functions/src/triggers/pubsub/scheduledDailyReflection.ts functions/src/index.ts
git commit -m "feat(engagement): add daily reflection push notification Cloud Function"
```

---

### Task 3.3: Check-in Streak Counter

**Architecture:** Track `currentStreak`, `longestStreak`, `lastCheckInDate` (YYYY-MM-DD) on the `UserDocument`. A callable Cloud Function `recordCheckIn` validates that the user hasn't already checked in today, updates the streak, and returns updated values. The `ProfileMainScreen` displays the streak prominently.

**Files:**
- Modify: `mobile/src/types/schema.ts` (add streak fields to `UserDocument`)
- Create: `functions/src/callable/recordCheckIn.ts`
- Modify: `functions/src/index.ts`
- Modify: `mobile/src/screens/profile/ProfileMainScreen.tsx` (add streak display and check-in button)

**Step 1: Add streak fields to UserDocument**

```typescript
// In UserDocument interface:
checkInStreak?: {
  currentStreak: number;
  longestStreak: number;
  lastCheckInDate: string; // YYYY-MM-DD
};
```

**Step 2: Create `recordCheckIn.ts` callable function**

```typescript
// functions/src/callable/recordCheckIn.ts
import * as functions from 'firebase-functions';
import {HttpsError} from 'firebase-functions/v1/https';
import {CallableRequest} from 'firebase-functions/v2/https';
import * as admin from 'firebase-admin';
import {db} from '../utils/firebase';

interface CheckInResult {
  currentStreak: number;
  longestStreak: number;
  lastCheckInDate: string;
  isNewDay: boolean;
}

export const recordCheckIn = functions.https.onCall(
  async (request: CallableRequest): Promise<CheckInResult> => {
    if (!request.auth) {
      throw new HttpsError('unauthenticated', 'Must be authenticated.');
    }

    const userId = request.auth.uid;
    const today = new Date().toISOString().split('T')[0]; // YYYY-MM-DD in UTC

    const userRef = db.collection('users').doc(userId);
    const userDoc = await userRef.get();
    if (!userDoc.exists) {
      throw new HttpsError('not-found', 'User not found.');
    }

    const existing = userDoc.data()!.checkInStreak || {
      currentStreak: 0,
      longestStreak: 0,
      lastCheckInDate: '',
    };

    if (existing.lastCheckInDate === today) {
      // Already checked in today — return current values
      return {...existing, isNewDay: false};
    }

    // Check if yesterday
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    const yesterdayStr = yesterday.toISOString().split('T')[0];

    let newStreak = 1;
    if (existing.lastCheckInDate === yesterdayStr) {
      newStreak = existing.currentStreak + 1;
    }

    const newLongest = Math.max(existing.longestStreak, newStreak);

    const updated = {
      currentStreak: newStreak,
      longestStreak: newLongest,
      lastCheckInDate: today,
    };

    await userRef.update({
      checkInStreak: updated,
      lastActivityAt: admin.firestore.FieldValue.serverTimestamp(),
    });

    return {...updated, isNewDay: true};
  },
);
```

**Step 3: Export from index.ts**

```typescript
export {recordCheckIn} from './callable/recordCheckIn';
```

**Step 4: Build and verify**

```bash
cd /Users/marcusklein/dev/RecoveryConnect/functions && npm run build 2>&1 | tail -5
```

**Step 5: Add streak display to ProfileMainScreen**

```bash
grep -n "sobrietyDate\|SobrietyTracker\|ProfileMainScreen\|currentStreak" /Users/marcusklein/dev/RecoveryConnect/mobile/src/screens/profile/ProfileMainScreen.tsx | head -10
```

Add a `StreakCard` component inline:

```typescript
const [streakData, setStreakData] = useState<{currentStreak: number; longestStreak: number; lastCheckInDate: string} | null>(null);
const [checkingIn, setCheckingIn] = useState(false);

useEffect(() => {
  // Load streak from user document
  const currentUser = auth().currentUser;
  if (!currentUser) return;
  firestore().collection('users').doc(currentUser.uid).get().then(doc => {
    if (doc.data()?.checkInStreak) setStreakData(doc.data()!.checkInStreak);
  }).catch(() => {});
}, []);

const handleCheckIn = async () => {
  setCheckingIn(true);
  try {
    const fn = functions().httpsCallable('recordCheckIn');
    const result = await fn({});
    const data = result.data as any;
    setStreakData({
      currentStreak: data.currentStreak,
      longestStreak: data.longestStreak,
      lastCheckInDate: data.lastCheckInDate,
    });
    if (data.isNewDay) {
      Alert.alert(
        `Day ${data.currentStreak}!`,
        data.currentStreak > 1
          ? `You're on a ${data.currentStreak}-day streak!`
          : 'Great start! Keep showing up.',
      );
    } else {
      Alert.alert('Already checked in', 'You\'ve already checked in today. See you tomorrow!');
    }
  } catch (err: any) {
    Alert.alert('Error', err.message || 'Failed to record check-in.');
  } finally {
    setCheckingIn(false);
  }
};

// In the JSX, add before the menu items:
<View style={styles.streakCard}>
  <View style={styles.streakNumbers}>
    <View style={styles.streakItem}>
      <Text style={styles.streakNum}>{streakData?.currentStreak ?? 0}</Text>
      <Text style={styles.streakLabel}>Day Streak</Text>
    </View>
    <View style={styles.streakDivider} />
    <View style={styles.streakItem}>
      <Text style={styles.streakNum}>{streakData?.longestStreak ?? 0}</Text>
      <Text style={styles.streakLabel}>Longest</Text>
    </View>
  </View>
  <TouchableOpacity
    style={[styles.checkInBtn, checkingIn && {opacity: 0.6}]}
    onPress={handleCheckIn}
    disabled={checkingIn}>
    <Text style={styles.checkInBtnText}>
      {checkingIn ? 'Checking in...' : 'Check In Today'}
    </Text>
  </TouchableOpacity>
</View>
```

**Step 6: Commit**

```bash
cd /Users/marcusklein/dev/RecoveryConnect && git add mobile/src/types/schema.ts functions/src/callable/recordCheckIn.ts functions/src/index.ts mobile/src/screens/profile/ProfileMainScreen.tsx
git commit -m "feat(engagement): add check-in streak counter with recordCheckIn Cloud Function"
```

---

## Section 4: V2.2 — Meeting Enhancements

**Effort:** 8–10 hours
**Note:** Requires installing `react-native-calendars`. Meeting reminders require a new scheduled Cloud Function. Attendance check-in adds to `MeetingInstanceDocument`.

---

### Task 4.1: Install `react-native-calendars` and Add Calendar View

**Files:**
- Modify: `mobile/package.json` (via npm install)
- Create: `mobile/src/screens/homegroup/GroupCalendarScreen.tsx`
- Modify: `mobile/src/types/navigation/index.ts`
- Modify: `mobile/src/navigation/GroupStackNavigator.tsx`
- Modify: `mobile/src/screens/homegroup/GroupScheduleScreen.tsx`

**Step 1: Install library**

```bash
cd /Users/marcusklein/dev/RecoveryConnect/mobile && npm install react-native-calendars
```

Expected: Package added to `package.json` and `node_modules`.

**Step 2: Create `GroupCalendarScreen.tsx`**

```typescript
// mobile/src/screens/homegroup/GroupCalendarScreen.tsx
import React, {useEffect, useState, useMemo} from 'react';
import {View, Text, FlatList, StyleSheet, TouchableOpacity, ActivityIndicator} from 'react-native';
import {Calendar, DateData} from 'react-native-calendars';
import {useRoute, RouteProp, useNavigation} from '@react-navigation/native';
import {StackNavigationProp} from '@react-navigation/stack';
import {GroupStackParamList} from '../../types/navigation';
import {useAppDispatch, useAppSelector} from '../../store';
import {
  fetchUpcomingMeetingInstances,
  selectAllMeetingInstances,
} from '../../store/slices/meetingsSlice';
import {MeetingInstance} from '../../types';

type RouteProps = RouteProp<GroupStackParamList, 'GroupCalendar'>;

const GroupCalendarScreen: React.FC = () => {
  const route = useRoute<RouteProps>();
  const {groupId} = route.params;
  const dispatch = useAppDispatch();
  const instances = useAppSelector(selectAllMeetingInstances);

  const [selectedDate, setSelectedDate] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    dispatch(fetchUpcomingMeetingInstances({groupId, weeksAhead: 8}))
      .finally(() => setLoading(false));
  }, [dispatch, groupId]);

  // Build markedDates map for the calendar
  const markedDates = useMemo(() => {
    const result: Record<string, any> = {};
    instances
      .filter(i => i.groupId === groupId && !i.isCancelled)
      .forEach(i => {
        const dateStr = new Date(
          typeof i.scheduledAt === 'number' ? i.scheduledAt : (i.scheduledAt as any).toDate?.() ?? i.scheduledAt,
        )
          .toISOString()
          .split('T')[0];
        if (!result[dateStr]) {
          result[dateStr] = {dots: [], marked: true};
        }
        result[dateStr].dots.push({color: '#2196F3'});
      });
    if (selectedDate) {
      result[selectedDate] = {
        ...result[selectedDate],
        selected: true,
        selectedColor: '#2196F3',
      };
    }
    return result;
  }, [instances, groupId, selectedDate]);

  const selectedInstances = useMemo(() => {
    if (!selectedDate) return [];
    return instances.filter(i => {
      const dateStr = new Date(
        typeof i.scheduledAt === 'number' ? i.scheduledAt : (i.scheduledAt as any).toDate?.() ?? i.scheduledAt,
      )
        .toISOString()
        .split('T')[0];
      return dateStr === selectedDate && i.groupId === groupId;
    });
  }, [selectedDate, instances, groupId]);

  if (loading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <Calendar
        markingType="multi-dot"
        markedDates={markedDates}
        onDayPress={(day: DateData) => setSelectedDate(day.dateString)}
        theme={{
          todayTextColor: '#2196F3',
          selectedDayBackgroundColor: '#2196F3',
          dotColor: '#2196F3',
        }}
      />
      {selectedDate ? (
        selectedInstances.length > 0 ? (
          <FlatList
            data={selectedInstances}
            keyExtractor={item => item.id}
            renderItem={({item}) => (
              <View style={styles.meetingCard}>
                <Text style={styles.meetingName}>{item.name}</Text>
                <Text style={styles.meetingTime}>
                  {new Date(
                    typeof item.scheduledAt === 'number' ? item.scheduledAt : (item.scheduledAt as any).toDate?.() ?? item.scheduledAt,
                  ).toLocaleTimeString([], {hour: '2-digit', minute: '2-digit'})}
                </Text>
                {item.isCancelled && (
                  <Text style={styles.cancelled}>Cancelled</Text>
                )}
              </View>
            )}
            contentContainerStyle={{padding: 16}}
          />
        ) : (
          <Text style={styles.noMeetings}>No meetings on {selectedDate}</Text>
        )
      ) : (
        <Text style={styles.noMeetings}>Tap a day to see meetings</Text>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {flex: 1, backgroundColor: '#fff'},
  centered: {flex: 1, justifyContent: 'center', alignItems: 'center'},
  meetingCard: {backgroundColor: '#F5F5F5', borderRadius: 8, padding: 12, marginBottom: 8},
  meetingName: {fontSize: 15, fontWeight: '600', color: '#333'},
  meetingTime: {fontSize: 13, color: '#555', marginTop: 2},
  cancelled: {color: '#e74c3c', fontSize: 12, marginTop: 2},
  noMeetings: {textAlign: 'center', color: '#999', marginTop: 32, fontSize: 14},
});

export default GroupCalendarScreen;
```

**Step 3: Add navigation route**

```typescript
GroupCalendar: {groupId: string; groupName: string};
```

**Step 4: Register in GroupStackNavigator**

```typescript
import GroupCalendarScreen from '../screens/homegroup/GroupCalendarScreen';

<Stack.Screen
  name="GroupCalendar"
  component={GroupCalendarScreen}
  options={({route}) => ({title: `${route.params.groupName} Calendar`})}
/>
```

**Step 5: Add "Calendar View" button to GroupScheduleScreen header**

In `GroupScheduleScreen.tsx`, add a header right button:

```typescript
useEffect(() => {
  navigation.setOptions({
    headerRight: () => (
      <TouchableOpacity
        onPress={() => navigation.navigate('GroupCalendar', {groupId, groupName})}
        style={{marginRight: 16}}>
        <Icon name="calendar-month" size={22} color="#2196F3" />
      </TouchableOpacity>
    ),
  });
}, [navigation, groupId, groupName]);
```

**Step 6: Verify TypeScript and commit**

```bash
cd /Users/marcusklein/dev/RecoveryConnect/mobile && npx tsc --noEmit 2>&1 | head -20
cd /Users/marcusklein/dev/RecoveryConnect && git add mobile/src/screens/homegroup/GroupCalendarScreen.tsx mobile/src/types/navigation/index.ts mobile/src/navigation/GroupStackNavigator.tsx mobile/src/screens/homegroup/GroupScheduleScreen.tsx mobile/package.json mobile/package-lock.json
git commit -m "feat(meetings): add GroupCalendarScreen with react-native-calendars"
```

---

### Task 4.2: Meeting Reminders Cloud Function

**Architecture:** A scheduled Cloud Function (`scheduledMeetingReminders`) runs hourly. It queries `meetingInstances` for instances starting in the next 60–65 minutes. For each, it finds the group members who have favorited that meeting (via `users.favoriteMeetings` array) and sends a push notification.

**Files:**
- Create: `functions/src/triggers/pubsub/scheduledMeetingReminders.ts`
- Modify: `functions/src/index.ts`

**Step 1: Create `scheduledMeetingReminders.ts`**

```typescript
// functions/src/triggers/pubsub/scheduledMeetingReminders.ts
import * as functionsV1 from 'firebase-functions/v1';
import * as functions from 'firebase-functions';
import * as admin from 'firebase-admin';
import {db, messaging} from '../../utils/firebase';

/**
 * Runs every hour. Finds meeting instances starting in ~60 minutes
 * and sends reminders to members who have favorited that meeting.
 */
export const scheduledMeetingReminders = functionsV1.pubsub
  .schedule('5 * * * *') // 5 minutes past every hour
  .timeZone('UTC')
  .onRun(async () => {
    const now = new Date();
    const windowStart = new Date(now.getTime() + 55 * 60 * 1000); // 55 min from now
    const windowEnd = new Date(now.getTime() + 70 * 60 * 1000);   // 70 min from now

    const instancesSnap = await db
      .collectionGroup('meetingInstances')
      .where('scheduledAt', '>=', admin.firestore.Timestamp.fromDate(windowStart))
      .where('scheduledAt', '<=', admin.firestore.Timestamp.fromDate(windowEnd))
      .where('isCancelled', '==', false)
      .get();

    if (instancesSnap.empty) {
      functions.logger.info('No meeting instances due for reminders.');
      return null;
    }

    functions.logger.info(`Sending reminders for ${instancesSnap.size} meeting instance(s)`);

    for (const doc of instancesSnap.docs) {
      const instance = doc.data();
      const groupId = instance.groupId as string;
      const meetingId = instance.meetingId as string;
      const meetingName = instance.name as string;

      try {
        // Find all members in this group
        const membersSnap = await db
          .collection('members')
          .where('groupId', '==', groupId)
          .get();

        const memberUserIds = membersSnap.docs
          .map(m => m.data().userId as string)
          .filter(Boolean);

        const tokens: string[] = [];

        // Batch-check user docs for favorite + FCM tokens
        for (let i = 0; i < memberUserIds.length; i += 10) {
          const batch = memberUserIds.slice(i, i + 10);
          const usersSnap = await db
            .collection('users')
            .where('__name__', 'in', batch)
            .get();

          usersSnap.docs.forEach(userDoc => {
            const userData = userDoc.data();
            const hasFavorited = (userData.favoriteMeetings as string[] || []).includes(meetingId);
            const meetingsEnabled = userData.notificationSettings?.meetings !== false;
            const pushEnabled = userData.notificationSettings?.allowPushNotifications !== false;

            if (hasFavorited && meetingsEnabled && pushEnabled && userData.fcmTokens?.length) {
              tokens.push(...userData.fcmTokens);
            }
          });
        }

        if (tokens.length === 0) continue;

        const scheduledTime = (instance.scheduledAt as admin.firestore.Timestamp)
          .toDate()
          .toLocaleTimeString([], {hour: '2-digit', minute: '2-digit'});

        await messaging.sendEachForMulticast({
          tokens,
          notification: {
            title: `Meeting Starting Soon`,
            body: `${meetingName} starts at ${scheduledTime}`,
          },
          data: {
            type: 'meeting_reminder',
            groupId,
            meetingId,
          },
          android: {priority: 'high'},
          apns: {payload: {aps: {sound: 'default', badge: 1}}},
        });

        functions.logger.info(
          `Sent meeting reminder for "${meetingName}" to ${tokens.length} token(s)`,
        );
      } catch (error) {
        functions.logger.error(`Failed to send reminder for meeting ${meetingId}:`, error);
      }
    }

    return null;
  });
```

**Step 2: Export from index.ts**

```typescript
export {scheduledMeetingReminders} from './triggers/pubsub/scheduledMeetingReminders';
```

**Step 3: Build and verify**

```bash
cd /Users/marcusklein/dev/RecoveryConnect/functions && npm run build 2>&1 | tail -5
```

**Step 4: Commit**

```bash
cd /Users/marcusklein/dev/RecoveryConnect && git add functions/src/triggers/pubsub/scheduledMeetingReminders.ts functions/src/index.ts
git commit -m "feat(meetings): add scheduledMeetingReminders hourly Cloud Function"
```

---

### Task 4.3: Meeting Attendance Check-In

**Architecture:** Add `attendees: string[]` and `attendeeCount: number` to `MeetingInstanceDocument`. A callable Cloud Function `checkInToMeeting` adds the user to the `attendees` array (idempotent). The `GroupCalendarScreen` and `GroupScheduleScreen` show a "Check In" button during the meeting window (within 30 minutes of start time to 90 minutes after).

**Files:**
- Modify: `mobile/src/types/schema.ts` (add `attendees` to `MeetingInstanceDocument`)
- Create: `functions/src/callable/checkInToMeeting.ts`
- Modify: `functions/src/index.ts`
- Modify: `mobile/src/screens/homegroup/GroupCalendarScreen.tsx`

**Step 1: Add `attendees` to `MeetingInstanceDocument`**

In `mobile/src/types/schema.ts`, extend `MeetingInstanceDocument`:

```typescript
attendees?: string[]; // User IDs who checked in
attendeeCount?: number; // Denormalized count
```

**Step 2: Create `checkInToMeeting.ts`**

```typescript
// functions/src/callable/checkInToMeeting.ts
import * as functions from 'firebase-functions';
import {HttpsError} from 'firebase-functions/v1/https';
import {CallableRequest} from 'firebase-functions/v2/https';
import * as admin from 'firebase-admin';
import {db} from '../utils/firebase';

interface CheckInData {
  groupId: string;
  instanceId: string;
}

interface CheckInResult {
  success: boolean;
  attendeeCount: number;
  alreadyCheckedIn: boolean;
}

export const checkInToMeeting = functions.https.onCall(
  async (request: CallableRequest<CheckInData>): Promise<CheckInResult> => {
    if (!request.auth) {
      throw new HttpsError('unauthenticated', 'Must be authenticated.');
    }

    const {data} = request;
    if (!data.groupId || !data.instanceId) {
      throw new HttpsError('invalid-argument', 'groupId and instanceId are required.');
    }

    const userId = request.auth.uid;

    // Verify user is a member
    const memberDoc = await db
      .collection('members')
      .doc(`${data.groupId}_${userId}`)
      .get();
    if (!memberDoc.exists) {
      throw new HttpsError('permission-denied', 'Only group members can check in.');
    }

    // Find the meeting instance (it's in a subcollection under meetingTemplates or groups)
    const instanceRef = db
      .collection('groups')
      .doc(data.groupId)
      .collection('meetingInstances')
      .doc(data.instanceId);

    const instanceDoc = await instanceRef.get();
    if (!instanceDoc.exists) {
      throw new HttpsError('not-found', 'Meeting instance not found.');
    }

    const instance = instanceDoc.data()!;
    const attendees: string[] = instance.attendees || [];

    if (attendees.includes(userId)) {
      return {success: true, attendeeCount: attendees.length, alreadyCheckedIn: true};
    }

    await instanceRef.update({
      attendees: admin.firestore.FieldValue.arrayUnion(userId),
      attendeeCount: admin.firestore.FieldValue.increment(1),
    });

    // Track activity
    await db.collection('users').doc(userId).update({
      'activityLog.lastMeetingAttendance': admin.firestore.FieldValue.serverTimestamp(),
      lastActivityAt: admin.firestore.FieldValue.serverTimestamp(),
    });

    return {success: true, attendeeCount: attendees.length + 1, alreadyCheckedIn: false};
  },
);
```

**Step 3: Export from index.ts**

```typescript
export {checkInToMeeting} from './callable/checkInToMeeting';
```

**Step 4: Add "I'm Here" button to GroupCalendarScreen**

In the `selectedInstances` FlatList `renderItem`, add a check-in button visible within the meeting window:

```typescript
import functions from '@react-native-firebase/functions';

const isInMeetingWindow = (instance: MeetingInstance): boolean => {
  const scheduledMs = typeof instance.scheduledAt === 'number'
    ? instance.scheduledAt
    : (instance.scheduledAt as any).toDate?.().getTime() ?? Date.now();
  const now = Date.now();
  const thirtyMinBefore = scheduledMs - 30 * 60 * 1000;
  const ninetyMinAfter = scheduledMs + 90 * 60 * 1000;
  return now >= thirtyMinBefore && now <= ninetyMinAfter;
};

// In renderItem:
{isInMeetingWindow(item) && !item.isCancelled && (
  <TouchableOpacity
    style={styles.checkInMeetingBtn}
    onPress={async () => {
      try {
        const fn = functions().httpsCallable('checkInToMeeting');
        const result = await fn({groupId, instanceId: item.id});
        const data = result.data as any;
        Alert.alert(
          data.alreadyCheckedIn ? 'Already Checked In' : "You're Here!",
          `${data.attendeeCount} member(s) checked in.`,
        );
      } catch (err: any) {
        Alert.alert('Error', err.message || 'Failed to check in.');
      }
    }}>
    <Text style={styles.checkInMeetingBtnText}>I'm Here</Text>
  </TouchableOpacity>
)}
```

**Step 5: Build and verify**

```bash
cd /Users/marcusklein/dev/RecoveryConnect/functions && npm run build 2>&1 | tail -5
cd /Users/marcusklein/dev/RecoveryConnect/mobile && npx tsc --noEmit 2>&1 | head -20
```

**Step 6: Commit**

```bash
cd /Users/marcusklein/dev/RecoveryConnect && git add mobile/src/types/schema.ts functions/src/callable/checkInToMeeting.ts functions/src/index.ts mobile/src/screens/homegroup/GroupCalendarScreen.tsx
git commit -m "feat(meetings): add meeting attendance check-in with checkInToMeeting callable"
```

---

## Verification & Testing

### V2.3 Review Prompt

```
Review group chat unread tracking and communication polish:
1. Send 3 messages as User A in group chat
2. As User B: verify unread badge shows "3" on chat navigation
3. User B opens group chat — verify badge clears
4. Start typing as User A — verify "User A is typing..." appears for User B within 2s
5. Stop typing — verify indicator disappears within 6s
6. In a DM thread, tap the bell icon — verify mute toggle works, FCM not sent on next message
7. Run: cd mobile && npx tsc --noEmit — zero errors
8. Report: PASS / FAIL
```

### V2.1 Review Prompt

```
Review treasury completion:
1. Add transaction with "Area Contribution" category — verify it saves and displays
2. Create a monthly recurring transaction for $500 "Rent"
3. Verify it appears in ManageRecurringScreen with correct next date
4. Toggle recurring transaction inactive — verify it won't fire
5. Navigate to Year-End Summary, select current year, Generate Report
6. Verify income and expense category totals are accurate
7. Share the summary text — verify format is readable
8. Run: cd mobile && npx tsc --noEmit — zero errors
9. Report: PASS / FAIL
```

### V2.0 Review Prompt

```
Review daily engagement hooks:
1. Open Gratitude Journal, add 3 gratitudes, tap Save
2. Reload screen — verify entries persist
3. On ProfileMain, tap "Check In Today" — verify streak increments to 1
4. Tap again same day — verify "Already checked in" message (not double-counted)
5. Verify daily reflection Cloud Function deploys: cd functions && npm run build
6. Check notificationSettings toggle for daily reflections appears in settings screen
7. Report: PASS / FAIL
```

### V2.2 Review Prompt

```
Review meeting enhancements:
1. Open GroupScheduleScreen, tap calendar icon in header
2. Verify GroupCalendarScreen shows a calendar with dots on meeting days
3. Tap a day with meetings — verify meeting list shows below the calendar
4. During a meeting window, tap "I'm Here" — verify check-in recorded
5. Tap again — verify "Already Checked In" message
6. Favorite a meeting; wait for next scheduledMeetingReminders run (or invoke manually via Firebase Console)
7. Verify push notification received
8. Run: cd functions && npm run build — zero errors
9. Report: PASS / FAIL
```

---

## Firestore Indexes Required

Add to `firestore.indexes.json`:

```json
[
  {
    "collectionGroup": "recurring_transactions",
    "queryScope": "COLLECTION",
    "fields": [
      {"fieldPath": "isActive", "order": "ASCENDING"},
      {"fieldPath": "nextDate", "order": "ASCENDING"}
    ]
  },
  {
    "collectionGroup": "meetingInstances",
    "queryScope": "COLLECTION_GROUP",
    "fields": [
      {"fieldPath": "scheduledAt", "order": "ASCENDING"},
      {"fieldPath": "isCancelled", "order": "ASCENDING"}
    ]
  }
]
```

```bash
cd /Users/marcusklein/dev/RecoveryConnect && git add firestore.indexes.json
git commit -m "feat(v2): add Firestore composite indexes for recurring transactions and meeting reminders"
```
