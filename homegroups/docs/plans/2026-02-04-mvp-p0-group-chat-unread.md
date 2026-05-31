# Group Chat Unread Tracking Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Show unread message indicator on group chat tab so users know they have new messages.

**Architecture:** Track `lastReadAt` timestamp per user per group in Firestore. Compare against `lastMessageAt` timestamp to determine if there are unread messages. Display badge on group chat navigation tile.

**Tech Stack:** React Native, Redux Toolkit, Firestore, React Navigation

**Priority:** V2.3 - Communication Polish (moved from MVP P0)
**Estimated Effort:** 4-6 hours
**Revenue Impact:** Retention - Improves daily engagement by showing users when they have new messages

---

## Task 1: Add Firestore Schema for Read Tracking

**Files:**
- Modify: `mobile/src/types/schema.ts`
- Modify: `firestore.rules`

**Step 1: Add read tracking fields to GroupChatDocument schema**

In `mobile/src/types/schema.ts`, add to GroupChatDocument interface:

```typescript
export interface GroupChatDocument {
  // ... existing fields ...

  // NEW: Read tracking per user
  lastMessageAt?: Timestamp;
  readStatus?: {
    [userId: string]: {
      lastReadAt: Timestamp;
      lastReadMessageId?: string;
    };
  };
}
```

**Step 2: Update Firestore security rules**

In `firestore.rules`, update the group_chats rules:

```javascript
match /group_chats/{groupId} {
  allow read: if isGroupMember(groupId);
  allow create: if isGroupMember(groupId);
  // Allow members to update their own read status
  allow update: if isGroupMember(groupId) && (
    // Full update by member
    request.auth != null ||
    // Or just updating readStatus for self
    request.resource.data.diff(resource.data).affectedKeys().hasOnly(['readStatus', 'updatedAt'])
  );
}
```

**Step 3: Commit**

```bash
git add mobile/src/types/schema.ts firestore.rules
git commit -m "feat(chat): add schema for unread message tracking"
```

---

## Task 2: Create Read Status Update Function

**Files:**
- Modify: `mobile/src/models/ChatModel.ts`

**Step 1: Add markGroupChatAsRead function**

In `mobile/src/models/ChatModel.ts`, add:

```typescript
/**
 * Mark group chat as read for current user
 * Updates lastReadAt timestamp to now
 */
export async function markGroupChatAsRead(
  groupId: string,
  lastMessageId?: string,
): Promise<void> {
  const currentUser = auth().currentUser;
  if (!currentUser) {
    throw new Error('User must be authenticated');
  }

  const chatRef = firestore().collection('group_chats').doc(groupId);
  const now = firestore.Timestamp.now();

  await chatRef.set(
    {
      [`readStatus.${currentUser.uid}`]: {
        lastReadAt: now,
        lastReadMessageId: lastMessageId || null,
      },
      updatedAt: now,
    },
    { merge: true }
  );
}

/**
 * Get unread count for a group chat
 */
export async function getUnreadCount(
  groupId: string,
  userId: string,
): Promise<number> {
  const chatRef = firestore().collection('group_chats').doc(groupId);
  const chatDoc = await chatRef.get();

  if (!chatDoc.exists) return 0;

  const chatData = chatDoc.data() as GroupChatDocument;
  const userReadStatus = chatData?.readStatus?.[userId];

  if (!userReadStatus?.lastReadAt) {
    // User has never read - count all messages
    const messagesSnapshot = await chatRef
      .collection('messages')
      .count()
      .get();
    return messagesSnapshot.data().count;
  }

  // Count messages after lastReadAt
  const unreadSnapshot = await chatRef
    .collection('messages')
    .where('createdAt', '>', userReadStatus.lastReadAt)
    .count()
    .get();

  return unreadSnapshot.data().count;
}
```

**Step 2: Commit**

```bash
git add mobile/src/models/ChatModel.ts
git commit -m "feat(chat): add functions to mark chat as read and get unread count"
```

---

## Task 3: Add Redux State for Unread Counts

**Files:**
- Modify: `mobile/src/store/slices/chatSlice.ts`

**Step 1: Add unread counts to chat slice state**

In `mobile/src/store/slices/chatSlice.ts`, update the state interface:

```typescript
interface ChatState {
  // ... existing fields ...

  // NEW: Unread counts per group
  unreadCounts: { [groupId: string]: number };
  unreadCountsLoading: boolean;
}

const initialState: ChatState = {
  // ... existing fields ...
  unreadCounts: {},
  unreadCountsLoading: false,
};
```

**Step 2: Add async thunks for unread tracking**

```typescript
export const fetchUnreadCount = createAsyncThunk(
  'chat/fetchUnreadCount',
  async (groupId: string, { rejectWithValue }) => {
    try {
      const currentUser = auth().currentUser;
      if (!currentUser) throw new Error('Not authenticated');

      const count = await getUnreadCount(groupId, currentUser.uid);
      return { groupId, count };
    } catch (error: any) {
      return rejectWithValue(error.message);
    }
  }
);

export const markChatAsRead = createAsyncThunk(
  'chat/markAsRead',
  async ({ groupId, lastMessageId }: { groupId: string; lastMessageId?: string }, { rejectWithValue }) => {
    try {
      await markGroupChatAsRead(groupId, lastMessageId);
      return { groupId };
    } catch (error: any) {
      return rejectWithValue(error.message);
    }
  }
);

export const fetchAllUnreadCounts = createAsyncThunk(
  'chat/fetchAllUnreadCounts',
  async (groupIds: string[], { dispatch }) => {
    const results = await Promise.all(
      groupIds.map(async (groupId) => {
        const currentUser = auth().currentUser;
        if (!currentUser) return { groupId, count: 0 };
        const count = await getUnreadCount(groupId, currentUser.uid);
        return { groupId, count };
      })
    );
    return results;
  }
);
```

**Step 3: Add reducers**

```typescript
extraReducers: (builder) => {
  // ... existing reducers ...

  builder
    .addCase(fetchUnreadCount.fulfilled, (state, action) => {
      const { groupId, count } = action.payload;
      state.unreadCounts[groupId] = count;
    })
    .addCase(markChatAsRead.fulfilled, (state, action) => {
      const { groupId } = action.payload;
      state.unreadCounts[groupId] = 0;
    })
    .addCase(fetchAllUnreadCounts.pending, (state) => {
      state.unreadCountsLoading = true;
    })
    .addCase(fetchAllUnreadCounts.fulfilled, (state, action) => {
      state.unreadCountsLoading = false;
      action.payload.forEach(({ groupId, count }) => {
        state.unreadCounts[groupId] = count;
      });
    })
    .addCase(fetchAllUnreadCounts.rejected, (state) => {
      state.unreadCountsLoading = false;
    });
}
```

**Step 4: Export selector**

```typescript
export const selectUnreadCount = (state: RootState, groupId: string) =>
  state.chat.unreadCounts[groupId] || 0;

export const selectTotalUnreadCount = (state: RootState) =>
  Object.values(state.chat.unreadCounts).reduce((sum, count) => sum + count, 0);
```

**Step 5: Commit**

```bash
git add mobile/src/store/slices/chatSlice.ts
git commit -m "feat(chat): add Redux state for unread message counts"
```

---

## Task 4: Update Message Listener to Track lastMessageAt

**Files:**
- Modify: `mobile/src/store/slices/chatSlice.ts`

**Step 1: Update sendMessage thunk to update lastMessageAt**

In the existing `sendMessage` thunk, add after creating the message:

```typescript
// Update group_chats document with lastMessageAt
await firestore()
  .collection('group_chats')
  .doc(groupId)
  .set(
    {
      lastMessageAt: firestore.Timestamp.now(),
      updatedAt: firestore.Timestamp.now(),
    },
    { merge: true }
  );
```

**Step 2: Commit**

```bash
git add mobile/src/store/slices/chatSlice.ts
git commit -m "feat(chat): update lastMessageAt when sending messages"
```

---

## Task 5: Add Unread Badge Component

**Files:**
- Create: `mobile/src/components/common/UnreadBadge.tsx`

**Step 1: Create the badge component**

```typescript
import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { useTheme } from '../../contexts/ThemeContext';

interface UnreadBadgeProps {
  count: number;
  size?: 'small' | 'medium';
}

export const UnreadBadge: React.FC<UnreadBadgeProps> = ({
  count,
  size = 'medium'
}) => {
  const { colors } = useTheme();

  if (count <= 0) return null;

  const displayCount = count > 99 ? '99+' : count.toString();
  const isSmall = size === 'small';

  return (
    <View
      style={[
        styles.badge,
        {
          backgroundColor: colors.error,
          minWidth: isSmall ? 16 : 20,
          height: isSmall ? 16 : 20,
          borderRadius: isSmall ? 8 : 10,
        },
      ]}
    >
      <Text
        style={[
          styles.text,
          {
            color: colors.white,
            fontSize: isSmall ? 10 : 12,
          },
        ]}
      >
        {displayCount}
      </Text>
    </View>
  );
};

const styles = StyleSheet.create({
  badge: {
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 4,
  },
  text: {
    fontWeight: '600',
  },
});

export default UnreadBadge;
```

**Step 2: Commit**

```bash
git add mobile/src/components/common/UnreadBadge.tsx
git commit -m "feat(chat): add UnreadBadge component"
```

---

## Task 6: Display Badge on Group Chat Tab

**Files:**
- Modify: `mobile/src/navigation/GroupStackNavigator.tsx` (or wherever group tabs are defined)

**Step 1: Find the group chat tab in navigation**

Locate the tab navigator that shows the group chat tab. Add the badge:

```typescript
import { useSelector } from 'react-redux';
import { selectUnreadCount } from '../store/slices/chatSlice';
import UnreadBadge from '../components/common/UnreadBadge';

// In the Tab.Screen for GroupChat:
<Tab.Screen
  name="GroupChat"
  component={GroupChatScreen}
  options={{
    tabBarIcon: ({ color, size }) => (
      <View>
        <Icon name="chat" color={color} size={size} />
        <View style={styles.badgeContainer}>
          <UnreadBadgeConnected groupId={groupId} />
        </View>
      </View>
    ),
  }}
/>

// Create connected badge component
const UnreadBadgeConnected: React.FC<{ groupId: string }> = ({ groupId }) => {
  const unreadCount = useSelector((state: RootState) =>
    selectUnreadCount(state, groupId)
  );
  return <UnreadBadge count={unreadCount} size="small" />;
};

const styles = StyleSheet.create({
  badgeContainer: {
    position: 'absolute',
    top: -4,
    right: -8,
  },
});
```

**Step 2: Commit**

```bash
git add mobile/src/navigation/GroupStackNavigator.tsx
git commit -m "feat(chat): display unread badge on group chat tab"
```

---

## Task 7: Mark Chat as Read When Entering Screen

**Files:**
- Modify: `mobile/src/screens/homegroup/GroupChatScreen.tsx`

**Step 1: Add useEffect to mark as read on screen focus**

```typescript
import { useFocusEffect } from '@react-navigation/native';
import { useCallback } from 'react';
import { markChatAsRead, fetchUnreadCount } from '../../store/slices/chatSlice';

// Inside GroupChatScreen component:
const dispatch = useAppDispatch();

useFocusEffect(
  useCallback(() => {
    // Mark chat as read when screen is focused
    dispatch(markChatAsRead({ groupId }));

    // Track activity
    const currentUser = auth().currentUser;
    if (currentUser) {
      trackActivity(currentUser.uid, 'chat_message', groupId);
    }

    return () => {
      // Optional: refresh unread count when leaving
    };
  }, [groupId, dispatch])
);
```

**Step 2: Commit**

```bash
git add mobile/src/screens/homegroup/GroupChatScreen.tsx
git commit -m "feat(chat): mark chat as read when screen is focused"
```

---

## Task 8: Fetch Unread Counts on App Load

**Files:**
- Modify: `mobile/src/navigation/AppNavigator.tsx` or main app component

**Step 1: Fetch unread counts when user's groups are loaded**

```typescript
import { useEffect } from 'react';
import { useSelector } from 'react-redux';
import { fetchAllUnreadCounts } from '../store/slices/chatSlice';
import { selectUserGroups } from '../store/slices/groupsSlice';

// Inside the main app component:
const userGroups = useSelector(selectUserGroups);
const dispatch = useAppDispatch();

useEffect(() => {
  if (userGroups && userGroups.length > 0) {
    const groupIds = userGroups.map(g => g.id);
    dispatch(fetchAllUnreadCounts(groupIds));
  }
}, [userGroups, dispatch]);
```

**Step 2: Commit**

```bash
git add mobile/src/navigation/AppNavigator.tsx
git commit -m "feat(chat): fetch all unread counts on app load"
```

---

## Task 9: Real-Time Unread Count Updates

**Files:**
- Modify: `mobile/src/store/slices/chatSlice.ts`

**Step 1: Add listener for new messages to update unread count**

In the existing message listener setup, add logic to increment unread count when a new message arrives and the user is not viewing that chat:

```typescript
// When a new message arrives from the listener:
const handleNewMessage = (message: Message, groupId: string) => {
  // If this message is from another user and we're not viewing this chat
  if (message.senderId !== currentUser?.uid) {
    // Increment unread count
    dispatch(incrementUnreadCount(groupId));
  }
};

// Add action to slice:
incrementUnreadCount: (state, action: PayloadAction<string>) => {
  const groupId = action.payload;
  state.unreadCounts[groupId] = (state.unreadCounts[groupId] || 0) + 1;
},
```

**Step 2: Commit**

```bash
git add mobile/src/store/slices/chatSlice.ts
git commit -m "feat(chat): increment unread count on new message received"
```

---

## Task 10: Verification & Testing

**Step 1: Manual testing checklist**

Run the app and verify:

- [ ] Unread badge appears on group chat tab when there are unread messages
- [ ] Badge shows correct count (test with 1, 5, 100+ messages)
- [ ] Badge shows "99+" when count exceeds 99
- [ ] Badge disappears when entering the chat screen
- [ ] Badge updates in real-time when receiving new messages while in another screen
- [ ] Unread counts persist across app restarts (fetched from Firestore)
- [ ] Multiple groups show independent unread counts

**Step 2: Test edge cases**

- [ ] New user with no read history sees all messages as unread
- [ ] User who has read all messages sees 0 badge (no badge shown)
- [ ] Badge updates correctly when switching between groups

**Step 3: Final commit**

```bash
git add .
git commit -m "feat(chat): complete unread message tracking implementation"
```

---

## Review Prompt

Before considering this implementation complete, run this verification:

```
Review the group chat unread tracking implementation:

1. TEST FUNCTIONALITY:
   - Create a test group with 2 users
   - User A sends 3 messages
   - Verify User B sees "3" badge on chat tab
   - User B opens chat - verify badge disappears
   - User A sends 1 more message - verify User B sees "1" badge

2. CHECK CODE QUALITY:
   - Review all modified files for TypeScript errors: `npx tsc --noEmit`
   - Check for console errors in Metro bundler
   - Verify Firestore rules don't break existing functionality

3. VERIFY PERFORMANCE:
   - Confirm unread count queries use indexes (no Firestore warnings)
   - Check that real-time updates don't cause excessive re-renders

4. FIX ANY ISSUES found before marking complete

Report: [PASS/FAIL] with details of any fixes needed
```
