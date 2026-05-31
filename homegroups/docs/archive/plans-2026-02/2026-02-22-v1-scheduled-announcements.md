---
archived: true
archived_at: 2026-05-25
archived_reason: Plan shipped; tracked DONE in docs/plans/README.md (with PR# or commit ref). Preserved for historical reference.
original_path: docs/plans/2026-02-22-v1-scheduled-announcements.md
---

# Scheduled Announcements Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Let group admins write an announcement now and have it automatically post and notify members at a future date/time.

**Architecture:** Add `status: 'published' | 'scheduled'` and `scheduledFor?: Timestamp` to the announcement schema. The existing `onAnnouncementCreate` trigger skips notifications for scheduled announcements. A new hourly Cloud Function (`scheduledAnnouncementPublisher`) queries for due scheduled announcements, marks them published, and sends notifications. The create modal gains a date/time picker for admins.

**Tech Stack:** React Native, Firestore, Firebase Cloud Functions (v1 pubsub schedule), FCM, `@react-native-community/datetimepicker`

**Priority:** V1.3
**Estimated Effort:** 4–5 hours

---

## Task 1: Update Announcement Schema

**Files:**
- Modify: `mobile/src/types/schema.ts` (around line 228 — `AnnouncementDocument`)
- Modify: `mobile/src/types/index.ts` (around line 198 — `Announcement`)

**Step 1: Add fields to `AnnouncementDocument` in `schema.ts`**

Find the `AnnouncementDocument` interface (around line 228) and add two fields:

```typescript
export interface AnnouncementDocument {
  title: string;
  content: string;
  isPinned: boolean;
  createdAt: Timestamp;
  updatedAt: Timestamp;
  createdBy: string;
  authorName: string;
  expiresAt?: Timestamp;
  groupId: string;
  userId: string;
  memberId: string;
  readBy?: string[];
  readCount?: number;
  // ADD THESE:
  status?: 'published' | 'scheduled'; // Defaults to 'published' for backward compat
  scheduledFor?: Timestamp;           // Only set when status === 'scheduled'
  publishedAt?: Timestamp;            // Set when Cloud Function publishes
}
```

**Step 2: Add fields to `Announcement` in `index.ts`**

Find the `Announcement` interface (around line 198) and add:

```typescript
export interface Announcement {
  id: string;
  title: string;
  content: string;
  isPinned: boolean;
  createdAt: Date;
  updatedAt: Date;
  createdBy: string;
  authorName: string;
  expiresAt?: Date;
  groupId: string;
  userId: string;
  memberId: string;
  readBy?: string[];
  readCount?: number;
  // ADD THESE:
  status?: 'published' | 'scheduled';
  scheduledFor?: Date;
  publishedAt?: Date;
}
```

**Step 3: Commit**

```bash
git add mobile/src/types/schema.ts mobile/src/types/index.ts
git commit -m "feat(announcements): add status and scheduledFor to announcement schema"
```

---

## Task 2: Update AnnouncementModel

**Files:**
- Modify: `mobile/src/models/AnnouncementModel.ts`

**Step 1: Update `fromFirestore` to map new fields**

Find the `fromFirestore` method (around line 21). Add the new fields:

```typescript
static fromFirestore(snapshot: FirebaseFirestoreTypes.DocumentSnapshot): Announcement {
  const data = snapshot.data() as AnnouncementDocument;
  return {
    id: snapshot.id,
    title: data.title,
    content: data.content,
    isPinned: data.isPinned ?? false,
    createdAt: data.createdAt?.toDate() ?? new Date(),
    updatedAt: data.updatedAt?.toDate() ?? new Date(),
    createdBy: data.createdBy,
    authorName: data.authorName,
    expiresAt: data.expiresAt?.toDate(),
    groupId: data.groupId,
    userId: data.userId,
    memberId: data.memberId,
    readBy: data.readBy ?? [],
    readCount: data.readCount ?? 0,
    // ADD:
    status: data.status ?? 'published',
    scheduledFor: data.scheduledFor?.toDate(),
    publishedAt: data.publishedAt?.toDate(),
  };
}
```

**Step 2: Update `createAnnouncement` to accept scheduling params**

Find the `createAnnouncement` method (around line 230). Add optional `scheduledFor` parameter and set `status` accordingly:

```typescript
static async createAnnouncement(
  groupId: string,
  data: {
    title: string;
    content: string;
    isPinned?: boolean;
    scheduledFor?: Date; // ADD
  },
): Promise<Announcement> {
  // ... existing permission check ...

  const isScheduled = !!data.scheduledFor && data.scheduledFor > new Date();

  const announcementData: Omit<AnnouncementDocument, 'id'> = {
    title: data.title,
    content: data.content,
    isPinned: data.isPinned ?? false,
    createdAt: firestore.Timestamp.now(),
    updatedAt: firestore.Timestamp.now(),
    createdBy: currentUser.uid,
    authorName: member.displayName,
    groupId,
    userId: currentUser.uid,
    memberId: `${groupId}_${currentUser.uid}`,
    readBy: [],
    readCount: 0,
    // ADD:
    status: isScheduled ? 'scheduled' : 'published',
    scheduledFor: data.scheduledFor
      ? firestore.Timestamp.fromDate(data.scheduledFor)
      : undefined,
    publishedAt: isScheduled ? undefined : firestore.Timestamp.now(),
  };

  // ... rest of existing create logic ...
}
```

**Step 3: Add `getScheduledAnnouncementsForGroup` query method**

Add a new static method for fetching scheduled announcements (for admin list view):

```typescript
static async getAnnouncementsForGroup(
  groupId: string,
  includeScheduled = false,
  limit = 20,
): Promise<Announcement[]> {
  let query = firestore()
    .collection('announcements')
    .where('groupId', '==', groupId)
    .orderBy('createdAt', 'desc')
    .limit(limit);

  if (!includeScheduled) {
    query = query.where('status', '==', 'published') as any;
  }

  const snapshot = await query.get();
  return snapshot.docs.map(doc => AnnouncementModel.fromFirestore(doc));
}
```

**Step 4: Commit**

```bash
git add mobile/src/models/AnnouncementModel.ts
git commit -m "feat(announcements): update model to handle scheduled announcements"
```

---

## Task 3: Update Redux Slice

**Files:**
- Modify: `mobile/src/store/slices/announcementsSlice.ts`

**Step 1: Update `createAnnouncement` thunk to accept `scheduledFor`**

Find the `createAnnouncement` thunk (around line 95). Update its argument type:

```typescript
export const createAnnouncement = createAsyncThunk(
  'announcements/createAnnouncement',
  async (
    data: {
      groupId: string;
      title: string;
      content: string;
      isPinned?: boolean;
      scheduledFor?: Date; // ADD
    },
    {rejectWithValue},
  ) => {
    try {
      const announcement = await AnnouncementModel.createAnnouncement(
        data.groupId,
        {
          title: data.title,
          content: data.content,
          isPinned: data.isPinned,
          scheduledFor: data.scheduledFor, // ADD
        },
      );

      if (!data.scheduledFor) {
        // Only track activity for immediate posts, not scheduled
        const currentUser = auth().currentUser;
        if (currentUser) {
          trackActivity(currentUser.uid, 'announcement_posted', data.groupId);
        }
      }

      return announcement;
    } catch (error: any) {
      return rejectWithValue(error.message || 'Failed to create announcement');
    }
  },
);
```

**Step 2: Update `fetchAnnouncementsForGroup` thunk**

Admins should see scheduled announcements; members should not. Pass `isAdmin` flag:

```typescript
export const fetchAnnouncementsForGroup = createAsyncThunk(
  'announcements/fetchAnnouncementsForGroup',
  async (
    {groupId, isAdmin = false}: {groupId: string; isAdmin?: boolean},
    {rejectWithValue},
  ) => {
    try {
      const announcements = await AnnouncementModel.getAnnouncementsForGroup(
        groupId,
        isAdmin, // includeScheduled
      );
      return {groupId, announcements};
    } catch (error: any) {
      return rejectWithValue(error.message || 'Failed to fetch announcements');
    }
  },
);
```

**Step 3: Commit**

```bash
git add mobile/src/store/slices/announcementsSlice.ts
git commit -m "feat(announcements): update slice to support scheduled announcement creation"
```

---

## Task 4: Update onAnnouncementCreate Trigger

**Files:**
- Modify: `functions/src/triggers/firestore/onAnnouncementCreate.ts`

**Step 1: Skip notifications for scheduled announcements**

At the very top of the `onUpdate` handler body, add an early return if the announcement is scheduled:

```typescript
export const onAnnouncementCreate = functionsV1.firestore
  .document('announcements/{announcementId}')
  .onCreate(async (snapshot, context) => {
    const data = snapshot.data();

    // Skip notifications for scheduled announcements — publisher function handles these
    if (data.status === 'scheduled') {
      functions.logger.info(
        `Announcement ${context.params.announcementId} is scheduled for ${data.scheduledFor?.toDate()}, skipping notification`,
      );
      return null;
    }

    // ... rest of existing notification logic unchanged ...
  });
```

**Step 2: Build and verify**

```bash
cd functions && npm run build 2>&1 | tail -5
```

Expected: zero errors.

**Step 3: Commit**

```bash
git add functions/src/triggers/firestore/onAnnouncementCreate.ts
git commit -m "feat(announcements): skip FCM notification for scheduled announcements on create"
```

---

## Task 5: Create scheduledAnnouncementPublisher Cloud Function

**Files:**
- Create: `functions/src/triggers/pubsub/scheduledAnnouncementPublisher.ts`
- Modify: `functions/src/index.ts`

**Step 1: Create the file**

```typescript
import * as functions from 'firebase-functions';
import * as functionsV1 from 'firebase-functions/v1';
import { db, messaging } from '../../utils/firebase';

/**
 * Runs every hour. Finds announcements with status='scheduled' whose
 * scheduledFor time has passed, marks them published, and sends notifications.
 */
export const scheduledAnnouncementPublisher = functionsV1.pubsub
  .schedule('0 * * * *') // Every hour on the hour
  .timeZone('UTC')
  .onRun(async () => {
    const now = new Date();

    const dueSnapshot = await db
      .collection('announcements')
      .where('status', '==', 'scheduled')
      .where('scheduledFor', '<=', db.Timestamp.fromDate(now))
      .get();

    if (dueSnapshot.empty) {
      functions.logger.info('No scheduled announcements due for publishing');
      return null;
    }

    functions.logger.info(
      `Publishing ${dueSnapshot.size} scheduled announcement(s)`,
    );

    for (const doc of dueSnapshot.docs) {
      const data = doc.data();
      const announcementId = doc.id;
      const groupId = data.groupId as string;

      try {
        // Mark as published
        await doc.ref.update({
          status: 'published',
          publishedAt: db.Timestamp.fromDate(now),
          updatedAt: db.Timestamp.fromDate(now),
        });

        functions.logger.info(
          `Published announcement ${announcementId} for group ${groupId}`,
        );

        // Get group name
        const groupDoc = await db.collection('groups').doc(groupId).get();
        if (!groupDoc.exists) {
          functions.logger.warn(`Group ${groupId} not found, skipping notification`);
          continue;
        }
        const groupName = groupDoc.data()?.name ?? 'Your Group';

        // Get member FCM tokens (same batching pattern as onAnnouncementCreate)
        const membersSnapshot = await db
          .collection('members')
          .where('groupId', '==', groupId)
          .get();

        const memberUserIds = membersSnapshot.docs
          .map(m => (m.data().userId as string) || null)
          .filter((id): id is string => Boolean(id))
          .filter(id => id !== data.createdBy); // Don't notify the author

        if (memberUserIds.length === 0) {
          functions.logger.info(`No members to notify for announcement ${announcementId}`);
          continue;
        }

        const tokens: string[] = [];

        for (let i = 0; i < memberUserIds.length; i += 10) {
          const batch = memberUserIds.slice(i, i + 10);
          const usersSnapshot = await db
            .collection('users')
            .where('__name__', 'in', batch)
            .get();

          usersSnapshot.docs.forEach(userDoc => {
            const userData = userDoc.data();
            const announcementsEnabled =
              userData.notificationSettings?.announcements !== false;
            const pushEnabled =
              userData.notificationSettings?.allowPushNotifications !== false;

            if (announcementsEnabled && pushEnabled && userData.fcmTokens?.length) {
              tokens.push(...userData.fcmTokens);
            }
          });
        }

        if (tokens.length === 0) {
          functions.logger.info(`No eligible FCM tokens for announcement ${announcementId}`);
          continue;
        }

        const truncatedContent =
          data.content.length > 100
            ? `${data.content.slice(0, 100)}...`
            : data.content;

        await messaging.sendEachForMulticast({
          tokens,
          notification: {
            title: `${groupName}: ${data.title}`,
            body: truncatedContent,
          },
          data: {
            type: 'announcement',
            groupId,
            announcementId,
            groupName,
          },
          android: {
            priority: 'high',
            notification: {
              channelId: 'announcements',
              priority: 'high',
            },
          },
          apns: {
            payload: {
              aps: {
                sound: 'default',
                badge: 1,
              },
            },
          },
        });

        functions.logger.info(
          `Sent notifications for scheduled announcement ${announcementId} to ${tokens.length} tokens`,
        );
      } catch (error) {
        functions.logger.error(
          `Failed to publish announcement ${announcementId}:`,
          error,
        );
        // Continue to next announcement rather than failing the whole run
      }
    }

    return null;
  });
```

**Step 2: Add export to `functions/src/index.ts`**

Add after the existing scheduled function exports (around line 75):

```typescript
export { scheduledAnnouncementPublisher } from './triggers/pubsub/scheduledAnnouncementPublisher';
```

**Step 3: Build and verify**

```bash
cd functions && npm run build 2>&1 | tail -5
```

Expected: zero errors.

**Step 4: Commit**

```bash
git add functions/src/triggers/pubsub/scheduledAnnouncementPublisher.ts functions/src/index.ts
git commit -m "feat(announcements): add scheduled announcement publisher Cloud Function"
```

---

## Task 6: Update GroupAnnouncementsScreen — Scheduling UI

**Files:**
- Modify: `mobile/src/screens/homegroup/GroupAnnouncementsScreen.tsx`

Check if `@react-native-community/datetimepicker` is installed:

```bash
grep "datetimepicker" mobile/package.json
```

If not listed, install it:

```bash
cd mobile && npm install @react-native-community/datetimepicker
```

**Step 1: Add scheduling state to the create modal**

Find the existing modal state variables (around line 207) and add:

```typescript
const [isScheduled, setIsScheduled] = useState(false);
const [scheduledFor, setScheduledFor] = useState<Date>(
  new Date(Date.now() + 60 * 60 * 1000), // Default: 1 hour from now
);
const [showDatePicker, setShowDatePicker] = useState(false);
const [showTimePicker, setShowTimePicker] = useState(false);
```

**Step 2: Add a reset helper**

In the existing `resetForm` function, add the new state resets:

```typescript
const resetForm = () => {
  setTitle('');
  setContent('');
  setIsPinned(false);
  setIsScheduled(false);                               // ADD
  setScheduledFor(new Date(Date.now() + 60 * 60 * 1000)); // ADD
  setShowDatePicker(false);                            // ADD
  setShowTimePicker(false);                            // ADD
};
```

**Step 3: Pass `scheduledFor` to the dispatch**

Find `handleCreate` (where `dispatch(createAnnouncement(...))` is called). Update:

```typescript
const handleCreate = async () => {
  if (!title.trim() || !content.trim()) {
    Alert.alert('Error', 'Title and content are required');
    return;
  }
  if (isScheduled && scheduledFor <= new Date()) {
    Alert.alert('Error', 'Scheduled time must be in the future');
    return;
  }

  setSubmitting(true);
  try {
    await dispatch(
      createAnnouncement({
        groupId,
        title: title.trim(),
        content: content.trim(),
        isPinned,
        scheduledFor: isScheduled ? scheduledFor : undefined, // ADD
      }),
    ).unwrap();
    setModalVisible(false);
    resetForm();
    Alert.alert(
      isScheduled ? 'Scheduled!' : 'Posted!',
      isScheduled
        ? `Announcement will be posted on ${scheduledFor.toLocaleString()}`
        : 'Announcement posted successfully',
    );
  } catch (error: any) {
    Alert.alert('Error', error.message || 'Failed to create announcement');
  } finally {
    setSubmitting(false);
  }
};
```

**Step 4: Add scheduling UI to the modal**

Inside `renderModal()`, after the pin toggle and before the submit button, add:

```typescript
import DateTimePicker from '@react-native-community/datetimepicker';

{/* Schedule toggle */}
<TouchableOpacity
  style={styles.toggleRow}
  onPress={() => setIsScheduled(!isScheduled)}>
  <View style={[styles.checkbox, isScheduled && styles.checkboxActive]}>
    {isScheduled && <Text style={styles.checkmark}>✓</Text>}
  </View>
  <Text style={styles.toggleLabel}>Schedule for later</Text>
</TouchableOpacity>

{/* Date/time pickers — only shown when scheduling */}
{isScheduled && (
  <View style={styles.schedulerContainer}>
    <TouchableOpacity
      style={styles.dateButton}
      onPress={() => setShowDatePicker(true)}>
      <Text style={styles.dateButtonLabel}>Date</Text>
      <Text style={styles.dateButtonValue}>
        {scheduledFor.toLocaleDateString()}
      </Text>
    </TouchableOpacity>

    <TouchableOpacity
      style={styles.dateButton}
      onPress={() => setShowTimePicker(true)}>
      <Text style={styles.dateButtonLabel}>Time</Text>
      <Text style={styles.dateButtonValue}>
        {scheduledFor.toLocaleTimeString([], {hour: '2-digit', minute: '2-digit'})}
      </Text>
    </TouchableOpacity>
  </View>
)}

{showDatePicker && (
  <DateTimePicker
    value={scheduledFor}
    mode="date"
    minimumDate={new Date()}
    onChange={(_, date) => {
      setShowDatePicker(false);
      if (date) {
        const updated = new Date(scheduledFor);
        updated.setFullYear(date.getFullYear(), date.getMonth(), date.getDate());
        setScheduledFor(updated);
      }
    }}
  />
)}

{showTimePicker && (
  <DateTimePicker
    value={scheduledFor}
    mode="time"
    onChange={(_, time) => {
      setShowTimePicker(false);
      if (time) {
        const updated = new Date(scheduledFor);
        updated.setHours(time.getHours(), time.getMinutes());
        setScheduledFor(updated);
      }
    }}
  />
)}
```

Add required styles to the StyleSheet:

```typescript
toggleRow: {
  flexDirection: 'row',
  alignItems: 'center',
  marginTop: 12,
},
toggleLabel: {
  marginLeft: 8,
  fontSize: 14,
  color: '#333',
},
schedulerContainer: {
  flexDirection: 'row',
  gap: 12,
  marginTop: 12,
},
dateButton: {
  flex: 1,
  borderWidth: 1,
  borderColor: '#DDD',
  borderRadius: 8,
  padding: 10,
  alignItems: 'center',
},
dateButtonLabel: {
  fontSize: 11,
  color: '#888',
  marginBottom: 2,
},
dateButtonValue: {
  fontSize: 14,
  color: '#333',
  fontWeight: '500',
},
```

**Step 5: Update `fetchAnnouncementsForGroup` call to pass `isAdmin`**

Find where `fetchAnnouncementsForGroup` is dispatched (likely in a `useEffect`) and pass the admin flag:

```typescript
const isCurrentUserAdmin = group?.admins?.includes(currentUser?.uid ?? '');

useEffect(() => {
  if (groupId) {
    dispatch(fetchAnnouncementsForGroup({groupId, isAdmin: isCurrentUserAdmin}));
  }
}, [groupId, isCurrentUserAdmin]);
```

**Step 6: Commit**

```bash
git add mobile/src/screens/homegroup/GroupAnnouncementsScreen.tsx
git commit -m "feat(announcements): add scheduling UI to create announcement modal"
```

---

## Task 7: Show Scheduled Badge on Announcement Cards

**Files:**
- Modify: `mobile/src/screens/homegroup/GroupAnnouncementsScreen.tsx` (the announcement card render)

**Step 1: Add a "Scheduled" badge to announcement items**

Find the FlatList `renderItem` (the announcement card). Add a scheduled indicator alongside the existing pinned badge:

```typescript
{item.status === 'scheduled' && (
  <View style={styles.scheduledBadge}>
    <Text style={styles.scheduledBadgeText}>
      🕐 {item.scheduledFor?.toLocaleDateString()}
    </Text>
  </View>
)}
```

Add style:

```typescript
scheduledBadge: {
  backgroundColor: '#FFF3CD',
  borderRadius: 4,
  paddingHorizontal: 6,
  paddingVertical: 2,
  marginRight: 6,
},
scheduledBadgeText: {
  fontSize: 11,
  color: '#856404',
},
```

**Step 2: Commit**

```bash
git add mobile/src/screens/homegroup/GroupAnnouncementsScreen.tsx
git commit -m "feat(announcements): show scheduled badge on announcement list items"
```

---

## Task 8: Add Firestore Index

**Files:**
- Modify: `firestore.indexes.json`

The Cloud Function queries `announcements` by `status` + `scheduledFor`. Add a composite index:

```json
{
  "collectionGroup": "announcements",
  "queryScope": "COLLECTION",
  "fields": [
    { "fieldPath": "status", "order": "ASCENDING" },
    { "fieldPath": "scheduledFor", "order": "ASCENDING" }
  ]
}
```

Add this entry to the `indexes` array in `firestore.indexes.json`.

**Commit:**

```bash
git add firestore.indexes.json
git commit -m "feat(announcements): add composite index for scheduled announcement queries"
```

---

## Verification & Testing

**Manual testing checklist:**

- [ ] Create an announcement with "Schedule for later" toggled OFF → posts immediately, other members receive push notification
- [ ] Create an announcement with a time 2+ minutes in the future → status shows "scheduled" badge, no notification sent
- [ ] Wait for the Cloud Function to run (or manually invoke via Firebase Console → `scheduledAnnouncementPublisher` → Test) → announcement becomes published, notification arrives
- [ ] Admins see scheduled announcements in the list; members do not (until published)
- [ ] Scheduling a past time is rejected with validation error
- [ ] Admin toggles date and time pickers correctly on iOS and Android

---

## Review Prompt

```
Review the scheduled announcements implementation:

1. Create a scheduled announcement 2 minutes in the future
2. Verify it appears in admin list with "Scheduled" badge
3. Verify members cannot see it yet
4. Invoke scheduledAnnouncementPublisher via Firebase Console → Test
5. Verify announcement is now visible to members
6. Verify push notification was sent (check Firebase Functions logs)
7. Run: cd functions && npm run build — zero errors
8. Report: PASS / FAIL with details
```
