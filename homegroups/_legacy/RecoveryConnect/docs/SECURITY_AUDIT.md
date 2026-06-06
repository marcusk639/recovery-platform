> ⚠️ **Legacy document.** Carried over from the standalone `RecoveryConnect` repository, archived on 2026-06-06. Historical reference only — may be outdated and is NOT part of current `homegroups` documentation.

# Firestore Security Rules Audit

**Date:** 2026-02-22 (updated; originally 2026-02-19)
**Status:** Complete

---

## Collection Access Matrix

| Collection | Read | Create | Update | Delete |
|------------|------|--------|--------|--------|
| users | Owner + SuperAdmin | Owner | Owner (no privilege fields) | Never |
| groups | Anyone (discovery) | SuperAdmin | GroupAdmin | Never |
| groups/servicePositions | GroupMember | GroupAdmin | GroupAdmin | GroupAdmin |
| groups/treasurerHandoffs | GroupMember | GroupTreasurer | Status-driven participants | Never |
| groups/sponsorshipRequests | GroupMember | Self | Sponsor + Admin | Admin |
| groups/events | GroupMember | GroupAdmin | GroupAdmin | GroupAdmin |
| groups/literature | GroupMember | Admin/Treasurer | Admin/Treasurer | Admin/Treasurer |
| groups/donations | Donor + Admin/Treasurer | Never (Cloud Functions) | Donor + Admin | Never |
| members | GroupMember + SuperAdmin | Self (no privilege fields) | Self (limited) + Admin | Self + Admin |
| meetings | Anyone (discovery) | GroupAdmin | GroupAdmin | GroupAdmin |
| meetingInstances | Anyone (discovery) | GroupAdmin | GroupAdmin | GroupAdmin |
| announcements | GroupMember | GroupAdmin | GroupAdmin | GroupAdmin |
| transactions | GroupMember | Admin/Treasurer (validated) | Admin/Treasurer (immutable fields) | Never (audit) |
| treasury_overviews | GroupMember | Never (Cloud Functions) | Never | Never |
| direct_message_threads | Participants | Participants (2 only) | Participants (no participant change) | Never |
| direct_message_threads/messages | Participants | Sender (rate limited) | Sender + readBy only | Sender |
| group_chats | GroupMember | GroupMember | GroupMember (limited fields) | Never |
| group_chats/messages | GroupMember | Member + senderId + groupId (rate limited) | Sender + readBy | Sender + Admin |
| notifications | Owner | Never (Cloud Functions) | Owner | Owner |
| business_meetings | GroupMember | GroupAdmin | GroupAdmin | GroupAdmin |
| business_meetings/agenda | GroupMember (via parent lookup) | GroupAdmin | GroupAdmin | GroupAdmin |
| business_meetings/decisions | Anyone (meeting minutes) | GroupAdmin | GroupAdmin | GroupAdmin |
| reports | Admin + SuperAdmin | GroupMember (self) | Admin | Never |
| user_bans | Admin + SuperAdmin | Admin + SuperAdmin | Admin + SuperAdmin | Never |
| admin_removal_requests | GroupMember | Never (Cloud Functions) | TargetAdmin (response fields only) | Never |
| admin_removal_requests/votes | GroupMember (via parent lookup) | Never (Cloud Functions) | Never | Never |
| sponsorships | Participants + SuperAdmin | Participants | Participants | Never |
| groupInvites | Authenticated | Never (Cloud Functions) | Never | Never |
| financial_reports | GroupMember | Admin/Treasurer | Admin/Treasurer | Never |
| literature | Anyone | SuperAdmin | SuperAdmin | SuperAdmin |

**Collections managed exclusively by Cloud Functions (Admin SDK — catch-all deny applies to clients):**
- `processed_stripe_events` — Stripe webhook idempotency
- `stripe_disputes` — Stripe dispute tracking
- `na-meetings` — External meeting data import

---

## Vulnerabilities Fixed (2026-02-19)

### 1. User Privilege Escalation — CRITICAL
**Issue:** `allow update: if isOwner(userId)` allowed a user to set `superAdmin: true` on their own document.
**Fix:** Added `isValidUserUpdate()` function blocking changes to `superAdmin`, `role`, `isAdmin`, `isTreasurer`.

### 2. Group Chat Update Scope — MEDIUM
**Issue:** Any member could overwrite any field on the group_chats document.
**Fix:** Restricted update to `['readStatus', 'updatedAt', 'lastMessageAt', 'lastMessage', 'participantCount']` only.

### 3. Direct Message Participant Tampering — MEDIUM
**Issue:** Thread `update` allowed participants to change the `participants` map.
**Fix:** Added `request.resource.data.participants == resource.data.participants` immutability check.

### 4. Transaction Field Tampering — MEDIUM
**Issue:** Admin/treasurer could change `groupId`, `createdBy`, `createdAt` or set invalid `amount`/`type`.
**Fix:** Added immutability checks for audit fields, `amount > 0`, `type in ['income', 'expense']`.

### 5. Group Chat Message groupId Spoofing — LOW
**Issue:** Message `create` didn't validate that `groupId` in body matched the path.
**Fix:** Added `request.resource.data.groupId == groupId` validation.

### 6. Transaction Create Validation — LOW
**Issue:** No field validation on create — could create transactions with `amount: 0` or missing fields.
**Fix:** Added `hasAll([...required])`, `amount > 0`, `type` enum, `createdBy == request.auth.uid`.

---

## Vulnerabilities Fixed (2026-02-22)

### 7. Fallback Function Null Check — LOW
**Issue:** `isGroupAdminFallback()` and `isGroupTreasurerFallback()` checked `memberDoc != null`.
In Firestore security rules, `get()` never returns `null` — it returns a resource object. The
correct guard is `memberDoc.data != null` (which is `null` for non-existent documents). While
null propagation meant the bug did not cause incorrect access, it was misleading and differed
from documented Firestore rules behavior.
**Fix:** Changed `memberDoc != null` to `memberDoc.data != null` in both fallback functions.

### 8. Rate Limiting Hook — LOW (preventive)
**Issue:** No hook in the rules for future rate limiting enforcement on message creation.
**Fix:** Added `notSpamming()` placeholder function with explanatory comment. Applied to
`group_chats/messages` and `direct_message_threads/messages` create rules. True enforcement
requires Cloud Functions; this documents the intent and makes adding limits easier later.

---

## Remaining Accepted Risks

- **meetings / meetingInstances / groups**: `allow read: if true` — intentional for group discovery.
- **business_meetings/decisions**: `allow read: if true` — meeting minutes are public record.
- **Rate limiting**: Requires Cloud Functions. Application-level controls handle this for now.
  The `notSpamming()` hook is in place for future tightening.
- **Claims byte limit**: Users in 30+ groups may fall back to document reads. Monitor at scale.
- **Transaction category validation**: The `category` field accepts any string. Enum validation
  would require maintaining the list in rules; currently handled at the application layer.
- **financial_reports field validation**: No field-level validation on create/update.
  Admin/Treasurer role gates are the primary control; field validation is application-layer.

---

## Out-of-scope Collections (Admin SDK Only)

The following collections are written exclusively by Cloud Functions via the Admin SDK
(which bypasses Firestore security rules). The catch-all deny rule prevents any direct
client access, which is the correct and intended behavior.

- `processed_stripe_events`
- `stripe_disputes`
- `na-meetings`

---

## 2026-02-22 Follow-up Audit

### Changes Made

**1. Added `notSpamming()` rate-limit placeholder (Task 6)**

A `notSpamming()` helper function was added to the rules. It currently returns `true` as a placeholder — Firestore security rules cannot track write rates across requests. The function is wired into the `create` rules for:
- `group_chats/{groupId}/messages`
- `direct_message_threads/{threadId}/messages`

This establishes the pattern so it can be replaced with real enforcement (e.g., an App Check + Cloud Function gate) without changing the rule structure.

### Verified Already Implemented (no changes needed)

| Task | Status | Notes |
|------|--------|-------|
| `isValidUserUpdate()` helper | EXISTS | Blocks `superAdmin`, `role`, `isAdmin`, `isTreasurer` |
| User collection hardening | COMPLETE | read=owner+superAdmin, create=self, update=owner+isValidUserUpdate, delete=false |
| Group chat update field restriction | COMPLETE | hasOnly `readStatus`, `updatedAt`, `lastMessageAt`, `lastMessage`, `participantCount` |
| Group chat message senderId validation | COMPLETE | `senderId == request.auth.uid && groupId == groupId` |
| DM thread participants immutability | COMPLETE | `request.resource.data.participants == resource.data.participants` |
| DM thread exactly-2-participants | COMPLETE | `participants.size() == 2` |
| DM message senderId validation | COMPLETE | `senderId == request.auth.uid` |
| Transaction delete prevention | COMPLETE | `allow delete: if false` |
| Transaction required field validation | COMPLETE | `hasAll([...])`, `amount > 0`, `type` enum, `createdBy == uid` |
| Transaction immutable audit fields | COMPLETE | `groupId`, `createdBy`, `createdAt` cannot change on update |
| Security rules tests | COMPLETE | `functions/src/tests/security-rules.test.ts` (919 lines, comprehensive) |

### Remaining Accepted Risks (unchanged)

- `meetings`, `meetingInstances`, `groups`: `allow read: if true` — intentional for group/meeting discovery
- `business_meetings/decisions`: `allow read: if true` — meeting minutes are public record in AA tradition
- `literature` (global catalog): `allow read: if true` — public catalog
- **Rate limiting**: `notSpamming()` is a placeholder; true enforcement requires Cloud Functions + App Check
- **Claims byte limit**: Users in 30+ groups fall back to document reads. Monitor at scale.

---

## Testing

Security rules tests: `functions/src/tests/security-rules.test.ts`

```bash
cd functions && npm run test:rules
```

The canonical test file is `functions/src/tests/security-rules.test.ts`.
Jest discovers it via `rootDir: src` in `jest.config.js`.

### Test Coverage

| Collection | Covered |
|------------|---------|
| users | Yes (read own, read other, superAdmin, create, update, delete, privilege escalation) |
| groups | Yes (public read, admin update, non-admin update, delete) |
| members | Yes (member read, non-member, self-join, privilege escalation, admin update, leave, kick) |
| announcements | Yes (member read, non-member, admin create, member create denied) |
| transactions | Yes (member read, treasurer create, member create denied, delete denied) |
| direct_message_threads | Yes (participant read, non-participant, create, participant count) |
| group_chats/messages | Yes (member read, non-member, send, spoof senderId, sender delete, admin delete) |
| reports | Yes (admin read, member read denied, superAdmin, member create, delete denied) |
| sponsorships | Yes (sponsor read, sponsee read, outsider, update, delete denied) |
| groupInvites | Yes (auth read, unauth read denied, create denied, delete denied) |
| admin_removal_requests | Yes (member read, non-member, create denied, targetAdmin update, other update denied) |
| financial_reports | Yes (member read, non-member, admin/treasurer create, member create denied, delete denied) |
| user_bans | Yes (admin read, member read denied, superAdmin, admin create, delete denied) |
