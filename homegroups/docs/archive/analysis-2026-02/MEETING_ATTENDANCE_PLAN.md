# Meeting Attendance & Activity Tracking Implementation Plan

**Created:** 2026-02-04
**Status:** Planning

---

## 1. Meeting Attendance Feature

### Data Model Changes

**MeetingInstanceDocument** (add to schema.ts):
```typescript
export interface MeetingInstanceDocument {
  // ... existing fields ...

  // NEW: Attendance tracking
  attendees?: string[];                    // User IDs who checked in
  attendeeDetails?: {
    [userId: string]: {
      checkedInAt: Timestamp;
      checkedInBy: 'self' | 'admin';       // Who marked attendance
      name?: string;                        // Denormalized for display
    }
  };
  attendeeCount?: number;                  // Denormalized count for queries
}
```

### UI Components

**1. Check-In Button on Meeting Instance**

Location: `EditMeetingInstanceScreen.tsx` or new `MeetingDetailScreen.tsx`

```
┌─────────────────────────────────────────┐
│ Tuesday Meeting - 7:00 PM               │
│ Community Center, Room 101              │
│                                         │
│ ┌─────────────────────────────────────┐ │
│ │  ✓  I'm Here                        │ │  ← Green when checked in
│ └─────────────────────────────────────┘ │
│                                         │
│ 12 members attending                    │
│ ┌─────────────────────────────────────┐ │
│ │ 👤 John D.        ✓ 6:45 PM        │ │
│ │ 👤 Sarah M.       ✓ 6:52 PM        │ │
│ │ 👤 Mike R.        ✓ 7:01 PM        │ │
│ └─────────────────────────────────────┘ │
└─────────────────────────────────────────┘
```

**2. Check-In Time Window**

- **Before:** 30 minutes before meeting start
- **During:** Entire meeting duration (assume 1 hour if not specified)
- **After:** 15 minutes after meeting end (grace period)
- **Outside window:** Button disabled with "Check-in available at X:XX"

**3. Admin Attendance Management**

Admins can:
- View full attendance list with timestamps
- Manually mark members as attending (for those without phones)
- Export attendance for records

### Implementation Files

| File | Changes |
|------|---------|
| `mobile/src/types/schema.ts` | Add attendance fields to MeetingInstanceDocument |
| `mobile/src/types/index.ts` | Add attendance fields to MeetingInstance |
| `mobile/src/models/MeetingModel.ts` | Add `checkInToMeeting()`, `getAttendees()` |
| `mobile/src/store/slices/meetingsSlice.ts` | Add `checkIn` async thunk |
| `mobile/src/screens/homegroup/MeetingDetailScreen.tsx` | New screen with check-in UI |
| `mobile/src/services/activityTracker.ts` | Wire up `meeting_attendance` activity |
| `functions/src/triggers/firestore/onMeetingCheckIn.ts` | Optional: notify group of milestone attendance |

---

## 2. Activity Tracking - Simplified Approach

### Key Principle

**Any app usage = admin is active.**

An admin who logs in, chats, attends meetings, or reads announcements is considered
active. We don't distinguish between "admin actions" and "member actions" for
activity purposes. If they're using the app, they're engaged with their group.

### Activity Types

```typescript
export type ActivityType =
  | 'login'                    // App opened
  | 'chat_message'             // Sent group chat message
  | 'dm_sent'                  // Sent direct message
  | 'meeting_attendance'       // Checked into meeting
  | 'announcement_posted'      // Posted announcement
  | 'announcement_read'        // Viewed announcement
  | 'group_action'             // Edited group settings
  | 'member_managed'           // Approved/removed member
  | 'meeting_managed'          // Created/edited meeting
  | 'treasury_action'          // Added/edited transaction
  | 'service_position_managed';// Assigned service position
```

### Admin Activity Rule

**ALL activities with a groupId reset the admin inactivity clock.**

| Activity | Resets Admin Clock |
|----------|-------------------|
| `login` (with groupId) | ✅ |
| `chat_message` | ✅ |
| `dm_sent` | ❌ (no groupId) |
| `meeting_attendance` | ✅ |
| `announcement_read` | ✅ |
| `announcement_posted` | ✅ |
| `group_action` | ✅ |
| `member_managed` | ✅ |
| `meeting_managed` | ✅ |
| `treasury_action` | ✅ |
| `service_position_managed` | ✅ |

### Why This Approach

1. **Fairer to admins** - A treasurer who logs in weekly to chat shouldn't be marked "inactive"
2. **Simpler logic** - No need to maintain lists of "admin-only" vs "member" activities
3. **Matches user expectation** - "I use the app every day, how am I inactive?"
4. **Prevents false positives** - Active admins won't lose their groups to auto-claim

### Where to Add Activity Tracking

**Key: Always pass groupId when available so admin activity is updated.**

| Location | Activity Type | Has groupId | Status |
|----------|---------------|-------------|--------|
| `groupsSlice.ts` - updateGroup | `group_action` | ✅ | ✅ Done |
| `groupsSlice.ts` - approveAdminRequest | `group_action` | ✅ | ❌ Add |
| `groupsSlice.ts` - denyAdminRequest | `group_action` | ✅ | ❌ Add |
| `announcementsSlice.ts` - createAnnouncement | `announcement_posted` | ✅ | ✅ Done |
| `announcementsSlice.ts` - viewAnnouncement | `announcement_read` | ✅ | ❌ Add |
| `chatSlice.ts` - sendMessage | `chat_message` | ✅ | ✅ Done |
| `directMessagesSlice.ts` - sendMessage | `dm_sent` | ❌ | ✅ Done (no group) |
| `meetingsSlice.ts` - createMeeting | `meeting_managed` | ✅ | ❌ Add |
| `meetingsSlice.ts` - updateMeeting | `meeting_managed` | ✅ | ❌ Add |
| `meetingsSlice.ts` - deleteMeeting | `meeting_managed` | ✅ | ❌ Add |
| `meetingsSlice.ts` - checkIn | `meeting_attendance` | ✅ | ❌ Add |
| `transactionsSlice.ts` - addTransaction | `treasury_action` | ✅ | ❌ Add |
| `transactionsSlice.ts` - updateTransaction | `treasury_action` | ✅ | ❌ Add |
| `transactionsSlice.ts` - deleteTransaction | `treasury_action` | ✅ | ❌ Add |
| `servicePositionsSlice.ts` - assignPosition | `service_position_managed` | ✅ | ❌ Add |
| `GroupModel.ts` - approveMember | `member_managed` | ✅ | ✅ Done |
| `GroupModel.ts` - removeMember | `member_managed` | ✅ | ✅ Done |
| `GroupOverviewScreen` - onOpen | `login` | ✅ | ❌ Add (optional) |

---

## 3. Activity Tracking Service Updates

### Updated activityTracker.ts

```typescript
export type ActivityType =
  // User engagement
  | 'login'
  | 'chat_message'
  | 'dm_sent'
  | 'meeting_attendance'
  | 'announcement_read'
  | 'sobriety_milestone'
  // Admin/leadership actions
  | 'group_action'
  | 'announcement_posted'
  | 'member_managed'
  | 'meeting_managed'
  | 'treasury_action'
  | 'service_position_managed'
  | 'admin_request_handled';

// Activities that reset admin inactivity clock
const ADMIN_ACTIVITIES: ActivityType[] = [
  'group_action',
  'announcement_posted',
  'member_managed',
  'meeting_managed',
  'treasury_action',
  'service_position_managed',
  'admin_request_handled',
];

export async function trackActivity(
  userId: string,
  activityType: ActivityType,
  groupId?: string,
): Promise<void> {
  // ... existing user document update ...

  // Only update group admin status for admin activities
  if (groupId && ADMIN_ACTIVITIES.includes(activityType)) {
    await updateAdminActivityInGroup(userId, groupId, now);
  }
}
```

---

## 4. Analytics Events

Track these for product analytics (Firebase Analytics):

```typescript
// Meeting attendance
analytics().logEvent('meeting_check_in', {
  group_id: groupId,
  meeting_id: meetingId,
  instance_id: instanceId,
  is_online: meeting.isOnline,
});

// Treasury actions
analytics().logEvent('treasury_transaction', {
  group_id: groupId,
  type: 'income' | 'expense',
  category: category,
  amount_range: '<50' | '50-100' | '100-500' | '>500',
});

// Service position changes
analytics().logEvent('service_position_assigned', {
  group_id: groupId,
  position_name: positionName,
});
```

---

## 5. Implementation Checklist

### Phase 1: Meeting Attendance (MVP Priority: V2.2)

- [ ] Add `attendees` and `attendeeDetails` to MeetingInstanceDocument
- [ ] Add `attendees` to MeetingInstance type
- [ ] Create `MeetingModel.checkIn()` method
- [ ] Add `checkIn` thunk to meetingsSlice
- [ ] Create check-in UI component
- [ ] Add check-in button to meeting instance view
- [ ] Wire up `trackActivity('meeting_attendance')`
- [ ] Add Firebase Analytics event

### Phase 2: Activity Tracking Expansion (MVP/V1)

- [ ] Add new activity types to ActivityType enum
- [ ] Create ADMIN_ACTIVITIES constant
- [ ] Update trackActivity to use ADMIN_ACTIVITIES check
- [ ] Add tracking to meetingsSlice (create/update/delete)
- [ ] Add tracking to transactionsSlice (add/update/delete)
- [ ] Add tracking to servicePositionsSlice (assign)
- [ ] Add tracking to admin request handling
- [ ] Add dm_sent distinct from chat_message

### Phase 3: Admin Activity Visibility (V1)

- [ ] Add activity history to admin dashboard
- [ ] Show "Last active: X days ago" on admin cards
- [ ] Add activity breakdown (announcements, treasury, etc.)

---

## 6. Data Privacy Considerations

### Meeting Attendance

- Attendance visible only to group members
- Admins can see full list with timestamps
- Non-admins see count only (optional setting)
- Attendance data retained for 1 year, then anonymized

### Activity Tracking

- Activity logs are internal (not exposed to other users)
- Admin activity status visible to members (for governance)
- No individual activity details shared

---

## 7. Future Enhancements

### Attendance Insights (V2+)

- Attendance trends over time
- "Most attended meetings" analytics
- Personal attendance streak
- Chair attendance tracking

### Gamification (V3+)

- Attendance badges (10, 25, 50, 100 meetings)
- "Perfect month" achievements
- Group attendance milestones

---

## References

- [ROADMAP.md](./ROADMAP.md) - V2.2 Meeting Enhancements
- [activityTracker.ts](../mobile/src/services/activityTracker.ts) - Current implementation
- [schema.ts](../mobile/src/types/schema.ts) - MeetingInstanceDocument
