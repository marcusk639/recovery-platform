# Homegroups: Application Overview & Feature Breakdown

## 1. Introduction

Homegroups is a mobile application (iOS & Android) built with React Native and Firebase, designed specifically for 12-step recovery homegroups (like AA, NA, etc.). Its primary goal is to provide essential tools for group communication, meeting management, and basic operations (like treasury) while strictly adhering to the principles of anonymity and group autonomy central to these fellowships.

The app aims to solve common operational challenges faced by groups without resorting to public social media platforms, offering a private, secure, and focused environment.

## 2. Core Philosophy & Principles

- **Anonymity First:** User profiles default to minimal information (first name/initial). Sharing further details (phone, sobriety date) is optional and controlled per-group. End-to-end encryption is planned for sensitive communications. No social media integration.
- **Group Autonomy:** The app provides tools, but the group retains control over its information, membership, and finances. Features are designed to support, not dictate, group processes.
- **Simplicity & Accessibility:** Tools, especially for admin roles (Secretary, Treasurer), are designed to be intuitive and easy to use, minimizing the burden on rotating service members.
- **Reliability:** Core information like meeting schedules and announcements must be accurate and readily available, including considerations for offline access where feasible.
- **Focus:** Avoid feature bloat; concentrate on solving the core operational pain points identified by homegroups.

## 3. Architecture Overview

- **Mobile Frontend:** React Native (TypeScript) for cross-platform iOS and Android development. State managed via Redux Toolkit.
- **Web Frontend:** React (JavaScript/TypeScript) currently serving primarily as a landing page and for hosting necessary files (e.g., `apple-app-site-association`). Potential future use for admin dashboards.
- **Backend:** Firebase Firestore (Database), Firebase Authentication, Firebase Cloud Functions (Node.js/TypeScript), Firebase Cloud Messaging (Push Notifications), Firebase Hosting (Web).
- **Styling:** React Native StyleSheet API.
- **Navigation:** React Navigation.
- **Testing:** Detox planned for E2E testing (requires `testID` props added to components).

## 4. Feature Breakdown

### 4.1. Core User Experience

- **Authentication:**
  - **Flows:** Secure registration (Email/Password, Google, Apple, potentially Facebook), Login, Forgot Password.
  - **Anonymity:** Enforces first name/initial during registration, with options for further privacy.
  - **State Management:** Redux (`authSlice`) handles user state and session persistence. `UserModel` manages Firestore interactions.
- **Profile Management (`ProfileScreen`, `ProfileManagementScreen`):**
  - View user details (display name, email).
  - Edit Display Name (with option for first-initial only).
  - Set/Update/Clear Sobriety Date (stored securely).
  - Manage Privacy Settings:
    - Toggle visibility of Sobriety Date/Time within groups.
    - Toggle visibility of Phone Number within groups.
    - Toggle ability to receive Direct Messages.
  - Manage Notification Preferences (handled via `UserModel` and `authSlice`).
  - Upload/Change Profile Photo (stored in Firebase Storage, URL in Firestore).
  - Sign Out.
- **Sobriety Tracker (`SobrietyTrackerScreen`):**
  - **Requirement:** User must have set a Sobriety Date in their profile.
  - **Display:** Shows calculated sobriety time (Days, Hours, Minutes).
  - **Milestones:** Visualizes sobriety milestones (24hrs, 30d, 6m, 1yr, etc.) using stylized 2D "medallions".
  - **Progress:** Shows a progress bar indicating time until the next milestone.
  - **Celebration:** Displays a celebratory modal/animation when a user reaches a new milestone (triggered client-side).
  - **Navigation:** Accessible from the Profile screen, includes a back button.
- **Settings (Integrated into Profile):**
  - Granular controls for notification types (Meetings, Announcements, Celebrations, Mentions - implemented via `UserModel` and `authSlice`).
  - Granular controls for privacy settings (see Profile Management).

### 4.2. Meeting Discovery & Management

- **Meeting Finder (`MeetingsScreen`):**
  - **Core Function:** Allows users to find nearby or location-specific recovery meetings.
  - **Location:** Uses device Geolocation (with permission) or allows manual location search via `LocationPicker` component.
  - **Search:** Basic text search by meeting name, potentially location details.
  - **Filtering:**
    - Format (Online / In-Person toggle).
    - Program Type (AA, NA, Custom, etc. - chip selector).
    - Day of Week (chip selector).
    - Time of Day (Morning, Afternoon, Evening - chip selector, client-side filter).
  - **Display:** Shows meetings in a list format (`FlatList`), displaying formatted day/time, name, location/online status, type tags, and calculated distance.
  - **Interaction:** Tapping a meeting opens a details modal.
  - **Data Fetching:** Uses `fetchMeetings` thunk (`meetingsSlice`) which calls the `findMeetings` Cloud Function (utilizing geohash or basic queries in Firestore via `MeetingModel` helpers).
- **Meeting Details Modal (within `MeetingsScreen`):**
  - Displays comprehensive details of a selected meeting (Name, Full Address, Map Link/Directions, Online Link/Notes, Format, Type).
  - Provides a "Create Group" button if the meeting isn't already associated with a group (`groupId` is null/missing).
- **Meeting Templates (Admin/Backend):**
  - Meetings are stored as templates (`meetings` collection) with recurring info (day, time, location, etc.).
  - Includes fields for `temporaryNotice` and `isCancelledTemporarily`.
- **Meeting Instances (Admin/Backend/Schedule View):**
  - Individual occurrences of meetings are generated (`meetingInstances` collection) by a scheduled Cloud Function (`generateWeeklyMeetingInstances`) based on templates.
  - Instances store specific date/time (`scheduledAt`), inherit template data, but allow overrides (`instanceNotice`, `isCancelled`).
  - An `onUpdate` Cloud Function (`updateFutureMeetingInstances`) propagates relevant template changes (e.g., location, format) to future instances or regenerates instances if the day/time changes.
- **Group Schedule Screen (`GroupScheduleScreen`):**
  - Displays upcoming meeting _instances_ for the next week fetched from Firestore via `fetchUpcomingMeetingInstances` thunk.
  - Clearly shows the specific date and time for each upcoming meeting.
  - Indicates if an instance is cancelled or has a specific notice.
  - **(Planned):** Will allow Admins to assign a Chairperson to an instance.

### 4.3. Group Management & Membership

- **Group Discovery (`GroupSearchScreen`):**
  - Allows users to search for existing groups (distinct from meeting search).
  - Uses location-based search (Cloud Function `searchGroupsByLocation` with geohashing).
  - Displays results with group name, description, type, location, member count, distance.
  - Provides a "Join" button.
- **Joining/Leaving Groups:**
  - Users can request to join via the `GroupSearchScreen` ("Join" button).
  - Backend logic (likely within `GroupModel.addMember` called via a Redux thunk) adds the user to the group's members list/subcollection and updates the user's `homeGroups` array.
  - Users can leave a group via the `GroupOverviewScreen` ("Leave Group" button), triggering a Redux action (`leaveGroup`) that calls `GroupModel.removeMember`.
- **Group List (`GroupsListScreen`):**
  - Displays a list of groups the current user is a member of.
  - Fetches data via `fetchUserGroups` thunk (`groupsSlice`).
  - Shows group name, description, member count, and an "Admin" badge if the user is an admin.
  - Provides navigation to `GroupOverview`, `CreateGroup`, and `GroupSearch`.
- **Group Overview (`GroupOverviewScreen`):**
  - The central hub for a specific group.
  - Displays basic group info (name, description, location, type, founded date, member count).
  - Shows upcoming meeting _instances_ (next 3).
  - Shows recent announcements (latest 2).
  - Shows upcoming member celebrations (anniversaries, birthdays - requires `fetchGroupMilestones`).
  - Provides navigation tiles/buttons to other group sections (Members, Announcements, Treasury, Schedule, Chat, Literature (disabled), Service Positions).
  - **Admin Actions:** If the user is an admin, shows buttons to "Edit Group Details" and "Manage Members" (currently placeholder).
  - **Group Claiming:** Displays a "Claim Admin Access" button if the group is unclaimed (`isClaimed: false` or empty `admins` array) and the user hasn't already requested access. Triggers `requestGroupAdminAccess` action. Shows "Admin request pending" if a request exists.
- **Member List (`GroupMembersScreen`):**
  - Displays a list of all group members, fetched via `fetchGroupMembers`.
  - Shows member name, photo/initials, position (if any), sobriety date (if shared), and admin status.
  - Admins see options to manage other members (Make/Remove Admin, Remove from Group - currently placeholders or basic implementation via `GroupModel`).
  - Provides an "Invite Member" button for admins, triggering the `GroupInviteModal`.
- **Member Details (`MemberDetailScreen`):**
  - Shows detailed view of a specific member (fetched via `selectMemberById`).
  - Displays name, position, sobriety date/time (if shared), joined date.
  - Displays phone number (if shared) with buttons to Call/Text via device's default apps (`Linking`).
  - Shows Admin Actions for admins viewing other members (Make/Remove Admin, Remove Member).
- **Group Creation (`CreateGroupScreen`):**
  - Multi-step wizard to create a new group.
  - Step 1: Basic info (Name, Description, Type - including custom).
  - Step 2: Add one or more meeting schedules (Day, Time, Format, Location/Link).
  - Step 3: Set the primary group location (use first meeting's location or specify a custom one).
  - Dispatches `createGroup` action (`groupsSlice`) which calls `GroupModel.create`. `GroupModel` handles creating the group doc, adding the initial meeting templates, and adding the creator as the first admin/member.
- **Group Editing (`GroupEditDetailsScreen`):**
  - Allows admins to modify group name, description, and location details.
  - Uses `LocationPicker` component for address/coordinate input.
  - Dispatches `updateGroup` action (`groupsSlice`) which calls `GroupModel.update`.
- **Service Positions (`GroupServicePositionsScreen`):**
  - Lists defined service positions for the group (Secretary, Treasurer, etc.).
  - Displays current holder and term dates (if set).
  - Allows admins to:
    - Add new position definitions (via `createServicePosition` thunk).
    - Edit positions (assign/unassign members, set dates - via `updateServicePosition` thunk).
    - Delete position definitions (via `deleteServicePosition` thunk).
  - Uses `ServicePositionModel` and `servicePositionsSlice`.
- **Assign Chairperson (`AssignChairpersonScreen` - Planned UI):**
  - Accessible by admins from the `GroupScheduleScreen` (button needs adding).
  - Displays a list of group members.
  - Allows selecting one member (or "Clear") to be the chairperson for a _specific meeting instance_.
  - Calls `MeetingModel.updateInstanceChairperson` (potentially via a new `updateMeetingInstance` thunk in `meetingsSlice`).

### 4.4. Group Communication

- **Announcements (`GroupAnnouncementsScreen`):**
  - Displays a list of official group announcements, fetched via `fetchAnnouncementsForGroup`.
  - Admins can create new announcements (Title, Content, Pin option) via `createAnnouncement` thunk.
  - Admins can delete announcements via `deleteAnnouncement` thunk.
  - Uses `AnnouncementModel` and `announcementsSlice`.
  - **(Planned):** Push notifications for new announcements.
- **Group Chat (`GroupChatScreen`):**
  - Real-time messaging within the group.
  - Displays messages, sender name/avatar, timestamps.
  - Supports replying to specific messages.
  - Supports basic reactions (like 👍, ❤️, etc.).
  - Supports sending/displaying image attachments (requires further work/libraries).
  - Supports @mentions:
    - Typing `@Name` highlights matching members (basic implementation, needs UI improvement).
    - Stores `mentionedUserIds` with the message.
    - Cloud Function `triggerMentionNotification` (callable) is invoked by the sender to send push notifications to mentioned users.
  - Admins can delete any message. Users can delete their own (permissions managed in `ChatModel`).
  - Fetches/manages messages via `chatSlice` and `ChatModel`.
  - **(Planned/Considered):** End-to-End Encryption (Significant complexity, impacts mentions/search).
- **Chat Info (`GroupChatInfoScreen`):**
  - Accessible from `GroupChatScreen` header.
  - Displays list of chat participants (group members).
  - Provides link back to `GroupOverviewScreen`.
  - Includes toggle for chat notifications (currently UI only, needs backend integration).

### 4.5. Treasury Management

- **Treasury Overview (`GroupTreasuryScreen`):**
  - Displays key financial stats: Current Balance, Prudent Reserve, Monthly Income, Monthly Expenses.
  - Fetches data via `fetchTreasuryStats` thunk (`treasurySlice`) which calls `TreasuryModel.getTreasuryStats`.
  - Displays a list of recent transactions fetched via `fetchGroupTransactions`.
  - Provides "Add Transaction" button for Admins/Treasurers.
- **Add Transaction (`AddTransactionScreen`):**
  - Simple form for entering Income or Expenses.
  - Fields: Type (Income/Expense toggle), Amount, Category (Picker with predefined lists), Description (Optional), Date (DatePicker).
  - Dispatches `addTransaction` thunk (`transactionsSlice`) which calls `TreasuryModel.createTransaction`. `TreasuryModel` updates the overview stats automatically.
- **(Planned):** Basic Reporting (generating simple monthly summaries).
- **(Planned):** Treasurer Handoff mechanism.

### 4.6. Admin & Infrastructure

- **Group Claiming & Admin Panel:**
  - Unclaimed groups can be requested by users via `GroupOverviewScreen`.
  - Requests are stored in `pendingAdminRequests` on the `GroupDocument`.
  - A dedicated `AdminPanelScreen` (accessible only via tab bar for users with `superAdmin` custom claim) displays pending requests.
  - Super admins can Approve/Deny requests or Directly Assign admins via the panel, triggering `GroupModel` methods (`approveAdminRequest`, `denyAdminRequest`, `assignAdmin`).
- **Deep Linking (Invites):**
  - Admins can generate invite links/codes via `GroupInviteModal`.
  - Uses `generateGroupInvite` Cloud Function to create an invite record and a standard web link (`https://recoveryconnect.app/join?code=XYZ`).
  - Uses `sendGroupInviteEmail` Cloud Function to email the link.
  - App handles incoming links (`/join?code=...`) via `Linking` listeners in `App.tsx`.
  - The `handleDeepLink` function parses the code, verifies auth, and calls `joinGroupByInviteCode` Cloud Function to add the user to the group and update the invite status. Navigates user to the group upon success.
  - Requires native setup (Associated Domains on iOS, potentially `assetlinks.json` on Android) and website configuration (`apple-app-site-association` hosted via Firebase).
- **Push Notifications:**
  - Uses `@react-native-firebase/messaging`.
  - Permission requested on app start after login (`App.tsx`).
  - FCM token fetched and stored in user's Firestore document (`users/{userId}/fcmTokens`) via `updateFcmToken` thunk (`authSlice`) calling `UserModel.addFcmToken`.
  - **Implemented:** @Mention notifications (triggered by `triggerMentionNotification` callable function, sent by `sendMentionNotifications` Firestore trigger - _Correction_: Should only use the callable function approach now).
  - **(Planned):** Notifications for Announcements, Meeting Reminders, Celebrations. Requires respective Cloud Function triggers.
- **Web Hosting:**
  - React web app in `/web` directory.
  - Hosted using Firebase Hosting.
  - Configured (`firebase.json`) to serve `web/build` directory.
  - Includes SPA rewrites (`"destination": "/index.html"`).
  - Serves `apple-app-site-association` from `/.well-known/` with correct content type.

## 5. Data Model Overview

- **`users`:** Stores user profile information, settings, list of joined groups, FCM tokens, auth details.
- **`groups`:** Stores core group information, location, meeting template references (implicitly via `meetings.groupId`), admin/treasurer lists, claim status, pending requests, subscription details.
- **`meetings`:** Stores meeting _templates_ (recurring day, time, location, format, etc.).
- **`meetingInstances`:** Stores specific, scheduled occurrences of meetings generated from templates, including overrides (cancellations, notices, chairperson).
- **`members`:** (Top-level collection) Stores membership details linking users to groups (`{groupId}_{userId}` document ID), including group-specific roles or privacy settings.
- **`announcements`:** (Top-level collection) Stores group announcements, linked by `groupId`.
- **`transactions`:** (Top-level collection) Stores all financial transactions, linked by `groupId`.
- **`treasury_overviews`:** (Document ID = Group ID) Stores aggregated treasury stats (balance, reserve, monthly totals) for quick lookups. Updated by triggers or model logic.
- **`groupInvites`:** Stores generated invite codes, their status, expiry, and associated group.
- **`group_chats`:** (Document ID = Group ID) Stores metadata about a group chat (e.g., last message timestamp - potentially deprecated if using message listeners directly).
- **`group_chats/{groupId}/messages`:** Subcollection storing actual chat messages (encrypted planned, currently plaintext with `mentionedUserIds`).
- **`groups/{groupId}/servicePositions`:** Subcollection storing defined service roles for a group.

## 6. Future Considerations / TODOs

- Robust Business Meeting Tools (Agendas, Minutes, Voting).
- Digital 7th Tradition Collection Integration (Stripe/PayPal).
- Advanced Treasury Reporting (Category breakdowns, date ranges).
- Literature References/Inventory.
- End-to-End Encryption for Chat/Direct Messages.
- Sponsorship Features (Linking sponsors/sponsees within the app).
- Refined Onboarding Experience.
- More comprehensive E2E testing coverage.
- Implement remaining planned Push Notifications.
- UI/UX Polish across all screens.
- Full implementation of Admin actions (Manage Members, Edit Position assignments).
- Moderation tools for user-generated content.
- Offline support improvements.

This document provides a detailed snapshot of the Homegroups application's features, architecture, and planned development.
