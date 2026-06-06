> ⚠️ **Legacy document.** Carried over from the standalone `RecoveryConnect` repository, archived on 2026-06-06. Historical reference only — may be outdated and is NOT part of current `homegroups` documentation.

# Push Notifications & Treasury Features

This document outlines the implementation of announcement push notifications, treasury PDF report generation, and the treasurer handoff workflow.

---

## Table of Contents

1. [Announcement Push Notifications](#1-announcement-push-notifications)
2. [Treasury Report Generation (PDF)](#2-treasury-report-generation-pdf)
3. [Treasurer Handoff Flow](#3-treasurer-handoff-flow)
4. [File Reference](#4-file-reference)
5. [Dependencies](#5-dependencies)

---

## 1. Announcement Push Notifications

### Overview

When an admin creates a new announcement for a group, push notifications are automatically sent to all group members who have notifications enabled.

### Architecture

```
Mobile App                     Cloud Function                    Firebase
    |                              |                                |
    |-- Create Announcement ------>|                                |
    |                              |                                |
    |-- Call sendAnnouncementNotification --->|                     |
    |                              |-- Query group members -------->|
    |                              |-- Get FCM tokens ------------->|
    |                              |-- Send multicast ------------->|
    |                              |                                |
    |<-------- Push Notification delivered -----------------------|
```

### Cloud Function

**File:** `functions/src/callable/sendAnnouncementNotification.ts`

**Parameters:**
| Parameter | Type | Description |
|-----------|------|-------------|
| `groupId` | string | The ID of the group |
| `announcementId` | string | The ID of the created announcement |
| `title` | string | Announcement title |
| `body` | string | Announcement content |
| `authorId` | string | User ID of the author (excluded from notifications) |

**Behavior:**
1. Validates input parameters
2. Fetches group information for the notification title
3. Queries all members of the group from the `members` collection
4. Filters out the author and members who have disabled announcement notifications
5. Collects FCM tokens from eligible users (respects `notificationSettings.announcements`)
6. Sends multicast notification via Firebase Cloud Messaging
7. Returns success count and failure count

**Notification Payload:**
```typescript
{
  notification: {
    title: "📣 [Group Name]",
    body: "[Title]: [Truncated Body]"
  },
  data: {
    type: "announcement",
    groupId: string,
    announcementId: string
  }
}
```

### Mobile Integration

**File:** `mobile/src/store/slices/announcementsSlice.ts`

The `createAnnouncement` thunk was modified to call the cloud function after successfully creating an announcement:

```typescript
// After creating announcement in Firestore
const sendNotification = functions().httpsCallable('sendAnnouncementNotification');
await sendNotification({
  groupId: data.groupId,
  announcementId: newAnnouncement.id,
  title: data.title,
  body: data.content,
  authorId: data.userId,
});
```

Notification failures are caught and logged but do not fail the announcement creation.

### User Preferences

Users can disable announcement notifications via their profile settings:
- `notificationSettings.announcements` - Controls announcement notifications
- `notificationSettings.allowPushNotifications` - Global push notification toggle

---

## 2. Treasury Report Generation (PDF)

### Overview

Treasurers and group members can generate professional PDF financial reports for any date range. Reports are uploaded to Firebase Storage and accessible via a signed URL.

### Architecture

```
Mobile App                     Cloud Function              Firebase Storage
    |                              |                            |
    |-- Request Report ----------->|                            |
    |   (groupId, dates)           |                            |
    |                              |-- Fetch transactions ----->|
    |                              |-- Calculate summaries      |
    |                              |-- Generate PDF (PDFKit)    |
    |                              |-- Upload to Storage ------>|
    |                              |-- Get signed URL <---------|
    |<---- Return download URL ----|                            |
```

### Cloud Function

**File:** `functions/src/callable/generateTreasuryReport.ts`

**Parameters:**
| Parameter | Type | Description |
|-----------|------|-------------|
| `groupId` | string | The ID of the group |
| `startDate` | string | ISO date string (YYYY-MM-DD) |
| `endDate` | string | ISO date string (YYYY-MM-DD) |

**Returns:**
```typescript
{
  success: boolean;
  downloadUrl: string; // Signed URL, expires in 1 hour
  summary: {
    startingBalance: number;
    totalIncome: number;
    totalExpenses: number;
    endingBalance: number;
    prudentReserve: number;
    transactionCount: number;
  }
}
```

**PDF Contents:**
1. **Header** - Group name, date range
2. **Financial Summary Box**
   - Starting Balance
   - Total Income (green)
   - Total Expenses (red)
   - Ending Balance
   - Prudent Reserve
   - Available Funds
3. **Income by Category** - Sorted by total, includes transaction counts
4. **Expenses by Category** - Sorted by total, includes transaction counts
5. **Transaction Details** - Paginated table with date, type, description, amount
6. **Footer** - Generation timestamp

**Storage Path:** `treasury-reports/{groupId}/{timestamp}_treasury_report.pdf`

### Mobile Screen

**File:** `mobile/src/screens/homegroup/TreasuryReportScreen.tsx`

**Features:**
- Date range picker with calendar UI
- Quick preset buttons: Last Month, This Month, Last Quarter, This Year
- Generate Report button with loading state
- Summary card showing key metrics after generation
- View Report button (opens in browser/PDF viewer)
- Share Report button (native share sheet)
- Info note about 1-hour URL expiration

**Navigation:** Accessible from `GroupTreasuryScreen` via "Generate Report" button

### Permissions

- User must be authenticated
- User must be a member of the group (verified via `members` collection or `admins`/`treasurers` arrays)

---

## 3. Treasurer Handoff Flow

### Overview

Allows current treasurers to transfer their role to another group member through a secure, audited process with notifications.

### State Machine

```
                    ┌─────────────┐
                    │   Active    │
                    │ (Treasurer) │
                    └──────┬──────┘
                           │
                    Initiate Handoff
                           │
                           ▼
                    ┌─────────────┐
        ┌───────────│   Pending   │───────────┐
        │           │   Handoff   │           │
        │           └─────────────┘           │
        │                                     │
   Cancel/Decline                       Accept Handoff
        │                                     │
        ▼                                     ▼
 ┌─────────────┐                       ┌─────────────┐
 │   Active    │                       │  Completed  │
 │(No Change)  │                       │(New Treas.) │
 └─────────────┘                       └─────────────┘
```

### Data Model

**Pending Handoff** (stored on group document):
```typescript
pendingTreasurerHandoff?: {
  fromUserId: string;
  fromUserName: string;
  toUserId: string;
  toUserName: string;
  initiatedAt: Timestamp;
  message?: string;
}
```

**Audit Log Entry** (subcollection `groups/{groupId}/auditLog`):
```typescript
{
  type: "treasurer_handoff_completed" | "treasurer_handoff_cancelled";
  fromUserId: string;
  fromUserName: string;
  toUserId: string;
  toUserName: string;
  performedBy: string;
  timestamp: Timestamp;
}
```

### Cloud Functions

#### initiateTreasurerHandoff

**File:** `functions/src/callable/initiateTreasurerHandoff.ts`

**Parameters:**
| Parameter | Type | Description |
|-----------|------|-------------|
| `groupId` | string | The ID of the group |
| `toUserId` | string | User ID of the new treasurer |
| `message` | string? | Optional message to the recipient |

**Validations:**
- User is authenticated
- User is a current treasurer
- No existing pending handoff
- Target user is a group member
- Cannot transfer to self

**Actions:**
1. Creates `pendingTreasurerHandoff` on group document
2. Sends push notification to target user

#### completeTreasurerHandoff

**File:** `functions/src/callable/completeTreasurerHandoff.ts`

**Parameters:**
| Parameter | Type | Description |
|-----------|------|-------------|
| `groupId` | string | The ID of the group |

**Validations:**
- User is authenticated
- User is the `toUserId` of the pending handoff

**Actions (atomic transaction):**
1. Removes old treasurer from `treasurers` array
2. Adds new treasurer to `treasurers` array
3. Clears `pendingTreasurerHandoff`
4. Creates audit log entry
5. Sends notification to old treasurer

#### cancelTreasurerHandoff

**File:** `functions/src/callable/cancelTreasurerHandoff.ts`

**Parameters:**
| Parameter | Type | Description |
|-----------|------|-------------|
| `groupId` | string | The ID of the group |

**Validations:**
- User is authenticated
- User is either `fromUserId` or `toUserId` of the pending handoff

**Actions:**
1. Clears `pendingTreasurerHandoff`
2. Creates audit log entry
3. Sends notification to the other party

### Mobile Screen

**File:** `mobile/src/screens/homegroup/TreasurerHandoffScreen.tsx`

**Three View States:**

1. **Initiator View** (current treasurer, no pending handoff)
   - Search/filter members list
   - Select member to transfer to
   - Optional message field
   - "Initiate Transfer" button

2. **Pending Initiator View** (waiting for acceptance)
   - Shows pending status with spinner
   - "Cancel Transfer" button

3. **Recipient View** (pending handoff target)
   - Shows who is transferring the role
   - Optional message display
   - Responsibilities checklist
   - "Accept" and "Decline" buttons

**Navigation:** Accessible from `GroupTreasuryScreen` via "Transfer Treasurer Role" button (only visible to treasurers)

### Pending Handoff Banner

**File:** `mobile/src/screens/homegroup/GroupTreasuryScreen.tsx`

A banner appears on the treasury screen when there's a pending handoff:
- For the recipient: "Treasurer Role Pending - [Name] wants to transfer the role to you"
- For the initiator: "Transfer Pending - Waiting for [Name] to accept"

Tapping the banner navigates to the handoff screen.

---

## 4. File Reference

### Cloud Functions (functions/src/)

| File | Description |
|------|-------------|
| `callable/sendAnnouncementNotification.ts` | Sends push notifications for new announcements |
| `callable/generateTreasuryReport.ts` | Generates and uploads PDF treasury reports |
| `callable/initiateTreasurerHandoff.ts` | Starts treasurer transfer process |
| `callable/completeTreasurerHandoff.ts` | Accepts and completes transfer |
| `callable/cancelTreasurerHandoff.ts` | Cancels/declines transfer |
| `index.ts` | Exports all cloud functions |

### Mobile App (mobile/src/)

| File | Description |
|------|-------------|
| `screens/homegroup/TreasuryReportScreen.tsx` | PDF report generation UI |
| `screens/homegroup/TreasurerHandoffScreen.tsx` | Treasurer transfer UI |
| `screens/homegroup/GroupTreasuryScreen.tsx` | Modified to add buttons and banner |
| `store/slices/announcementsSlice.ts` | Modified to trigger notifications |
| `navigation/GroupStackNavigator.tsx` | Registers new screens |
| `types/navigation/index.ts` | Route type definitions |

---

## 5. Dependencies

### Functions (package.json)

```json
{
  "dependencies": {
    "pdfkit": "^0.15.0",
    "@google-cloud/storage": "^7.7.0"
  },
  "devDependencies": {
    "@types/pdfkit": "^0.13.4"
  }
}
```

### Mobile

No new dependencies required. Uses existing:
- `@react-native-firebase/functions`
- `@react-native-firebase/firestore`
- `@react-native-community/datetimepicker`
- `react-native-share` (for report sharing)

---

## Deployment Notes

1. **Install function dependencies:**
   ```bash
   cd functions && npm install
   ```

2. **Deploy cloud functions:**
   ```bash
   firebase deploy --only functions
   ```

3. **Firebase Storage Rules:** Ensure the storage rules allow authenticated users to read from `treasury-reports/` path.

4. **Android Notification Channel:** The announcement notifications use channel ID `announcements`. Ensure this channel is created in the Android app initialization.

5. **iOS Push Configuration:** Ensure APNS certificates are properly configured for push notifications to work on iOS.
