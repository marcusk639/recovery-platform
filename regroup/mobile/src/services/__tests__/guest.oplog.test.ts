/**
 * guest.tsx against the normalized Firebase operation log.
 *
 * Characterization for the React Native 0.88 upgrade (plan Task 2). This file
 * stays byte-identical from Task 2 to the end of Task 10, the modular Firebase
 * migration: a mapping mistake in the rewrite fails here instead of being
 * copied into an edited expectation. Assertions are on outcomes and log
 * entries only, never on mock call chains or snapshot shapes.
 */
jest.mock('../../../firebase-setup', () => require('../../../__mocks__/firebase-modular/setup'));
jest.mock('@react-native-firebase/firestore', () =>
  require('../../../__mocks__/firebase-modular/firestore'),
);
jest.mock('@react-native-firebase/functions', () =>
  require('../../../__mocks__/firebase-modular/functions'),
);

import {
  failNext,
  getOpLog,
  readDoc,
  resetOpLog,
  seedDoc,
} from '../../../__mocks__/firebase-modular/log';
import { createGuest, customizePhase, deleteGuest, dischargeGuest, updateGuest } from '../guest';

const ISO = expect.stringMatching(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);

function firestoreError(code: string): Error {
  return Object.assign(new Error(`[firestore/${code}]`), { code });
}

beforeEach(() => {
  resetOpLog();
});

describe('updateGuest', () => {
  it('throws when the guest does not exist and writes nothing', async () => {
    await expect(updateGuest({}, { id: 'missing', status: 'active' } as any)).rejects.toThrow(
      'Guest missing not found',
    );

    expect(getOpLog()).toEqual([{ op: 'tx.get', path: 'guests/missing' }]);
  });

  it('reads then updates in one transaction, version = current + 1', async () => {
    seedDoc('guests/g1', { id: 'g1', houseId: 'h1', rentOwed: 500, version: 4 });

    const result = await updateGuest({}, { id: 'g1', status: 'active' } as any);

    const merged = {
      id: 'g1',
      houseId: 'h1',
      rentOwed: 500,
      version: 5,
      status: 'active',
      isAdmin: false,
      infoEntered: false,
      hasJob: false,
      updatedAt: ISO,
    };
    expect(result).toEqual(merged);
    expect(getOpLog()).toEqual([
      { op: 'tx.get', path: 'guests/g1' },
      { op: 'tx.update', path: 'guests/g1', data: merged },
    ]);
    expect(readDoc('guests/g1')).toEqual(expect.objectContaining({ version: 5, status: 'active' }));
  });

  it('starts version at 1 when the stored guest has none', async () => {
    seedDoc('guests/g1', { id: 'g1' });

    const result = await updateGuest({}, { id: 'g1' } as any);

    expect(result.version).toBe(1);
  });

  it('keeps the higher rentOwed unless the caller owns the field', async () => {
    seedDoc('guests/g1', { id: 'g1', rentOwed: 500 });
    expect((await updateGuest({}, { id: 'g1', rentOwed: 300 } as any)).rentOwed).toBe(500);

    seedDoc('guests/g2', { id: 'g2', rentOwed: 500 });
    const lowered = await updateGuest({}, { id: 'g2', rentOwed: 300 } as any, 3, ['rentOwed']);
    expect(lowered.rentOwed).toBe(300);
    expect(readDoc('guests/g2')?.rentOwed).toBe(300);
  });

  it('unions supporters and ORs the boolean flags with the stored guest', async () => {
    seedDoc('guests/g1', { id: 'g1', supporters: ['a'], isAdmin: true });

    const result = await updateGuest({}, { id: 'g1', supporters: ['b'], isAdmin: false } as any);

    expect(result.supporters).toEqual(['a', 'b']);
    expect(result.isAdmin).toBe(true);
  });

  it('retries on aborted, then succeeds', async () => {
    seedDoc('guests/g1', { id: 'g1', version: 1 });
    failNext('tx.get', firestoreError('aborted'), 'guests/g1');

    const result = await updateGuest({}, { id: 'g1' } as any);

    expect(result.version).toBe(2);
    expect(getOpLog().map((e) => e.op)).toEqual(['tx.get', 'tx.get', 'tx.update']);
  });

  it('retries on failed-precondition, then succeeds', async () => {
    seedDoc('guests/g1', { id: 'g1', version: 1 });
    failNext('tx.get', firestoreError('failed-precondition'), 'guests/g1');

    await updateGuest({}, { id: 'g1' } as any);

    expect(getOpLog().map((e) => e.op)).toEqual(['tx.get', 'tx.get', 'tx.update']);
  });

  it('gives up after retryCount contention failures with the last error', async () => {
    seedDoc('guests/g1', { id: 'g1' });
    failNext('tx.get', firestoreError('aborted'), 'guests/g1');
    failNext('tx.get', firestoreError('aborted'), 'guests/g1');

    await expect(updateGuest({}, { id: 'g1' } as any, 2)).rejects.toMatchObject({
      code: 'aborted',
    });

    expect(getOpLog().map((e) => e.op)).toEqual(['tx.get', 'tx.get']);
  });

  it('does not retry other errors', async () => {
    seedDoc('guests/g1', { id: 'g1' });
    failNext('tx.get', firestoreError('permission-denied'), 'guests/g1');

    await expect(updateGuest({}, { id: 'g1' } as any)).rejects.toMatchObject({
      code: 'permission-denied',
    });

    expect(getOpLog()).toEqual([{ op: 'tx.get', path: 'guests/g1' }]);
  });

  it('refuses an update without an id before reading', async () => {
    await expect(updateGuest({}, {} as any)).rejects.toThrow('Guest must have an id for update');
    expect(getOpLog()).toEqual([]);
  });
});

describe('createGuest', () => {
  it('reads the house, then batches the capacity increment and the guest doc', async () => {
    seedDoc('houses/h1', { id: 'h1', currentCapacity: 2 });
    const guest = { id: 'g9', houseId: 'h1', status: 'active' } as any;

    await createGuest(guest);

    expect(getOpLog()).toEqual([
      { op: 'get', path: 'houses/h1' },
      { op: 'batch.update', path: 'houses/h1', data: { id: 'h1', currentCapacity: 3 } },
      { op: 'batch.set', path: 'guests/g9', data: guest },
      { op: 'batch.commit', path: '' },
    ]);
  });
});

describe('deleteGuest', () => {
  it('deletes, archives, frees the bed and decrements capacity in one batch', async () => {
    seedDoc('guests/g1', { id: 'g1' });
    seedDoc('houses/h1', { id: 'h1' });
    const guest = { id: 'g1', houseId: 'h1' } as any;
    const house = {
      id: 'h1',
      currentCapacity: 3,
      phases: { g1: { name: 'g1' }, other: { name: 'other' } },
      rooms: {
        r1: {
          id: 'r1',
          beds: { b1: { id: 'b1', guestId: 'g1' }, b2: { id: 'b2', guestId: 'g2' } },
        },
      },
    } as any;

    const result = await deleteGuest(guest, house);

    const updatedHouse = {
      id: 'h1',
      currentCapacity: 2,
      phases: { other: { name: 'other' } },
      rooms: {
        r1: {
          id: 'r1',
          beds: { b1: { id: 'b1', guestId: null }, b2: { id: 'b2', guestId: 'g2' } },
        },
      },
    };
    expect(result).toEqual({ house: updatedHouse, guest });
    expect(getOpLog()).toEqual([
      { op: 'batch.delete', path: 'guests/g1' },
      { op: 'batch.set', path: 'guest-archive/g1', data: guest },
      { op: 'batch.update', path: 'houses/h1', data: updatedHouse },
      { op: 'batch.commit', path: '' },
    ]);
    expect(readDoc('guests/g1')).toBeUndefined();
    expect(readDoc('guest-archive/g1')).toEqual(guest);
  });
});

describe('customizePhase', () => {
  it('updates only phase and updatedAt on the guest, and the whole house', async () => {
    seedDoc('guests/g1', { id: 'g1', firstName: 'kept' });
    seedDoc('houses/h1', { id: 'h1' });
    const house = { id: 'h1', phases: { p: { name: 'p' } } } as any;

    await customizePhase({ id: 'g1', phase: 'p', firstName: 'stale' } as any, house);

    expect(getOpLog()).toEqual([
      { op: 'batch.update', path: 'guests/g1', data: { phase: 'p', updatedAt: ISO } },
      { op: 'batch.update', path: 'houses/h1', data: house },
      { op: 'batch.commit', path: '' },
    ]);
    expect(readDoc('guests/g1')?.firstName).toBe('kept');
  });
});

describe('dischargeGuest', () => {
  it('marks the guest discharged, then revokes their house claims', async () => {
    seedDoc('guests/g1', { id: 'g1', userId: 'u1', status: 'active' });

    await dischargeGuest('g1', '2026-10-01', 'moved out');

    expect(getOpLog()).toEqual([
      {
        op: 'update',
        path: 'guests/g1',
        data: {
          status: 'discharged',
          moveOutDate: '2026-10-01',
          dischargeNotes: 'moved out',
          updatedAt: { __fv: 'serverTimestamp' },
        },
      },
      { op: 'get', path: 'guests/g1' },
      {
        op: 'call',
        path: 'removePrivilegesForGuests',
        data: {
          role: 'guest',
          guests: [
            {
              id: 'g1',
              userId: 'u1',
              status: 'discharged',
              moveOutDate: '2026-10-01',
              dischargeNotes: 'moved out',
              updatedAt: { __serverTimestamp: true },
            },
          ],
        },
      },
    ]);
  });

  it('omits dischargeNotes when there are none', async () => {
    seedDoc('guests/g1', { id: 'g1' });

    await dischargeGuest('g1', '2026-10-01');

    expect(getOpLog()[0].data).toEqual({
      status: 'discharged',
      moveOutDate: '2026-10-01',
      updatedAt: { __fv: 'serverTimestamp' },
    });
  });

  it('reports a failed discharge write without revoking anything', async () => {
    seedDoc('guests/g1', { id: 'g1' });
    failNext('update', firestoreError('unavailable'), 'guests/g1');

    await expect(dischargeGuest('g1', '2026-10-01')).rejects.toThrow(
      'Failed to discharge resident',
    );

    expect(getOpLog().map((e) => e.op)).toEqual(['update']);
  });

  it('reports a failed claim revocation after the discharge write', async () => {
    seedDoc('guests/g1', { id: 'g1' });
    failNext('call', new Error('internal'), 'removePrivilegesForGuests');

    await expect(dischargeGuest('g1', '2026-10-01')).rejects.toThrow(
      'house access could not be revoked',
    );

    expect(readDoc('guests/g1')?.status).toBe('discharged');
  });
});
