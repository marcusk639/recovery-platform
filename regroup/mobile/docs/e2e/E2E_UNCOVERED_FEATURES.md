# E2E Test Plan - Uncovered Features

**Date:** February 12, 2026
**Status:** Gap Analysis for Future Test Coverage
**Current Coverage:** 11 critical paths implemented, ~65% target coverage

---

## Overview

This document identifies all features in the RATS app that are **fully implemented** but **NOT covered** by the current E2E test plan. These features should be added in future test phases to achieve 80%+ coverage.

**Current State:**

- ✅ 11 Critical Paths Covered
- ❌ 15+ Major Features Uncovered
- 📊 Current Coverage: ~35% of features
- 🎯 Target Coverage: 80%+

---

## HIGH PRIORITY - Implemented Features Without Tests

**What It Does:**

- Guests can submit complaints
- Admins can view and respond to complaints
- Complaint history and resolution tracking
- Different complaint types (guest, house, admin)

**Screens:**

- Complaints screen
- Submit complaint form
- Complaint detail/response screen

**Critical Flows to Test:**

- Guest submits complaint
- Admin views complaints
- Admin replies to complaint
- Complaint resolution
- Complaint history
- Anonymous vs named complaints
- Complaint notifications

**Files:**

- Screens: `src/screens/Complaints/` (likely)
- Entities: Complaint entity
- Services: Complaint CRUD

**Why Important:** Complaints are essential for house accountability and addressing guest concerns. This is a critical communication channel between guests and management.

---

### 1. Weekly Reports

**What It Does:**

- Automatic weekly report generation
- Aggregates all guest statistics for the week
- Shows phase progression
- Displays compliance metrics
- Report viewing and history

**Screens:**

- Weekly reports list
- Report detail view
- Report generation screen (admin)

**Critical Flows to Test:**

- Weekly report auto-generation
- Report data accuracy (aggregation of all activities)
- Report viewing by guest
- Report viewing by admin (all guests)
- Historical reports
- Report filtering by date range
- Phase progression reflected in reports

**Files:**

- Entities: `src/entities/WeeklyReport.tsx`
- Services: Report generation logic
- Screens: Report viewing screens

**Why Important:** Weekly reports are used for accountability meetings, court reporting, and phase advancement decisions. Data accuracy is critical.

---

### 2. Meeting Search & Discovery

**What It Does:**

- Search NA/AA meetings by location
- Filter meetings by type, time, distance
- Save favorite meetings
- Get directions to meetings
- View meeting details (address, time, format)

**Screens:**

- Meeting search screen
- Meeting detail screen
- Favorites list

**Critical Flows to Test:**

- Search meetings by location
- Filter by meeting type (NA, AA, etc.)
- Filter by day/time
- Distance filtering
- Save meeting to favorites
- Remove from favorites
- View meeting details
- Get directions (integration with maps)

**Files:**

- Screens: Meeting search screens
- Entities: `src/entities/Meeting.tsx`
- Services: Meeting search API

**Why Important:** Finding meetings is essential for recovery. Guests need easy access to meeting information to maintain sobriety.

---

### 3. Notification System

**What It Does:**

- Push notifications for various events
- In-app notification center
- Notification types: dispute, meeting, verification, message
- Read/unread status tracking
- Notification preferences

**Screens:**

- Notifications screen
- Notification detail
- Notification settings

**Critical Flows to Test:**

- Receive dispute notification
- Receive verification notification
- Receive meeting reminder notification
- Receive message notification
- Mark notification as read
- Clear all notifications
- Notification preferences (enable/disable types)
- Push notification delivery (when app is closed)

**Files:**

- Entities: `src/entities/Notification.tsx`
- Services: Notification delivery
- Screens: Notification center

**Why Important:** Notifications ensure guests and admins stay informed about critical events. Missed notifications could mean missed meetings or unresolved disputes.

---

### 4. Supporter Role Features

**What It Does:**

- Supporter role assignment (sponsor, mentor, counselor)
- Supporter can view assigned guest's progress
- Limited permissions (more than guest, less than admin)
- Supporter messaging with guest
- View guest activities (read-only)

**Screens:**

- Supporter assignment screen
- Supporter dashboard
- Guest progress view (supporter perspective)

**Critical Flows to Test:**

- Admin assigns supporter to guest
- Supporter logs in and views assigned guests
- Supporter views guest activities (read-only)
- Supporter cannot modify guest data
- Supporter cannot access admin features
- Supporter can message assigned guest
- Guest can message their supporter

**Files:**

- Role definition in authorization system
- Supporter-specific screens
- Permission checks throughout app

**Why Important:** Supporters play a critical role in guest recovery. They need appropriate access to monitor progress without full admin privileges.

---

### 5. House Chat (Group Messaging)

**What It Does:**

- House-wide group chat
- All house members can participate
- Message history
- Image/photo attachments
- Read receipts
- Message notifications

**Screens:**

- House chat screen
- Image viewer for attachments

**Critical Flows to Test:**

- Guest sends message to house chat
- Admin sends message to house chat
- All house members receive message
- Image attachment upload
- Image viewing
- Message history scrolling
- Real-time message delivery
- Read receipts
- Notifications for new messages

**Files:**

- Screens: `src/screens/HouseChat/` (likely)
- Real-time messaging service
- Image upload handling

**Why Important:** House chat is critical for house communication, announcements, and community building.

---

### 6. Direct Messaging (1-on-1)

**What It Does:**

- Private messaging between users
- Guest ↔ Admin DM
- Guest ↔ Supporter DM
- Message threads
- Message notifications
- Image attachments

**Screens:**

- Direct messages list (threads)
- Chat screen
- Image viewer

**Critical Flows to Test:**

- Guest sends DM to admin
- Admin sends DM to guest
- Message thread persistence
- Image attachments
- Real-time delivery
- Notifications for new DMs
- Guest cannot DM another guest (if restricted)
- Supporter can DM assigned guest only

**Files:**

- Screens: `src/screens/DirectChat/`
- Hooks: `src/hooks/useChatLogic.ts`
- Direct message service

**Why Important:** Direct messaging is essential for private communication between guests and staff about sensitive issues.

---

### 7. Subscription Management (Operator)

**What It Does:**

- SuperAdmin manages house subscriptions
- Plan selection (starter, professional, enterprise)
- Payment processing integration
- Subscription status verification
- Billing history
- Plan upgrades/downgrades

**Screens:**

- Subscription management screen
- Plan selection screen
- Payment screen
- Billing history

**Critical Flows to Test:**

- Operator views subscription status
- Operator selects subscription plan
- Payment processing (may need mocking)
- Subscription activation
- Plan upgrade
- Plan downgrade
- View billing history
- Subscription renewal
- Failed payment handling

**Files:**

- Subscription management screens
- Payment integration service
- Subscription validation

**Why Important:** Subscription management ensures houses can access the app. Payment failures could lock out entire houses.

---

### 8. House Search

**What It Does:**

- Search for recovery houses by location
- Filter by gender (men's/women's)
- Filter by house type
- Distance filtering
- View house details (capacity, amenities, contact)
- Contact house administrators

**Screens:**

- House search screen
- House detail screen
- Contact form

**Critical Flows to Test:**

- Search houses by location (zip code, city, state)
- Filter by gender
- Filter by house type
- Distance filtering
- View house details
- Contact house administrator
- Save favorite houses
- Map view of houses

**Files:**

- House search screens
- House directory service
- Location/distance calculations

**Why Important:** House search helps guests find appropriate recovery housing. Critical for onboarding new residents.

---

## MEDIUM PRIORITY - Edge Cases & Advanced Features

### 1. Issue Management System

**What It Does:**

- Guests and admins can create issues (maintenance, house, guest-related)
- Issues can be flagged as emergency
- Track issue status (open, in progress, resolved)
- Issue assignment and resolution workflow

**Screens:**

- Issues list screen
- Create issue form
- Issue detail/resolution screen

**Critical Flows to Test:**

- Guest creates maintenance issue
- Admin creates house issue
- Emergency issue flagging
- Issue assignment to admin
- Issue resolution workflow
- Issue filtering and search
- Notifications for issue updates

**Files:**

- Screens: `src/screens/Issues/` (likely)
- Entities: Issue entity
- Services: Issue CRUD operations

**Why Important:** Issues are critical for house maintenance and guest safety. Emergency issues require immediate attention.

---

### 2. Complaint System

### 11. Deep Linking Edge Cases

**What It Does:**

- Handle various deep link scenarios
- Expired invite links
- Invalid tokens
- Malformed URLs
- Already-used invite links

**Critical Flows to Test:**

- Open expired invite link → Show error message
- Open invalid invite link → Show error message
- Open already-used invite → Show appropriate message
- Open deep link when not authenticated → Redirect to login, then to target
- Open deep link when authenticated → Navigate directly to target
- Malformed deep link → Graceful error handling

**Files:**

- `src/services/native-deep-links.ts`
- Deep link routing configuration

**Why Important:** Poor deep link handling leads to confused users and failed onboarding.

---

### 12. Photo/Video Uploads

**What It Does:**

- Upload user avatar
- Upload house photos
- Upload images in chat
- Image compression
- Storage in Firebase Storage

**Critical Flows to Test:**

- Upload avatar photo (select from gallery)
- Upload avatar photo (take with camera)
- Upload house photo (admin only)
- Upload image in chat
- Large image handling (compression)
- Failed upload handling
- Delete uploaded image
- View uploaded images

**Files:**

- Image upload utilities
- Firebase Storage integration
- Image picker/camera components

**Why Important:** Images are important for user profiles and house listings. Failed uploads frustrate users.

---

### 13. Organization Multi-House Operations

**What It Does:**

- Operators manage multiple houses under one organization
- Bulk operations across houses
- Organization-level reporting
- Cross-house admin assignments

**Critical Flows to Test:**

- Operator creates organization
- Add multiple houses to organization
- View organization-level reports
- Assign admin to multiple houses
- Bulk invite to multiple houses
- Switch between organization houses

**Files:**

- Organization entity
- Multi-house management screens
- Organization services

**Why Important:** Organizations (like Oxford House) need to manage many houses efficiently.

---

### 14. Concurrent Operations

**What It Does:**

- Handle multiple users logging activities simultaneously
- Prevent race conditions
- Optimistic locking
- Conflict resolution

**Critical Flows to Test:**

- Two guests log chore completion at same time
- Admin verifies activity while guest is editing it
- Multiple admins resolve same dispute simultaneously
- Conflict detection and resolution
- Data consistency after concurrent operations

**Files:**

- Activity logging service
- Database transaction handling
- Conflict resolution logic

**Why Important:** Race conditions can cause data loss or corruption. Critical for data integrity.

---

### 15. Data Integrity & Soft Deletes

**What It Does:**

- Soft delete instead of hard delete
- Data recovery
- Audit trails
- Optimistic locking
- Transaction rollback on errors

**Critical Flows to Test:**

- Delete guest → Soft delete, can recover
- Delete activity → Soft delete, can recover
- Failed transaction → Rollback, no partial data
- Optimistic lock conflict → Retry or notify user
- Audit trail → All changes logged

**Files:**

- CRUD services with soft delete
- Transaction handling
- Audit logging

**Why Important:** Data loss is unacceptable in recovery housing. All data must be recoverable.

---

## LOWER PRIORITY - Nice-to-Have Features

### 16. Settings & Preferences

**What It Does:**

- User preferences (language, notifications)
- Theme selection
- Privacy settings
- Account settings

**Critical Flows to Test:**

- Change language
- Toggle notification types
- Update privacy settings
- Change password
- Update email
- Delete account

---

### 17. Help & Support

**What It Does:**

- In-app help documentation
- FAQs
- Contact support
- Tutorial/onboarding flow

**Critical Flows to Test:**

- View help documentation
- Search FAQs
- Submit support request
- Complete onboarding tutorial

---

### 18. Offline Mode

**What It Does:**

- Limited functionality when offline
- Queue operations for later sync
- Show offline indicator
- Sync when back online

**Critical Flows to Test:**

- Log activity while offline → Syncs when online
- View cached data while offline
- Queue multiple operations while offline
- Sync all queued operations when back online
- Handle sync conflicts

---

## Summary Statistics

### Coverage Breakdown

**Currently Covered (11 Paths):**

1. Sign Up (non-invite)
2. Login
3. Sign Up via Invite
4. Guest Stat Updates (4 activity types)
5. Inviting a Guest
6. Inviting a Manager
7. House Creation
8. Dispute/Challenge System
9. Activity Verification
10. Authorization/RBAC
11. Medication Tracking

**Not Covered - High Priority (10 Features):**

1. Issue Management
2. Complaint System
3. Weekly Reports
4. Meeting Search
5. Notifications
6. Supporter Role
7. House Chat
8. Direct Messaging
9. Subscription Management
10. House Search

**Not Covered - Medium Priority (5 Features):**

1. Deep Linking Edge Cases
2. Photo/Video Uploads
3. Organization Multi-House Ops
4. Concurrent Operations
5. Data Integrity/Soft Deletes

**Not Covered - Lower Priority (3 Features):**

1. Settings & Preferences
2. Help & Support
3. Offline Mode

### Total Feature Count

- **Total Features:** 29 major features identified
- **Covered:** 11 features (38%)
- **Not Covered:** 18 features (62%)

### Path to 80% Coverage

To achieve 80% coverage, we need to add:

- **Phase 6:** Communication features (House Chat, DMs, Notifications) - 3 features
- **Phase 7:** Accountability features (Issues, Complaints, Reports) - 3 features
- **Phase 8:** Discovery features (Meeting Search, House Search, Supporter) - 3 features
- **Phase 9:** Operator features (Subscriptions, Org Management) - 2 features
- **Phase 10:** Edge cases & data integrity - 5 features

**After Phase 10:** 27/29 features covered = 93% coverage

---

## Recommended Prioritization

### Next Phase (Phase 6)

**Focus: Communication Infrastructure**

- House Chat
- Direct Messaging
- Notification System

**Rationale:** Communication is critical for house operations. These features are used daily by all users.

### Phase 7

**Focus: Accountability & Reporting**

- Issue Management
- Complaint System
- Weekly Reports

**Rationale:** These features support house management and accountability processes.

### Phase 8

**Focus: Discovery & Support**

- Meeting Search
- House Search
- Supporter Role Features

**Rationale:** These features help guests find resources and support their recovery.

### Phase 9

**Focus: Operator & Business**

- Subscription Management
- Organization Multi-House Operations

**Rationale:** Business-critical for operators managing multiple houses.

### Phase 10

**Focus: Robustness & Edge Cases**

- Deep Linking Edge Cases
- Photo/Video Uploads
- Concurrent Operations
- Data Integrity
- Offline Mode

**Rationale:** These ensure app stability and handle edge cases that could cause failures.

---

**Document Status:** Comprehensive Gap Analysis
**Last Updated:** February 12, 2026
**Next Action:** Prioritize Phase 6 features and begin test plan development
