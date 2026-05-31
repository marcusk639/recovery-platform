---
archived: true
archived_at: 2026-05-25
archived_reason: Plan shipped; tracked DONE in docs/plans/README.md (with PR# or commit ref). Preserved for historical reference.
original_path: docs/plans/2026-02-04-v1-announcement-read-tracking.md
---

# Announcement Read Tracking Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Show admins how many members have read each announcement.

**Architecture:** Track readBy array on announcement document, update when member views announcement detail, display count to admins.

**Tech Stack:** React Native, Firestore, Redux

**Priority:** V1.3
**Estimated Effort:** 4-6 hours
**Revenue Impact:** Retention - Admins want engagement visibility

---

## Task 1: Update Announcement Schema

**Files:**
- Modify: `mobile/src/types/schema.ts`

```typescript
export interface AnnouncementDocument {
  // ... existing fields ...
  readBy?: string[];  // Array of user IDs who have read
  readCount?: number; // Denormalized count
}
```

**Commit:** `feat(announcements): add read tracking to schema`

---

## Task 2: Create Read Tracking Function

**Files:**
- Modify: `mobile/src/models/AnnouncementModel.ts`

```typescript
export async function markAnnouncementAsRead(
  announcementId: string,
  userId: string
): Promise<void> {
  const ref = firestore().collection('announcements').doc(announcementId);

  await ref.update({
    readBy: firestore.FieldValue.arrayUnion(userId),
    readCount: firestore.FieldValue.increment(1),
  });
}
```

**Commit:** `feat(announcements): add markAsRead function`

---

## Task 3: Track Read on Announcement View

**Files:**
- Modify: `mobile/src/screens/homegroup/AnnouncementDetailScreen.tsx`

```typescript
useEffect(() => {
  const currentUser = auth().currentUser;
  if (currentUser && announcement) {
    // Only mark as read if not already read
    if (!announcement.readBy?.includes(currentUser.uid)) {
      markAnnouncementAsRead(announcement.id, currentUser.uid);
      // Track activity
      trackActivity(currentUser.uid, 'announcement_read', groupId);
    }
  }
}, [announcement?.id]);
```

**Commit:** `feat(announcements): track read on view`

---

## Task 4: Display Read Count to Admins

**Files:**
- Modify: `mobile/src/components/announcements/AnnouncementCard.tsx`

```typescript
{isAdmin && (
  <View style={styles.readCount}>
    <Icon name="eye" size={14} color={colors.textSecondary} />
    <Text style={styles.readCountText}>
      {announcement.readCount || 0} of {memberCount} read
    </Text>
  </View>
)}
```

**Commit:** `feat(announcements): display read count to admins`

---

## Task 5: Update Firestore Rules

Allow members to update readBy only for adding themselves:

```javascript
allow update: if isGroupMember(resource.data.groupId) &&
  request.resource.data.diff(resource.data).affectedKeys().hasOnly(['readBy', 'readCount']) &&
  request.auth.uid in request.resource.data.readBy;
```

**Commit:** `security(announcements): allow self-read tracking`

---

## Review Prompt

```
Review announcement read tracking:

1. TEST READING:
   - Open announcement as member
   - Verify readBy includes your userId
   - Verify readCount incremented

2. TEST DISPLAY:
   - As admin, view announcement list
   - Verify "X of Y read" displays
   - Open announcement - verify count updates

3. TEST IDEMPOTENCY:
   - Open same announcement twice
   - Verify count doesn't increment twice

4. FIX ANY ISSUES before marking complete

Report: [PASS/FAIL] with details
```
