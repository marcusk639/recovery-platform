---
archived: true
archived_at: 2026-05-25
archived_reason: Plan shipped; tracked DONE in docs/plans/README.md (with PR# or commit ref). Preserved for historical reference.
original_path: docs/plans/2026-02-22-v1-admin-removal-voting.md
---

# Admin Removal Voting System Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Allow group members to democratically vote to remove an inactive or problematic admin via a 7-day vote requiring 2/3 majority of eligible members.

**Architecture:** New top-level Firestore collection `admin_removal_requests` with a `votes` subcollection. Two new callable Cloud Functions (`initiateAdminRemoval`, `voteOnAdminRemoval`) handle writes; a Firestore trigger auto-resolves when threshold is met; a daily scheduled function expires timed-out requests. Mobile side gets a Redux slice and a new `AdminRemovalRequestsScreen`.

**Tech Stack:** Firebase Cloud Functions v2 (callable), Firestore, FCM, Redux Toolkit entity adapter, React Native

---

## Background

### Existing Patterns to Follow
- **Callable CF pattern**: `functions/src/callable/banUser.ts` — `functions.https.onCall(async (request: CallableRequest<T>) => {...})` with `HttpsError` for all errors
- **Redux slice pattern**: `mobile/src/store/slices/treasurerHandoffSlice.ts` — `createEntityAdapter` + `createAsyncThunk` + `createSelector`
- **Admin operations**: `mobile/src/models/MemberModel.ts:291 makeAdmin()` and `mobile/src/models/MemberModel.ts:352 removeAdmin()` — update `members/{groupId}_{userId}` doc + `groups/{groupId}.admins` array
- **Scheduled CF pattern**: `functions/src/triggers/pubsub/scheduledTrialReminders.ts` — `functionsV1.pubsub.schedule('0 * * * *').timeZone('UTC').onRun(async () => {...})`
- **FCM pattern**: `functions/src/triggers/firestore/onAnnouncementCreate.ts` — query `members` by `groupId`, batch user docs 10 at a time, call `messaging.sendEachForMulticast({tokens, notification, data})`

### Key Schemas (read-only)
- `GroupDocument` (`mobile/src/types/schema.ts:156`): `admins: string[]`, `adminUids: string[]`, `memberCount: number`
- `GroupMemberDocument` (`mobile/src/types/schema.ts:205`): doc ID `{groupId}_{userId}`, `isAdmin: boolean`, `userId: string`
- `COLLECTION_PATHS` (`mobile/src/types/schema.ts:649`): add two new entries

### Threshold Logic
- **Passes**: `votesFor >= ceil(totalEligibleVoters * 2 / 3)`
- **Definitively fails**: `votesAgainst > totalEligibleVoters * 1/3` (cannot reach threshold)
- **Expires**: 7 days after creation with threshold not met → `status: 'expired'`
- **Target admin cannot vote**; initiator can vote; all other members can vote

---

## Task 1: Firestore Schema Types

**Files:**
- Modify: `mobile/src/types/schema.ts`

**Step 1: Add new document interfaces after `UserBanDocument` (line 644)**

Add directly before the `COLLECTION_PATHS` const (line 649):

```typescript
/**
 * Admin Removal Request Document
 * Collection: admin_removal_requests/{requestId}
 */
export type AdminRemovalStatus =
  | 'pending'
  | 'approved'
  | 'rejected'
  | 'expired'
  | 'withdrawn';

export interface AdminRemovalRequestDocument {
  id: string;
  groupId: string;
  targetAdminId: string;
  targetAdminName: string;
  initiatedBy: string;
  initiatedByName: string;
  reason: string;
  status: AdminRemovalStatus;
  createdAt: FirebaseFirestoreTypes.Timestamp;
  expiresAt: FirebaseFirestoreTypes.Timestamp; // createdAt + 7 days
  resolvedAt?: FirebaseFirestoreTypes.Timestamp;
  // Denormalized vote tallies (updated on each vote write)
  votesFor: number;
  votesAgainst: number;
  votesAbstain: number;
  totalEligibleVoters: number; // group memberCount at time of initiation
  // Optional admin response
  adminResponse?: string;
  adminRespondedAt?: FirebaseFirestoreTypes.Timestamp;
}

/**
 * Admin Removal Vote Document
 * Collection: admin_removal_requests/{requestId}/votes/{userId}
 */
export interface AdminRemovalVoteDocument {
  userId: string;
  userName: string;
  vote: 'yes' | 'no' | 'abstain';
  votedAt: FirebaseFirestoreTypes.Timestamp;
}
```

**Step 2: Add collection paths to `COLLECTION_PATHS`**

In the `COLLECTION_PATHS` object (line 649), add after `USER_BANS`:

```typescript
  ADMIN_REMOVAL_REQUESTS: 'admin_removal_requests',
  ADMIN_REMOVAL_VOTES: (requestId: string) =>
    `admin_removal_requests/${requestId}/votes`,
```

**Step 3: Verify TypeScript compiles**

```bash
cd /Users/marcusklein/dev/RecoveryConnect/mobile && npx tsc --noEmit 2>&1 | head -30
```

Expected: No errors related to schema.ts

**Step 4: Commit**

```bash
cd /Users/marcusklein/dev/RecoveryConnect && git add mobile/src/types/schema.ts
git commit -m "feat: add AdminRemovalRequest/Vote Firestore schema types"
```

---

## Task 2: Domain Types and Redux Slice

**Files:**
- Create: `mobile/src/types/domain/admin-removal.ts`
- Create: `mobile/src/store/slices/adminRemovalSlice.ts`
- Modify: `mobile/src/store/index.ts` (add reducer)

**Step 1: Create domain type file**

```typescript
// mobile/src/types/domain/admin-removal.ts
export type AdminRemovalStatus =
  | 'pending'
  | 'approved'
  | 'rejected'
  | 'expired'
  | 'withdrawn';

export interface AdminRemovalRequest {
  id: string;
  groupId: string;
  targetAdminId: string;
  targetAdminName: string;
  initiatedBy: string;
  initiatedByName: string;
  reason: string;
  status: AdminRemovalStatus;
  createdAt: string; // ISO string (converted from Timestamp)
  expiresAt: string; // ISO string
  resolvedAt?: string;
  votesFor: number;
  votesAgainst: number;
  votesAbstain: number;
  totalEligibleVoters: number;
  adminResponse?: string;
  adminRespondedAt?: string;
}

export interface AdminRemovalVote {
  userId: string;
  userName: string;
  vote: 'yes' | 'no' | 'abstain';
  votedAt: string; // ISO string
}
```

**Step 2: Create the Redux slice**

```typescript
// mobile/src/store/slices/adminRemovalSlice.ts
import {
  createSlice,
  createAsyncThunk,
  createEntityAdapter,
  createSelector,
} from '@reduxjs/toolkit';
import firestore from '@react-native-firebase/firestore';
import functions from '@react-native-firebase/functions';
import {RootState} from '../types';
import {
  AdminRemovalRequest,
  AdminRemovalVote,
} from '../../types/domain/admin-removal';
import {
  AdminRemovalRequestDocument,
  AdminRemovalVoteDocument,
  COLLECTION_PATHS,
} from '../../types/schema';

// --- Helpers ---

function docToRequest(
  doc: any,
  id: string,
): AdminRemovalRequest {
  const d = doc as AdminRemovalRequestDocument;
  return {
    id,
    groupId: d.groupId,
    targetAdminId: d.targetAdminId,
    targetAdminName: d.targetAdminName,
    initiatedBy: d.initiatedBy,
    initiatedByName: d.initiatedByName,
    reason: d.reason,
    status: d.status,
    createdAt: d.createdAt.toDate().toISOString(),
    expiresAt: d.expiresAt.toDate().toISOString(),
    resolvedAt: d.resolvedAt?.toDate().toISOString(),
    votesFor: d.votesFor,
    votesAgainst: d.votesAgainst,
    votesAbstain: d.votesAbstain,
    totalEligibleVoters: d.totalEligibleVoters,
    adminResponse: d.adminResponse,
    adminRespondedAt: d.adminRespondedAt?.toDate().toISOString(),
  };
}

// --- Entity Adapter ---

const requestsAdapter = createEntityAdapter<AdminRemovalRequest>({
  selectId: r => r.id,
  sortComparer: (a, b) =>
    new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
});

// --- State ---

export interface AdminRemovalState {
  requests: ReturnType<typeof requestsAdapter.getInitialState>;
  groupRequestIds: Record<string, string[]>; // groupId -> requestIds
  votes: Record<string, AdminRemovalVote[]>; // requestId -> votes
  status: 'idle' | 'loading' | 'succeeded' | 'failed';
  error: string | null;
}

const initialState: AdminRemovalState = {
  requests: requestsAdapter.getInitialState(),
  groupRequestIds: {},
  votes: {},
  status: 'idle',
  error: null,
};

// --- Async Thunks ---

export const fetchAdminRemovalRequests = createAsyncThunk(
  'adminRemoval/fetchRequests',
  async (groupId: string, {rejectWithValue}) => {
    try {
      const snapshot = await firestore()
        .collection(COLLECTION_PATHS.ADMIN_REMOVAL_REQUESTS)
        .where('groupId', '==', groupId)
        .orderBy('createdAt', 'desc')
        .get();
      const requests = snapshot.docs.map(doc =>
        docToRequest(doc.data(), doc.id),
      );
      return {groupId, requests};
    } catch (error: any) {
      return rejectWithValue(error.message || 'Failed to fetch removal requests');
    }
  },
);

export const fetchRemovalVotes = createAsyncThunk(
  'adminRemoval/fetchVotes',
  async (requestId: string, {rejectWithValue}) => {
    try {
      const snapshot = await firestore()
        .collection(COLLECTION_PATHS.ADMIN_REMOVAL_VOTES(requestId))
        .get();
      const votes: AdminRemovalVote[] = snapshot.docs.map(doc => {
        const d = doc.data() as AdminRemovalVoteDocument;
        return {
          userId: d.userId,
          userName: d.userName,
          vote: d.vote,
          votedAt: d.votedAt.toDate().toISOString(),
        };
      });
      return {requestId, votes};
    } catch (error: any) {
      return rejectWithValue(error.message || 'Failed to fetch votes');
    }
  },
);

export const initiateAdminRemoval = createAsyncThunk(
  'adminRemoval/initiate',
  async (
    params: {groupId: string; targetAdminId: string; targetAdminName: string; reason: string},
    {rejectWithValue},
  ) => {
    try {
      const result = await functions().httpsCallable('initiateAdminRemoval')(params);
      return result.data as {requestId: string};
    } catch (error: any) {
      return rejectWithValue(error.message || 'Failed to initiate removal');
    }
  },
);

export const castVote = createAsyncThunk(
  'adminRemoval/castVote',
  async (
    params: {requestId: string; vote: 'yes' | 'no' | 'abstain'},
    {rejectWithValue},
  ) => {
    try {
      const result = await functions().httpsCallable('voteOnAdminRemoval')(params);
      return result.data as {success: boolean};
    } catch (error: any) {
      return rejectWithValue(error.message || 'Failed to cast vote');
    }
  },
);

export const submitAdminResponse = createAsyncThunk(
  'adminRemoval/submitResponse',
  async (
    params: {requestId: string; response: string},
    {rejectWithValue},
  ) => {
    try {
      const result = await functions().httpsCallable('submitAdminRemovalResponse')(params);
      return result.data as {success: boolean};
    } catch (error: any) {
      return rejectWithValue(error.message || 'Failed to submit response');
    }
  },
);

// --- Slice ---

const adminRemovalSlice = createSlice({
  name: 'adminRemoval',
  initialState,
  reducers: {},
  extraReducers: builder => {
    builder
      .addCase(fetchAdminRemovalRequests.pending, state => {
        state.status = 'loading';
        state.error = null;
      })
      .addCase(fetchAdminRemovalRequests.fulfilled, (state, action) => {
        state.status = 'succeeded';
        requestsAdapter.upsertMany(state.requests, action.payload.requests);
        state.groupRequestIds[action.payload.groupId] =
          action.payload.requests.map(r => r.id);
      })
      .addCase(fetchAdminRemovalRequests.rejected, (state, action) => {
        state.status = 'failed';
        state.error = action.payload as string;
      })
      .addCase(fetchRemovalVotes.fulfilled, (state, action) => {
        state.votes[action.payload.requestId] = action.payload.votes;
      });
  },
});

export default adminRemovalSlice.reducer;

// --- Selectors ---

const requestsSelectors = requestsAdapter.getSelectors(
  (state: RootState) => state.adminRemoval.requests,
);

export const selectRemovalRequestsByGroup = createSelector(
  [
    (state: RootState) => state.adminRemoval.groupRequestIds,
    requestsSelectors.selectEntities,
    (_: RootState, groupId: string) => groupId,
  ],
  (groupRequestIds, entities, groupId) =>
    (groupRequestIds[groupId] || [])
      .map(id => entities[id])
      .filter((r): r is AdminRemovalRequest => r !== undefined),
);

export const selectPendingRequestsForGroup = createSelector(
  [selectRemovalRequestsByGroup],
  requests => requests.filter(r => r.status === 'pending'),
);

export const selectVotesForRequest = (state: RootState, requestId: string) =>
  state.adminRemoval.votes[requestId] || [];

export const selectAdminRemovalStatus = (state: RootState) =>
  state.adminRemoval.status;
```

**Step 3: Register reducer in store**

In `mobile/src/store/index.ts`, add `adminRemoval` to the `combineReducers` call:

```typescript
import adminRemovalReducer from './slices/adminRemovalSlice';

// In combineReducers:
adminRemoval: adminRemovalReducer,
```

Also update `RootState` type if it's manually maintained (check if it's inferred from store or manually typed).

**Step 4: Verify TypeScript compiles**

```bash
cd /Users/marcusklein/dev/RecoveryConnect/mobile && npx tsc --noEmit 2>&1 | head -30
```

Expected: No new errors

**Step 5: Commit**

```bash
cd /Users/marcusklein/dev/RecoveryConnect && git add mobile/src/types/domain/admin-removal.ts mobile/src/store/slices/adminRemovalSlice.ts mobile/src/store/index.ts
git commit -m "feat: add adminRemovalSlice with entity adapter and thunks"
```

---

## Task 3: `initiateAdminRemoval` Cloud Function

**Files:**
- Create: `functions/src/callable/initiateAdminRemoval.ts`
- Modify: `functions/src/index.ts` (export)

**Step 1: Create the Cloud Function**

```typescript
// functions/src/callable/initiateAdminRemoval.ts
import * as functions from "firebase-functions";
import { HttpsError } from "firebase-functions/v1/https";
import { CallableRequest } from "firebase-functions/v2/https";
import * as admin from "firebase-admin";
import { db, messaging } from "../utils/firebase";

interface InitiateRemovalData {
  groupId: string;
  targetAdminId: string;
  targetAdminName: string;
  reason: string;
}

interface InitiateRemovalResult {
  requestId: string;
}

export const initiateAdminRemoval = functions.https.onCall(
  async (
    request: CallableRequest<InitiateRemovalData>
  ): Promise<InitiateRemovalResult> => {
    const { data, auth: context } = request;

    if (!context) {
      throw new HttpsError("unauthenticated", "Must be authenticated.");
    }

    const callerId = context.uid;

    if (!data.groupId || !data.targetAdminId || !data.reason?.trim()) {
      throw new HttpsError(
        "invalid-argument",
        "groupId, targetAdminId, and reason are required."
      );
    }

    if (callerId === data.targetAdminId) {
      throw new HttpsError(
        "invalid-argument",
        "You cannot initiate a removal vote against yourself."
      );
    }

    // Verify caller is a group member
    const callerMemberDoc = await db
      .collection("members")
      .doc(`${data.groupId}_${callerId}`)
      .get();

    if (!callerMemberDoc.exists) {
      throw new HttpsError(
        "permission-denied",
        "Only group members can initiate removal votes."
      );
    }

    // Verify target is an admin
    const groupDoc = await db.collection("groups").doc(data.groupId).get();
    if (!groupDoc.exists) {
      throw new HttpsError("not-found", "Group not found.");
    }

    const groupData = groupDoc.data()!;
    const admins: string[] = groupData.admins || [];

    if (!admins.includes(data.targetAdminId)) {
      throw new HttpsError(
        "invalid-argument",
        "Target user is not an admin of this group."
      );
    }

    // Check for existing pending request for this target
    const existingSnapshot = await db
      .collection("admin_removal_requests")
      .where("groupId", "==", data.groupId)
      .where("targetAdminId", "==", data.targetAdminId)
      .where("status", "==", "pending")
      .limit(1)
      .get();

    if (!existingSnapshot.empty) {
      throw new HttpsError(
        "already-exists",
        "A pending removal vote already exists for this admin."
      );
    }

    // Get caller's display name
    const callerMemberData = callerMemberDoc.data()!;
    const callerName = callerMemberData.displayName || "A member";

    // Calculate expiry: 7 days from now
    const now = new Date();
    const expiresAt = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);

    // Create removal request
    const requestRef = db.collection("admin_removal_requests").doc();
    await requestRef.set({
      id: requestRef.id,
      groupId: data.groupId,
      targetAdminId: data.targetAdminId,
      targetAdminName: data.targetAdminName,
      initiatedBy: callerId,
      initiatedByName: callerName,
      reason: data.reason.trim(),
      status: "pending",
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      expiresAt: admin.firestore.Timestamp.fromDate(expiresAt),
      votesFor: 0,
      votesAgainst: 0,
      votesAbstain: 0,
      totalEligibleVoters: groupData.memberCount || 1,
    });

    functions.logger.info(
      `Admin removal vote initiated: group=${data.groupId} target=${data.targetAdminId} by=${callerId}`
    );

    // Notify all group members via FCM
    try {
      await notifyGroupMembers(data.groupId, data.targetAdminName, groupData.name, requestRef.id);
    } catch (err) {
      functions.logger.warn("FCM notification failed for admin removal:", err);
    }

    return { requestId: requestRef.id };
  }
);

async function notifyGroupMembers(
  groupId: string,
  targetAdminName: string,
  groupName: string,
  requestId: string
): Promise<void> {
  const membersSnapshot = await db
    .collection("members")
    .where("groupId", "==", groupId)
    .get();

  const memberUserIds = membersSnapshot.docs
    .map(doc => doc.data().userId as string)
    .filter(Boolean);

  const tokens: string[] = [];

  for (let i = 0; i < memberUserIds.length; i += 10) {
    const batch = memberUserIds.slice(i, i + 10);
    const usersSnapshot = await db
      .collection("users")
      .where("__name__", "in", batch)
      .get();

    usersSnapshot.docs.forEach(doc => {
      const userData = doc.data();
      const pushEnabled =
        userData.notificationSettings?.allowPushNotifications !== false;
      if (pushEnabled && userData.fcmTokens?.length) {
        tokens.push(...userData.fcmTokens);
      }
    });
  }

  if (tokens.length === 0) return;

  await messaging.sendEachForMulticast({
    tokens,
    notification: {
      title: `Admin Vote — ${groupName}`,
      body: `A vote has been called to remove ${targetAdminName} as admin. Cast your vote.`,
    },
    data: {
      type: "admin_removal_vote",
      groupId,
      requestId,
    },
    android: { priority: "high" },
    apns: { payload: { aps: { sound: "default", badge: 1 } } },
  });
}
```

**Step 2: Export from index**

In `functions/src/index.ts`, under `// --- Callable Functions ---`:

```typescript
export { initiateAdminRemoval } from "./callable/initiateAdminRemoval";
```

**Step 3: Build and check for TypeScript errors**

```bash
cd /Users/marcusklein/dev/RecoveryConnect/functions && npm run build 2>&1 | tail -20
```

Expected: Build succeeds with no errors

**Step 4: Commit**

```bash
cd /Users/marcusklein/dev/RecoveryConnect && git add functions/src/callable/initiateAdminRemoval.ts functions/src/index.ts
git commit -m "feat: add initiateAdminRemoval callable Cloud Function"
```

---

## Task 4: `voteOnAdminRemoval` and `submitAdminRemovalResponse` Cloud Functions

**Files:**
- Create: `functions/src/callable/voteOnAdminRemoval.ts`
- Create: `functions/src/callable/submitAdminRemovalResponse.ts`
- Modify: `functions/src/index.ts` (exports)

**Step 1: Create `voteOnAdminRemoval.ts`**

```typescript
// functions/src/callable/voteOnAdminRemoval.ts
import * as functions from "firebase-functions";
import { HttpsError } from "firebase-functions/v1/https";
import { CallableRequest } from "firebase-functions/v2/https";
import * as admin from "firebase-admin";
import { db } from "../utils/firebase";

interface VoteData {
  requestId: string;
  vote: "yes" | "no" | "abstain";
}

interface VoteResult {
  success: boolean;
  message: string;
}

export const voteOnAdminRemoval = functions.https.onCall(
  async (request: CallableRequest<VoteData>): Promise<VoteResult> => {
    const { data, auth: context } = request;

    if (!context) {
      throw new HttpsError("unauthenticated", "Must be authenticated.");
    }

    const callerId = context.uid;

    if (!data.requestId || !["yes", "no", "abstain"].includes(data.vote)) {
      throw new HttpsError(
        "invalid-argument",
        "requestId and vote (yes/no/abstain) are required."
      );
    }

    // Fetch the removal request
    const requestDoc = await db
      .collection("admin_removal_requests")
      .doc(data.requestId)
      .get();

    if (!requestDoc.exists) {
      throw new HttpsError("not-found", "Removal request not found.");
    }

    const removalData = requestDoc.data()!;

    if (removalData.status !== "pending") {
      throw new HttpsError(
        "failed-precondition",
        `Vote is closed (status: ${removalData.status}).`
      );
    }

    const now = admin.firestore.Timestamp.now();
    if (removalData.expiresAt.toMillis() < now.toMillis()) {
      throw new HttpsError("failed-precondition", "Vote has expired.");
    }

    // Target admin cannot vote on their own removal
    if (callerId === removalData.targetAdminId) {
      throw new HttpsError(
        "permission-denied",
        "The targeted admin cannot vote on their own removal."
      );
    }

    // Verify caller is a group member
    const callerMemberDoc = await db
      .collection("members")
      .doc(`${removalData.groupId}_${callerId}`)
      .get();

    if (!callerMemberDoc.exists) {
      throw new HttpsError(
        "permission-denied",
        "Only group members can vote."
      );
    }

    const callerName =
      callerMemberDoc.data()?.displayName || "A member";

    // Upsert vote document (one vote per user, can change)
    const voteRef = db
      .collection("admin_removal_requests")
      .doc(data.requestId)
      .collection("votes")
      .doc(callerId);

    const existingVoteDoc = await voteRef.get();
    const previousVote = existingVoteDoc.exists
      ? (existingVoteDoc.data()!.vote as string)
      : null;

    await voteRef.set({
      userId: callerId,
      userName: callerName,
      vote: data.vote,
      votedAt: admin.firestore.FieldValue.serverTimestamp(),
    });

    // Recalculate tallies from scratch to ensure consistency
    const allVotesSnapshot = await db
      .collection("admin_removal_requests")
      .doc(data.requestId)
      .collection("votes")
      .get();

    let votesFor = 0;
    let votesAgainst = 0;
    let votesAbstain = 0;

    allVotesSnapshot.docs.forEach(doc => {
      const v = doc.data().vote;
      if (v === "yes") votesFor++;
      else if (v === "no") votesAgainst++;
      else if (v === "abstain") votesAbstain++;
    });

    // Check resolution conditions
    const total = removalData.totalEligibleVoters;
    const threshold = Math.ceil(total * 2 / 3);
    const definitivelyFailed = votesAgainst > Math.floor(total / 3);

    let newStatus = "pending";
    let resolvedAt: admin.firestore.FieldValue | undefined;

    if (votesFor >= threshold) {
      newStatus = "approved";
      resolvedAt = admin.firestore.FieldValue.serverTimestamp();
    } else if (definitivelyFailed) {
      newStatus = "rejected";
      resolvedAt = admin.firestore.FieldValue.serverTimestamp();
    }

    const updateData: Record<string, any> = {
      votesFor,
      votesAgainst,
      votesAbstain,
      status: newStatus,
    };
    if (resolvedAt) updateData.resolvedAt = resolvedAt;

    await requestDoc.ref.update(updateData);

    // If approved, remove the admin
    if (newStatus === "approved") {
      await removeAdmin(removalData.groupId, removalData.targetAdminId);
      functions.logger.info(
        `Admin ${removalData.targetAdminId} removed from group ${removalData.groupId} by vote`
      );
    }

    functions.logger.info(
      `Vote recorded: request=${data.requestId} voter=${callerId} vote=${data.vote} previousVote=${previousVote} tally=${votesFor}/${votesAgainst}/${votesAbstain}`
    );

    return { success: true, message: "Vote recorded successfully." };
  }
);

async function removeAdmin(groupId: string, userId: string): Promise<void> {
  const batch = db.batch();

  // Update member document
  const memberRef = db.collection("members").doc(`${groupId}_${userId}`);
  batch.update(memberRef, {
    isAdmin: false,
    roles: admin.firestore.FieldValue.arrayRemove("admin"),
  });

  // Update group admins array
  const groupRef = db.collection("groups").doc(groupId);
  batch.update(groupRef, {
    admins: admin.firestore.FieldValue.arrayRemove(userId),
    adminUids: admin.firestore.FieldValue.arrayRemove(userId),
    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
  });

  await batch.commit();
  // onMemberWrite trigger will sync custom claims automatically
}
```

**Step 2: Create `submitAdminRemovalResponse.ts`**

```typescript
// functions/src/callable/submitAdminRemovalResponse.ts
import * as functions from "firebase-functions";
import { HttpsError } from "firebase-functions/v1/https";
import { CallableRequest } from "firebase-functions/v2/https";
import * as admin from "firebase-admin";
import { db } from "../utils/firebase";

interface ResponseData {
  requestId: string;
  response: string;
}

export const submitAdminRemovalResponse = functions.https.onCall(
  async (request: CallableRequest<ResponseData>): Promise<{success: boolean}> => {
    const { data, auth: context } = request;

    if (!context) {
      throw new HttpsError("unauthenticated", "Must be authenticated.");
    }

    if (!data.requestId || !data.response?.trim()) {
      throw new HttpsError("invalid-argument", "requestId and response are required.");
    }

    const requestDoc = await db
      .collection("admin_removal_requests")
      .doc(data.requestId)
      .get();

    if (!requestDoc.exists) {
      throw new HttpsError("not-found", "Request not found.");
    }

    const removalData = requestDoc.data()!;

    if (context.uid !== removalData.targetAdminId) {
      throw new HttpsError(
        "permission-denied",
        "Only the targeted admin can submit a response."
      );
    }

    if (removalData.status !== "pending") {
      throw new HttpsError(
        "failed-precondition",
        "Cannot respond to a closed vote."
      );
    }

    await requestDoc.ref.update({
      adminResponse: data.response.trim(),
      adminRespondedAt: admin.firestore.FieldValue.serverTimestamp(),
    });

    return { success: true };
  }
);
```

**Step 3: Export both from index**

In `functions/src/index.ts`:

```typescript
export { voteOnAdminRemoval } from "./callable/voteOnAdminRemoval";
export { submitAdminRemovalResponse } from "./callable/submitAdminRemovalResponse";
```

**Step 4: Build**

```bash
cd /Users/marcusklein/dev/RecoveryConnect/functions && npm run build 2>&1 | tail -20
```

Expected: Build succeeds

**Step 5: Commit**

```bash
cd /Users/marcusklein/dev/RecoveryConnect && git add functions/src/callable/voteOnAdminRemoval.ts functions/src/callable/submitAdminRemovalResponse.ts functions/src/index.ts
git commit -m "feat: add voteOnAdminRemoval and submitAdminRemovalResponse Cloud Functions"
```

---

## Task 5: Scheduled Expiry Cloud Function

**Files:**
- Create: `functions/src/triggers/pubsub/scheduledAdminRemovalExpiry.ts`
- Modify: `functions/src/index.ts` (export)

**Step 1: Create the scheduled function**

Follow the pattern from `functions/src/triggers/pubsub/scheduledTrialReminders.ts`.

```typescript
// functions/src/triggers/pubsub/scheduledAdminRemovalExpiry.ts
import * as functionsV1 from "firebase-functions/v1";
import * as functions from "firebase-functions";
import * as admin from "firebase-admin";
import { db } from "../../utils/firebase";

/**
 * Runs daily at 01:00 UTC.
 * Finds all pending admin removal requests whose expiresAt has passed
 * and marks them as 'expired'.
 */
export const scheduledAdminRemovalExpiry = functionsV1.pubsub
  .schedule("0 1 * * *")
  .timeZone("UTC")
  .onRun(async () => {
    const now = admin.firestore.Timestamp.now();

    const expiredSnapshot = await db
      .collection("admin_removal_requests")
      .where("status", "==", "pending")
      .where("expiresAt", "<=", now)
      .get();

    if (expiredSnapshot.empty) {
      functions.logger.info("No expired admin removal requests found.");
      return null;
    }

    const batch = db.batch();

    expiredSnapshot.docs.forEach(doc => {
      batch.update(doc.ref, {
        status: "expired",
        resolvedAt: admin.firestore.FieldValue.serverTimestamp(),
      });
    });

    await batch.commit();

    functions.logger.info(
      `Marked ${expiredSnapshot.size} admin removal request(s) as expired.`
    );

    return null;
  });
```

**Step 2: Export from index**

In `functions/src/index.ts`, under `// --- Pub/Sub Scheduled Functions ---`:

```typescript
export { scheduledAdminRemovalExpiry } from "./triggers/pubsub/scheduledAdminRemovalExpiry";
```

**Step 3: Build**

```bash
cd /Users/marcusklein/dev/RecoveryConnect/functions && npm run build 2>&1 | tail -20
```

Expected: Build succeeds

**Step 4: Commit**

```bash
cd /Users/marcusklein/dev/RecoveryConnect && git add functions/src/triggers/pubsub/scheduledAdminRemovalExpiry.ts functions/src/index.ts
git commit -m "feat: add scheduledAdminRemovalExpiry daily Cloud Function"
```

---

## Task 6: `AdminRemovalRequestsScreen`

**Files:**
- Create: `mobile/src/screens/homegroup/AdminRemovalRequestsScreen.tsx`

This screen lists all removal requests for a group. Members can vote; the target admin can submit a response.

**Step 1: Create the screen**

```typescript
// mobile/src/screens/homegroup/AdminRemovalRequestsScreen.tsx
import React, {useEffect, useState} from 'react';
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  Alert,
  TextInput,
} from 'react-native';
import {useDispatch, useSelector} from 'react-redux';
import {StackNavigationProp} from '@react-navigation/stack';
import {RouteProp} from '@react-navigation/native';
import {GroupStackParamList} from '../../types/navigation';
import {AppDispatch} from '../../store/types';
import {
  fetchAdminRemovalRequests,
  fetchRemovalVotes,
  castVote,
  submitAdminResponse,
  selectPendingRequestsForGroup,
  selectRemovalRequestsByGroup,
  selectVotesForRequest,
  selectAdminRemovalStatus,
} from '../../store/slices/adminRemovalSlice';
import {AdminRemovalRequest} from '../../types/domain/admin-removal';
import {useSelector as useAuthSelector} from 'react-redux';
import {selectCurrentUser} from '../../store/slices/authSlice';

type Props = {
  navigation: StackNavigationProp<GroupStackParamList, 'AdminRemovalRequests'>;
  route: RouteProp<GroupStackParamList, 'AdminRemovalRequests'>;
};

const AdminRemovalRequestsScreen: React.FC<Props> = ({route}) => {
  const {groupId} = route.params;
  const dispatch = useDispatch<AppDispatch>();
  const currentUser = useAuthSelector(selectCurrentUser);
  const requests = useSelector((state: any) =>
    selectRemovalRequestsByGroup(state, groupId),
  );
  const loadStatus = useSelector(selectAdminRemovalStatus);
  const [responseText, setResponseText] = useState('');
  const [respondingTo, setRespondingTo] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    dispatch(fetchAdminRemovalRequests(groupId));
  }, [dispatch, groupId]);

  const handleVote = (requestId: string, vote: 'yes' | 'no' | 'abstain') => {
    Alert.alert(
      'Confirm Vote',
      `Vote "${vote}" on this removal request?`,
      [
        {text: 'Cancel', style: 'cancel'},
        {
          text: 'Confirm',
          onPress: () => {
            dispatch(castVote({requestId, vote})).then(() => {
              dispatch(fetchAdminRemovalRequests(groupId));
            });
          },
        },
      ],
    );
  };

  const handleSubmitResponse = async (requestId: string) => {
    if (!responseText.trim()) {
      Alert.alert('Error', 'Response cannot be empty.');
      return;
    }
    setSubmitting(true);
    try {
      await dispatch(
        submitAdminResponse({requestId, response: responseText.trim()}),
      ).unwrap();
      setRespondingTo(null);
      setResponseText('');
      dispatch(fetchAdminRemovalRequests(groupId));
    } catch (err: any) {
      Alert.alert('Error', err || 'Failed to submit response.');
    } finally {
      setSubmitting(false);
    }
  };

  const renderRequest = ({item}: {item: AdminRemovalRequest}) => {
    const isTarget = currentUser?.uid === item.targetAdminId;
    const isInitiator = currentUser?.uid === item.initiatedBy;
    const canVote = !isTarget && item.status === 'pending';
    const threshold = Math.ceil(item.totalEligibleVoters * 2 / 3);
    const expiresDate = new Date(item.expiresAt).toLocaleDateString();

    return (
      <View style={styles.card}>
        <Text style={styles.cardTitle}>
          Remove {item.targetAdminName} as Admin
        </Text>
        <Text style={styles.reason}>Reason: {item.reason}</Text>
        <Text style={styles.meta}>
          Initiated by {item.initiatedByName} · Expires {expiresDate}
        </Text>

        <View style={styles.tallyRow}>
          <Text style={styles.tallyFor}>✓ {item.votesFor} for</Text>
          <Text style={styles.tallyAgainst}>✗ {item.votesAgainst} against</Text>
          <Text style={styles.tallyAbstain}>― {item.votesAbstain} abstain</Text>
        </View>
        <Text style={styles.threshold}>Needs {threshold} yes votes of {item.totalEligibleVoters} eligible</Text>

        <Text style={[styles.status, item.status === 'approved' ? styles.approved : item.status === 'rejected' || item.status === 'expired' ? styles.rejected : styles.pending]}>
          {item.status.toUpperCase()}
        </Text>

        {item.adminResponse ? (
          <View style={styles.responseBox}>
            <Text style={styles.responseLabel}>{item.targetAdminName}'s response:</Text>
            <Text style={styles.responseText}>{item.adminResponse}</Text>
          </View>
        ) : null}

        {canVote && (
          <View style={styles.voteRow}>
            <TouchableOpacity
              style={[styles.voteBtn, styles.voteBtnFor]}
              onPress={() => handleVote(item.id, 'yes')}>
              <Text style={styles.voteBtnText}>Vote Yes</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.voteBtn, styles.voteBtnAgainst]}
              onPress={() => handleVote(item.id, 'no')}>
              <Text style={styles.voteBtnText}>Vote No</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.voteBtn, styles.voteBtnAbstain]}
              onPress={() => handleVote(item.id, 'abstain')}>
              <Text style={styles.voteBtnText}>Abstain</Text>
            </TouchableOpacity>
          </View>
        )}

        {isTarget && item.status === 'pending' && !item.adminResponse && (
          respondingTo === item.id ? (
            <View>
              <TextInput
                style={styles.responseInput}
                placeholder="Write your response to the group..."
                value={responseText}
                onChangeText={setResponseText}
                multiline
                maxLength={500}
              />
              <TouchableOpacity
                style={styles.submitBtn}
                onPress={() => handleSubmitResponse(item.id)}
                disabled={submitting}>
                <Text style={styles.submitBtnText}>
                  {submitting ? 'Submitting...' : 'Submit Response'}
                </Text>
              </TouchableOpacity>
            </View>
          ) : (
            <TouchableOpacity
              style={styles.respondBtn}
              onPress={() => setRespondingTo(item.id)}>
              <Text style={styles.respondBtnText}>Respond to Group</Text>
            </TouchableOpacity>
          )
        )}
      </View>
    );
  };

  if (loadStatus === 'loading' && requests.length === 0) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" />
      </View>
    );
  }

  return (
    <FlatList
      data={requests}
      keyExtractor={item => item.id}
      renderItem={renderRequest}
      contentContainerStyle={styles.list}
      ListEmptyComponent={
        <View style={styles.centered}>
          <Text style={styles.emptyText}>No removal requests for this group.</Text>
        </View>
      }
    />
  );
};

const styles = StyleSheet.create({
  list: {padding: 16, flexGrow: 1},
  centered: {flex: 1, justifyContent: 'center', alignItems: 'center', padding: 32},
  emptyText: {color: '#666', textAlign: 'center'},
  card: {
    backgroundColor: '#fff',
    borderRadius: 8,
    padding: 16,
    marginBottom: 16,
    shadowColor: '#000',
    shadowOffset: {width: 0, height: 1},
    shadowOpacity: 0.1,
    shadowRadius: 2,
    elevation: 2,
  },
  cardTitle: {fontSize: 16, fontWeight: '700', marginBottom: 4, color: '#c0392b'},
  reason: {fontSize: 14, color: '#333', marginBottom: 4},
  meta: {fontSize: 12, color: '#888', marginBottom: 8},
  tallyRow: {flexDirection: 'row', gap: 12, marginBottom: 4},
  tallyFor: {color: '#27ae60', fontWeight: '600'},
  tallyAgainst: {color: '#e74c3c', fontWeight: '600'},
  tallyAbstain: {color: '#888', fontWeight: '600'},
  threshold: {fontSize: 12, color: '#555', marginBottom: 8},
  status: {fontWeight: '700', fontSize: 12, marginBottom: 8},
  approved: {color: '#27ae60'},
  rejected: {color: '#e74c3c'},
  pending: {color: '#f39c12'},
  responseBox: {backgroundColor: '#f8f8f8', borderRadius: 6, padding: 10, marginBottom: 8},
  responseLabel: {fontSize: 12, fontWeight: '600', color: '#555', marginBottom: 4},
  responseText: {fontSize: 14, color: '#333'},
  voteRow: {flexDirection: 'row', gap: 8, marginTop: 8},
  voteBtn: {flex: 1, paddingVertical: 8, borderRadius: 6, alignItems: 'center'},
  voteBtnFor: {backgroundColor: '#27ae60'},
  voteBtnAgainst: {backgroundColor: '#e74c3c'},
  voteBtnAbstain: {backgroundColor: '#95a5a6'},
  voteBtnText: {color: '#fff', fontWeight: '600', fontSize: 13},
  responseInput: {
    borderWidth: 1,
    borderColor: '#ddd',
    borderRadius: 6,
    padding: 10,
    minHeight: 80,
    textAlignVertical: 'top',
    marginTop: 8,
    marginBottom: 8,
  },
  submitBtn: {
    backgroundColor: '#2980b9',
    borderRadius: 6,
    padding: 10,
    alignItems: 'center',
  },
  submitBtnText: {color: '#fff', fontWeight: '600'},
  respondBtn: {
    borderWidth: 1,
    borderColor: '#2980b9',
    borderRadius: 6,
    padding: 10,
    alignItems: 'center',
    marginTop: 8,
  },
  respondBtnText: {color: '#2980b9', fontWeight: '600'},
});

export default AdminRemovalRequestsScreen;
```

**Step 2: Verify TypeScript**

```bash
cd /Users/marcusklein/dev/RecoveryConnect/mobile && npx tsc --noEmit 2>&1 | head -30
```

**Step 3: Commit**

```bash
cd /Users/marcusklein/dev/RecoveryConnect && git add mobile/src/screens/homegroup/AdminRemovalRequestsScreen.tsx
git commit -m "feat: add AdminRemovalRequestsScreen with vote UI and admin response"
```

---

## Task 7: Navigation Registration

**Files:**
- Modify: `mobile/src/types/navigation/index.ts`
- Modify: `mobile/src/navigation/GroupStackNavigator.tsx`

**Step 1: Add route to `GroupStackParamList`**

In `mobile/src/types/navigation/index.ts`, add before `DirectMessage`:

```typescript
  AdminRemovalRequests: {groupId: string; groupName: string};
```

**Step 2: Register screen in `GroupStackNavigator.tsx`**

Add the import after existing admin/moderation imports (around line 53):

```typescript
import AdminRemovalRequestsScreen from '../screens/homegroup/AdminRemovalRequestsScreen';
```

Add the `Stack.Screen` entry after the `UserBans` screen registration (around line 371):

```typescript
      <Stack.Screen
        name="AdminRemovalRequests"
        component={AdminRemovalRequestsScreen}
        options={({route}) => ({
          title: `${route.params.groupName} - Admin Removal Votes`,
        })}
      />
```

**Step 3: Verify TypeScript**

```bash
cd /Users/marcusklein/dev/RecoveryConnect/mobile && npx tsc --noEmit 2>&1 | head -30
```

Expected: No errors

**Step 4: Commit**

```bash
cd /Users/marcusklein/dev/RecoveryConnect && git add mobile/src/types/navigation/index.ts mobile/src/navigation/GroupStackNavigator.tsx
git commit -m "feat: register AdminRemovalRequestsScreen in navigation"
```

---

## Task 8: Entry Points — Initiate and View from GroupMembersScreen

**Files:**
- Modify: `mobile/src/screens/homegroup/GroupMembersScreen.tsx`

This adds two entry points:
1. **"Request Removal" button** on admin member rows (opens `InitiateRemovalModal`)
2. **"View Removal Votes" button** in the screen header/footer that navigates to `AdminRemovalRequestsScreen`

**Step 1: Read the current GroupMembersScreen to understand the member row structure**

Run: Read `mobile/src/screens/homegroup/GroupMembersScreen.tsx`

Look for: how member action buttons are rendered (e.g., TouchableOpacity in member row), how navigation is called, where admin-only actions are gated.

**Step 2: Add initiation modal state**

At the top of the component, add state:

```typescript
const [removalTarget, setRemovalTarget] = useState<{id: string; name: string} | null>(null);
const [removalReason, setRemovalReason] = useState('');
const [initiating, setInitiating] = useState(false);
```

**Step 3: Add "Request Removal" button to admin member rows**

Find where member action buttons are rendered. Add a "Request Removal" `TouchableOpacity` visible when:
- `currentMember.isAdmin === false` (only non-admins can initiate)
- The listed member `isAdmin === true` (only admins can be targeted)
- The listed member is not the current user

```typescript
{!currentMember?.isAdmin && member.isAdmin && member.userId !== currentUser?.uid && (
  <TouchableOpacity
    style={styles.removalBtn}
    onPress={() => setRemovalTarget({id: member.userId, name: member.name})}>
    <Text style={styles.removalBtnText}>Request Removal</Text>
  </TouchableOpacity>
)}
```

Add to styles:
```typescript
removalBtn: {marginTop: 8, paddingVertical: 6, paddingHorizontal: 12, borderWidth: 1, borderColor: '#e74c3c', borderRadius: 6},
removalBtnText: {color: '#e74c3c', fontSize: 13},
```

**Step 4: Add the initiation modal**

Add a `Modal` component at the bottom of the JSX tree (before the closing `</View>`):

```typescript
<Modal visible={!!removalTarget} transparent animationType="slide">
  <View style={styles.modalOverlay}>
    <View style={styles.modalContent}>
      <Text style={styles.modalTitle}>
        Request Removal: {removalTarget?.name}
      </Text>
      <Text style={styles.modalSubtitle}>
        Provide a reason for the group to consider. A 7-day vote will be opened
        requiring 2/3 majority to approve.
      </Text>
      <TextInput
        style={styles.reasonInput}
        placeholder="Reason for removal (required)"
        value={removalReason}
        onChangeText={setRemovalReason}
        multiline
        maxLength={300}
      />
      <View style={styles.modalActions}>
        <TouchableOpacity
          style={styles.cancelBtn}
          onPress={() => {
            setRemovalTarget(null);
            setRemovalReason('');
          }}>
          <Text style={styles.cancelBtnText}>Cancel</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.confirmBtn, initiating && styles.disabledBtn]}
          disabled={initiating || !removalReason.trim()}
          onPress={async () => {
            if (!removalTarget || !removalReason.trim()) return;
            setInitiating(true);
            try {
              await dispatch(
                initiateAdminRemoval({
                  groupId,
                  targetAdminId: removalTarget.id,
                  targetAdminName: removalTarget.name,
                  reason: removalReason.trim(),
                }),
              ).unwrap();
              setRemovalTarget(null);
              setRemovalReason('');
              Alert.alert(
                'Vote Initiated',
                'The group has been notified. The vote will close in 7 days.',
              );
              navigation.navigate('AdminRemovalRequests', {groupId, groupName});
            } catch (err: any) {
              Alert.alert('Error', err || 'Failed to initiate removal vote.');
            } finally {
              setInitiating(false);
            }
          }}>
          <Text style={styles.confirmBtnText}>
            {initiating ? 'Initiating...' : 'Start Vote'}
          </Text>
        </TouchableOpacity>
      </View>
    </View>
  </View>
</Modal>
```

Add necessary styles for `modalOverlay`, `modalContent`, `modalTitle`, `modalSubtitle`, `reasonInput`, `modalActions`, `cancelBtn`, `cancelBtnText`, `confirmBtn`, `confirmBtnText`, `disabledBtn`.

Add the import at the top of the file:
```typescript
import {initiateAdminRemoval} from '../../store/slices/adminRemovalSlice';
```

**Step 5: Add "View Removal Votes" navigation entry**

In the header or footer of the screen, add a button visible to all members:

```typescript
<TouchableOpacity
  style={styles.viewVotesBtn}
  onPress={() => navigation.navigate('AdminRemovalRequests', {groupId, groupName})}>
  <Text style={styles.viewVotesBtnText}>View Admin Removal Votes</Text>
</TouchableOpacity>
```

The exact placement depends on the existing UI — read the file first to find the right spot (e.g., in the ListHeaderComponent or after the FlatList).

**Step 6: Verify TypeScript**

```bash
cd /Users/marcusklein/dev/RecoveryConnect/mobile && npx tsc --noEmit 2>&1 | head -30
```

**Step 7: Commit**

```bash
cd /Users/marcusklein/dev/RecoveryConnect && git add mobile/src/screens/homegroup/GroupMembersScreen.tsx
git commit -m "feat: add admin removal initiation UI to GroupMembersScreen"
```

---

## Task 9: Firestore Security Rules

**Files:**
- Modify: `firestore.rules`

**Step 1: Read current rules to find admin-check helpers**

Run: Read `firestore.rules` to understand existing helper functions like `isGroupAdmin(groupId)`, `isGroupMember(groupId)`, and the fallback pattern.

**Step 2: Add rules for `admin_removal_requests` collection**

The rules follow these principles:
- **Read** (list + get): any authenticated group member
- **Create**: denied (only Cloud Functions can create via `initiateAdminRemoval`)
- **Update** (`adminResponse`, `adminRespondedAt` only): the targeted admin, for pending requests
- **Delete**: denied
- **votes subcollection read**: any group member
- **votes subcollection write**: denied (only Cloud Functions via `voteOnAdminRemoval`)

Add after the `user_bans` collection rules:

```
match /admin_removal_requests/{requestId} {
  // Any authenticated user can read (group membership checked in client)
  allow read: if request.auth != null;

  // Only Cloud Functions can create/delete
  allow create, delete: if false;

  // Target admin can submit their response for pending requests only
  allow update: if request.auth != null
    && request.auth.uid == resource.data.targetAdminId
    && resource.data.status == 'pending'
    && request.resource.data.diff(resource.data).affectedKeys()
        .hasOnly(['adminResponse', 'adminRespondedAt']);

  match /votes/{userId} {
    // Any authenticated user can read votes
    allow read: if request.auth != null;
    // Only Cloud Functions write votes
    allow write: if false;
  }
}
```

**Step 3: Verify rules syntax**

```bash
cd /Users/marcusklein/dev/RecoveryConnect && firebase emulators:start --only firestore --export-on-exit /tmp/emulator-data 2>&1 | head -20
```

If emulators aren't set up, at minimum verify the file has no obvious syntax errors by checking indentation and bracket matching manually.

**Step 4: Commit**

```bash
cd /Users/marcusklein/dev/RecoveryConnect && git add firestore.rules
git commit -m "feat: add Firestore security rules for admin_removal_requests"
```

---

## Testing

After all tasks are committed, manually verify in the simulator:

1. **As a non-admin member**: Go to Group Members → tap an admin row → "Request Removal" button appears → fill in reason → tap "Start Vote" → vote is created, FCM sent, navigated to `AdminRemovalRequestsScreen`
2. **As the targeted admin**: Open `AdminRemovalRequestsScreen` → see vote with current tallies → tap "Respond to Group" → submit response → response appears on the card
3. **As another member**: Open `AdminRemovalRequestsScreen` → vote buttons visible → cast a vote → tallies update immediately after re-fetch
4. **TypeScript**: `cd mobile && npx tsc --noEmit` — no errors
5. **Functions build**: `cd functions && npm run build` — no errors
