# L9 messaging-and-notifications

Prefixes: `M/` = `regroup/mobile/src/`, `F/` = `regroup/functions/src/`, `W/` = `regroup/web/src/app/`. Rules file: `regroup/mobile/firebase/firestore.rules`.

## Path (i): server event, inbox doc, FCM, device, inbox screen

```mermaid
flowchart TD
  A["dispute event<br/>F/activities/disputeNotifications.ts:131"] --> B["notifications doc dispute_eventId_uid<br/>F/activities/disputeNotifications.ts:133"]
  A2["application created<br/>F/triggers/firestore/applicationNotice.ts:19"] --> B2["batch.set notifications<br/>F/triggers/firestore/applicationNotice.ts:40"]
  B --> C["notify onDocumentCreated<br/>F/triggers/firestore/index.ts:35"]
  B2 --> C
  C --> D["sendNotification<br/>F/util/notifications.ts:24"]
  D --> E["getUser messagingToken array<br/>F/util/notifications.ts:29"]
  E --> F1["sendEachForMulticast with notification and data.notifee<br/>F/util/notifications.ts:42"]
  F1 --> G{"per-token error<br/>F/util/notifications.ts:70"}
  G -- "invalid" --> H["removeTokens<br/>F/util/notifications.ts:93"]
  G -- "ok" --> J["Splash onFirebaseMessage<br/>M/screens/Splash/Splash.tsx:291"]
  J --> K["displayRemoteMessage, Android via notifee<br/>M/services/notifications/remoteMessage.ts:44"]
  B --> L["Notifications screen, one-shot getDocs<br/>M/screens/Notifications/Notifications.tsx:330"]
  L --> M["getUserNotifications<br/>M/services/notifications.tsx:104"]
  M --> N["mark read updateDoc<br/>M/services/notifications.tsx:120"]
  P1["push-only path A: chargeResident<br/>F/rent/chargeResident.ts:161"] --> D
  P2["push-only path B: sendFcmToHouseAdmins<br/>F/util/notifications.ts:152"]
  P3["push-only path C: sendFcmToUser inline<br/>F/webhooks/stripeWebhook.ts:116"]
  P4["push-only path D: officerTermReminder inline<br/>F/scheduled/officerTermReminder.ts:83"]
  T1["Splash getToken<br/>M/screens/Splash/Splash.tsx:124"] --> T5["arrayUnion users.messagingToken<br/>M/services/messagingToken.ts:11"]
  T7["registerDeviceToken userDeviceTokens, no caller<br/>M/services/notifications.tsx:85"]
```

## Path (ii): house chat and DMs (client-only Firestore, no server notification)

```mermaid
flowchart TD
  C1["HouseChat onSend<br/>M/screens/HouseChat/HouseChat.tsx:159"] --> C3["sendMessageToHouseChat<br/>M/services/message.tsx:83"]
  C3 --> C4["create houses/id/chat/id<br/>M/services/message.tsx:88"]
  C4 --> C7["subscribeToHouseChat on other devices<br/>M/services/message.tsx:133"]
  C4 -.->|"no trigger, no FCM"| C9["offline members never notified<br/>F/triggers/firestore/index.ts:35"]
  D1["DirectChat send<br/>M/screens/DirectChat/DirectChat.tsx:568"] --> D2["sendDirectMessage thunk<br/>M/state/slices/chatSlice.ts:75"]
  D2 --> D3["updateConversation create direct-messages/CHAT_ID/chat/id<br/>M/services/message.tsx:338"]
  D3 --> D6["ContactScreen: one listener per contact<br/>M/screens/Contacts/ContactScreen.tsx:138"]
  D3 --> D7["DirectChat listener<br/>M/screens/DirectChat/DirectChat.tsx:156"]
  D7 --> D8["recipient markRead updateDoc<br/>M/services/message.tsx:287"]
  D8 --> D9["rule: update by sender only, so recipient is denied<br/>regroup/mobile/firebase/firestore.rules:1185"]
```

## Path (iii): support intake to email

```mermaid
flowchart TD
  S1["web contact form<br/>W/components/contact/contact.component.ts:34"] --> S2["create contact/id<br/>W/services/contact/contact.service.ts:13"]
  S2 --> S4["sendContactEmail<br/>F/triggers/firestore/index.ts:131"]
  B1["Personal reportBug<br/>M/screens/Personal/Personal.tsx:237"] --> B2["create bugs/id<br/>M/services/feedback.ts:45"]
  B2 --> B3["reportBug<br/>F/triggers/firestore/index.ts:194"]
  F1["Personal sendFeedback<br/>M/screens/Personal/Personal.tsx:274"] --> F2["create feedback/id<br/>M/services/feedback.ts:38"]
  F2 --> F3["submitFeedback<br/>F/triggers/firestore/index.ts:222"]
  S4 --> S5["sendEmail, the only SendGrid caller; swallows errors<br/>F/util/email.ts:20"]
  B3 --> S5
  F3 --> S5
```

## FCM send paths (lead a, confirmed)

| Send site                                                                                   | Recipient token source                                                                                                                                                     | Payload                                               | Inbox doc                                   | Stale-token cleanup               |
| ------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------- | ------------------------------------------- | --------------------------------- |
| `sendNotification` (`F/util/notifications.ts:42`), via `notify` and `chargeResident.ts:161` | `users/{uid}.messagingToken[]`                                                                                                                                             | `notification` + Android `channelId` + `data.notifee` | via `notify`: yes; via `chargeResident`: no | yes (`:65-107`)                   |
| `sendFcmToHouseAdmins` (`F/util/notifications.ts:152-235`)                                  | house `adminIds`, `adminId`, `superAdminIds`, `superAdminId`, `ownerId`, then `users.messagingToken`. `adminIds` hold admin-record ids, not uids, so this may miss admins. | `notification` + `channelId`; no `notifee`            | no                                          | none                              |
| `sendFcmToUser` (`F/webhooks/stripeWebhook.ts:116-146`)                                     | `users/{uid}.messagingToken`                                                                                                                                               | `notification` only                                   | no                                          | none; logs the raw token (`:135`) |
| `officerTermReminder` (`F/scheduled/officerTermReminder.ts:83`)                             | `users/{uid}.messagingToken`                                                                                                                                               | `notification` + `data`; no `channelId`, no `notifee` | no                                          | yes, a second copy (`:95-123`)    |

Only `sendNotification` sets `data.notifee`. Android foreground display depends on it (`M/services/notifications/remoteMessage.ts:45-48`), so pushes from the other three paths are probably silent while the app is open. This is inferred from the code, not tested on a device.

Email has a single sender, `F/util/email.ts:20`. Three call sites hard-code the admin address instead of using `regroupEmail`: `F/callable/subscriptions.ts:328,385`, and the constant is defined at `email.ts:6`. `sendSubscriptionUpdateEmail` (`F/triggers/firestore/index.ts:161`) fires on every `users/{id}` update.

## Findings beyond duplication (to verify)

- **DM read receipts are probably denied.** The recipient calls `markRead` (`M/services/message.tsx:287-292`), but the rule allows updates by the sender only (`firestore.rules:1185`). No rules test was run.
- **Confidential complaints are readable by every member.** `firestore.rules:728-735` describes complaints as confidential. But complaints are stored in the `houses/{id}.complaints` map, and every member can read the house doc. Writes to that map replace the whole map from the client's cached copy (`M/screens/Personal/Personal.tsx:168-171,200-206`), so two concurrent filings lose one of them.
- **Notification preferences do nothing.** `notificationPrefs` has no reader on the server (`M/screens/Notifications/Notifications.tsx:303-320`). Inbox taps do not navigate anywhere, and `notify` sends no `data`.
- **PII in push payloads:**
  - The admin push includes the resident's full name (`F/webhooks/stripeWebhook.ts:658-662`).
  - The application inbox doc and push include `applicantName` (`F/triggers/firestore/applicationNotice.ts:44`).

## Within-lane duplication found

- **FCM sending:** four send implementations, two copies of the stale-token cleanup, and two admin-resolution routines. `sendFcmToHouseAdmins` uses `adminIds` (`F/util/notifications.ts:168-177`), while `applicationNotice.ts:33-35` uses `staffUids` plus `superAdminId`.
- **Device-token stores:**
  - Live: `users.messagingToken`. Every send reads it.
  - Dead: `userDeviceTokens` (`M/services/notifications.tsx:85-98`). Only account deletion touches it.
- **Chat and DM plumbing in `M/services/message.tsx`:**
  - `onChatSnapshot` (`:115`) duplicates `onHouseChatSnapshot` (`:170`).
  - `sendMessageToHouseChat` (`:83`) duplicates `updateConversation` (`:338`).
  - `loadChat` (`:187`) duplicates `loadDirectChat` (`:217`).
  - `subscribeToHouseChat` (`:133`) duplicates `subscribeToDirectChat` (`:261`).
  - Message objects are built inconsistently: plain objects at `HouseChat.tsx:104-125`, `new Message` at `chatSlice.ts:95`.
- **DM listeners:** ContactScreen opens one listener per contact (N+M in total), and DirectChat opens another on the same conversation.
- **Issues and complaints are stored in two places.**
  - The house-doc maps are live.
  - The root collections `issues` and `complaints` are legacy. `createIssue`, `createComplaint` and `removeComplaint` have no callers.
- **Dead notification code:**
  - `notificationsSlice` (dead state: `unreadCount`, `fcmToken`)
  - `addNotification` / `createInviteNotification` (reached only from a test)
  - the `notifications` argument of `updateDispute` (its only caller passes `[]`)
  - `createNotification` on the client (no caller)
- `NotificationContext` is a toast provider. It only shares the name.

## External dependencies

- L4: dispute notifications.
- L6 and L7: `stripeWebhook.ts` sends, `overdueRentNotification`, `chargeResident`.
- L8: `officerTermReminder`.
- L2: `staffUids` and invite emails.
- L1: house-doc maps.
- Account deletion: `userDeviceTokens` and `notifications`.

## Gaps

- `rentReminder.ts` and `channels.ts` were not read.
- I did not check whether any rule covers `userDeviceTokens`.
- I did not confirm that `SENDGRID_API_KEY` is bound on the webhook, subscriptions and invitations functions.
