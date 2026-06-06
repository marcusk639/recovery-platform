> ⚠️ **Legacy document.** Carried over from the standalone `RecoveryConnect` repository, archived on 2026-06-06. Historical reference only — may be outdated and is NOT part of current `homegroups` documentation.

# Firestore Security Rules Documentation

This document describes the security rules implementation for the RecoveryConnect app, including the role-based access control (RBAC) system using Firebase Custom Claims.

## Table of Contents

1. [Quick Start Guide](#quick-start-guide)
2. [Overview](#overview)
3. [Architecture](#architecture)
4. [Prerequisites](#prerequisites)
5. [Implementation Guide](#implementation-guide)
6. [Custom Claims Structure](#custom-claims-structure)
7. [Cloud Functions](#cloud-functions-for-claims-sync)
8. [Mobile App Integration](#token-refresh-in-mobile-app)
9. [Security Rules Reference](#security-rules-helper-functions)
10. [Collection Access Control](#collection-access-control)
11. [Deployment Guide](#deployment-guide)
12. [Testing Guide](#testing-guide)
13. [Troubleshooting](#troubleshooting)
14. [FAQ](#frequently-asked-questions)

---

## Quick Start Guide

### For New Implementations

If you're setting up security rules for the first time:

```bash
# 1. Install dependencies
cd functions && npm install
cd ../scripts && npm install

# 2. Build Cloud Functions
cd ../functions && npm run build

# 3. Deploy Cloud Functions (includes claims sync)
firebase deploy --only functions

# 4. Run migration to backfill data and sync claims
cd ../scripts
npx ts-node migrateClaimsAndRoles.ts --dry-run  # Preview first
npx ts-node migrateClaimsAndRoles.ts            # Execute migration

# 5. Verify claims (check Firebase Console)
# Authentication > Users > Select user > Custom claims

# 6. Deploy security rules
firebase deploy --only firestore:rules
```

### For Testing Only

```bash
# Start Firebase Emulator Suite
firebase emulators:start

# In another terminal, run tests
cd functions
npm run test:rules
```

---

## Overview

The security rules enforce access control at the database level, ensuring users can only read and write data they are authorized to access. The system uses a combination of:

1. **Firebase Custom Claims** - Zero-read permission checks stored in the auth token
2. **Document-based fallbacks** - For edge cases where claims might be stale
3. **Ownership checks** - For user-specific data

### Why Custom Claims?

| Approach                 | Reads per Check | Latency | Billing Impact |
| ------------------------ | --------------- | ------- | -------------- |
| Document reads in rules  | 1-3             | 10-50ms | High           |
| Custom claims            | 0               | ~0ms    | None           |
| Hybrid (claims + backup) | 0 (usually)     | ~0ms    | Minimal        |

---

## Architecture

```
┌─────────────────────────────────────────────────────────────────────┐
│                          Mobile App                                  │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────────────────────┐ │
│  │ MemberModel │  │ GroupModel  │  │ withAutoTokenRefresh()      │ │
│  │ (role ops)  │  │ (group ops) │  │ (auto-retry on 403)         │ │
│  └──────┬──────┘  └──────┬──────┘  └─────────────────────────────┘ │
└─────────┼────────────────┼──────────────────────────────────────────┘
          │                │
          ▼                ▼
┌─────────────────────────────────────────────────────────────────────┐
│                     Firestore + Auth                                 │
│  ┌─────────────────────────────────────────────────────────────┐   │
│  │                    Security Rules                            │   │
│  │  ┌──────────────────────┐  ┌────────────────────────────┐  │   │
│  │  │  Custom Claims Check │  │  Document-based Fallback   │  │   │
│  │  │  (0 reads)           │  │  (1 read, if needed)       │  │   │
│  │  └──────────────────────┘  └────────────────────────────┘  │   │
│  └─────────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────────┘
          ▲                ▲
          │                │
┌─────────────────────────────────────────────────────────────────────┐
│                      Cloud Functions                                 │
│  ┌───────────────┐  ┌─────────────────────┐  ┌──────────────────┐  │
│  │ onMemberWrite │  │onGroupTreasurerUpdate│  │  syncUserClaims  │  │
│  │ (sync claims) │  │   (sync claims)      │  │   (callable)     │  │
│  └───────────────┘  └─────────────────────┘  └──────────────────┘  │
└─────────────────────────────────────────────────────────────────────┘
```

### Data Flow

1. **User joins group** → Member document created
2. **onMemberWrite triggers** → Claims rebuilt from all memberships
3. **Claims set on user** → Stored in Firebase Auth
4. **Mobile app refreshes token** → New claims available
5. **User accesses data** → Rules check claims (zero reads)

---

## Prerequisites

### Required Tools

- Node.js 18+ (recommended: 20.x)
- Firebase CLI (`npm install -g firebase-tools`)
- TypeScript (`npm install -g typescript ts-node`)

### Firebase Project Setup

1. **Enable Firebase Authentication** with at least one sign-in provider
2. **Enable Cloud Firestore** in Native mode
3. **Enable Cloud Functions** (requires Blaze plan for production)

### Service Account

For migration scripts, you need a service account:

1. Go to Firebase Console → Project Settings → Service Accounts
2. Click "Generate new private key"
3. Save as `scripts/recovery-connect.json`

**Important**: Add this file to `.gitignore`:

```bash
echo "scripts/recovery-connect.json" >> .gitignore
```

---

## Implementation Guide

### Step 1: Update Data Model

The security rules require specific fields in member documents.

**File**: `mobile/src/types/schema.ts`

```typescript
export interface GroupMemberDocument {
  id: string; // Document ID: {groupId}_{userId}
  groupId: string; // Required
  userId: string; // Required - for querying and claims sync
  displayName: string;
  isAdmin: boolean;
  isTreasurer: boolean; // Denormalized treasurer status
  roles: string[]; // ["admin", "treasurer", "secretary", "member"]
  // ... other fields
}
```

### Step 2: Update MemberModel

Ensure the model sets all required fields.

**File**: `mobile/src/models/MemberModel.ts`

Key changes:

```typescript
// In addMember()
const roles: string[] = isAdmin ? ["admin", "member"] : ["member"];

const memberDoc: GroupMember = {
  id: `${groupId}_${userId}`,
  userId: userId, // Always set
  groupId: groupId,
  isAdmin: isAdmin,
  isTreasurer: false,
  roles: roles,
  // ...
};
```

```typescript
// In makeAdmin()
await memberDocRef.update({
  isAdmin: true,
  roles: firestore.FieldValue.arrayUnion("admin"),
});

// Trigger token refresh for current user
if (currentUser?.uid === userId) {
  setTimeout(() => refreshAuthToken(), 2000);
}
```

### Step 3: Create Cloud Functions

#### onMemberWrite.ts

**File**: `functions/src/triggers/firestore/onMemberWrite.ts`

This function:

- Triggers on any member document change
- Rebuilds all claims for the affected user
- Handles create, update, and delete operations

```typescript
export const onMemberWrite = functionsV1.firestore
  .document("members/{memberId}")
  .onWrite(async (change, context) => {
    // Get userId from document
    const userId = change.after.exists
      ? change.after.data()?.userId
      : change.before.data()?.userId;

    // Rebuild claims from all memberships
    await rebuildUserClaims(userId);
  });
```

#### onGroupTreasurerUpdate.ts

**File**: `functions/src/triggers/firestore/onGroupTreasurerUpdate.ts`

This function:

- Triggers on group document updates
- Detects changes to the `treasurers` array
- Updates affected member documents
- Syncs claims for affected users

#### syncUserClaims.ts (Callable)

**File**: `functions/src/callable/syncUserClaims.ts`

This function:

- Called manually from mobile app
- Useful for debugging or forcing a sync
- Super admins can sync other users' claims

### Step 4: Export Functions

**File**: `functions/src/index.ts`

```typescript
// Role/Claims Sync Trigger Functions
export { onMemberWrite } from "./triggers/firestore/onMemberWrite";
export { onGroupTreasurerUpdate } from "./triggers/firestore/onGroupTreasurerUpdate";

// Callable Functions
export { syncUserClaims } from "./callable/syncUserClaims";
```

### Step 5: Add Mobile App Token Refresh

**File**: `mobile/src/services/firebase/auth.ts`

```typescript
/**
 * Force refresh the user's ID token to get updated custom claims
 */
export const refreshAuthToken = async (): Promise<string | null> => {
  const currentUser = auth.currentUser;
  if (!currentUser) return null;

  // Force token refresh
  return await currentUser.getIdToken(true);
};

/**
 * Handle permission denied with auto-retry
 */
export const withAutoTokenRefresh = async <T>(
  operation: () => Promise<T>,
): Promise<T> => {
  try {
    return await operation();
  } catch (error: any) {
    if (error.code === "permission-denied") {
      await refreshAuthToken();
      return await operation(); // Retry once
    }
    throw error;
  }
};
```

### Step 6: Write Security Rules

**File**: `firestore.rules`

See the complete rules file in the repository. Key patterns:

```javascript
// Zero-read check using custom claims
function isGroupAdmin(groupId) {
  return (
    isSignedIn() &&
    (isSuperAdmin() ||
      (request.auth.token.adminGroups != null &&
        groupId in request.auth.token.adminGroups))
  );
}

// Apply to collections
match /announcements/{announcementId} {
  allow read: if isGroupMember(resource.data.groupId);
  allow create: if isGroupAdmin(request.resource.data.groupId);
}
```

---

## Custom Claims Structure

Each user's auth token contains custom claims with their role information:

```json
{
  "superAdmin": true, // Platform admin (optional)
  "memberGroups": ["groupId1", "groupId2"], // Groups where user is a member
  "adminGroups": ["groupId1"], // Groups where user is an admin
  "treasurerGroups": ["groupId1"] // Groups where user is a treasurer
}
```

### Benefits

- **Zero document reads** for permission checks (vs. 1-3 reads per check)
- **Simple rule logic**: `groupId in request.auth.token.adminGroups`
- **Fast evaluation**: Claims are part of the auth token, no network calls

### Limitations

- **1000 byte limit**: Claims must fit in 1000 bytes (~15-25 groups)
- **Token refresh required**: Users must refresh their token after role changes
- **Eventual consistency**: Brief window where claims may be stale

### Claims size budget — warn / fallback thresholds (U-5)

`onMemberWrite` monitors the serialized claims payload before writing to Firebase Auth and implements a two-stage degradation:

| Bytes used       | Behavior                                                                                                                                                                                                                                                                                                                                                                                    |
| ---------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `< 800`          | Normal — claims written as-is                                                                                                                                                                                                                                                                                                                                                               |
| `800 ≤ n < 1000` | **Warn**: `functions.logger.warn` is emitted with the user UID and current size. Claims still written. Operationally, this is the canary that a user is approaching the budget and should be migrated to a doc-read fallback path on the affected screens.                                                                                                                                  |
| `≥ 1000`         | **Zero out memberGroups**: the `memberGroups` array is emptied to bring the payload under the budget. `adminGroups` and `treasurerGroups` are preserved (they're typically much smaller). All security rules that gate on `memberGroups` then fall back to per-document reads — see the `*Fallback()` helpers in `firestore.rules` (`isGroupMemberFallback`, `isGroupAdminFallback`, etc.). |

This means a power user with hundreds of group memberships still has working security checks, just at slightly higher read cost. The fallback path is **always** evaluated for these cases — there is no separate flag clients need to set.

### Foreground token refresh — 5-minute throttle (U-3)

`mobile/src/navigation/AppNavigator.tsx:53-90` forces an ID-token refresh every 5 minutes while the app is in the foreground (`AppState === 'active'`). This is in addition to Firebase's hour-long built-in token TTL, and is the mechanism that ensures custom JWT claims updated by `onMemberWrite` (or any other claims-mutating trigger) propagate to the client without requiring a sign-out.

- **Trigger**: `setInterval(refreshAuthToken, 5 * 60 * 1000)` registered when AppNavigator mounts
- **Cleanup**: cleared on unmount and paused on background (AppState listener)
- **Cost**: One Firebase Auth `getIdToken(true)` call every 5 minutes per active session

The complementary `withAutoTokenRefresh` helper (shown above in Step 5) handles the reactive case: a `permission-denied` error triggers an immediate refresh + one-time retry. The 5-minute foreground refresh is the proactive case for users who haven't yet hit a permission error but whose role just changed.

### Viewing Claims in Firebase Console

1. Go to Firebase Console → Authentication → Users
2. Click on a user
3. Scroll to "Custom claims" section
4. View the JSON claims object

---

## Cloud Functions for Claims Sync

### onMemberWrite

Triggered when a member document is created, updated, or deleted.

**File**: `functions/src/triggers/firestore/onMemberWrite.ts`

**Behavior**:

- Rebuilds the user's custom claims from all their member documents
- Preserves `superAdmin` claim if present
- Logs warnings if claims approach the 1000 byte limit

### onGroupTreasurerUpdate

Triggered when a group's `treasurers` array is updated.

**File**: `functions/src/triggers/firestore/onGroupTreasurerUpdate.ts`

**Behavior**:

- Detects changes to the treasurers array
- Updates affected member documents' `isTreasurer` field
- Rebuilds claims for affected users

### syncUserClaims (Callable)

Manually sync claims via Cloud Function call.

**File**: `functions/src/callable/syncUserClaims.ts`

**Usage**:

```typescript
import { syncUserClaims } from "../services/firebase/auth";

// Sync claims and refresh token
await syncUserClaims();
```

---

## Token Refresh in Mobile App

The mobile app includes automatic token refresh logic:

### refreshAuthToken()

Force refresh the user's ID token to get updated claims.

```typescript
import { refreshAuthToken } from "../services/firebase/auth";

await refreshAuthToken();
```

### withAutoTokenRefresh()

Wrapper that auto-retries operations after refreshing token on permission denied errors.

```typescript
import { withAutoTokenRefresh } from "../services/firebase/auth";

const result = await withAutoTokenRefresh(async () => {
  return await someFirestoreOperation();
});
```

### getUserClaims()

Get current claims from the user's token.

```typescript
import { getUserClaims } from "../services/firebase/auth";

const claims = await getUserClaims();
console.log("Member of groups:", claims?.memberGroups);
console.log("Admin of groups:", claims?.adminGroups);
```

### Automatic Refresh After Role Changes

The `MemberModel` automatically triggers token refresh when:

- User is made admin (`makeAdmin`)
- User is removed as admin (`removeAdmin`)
- User's treasurer status changes (`updateTreasurerStatus`)

A 2-second delay allows the Cloud Function to sync claims before refresh.

---

## Security Rules Helper Functions

### Zero-Read Functions (Custom Claims)

```javascript
// Check if user is signed in
function isSignedIn() {
  return request.auth != null;
}

// Check if user owns the document
function isOwner(userId) {
  return isSignedIn() && request.auth.uid == userId;
}

// Check if user is a platform super admin
function isSuperAdmin() {
  return isSignedIn() && request.auth.token.superAdmin == true;
}

// Check if user is a member of the group
function isGroupMember(groupId) {
  return (
    isSignedIn() &&
    (isSuperAdmin() ||
      (request.auth.token.memberGroups != null &&
        groupId in request.auth.token.memberGroups))
  );
}

// Check if user is an admin of the group
function isGroupAdmin(groupId) {
  return (
    isSignedIn() &&
    (isSuperAdmin() ||
      (request.auth.token.adminGroups != null &&
        groupId in request.auth.token.adminGroups))
  );
}

// Check if user is a treasurer of the group
function isGroupTreasurer(groupId) {
  return (
    isSignedIn() &&
    (isSuperAdmin() ||
      (request.auth.token.treasurerGroups != null &&
        groupId in request.auth.token.treasurerGroups))
  );
}
```

### Fallback Functions (Document Read)

For edge cases where claims might be stale:

```javascript
// Check membership via document read (1 read)
function isGroupMemberFallback(groupId) {
  return (
    isSignedIn() &&
    exists(
      /databases/$(database)/documents/members/$(groupId + "_" + request.auth.uid)
    )
  );
}

// Check admin via document read (1 read)
function isGroupAdminFallback(groupId) {
  let memberDoc = get(
    /databases/$(database)/documents/members/$(groupId + "_" + request.auth.uid)
  );
  return isSignedIn() && memberDoc != null && memberDoc.data.isAdmin == true;
}
```

---

## Collection Access Control

### Users Collection

| Operation | Rule                 |
| --------- | -------------------- |
| Read      | Owner or Super Admin |
| Create    | Owner only           |
| Update    | Owner only           |
| Delete    | Never                |

### Groups Collection

| Operation | Rule                   |
| --------- | ---------------------- |
| Read      | Public (for discovery) |
| Create    | Super Admin only       |
| Update    | Group Admin            |
| Delete    | Never                  |

### Members Collection

| Operation | Rule                                          |
| --------- | --------------------------------------------- |
| Read      | Group Member                                  |
| Create    | Self-join (userId matches auth)               |
| Update    | Owner (non-role fields) or Admin (all fields) |
| Delete    | Owner or Admin                                |

### Meetings Collection

| Operation | Rule        |
| --------- | ----------- |
| Read      | Public      |
| Create    | Group Admin |
| Update    | Group Admin |
| Delete    | Group Admin |

### Announcements Collection

| Operation | Rule         |
| --------- | ------------ |
| Read      | Group Member |
| Create    | Group Admin  |
| Update    | Group Admin  |
| Delete    | Group Admin  |

### Transactions Collection

| Operation | Rule                |
| --------- | ------------------- |
| Read      | Group Member        |
| Create    | Treasurer or Admin  |
| Update    | Treasurer or Admin  |
| Delete    | Never (audit trail) |

### Direct Message Threads

| Operation | Rule                             |
| --------- | -------------------------------- |
| Read      | Participant only                 |
| Create    | Participant (2 participants max) |
| Update    | Participant                      |
| Delete    | Never                            |

### Group Chats

| Operation | Rule                                        |
| --------- | ------------------------------------------- |
| Read      | Group Member                                |
| Create    | Group Member                                |
| Update    | Sender (reactions/edits) or Member (readBy) |
| Delete    | Sender or Admin                             |

### Reports Collection

| Operation | Rule                       |
| --------- | -------------------------- |
| Read      | Admin or Super Admin       |
| Create    | Group Member (as reporter) |
| Update    | Admin (review/action)      |
| Delete    | Never                      |

### User Bans Collection

| Operation | Rule                                          |
| --------- | --------------------------------------------- |
| Read      | Super Admin or Group Admin (for their groups) |
| Create    | Super Admin or Group Admin                    |
| Update    | Super Admin or Group Admin                    |
| Delete    | Never (revocation instead)                    |

### Sponsorships Collection

| Operation | Rule               |
| --------- | ------------------ |
| Read      | Sponsor or Sponsee |
| Create    | Sponsor or Sponsee |
| Update    | Sponsor or Sponsee |
| Delete    | Never              |

---

## Deployment Guide

### Pre-Deployment Checklist

- [ ] Backup current `firestore.rules` to `firestore.rules.backup`
- [ ] All Cloud Functions built successfully (`npm run build`)
- [ ] Service account file in place for migration script
- [ ] Test migration in dry-run mode first
- [ ] Staging environment tested (if available)

### Step-by-Step Deployment

#### 1. Backup Current Rules

```bash
cp firestore.rules firestore.rules.backup
```

#### 2. Deploy Cloud Functions

```bash
cd functions
npm run build
firebase deploy --only functions
```

Verify deployment:

```bash
firebase functions:log --only onMemberWrite
```

#### 3. Run Migration Script

```bash
cd scripts

# Preview changes first (ALWAYS do this)
npx ts-node migrateClaimsAndRoles.ts --dry-run --verbose

# Run actual migration
npx ts-node migrateClaimsAndRoles.ts --verbose
```

Expected output:

```
📋 Step 1: Backfilling member documents...
Found 1234 member documents to process
✅ Member document backfill complete
   Processed: 1234
   Updated: 1100
   Malformed IDs: 0

🔐 Step 2: Syncing custom claims for all users...
Found 500 users to process
Processing users 1-50/500
...
✅ Claims sync complete
   Users processed: 500
   Claims updated: 500
   Claims exceeded limit: 0
```

#### 4. Verify Claims

In Firebase Console:

1. Go to Authentication → Users
2. Select a user who should be an admin
3. Check "Custom claims" section
4. Verify `adminGroups` contains expected group IDs

#### 5. Deploy Security Rules

```bash
firebase deploy --only firestore:rules
```

#### 6. Test Critical Flows

Test these operations in your app:

- [ ] Non-member cannot read announcements
- [ ] Member can read announcements
- [ ] Admin can create announcements
- [ ] Non-admin cannot create announcements
- [ ] Treasurer can create transactions
- [ ] Non-treasurer cannot create transactions

### Rollback Plan

If issues occur, immediately revert to open rules:

```bash
# Option 1: Deploy emergency rules
cat > firestore.rules.emergency << 'EOF'
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /{document=**} {
      allow read, write: if true;
    }
  }
}
EOF
cp firestore.rules.emergency firestore.rules
firebase deploy --only firestore:rules

# Option 2: Restore from backup
cp firestore.rules.backup firestore.rules
firebase deploy --only firestore:rules
```

---

## Testing Guide

### Setup Testing Environment

#### 1. Install Test Dependencies

```bash
cd functions
npm install --save-dev @firebase/rules-unit-testing jest ts-jest @types/jest
```

#### 2. Configure Jest

**File**: `functions/jest.config.js`

```javascript
module.exports = {
  preset: "ts-jest",
  testEnvironment: "node",
  roots: ["<rootDir>/src"],
  testMatch: ["**/*.test.ts"],
  testTimeout: 30000,
  modulePathIgnorePatterns: ["<rootDir>/lib/"],
};
```

#### 3. Update package.json

```json
{
  "scripts": {
    "test": "jest --detectOpenHandles",
    "test:rules": "firebase emulators:exec --only firestore 'npm run test'"
  }
}
```

### Running Tests

#### With Emulators (Recommended)

```bash
# Terminal 1: Start emulators
firebase emulators:start

# Terminal 2: Run tests
cd functions
npm test
```

#### One-shot with Emulator

```bash
cd functions
npm run test:rules
```

### Writing Tests

**File**: `functions/src/tests/security-rules.test.ts`

```typescript
import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
} from "@firebase/rules-unit-testing";

describe("Announcements Collection", () => {
  test("group member can read announcements", async () => {
    const db = getAuthenticatedContext(memberUserId, {
      memberGroups: [groupId],
    }).firestore();

    await assertSucceeds(
      db.collection("announcements").doc(announcementId).get(),
    );
  });

  test("non-member cannot read announcements", async () => {
    const db = getAuthenticatedContext("outsider", {
      memberGroups: [],
    }).firestore();

    await assertFails(db.collection("announcements").doc(announcementId).get());
  });
});
```

### Test Coverage Checklist

- [ ] Users: Read/write own doc, cannot read others
- [ ] Groups: Public read, admin-only write
- [ ] Members: Member read, self-join, admin role updates
- [ ] Announcements: Member read, admin write
- [ ] Transactions: Member read, treasurer write, no delete
- [ ] DM Threads: Participant-only access
- [ ] Group Chats: Member access, sender delete
- [ ] Reports: Admin-only read, member create
- [ ] Sponsorships: Participant-only access

---

## Troubleshooting

### "Permission Denied" Errors

#### Symptoms

- Firestore operations fail with "permission-denied"
- App shows error after role changes

#### Diagnosis Steps

1. **Check authentication**:

   ```typescript
   const user = auth().currentUser;
   console.log("Authenticated:", !!user);
   console.log("UID:", user?.uid);
   ```

2. **Check custom claims**:

   ```typescript
   import { getUserClaims } from "../services/firebase/auth";
   const claims = await getUserClaims();
   console.log("Claims:", JSON.stringify(claims, null, 2));
   ```

3. **Check member document**:
   ```typescript
   const memberDoc = await firestore()
     .collection("members")
     .doc(`${groupId}_${userId}`)
     .get();
   console.log("Member exists:", memberDoc.exists);
   console.log("Member data:", memberDoc.data());
   ```

#### Solutions

1. **Force token refresh**:

   ```typescript
   await refreshAuthToken();
   ```

2. **Sync claims manually**:

   ```typescript
   await syncUserClaims();
   ```

3. **Check Cloud Function logs**:
   ```bash
   firebase functions:log --only onMemberWrite
   ```

### Claims Not Updating

#### Symptoms

- User becomes admin but can't perform admin actions
- Claims show stale data

#### Diagnosis

1. Check Cloud Function triggered:

   ```bash
   firebase functions:log --only onMemberWrite
   ```

2. Check for errors:
   ```bash
   firebase functions:log --only onMemberWrite | grep -i error
   ```

#### Solutions

1. **Verify member document has userId**:

   ```typescript
   // Member doc should have:
   {
     userId: "abc123", // Must match auth UID
     groupId: "group456",
     isAdmin: true
   }
   ```

2. **Run migration to fix missing fields**:

   ```bash
   npx ts-node scripts/migrateClaimsAndRoles.ts --members-only
   ```

3. **Force claims sync**:
   ```bash
   # From mobile app
   await syncUserClaims();
   ```

### Claims Size Exceeded

#### Symptoms

- Cloud Function logs show "claims exceed 1000 bytes"
- Some group memberships not reflected in claims

#### Solutions

1. **Check claim size in logs**:

   ```bash
   firebase functions:log --only onMemberWrite | grep "bytes"
   ```

2. **For power users (many groups)**:
   - Claims will truncate `memberGroups` first
   - Admin/treasurer groups are prioritized
   - Consider document-based fallback rules for edge cases

### Migration Script Issues

#### "Cannot find module"

```bash
# Install dependencies
cd scripts && npm install

# Or use ts-node directly
npx ts-node migrateClaimsAndRoles.ts
```

#### "Invalid service account"

1. Verify file exists: `scripts/recovery-connect.json`
2. Check file format (valid JSON)
3. Ensure correct project ID in service account

#### "Rate limit exceeded"

Increase delay between batches:

```bash
npx ts-node migrateClaimsAndRoles.ts --delay 2000 --batch-size 25
```

---

## Frequently Asked Questions

### Q: How long until claims are available after a role change?

**A**: Typically 1-5 seconds for the Cloud Function to run, plus token refresh time. The mobile app adds a 2-second delay before refreshing to ensure claims are synced.

### Q: What happens if a user is in more than 25 groups?

**A**: The claims sync function will warn when approaching 1000 bytes (~25 groups). If exceeded, it will truncate `memberGroups` while preserving `adminGroups` and `treasurerGroups`. The fallback document-read functions can handle edge cases.

### Q: Can users modify their own admin status?

**A**: No. The security rules explicitly prevent users from modifying `isAdmin`, `isTreasurer`, or `roles` fields on their own member documents. Only group admins can modify these fields.

### Q: How do I make someone a super admin?

**A**: Use the `setUserAsSuperAdmin` Cloud Function:

```typescript
const setAdmin = firebase.functions().httpsCallable("setUserAsSuperAdmin");
await setAdmin({ userId: "targetUserId" });
```

Only existing super admins can create new super admins.

### Q: What if claims get out of sync?

**A**: Users can manually sync their claims:

```typescript
import { syncUserClaims } from "../services/firebase/auth";
await syncUserClaims();
```

Or admins can sync for a specific user via Cloud Function.

### Q: How do I test rules without deploying?

**A**: Use Firebase Emulator Suite:

```bash
firebase emulators:start
npm run test:rules
```

The Rules Playground in Firebase Console also allows testing specific operations.

### Q: Are the open rules still available for emergency rollback?

**A**: Yes. A backup file `firestore.rules.backup` contains open rules. Deploy with:

```bash
cp firestore.rules.backup firestore.rules
firebase deploy --only firestore:rules
```

---

## Security Considerations

1. **Super Admin claims** are only set via the `setUserAsSuperAdmin` Cloud Function
2. **Users cannot modify their own role fields** (isAdmin, isTreasurer, roles)
3. **Audit trails** are preserved (transactions, reports, bans are never deleted)
4. **Platform-wide bans** can only be created by super admins
5. **Group invites** can only be managed via Cloud Functions

---

## Files Reference

| File                                                         | Purpose                          |
| ------------------------------------------------------------ | -------------------------------- |
| `firestore.rules`                                            | Security rules                   |
| `firestore.rules.backup`                                     | Rollback rules (open)            |
| `functions/src/triggers/firestore/onMemberWrite.ts`          | Claims sync on member changes    |
| `functions/src/triggers/firestore/onGroupTreasurerUpdate.ts` | Claims sync on treasurer changes |
| `functions/src/callable/syncUserClaims.ts`                   | Manual claims sync               |
| `mobile/src/services/firebase/auth.ts`                       | Token refresh utilities          |
| `mobile/src/models/MemberModel.ts`                           | Member operations with role sync |
| `scripts/migrateClaimsAndRoles.ts`                           | Migration script                 |
| `functions/src/tests/security-rules.test.ts`                 | Security rules tests             |
| `docs/SECURITY_RULES.md`                                     | This documentation               |
