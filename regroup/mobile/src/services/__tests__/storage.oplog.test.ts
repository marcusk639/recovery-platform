/**
 * storage.tsx against the firebase-modular storage mock.
 *
 * Characterization for the React Native 0.88 upgrade (plan Task 10 Step 1).
 * This file stays byte-identical through the Task 10 migration (group 10d): a
 * mapping mistake in the rewrite fails here instead of being copied into an
 * edited expectation. Assertions are on outcomes and log entries only, never
 * on mock call chains or snapshot shapes. Storage is not part of the operation
 * log: each case pins the storage path through the outcome (the mock's
 * download URL is https://mock-storage/<path>, an upload resolves with
 * metadata.fullPath) and that no Firestore or callable op was made. Not
 * pinnable with the shared mock: the local file and upload metadata
 * (cacheControl) handed to putFile, which the mock ignores, and the
 * handleError mapping, since the mock never rejects a storage call.
 */
jest.mock('../../../firebase-setup', () => require('../../../__mocks__/firebase-modular/setup'));
jest.mock('@react-native-firebase/firestore', () =>
  require('../../../__mocks__/firebase-modular/firestore'),
);
jest.mock('@react-native-firebase/functions', () =>
  require('../../../__mocks__/firebase-modular/functions'),
);
jest.mock('@react-native-firebase/storage', () =>
  require('../../../__mocks__/firebase-modular/storage'),
);
jest.mock('../../util/logging', () => ({ logException: jest.fn() }));

import { getOpLog, resetOpLog } from '../../../__mocks__/firebase-modular/log';
import {
  getGuestAvatarDownloadURL,
  uploadChoreEvidencePhoto,
  uploadGuestAvatar,
  uploadHousePhoto,
  uploadPhoto,
  uploadUserAvatar,
} from '../storage';

const URL = 'https://mock-storage/';

beforeEach(() => {
  resetOpLog();
});

afterEach(() => {
  expect(getOpLog()).toEqual([]);
});

describe('getGuestAvatarDownloadURL', () => {
  it('defaults the file name to {guestId}_avatar', async () => {
    expect(await getGuestAvatarDownloadURL('h1', 'g1')).toBe(
      `${URL}houses/h1/guests/g1/avatar/g1_avatar`,
    );
  });

  it('uses the given file name', async () => {
    expect(await getGuestAvatarDownloadURL('h1', 'g1', 'pic.jpg')).toBe(
      `${URL}houses/h1/guests/g1/avatar/pic.jpg`,
    );
  });
});

describe('uploads', () => {
  it('uploadPhoto uploads to the given path and resolves with the task snapshot', async () => {
    expect(await uploadPhoto('houses/h1/x', '/tmp/x.jpg')).toEqual({
      state: 'success',
      metadata: { fullPath: 'houses/h1/x' },
    });
  });

  it('uploadUserAvatar uploads to users/{uid}/avatar', async () => {
    expect((await uploadUserAvatar('/tmp/a.jpg', 'u1')).metadata.fullPath).toBe('users/u1/avatar');
  });

  it('uploadGuestAvatar uploads to the guest avatar path', async () => {
    expect((await uploadGuestAvatar('/tmp/a.jpg', 'h1', 'g1')).metadata.fullPath).toBe(
      'houses/h1/guests/g1/avatar/g1_avatar',
    );
  });

  it('uploadChoreEvidencePhoto uploads and returns the evidence download URL', async () => {
    expect(await uploadChoreEvidencePhoto('/tmp/a.jpg', 'h1', 'a1')).toBe(
      `${URL}houses/h1/chore-evidence/a1`,
    );
  });

  it('uploadHousePhoto uploads to houses/{id}/photo and returns the house id and URL', async () => {
    expect(await uploadHousePhoto('/tmp/a.jpg', { id: 'h1' })).toEqual({
      houseId: 'h1',
      url: `${URL}houses/h1/photo`,
    });
  });
});
