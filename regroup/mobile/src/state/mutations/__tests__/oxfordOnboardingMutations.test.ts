/**
 * Tests for completeOxfordOnboarding mutation.
 *
 * Covers:
 *  - Mutation uses the firestore singleton from firebase-setup (regression: it
 *    was previously calling firestore() as a factory, creating a fresh instance
 *    that bypassed the singleton's `ignoreUndefinedProperties: true` setting).
 *  - Officers, the first business meeting, and the house update all go through
 *    a single batch.commit().
 *  - The first meeting uses a deterministic doc ID (${houseId}_onboarding) so
 *    re-running onboarding overwrites rather than creating duplicate docs.
 *  - The house update sets oxfordOnboardingComplete = true so the redirect
 *    guard on OxfordDashboard stops firing.
 *
 * Mocking strategy:
 *  Module-load code in services/admin.tsx and services/house.tsx calls
 *  firestore.collection() at import time. So the mock factory must return a
 *  fully-functional firestore object the moment `import` happens. We attach
 *  jest.fn() instances to the firestore mock object itself, then read them
 *  back via `jest.requireMock` inside each test — this avoids the hoisting
 *  problem where consts defined in the test file body are still in their TDZ
 *  when the mock factory is first invoked during import resolution.
 */

jest.mock('../../../../firebase-setup', () => {
  const batchSet = jest.fn();
  const batchUpdate = jest.fn();
  const batchCommit = jest.fn(() => Promise.resolve());
  const batch = jest.fn(() => ({
    set: batchSet,
    update: batchUpdate,
    commit: batchCommit,
  }));

  // Each collection() call returns an object with a .doc() that returns
  // another object exposing .collection() — so the test mock supports the
  // subcollection chain houses/{id}/officers/{role}. Both the collection and
  // doc spies record their full path string for assertion convenience.
  const collection = jest.fn();
  const doc = jest.fn();
  const makeCollection = (path: string) => {
    collection(path);
    return {
      __collection: path,
      doc: (id: string) => {
        const docPath = `${path}/${id}`;
        doc(docPath);
        return {
          __ref: docPath,
          collection: (subName: string) =>
            makeCollection(`${docPath}/${subName}`),
        };
      },
    };
  };

  return {
    firestore: {
      batch,
      collection: (name: string) => makeCollection(name),
      // Expose the spies on the firestore object itself so the test file
      // can grab them via requireMock without re-defining them.
      __mocks: { batch, collection, doc, batchSet, batchUpdate, batchCommit },
    },
  };
});

jest.mock('@react-native-firebase/firestore', () => ({
  __esModule: true,
  default: {
    FieldValue: { serverTimestamp: jest.fn(() => '__SERVER_TIMESTAMP__') },
  },
}));

jest.mock('@tanstack/react-query', () => ({
  useMutation: jest.fn(),
  useQueryClient: jest.fn(),
}));

import { useMutation } from '@tanstack/react-query';
import type { OxfordOnboardingPayload } from '../oxfordOnboardingMutations';
import { useCompleteOxfordOnboarding } from '../oxfordOnboardingMutations';

type MutationFn = (payload: OxfordOnboardingPayload) => Promise<void>;

// Grab the mock spies that were created inside the mock factory.
const firebaseSetupMock = jest.requireMock('../../../../firebase-setup') as {
  firestore: {
    __mocks: {
      batch: jest.Mock;
      collection: jest.Mock;
      doc: jest.Mock;
      batchSet: jest.Mock;
      batchUpdate: jest.Mock;
      batchCommit: jest.Mock;
    };
  };
};

const firestoreMock = jest.requireMock('@react-native-firebase/firestore') as {
  default: { FieldValue: { serverTimestamp: jest.Mock } };
};

function getMutationFn(): MutationFn {
  // useCompleteOxfordOnboarding passes completeOxfordOnboarding (an internal
  // function not exported on its own) to useMutation({ mutationFn }). Calling
  // the hook lets us read the function out of the mocked useMutation call.
  (useMutation as jest.Mock).mockClear();
  useCompleteOxfordOnboarding();
  const lastCall = (useMutation as jest.Mock).mock.calls.at(-1);
  return lastCall[0].mutationFn as MutationFn;
}

beforeEach(() => {
  const m = firebaseSetupMock.firestore.__mocks;
  m.batch.mockClear();
  m.collection.mockClear();
  m.doc.mockClear();
  m.batchSet.mockClear();
  m.batchUpdate.mockClear();
  m.batchCommit.mockClear();
  firestoreMock.default.FieldValue.serverTimestamp.mockClear();
});

describe('completeOxfordOnboarding', () => {
  const payload: OxfordOnboardingPayload = {
    houseId: 'house-abc',
    officers: [
      { role: 'president', name: 'Alice' },
      { role: 'treasurer', name: 'Bob' },
    ],
    firstMeeting: { scheduledDate: '2026-06-01T19:00' },
    eesMonthlyAmount: 50,
  };

  it('opens exactly one batch and commits it once', async () => {
    const fn = getMutationFn();
    await fn(payload);

    const m = firebaseSetupMock.firestore.__mocks;
    expect(m.batch).toHaveBeenCalledTimes(1);
    expect(m.batchCommit).toHaveBeenCalledTimes(1);
  });

  it('uses the firestore singleton (regression: never invokes firestore as a factory)', async () => {
    // The mock at module top binds `firestore.batch` and `firestore.collection`
    // as plain methods on a plain object. If the source ever reverts to calling
    // `firestore()` as a function, that `undefined()` call would throw before
    // reaching the batch — making this test fail loudly.
    const fn = getMutationFn();
    await expect(fn(payload)).resolves.not.toThrow();
    expect(firebaseSetupMock.firestore.__mocks.batch).toHaveBeenCalled();
  });

  it('writes each officer to houses/{houseId}/officers/{role} (subcollection, not flat)', async () => {
    const fn = getMutationFn();
    await fn(payload);

    const m = firebaseSetupMock.firestore.__mocks;

    // Subcollection chain: houses → doc(houseId) → officers → doc(role).
    // The flat top-level path 'officers/house-abc_president' from the prior
    // implementation is forbidden because firestore.rules only protect the
    // subcollection path. See .full-review [A1].
    expect(m.collection).toHaveBeenCalledWith('houses');
    expect(m.collection).toHaveBeenCalledWith('houses/house-abc/officers');
    expect(m.doc).toHaveBeenCalledWith('houses/house-abc/officers/president');
    expect(m.doc).toHaveBeenCalledWith('houses/house-abc/officers/treasurer');

    // Regression: the prior flat path must NOT appear in any doc call.
    expect(m.doc).not.toHaveBeenCalledWith('officers/house-abc_president');
    expect(m.doc).not.toHaveBeenCalledWith('officers/house-abc_treasurer');

    // batch.set called twice for officers + once for the meeting = 3 total
    expect(m.batchSet).toHaveBeenCalledTimes(3);

    const presidentCall = m.batchSet.mock.calls.find(
      ([ref]) => ref.__ref === 'houses/house-abc/officers/president',
    );
    expect(presidentCall).toBeDefined();
    expect(presidentCall![1]).toEqual({
      role: 'president',
      name: 'Alice',
      houseId: 'house-abc',
      isActive: true,
      createdAt: '__SERVER_TIMESTAMP__',
    });
  });

  it('writes the first meeting to houses/{houseId}/business-meetings/onboarding (subcollection)', async () => {
    const fn = getMutationFn();
    await fn(payload);

    const m = firebaseSetupMock.firestore.__mocks;

    // Subcollection path under the house — not the flat top-level collection.
    expect(m.collection).toHaveBeenCalledWith(
      'houses/house-abc/business-meetings',
    );
    expect(m.doc).toHaveBeenCalledWith(
      'houses/house-abc/business-meetings/onboarding',
    );

    // Regression: prior flat path must not appear.
    expect(m.doc).not.toHaveBeenCalledWith(
      'business-meetings/house-abc_onboarding',
    );

    const meetingCall = m.batchSet.mock.calls.find(
      ([ref]) => ref.__ref === 'houses/house-abc/business-meetings/onboarding',
    );
    expect(meetingCall).toBeDefined();
    expect(meetingCall![1]).toMatchObject({
      houseId: 'house-abc',
      scheduledDate: '2026-06-01T19:00',
      createdBy: 'onboarding',
      quorumMet: false,
    });
  });

  it('updates the house with eesMonthlyAmount + oxfordOnboardingComplete=true', async () => {
    const fn = getMutationFn();
    await fn(payload);

    const m = firebaseSetupMock.firestore.__mocks;
    expect(m.collection).toHaveBeenCalledWith('houses');
    expect(m.batchUpdate).toHaveBeenCalledTimes(1);

    const [houseRef, houseData] = m.batchUpdate.mock.calls[0];
    expect(houseRef.__ref).toBe('houses/house-abc');
    expect(houseData).toEqual({
      eesMonthlyAmount: 50,
      oxfordOnboardingComplete: true,
    });
  });

  it('uses FieldValue.serverTimestamp() for all createdAt fields', async () => {
    const fn = getMutationFn();
    await fn(payload);

    // 2 officers + 1 meeting = 3 createdAt assignments
    expect(
      firestoreMock.default.FieldValue.serverTimestamp,
    ).toHaveBeenCalledTimes(3);
  });
});
