---
archived: true
archived_at: 2026-05-25
archived_reason: Plan shipped; tracked DONE in docs/plans/README.md (with PR# or commit ref). Preserved for historical reference.
original_path: docs/plans/2026-02-04-mvp-p0-security-audit.md
---

# Firestore Security Rules Audit Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Audit and harden Firestore security rules to prevent unauthorized data access before launch.

**Architecture:** Review all collections, verify access controls match intended permissions, add missing validation rules, test with Firebase emulator.

**Tech Stack:** Firestore Security Rules, Firebase Emulator, Jest

**Priority:** P0 - MVP Blocker
**Estimated Effort:** 4-6 hours
**Revenue Impact:** Trust - Security breach would kill the app and destroy user trust

---

## Task 1: Document Current Rule Structure

**Files:**
- Read: `firestore.rules`

**Step 1: Create security audit checklist**

Review each collection and document expected access:

| Collection | Read | Create | Update | Delete |
|------------|------|--------|--------|--------|
| users | Owner + SuperAdmin | Owner | Owner | Never |
| groups | Anyone | SuperAdmin | GroupAdmin | Never |
| members | GroupMember + SuperAdmin | Self-join | Self (limited) + Admin | Self + Admin |
| meetings | Anyone | GroupAdmin | GroupAdmin | GroupAdmin |
| meetingInstances | Anyone | GroupAdmin | GroupAdmin | GroupAdmin |
| announcements | GroupMember | GroupAdmin | GroupAdmin | GroupAdmin |
| transactions | GroupMember | Admin/Treasurer | Admin/Treasurer | Never (audit) |
| group_chats | GroupMember | GroupMember | GroupMember | Never |
| group_chats/messages | GroupMember | Sender | Sender (reactions) | Sender + Admin |
| direct_message_threads | Participants | Participants | Participants | Never |
| notifications | Owner | Functions only | Owner (read status) | Owner |
| reports | SuperAdmin + GroupAdmin | GroupMember | Admin | Never |
| sponsorships | Participants + SuperAdmin | Participants | Participants | Never |
| groupInvites | Authenticated | Functions only | Functions only | Functions only |

**Step 2: Commit documentation**

Create a SECURITY_AUDIT.md with findings:

```bash
git add docs/SECURITY_AUDIT.md
git commit -m "docs: create security audit checklist"
```

---

## Task 2: Audit User Collection Rules

**Files:**
- Modify: `firestore.rules`

**Step 1: Review user document rules**

Verify these rules are in place:

```javascript
match /users/{userId} {
  // Users can only read their own document or super admins can read any
  allow read: if request.auth != null && (
    request.auth.uid == userId ||
    request.auth.token.superAdmin == true
  );

  // Users can only create their own document
  allow create: if request.auth != null && request.auth.uid == userId;

  // Users can only update their own document
  // Prevent escalation of privileges
  allow update: if request.auth != null &&
    request.auth.uid == userId &&
    // Cannot set superAdmin on self
    !('superAdmin' in request.resource.data) &&
    // Cannot modify role to admin
    (!('role' in request.resource.data) || request.resource.data.role == 'user');

  // Never allow delete (soft delete via update)
  allow delete: if false;
}
```

**Step 2: Add validation for sensitive fields**

```javascript
// Add function to validate user updates
function isValidUserUpdate() {
  let allowed = ['displayName', 'photoUrl', 'phoneNumber', 'showPhoneNumber',
    'sobrietyStartDate', 'showSobrietyDate', 'notificationSettings',
    'privacySettings', 'fcmTokens', 'sponsorSettings', 'lastActivityAt',
    'lastLoginAt', 'activityLog', 'updatedAt'];
  return request.resource.data.diff(resource.data).affectedKeys().hasOnly(allowed);
}
```

**Step 3: Commit**

```bash
git add firestore.rules
git commit -m "security: harden user collection rules"
```

---

## Task 3: Audit Group Chat Rules

**Files:**
- Modify: `firestore.rules`

**Step 1: Review group_chats rules**

```javascript
match /group_chats/{groupId} {
  // Only group members can read
  allow read: if isGroupMember(groupId);

  // Only group members can create (initialize chat)
  allow create: if isGroupMember(groupId);

  // Members can update readStatus for themselves only
  allow update: if isGroupMember(groupId) && (
    // Only updating own readStatus
    request.resource.data.diff(resource.data).affectedKeys()
      .hasOnly(['readStatus', 'updatedAt', 'lastMessageAt']) &&
    // If updating readStatus, only own entry
    (!('readStatus' in request.resource.data.diff(resource.data).affectedKeys()) ||
      request.resource.data.readStatus.diff(resource.data.readStatus).affectedKeys()
        .hasOnly([request.auth.uid]))
  );

  // Never delete chat documents
  allow delete: if false;

  // Messages subcollection
  match /messages/{messageId} {
    // Group members can read messages
    allow read: if isGroupMember(groupId);

    // Only authenticated members can create messages
    // Message sender must be the authenticated user
    allow create: if isGroupMember(groupId) &&
      request.resource.data.senderId == request.auth.uid &&
      request.resource.data.groupId == groupId;

    // Sender can update their own message (for reactions, edits)
    // Other members can update read status
    allow update: if isGroupMember(groupId) && (
      request.resource.data.senderId == request.auth.uid ||
      // Only updating reactions or read status
      request.resource.data.diff(resource.data).affectedKeys()
        .hasOnly(['reactions', 'readBy', 'updatedAt'])
    );

    // Sender or admin can delete
    allow delete: if isGroupMember(groupId) && (
      resource.data.senderId == request.auth.uid ||
      isGroupAdmin(groupId)
    );
  }
}
```

**Step 2: Commit**

```bash
git add firestore.rules
git commit -m "security: harden group chat and message rules"
```

---

## Task 4: Audit Direct Message Rules

**Files:**
- Modify: `firestore.rules`

**Step 1: Review and strengthen DM rules**

```javascript
match /direct_message_threads/{threadId} {
  // Helper to check if user is participant
  function isParticipant() {
    return request.auth.uid in resource.data.participants;
  }

  function isParticipantNew() {
    return request.auth.uid in request.resource.data.participants;
  }

  // Only participants can read
  allow read: if isParticipant();

  // Can create if user is a participant and exactly 2 participants
  allow create: if isParticipantNew() &&
    request.resource.data.participants.size() == 2;

  // Participants can update (for read status, last message)
  allow update: if isParticipant() &&
    // Cannot change participants after creation
    request.resource.data.participants == resource.data.participants;

  // Never delete threads
  allow delete: if false;

  // Messages subcollection
  match /messages/{messageId} {
    allow read: if request.auth.uid in get(/databases/$(database)/documents/direct_message_threads/$(threadId)).data.participants;

    allow create: if request.auth.uid in get(/databases/$(database)/documents/direct_message_threads/$(threadId)).data.participants &&
      request.resource.data.senderId == request.auth.uid;

    allow update: if request.auth.uid in get(/databases/$(database)/documents/direct_message_threads/$(threadId)).data.participants &&
      (request.resource.data.senderId == request.auth.uid ||
       request.resource.data.diff(resource.data).affectedKeys().hasOnly(['readBy', 'reactions']));

    allow delete: if resource.data.senderId == request.auth.uid;
  }
}
```

**Step 2: Commit**

```bash
git add firestore.rules
git commit -m "security: harden direct message rules"
```

---

## Task 5: Audit Transaction Rules (Treasury)

**Files:**
- Modify: `firestore.rules`

**Step 1: Review and fix transaction rules**

```javascript
match /transactions/{transactionId} {
  // Group members can read transactions
  allow read: if isGroupMember(resource.data.groupId);

  // Only admin or treasurer can create
  allow create: if isGroupAdminOrTreasurer(request.resource.data.groupId) &&
    // Validate required fields
    request.resource.data.keys().hasAll(['type', 'amount', 'description', 'category', 'groupId', 'createdBy', 'createdAt']) &&
    // Amount must be positive
    request.resource.data.amount > 0 &&
    // Type must be valid
    request.resource.data.type in ['income', 'expense'] &&
    // createdBy must be current user
    request.resource.data.createdBy == request.auth.uid;

  // Admin or treasurer can update (for editing)
  allow update: if isGroupAdminOrTreasurer(resource.data.groupId) &&
    // Cannot change groupId, createdBy, or createdAt
    request.resource.data.groupId == resource.data.groupId &&
    request.resource.data.createdBy == resource.data.createdBy &&
    request.resource.data.createdAt == resource.data.createdAt &&
    // Amount must remain positive
    request.resource.data.amount > 0;

  // NEVER allow delete - audit trail must be preserved
  // Use a 'deleted' flag or separate archive collection instead
  allow delete: if false;
}
```

**Step 2: Commit**

```bash
git add firestore.rules
git commit -m "security: harden transaction rules with validation"
```

---

## Task 6: Add Rate Limiting Rules

**Files:**
- Modify: `firestore.rules`

**Step 1: Add rate limiting helpers**

```javascript
// Rate limiting helper (check if user has created too many documents recently)
// Note: This is a soft limit - true rate limiting requires Cloud Functions
function notSpamming() {
  // Allow max 100 writes per hour per user
  // This is enforced at the application level, rules provide a safety net
  return true; // Placeholder - implement with Cloud Functions if needed
}
```

**Step 2: Add to sensitive collections**

For group invites, messages, etc., add the check:

```javascript
allow create: if notSpamming() && /* other conditions */;
```

**Step 3: Commit**

```bash
git add firestore.rules
git commit -m "security: add rate limiting placeholder for spam prevention"
```

---

## Task 7: Create Security Rules Tests

**Files:**
- Create: `functions/test/security-rules.test.ts`

**Step 1: Set up test file**

```typescript
import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
  RulesTestEnvironment,
} from '@firebase/rules-unit-testing';
import { doc, getDoc, setDoc, updateDoc, deleteDoc } from 'firebase/firestore';
import * as fs from 'fs';

let testEnv: RulesTestEnvironment;

beforeAll(async () => {
  testEnv = await initializeTestEnvironment({
    projectId: 'demo-test',
    firestore: {
      rules: fs.readFileSync('../firestore.rules', 'utf8'),
    },
  });
});

afterAll(async () => {
  await testEnv.cleanup();
});

beforeEach(async () => {
  await testEnv.clearFirestore();
});

describe('User Collection', () => {
  it('allows user to read own document', async () => {
    const userId = 'user1';
    const db = testEnv.authenticatedContext(userId).firestore();

    // Seed data
    await testEnv.withSecurityRulesDisabled(async (context) => {
      await setDoc(doc(context.firestore(), 'users', userId), {
        email: 'test@test.com',
        displayName: 'Test User',
      });
    });

    await assertSucceeds(getDoc(doc(db, 'users', userId)));
  });

  it('denies user from reading other user document', async () => {
    const db = testEnv.authenticatedContext('user1').firestore();

    await testEnv.withSecurityRulesDisabled(async (context) => {
      await setDoc(doc(context.firestore(), 'users', 'user2'), {
        email: 'other@test.com',
      });
    });

    await assertFails(getDoc(doc(db, 'users', 'user2')));
  });

  it('denies unauthenticated access', async () => {
    const db = testEnv.unauthenticatedContext().firestore();
    await assertFails(getDoc(doc(db, 'users', 'anyuser')));
  });
});

describe('Group Chat', () => {
  it('allows group member to read chat', async () => {
    const userId = 'user1';
    const groupId = 'group1';

    // Seed member document
    await testEnv.withSecurityRulesDisabled(async (context) => {
      await setDoc(doc(context.firestore(), 'members', `${groupId}_${userId}`), {
        userId,
        groupId,
        isAdmin: false,
      });
      await setDoc(doc(context.firestore(), 'group_chats', groupId), {
        groupId,
        lastMessageAt: new Date(),
      });
    });

    const db = testEnv.authenticatedContext(userId).firestore();
    await assertSucceeds(getDoc(doc(db, 'group_chats', groupId)));
  });

  it('denies non-member from reading chat', async () => {
    const groupId = 'group1';

    await testEnv.withSecurityRulesDisabled(async (context) => {
      await setDoc(doc(context.firestore(), 'group_chats', groupId), {
        groupId,
        lastMessageAt: new Date(),
      });
    });

    const db = testEnv.authenticatedContext('nonmember').firestore();
    await assertFails(getDoc(doc(db, 'group_chats', groupId)));
  });
});

describe('Transactions (Treasury)', () => {
  it('denies regular member from creating transaction', async () => {
    const userId = 'user1';
    const groupId = 'group1';

    // Seed member as non-admin, non-treasurer
    await testEnv.withSecurityRulesDisabled(async (context) => {
      await setDoc(doc(context.firestore(), 'members', `${groupId}_${userId}`), {
        userId,
        groupId,
        isAdmin: false,
        isTreasurer: false,
      });
    });

    const db = testEnv.authenticatedContext(userId).firestore();
    await assertFails(setDoc(doc(db, 'transactions', 'tx1'), {
      type: 'income',
      amount: 100,
      description: 'Test',
      category: '7th Tradition',
      groupId,
      createdBy: userId,
      createdAt: new Date(),
    }));
  });

  it('denies deleting transactions', async () => {
    const groupId = 'group1';
    const userId = 'admin1';

    await testEnv.withSecurityRulesDisabled(async (context) => {
      await setDoc(doc(context.firestore(), 'members', `${groupId}_${userId}`), {
        userId,
        groupId,
        isAdmin: true,
      });
      await setDoc(doc(context.firestore(), 'transactions', 'tx1'), {
        groupId,
        amount: 100,
      });
    });

    const db = testEnv.authenticatedContext(userId).firestore();
    await assertFails(deleteDoc(doc(db, 'transactions', 'tx1')));
  });
});
```

**Step 2: Add test script to package.json**

```json
{
  "scripts": {
    "test:rules": "firebase emulators:exec --only firestore 'jest --testPathPattern=security-rules'"
  }
}
```

**Step 3: Commit**

```bash
git add functions/test/security-rules.test.ts functions/package.json
git commit -m "test: add Firestore security rules tests"
```

---

## Task 8: Run Security Rules Tests

**Step 1: Start emulator and run tests**

```bash
cd functions
npm run test:rules
```

**Step 2: Fix any failing tests**

Review output and fix rules or tests as needed.

**Step 3: Commit fixes**

```bash
git add .
git commit -m "fix: security rules issues found in testing"
```

---

## Task 9: Deploy and Verify

**Step 1: Deploy rules to Firebase**

```bash
firebase deploy --only firestore:rules
```

**Step 2: Manual verification**

- [ ] Test creating a user document as authenticated user
- [ ] Test reading another user's document (should fail)
- [ ] Test creating a transaction as regular member (should fail)
- [ ] Test reading group chat as non-member (should fail)

**Step 3: Final commit**

```bash
git add .
git commit -m "security: complete Firestore security rules audit"
```

---

## Review Prompt

Before considering this implementation complete, run this verification:

```
Review the Firestore security rules audit:

1. RUN AUTOMATED TESTS:
   - cd functions && npm run test:rules
   - All tests must pass

2. MANUAL PENETRATION TESTING:
   Using Firebase Console or a test app:
   - [ ] Try to read another user's profile - should fail
   - [ ] Try to read a group chat without being a member - should fail
   - [ ] Try to create a transaction without being admin/treasurer - should fail
   - [ ] Try to delete a transaction - should fail (audit trail)
   - [ ] Try to modify groupId on existing document - should fail
   - [ ] Try to set superAdmin on own user document - should fail

3. VERIFY CLAIMS FALLBACK:
   - [ ] Test that member access works even when custom claims are stale
   - [ ] Verify fallback reads work correctly

4. CHECK FOR OVERLY PERMISSIVE RULES:
   - [ ] No `allow read: if true` or `allow write: if true`
   - [ ] All collections have explicit rules
   - [ ] Default deny at the end: `match /{document=**} { allow read, write: if false; }`

5. DOCUMENT ANY REMAINING RISKS:
   - Update docs/SECURITY_RULES.md with findings

6. FIX ANY ISSUES found before marking complete

Report: [PASS/FAIL] with details of any fixes needed
```
