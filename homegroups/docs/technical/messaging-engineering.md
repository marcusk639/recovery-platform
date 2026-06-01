# Messaging (Group Chat + Direct Messages) — Engineering Notes

**Last updated:** 2026-02-05  
**Scope:** Mobile messaging implementation, known issues, and production readiness considerations.

This document consolidates and replaces:
- `docs/CHAT_FEATURES_ANALYSIS.md`
- `docs/DIRECT_MESSAGING_REVIEW.md`

---

## Feature overview

**Messaging surfaces**
- **Group chat**: group-scoped chat with mentions and moderation expectations.
- **Direct messages (DMs)**: 1:1 threads with unread counts + read state.

**Shared UI/components**
- `ChatMediaPickerScreen` (attachments)
- `MessageBubble`, `MessageInput`, `ReactionPicker`, `ImageViewer`
- `ReportContentModal`

---

## Current parity snapshot (high-level)

| Capability | Group chat | DMs | Notes |
|---|---:|---:|---|
| Text messages | ✅ | ✅ |  |
| Attachments | ✅ | ✅ | via shared media picker |
| Reply | ✅ | ✅ | reply-to data consistency matters |
| Reactions | ✅ | ✅ |  |
| Delete message | ✅ | ✅ | admin-vs-sender differs by context |
| Real-time updates | ✅ | ✅ | snapshot listeners |
| Optimistic send | ✅ | ✅ | ensure optimistic cleanup |
| Mentions | ✅ | N/A |  |
| Read receipts / unread counts | ⚠️ | ✅ | group chat unread tracking is an enhancement |

---

## Must-fix before production (security)

### Firestore rules must not be open

Both the chat and DM analyses flagged that messaging rules were (at least at one point) disabled/too-open during development.

**Requirement:** Before production, ensure `firestore.rules` enforces:
- DMs: only thread participants can read/write
- Group chat: only group members can read/write
- No global `allow read, write: if true` catch-all

**How to validate**
- Run emulator rules tests (`functions/src/tests/security-rules.test.ts`)
- Manually verify:
  - non-participant cannot read a DM thread/messages
  - non-member cannot read a group’s chat/messages

---

## Known engineering issues / follow-ups

### P1: Group chat unread tracking

**Why it matters:** Enables notifications/badges and reduces “noisy” re-engagement patterns.

**Typical options**
- Track per-user `lastReadAt` per group chat + derive unread count server-side or client-side.
- Maintain `unreadCounts` per group member (more writes, faster UI).

### P2: Rate limiting / abuse control

**Risk:** Unlimited message sending can enable spam/abuse and inflate costs.

**Mitigations**
- Client-side throttling (UX)
- Server-side enforcement via rules/Cloud Functions patterns (preferred for abuse resistance)

### P2: DM conversations performance

**Problem pattern:** “refresh entire conversation list on any thread update” doesn’t scale.

**Preferred approach**
- Update only changed thread(s) using `snapshot.docChanges()` and upsert the affected conversation entity.
- Add server-side pagination using a stable cursor (e.g., `updatedAt`) with required composite indexes.

### P2: Unread count race conditions

If read-marking is called rapidly, counts can drift.

**Preferred approach**
- Use Firestore transactions for “mark as read + decrement unread” semantics.

### P3: Thread archiving/deletion UX

Not strictly required, but expected for user control and safety.

---

## Test checklist (messaging)

**Group chat**
- Send text, send attachments (preview → confirm)
- Reply/reactions/delete
- Mentions + mention notifications (if enabled)
- Banned user cannot send (enforcement path)

**DMs**
- Create thread, send text/attachments
- Optimistic send does not duplicate when listener returns real message
- Unread count increments/decrements correctly
- Access control: only participants can read/write

