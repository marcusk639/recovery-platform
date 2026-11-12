/**
 * invitations.ts against the normalized Firebase operation log.
 *
 * Characterization for the React Native 0.88 upgrade (plan Task 10 Step 1).
 * This file stays byte-identical through the Task 10 migration (group 10c): a
 * mapping mistake in the rewrite fails here instead of being copied into an
 * edited expectation. Assertions are on outcomes and log entries only, never
 * on mock call chains or snapshot shapes.
 */
jest.mock('../../../firebase-setup', () => require('../../../__mocks__/firebase-modular/setup'));
jest.mock('@react-native-firebase/functions', () =>
  require('../../../__mocks__/firebase-modular/functions'),
);

import { failNext, getOpLog, resetOpLog, seedCall } from '../../../__mocks__/firebase-modular/log';
import { createInvitation, peekInvitation, redeemInvitation } from '../invitations';

beforeEach(() => {
  resetOpLog();
});

describe('createInvitation', () => {
  it('calls createInvitation with the input and returns the response data', async () => {
    seedCall('createInvitation', { token: 't1' });

    const result = await createInvitation({
      email: 'g@example.com',
      houseId: 'h1',
      role: 'guest',
      initialPhase: 'P1',
    });

    expect(result).toEqual({ token: 't1' });
    expect(getOpLog()).toEqual([
      {
        op: 'call',
        path: 'createInvitation',
        data: { email: 'g@example.com', houseId: 'h1', role: 'guest', initialPhase: 'P1' },
      },
    ]);
  });

  it('propagates a callable failure', async () => {
    failNext('call', new Error('permission-denied'), 'createInvitation');

    await expect(
      createInvitation({ email: 'a@example.com', houseId: 'h1', role: 'admin' }),
    ).rejects.toThrow('permission-denied');
  });
});

describe('peekInvitation', () => {
  it('calls peekInvitation with { token } and returns the response data', async () => {
    const peeked = {
      houseId: 'h1',
      role: 'admin',
      invitedEmail: 'a@example.com',
      expiresAt: '2026-12-01T00:00:00.000Z',
    };
    seedCall('peekInvitation', peeked);

    expect(await peekInvitation('t1')).toEqual(peeked);
    expect(getOpLog()).toEqual([{ op: 'call', path: 'peekInvitation', data: { token: 't1' } }]);
  });

  it('propagates a callable failure', async () => {
    failNext('call', new Error('not-found'), 'peekInvitation');

    await expect(peekInvitation('t1')).rejects.toThrow('not-found');
  });
});

describe('redeemInvitation', () => {
  it('calls redeemInvitation with { token } and returns the response data', async () => {
    seedCall('redeemInvitation', { houseId: 'h1', role: 'guest' });

    expect(await redeemInvitation('t1')).toEqual({ houseId: 'h1', role: 'guest' });
    expect(getOpLog()).toEqual([{ op: 'call', path: 'redeemInvitation', data: { token: 't1' } }]);
  });

  it('propagates a callable failure', async () => {
    failNext('call', new Error('already-exists'), 'redeemInvitation');

    await expect(redeemInvitation('t1')).rejects.toThrow('already-exists');
  });
});
