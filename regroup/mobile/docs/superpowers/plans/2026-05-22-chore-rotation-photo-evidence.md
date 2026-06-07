# Chore Rotation + Photo Evidence Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

## Overview

Add two tightly-related features to the Regroup v2 React Native app:

1. **Chore Rotation** — a `choreRotations/{houseId}` Firestore document drives a weekly round-robin. Each Sunday the next resident in the ordered list becomes the assignee. Admins set the order via a new `ChoreRotationSetup` screen in House Settings. The app checks on load whether a new week has started and advances the index client-side (MVP; Cloud Function upgrade is noted as a follow-on).
2. **Photo Evidence** — when a resident taps "COMPLETE CHORE" on `GuestChoreSummary`, they are first prompted to optionally attach a photo. The photo uploads to `houses/{houseId}/chore-evidence/{activityId}` in Firebase Storage and the download URL is stored in `ChoreActivityData.photoUrl`. Admins can see the photo URL from the activity feed.

## Codebase Anchor Points

| Concern              | Path                                                                       |
| -------------------- | -------------------------------------------------------------------------- |
| Chore entity         | `src/entities/Chore.tsx`                                                   |
| Activity model       | `src/entities/ActivityModel.ts`                                            |
| Storage service      | `src/services/storage.tsx`                                                 |
| Activity service     | `src/services/activity.ts`                                                 |
| Activity queries     | `src/state/queries/activityQueries.ts`                                     |
| Image picker         | `react-native-image-picker` (already in `package.json` at ^8.2.1)          |
| Guest chore screen   | `src/screens/GuestChoreOverview/GuestChoreSummary/GuestChoreSummary.tsx`   |
| House chore overview | `src/screens/HouseChoreOverview/HouseChoreActivity/HouseChoreActivity.tsx` |
| House settings       | `src/screens/HouseSettings/HouseSettings.tsx`                              |
| Navigation types     | `src/navigation/types.ts`                                                  |
| Navigators           | `src/navigation/navigators.tsx`                                            |
| Firestore rules      | `firebase/firestore.rules`                                                 |
| Firebase setup       | `firebase-setup` (re-exported `firestore`, `auth`)                         |

## Implementation Phases

---

## Phase 1 — Data Model

### Task 1.1 — Extend `ChoreActivityData` with optional `photoUrl`

**File:** `src/entities/ActivityModel.ts`

- [ ] Add `photoUrl?: string` to `ChoreActivityData`
- [ ] Add `photoUrl` as an optional parameter to `ActivityDataFactory.chore`

```typescript
// ChoreActivityData — add the optional field
export interface ChoreActivityData {
  type: 'chore';
  choreType: string;
  choreName: string;
  choreId?: string;
  photoUrl?: string; // Firebase Storage download URL, set when resident attaches photo evidence
}

// ActivityDataFactory.chore — include photoUrl
chore: (
  choreType: string,
  choreName: string,
  choreId?: string,
  photoUrl?: string,
): ChoreActivityData => ({
  type: 'chore',
  choreType,
  choreName,
  choreId,
  ...(photoUrl ? { photoUrl } : {}),
}),
```

### Task 1.2 — Define `ChoreRotation` entity/type

Create a plain TypeScript interface (no new file needed — add it to `src/entities/Chore.tsx` alongside the existing `Chore` class).

- [ ] Add `ChoreRotation` interface to `src/entities/Chore.tsx`

```typescript
// Add to src/entities/Chore.tsx
export interface ChoreRotation {
  choreName: string; // e.g. "Kitchen" — the single chore this rotation controls
  guestIds: string[]; // ordered list of guest IDs for round-robin
  currentIndex: number; // index into guestIds of the CURRENT assignee
  lastRotatedAt: string; // ISO date string (YYYY-MM-DD) of the most recent Sunday rotation
}
```

**Test commands:**

```bash
# No direct test — covered by service tests below. TypeScript compile check:
yarn tsc --noEmit
```

---

## Phase 2 — Storage helper for chore evidence

### Task 2.1 — Add `uploadChoreEvidencePhoto` to storage service

**File:** `src/services/storage.tsx`

- [ ] Add path helper `getChoreEvidenceUrl`
- [ ] Add `uploadChoreEvidencePhoto` export

```typescript
// Add to src/services/storage.tsx

const getChoreEvidenceUrl = (houseId: string, activityId: string) =>
  `houses/${houseId}/chore-evidence/${activityId}`;

export const uploadChoreEvidencePhoto = async (
  pathOnDevice: string,
  houseId: string,
  activityId: string,
  metadata?: FirebaseStorageTypes.SettableMetadata,
): Promise<string> => {
  const storagePath = getChoreEvidenceUrl(houseId, activityId);
  await uploadPhoto(storagePath, pathOnDevice, metadata);
  return storage().ref(storagePath).getDownloadURL();
};
```

---

## Phase 3 — Chore Rotation Service

### Task 3.1 — Create `src/services/choreRotation.ts`

- [ ] Create the file with four exported functions:
  - `getRotation(houseId)` — fetches `choreRotations/{houseId}`, returns `ChoreRotation | null`
  - `setRotationOrder(houseId, choreName, guestIds)` — creates/overwrites the doc, sets `currentIndex: 0`, `lastRotatedAt` to current Sunday
  - `advanceRotation(houseId)` — increments index (wraps at list length), updates `lastRotatedAt` to today's ISO date
  - `getCurrentAssignee(houseId)` — convenience: fetches rotation and returns `guestIds[currentIndex]` or `null`

```typescript
// src/services/choreRotation.ts
import { firestore } from '../../firebase-setup';
import { ChoreRotation } from '../entities/Chore';
import { logException } from '../util/logging';

const choreRotationsCollection = firestore.collection('choreRotations');

function currentSundayISO(): string {
  const d = new Date();
  const day = d.getDay(); // 0 = Sunday
  d.setDate(d.getDate() - day);
  d.setHours(0, 0, 0, 0);
  return d.toISOString().split('T')[0];
}

export async function getRotation(
  houseId: string,
): Promise<ChoreRotation | null> {
  try {
    const doc = await choreRotationsCollection.doc(houseId).get();
    if (!doc.exists) return null;
    return doc.data() as ChoreRotation;
  } catch (error) {
    logException(error);
    throw new Error('Failed to fetch chore rotation');
  }
}

export async function setRotationOrder(
  houseId: string,
  choreName: string,
  guestIds: string[],
): Promise<void> {
  try {
    const rotation: ChoreRotation = {
      choreName,
      guestIds,
      currentIndex: 0,
      lastRotatedAt: currentSundayISO(),
    };
    await choreRotationsCollection.doc(houseId).set(rotation);
  } catch (error) {
    logException(error);
    throw new Error('Failed to set rotation order');
  }
}

export async function advanceRotation(houseId: string): Promise<void> {
  try {
    const doc = await choreRotationsCollection.doc(houseId).get();
    if (!doc.exists) throw new Error('No rotation configured for this house');
    const rotation = doc.data() as ChoreRotation;
    const nextIndex = (rotation.currentIndex + 1) % rotation.guestIds.length;
    await choreRotationsCollection.doc(houseId).update({
      currentIndex: nextIndex,
      lastRotatedAt: currentSundayISO(),
    });
  } catch (error) {
    logException(error);
    throw new Error('Failed to advance chore rotation');
  }
}

export async function getCurrentAssignee(
  houseId: string,
): Promise<string | null> {
  try {
    const rotation = await getRotation(houseId);
    if (!rotation || rotation.guestIds.length === 0) return null;
    return rotation.guestIds[rotation.currentIndex] ?? null;
  } catch (error) {
    logException(error);
    throw new Error('Failed to get current chore assignee');
  }
}
```

### Task 3.2 — Create `src/services/__tests__/choreRotation.test.ts`

- [ ] Create test file
- [ ] Mock `../../firebase-setup` using the same self-contained factory pattern as `src/services/__tests__/house.test.ts`
- [ ] Mock `../util/logging` so `logException` is a no-op jest.fn()

```typescript
// src/services/__tests__/choreRotation.test.ts

jest.mock('../../../firebase-setup', () => {
  const _mockDoc = {
    id: 'house1',
    get: jest.fn(),
    set: jest.fn(() => Promise.resolve()),
    update: jest.fn(() => Promise.resolve()),
  };

  const _mockCollection = {
    doc: jest.fn(() => _mockDoc),
    _mockDoc,
  };

  return {
    firestore: {
      collection: jest.fn(() => _mockCollection),
      _mockCollection,
    },
  };
});

jest.mock('../../../src/util/logging', () => ({ logException: jest.fn() }), {
  virtual: true,
});
// Fallback path used by the service
jest.mock('../../util/logging', () => ({ logException: jest.fn() }));

import { firestore } from '../../../firebase-setup';
import {
  getRotation,
  setRotationOrder,
  advanceRotation,
  getCurrentAssignee,
} from '../choreRotation';

const _col = (firestore as any)._mockCollection;
const _doc = () => _col._mockDoc;

const makeRotation = (overrides = {}) => ({
  choreName: 'Kitchen',
  guestIds: ['guest1', 'guest2', 'guest3'],
  currentIndex: 0,
  lastRotatedAt: '2026-05-17',
  ...overrides,
});

afterEach(() => jest.clearAllMocks());

describe('getRotation', () => {
  it('returns null when the document does not exist', async () => {
    _doc().get.mockResolvedValueOnce({ exists: false, data: () => null });
    const result = await getRotation('house1');
    expect(result).toBeNull();
  });

  it('returns the rotation when the document exists', async () => {
    const rotation = makeRotation();
    _doc().get.mockResolvedValueOnce({ exists: true, data: () => rotation });
    const result = await getRotation('house1');
    expect(result).toEqual(rotation);
  });

  it('throws a wrapped error when Firestore fails', async () => {
    _doc().get.mockRejectedValueOnce(new Error('Network error'));
    await expect(getRotation('house1')).rejects.toThrow(
      'Failed to fetch chore rotation',
    );
  });
});

describe('setRotationOrder', () => {
  it('writes the rotation document with currentIndex 0', async () => {
    await setRotationOrder('house1', 'Kitchen', ['guest1', 'guest2']);
    expect(_doc().set).toHaveBeenCalledWith(
      expect.objectContaining({
        choreName: 'Kitchen',
        guestIds: ['guest1', 'guest2'],
        currentIndex: 0,
      }),
    );
  });

  it('throws a wrapped error when Firestore set fails', async () => {
    _doc().set.mockRejectedValueOnce(new Error('Permission denied'));
    await expect(
      setRotationOrder('house1', 'Kitchen', ['guest1']),
    ).rejects.toThrow('Failed to set rotation order');
  });
});

describe('advanceRotation', () => {
  it('increments currentIndex by 1', async () => {
    const rotation = makeRotation({ currentIndex: 0 });
    _doc().get.mockResolvedValueOnce({ exists: true, data: () => rotation });
    await advanceRotation('house1');
    expect(_doc().update).toHaveBeenCalledWith(
      expect.objectContaining({ currentIndex: 1 }),
    );
  });

  it('wraps index back to 0 after the last guest', async () => {
    const rotation = makeRotation({
      currentIndex: 2,
      guestIds: ['g1', 'g2', 'g3'],
    });
    _doc().get.mockResolvedValueOnce({ exists: true, data: () => rotation });
    await advanceRotation('house1');
    expect(_doc().update).toHaveBeenCalledWith(
      expect.objectContaining({ currentIndex: 0 }),
    );
  });

  it('throws when no rotation document exists', async () => {
    _doc().get.mockResolvedValueOnce({ exists: false, data: () => null });
    await expect(advanceRotation('house1')).rejects.toThrow(
      'Failed to advance chore rotation',
    );
  });
});

describe('getCurrentAssignee', () => {
  it('returns the guestId at currentIndex', async () => {
    const rotation = makeRotation({ currentIndex: 1 });
    _doc().get.mockResolvedValueOnce({ exists: true, data: () => rotation });
    const result = await getCurrentAssignee('house1');
    expect(result).toBe('guest2');
  });

  it('returns null when no rotation document exists', async () => {
    _doc().get.mockResolvedValueOnce({ exists: false, data: () => null });
    const result = await getCurrentAssignee('house1');
    expect(result).toBeNull();
  });

  it('returns null when guestIds is empty', async () => {
    const rotation = makeRotation({ guestIds: [], currentIndex: 0 });
    _doc().get.mockResolvedValueOnce({ exists: true, data: () => rotation });
    const result = await getCurrentAssignee('house1');
    expect(result).toBeNull();
  });
});
```

**Test command:**

```bash
yarn test src/services/__tests__/choreRotation.test.ts --no-coverage
```

---

## Phase 4 — React Query hooks for chore rotation

### Task 4.1 — Create `src/state/queries/choreRotationQueries.ts`

- [ ] Create file with query keys, three query hooks, and two mutation hooks
- [ ] Follow exact same `useQuery` / `useMutation` + `invalidateQueries` in `onSettled` pattern as `activityQueries.ts`

```typescript
// src/state/queries/choreRotationQueries.ts
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import * as choreRotationService from '../../services/choreRotation';
import { ChoreRotation } from '../../entities/Chore';
import { logException } from '../../util/logging';

// ── Query Keys ────────────────────────────────────────────────────────────────

export const choreRotationKeys = {
  all: ['choreRotations'] as const,
  rotation: (houseId: string) => [...choreRotationKeys.all, houseId] as const,
};

// ── useChoreRotation ──────────────────────────────────────────────────────────

export const useChoreRotation = (houseId: string, enabled: boolean = true) => {
  return useQuery({
    queryKey: choreRotationKeys.rotation(houseId),
    queryFn: () => choreRotationService.getRotation(houseId),
    enabled: enabled && !!houseId,
    staleTime: 60_000,
    onError: (error: unknown) => logException(error),
  });
};

// ── useAdvanceRotation ────────────────────────────────────────────────────────

export const useAdvanceRotation = (houseId: string) => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: () => choreRotationService.advanceRotation(houseId),
    onSettled: () => {
      queryClient.invalidateQueries({
        queryKey: choreRotationKeys.rotation(houseId),
      });
    },
    onError: (error: unknown) => logException(error),
  });
};

// ── useSetRotationOrder ───────────────────────────────────────────────────────

export const useSetRotationOrder = (houseId: string) => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      choreName,
      guestIds,
    }: {
      choreName: string;
      guestIds: string[];
    }) => choreRotationService.setRotationOrder(houseId, choreName, guestIds),
    onSettled: () => {
      queryClient.invalidateQueries({
        queryKey: choreRotationKeys.rotation(houseId),
      });
    },
    onError: (error: unknown) => logException(error),
  });
};
```

### Task 4.2 — Create `src/state/queries/__tests__/choreRotationQueries.test.ts`

- [ ] Create test file using `renderHook` + `QueryClientProvider` wrapper (same pattern as `activityQueries.test.ts`)
- [ ] Mock `../../../services/choreRotation` with `jest.mock`
- [ ] Mock `../../../util/logging`

```typescript
// src/state/queries/__tests__/choreRotationQueries.test.ts

jest.mock('../../../services/choreRotation');
jest.mock('../../../util/logging', () => ({ logException: jest.fn() }));

import React from 'react';
import { renderHook, act, waitFor } from '@testing-library/react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import * as choreRotationService from '../../../services/choreRotation';
import {
  choreRotationKeys,
  useChoreRotation,
  useAdvanceRotation,
  useSetRotationOrder,
} from '../choreRotationQueries';
import type { ChoreRotation } from '../../../entities/Chore';

const makeRotation = (
  overrides: Partial<ChoreRotation> = {},
): ChoreRotation => ({
  choreName: 'Kitchen',
  guestIds: ['guest1', 'guest2'],
  currentIndex: 0,
  lastRotatedAt: '2026-05-17',
  ...overrides,
});

describe('choreRotationQueries', () => {
  let queryClient: QueryClient;

  beforeEach(() => {
    queryClient = new QueryClient({
      defaultOptions: {
        queries: { retry: false },
        mutations: { retry: false },
      },
    });
  });

  afterEach(() => {
    jest.clearAllMocks();
    queryClient.clear();
    queryClient.unmount();
  });

  const wrapper = ({ children }: { children: React.ReactNode }) =>
    React.createElement(QueryClientProvider, { client: queryClient }, children);

  // ── choreRotationKeys ───────────────────────────────────────────────────────

  describe('choreRotationKeys', () => {
    it('all is ["choreRotations"]', () => {
      expect(choreRotationKeys.all).toEqual(['choreRotations']);
    });

    it('rotation key includes houseId', () => {
      expect(choreRotationKeys.rotation('house1')).toContain('house1');
    });
  });

  // ── useChoreRotation ────────────────────────────────────────────────────────

  describe('useChoreRotation', () => {
    it('fetches and returns the rotation', async () => {
      const rotation = makeRotation();
      (choreRotationService.getRotation as jest.Mock).mockResolvedValue(
        rotation,
      );

      const { result } = renderHook(() => useChoreRotation('house1'), {
        wrapper,
      });

      await waitFor(() => expect(result.current.isSuccess).toBe(true));

      expect(result.current.data).toEqual(rotation);
      expect(choreRotationService.getRotation).toHaveBeenCalledWith('house1');
    });

    it('returns null when no rotation exists', async () => {
      (choreRotationService.getRotation as jest.Mock).mockResolvedValue(null);

      const { result } = renderHook(() => useChoreRotation('house1'), {
        wrapper,
      });

      await waitFor(() => expect(result.current.isSuccess).toBe(true));
      expect(result.current.data).toBeNull();
    });

    it('does not fetch when houseId is empty', () => {
      const { result } = renderHook(() => useChoreRotation(''), { wrapper });
      expect(result.current.isLoading).toBe(false);
      expect(choreRotationService.getRotation).not.toHaveBeenCalled();
    });

    it('does not fetch when enabled is false', () => {
      const { result } = renderHook(() => useChoreRotation('house1', false), {
        wrapper,
      });
      expect(result.current.isLoading).toBe(false);
      expect(choreRotationService.getRotation).not.toHaveBeenCalled();
    });

    it('surfaces service errors', async () => {
      (choreRotationService.getRotation as jest.Mock).mockRejectedValue(
        new Error('Failed to fetch chore rotation'),
      );

      const { result } = renderHook(() => useChoreRotation('house1'), {
        wrapper,
      });

      await waitFor(() => expect(result.current.isError).toBe(true));
    });
  });

  // ── useAdvanceRotation ──────────────────────────────────────────────────────

  describe('useAdvanceRotation', () => {
    it('calls advanceRotation and invalidates the cache', async () => {
      (choreRotationService.advanceRotation as jest.Mock).mockResolvedValue(
        undefined,
      );
      const invalidateSpy = jest.spyOn(queryClient, 'invalidateQueries');

      const { result } = renderHook(() => useAdvanceRotation('house1'), {
        wrapper,
      });

      act(() => {
        result.current.mutate();
      });

      await waitFor(() => expect(result.current.isSuccess).toBe(true));

      expect(choreRotationService.advanceRotation).toHaveBeenCalledWith(
        'house1',
      );
      expect(invalidateSpy).toHaveBeenCalledWith({
        queryKey: choreRotationKeys.rotation('house1'),
      });
    });

    it('surfaces errors', async () => {
      (choreRotationService.advanceRotation as jest.Mock).mockRejectedValue(
        new Error('Failed to advance chore rotation'),
      );

      const { result } = renderHook(() => useAdvanceRotation('house1'), {
        wrapper,
      });

      act(() => {
        result.current.mutate();
      });

      await waitFor(() => expect(result.current.isError).toBe(true));
    });
  });

  // ── useSetRotationOrder ─────────────────────────────────────────────────────

  describe('useSetRotationOrder', () => {
    it('calls setRotationOrder and invalidates the cache', async () => {
      (choreRotationService.setRotationOrder as jest.Mock).mockResolvedValue(
        undefined,
      );
      const invalidateSpy = jest.spyOn(queryClient, 'invalidateQueries');

      const { result } = renderHook(() => useSetRotationOrder('house1'), {
        wrapper,
      });

      act(() => {
        result.current.mutate({ choreName: 'Kitchen', guestIds: ['g1', 'g2'] });
      });

      await waitFor(() => expect(result.current.isSuccess).toBe(true));

      expect(choreRotationService.setRotationOrder).toHaveBeenCalledWith(
        'house1',
        'Kitchen',
        ['g1', 'g2'],
      );
      expect(invalidateSpy).toHaveBeenCalledWith({
        queryKey: choreRotationKeys.rotation('house1'),
      });
    });

    it('surfaces errors', async () => {
      (choreRotationService.setRotationOrder as jest.Mock).mockRejectedValue(
        new Error('Failed to set rotation order'),
      );

      const { result } = renderHook(() => useSetRotationOrder('house1'), {
        wrapper,
      });

      act(() => {
        result.current.mutate({ choreName: 'Bathroom', guestIds: ['g1'] });
      });

      await waitFor(() => expect(result.current.isError).toBe(true));
    });
  });
});
```

**Test command:**

```bash
yarn test src/state/queries/__tests__/choreRotationQueries.test.ts --no-coverage
```

---

## Phase 5 — Auto-advance rotation on app load

### Task 5.1 — `useAutoAdvanceRotation` hook

Create a small hook called from the guest's home screen (or any high-level component that mounts each session) that checks whether the current week's Sunday is past `lastRotatedAt` and calls `advanceRotation` if so.

**File:** Create `src/hooks/useAutoAdvanceRotation.ts`

- [ ] Create the hook

```typescript
// src/hooks/useAutoAdvanceRotation.ts
import { useEffect } from 'react';
import {
  useAdvanceRotation,
  useChoreRotation,
} from '../state/queries/choreRotationQueries';

function currentSundayISO(): string {
  const d = new Date();
  const day = d.getDay();
  d.setDate(d.getDate() - day);
  d.setHours(0, 0, 0, 0);
  return d.toISOString().split('T')[0];
}

export function useAutoAdvanceRotation(houseId: string) {
  const { data: rotation } = useChoreRotation(houseId, !!houseId);
  const { mutate: advance } = useAdvanceRotation(houseId);

  useEffect(() => {
    if (!rotation) return;
    const thisSunday = currentSundayISO();
    if (rotation.lastRotatedAt < thisSunday) {
      advance();
    }
  }, [rotation, advance]);
}
```

- [ ] Call `useAutoAdvanceRotation(house?.id ?? '')` from `src/screens/HouseOverview/HouseSummary/HouseSummary.tsx` (or whatever top-level house component mounts once per session). Identify the correct component by searching for `useSelectedHouse` usage in HouseSummary.

---

## Phase 6 — Photo evidence in `GuestChoreSummary`

### Task 6.1 — Modify `GuestChoreSummary` to support optional photo before completion

**File:** `src/screens/GuestChoreOverview/GuestChoreSummary/GuestChoreSummary.tsx`

- [ ] Import `launchImageLibrary` from `react-native-image-picker`
- [ ] Add local state: `photoUri: string | null` and `isUploadingPhoto: boolean`
- [ ] Replace the `showChoreCompletedModal` implementation with a two-step flow:
  1. Call `launchImageLibrary` to let the resident pick an optional photo (they can cancel to skip)
  2. If a photo is selected, upload via `uploadChoreEvidencePhoto` (the photo path needs the new activity ID — use a temp Firestore doc ref ID generated client-side via `firestore().collection('activities').doc().id`)
  3. Log the chore activity via `useLogNewActivity` with `photoUrl` in `ChoreActivityData`

Full implementation:

```typescript
// Add to imports in GuestChoreSummary.tsx
import { useState, useCallback } from 'react';
import { Alert, ActivityIndicator } from 'react-native';
import { launchImageLibrary } from 'react-native-image-picker';
import storage from '@react-native-firebase/storage';
import { uploadChoreEvidencePhoto } from '../../../services/storage';
import { useLogNewActivity } from '../../../state/queries/activityQueries';
import { ActivityType } from '../../../entities/ActivityModel';
import { auth } from '../../../../firebase-setup';

// Inside GuestChoreSummary component:
const [isSubmitting, setIsSubmitting] = useState(false);
const logActivity = useLogNewActivity();

const handleCompleteChore = useCallback(async () => {
  if (!guest || !house) return;
  if (isSubmitting) return;

  setIsSubmitting(true);
  try {
    // Step 1: Optional photo
    let photoUrl: string | undefined;

    await new Promise<void>(resolve => {
      Alert.alert(
        'Attach Photo?',
        'Would you like to attach a photo as evidence?',
        [
          {
            text: 'Skip',
            style: 'cancel',
            onPress: () => resolve(),
          },
          {
            text: 'Add Photo',
            onPress: async () => {
              const result = await launchImageLibrary({
                mediaType: 'photo',
                quality: 0.7,
                selectionLimit: 1,
              });

              if (result.assets && result.assets[0]?.uri) {
                const uri = result.assets[0].uri;
                // Generate a stable activity ID client-side for the storage path
                const tempId = `${guest.id}_${Date.now()}`;
                try {
                  photoUrl = await uploadChoreEvidencePhoto(
                    uri,
                    house.id,
                    tempId,
                  );
                } catch {
                  // Photo upload failed — continue without photo
                }
              }
              resolve();
            },
          },
        ],
      );
    });

    // Step 2: Log chore activity
    const currentUser = auth.currentUser;
    if (!currentUser) throw new Error('Not authenticated');

    await logActivity.mutateAsync({
      guestId: guest.id,
      houseId: house.id,
      type: ActivityType.CHORE,
      data: {
        type: 'chore',
        choreType: 'weekly',
        choreName: choreName,
        ...(photoUrl ? { photoUrl } : {}),
      },
      loggedBy: currentUser.uid,
    });

    Alert.alert('Done', 'Chore marked as complete!');
  } catch {
    Alert.alert('Error', 'Could not complete chore. Please try again.');
  } finally {
    setIsSubmitting(false);
  }
}, [guest, house, choreName, isSubmitting, logActivity]);
```

- [ ] Replace the `rightButtonOnPress={showChoreCompletedModal}` in `renderStatDetails` with `rightButtonOnPress={handleCompleteChore}`
- [ ] Pass `isSubmitting` down so the button shows disabled/loading state when `isSubmitting === true` (use existing `ActionButtons` props or wrap in a View with `pointerEvents="none"` when submitting)

### Task 6.2 — Create/Update test for `GuestChoreSummary`

**File:** `src/screens/GuestChoreOverview/GuestChoreSummary/__tests__/GuestChoreSummary.test.tsx`

- [ ] If file does not exist, create it. If it does, add the photo evidence test cases.
- [ ] Mock `react-native-image-picker` with a self-contained factory
- [ ] Mock `../../../services/storage`
- [ ] Mock `../../../state/queries/activityQueries`

```typescript
// src/screens/GuestChoreOverview/GuestChoreSummary/__tests__/GuestChoreSummary.test.tsx

jest.mock('react-native-image-picker', () => ({
  launchImageLibrary: jest.fn(),
}));

jest.mock('../../../../services/storage', () => ({
  uploadChoreEvidencePhoto: jest.fn(() =>
    Promise.resolve('https://storage.example.com/photo.jpg'),
  ),
}));

jest.mock('../../../../state/queries/activityQueries', () => ({
  useLogNewActivity: jest.fn(() => ({
    mutateAsync: jest.fn(() => Promise.resolve()),
  })),
}));

jest.mock('../../../../firebase-setup', () => ({
  auth: { currentUser: { uid: 'user1' } },
  firestore: {
    collection: jest.fn(() => ({ doc: jest.fn(() => ({ id: 'temp-id' })) })),
  },
}));

jest.mock('../../../../hooks/useStatSummary', () => ({
  useStatSummary: jest.fn(() => ({
    guest: { id: 'guest1', userId: 'user1', currentChore: 'Kitchen' },
    house: {
      id: 'house1',
      chores: { Kitchen: { description: 'Clean the kitchen.' } },
    },
    user: { id: 'user1' },
    statSum: 0,
    phaseRule: null,
    percentage: 0,
    disputes: [],
    daysRemaining: 7,
    graphData: [],
    getBarFillColor: jest.fn(() => 'green'),
    isLoading: false,
  })),
}));

import React from 'react';
import { render, fireEvent, waitFor } from '@testing-library/react-native';
import { Alert } from 'react-native';
import { launchImageLibrary } from 'react-native-image-picker';
import { uploadChoreEvidencePhoto } from '../../../../services/storage';
import { useLogNewActivity } from '../../../../state/queries/activityQueries';
import GuestChoreSummary from '../GuestChoreSummary';

// Minimal navigation prop
const navigation = { navigate: jest.fn(), goBack: jest.fn() } as any;

afterEach(() => jest.clearAllMocks());

describe('GuestChoreSummary — photo evidence flow', () => {
  it('logs chore activity without photo when user skips', async () => {
    const alertSpy = jest
      .spyOn(Alert, 'alert')
      .mockImplementation((_title, _msg, buttons) => {
        // Simulate pressing "Skip"
        buttons?.[0]?.onPress?.();
      });

    const _mockMutateAsync = jest.fn(() => Promise.resolve());
    (useLogNewActivity as jest.Mock).mockReturnValue({
      mutateAsync: _mockMutateAsync,
    });

    const { getByTestId } = render(
      <GuestChoreSummary navigation={navigation} />,
    );

    fireEvent.press(getByTestId('complete-chore-button'));

    await waitFor(() => {
      expect(_mockMutateAsync).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'chore',
          data: expect.not.objectContaining({ photoUrl: expect.anything() }),
        }),
      );
    });

    alertSpy.mockRestore();
  });

  it('uploads photo and includes photoUrl when user adds a photo', async () => {
    (launchImageLibrary as jest.Mock).mockResolvedValue({
      assets: [{ uri: 'file:///tmp/chore.jpg' }],
    });

    const alertSpy = jest
      .spyOn(Alert, 'alert')
      .mockImplementation((_title, _msg, buttons) => {
        // Simulate pressing "Add Photo"
        buttons?.[1]?.onPress?.();
      });

    const _mockMutateAsync = jest.fn(() => Promise.resolve());
    (useLogNewActivity as jest.Mock).mockReturnValue({
      mutateAsync: _mockMutateAsync,
    });

    const { getByTestId } = render(
      <GuestChoreSummary navigation={navigation} />,
    );

    fireEvent.press(getByTestId('complete-chore-button'));

    await waitFor(() => {
      expect(uploadChoreEvidencePhoto).toHaveBeenCalledWith(
        'file:///tmp/chore.jpg',
        'house1',
        expect.any(String),
      );
      expect(_mockMutateAsync).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            photoUrl: 'https://storage.example.com/photo.jpg',
          }),
        }),
      );
    });

    alertSpy.mockRestore();
  });
});
```

**Test command:**

```bash
yarn test src/screens/GuestChoreOverview/GuestChoreSummary/__tests__/GuestChoreSummary.test.tsx --no-coverage
```

---

## Phase 7 — Admin: Chore Rotation Setup Screen

### Task 7.1 — Create `ChoreRotationSetupScreen`

**File:** `src/screens/HouseSettings/ChoreRotationSetupScreen.tsx`

- [ ] Create screen that:
  - Fetches current `ChoreRotation` via `useChoreRotation`
  - Fetches guests via `useGuests`
  - Allows admin to pick a chore from `house.chores` via a simple Picker or flat list
  - Shows the current resident order with Up/Down arrow buttons to reorder
  - "Save Order" button calls `useSetRotationOrder`
  - "Advance Now" button calls `useAdvanceRotation` (manual override)

```typescript
// src/screens/HouseSettings/ChoreRotationSetupScreen.tsx
import React, { useState, useCallback, useEffect } from 'react';
import {
  View,
  FlatList,
  TouchableOpacity,
  ViewStyle,
  ListRenderItemInfo,
  Alert,
} from 'react-native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { RootStackParamList } from '../../navigation/types';
import { useSelectedHouse } from '../../hooks/useSelectedHouse';
import { useGuests } from '../../state/queries';
import {
  useChoreRotation,
  useSetRotationOrder,
  useAdvanceRotation,
} from '../../state/queries/choreRotationQueries';
import ScreenHeader from '../../components/screen-header';
import { RatsText } from '../../components/rats-text';
import RatsButton from '../../components/rats-button/rats-button';
import RatsLoadingIndicator from '../../components/rats-loading-indicator/rats-loading-indicator';
import {
  color,
  fontSize,
  normalize,
  fontFamily,
  CARD_STYLE,
  SAVE_BUTTON,
} from '../../styles/theme';
import { Guest } from '../../entities/Guest';

interface Props {
  navigation: NativeStackNavigationProp<RootStackParamList>;
}

const ITEM_STYLE: ViewStyle = {
  ...CARD_STYLE,
  flexDirection: 'row',
  alignItems: 'center',
  paddingVertical: normalize(12),
  paddingHorizontal: normalize(16),
  marginBottom: 2,
};

const ARROW_BTN: ViewStyle = {
  paddingHorizontal: normalize(12),
  paddingVertical: normalize(6),
};

const ChoreRotationSetupScreen: React.FC<Props> = ({ navigation }) => {
  const { house } = useSelectedHouse();
  const houseId = house?.id ?? '';

  const { data: rotation, isLoading: rotationLoading } = useChoreRotation(
    houseId,
    !!houseId,
  );
  const { data: queryGuests, isLoading: guestsLoading } = useGuests(
    houseId,
    !!houseId,
  );

  const setRotation = useSetRotationOrder(houseId);
  const advanceRotation = useAdvanceRotation(houseId);

  const allGuests = queryGuests ? (Object.values(queryGuests) as Guest[]) : [];
  const activeGuests = allGuests.filter(
    g => g.status === 'active' || !g.status,
  );

  // Ordered guest ID list for the rotation
  const [orderedIds, setOrderedIds] = useState<string[]>([]);
  const [selectedChore, setSelectedChore] = useState<string>('');

  useEffect(() => {
    if (rotation) {
      setOrderedIds(rotation.guestIds);
      setSelectedChore(rotation.choreName);
    } else if (activeGuests.length > 0) {
      setOrderedIds(activeGuests.map(g => g.id));
    }
  }, [rotation]);

  useEffect(() => {
    if (!selectedChore && house?.chores) {
      const firstChore = Object.keys(house.chores)[0];
      if (firstChore) setSelectedChore(firstChore);
    }
  }, [house?.chores, selectedChore]);

  const moveUp = useCallback((index: number) => {
    if (index === 0) return;
    setOrderedIds(prev => {
      const next = [...prev];
      const temp = next[index - 1];
      next[index - 1] = next[index];
      next[index] = temp;
      return next;
    });
  }, []);

  const moveDown = useCallback((index: number) => {
    setOrderedIds(prev => {
      if (index === prev.length - 1) return prev;
      const next = [...prev];
      const temp = next[index + 1];
      next[index + 1] = next[index];
      next[index] = temp;
      return next;
    });
  }, []);

  const handleSave = useCallback(async () => {
    if (!selectedChore || orderedIds.length === 0) {
      Alert.alert('Error', 'Select a chore and add at least one resident.');
      return;
    }
    try {
      await setRotation.mutateAsync({
        choreName: selectedChore,
        guestIds: orderedIds,
      });
      Alert.alert('Saved', 'Rotation order saved.');
    } catch {
      Alert.alert('Error', 'Could not save rotation. Please try again.');
    }
  }, [selectedChore, orderedIds, setRotation]);

  const handleAdvanceNow = useCallback(() => {
    Alert.alert(
      'Advance Rotation',
      'This will move to the next resident immediately. Are you sure?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Advance',
          onPress: () =>
            advanceRotation.mutate(undefined, {
              onSuccess: () => Alert.alert('Done', 'Rotation advanced.'),
              onError: () =>
                Alert.alert('Error', 'Could not advance rotation.'),
            }),
        },
      ],
    );
  }, [advanceRotation]);

  const guestById = useCallback(
    (id: string) => activeGuests.find(g => g.id === id),
    [activeGuests],
  );

  const renderItem = ({ item, index }: ListRenderItemInfo<string>) => {
    const guest = guestById(item);
    const name = guest
      ? `${guest.firstName ?? ''} ${guest.lastName ?? ''}`.trim() || 'Resident'
      : item;
    const isCurrent = rotation?.currentIndex === index;

    return (
      <View style={ITEM_STYLE} testID={`rotation-row-${index}`}>
        <RatsText
          translate={false}
          text={`${index + 1}. ${name}${isCurrent ? '  (current)' : ''}`}
          style={{
            flex: 1,
            fontSize: fontSize.medium,
            color: isCurrent ? color.cobalt : color.black,
            fontFamily: isCurrent ? fontFamily.bold : fontFamily.roboto,
          }}
        />
        <TouchableOpacity
          style={ARROW_BTN}
          onPress={() => moveUp(index)}
          disabled={index === 0}
          testID={`move-up-${index}`}>
          <RatsText
            translate={false}
            text="▲"
            style={{ color: index === 0 ? color.medium_grey : color.cobalt }}
          />
        </TouchableOpacity>
        <TouchableOpacity
          style={ARROW_BTN}
          onPress={() => moveDown(index)}
          disabled={index === orderedIds.length - 1}
          testID={`move-down-${index}`}>
          <RatsText
            translate={false}
            text="▼"
            style={{
              color:
                index === orderedIds.length - 1
                  ? color.medium_grey
                  : color.cobalt,
            }}
          />
        </TouchableOpacity>
      </View>
    );
  };

  if (rotationLoading || guestsLoading) {
    return <RatsLoadingIndicator />;
  }

  const choreOptions = house?.chores ? Object.keys(house.chores) : [];

  return (
    <View style={{ flex: 1, backgroundColor: color.light_grey }}>
      <ScreenHeader header="Chore Rotation" />

      {/* Chore selector */}
      <View style={[CARD_STYLE, { padding: normalize(16), marginBottom: 2 }]}>
        <RatsText
          translate={false}
          text="Chore to rotate:"
          style={{
            fontSize: fontSize.regular,
            color: color.dark_grey,
            marginBottom: normalize(8),
          }}
        />
        {choreOptions.map(chore => (
          <TouchableOpacity
            key={chore}
            onPress={() => setSelectedChore(chore)}
            testID={`chore-option-${chore}`}
            style={{
              paddingVertical: normalize(6),
              paddingHorizontal: normalize(8),
              borderRadius: normalize(4),
              backgroundColor:
                selectedChore === chore ? color.baby_blue : color.light_grey,
              marginBottom: normalize(4),
            }}>
            <RatsText
              translate={false}
              text={chore}
              style={{
                fontSize: fontSize.medium,
                color: selectedChore === chore ? color.cobalt : color.black,
                fontFamily:
                  selectedChore === chore ? fontFamily.bold : fontFamily.roboto,
              }}
            />
          </TouchableOpacity>
        ))}
      </View>

      {/* Resident order */}
      <View
        style={[
          CARD_STYLE,
          {
            paddingVertical: normalize(10),
            paddingHorizontal: normalize(16),
            marginBottom: 2,
          },
        ]}>
        <RatsText
          translate={false}
          text="Rotation order (top = first):"
          style={{ fontSize: fontSize.regular, color: color.dark_grey }}
        />
      </View>

      <FlatList
        testID="rotation-list"
        data={orderedIds}
        keyExtractor={id => id}
        renderItem={renderItem}
        scrollEnabled={true}
        contentContainerStyle={{ flexGrow: 1 }}
      />

      {/* Action buttons */}
      <View style={[CARD_STYLE, { padding: normalize(16), marginTop: 'auto' }]}>
        <RatsButton
          onPress={handleSave}
          title="Save Order"
          containerStyle={[SAVE_BUTTON, { marginBottom: normalize(12) }]}
          testID="save-rotation-button"
        />
        <RatsButton
          onPress={handleAdvanceNow}
          title="Advance Rotation Now"
          containerStyle={SAVE_BUTTON}
          testID="advance-rotation-button"
        />
      </View>
    </View>
  );
};

export default ChoreRotationSetupScreen;
```

### Task 7.2 — Create test for `ChoreRotationSetupScreen`

**File:** `src/screens/HouseSettings/__tests__/ChoreRotationSetupScreen.test.tsx`

- [ ] Create test file
- [ ] Mock `useSelectedHouse`, `useGuests`, all rotation queries, and firebase-setup
- [ ] Cover: renders chore options, renders resident list, move-up/down reorders list, save calls `setRotationOrder`, advance shows confirmation alert

```typescript
// src/screens/HouseSettings/__tests__/ChoreRotationSetupScreen.test.tsx

const _mockUseSelectedHouse = jest.fn(() => ({
  house: {
    id: 'house1',
    chores: { Kitchen: { name: 'Kitchen', description: 'Clean kitchen.' } },
  },
  houseId: 'house1',
}));
jest.mock('../../../hooks/useSelectedHouse', () => ({
  useSelectedHouse: () => _mockUseSelectedHouse(),
}));

jest.mock('../../../state/queries', () => ({
  useGuests: jest.fn(() => ({
    data: {
      guest1: {
        id: 'guest1',
        firstName: 'Alice',
        lastName: 'A',
        status: 'active',
      },
      guest2: {
        id: 'guest2',
        firstName: 'Bob',
        lastName: 'B',
        status: 'active',
      },
    },
    isLoading: false,
  })),
}));

const _mockSetRotation = {
  mutateAsync: jest.fn(() => Promise.resolve()),
  isPending: false,
};
const _mockAdvance = { mutate: jest.fn(), isPending: false };

jest.mock('../../../state/queries/choreRotationQueries', () => ({
  useChoreRotation: jest.fn(() => ({
    data: {
      choreName: 'Kitchen',
      guestIds: ['guest1', 'guest2'],
      currentIndex: 0,
      lastRotatedAt: '2026-05-17',
    },
    isLoading: false,
  })),
  useSetRotationOrder: jest.fn(() => _mockSetRotation),
  useAdvanceRotation: jest.fn(() => _mockAdvance),
}));

jest.mock('../../../../firebase-setup', () => ({
  firestore: { collection: jest.fn() },
  auth: { currentUser: { uid: 'user1' } },
}));

jest.mock('@react-navigation/native-stack', () => ({}));
jest.mock('@react-navigation/native', () => ({
  useFocusEffect: jest.fn(),
  useNavigation: () => ({ navigate: jest.fn(), goBack: jest.fn() }),
}));

import React from 'react';
import { render, fireEvent, waitFor } from '@testing-library/react-native';
import { Alert } from 'react-native';
import ChoreRotationSetupScreen from '../ChoreRotationSetupScreen';

const navigation = { navigate: jest.fn(), goBack: jest.fn() } as any;

afterEach(() => jest.clearAllMocks());

describe('ChoreRotationSetupScreen', () => {
  it('renders the chore option', () => {
    const { getByTestId } = render(
      <ChoreRotationSetupScreen navigation={navigation} />,
    );
    expect(getByTestId('chore-option-Kitchen')).toBeTruthy();
  });

  it('renders both resident rows', () => {
    const { getByTestId } = render(
      <ChoreRotationSetupScreen navigation={navigation} />,
    );
    expect(getByTestId('rotation-row-0')).toBeTruthy();
    expect(getByTestId('rotation-row-1')).toBeTruthy();
  });

  it('move-up button at index 1 shifts resident up', () => {
    const { getByTestId, getByText } = render(
      <ChoreRotationSetupScreen navigation={navigation} />,
    );
    fireEvent.press(getByTestId('move-up-1'));
    // After moving up, Bob (index 1) should become index 0
    expect(getByText(/1\. Bob/)).toBeTruthy();
  });

  it('calls setRotationOrder on save', async () => {
    const { getByTestId } = render(
      <ChoreRotationSetupScreen navigation={navigation} />,
    );
    fireEvent.press(getByTestId('save-rotation-button'));
    await waitFor(() => {
      expect(_mockSetRotation.mutateAsync).toHaveBeenCalledWith({
        choreName: 'Kitchen',
        guestIds: expect.any(Array),
      });
    });
  });

  it('shows confirmation alert before advancing', () => {
    const alertSpy = jest.spyOn(Alert, 'alert');
    const { getByTestId } = render(
      <ChoreRotationSetupScreen navigation={navigation} />,
    );
    fireEvent.press(getByTestId('advance-rotation-button'));
    expect(alertSpy).toHaveBeenCalledWith(
      'Advance Rotation',
      expect.any(String),
      expect.any(Array),
    );
    alertSpy.mockRestore();
  });
});
```

**Test command:**

```bash
yarn test src/screens/HouseSettings/__tests__/ChoreRotationSetupScreen.test.tsx --no-coverage
```

---

## Phase 8 — Navigation wiring

### Task 8.1 — Add `ChoreRotationSetup` route to `src/navigation/types.ts`

- [ ] Add enum value and param list entry

```typescript
// In the Routes enum, add after DrugTestHistory:
ChoreRotationSetup = 'choreRotationSetup',

// In RootStackParamList, add:
[Routes.ChoreRotationSetup]: undefined;
```

### Task 8.2 — Register screen in `src/navigation/navigators.tsx`

- [ ] Import `ChoreRotationSetupScreen`
- [ ] Add `<RootStack.Screen>` entry

```typescript
// Add import:
import ChoreRotationSetupScreen from '../screens/HouseSettings/ChoreRotationSetupScreen';

// Add screen inside RootStack.Navigator (near the other HouseSettings screens):
<RootStack.Screen
  name={Routes.ChoreRotationSetup}
  component={ChoreRotationSetupScreen}
  options={{ headerShown: false }}
/>;
```

### Task 8.3 — Add "Chore Rotation" entry to `HouseSettings.tsx`

- [ ] Add `choreRotation` key to the `SETTINGS` map and its dependency array

```typescript
// Add to SETTINGS (inside useMemo body):
choreRotation: {
  action: () => navigation.navigate(Routes.ChoreRotationSetup),
  label: 'Chore Rotation',
  description: 'Set the weekly chore rotation order',
  iconName: 'sync-alt',
  color: color.medium_grey,
},

// Add Routes.ChoreRotationSetup to the Routes import (already imported).
// Add navigation to the SETTINGS useMemo dependency array (already present).
```

---

## Phase 9 — Admin photo view in `HouseChoreActivity`

### Task 9.1 — Show photo evidence badge on the admin chore overview

**File:** `src/screens/HouseChoreOverview/HouseChoreActivity/HouseChoreActivity.tsx`

The current `GuestChoreRow` shows completion based on `weekSummary.stats.choresCompleted`. We need to also surface whether a photo was attached. The simplest MVP approach: fetch house activities filtered by `type: CHORE` for the current week and match by `guestId` to get `data.photoUrl`.

- [ ] Import `useHouseActivities` from `../../../state/queries/activityQueries`
- [ ] In `GuestChoreRow`, accept an optional `photoUrl: string | undefined` prop
- [ ] In the parent `HouseChoreActivity`, call `useHouseActivities(house.id)` and find the chore activity for each guest for the current week to extract `photoUrl`
- [ ] Render a small "Photo" badge next to the Done badge when `photoUrl` is present

```typescript
// In HouseChoreActivity.tsx — augmented GuestChoreRow props:
interface GuestChoreRowProps {
  guest: Guest;
  houseId: string;
  weekStart: string;
  photoUrl?: string; // NEW
}

// Inside GuestChoreRow, after the COMPLETE_BADGE, add:
{
  photoUrl ? (
    <View style={PHOTO_BADGE}>
      <RatsText
        translate={false}
        text="Photo"
        style={{ fontSize: fontSize.extraSmall, color: color.cobalt }}
      />
    </View>
  ) : null;
}

// Add PHOTO_BADGE style:
const PHOTO_BADGE: ViewStyle = {
  backgroundColor: color.baby_blue,
  borderRadius: normalize(12),
  paddingHorizontal: normalize(8),
  paddingVertical: normalize(3),
  marginLeft: normalize(4),
  alignSelf: 'center',
};

// In HouseChoreActivity, compute photoUrls from house activities:
const { data: houseActivities } = useHouseActivities(
  house?.id ?? '',
  200,
  !!house?.id,
);

const chorePhotoByGuestId = useMemo<Record<string, string | undefined>>(() => {
  if (!houseActivities) return {};
  const result: Record<string, string | undefined> = {};
  for (const act of houseActivities) {
    if (
      act.type === ActivityType.CHORE &&
      act.data &&
      'photoUrl' in act.data &&
      (act.data as any).photoUrl
    ) {
      result[act.guestId] = (act.data as any).photoUrl as string;
    }
  }
  return result;
}, [houseActivities]);

// Pass to renderGuest:
const renderGuest = (info: ListRenderItemInfo<Guest>) => (
  <GuestChoreRow
    guest={info.item}
    houseId={house.id}
    weekStart={weekStart}
    photoUrl={chorePhotoByGuestId[info.item.id]}
  />
);
```

- [ ] Add `ActivityType` import: `import { ActivityType } from '../../../entities/ActivityModel';`
- [ ] Add `useMemo` import from `react`
- [ ] Create `src/screens/HouseChoreOverview/HouseChoreActivity/__tests__/HouseChoreActivity.test.tsx` if it does not exist, or add a test case for the photo badge rendering

---

## Phase 10 — Firestore Security Rules

### Task 10.1 — Add `choreRotations` collection rules to `firebase/firestore.rules`

- [ ] Add the following block inside `match /databases/{database}/documents { ... }` before the closing brace

```
    // Chore rotations: one document per house, readable by members, writable by admins only
    match /choreRotations/{houseId} {
      allow read: if isGuestOrAdmin([houseId]);
      allow create, update: if isAdmin([houseId]);
      allow delete: if isAdmin([houseId]);
    }
```

---

## Phase 11 — Firebase Storage Rules (optional hardening)

**File:** `firebase/storage.rules`

- [ ] Review existing storage rules
- [ ] Add a rule to allow guests to write to `houses/{houseId}/chore-evidence/{activityId}` but only admins to delete

```
match /houses/{houseId}/chore-evidence/{activityId} {
  allow read: if request.auth != null;
  allow write: if request.auth != null && request.auth.token.guest[houseId] != null
               || request.auth.token.admin[houseId] != null;
  allow delete: if request.auth != null && request.auth.token.admin[houseId] != null;
}
```

---

## Phase 12 — Export new queries from the barrel

### Task 12.1 — Add exports to `src/state/queries/index.ts`

- [ ] Open `src/state/queries/index.ts`
- [ ] Export from `./choreRotationQueries`

```typescript
export * from './choreRotationQueries';
```

---

## Complete File Checklist

| Status | File                                                                                      | Action                                                                              |
| ------ | ----------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------- |
| - [ ]  | `src/entities/ActivityModel.ts`                                                           | Add `photoUrl?: string` to `ChoreActivityData`; update `ActivityDataFactory.chore`  |
| - [ ]  | `src/entities/Chore.tsx`                                                                  | Add `ChoreRotation` interface                                                       |
| - [ ]  | `src/services/storage.tsx`                                                                | Add `uploadChoreEvidencePhoto`                                                      |
| - [ ]  | `src/services/choreRotation.ts`                                                           | CREATE — `getRotation`, `advanceRotation`, `setRotationOrder`, `getCurrentAssignee` |
| - [ ]  | `src/services/__tests__/choreRotation.test.ts`                                            | CREATE — full unit test suite                                                       |
| - [ ]  | `src/state/queries/choreRotationQueries.ts`                                               | CREATE — `useChoreRotation`, `useAdvanceRotation`, `useSetRotationOrder`            |
| - [ ]  | `src/state/queries/__tests__/choreRotationQueries.test.ts`                                | CREATE — full hook test suite                                                       |
| - [ ]  | `src/state/queries/index.ts`                                                              | Add `export * from './choreRotationQueries'`                                        |
| - [ ]  | `src/hooks/useAutoAdvanceRotation.ts`                                                     | CREATE — weekly auto-advance on app load                                            |
| - [ ]  | `src/screens/GuestChoreOverview/GuestChoreSummary/GuestChoreSummary.tsx`                  | Modify — photo picker + activity logging in `handleCompleteChore`                   |
| - [ ]  | `src/screens/GuestChoreOverview/GuestChoreSummary/__tests__/GuestChoreSummary.test.tsx`   | CREATE or MODIFY — photo evidence test cases                                        |
| - [ ]  | `src/screens/HouseSettings/ChoreRotationSetupScreen.tsx`                                  | CREATE — admin rotation order UI                                                    |
| - [ ]  | `src/screens/HouseSettings/__tests__/ChoreRotationSetupScreen.test.tsx`                   | CREATE — render + interaction tests                                                 |
| - [ ]  | `src/screens/HouseSettings/HouseSettings.tsx`                                             | Add "Chore Rotation" section to SETTINGS map                                        |
| - [ ]  | `src/screens/HouseChoreOverview/HouseChoreActivity/HouseChoreActivity.tsx`                | Add photo badge + `useHouseActivities` lookup                                       |
| - [ ]  | `src/screens/HouseChoreOverview/HouseChoreActivity/__tests__/HouseChoreActivity.test.tsx` | CREATE — render test including photo badge                                          |
| - [ ]  | `src/navigation/types.ts`                                                                 | Add `ChoreRotationSetup` to `Routes` enum and `RootStackParamList`                  |
| - [ ]  | `src/navigation/navigators.tsx`                                                           | Import screen + register `<RootStack.Screen>`                                       |
| - [ ]  | `firebase/firestore.rules`                                                                | Add `choreRotations/{houseId}` rules block                                          |
| - [ ]  | `firebase/storage.rules`                                                                  | Add `chore-evidence` path rule                                                      |

---

## All Test Commands (run in order after implementation)

```bash
# Phase 3 — service
yarn test src/services/__tests__/choreRotation.test.ts --no-coverage

# Phase 4 — queries
yarn test src/state/queries/__tests__/choreRotationQueries.test.ts --no-coverage

# Phase 6 — guest chore summary photo flow
yarn test src/screens/GuestChoreOverview/GuestChoreSummary/__tests__/GuestChoreSummary.test.tsx --no-coverage

# Phase 7 — admin rotation setup screen
yarn test src/screens/HouseSettings/__tests__/ChoreRotationSetupScreen.test.tsx --no-coverage

# Phase 9 — house chore overview
yarn test src/screens/HouseChoreOverview/HouseChoreActivity/__tests__/HouseChoreActivity.test.tsx --no-coverage

# Regression — existing activity query tests must still pass
yarn test src/state/queries/__tests__/activityQueries.test.ts --no-coverage

# Regression — house settings must still render all sections
yarn test src/screens/HouseSettings/__tests__/HouseSettings.test.tsx --no-coverage

# TypeScript check
yarn tsc --noEmit
```

---

## Git Commit Sequence

```bash
# After Phase 1–2 (data model + storage)
git commit -m "feat(chores): extend ChoreActivityData with photoUrl; add ChoreRotation entity; add uploadChoreEvidencePhoto"

# After Phase 3–4 (service + queries)
git commit -m "feat(chores): add choreRotation service and React Query hooks"

# After Phase 5 (auto-advance hook)
git commit -m "feat(chores): add useAutoAdvanceRotation hook for client-side weekly rotation"

# After Phase 6 (guest photo evidence)
git commit -m "feat(chores): add optional photo evidence to chore completion flow"

# After Phase 7–8 (admin setup screen + navigation)
git commit -m "feat(chores): add ChoreRotationSetupScreen and wire into HouseSettings navigation"

# After Phase 9 (admin photo badge)
git commit -m "feat(chores): show photo evidence badge on admin chore overview"

# After Phase 10–11 (security rules)
git commit -m "chore(rules): add choreRotations and chore-evidence storage security rules"
```

---

## Follow-on / Out of Scope for MVP

- **Cloud Function** for Sunday rotation advance (replace client-side check with a scheduled `pubsub.schedule('every sunday 08:00').onRun(...)` function that calls `advanceRotation` for all active houses)
- **Per-chore rotation**: extend `choreRotations` to support a `rotations: Record<choreName, {guestIds, currentIndex, lastRotatedAt}>` shape so each chore has its own independent schedule
- **Photo lightbox**: tap the "Photo" badge in `HouseChoreActivity` to open the full-resolution image
- **Resident notification**: push notification to the next resident when the rotation advances (use existing `notifications` service pattern)
