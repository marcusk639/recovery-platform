/**
 * addMessagingToken (services/messagingToken.ts) against the Firebase operation log.
 *
 * The server pushes to every token in users/{id}.messagingToken, and each of
 * the user's devices adds its own. Writing the whole array from the app's copy
 * of the user drops any token another device added since that copy was read,
 * so that device stops getting pushes. The write must add to the stored array.
 */
jest.mock('../../../firebase-setup', () => require('../../../__mocks__/firebase-modular/setup'));
jest.mock('@react-native-firebase/firestore', () =>
  require('../../../__mocks__/firebase-modular/firestore'),
);
jest.mock('@react-native-firebase/functions', () =>
  require('../../../__mocks__/firebase-modular/functions'),
);
jest.mock('@react-native-firebase/auth', () => require('../../../__mocks__/firebase-modular/auth'));
jest.mock('@react-native-firebase/storage', () =>
  require('../../../__mocks__/firebase-modular/storage'),
);
jest.mock('../../../google/timezone', () => ({ getTimezone: jest.fn(async () => 'UTC') }));
jest.mock('../../util/logging', () => ({ logException: jest.fn() }));

import {
  getOpLog,
  readDoc,
  resetOpLog,
  seedDoc,
} from '../../../__mocks__/firebase-modular/log';
import { addMessagingToken } from '../messagingToken';

beforeEach(() => {
  resetOpLog();
});

describe('addMessagingToken', () => {
  it('adds the token to users/{id}.messagingToken with arrayUnion', async () => {
    seedDoc('users/u1', { id: 'u1', messagingToken: [] });

    await addMessagingToken('u1', 'tok-a');

    expect(getOpLog()).toEqual([
      {
        op: 'update',
        path: 'users/u1',
        data: { messagingToken: { __fv: 'arrayUnion', items: ['tok-a'] } },
      },
    ]);
    expect(readDoc('users/u1')?.messagingToken).toEqual(['tok-a']);
  });

  it("keeps a token another device stored after this device read the user", async () => {
    seedDoc('users/u1', { id: 'u1', messagingToken: ['tok-other-device'] });

    await addMessagingToken('u1', 'tok-this-device');

    expect(readDoc('users/u1')?.messagingToken).toEqual([
      'tok-other-device',
      'tok-this-device',
    ]);
  });

  it('stores a token only once when two saves of it land', async () => {
    seedDoc('users/u1', { id: 'u1', messagingToken: [] });

    await Promise.all([addMessagingToken('u1', 'tok-a'), addMessagingToken('u1', 'tok-a')]);

    expect(readDoc('users/u1')?.messagingToken).toEqual(['tok-a']);
  });
});
