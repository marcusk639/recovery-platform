# Homegroups — CORE cluster flowcharts

Product: Homegroups — React Native mobile + Firebase Functions. Firebase project `recovery-connect-cad4b`.
Each diagram traces the single most representative happy path per feature. All node labels carry a verified `file:line`.

Path conventions: mobile files under `mobile/src/`, functions under `functions/src/`.

---

## Authentication & Onboarding

Primary happy path: **email sign-up**. Screen creates the Firebase Auth user + Firestore user doc; the `onUserCreated` auth trigger fires for SSO auto-join; `syncUserClaims` is the on-demand claims refresh.

```mermaid
flowchart TD
    A["AuthNavigator Register screen<br/>mobile/src/navigation/AuthNavigator.tsx:26"] --> B["signUp thunk<br/>mobile/src/store/slices/authSlice.ts:409"]
    B --> C["auth().createUserWithEmailAndPassword<br/>mobile/src/store/slices/authSlice.ts:420"]
    C --> D["userCredential.user.updateProfile displayName<br/>mobile/src/store/slices/authSlice.ts:425"]
    D --> E["UserModel.create writes users/{uid}<br/>mobile/src/store/slices/authSlice.ts:429"]
    E --> F["dispatch fetchUserData<br/>mobile/src/store/slices/authSlice.ts:436"]
    F --> G["signUp.fulfilled sets state.user<br/>mobile/src/store/slices/authSlice.ts:931"]

    C -. Auth user created .-> H["onUserCreated auth trigger<br/>functions/src/triggers/auth/onUserCreated.ts:11"]
    H --> I{"SSO domain enabled?<br/>functions/src/triggers/auth/onUserCreated.ts:18"}
    I -- no --> Z1["return (no-op)<br/>functions/src/triggers/auth/onUserCreated.ts:19"]
    I -- yes --> J["set members/{groupId}_{uid}<br/>functions/src/triggers/auth/onUserCreated.ts:38"]
    J --> K["users/{uid}.homeGroups arrayUnion<br/>functions/src/triggers/auth/onUserCreated.ts:53"]
    K --> L["add sso_join_log event<br/>functions/src/triggers/auth/onUserCreated.ts:62"]
    J -. member doc write .-> M["onMemberWrite rebuilds claims<br/>functions/src/triggers/firestore/onMemberWrite.ts:115"]

    G -. later, on demand .-> N["auth.ts syncUserClaims helper<br/>mobile/src/services/firebase/auth.ts:142"]
    N --> O["syncUserClaims callable<br/>functions/src/callable/syncUserClaims.ts:34"]
    O --> P["query members where userId==uid<br/>functions/src/callable/syncUserClaims.ts:62"]
    P --> Q["setCustomUserClaims (memberGroups/adminGroups/treasurerGroups)<br/>functions/src/callable/syncUserClaims.ts:68"]

    B -. error .-> ERR["rejectWithValue → signUp.rejected<br/>mobile/src/store/slices/authSlice.ts:936"]
```

**External deps:**

- Firebase Auth (`createUserWithEmailAndPassword`, `setCustomUserClaims`).
- Firestore writes: `users/{uid}`, `members/{groupId}_{uid}`, `sso_join_log/{intergroupId}/events`.
- Claims change: `onMemberWrite` and `syncUserClaims` both call `setCustomUserClaims` (1000-byte limit; rules fall back to doc reads when exceeded).
- No FCM, no Stripe on this path. SSO auto-join is gated on the `sso_domain_index/{domain}` doc.

---

## Group Management & Governance

Primary happy path: **create a group with subscription** (`createGroupWithSubscription`). Touches Stripe (customer + subscription), batches group/member/meeting writes, then `onMemberWrite` syncs admin claims and `onGroupCreate*` triggers run geo/meeting side effects.

```mermaid
flowchart TD
    A["MainTabNavigator Home tab → GroupStackNavigator<br/>mobile/src/navigation/MainTabNavigator.tsx:364"] --> B["createGroup thunk<br/>mobile/src/store/slices/groupsSlice.ts:123"]
    B --> C["httpsCallable('createGroupWithSubscription')<br/>mobile/src/store/slices/groupsSlice.ts:148"]
    C --> D["createGroupWithSubscription callable<br/>functions/src/callable/createGroupWithSubscription.ts:24"]
    D --> E["stripe.customers.create (idempotent grp-{id}-customer)<br/>functions/src/callable/createGroupWithSubscription.ts:89"]
    E --> F["getDefaultPriceForProduct(productIdGroup)<br/>functions/src/callable/createGroupWithSubscription.ts:126"]
    F --> G["stripe.subscriptions.create (trial)<br/>functions/src/callable/createGroupWithSubscription.ts:134"]
    G --> H["batch.set groups/{groupId}<br/>functions/src/callable/createGroupWithSubscription.ts:182"]
    H --> I["batch.set members/{groupId}_{uid} isAdmin:true<br/>functions/src/callable/createGroupWithSubscription.ts:205"]
    I --> J["batch.set meetings/{meetingId} ×N<br/>functions/src/callable/createGroupWithSubscription.ts:210"]
    J --> K["batch.commit<br/>functions/src/callable/createGroupWithSubscription.ts:220"]
    K --> L["servicePositions batch: Treasurer + Secretary<br/>functions/src/callable/createGroupWithSubscription.ts:259"]
    L --> M["return {groupId, subscriptionId, group}<br/>functions/src/callable/createGroupWithSubscription.ts:271"]

    I -. member doc write .-> N["onMemberWrite rebuilds admin claims<br/>functions/src/triggers/firestore/onMemberWrite.ts:115"]
    H -. group doc create .-> O["onGroupCreateSetGeolocation<br/>functions/src/triggers/firestore/onGroupCreate.ts:14"]

    M -. error after sub created .-> P["compensate: stripe.subscriptions.cancel<br/>functions/src/callable/createGroupWithSubscription.ts:290"]
    M --> Q["createGroup thunk resolves → groupsSlice state<br/>mobile/src/store/slices/groupsSlice.ts:123"]
```

**External deps:**

- **Stripe**: customer + flat-rate $12/yr subscription (`productIdGroup`, runtime price via `getDefaultPriceForProduct`). Compensating cancel on Firestore failure.
- Firestore writes: `groups/{groupId}`, `members/{groupId}_{uid}`, `meetings/{meetingId}`, `groups/{groupId}/servicePositions/*`.
- Claims change: `onMemberWrite` grants admin claim to creator.
- `onGroupCreateSetGeolocation` geocodes the group (`onGroupCreateFetchMeetings` is the commented-out sibling). Governance callables (`castElectionVote.ts:28`, `castConscienceVote.ts:27`, `ratifyBylaws.ts:30`, `joinGroupByInviteCode.ts:14`) are secondary flows off the same group entity.

---

## Meetings & Attendance / QR Check-in

Primary happy path: **QR / attendance check-in** (`checkInToMeeting`). A secretary's QR deep link (or the Edit Meeting Instance screen) calls the callable; it verifies membership, atomically adds the attendee, and stamps activity.

```mermaid
flowchart TD
    A["MainTabNavigator Meetings tab → MeetingsScreen<br/>mobile/src/navigation/MainTabNavigator.tsx:398"] --> B["handleCheckIn (EditMeetingInstanceScreen / QR scan)<br/>mobile/src/screens/homegroup/EditMeetingInstanceScreen.tsx:105"]
    B --> C["httpsCallable('checkInToMeeting')({instanceId})<br/>mobile/src/screens/homegroup/EditMeetingInstanceScreen.tsx:113"]
    C --> D["checkInToMeeting callable<br/>functions/src/callable/checkInToMeeting.ts:30"]
    D --> E{"member of group?<br/>functions/src/callable/checkInToMeeting.ts:55"}
    E -- no --> Z1["HttpsError permission-denied<br/>functions/src/callable/checkInToMeeting.ts:58"]
    E -- yes --> F["get meetingInstances/{instanceId}<br/>functions/src/callable/checkInToMeeting.ts:65"]
    F --> G{"already in attendees?<br/>functions/src/callable/checkInToMeeting.ts:94"}
    G -- yes --> H["return alreadyCheckedIn:true<br/>functions/src/callable/checkInToMeeting.ts:95"]
    G -- no --> I["instance.update attendees arrayUnion + count increment<br/>functions/src/callable/checkInToMeeting.ts:103"]
    I --> J["users/{uid}.activityLog.lastMeetingAttendance<br/>functions/src/callable/checkInToMeeting.ts:109"]
    J --> K["return {attendeeCount}<br/>functions/src/callable/checkInToMeeting.ts:121"]
    K --> L["screen updates attendee count UI<br/>mobile/src/screens/homegroup/EditMeetingInstanceScreen.tsx:113"]

    A -. discovery flow .-> M["fetchMeetings thunk<br/>mobile/src/store/slices/meetingsSlice.ts:98"]
    M --> N["findMeetings callable<br/>functions/src/callable/findMeetings.ts:151"]
```

**External deps:**

- Firestore writes: `meetingInstances/{instanceId}` (`attendees` arrayUnion, `attendeeCount` increment), `users/{uid}.activityLog`. Composite index on `meetingInstances` (groupId, attendees CONTAINS, scheduledAt).
- Auth required; membership enforced via `members/{groupId}_{uid}`. QR deep link is unsigned (trust model: members trusted within group).
- No FCM/Stripe on this path. Sibling callables: `recordCheckIn.ts:18`, `searchGroupsByLocation.ts:36`; HTTP `getMeetingAttendance.ts:108` (Regroup bearer-token export), `googlePlacesProxy.ts:47` (Places lookup for discovery).

---

## Recovery Tracking

Primary happy path: **record a milestone / sobriety chip** (`recordMilestone`). Admin records a chip for a member from the milestones screen; callable verifies admin + active subscription, upserts the milestone doc, then notifies via FCM.

```mermaid
flowchart TD
    A["MainTabNavigator Profile tab → ProfileNavigator (recovery surfaces)<br/>mobile/src/navigation/MainTabNavigator.tsx:430"] --> B["handleRecordMilestone (GroupMilestonesScreen)<br/>mobile/src/screens/homegroup/GroupMilestonesScreen.tsx:166"]
    B --> C["httpsCallable('recordMilestone')(...)<br/>mobile/src/screens/homegroup/GroupMilestonesScreen.tsx:184"]
    C --> D["recordMilestoneHandler<br/>functions/src/callable/recordMilestone.ts:66"]
    D --> E{"caller is group admin?<br/>functions/src/callable/recordMilestone.ts:104"}
    E -- no --> Z1["HttpsError permission-denied<br/>functions/src/callable/recordMilestone.ts:112"]
    E -- yes --> F["assertGroupActive (subscription check)<br/>functions/src/callable/recordMilestone.ts:119"]
    F --> G["load target member doc<br/>functions/src/callable/recordMilestone.ts:122"]
    G --> H["computeNextMilestoneDate<br/>functions/src/callable/recordMilestone.ts:167"]
    H --> I["upsert groups/{groupId}/milestones/{memberId}<br/>functions/src/callable/recordMilestone.ts:182"]
    I --> J["FCM to member + celebration-enabled members<br/>functions/src/callable/recordMilestone.ts:64"]
    J --> K["return result → screen refresh<br/>mobile/src/screens/homegroup/GroupMilestonesScreen.tsx:184"]

    A -. read flow .-> L["getMilestones callable<br/>functions/src/callable/getMilestones.ts:173"]
    L --> M["getMilestonesHandler<br/>functions/src/callable/getMilestones.ts:51"]
```

**External deps:**

- Firestore writes: `groups/{groupId}/milestones/{memberId}` (arrayUnion of milestone records + nextMilestone fields).
- **FCM**: push to the member and to opted-in group members (celebrations).
- Stripe (indirect): `assertGroupActive` blocks recording when the group subscription is inactive.
- Sibling recovery callables: `getMilestones.ts:173`, `grantSponsorStepAccess.ts:139` (sponsorshipSlice / stepWorkSlice / reflectionsSlice are local step-work + reflection state, no callable on the chip path).

---

## Moderation & Admin

Primary happy path: **submit a report**, fanning out to the `onReportCreate` trigger which notifies group admins via FCM.

```mermaid
flowchart TD
    A["MainTabNavigator AdminPanel tab → AdminPanelScreen<br/>mobile/src/navigation/MainTabNavigator.tsx:443"] --> B["submitReport thunk<br/>mobile/src/store/slices/reportsSlice.ts:81"]
    B --> C["ReportModel.createReport<br/>mobile/src/store/slices/reportsSlice.ts:85"]
    C --> D["write reports/{reportId}<br/>mobile/src/models/ReportModel.ts:143"]
    D -. report doc create .-> E["onReportCreate trigger<br/>functions/src/triggers/firestore/onReportCreate.ts:10"]
    E --> F["get group + admins<br/>functions/src/triggers/firestore/onReportCreate.ts:32"]
    F --> G{"admins to notify?<br/>functions/src/triggers/firestore/onReportCreate.ts:43"}
    G -- no --> Z1["return (no-op)<br/>functions/src/triggers/firestore/onReportCreate.ts:44"]
    G -- yes --> H["collect admin FCM tokens<br/>functions/src/triggers/firestore/onReportCreate.ts:49"]
    H --> I["FCM notify admins + repeat-offender check<br/>functions/src/triggers/firestore/onReportCreate.ts:54"]

    A -. enforcement flow .-> J["banUser callable<br/>functions/src/callable/banUser.ts:30"]
    A -. admin removal vote .-> K["initiateAdminRemoval callable<br/>functions/src/callable/initiateAdminRemoval.ts:22"]
    K -. admin request doc .-> L["onAdminRequestCreate trigger<br/>functions/src/triggers/firestore/onAdminRequestCreate.ts:70"]
    K --> M["voteOnAdminRemoval callable<br/>functions/src/callable/voteOnAdminRemoval.ts:15"]
```

**External deps:**

- Firestore writes: `reports/{reportId}`.
- **FCM**: push to group admins on new report.
- Sibling moderation callables: `banUser.ts:30`, `setUserAsSuperAdmin.ts:16` (super-admin claim change), `initiateAdminRemoval.ts:22` + `voteOnAdminRemoval.ts:15` (governance vote, fanning through `onAdminRequestCreate.ts:70`).

---

## Messaging & Announcements

Primary happy path: **create a group announcement**, fanning out through `onAnnouncementCreate` which sends FCM to all eligible members and stamps `notificationSentAt`.

```mermaid
flowchart TD
    A["MainTabNavigator Messages tab → MessagesNavigator<br/>mobile/src/navigation/MainTabNavigator.tsx:416"] --> B["createAnnouncement thunk<br/>mobile/src/store/slices/announcementsSlice.ts:96"]
    B --> C["AnnouncementModel.createAnnouncement<br/>mobile/src/store/slices/announcementsSlice.ts:111"]
    C --> D["write announcements/{announcementId}<br/>mobile/src/models/AnnouncementModel.ts:259"]
    D -. announcement doc create .-> E["onAnnouncementCreate trigger<br/>functions/src/triggers/firestore/onAnnouncementCreate.ts:46"]
    E --> F{"status == scheduled?<br/>functions/src/triggers/firestore/onAnnouncementCreate.ts:56"}
    F -- yes --> Z1["skip (publisher cron handles)<br/>functions/src/triggers/firestore/onAnnouncementCreate.ts:56"]
    F -- no --> G["query members where groupId==<br/>functions/src/triggers/firestore/onAnnouncementCreate.ts:78"]
    G --> H["fetch user docs, filter prefs + tokens<br/>functions/src/triggers/firestore/onAnnouncementCreate.ts:101"]
    H --> I["messaging.sendEachForMulticast<br/>functions/src/triggers/firestore/onAnnouncementCreate.ts:140"]
    I --> J["update announcement.notificationSentAt<br/>functions/src/triggers/firestore/onAnnouncementCreate.ts:175"]
    I --> K["pruneStaleTokens on failures<br/>functions/src/triggers/firestore/onAnnouncementCreate.ts:183"]

    B -. fulfilled .-> L["createAnnouncement.fulfilled → announcementsSlice state<br/>mobile/src/store/slices/announcementsSlice.ts:250"]

    A -. DM path .-> M["onDirectMessageCreate trigger<br/>functions/src/triggers/firestore/onDirectMessageCreate.ts:34"]
    A -. callable push .-> N["sendAnnouncementNotification callable<br/>functions/src/callable/sendAnnouncementNotification.ts:34"]
    A -. mentions .-> O["sendMentionNotifications callable<br/>functions/src/callable/sendMentionNotifications.ts:26"]
```

**External deps:**

- Firestore writes: `announcements/{announcementId}` (create + `notificationSentAt` stamp).
- **FCM**: `sendEachForMulticast` to all eligible group members (respects `notificationSettings.announcements` + `allowPushNotifications`); `pruneStaleTokens` (`functions/src/utils/fcm.ts`) cleans dead tokens.
- `notificationSentAt` is the de-dup guard so the `sendAnnouncementNotification.ts:34` callable won't double-send. Sibling messaging flows: `onDirectMessageCreate.ts:34` (DM push, chatSlice/directMessagesSlice), `sendMentionNotifications.ts:26` (mention push).
