# Resident Application Workflow MVP — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

> **Scope note:** The roadmap spec (`2026-05-20-roadmap-from-docs-analysis.md`) covers 6 independent engineering subsystems. This plan covers the P0-Eng item only. P1 items (guest discharge, payment failure UI, balance aging, CSV export, bulk import) should each be separate plans.

**Goal:** Let residents find a house in the directory and submit an application in-app; let operators review, approve, or reject it — building Regroup's two-sided marketplace moat before Sobriety Hub ships equivalent functionality (~6 month window).

**Architecture:** Applications live as a Firestore subcollection `houses/{houseId}/applications/{appId}`. Any authenticated user can create their own application (Firestore rule: `applicantUid == request.auth.uid`); only house admins can update status. On approval, the operator navigates to the existing `ResidentIntake` flow with `applicationId` passed as a param. Push notifications to house admins are delivered by writing to `/notifications/{id}` (which the existing `notify` trigger picks up for push delivery).

**Tech Stack:** React Native, Firebase Firestore (subcollections + collection group queries), React Query v5 (TanStack), Firebase Functions v2 (`onDocumentCreated`), Firestore Security Rules, `@firebase/rules-unit-testing`

**Competitive context:** Sobriety Hub launched a read-only directory in March 2026 with no application workflow. This is the primary structural moat. Ship before Sobriety Hub closes the gap.

---

## File Structure

**Modify (existing but empty):**

- `src/entities/Application.ts` — redefine with all fields (currently: `class HouseApplication extends BaseEntity {}`)

**Create:**

- `src/services/applications.ts` — CRUD for `houses/{houseId}/applications/{appId}` subcollection
- `src/services/__tests__/applications.test.ts` — service unit tests
- `src/state/queries/applicationQueries.ts` — React Query hooks
- `src/screens/Application/ApplyScreen.tsx` — resident-facing: multi-step application form
- `src/screens/Application/ApplicationStatusScreen.tsx` — resident-facing: tracks status after submission
- `src/screens/Applications/ApplicationListScreen.tsx` — operator: pending application queue with tabs
- `src/screens/Applications/ApplicationDetailScreen.tsx` — operator: full application view + approve/reject

**Modify:**

- `src/navigation/types.ts` — add 4 routes to `Routes` enum + `RootStackParamList`; update `ResidentIntake` params to accept optional `applicationId`
- `src/navigation/navigators.tsx` — register 4 new screens
- `firebase/firestore.rules` — add `applications` subcollection rule inside `match /houses/{houseId}`
- `firebase/__tests__/firestore.rules.test.ts` — add applications rules test group
- `functions/src/entities/Notification.ts` — add `"application-received"` to `NotificationType`
- `functions/src/triggers/firestore/index.ts` — add `notifyOperatorOnApplication` trigger

**Key constraints (read before implementing):**

- `auth` is exported from `firebase-setup.ts` as an **already-initialized singleton**. Use `auth.currentUser`, not `auth().currentUser`. Import: `import { auth } from '../../firebase-setup'`.
- Service tests use self-contained `jest.mock` factories with `_mock` prefix for private references (see `src/services/__tests__/guest.test.ts` for the exact pattern).
- All screens use `useNavigation<any>()` and `useRoute<any>()` (project convention — avoids typed nav prop boilerplate).
- Rules tests require Firestore emulator on port 8080. Start with: `cd firebase && firebase emulators:start --only firestore`.

---

### Task 1: HouseApplication Entity

**Files:**

- Modify: `src/entities/Application.ts`

- [ ] **Step 1: Write the failing test**

Create `src/services/__tests__/applicationEntity.test.ts`:

```typescript
// src/services/__tests__/applicationEntity.test.ts
import { HouseApplication } from '../../entities/Application';

describe('HouseApplication entity', () => {
  it('initializes with status pending', () => {
    expect(new HouseApplication().status).toBe('pending');
  });

  it('initializes all string fields to empty string', () => {
    const app = new HouseApplication();
    expect(app.houseId).toBe('');
    expect(app.applicantUid).toBe('');
    expect(app.applicantName).toBe('');
    expect(app.applicantEmail).toBe('');
    expect(app.applicantPhone).toBe('');
    expect(app.sobrietyDate).toBe('');
    expect(app.currentSituation).toBe('');
    expect(app.references).toBe('');
    expect(app.operatorNote).toBe('');
    expect(app.createdAt).toBe('');
    expect(app.reviewedAt).toBe('');
    expect(app.reviewedBy).toBe('');
  });

  it('defaults programType to AA', () => {
    expect(new HouseApplication().programType).toBe('AA');
  });
});
```

- [ ] **Step 2: Run to verify failure**

```bash
cd /Users/marcusklein/dev/rats-v2
yarn test src/services/__tests__/applicationEntity.test.ts --no-coverage
```

Expected: FAIL — `status` undefined, `houseId` undefined (entity currently empty)

- [ ] **Step 3: Rewrite the entity**

```typescript
// src/entities/Application.ts
import { BaseEntity } from './BaseEntity';

export type ApplicationStatus =
  | 'pending'
  | 'reviewing'
  | 'approved'
  | 'rejected';
export type ProgramType = 'AA' | 'NA' | 'SMART Recovery' | 'other';

export class HouseApplication extends BaseEntity {
  houseId: string = '';
  applicantUid: string = '';
  applicantName: string = '';
  applicantEmail: string = '';
  applicantPhone: string = '';
  sobrietyDate: string = '';
  programType: ProgramType = 'AA';
  currentSituation: string = '';
  references: string = '';
  status: ApplicationStatus = 'pending';
  operatorNote: string = '';
  createdAt: string = '';
  reviewedAt: string = '';
  reviewedBy: string = '';
}

export interface HouseApplications {
  [id: string]: HouseApplication;
}
```

- [ ] **Step 4: Run to verify pass**

```bash
yarn test src/services/__tests__/applicationEntity.test.ts --no-coverage
```

Expected: PASS — 3 tests

- [ ] **Step 5: Commit**

```bash
git add src/entities/Application.ts src/services/__tests__/applicationEntity.test.ts
git commit -m "feat(applications): define HouseApplication entity with full field set"
```

---

### Task 2: Applications Firestore Service

**Files:**

- Create: `src/services/applications.ts`
- Create: `src/services/__tests__/applications.test.ts`

- [ ] **Step 1: Write the failing tests**

```typescript
// src/services/__tests__/applications.test.ts

// ─── Mocks (hoisted before imports) ─────────────────────────────────────────
// jest.mock factories must be self-contained — no external variable references.
// Expose private mocks via _mock properties on the module (same pattern as guest.test.ts).

jest.mock('../../../firebase-setup', () => {
  const mockSet = jest.fn().mockResolvedValue(undefined);
  const mockUpdate = jest.fn().mockResolvedValue(undefined);
  const mockGet = jest.fn();
  const mockOrderBy = jest.fn(() => ({ get: mockGet }));
  const mockWhere = jest.fn(() => ({ orderBy: mockOrderBy, get: mockGet }));
  const mockAppDoc = jest.fn(() => ({
    set: mockSet,
    update: mockUpdate,
    id: 'generated-app-id',
  }));
  const mockAppCollection = jest.fn(() => ({
    doc: mockAppDoc,
    orderBy: mockOrderBy,
  }));
  const mockHouseDoc = jest.fn(() => ({ collection: mockAppCollection }));
  const mockHousesCollection = jest.fn(() => ({ doc: mockHouseDoc }));
  const mockCollectionGroup = jest.fn(() => ({ where: mockWhere }));
  const mockAuthObj = { currentUser: { uid: 'applicant-uid-1' } };

  return {
    firestore: {
      collection: mockHousesCollection,
      collectionGroup: mockCollectionGroup,
      _mockSet: mockSet,
      _mockUpdate: mockUpdate,
      _mockGet: mockGet,
      _mockWhere: mockWhere,
    },
    auth: mockAuthObj,
    _mockAuth: mockAuthObj,
  };
});

// ─── Imports (after mocks) ───────────────────────────────────────────────────

import { firestore } from '../../../firebase-setup';
import {
  submitApplication,
  listHouseApplications,
  getMyApplications,
  updateApplicationStatus,
} from '../applications';
import { HouseApplication } from '../../entities/Application';

// ─── Helpers ─────────────────────────────────────────────────────────────────

const getSet = () => (firestore as any)._mockSet as jest.Mock;
const getUpdate = () => (firestore as any)._mockUpdate as jest.Mock;
const getGet = () => (firestore as any)._mockGet as jest.Mock;
const getMockAuth = () => (require('../../../firebase-setup') as any)._mockAuth;

const baseData = {
  applicantName: 'Alice Smith',
  applicantEmail: 'alice@example.com',
  applicantPhone: '555-0100',
  sobrietyDate: '2023-06-15',
  programType: 'AA' as const,
  currentSituation: 'Transitioning out of a 30-day program',
  references: 'John (sponsor): 555-0199',
};

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('applications service', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    getMockAuth().currentUser = { uid: 'applicant-uid-1' };
  });

  describe('submitApplication', () => {
    it('writes a document to houses/{houseId}/applications', async () => {
      await submitApplication('house-1', baseData);

      expect(firestore.collection).toHaveBeenCalledWith('houses');
      expect(getSet()).toHaveBeenCalledWith(
        expect.objectContaining({
          applicantUid: 'applicant-uid-1',
          houseId: 'house-1',
          status: 'pending',
          applicantName: 'Alice Smith',
        }),
      );
    });

    it('sets createdAt to a valid ISO string', async () => {
      await submitApplication('house-1', baseData);
      const written = getSet().mock.calls[0][0];
      expect(new Date(written.createdAt).toISOString()).toBe(written.createdAt);
    });

    it('returns the generated application id', async () => {
      const id = await submitApplication('house-1', baseData);
      expect(id).toBe('generated-app-id');
    });

    it('throws if user is not authenticated', async () => {
      getMockAuth().currentUser = null;
      await expect(submitApplication('house-1', baseData)).rejects.toThrow(
        'Must be signed in to apply',
      );
    });
  });

  describe('listHouseApplications', () => {
    it('queries the subcollection ordered by createdAt desc', async () => {
      const app = new HouseApplication();
      app.id = 'app-1';
      app.applicantName = 'Alice';
      getGet().mockResolvedValue({ docs: [{ data: () => app }] });

      const result = await listHouseApplications('house-1');

      expect(firestore.collection).toHaveBeenCalledWith('houses');
      expect(result).toHaveLength(1);
      expect(result[0].applicantName).toBe('Alice');
    });

    it('returns empty array when no applications exist', async () => {
      getGet().mockResolvedValue({ docs: [] });
      const result = await listHouseApplications('house-1');
      expect(result).toEqual([]);
    });
  });

  describe('getMyApplications', () => {
    it('uses a collection group query filtered by applicantUid', async () => {
      getGet().mockResolvedValue({ docs: [] });
      await getMyApplications();

      expect(firestore.collectionGroup).toHaveBeenCalledWith('applications');
      expect((firestore as any)._mockWhere).toHaveBeenCalledWith(
        'applicantUid',
        '==',
        'applicant-uid-1',
      );
    });

    it('returns empty array if user is not authenticated', async () => {
      getMockAuth().currentUser = null;
      const result = await getMyApplications();
      expect(result).toEqual([]);
    });
  });

  describe('updateApplicationStatus', () => {
    it('updates status, reviewedAt, reviewedBy, and operatorNote', async () => {
      await updateApplicationStatus(
        'house-1',
        'app-1',
        'approved',
        'Great fit!',
      );

      expect(getUpdate()).toHaveBeenCalledWith(
        expect.objectContaining({
          status: 'approved',
          operatorNote: 'Great fit!',
          reviewedBy: 'applicant-uid-1',
        }),
      );
      expect(getUpdate().mock.calls[0][0].reviewedAt).toBeTruthy();
    });

    it('defaults operatorNote to empty string when note is omitted', async () => {
      await updateApplicationStatus('house-1', 'app-1', 'rejected');
      expect(getUpdate()).toHaveBeenCalledWith(
        expect.objectContaining({ operatorNote: '' }),
      );
    });
  });
});
```

- [ ] **Step 2: Run to verify failure**

```bash
yarn test src/services/__tests__/applications.test.ts --no-coverage
```

Expected: FAIL — `Cannot find module '../applications'`

- [ ] **Step 3: Implement the service**

```typescript
// src/services/applications.ts
import { firestore, auth } from '../../firebase-setup';
import {
  HouseApplication,
  ApplicationStatus,
  ProgramType,
} from '../entities/Application';

export type ApplicationInput = {
  applicantName: string;
  applicantEmail: string;
  applicantPhone: string;
  sobrietyDate: string;
  programType: ProgramType;
  currentSituation: string;
  references: string;
};

const applicationsCollection = (houseId: string) =>
  firestore.collection('houses').doc(houseId).collection('applications');

export async function submitApplication(
  houseId: string,
  data: ApplicationInput,
): Promise<string> {
  const currentUser = auth.currentUser;
  if (!currentUser) throw new Error('Must be signed in to apply');

  const appRef = applicationsCollection(houseId).doc();
  const appId = appRef.id;

  const application: HouseApplication = {
    ...new HouseApplication(),
    id: appId,
    houseId,
    applicantUid: currentUser.uid,
    ...data,
    status: 'pending',
    createdAt: new Date().toISOString(),
  };

  await appRef.set(application);
  return appId;
}

export async function listHouseApplications(
  houseId: string,
): Promise<HouseApplication[]> {
  const snap = await applicationsCollection(houseId)
    .orderBy('createdAt', 'desc')
    .get();
  return snap.docs.map(doc => doc.data() as HouseApplication);
}

export async function getMyApplications(): Promise<HouseApplication[]> {
  const currentUser = auth.currentUser;
  if (!currentUser) return [];

  const snap = await firestore
    .collectionGroup('applications')
    .where('applicantUid', '==', currentUser.uid)
    .orderBy('createdAt', 'desc')
    .get();
  return snap.docs.map(doc => doc.data() as HouseApplication);
}

export async function updateApplicationStatus(
  houseId: string,
  appId: string,
  status: ApplicationStatus,
  note?: string,
): Promise<void> {
  const currentUser = auth.currentUser;
  await applicationsCollection(houseId)
    .doc(appId)
    .update({
      status,
      operatorNote: note ?? '',
      reviewedAt: new Date().toISOString(),
      reviewedBy: currentUser?.uid ?? '',
    });
}
```

- [ ] **Step 4: Run to verify pass**

```bash
yarn test src/services/__tests__/applications.test.ts src/services/__tests__/applicationEntity.test.ts --no-coverage
```

Expected: PASS — all tests green

- [ ] **Step 5: Commit**

```bash
git add src/services/applications.ts src/services/__tests__/applications.test.ts
git commit -m "feat(applications): add Firestore service for house applications subcollection"
```

---

### Task 3: Application React Query Hooks

**Files:**

- Create: `src/state/queries/applicationQueries.ts`
- Create: `src/state/queries/__tests__/applicationQueries.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
// src/state/queries/__tests__/applicationQueries.test.ts
jest.mock('../../../firebase-setup', () => ({
  firestore: { collection: jest.fn(), collectionGroup: jest.fn() },
  auth: { currentUser: { uid: 'test-uid' } },
}));

jest.mock('../../services/applications', () => ({
  submitApplication: jest.fn(),
  listHouseApplications: jest.fn(),
  getMyApplications: jest.fn(),
  updateApplicationStatus: jest.fn(),
}));

jest.mock('@tanstack/react-query', () => ({
  useQuery: jest.fn(() => ({ data: undefined, isLoading: false })),
  useMutation: jest.fn(() => ({ mutateAsync: jest.fn(), isPending: false })),
  useQueryClient: jest.fn(() => ({ invalidateQueries: jest.fn() })),
}));

import { applicationKeys } from '../applicationQueries';

describe('applicationKeys', () => {
  it('all key is stable', () => {
    expect(applicationKeys.all).toEqual(['applications']);
  });

  it('mine key includes uid', () => {
    expect(applicationKeys.mine('uid-1')).toEqual([
      'applications',
      'mine',
      'uid-1',
    ]);
  });

  it('houseList key includes houseId', () => {
    expect(applicationKeys.houseList('h1')).toEqual([
      'applications',
      'house',
      'h1',
    ]);
  });

  it('detail key includes houseId and appId', () => {
    expect(applicationKeys.detail('h1', 'app1')).toEqual([
      'applications',
      'house',
      'h1',
      'detail',
      'app1',
    ]);
  });
});
```

- [ ] **Step 2: Run to verify failure**

```bash
yarn test src/state/queries/__tests__/applicationQueries.test.ts --no-coverage
```

Expected: FAIL — `Cannot find module '../applicationQueries'`

- [ ] **Step 3: Implement the queries file**

```typescript
// src/state/queries/applicationQueries.ts
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import * as applicationService from '../../services/applications';
import { ApplicationStatus } from '../../entities/Application';
import { auth } from '../../../firebase-setup';
import { logException } from '../../util/logging';

// ─── Query Keys ───────────────────────────────────────────────────────────────

export const applicationKeys = {
  all: ['applications'] as const,
  mine: (uid: string) => [...applicationKeys.all, 'mine', uid] as const,
  houseList: (houseId: string) =>
    [...applicationKeys.all, 'house', houseId] as const,
  detail: (houseId: string, appId: string) =>
    [...applicationKeys.houseList(houseId), 'detail', appId] as const,
};

// ─── Hooks ────────────────────────────────────────────────────────────────────

export const useMyApplications = (enabled = true) => {
  const uid = auth.currentUser?.uid ?? '';
  return useQuery({
    queryKey: applicationKeys.mine(uid),
    queryFn: () => applicationService.getMyApplications(),
    enabled: enabled && !!uid,
    staleTime: 30000,
  });
};

export const useHouseApplications = (houseId: string, enabled = true) =>
  useQuery({
    queryKey: applicationKeys.houseList(houseId),
    queryFn: () => applicationService.listHouseApplications(houseId),
    enabled: enabled && !!houseId,
    staleTime: 15000,
  });

export const useSubmitApplication = () => {
  const queryClient = useQueryClient();
  const uid = auth.currentUser?.uid ?? '';

  return useMutation({
    mutationFn: ({
      houseId,
      data,
    }: {
      houseId: string;
      data: applicationService.ApplicationInput;
    }) => applicationService.submitApplication(houseId, data),
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: applicationKeys.mine(uid) });
    },
    onError: logException,
  });
};

export const useUpdateApplicationStatus = (houseId: string) => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      appId,
      status,
      note,
    }: {
      appId: string;
      status: ApplicationStatus;
      note?: string;
    }) =>
      applicationService.updateApplicationStatus(houseId, appId, status, note),
    onSettled: () => {
      queryClient.invalidateQueries({
        queryKey: applicationKeys.houseList(houseId),
      });
    },
    onError: logException,
  });
};
```

- [ ] **Step 4: Run to verify pass**

```bash
yarn test src/state/queries/__tests__/applicationQueries.test.ts --no-coverage
```

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/state/queries/applicationQueries.ts src/state/queries/__tests__/applicationQueries.test.ts
git commit -m "feat(applications): add React Query hooks for application workflow"
```

---

### Task 4: Firestore Security Rules

**Files:**

- Modify: `firebase/firestore.rules`
- Modify: `firebase/__tests__/firestore.rules.test.ts`

**Prerequisite:** Start the Firestore emulator in a separate terminal:

```bash
cd /Users/marcusklein/dev/rats-v2/firebase
firebase emulators:start --only firestore
```

- [ ] **Step 1: Write the failing rules tests**

Append this `describe` block to `firebase/__tests__/firestore.rules.test.ts` (before the final `afterAll` if one exists, or at the end of the file):

```typescript
// ─── applications subcollection ────────────────────────────────────────────

const APPLICANT_UID = 'applicantUser';
const APP_ID = 'app-test-001';

function appDoc(ctx: ReturnType<RulesTestEnvironment['authenticatedContext']>) {
  return doc(ctx.firestore(), `houses/${HOUSE_ID}/applications/${APP_ID}`);
}

describe('houses/{houseId}/applications/{appId}', () => {
  beforeEach(async () => {
    await testEnv.withSecurityRulesDisabled(async ctx => {
      await setDoc(doc(ctx.firestore(), `houses/${HOUSE_ID}`), {
        id: HOUSE_ID,
        adminIds: [ADMIN_UID],
        superAdminId: ADMIN_UID,
      });
    });
  });

  describe('create', () => {
    it('allows an authenticated user to create their own application', async () => {
      const ctx = testEnv.authenticatedContext(APPLICANT_UID, {});
      await assertSucceeds(
        setDoc(appDoc(ctx), {
          applicantUid: APPLICANT_UID,
          houseId: HOUSE_ID,
          status: 'pending',
          applicantName: 'Alice',
          applicantEmail: 'alice@example.com',
          createdAt: new Date().toISOString(),
        }),
      );
    });

    it('denies creating an application with a mismatched applicantUid', async () => {
      const ctx = testEnv.authenticatedContext(APPLICANT_UID, {});
      await assertFails(
        setDoc(appDoc(ctx), {
          applicantUid: OTHER_UID,
          houseId: HOUSE_ID,
          status: 'pending',
          applicantName: 'Alice',
          applicantEmail: 'alice@example.com',
          createdAt: new Date().toISOString(),
        }),
      );
    });

    it('denies unauthenticated create', async () => {
      const ctx = testEnv.unauthenticatedContext();
      await assertFails(
        setDoc(appDoc(ctx as any), {
          applicantUid: 'anyone',
          status: 'pending',
        }),
      );
    });
  });

  describe('read', () => {
    beforeEach(async () => {
      await testEnv.withSecurityRulesDisabled(async ctx => {
        await setDoc(
          doc(ctx.firestore(), `houses/${HOUSE_ID}/applications/${APP_ID}`),
          {
            applicantUid: APPLICANT_UID,
            houseId: HOUSE_ID,
            status: 'pending',
            applicantName: 'Alice',
            applicantEmail: 'alice@example.com',
          },
        );
      });
    });

    it('allows the applicant to read their own application', async () => {
      const ctx = testEnv.authenticatedContext(APPLICANT_UID, {});
      await assertSucceeds(getDoc(appDoc(ctx)));
    });

    it('allows house admin to read applications', async () => {
      const ctx = testEnv.authenticatedContext(ADMIN_UID, {
        admin: { [HOUSE_ID]: true },
      });
      await assertSucceeds(getDoc(appDoc(ctx)));
    });

    it('denies other authenticated users from reading applications', async () => {
      const ctx = testEnv.authenticatedContext(OTHER_UID, {});
      await assertFails(getDoc(appDoc(ctx)));
    });
  });

  describe('update', () => {
    beforeEach(async () => {
      await testEnv.withSecurityRulesDisabled(async ctx => {
        await setDoc(
          doc(ctx.firestore(), `houses/${HOUSE_ID}/applications/${APP_ID}`),
          {
            applicantUid: APPLICANT_UID,
            houseId: HOUSE_ID,
            status: 'pending',
          },
        );
      });
    });

    it('allows house admin to update status', async () => {
      const ctx = testEnv.authenticatedContext(ADMIN_UID, {
        admin: { [HOUSE_ID]: true },
      });
      await assertSucceeds(
        setDoc(appDoc(ctx), { status: 'approved' }, { merge: true }),
      );
    });

    it('denies applicant from updating their own application after submission', async () => {
      const ctx = testEnv.authenticatedContext(APPLICANT_UID, {});
      await assertFails(
        setDoc(appDoc(ctx), { status: 'approved' }, { merge: true }),
      );
    });
  });
});
```

- [ ] **Step 2: Run to verify failure**

```bash
cd /Users/marcusklein/dev/rats-v2
npx jest firebase/__tests__/firestore.rules.test.ts --no-coverage 2>&1 | grep -E "PASS|FAIL|applications" | tail -20
```

Expected: FAIL in the new `applications` group (no rules match yet)

- [ ] **Step 3: Add the rule to `firebase/firestore.rules`**

Inside the `match /houses/{houseId}` block, after the `financial-records` subcollection rule and before the closing brace, add:

```
// Resident applications: applicant creates own; admin reads + updates status
match /applications/{appId} {
  allow create: if signedIn() && request.resource.data.applicantUid == request.auth.uid;
  allow read: if signedIn() && (resource.data.applicantUid == request.auth.uid || isAdmin([houseId]));
  allow update: if isAdmin([houseId]);
  allow delete: if false;
}
```

- [ ] **Step 4: Run to verify pass**

```bash
npx jest firebase/__tests__/firestore.rules.test.ts --no-coverage 2>&1 | grep -E "PASS|FAIL|✓|✕" | tail -20
```

Expected: PASS — all tests including the new applications group

- [ ] **Step 5: Commit**

```bash
git add firebase/firestore.rules firebase/__tests__/firestore.rules.test.ts
git commit -m "feat(rules): add applications subcollection — applicant write, admin review"
```

---

### Task 5: ApplyScreen (Resident-Facing)

**Files:**

- Create: `src/screens/Application/ApplyScreen.tsx`

- [ ] **Step 1: Check available theme colors**

```bash
grep -n "export\|grey\|blue\|white\|black\|light\|dark" /Users/marcusklein/dev/rats-v2/src/styles/theme.ts | head -30
```

Note the exact color key names for use in Step 2 (e.g., `color.light_grey` vs `color.lightGrey`).

- [ ] **Step 2: Create the screen**

```tsx
// src/screens/Application/ApplyScreen.tsx
import React, { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ScrollView,
  StyleSheet,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { useNavigation, useRoute } from '@react-navigation/native';
import { color } from '../../styles/theme';
import { useSubmitApplication } from '../../state/queries/applicationQueries';
import { ProgramType } from '../../entities/Application';
import { Routes } from '../../navigation/types';

type Step = 'contact' | 'sobriety' | 'review';
const STEPS: Step[] = ['contact', 'sobriety', 'review'];

type FormState = {
  applicantName: string;
  applicantEmail: string;
  applicantPhone: string;
  sobrietyDate: string;
  programType: ProgramType;
  currentSituation: string;
  references: string;
};

const PROGRAM_TYPES: ProgramType[] = ['AA', 'NA', 'SMART Recovery', 'other'];

export default function ApplyScreen() {
  const navigation = useNavigation<any>();
  const route = useRoute<any>();
  const { houseId, houseName } = route.params ?? {};

  const [step, setStep] = useState<Step>('contact');
  const [form, setForm] = useState<FormState>({
    applicantName: '',
    applicantEmail: '',
    applicantPhone: '',
    sobrietyDate: '',
    programType: 'AA',
    currentSituation: '',
    references: '',
  });

  const submitMutation = useSubmitApplication();

  const setField = (field: keyof FormState, value: string) =>
    setForm(prev => ({ ...prev, [field]: value }));

  const goNext = () => {
    const idx = STEPS.indexOf(step);
    if (idx < STEPS.length - 1) setStep(STEPS[idx + 1]);
  };

  const goBack = () => {
    const idx = STEPS.indexOf(step);
    if (idx > 0) setStep(STEPS[idx - 1]);
    else navigation.goBack();
  };

  const handleSubmit = async () => {
    if (!form.applicantName.trim() || !form.applicantEmail.trim()) {
      Alert.alert('Required', 'Name and email are required.');
      return;
    }
    try {
      await submitMutation.mutateAsync({ houseId, data: form });
      navigation.navigate(Routes.ApplicationStatus, { houseId, houseName });
    } catch {
      Alert.alert('Error', 'Could not submit application. Please try again.');
    }
  };

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <Text style={styles.title}>Apply to {houseName ?? 'this house'}</Text>
      <Text style={styles.stepLabel}>
        Step {STEPS.indexOf(step) + 1} of {STEPS.length}
      </Text>

      {step === 'contact' && (
        <View>
          <Text style={styles.label}>Full Name *</Text>
          <TextInput
            style={styles.input}
            value={form.applicantName}
            onChangeText={v => setField('applicantName', v)}
            placeholder="Your full name"
            testID="input-name"
          />
          <Text style={styles.label}>Email *</Text>
          <TextInput
            style={styles.input}
            value={form.applicantEmail}
            onChangeText={v => setField('applicantEmail', v)}
            placeholder="your@email.com"
            keyboardType="email-address"
            autoCapitalize="none"
            testID="input-email"
          />
          <Text style={styles.label}>Phone</Text>
          <TextInput
            style={styles.input}
            value={form.applicantPhone}
            onChangeText={v => setField('applicantPhone', v)}
            placeholder="555-0100"
            keyboardType="phone-pad"
          />
        </View>
      )}

      {step === 'sobriety' && (
        <View>
          <Text style={styles.label}>Sobriety Date</Text>
          <TextInput
            style={styles.input}
            value={form.sobrietyDate}
            onChangeText={v => setField('sobrietyDate', v)}
            placeholder="YYYY-MM-DD"
          />
          <Text style={styles.label}>Program</Text>
          {PROGRAM_TYPES.map(pt => (
            <TouchableOpacity
              key={pt}
              onPress={() => setField('programType', pt)}
              style={[
                styles.chip,
                form.programType === pt && styles.chipSelected,
              ]}>
              <Text
                style={
                  form.programType === pt
                    ? styles.chipTextSelected
                    : styles.chipText
                }>
                {pt}
              </Text>
            </TouchableOpacity>
          ))}
          <Text style={styles.label}>Current Situation</Text>
          <TextInput
            style={[styles.input, styles.multiline]}
            value={form.currentSituation}
            onChangeText={v => setField('currentSituation', v)}
            placeholder="Brief description of your housing situation"
            multiline
            numberOfLines={3}
          />
          <Text style={styles.label}>References (sponsor or counselor)</Text>
          <TextInput
            style={[styles.input, styles.multiline]}
            value={form.references}
            onChangeText={v => setField('references', v)}
            placeholder="Name and contact info"
            multiline
            numberOfLines={2}
          />
        </View>
      )}

      {step === 'review' && (
        <View>
          <Text style={styles.sectionTitle}>Review Your Application</Text>
          <Text style={styles.reviewRow}>Name: {form.applicantName}</Text>
          <Text style={styles.reviewRow}>Email: {form.applicantEmail}</Text>
          <Text style={styles.reviewRow}>
            Phone: {form.applicantPhone || '—'}
          </Text>
          <Text style={styles.reviewRow}>
            Sobriety date: {form.sobrietyDate || '—'}
          </Text>
          <Text style={styles.reviewRow}>Program: {form.programType}</Text>
          <Text style={styles.reviewRow}>
            Situation:{' '}
            {form.currentSituation
              ? `${form.currentSituation.slice(0, 80)}...`
              : '—'}
          </Text>
        </View>
      )}

      <View style={styles.row}>
        <TouchableOpacity onPress={goBack} style={styles.backBtn}>
          <Text style={styles.backBtnText}>Back</Text>
        </TouchableOpacity>

        {step !== 'review' ? (
          <TouchableOpacity
            onPress={goNext}
            style={styles.nextBtn}
            testID="btn-next">
            <Text style={styles.nextBtnText}>Next</Text>
          </TouchableOpacity>
        ) : (
          <TouchableOpacity
            onPress={handleSubmit}
            style={[
              styles.nextBtn,
              submitMutation.isPending && styles.btnDisabled,
            ]}
            disabled={submitMutation.isPending}
            testID="btn-submit">
            {submitMutation.isPending ? (
              <ActivityIndicator color="#fff" size="small" />
            ) : (
              <Text style={styles.nextBtnText}>Submit Application</Text>
            )}
          </TouchableOpacity>
        )}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: color.white },
  content: { padding: 24, paddingBottom: 48 },
  title: {
    fontSize: 20,
    fontWeight: '700',
    color: color.black,
    marginBottom: 4,
  },
  stepLabel: { fontSize: 13, color: color.grey, marginBottom: 24 },
  label: {
    fontSize: 14,
    fontWeight: '600',
    color: color.black,
    marginTop: 16,
    marginBottom: 4,
  },
  input: {
    borderWidth: 1,
    borderColor: color.grey,
    borderRadius: 8,
    padding: 12,
    fontSize: 15,
    color: color.black,
  },
  multiline: { minHeight: 72, textAlignVertical: 'top' },
  chip: {
    borderWidth: 1,
    borderColor: color.grey,
    borderRadius: 8,
    padding: 10,
    marginVertical: 3,
  },
  chipSelected: { borderColor: color.blue, backgroundColor: '#EBF5FF' },
  chipText: { color: color.black, fontSize: 14 },
  chipTextSelected: { color: color.blue, fontWeight: '600', fontSize: 14 },
  sectionTitle: { fontSize: 16, fontWeight: '600', marginBottom: 16 },
  reviewRow: {
    fontSize: 14,
    color: color.black,
    marginBottom: 8,
    lineHeight: 20,
  },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 32,
  },
  backBtn: { padding: 14 },
  backBtnText: { color: color.grey, fontSize: 15 },
  nextBtn: {
    backgroundColor: color.blue,
    borderRadius: 8,
    paddingHorizontal: 24,
    paddingVertical: 14,
  },
  btnDisabled: { opacity: 0.6 },
  nextBtnText: { color: color.white, fontWeight: '700', fontSize: 15 },
});
```

> **Theme fix:** If `color.blue`, `color.grey`, `color.black`, or `color.white` don't exist, check the output of Step 1 and replace with correct keys. The codebase uses `color.dark_grey`, `color.light_grey` in some screens.

- [ ] **Step 3: TypeScript compile check**

```bash
npx tsc --noEmit 2>&1 | grep "ApplyScreen" | head -10
```

Expected: No errors for this file. Fix any before proceeding.

- [ ] **Step 4: Commit**

```bash
git add src/screens/Application/ApplyScreen.tsx
git commit -m "feat(screens): add ApplyScreen — resident-facing multi-step application form"
```

---

### Task 6: ApplicationStatusScreen (Resident-Facing)

**Files:**

- Create: `src/screens/Application/ApplicationStatusScreen.tsx`

- [ ] **Step 1: Create the screen**

```tsx
// src/screens/Application/ApplicationStatusScreen.tsx
import React from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
} from 'react-native';
import { useNavigation, useRoute } from '@react-navigation/native';
import { color } from '../../styles/theme';
import { useMyApplications } from '../../state/queries/applicationQueries';
import { ApplicationStatus } from '../../entities/Application';
import { Routes } from '../../navigation/types';

const STATUS_LABEL: Record<ApplicationStatus, string> = {
  pending: 'Pending Review',
  reviewing: 'Under Review',
  approved: 'Approved!',
  rejected: 'Not Selected',
};

const STATUS_COLOR: Record<ApplicationStatus, string> = {
  pending: '#F59E0B',
  reviewing: '#3B82F6',
  approved: '#10B981',
  rejected: '#EF4444',
};

export default function ApplicationStatusScreen() {
  const navigation = useNavigation<any>();
  const route = useRoute<any>();
  const { houseId, houseName } = route.params ?? {};

  const { data: applications, isLoading } = useMyApplications();
  const thisApp = applications?.find(a => a.houseId === houseId);

  if (isLoading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color={color.blue} />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <Text style={styles.title}>
        {thisApp ? 'Your Application' : 'Application Submitted'}
      </Text>
      {houseName ? <Text style={styles.subtitle}>{houseName}</Text> : null}

      {thisApp ? (
        <>
          <View
            style={[
              styles.badge,
              { backgroundColor: STATUS_COLOR[thisApp.status] },
            ]}>
            <Text style={styles.badgeText}>{STATUS_LABEL[thisApp.status]}</Text>
          </View>

          {(thisApp.status === 'approved' || thisApp.status === 'rejected') &&
          thisApp.operatorNote ? (
            <View style={styles.noteBox}>
              <Text style={styles.noteLabel}>Message from house manager:</Text>
              <Text style={styles.noteText}>{thisApp.operatorNote}</Text>
            </View>
          ) : null}

          {thisApp.status === 'approved' && (
            <Text style={styles.hint}>
              The house manager will contact you to complete your move-in.
            </Text>
          )}
        </>
      ) : (
        <Text style={styles.body}>
          Your application has been received. The house manager will review it
          shortly.
        </Text>
      )}

      <TouchableOpacity
        style={styles.secondaryBtn}
        onPress={() => navigation.navigate(Routes.HouseSearch)}>
        <Text style={styles.secondaryBtnText}>Apply to Another House</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  container: { flex: 1, backgroundColor: color.white, padding: 24 },
  title: {
    fontSize: 22,
    fontWeight: '700',
    color: color.black,
    marginBottom: 4,
  },
  subtitle: { fontSize: 15, color: color.grey, marginBottom: 24 },
  badge: {
    alignSelf: 'flex-start',
    borderRadius: 20,
    paddingHorizontal: 16,
    paddingVertical: 6,
    marginBottom: 20,
  },
  badgeText: { color: color.white, fontWeight: '700', fontSize: 14 },
  noteBox: {
    backgroundColor: '#F3F4F6',
    borderRadius: 8,
    padding: 16,
    marginBottom: 16,
  },
  noteLabel: { fontSize: 12, color: color.grey, marginBottom: 4 },
  noteText: { fontSize: 15, color: color.black },
  hint: { fontSize: 14, color: '#10B981', marginBottom: 24 },
  body: { fontSize: 15, color: color.grey, lineHeight: 22, marginBottom: 32 },
  secondaryBtn: { marginTop: 24, padding: 14, alignItems: 'center' },
  secondaryBtnText: { color: color.blue, fontSize: 15 },
});
```

- [ ] **Step 2: TypeScript compile check**

```bash
npx tsc --noEmit 2>&1 | grep "ApplicationStatusScreen" | head -10
```

Expected: No errors.

- [ ] **Step 3: Commit**

```bash
git add src/screens/Application/ApplicationStatusScreen.tsx
git commit -m "feat(screens): add ApplicationStatusScreen — resident tracks application status"
```

---

### Task 7: ApplicationListScreen (Operator-Facing)

**Files:**

- Create: `src/screens/Applications/ApplicationListScreen.tsx`

- [ ] **Step 1: Find the Redux selector for active houseId**

```bash
grep -rn "state\.house\|state\.houseState\|houseId.*useSelector" /Users/marcusklein/dev/rats-v2/src/screens/ | grep -v test | head -10
```

Note the selector path used by other operator screens. Replace `state.house?.house?.id` in Step 2 if the actual path differs.

- [ ] **Step 2: Create the screen**

```tsx
// src/screens/Applications/ApplicationListScreen.tsx
import React, { useState } from 'react';
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { useSelector } from 'react-redux';
import { color } from '../../styles/theme';
import { useHouseApplications } from '../../state/queries/applicationQueries';
import {
  HouseApplication,
  ApplicationStatus,
} from '../../entities/Application';
import { Routes } from '../../navigation/types';

type TabKey = 'pending' | 'reviewing' | 'decided';

function statusToTab(s: ApplicationStatus): TabKey {
  if (s === 'pending') return 'pending';
  if (s === 'reviewing') return 'reviewing';
  return 'decided';
}

function AppRow({
  app,
  onPress,
}: {
  app: HouseApplication;
  onPress: () => void;
}) {
  return (
    <TouchableOpacity
      style={styles.row}
      onPress={onPress}
      testID={`app-row-${app.id}`}>
      <View style={styles.rowBody}>
        <Text style={styles.rowName}>{app.applicantName}</Text>
        <Text style={styles.rowEmail}>{app.applicantEmail}</Text>
      </View>
      <Text style={styles.chevron}>›</Text>
    </TouchableOpacity>
  );
}

export default function ApplicationListScreen() {
  const navigation = useNavigation<any>();
  const houseId: string = useSelector((s: any) => s.house?.house?.id ?? '');
  const [activeTab, setActiveTab] = useState<TabKey>('pending');

  const { data: apps, isLoading } = useHouseApplications(houseId);
  const filtered = (apps ?? []).filter(
    a => statusToTab(a.status) === activeTab,
  );

  const countFor = (tab: TabKey) =>
    (apps ?? []).filter(a => statusToTab(a.status) === tab).length;

  return (
    <View style={styles.container}>
      <Text style={styles.heading}>Applications</Text>

      <View style={styles.tabs}>
        {(['pending', 'reviewing', 'decided'] as TabKey[]).map(tab => {
          const count = countFor(tab);
          return (
            <TouchableOpacity
              key={tab}
              onPress={() => setActiveTab(tab)}
              style={[styles.tab, activeTab === tab && styles.tabActive]}>
              <Text
                style={
                  activeTab === tab ? styles.tabTextActive : styles.tabText
                }>
                {tab.charAt(0).toUpperCase() + tab.slice(1)}
                {count > 0 ? ` (${count})` : ''}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>

      {isLoading ? (
        <ActivityIndicator style={styles.loader} color={color.blue} />
      ) : filtered.length === 0 ? (
        <View style={styles.empty}>
          <Text style={styles.emptyText}>No {activeTab} applications</Text>
        </View>
      ) : (
        <FlatList
          data={filtered}
          keyExtractor={item => item.id}
          renderItem={({ item }) => (
            <AppRow
              app={item}
              onPress={() =>
                navigation.navigate(Routes.ApplicationDetail, {
                  houseId,
                  appId: item.id,
                })
              }
            />
          )}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: color.white },
  heading: {
    fontSize: 20,
    fontWeight: '700',
    color: color.black,
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 0,
  },
  tabs: {
    flexDirection: 'row',
    paddingHorizontal: 16,
    paddingTop: 12,
    borderBottomWidth: 1,
    borderColor: color.grey,
  },
  tab: { marginRight: 16, paddingBottom: 10 },
  tabActive: { borderBottomWidth: 2, borderColor: color.blue },
  tabText: { fontSize: 14, color: color.grey },
  tabTextActive: { fontSize: 14, color: color.blue, fontWeight: '600' },
  loader: { marginTop: 48 },
  empty: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  emptyText: { color: color.grey, fontSize: 15 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
    borderBottomWidth: 1,
    borderColor: color.grey,
  },
  rowBody: { flex: 1 },
  rowName: { fontSize: 15, fontWeight: '600', color: color.black },
  rowEmail: { fontSize: 13, color: color.grey, marginTop: 2 },
  chevron: { fontSize: 20, color: color.grey },
});
```

- [ ] **Step 3: TypeScript compile check**

```bash
npx tsc --noEmit 2>&1 | grep "ApplicationListScreen" | head -10
```

Expected: No errors.

- [ ] **Step 4: Commit**

```bash
git add src/screens/Applications/ApplicationListScreen.tsx
git commit -m "feat(screens): add ApplicationListScreen — operator views applications by status"
```

---

### Task 8: ApplicationDetailScreen (Operator-Facing)

**Files:**

- Create: `src/screens/Applications/ApplicationDetailScreen.tsx`

- [ ] **Step 1: Create the screen**

```tsx
// src/screens/Applications/ApplicationDetailScreen.tsx
import React, { useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  TextInput,
  ScrollView,
  StyleSheet,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { useNavigation, useRoute } from '@react-navigation/native';
import { color } from '../../styles/theme';
import {
  useHouseApplications,
  useUpdateApplicationStatus,
} from '../../state/queries/applicationQueries';
import { Routes } from '../../navigation/types';

export default function ApplicationDetailScreen() {
  const navigation = useNavigation<any>();
  const route = useRoute<any>();
  const { houseId, appId } = route.params ?? {};

  const [note, setNote] = useState('');
  const { data: apps, isLoading } = useHouseApplications(houseId);
  const app = apps?.find(a => a.id === appId);
  const updateMutation = useUpdateApplicationStatus(houseId);

  const handleApprove = () => {
    Alert.alert(
      'Approve Application',
      'This will approve the applicant. You will be taken to the intake form to complete their move-in.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Approve',
          onPress: async () => {
            await updateMutation.mutateAsync({
              appId,
              status: 'approved',
              note,
            });
            navigation.navigate(Routes.ResidentIntake, {
              houseId,
              applicationId: appId,
            });
          },
        },
      ],
    );
  };

  const handleReject = () => {
    Alert.alert(
      'Reject Application',
      'This cannot be undone. The applicant will see "Not Selected" in the app.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Reject',
          style: 'destructive',
          onPress: async () => {
            await updateMutation.mutateAsync({
              appId,
              status: 'rejected',
              note,
            });
            navigation.goBack();
          },
        },
      ],
    );
  };

  const handleMarkReviewing = async () => {
    await updateMutation.mutateAsync({ appId, status: 'reviewing' });
  };

  if (isLoading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color={color.blue} />
      </View>
    );
  }

  if (!app) {
    return (
      <View style={styles.center}>
        <Text style={{ color: color.grey }}>Application not found.</Text>
      </View>
    );
  }

  const isDone = app.status === 'approved' || app.status === 'rejected';

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <Text style={styles.name}>{app.applicantName}</Text>
      <Text style={styles.meta}>{app.applicantEmail}</Text>
      {app.applicantPhone ? (
        <Text style={styles.meta}>{app.applicantPhone}</Text>
      ) : null}

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>SOBRIETY</Text>
        <Text style={styles.field}>Date: {app.sobrietyDate || '—'}</Text>
        <Text style={styles.field}>Program: {app.programType}</Text>
      </View>

      {app.currentSituation ? (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>CURRENT SITUATION</Text>
          <Text style={styles.field}>{app.currentSituation}</Text>
        </View>
      ) : null}

      {app.references ? (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>REFERENCES</Text>
          <Text style={styles.field}>{app.references}</Text>
        </View>
      ) : null}

      {!isDone ? (
        <>
          <Text style={styles.noteLabel}>Note to applicant (optional)</Text>
          <TextInput
            style={[styles.input, styles.multiline]}
            value={note}
            onChangeText={setNote}
            placeholder="Leave a message visible to the applicant on decision..."
            multiline
            numberOfLines={3}
          />

          <View style={styles.actions}>
            {app.status === 'pending' ? (
              <TouchableOpacity
                style={styles.reviewBtn}
                onPress={handleMarkReviewing}
                disabled={updateMutation.isPending}>
                <Text style={styles.reviewBtnText}>Mark as Reviewing</Text>
              </TouchableOpacity>
            ) : null}

            <TouchableOpacity
              style={styles.rejectBtn}
              onPress={handleReject}
              disabled={updateMutation.isPending}
              testID="btn-reject">
              <Text style={styles.rejectBtnText}>Reject</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.approveBtn}
              onPress={handleApprove}
              disabled={updateMutation.isPending}
              testID="btn-approve">
              {updateMutation.isPending ? (
                <ActivityIndicator color={color.white} size="small" />
              ) : (
                <Text style={styles.approveBtnText}>
                  Approve & Begin Intake
                </Text>
              )}
            </TouchableOpacity>
          </View>
        </>
      ) : (
        <View style={styles.decisionBox}>
          <Text style={styles.decisionLabel}>
            {app.status === 'approved' ? '✓ Approved' : '✗ Rejected'}
          </Text>
          {app.operatorNote ? (
            <Text style={styles.decisionNote}>
              Note sent: {app.operatorNote}
            </Text>
          ) : null}
        </View>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  container: { flex: 1, backgroundColor: color.white },
  content: { padding: 24, paddingBottom: 48 },
  name: { fontSize: 22, fontWeight: '700', color: color.black },
  meta: { fontSize: 14, color: color.grey, marginTop: 2 },
  section: { marginTop: 20 },
  sectionTitle: {
    fontSize: 11,
    fontWeight: '700',
    color: color.grey,
    letterSpacing: 1,
    marginBottom: 4,
  },
  field: { fontSize: 15, color: color.black, lineHeight: 22 },
  noteLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: color.black,
    marginTop: 24,
    marginBottom: 4,
  },
  input: {
    borderWidth: 1,
    borderColor: color.grey,
    borderRadius: 8,
    padding: 12,
    fontSize: 15,
    color: color.black,
  },
  multiline: { minHeight: 72, textAlignVertical: 'top' },
  actions: { marginTop: 24, gap: 10 },
  reviewBtn: {
    borderWidth: 1,
    borderColor: color.blue,
    borderRadius: 8,
    padding: 14,
    alignItems: 'center',
  },
  reviewBtnText: { color: color.blue, fontWeight: '600', fontSize: 15 },
  rejectBtn: {
    borderWidth: 1,
    borderColor: '#EF4444',
    borderRadius: 8,
    padding: 14,
    alignItems: 'center',
  },
  rejectBtnText: { color: '#EF4444', fontWeight: '600', fontSize: 15 },
  approveBtn: {
    backgroundColor: '#10B981',
    borderRadius: 8,
    padding: 14,
    alignItems: 'center',
  },
  approveBtnText: { color: color.white, fontWeight: '700', fontSize: 15 },
  decisionBox: {
    marginTop: 24,
    backgroundColor: '#F3F4F6',
    borderRadius: 8,
    padding: 16,
  },
  decisionLabel: { fontSize: 16, fontWeight: '700', color: color.black },
  decisionNote: { fontSize: 14, color: color.grey, marginTop: 4 },
});
```

- [ ] **Step 2: TypeScript compile check**

```bash
npx tsc --noEmit 2>&1 | grep "ApplicationDetailScreen" | head -10
```

Expected: No errors. Note: `Routes.ResidentIntake` with `applicationId` will fail until Task 9 updates the param type — do Task 9 before this step if needed.

- [ ] **Step 3: Commit**

```bash
git add src/screens/Applications/ApplicationDetailScreen.tsx
git commit -m "feat(screens): add ApplicationDetailScreen — operator approves or rejects"
```

---

### Task 9: Navigation Wiring

**Files:**

- Modify: `src/navigation/types.ts`
- Modify: `src/navigation/navigators.tsx`

- [ ] **Step 1: Add Routes enum values**

In `src/navigation/types.ts`, in the `Routes` enum, after `ResidentIntake = 'residentIntake'`:

```typescript
  // Application Routes
  Apply = 'apply',
  ApplicationStatus = 'applicationStatus',
  ApplicationList = 'applicationList',
  ApplicationDetail = 'applicationDetail',
```

- [ ] **Step 2: Update `RootStackParamList`**

In `src/navigation/types.ts`, in `RootStackParamList`:

Replace the existing `ResidentIntake` entry:

```typescript
  [Routes.ResidentIntake]: { houseId: string; applicationId?: string };
```

Add the four new entries after it:

```typescript
  [Routes.Apply]: { houseId: string; houseName: string };
  [Routes.ApplicationStatus]: { houseId: string; houseName?: string };
  [Routes.ApplicationList]: undefined;
  [Routes.ApplicationDetail]: { houseId: string; appId: string };
```

- [ ] **Step 3: Verify TypeScript after types change**

```bash
npx tsc --noEmit 2>&1 | head -20
```

Expected: No new errors. The `applicationId?: string` addition to `ResidentIntake` is backward-compatible (optional param).

- [ ] **Step 4: Register screens in `navigators.tsx`**

Add imports at the top of `src/navigation/navigators.tsx`:

```typescript
import ApplyScreen from '../screens/Application/ApplyScreen';
import ApplicationStatusScreen from '../screens/Application/ApplicationStatusScreen';
import ApplicationListScreen from '../screens/Applications/ApplicationListScreen';
import ApplicationDetailScreen from '../screens/Applications/ApplicationDetailScreen';
```

Inside `RootStack.Navigator` (after the `ResidentIntake` screen registration), add:

```tsx
<RootStack.Screen name={Routes.Apply} component={ApplyScreen} />
<RootStack.Screen name={Routes.ApplicationStatus} component={ApplicationStatusScreen} />
<RootStack.Screen name={Routes.ApplicationList} component={ApplicationListScreen} />
<RootStack.Screen name={Routes.ApplicationDetail} component={ApplicationDetailScreen} />
```

- [ ] **Step 5: Add "Applications" entry point to the operator house hub**

Find where the operator house action buttons live:

```bash
grep -rn "DrugTesting\|PaymentDashboard\|OxfordDashboard\|SendInvites" /Users/marcusklein/dev/rats-v2/src/screens/HouseSummary/ | head -10
```

In that file, add an Applications entry (import `useHouseApplications` and `Routes`):

```tsx
// Near top of the component, after houseId is available:
const { data: appList } = useHouseApplications(houseId);
const pendingCount = (appList ?? []).filter(a => a.status === 'pending').length;

// In the actions list, adjacent to other operator cards:
<TouchableOpacity
  onPress={() => navigation.navigate(Routes.ApplicationList)}
  // use whatever style other admin action cards use
>
  <Text>Applications{pendingCount > 0 ? ` (${pendingCount})` : ''}</Text>
</TouchableOpacity>;
```

- [ ] **Step 6: Full TypeScript compile check**

```bash
npx tsc --noEmit 2>&1 | head -30
```

Expected: No errors.

- [ ] **Step 7: Commit**

```bash
git add src/navigation/types.ts src/navigation/navigators.tsx
# Also add whichever HouseSummary file was modified
git commit -m "feat(navigation): wire Apply, ApplicationStatus, ApplicationList, ApplicationDetail screens"
```

---

### Task 10: Cloud Function Trigger — notifyOperatorOnApplication

**Files:**

- Modify: `functions/src/entities/Notification.ts`
- Modify: `functions/src/triggers/firestore/index.ts`

This runs in the `regroup-functions` repository.

- [ ] **Step 1: Add `"application-received"` to NotificationType**

In `functions/src/entities/Notification.ts`, update `NotificationType`:

```typescript
export type NotificationType =
  | 'dispute'
  | 'invite'
  | 'meeting-added'
  | 'meeting-forced'
  | 'application-received'
  | '';
```

- [ ] **Step 2: Write the failing test**

Create `functions/src/triggers/__tests__/onApplicationCreated.test.ts`:

```typescript
// functions/src/triggers/__tests__/onApplicationCreated.test.ts
// Note: The trigger itself wraps Firebase infrastructure that cannot be unit-tested
// without an emulator. This test verifies the export exists and is the correct type.
// End-to-end behavior is verified by deploying to the emulator and checking
// that a /notifications/{id} document is created for each house admin.

describe('notifyOperatorOnApplication', () => {
  it('is exported from the triggers/firestore module', () => {
    // We import after clearing module registry to avoid admin SDK init issues
    jest.resetModules();
    jest.mock('firebase-admin', () => ({
      initializeApp: jest.fn(),
      firestore: jest.fn(() => ({ collection: jest.fn() })),
      apps: [{}],
      app: jest.fn(),
    }));
    jest.mock('firebase-functions/v2/firestore', () => ({
      onDocumentCreated: jest.fn((path: string, handler: any) => handler),
      onDocumentUpdated: jest.fn(),
      onDocumentWritten: jest.fn((path: string, handler: any) => handler),
    }));
    jest.mock('../../util/notifications', () => ({
      sendNotification: jest.fn(),
    }));
    jest.mock('../../util/email', () => ({
      sendEmail: jest.fn(),
      regroupEmail: 'test@example.com',
    }));

    const triggers = require('../firestore');
    expect(triggers.notifyOperatorOnApplication).toBeDefined();
  });
});
```

- [ ] **Step 3: Run to verify failure**

```bash
cd /Users/marcusklein/dev/regroup-functions/functions
yarn test src/triggers/__tests__/onApplicationCreated.test.ts --no-coverage 2>&1 | tail -10
```

Expected: FAIL — `notifyOperatorOnApplication` is undefined

- [ ] **Step 4: Add the trigger to `functions/src/triggers/firestore/index.ts`**

After the `onGuestWrite` export, add:

```typescript
/**
 * Notifies all house admins when a new resident application is submitted.
 *
 * Fires on: create of houses/{houseId}/applications/{appId}
 * Action:   creates a /notifications/{id} document for each admin, which
 *           triggers the existing `notify` function to send the push notification.
 */
export const notifyOperatorOnApplication = onDocumentCreated(
  'houses/{houseId}/applications/{appId}',
  async event => {
    const data = event.data?.data();
    if (!data) return;

    const houseId = event.params.houseId;
    const applicantName = (data.applicantName as string) || 'Someone';

    const db = admin.firestore();
    const houseSnap = await db.collection('houses').doc(houseId).get();
    if (!houseSnap.exists) return;

    const houseData = houseSnap.data()!;
    const adminIds: string[] = houseData.adminIds ?? [];
    const superAdminId: string = houseData.superAdminId ?? '';

    const recipientIds = [
      ...new Set([...adminIds, superAdminId].filter(Boolean)),
    ];
    if (recipientIds.length === 0) return;

    const batch = db.batch();
    recipientIds.forEach(adminId => {
      const notifRef = db.collection('notifications').doc();
      batch.set(notifRef, {
        userId: adminId,
        houseId,
        subject: 'New Application Received',
        message: `${applicantName} applied to join your house.`,
        type: 'application-received',
        date: new Date().toISOString(),
        read: false,
      });
    });

    await batch.commit();
    logger.info(
      `notifyOperatorOnApplication: sent ${recipientIds.length} notifications for house ${houseId}`,
    );
  },
);
```

- [ ] **Step 5: Run to verify test passes**

```bash
yarn test src/triggers/__tests__/onApplicationCreated.test.ts --no-coverage 2>&1 | tail -10
```

Expected: PASS

- [ ] **Step 6: TypeScript compile check**

```bash
npx tsc --noEmit 2>&1 | head -20
```

Expected: No errors.

- [ ] **Step 7: Verify functions build**

```bash
yarn build 2>&1 | tail -10
```

Expected: Build succeeds. Fix any errors before committing.

- [ ] **Step 8: Commit**

```bash
git add functions/src/entities/Notification.ts functions/src/triggers/firestore/index.ts functions/src/triggers/__tests__/onApplicationCreated.test.ts
git commit -m "feat(functions): add notifyOperatorOnApplication trigger — notifies admins on new application"
```

> **Deployment:** Do not deploy this function in isolation. Deploy together with the mobile app changes so end-to-end testing can be done with both sides live.

---

## Self-Review

### Spec Coverage

| Spec requirement                                    | Covered by                                                         |
| --------------------------------------------------- | ------------------------------------------------------------------ |
| In-app application submission                       | Task 2 (service) + Task 5 (ApplyScreen)                            |
| Application status tracking (resident)              | Task 6 (ApplicationStatusScreen)                                   |
| Application review UI (operator)                    | Task 7 + Task 8                                                    |
| Applicant → resident conversion                     | Task 8 (Approve → navigate to ResidentIntake with `applicationId`) |
| Push notification on new application                | Task 10 (notifyOperatorOnApplication)                              |
| Firestore rules: applicant write, admin read/update | Task 4                                                             |
| Navigation                                          | Task 9                                                             |

### Acceptance Criteria

After all tasks are merged, verify manually:

- [ ] Resident can submit application in ≤5 minutes from HouseSearch
- [ ] House admin receives push notification within 30 seconds
- [ ] Operator sees applicant in `ApplicationListScreen` → Pending tab
- [ ] Operator approves → lands on `ResidentIntake` with `applicationId` param present
- [ ] Operator rejects with note → resident sees "Not Selected" badge + note in `ApplicationStatusScreen`
- [ ] Firestore emulator test: unauthenticated user cannot create application (assertFails)
- [ ] Firestore emulator test: applicant cannot update their own application after submission (assertFails)

---

## Execution Options

**1. Subagent-Driven (recommended)** — Fresh subagent per task, two-stage review (spec compliance then code quality). Use `superpowers:subagent-driven-development`.

**2. Inline Execution** — Execute tasks in this session using `superpowers:executing-plans`.

Which approach?
