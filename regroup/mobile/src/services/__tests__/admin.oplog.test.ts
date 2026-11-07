/**
 * admin.tsx against the normalized Firebase operation log.
 *
 * Characterization for the React Native 0.88 upgrade (plan Task 10 Step 1).
 * This file stays byte-identical through the Task 10 migration (group 10c): a
 * mapping mistake in the rewrite fails here instead of being copied into an
 * edited expectation. Assertions are on outcomes and log entries only, never
 * on mock call chains or snapshot shapes.
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
  seedCall,
  seedDoc,
} from '../../../__mocks__/firebase-modular/log';
import {
  createAdmin,
  createAdminId,
  createId,
  deleteAdmin,
  getAdmin,
  getAdmins,
  getHouseAdmins,
  sendAdminInvite,
  updateAdmin,
} from '../admin';
import Admin from '../../entities/Admin';
import { House } from '../../entities/House';

beforeEach(() => {
  resetOpLog();
});

describe('createAdminId / createId', () => {
  it('mints an auto id from admins without touching the log', () => {
    expect(createAdminId()).toBe('auto-1');
    expect(createId()).toBe('auto-2');
    expect(getOpLog()).toEqual([]);
  });
});

describe('getAdmin', () => {
  it('reads admins/{id} and returns its data', async () => {
    seedDoc('admins/a1', { id: 'a1', houseIds: ['h1'] });

    expect(await getAdmin('a1')).toEqual({ id: 'a1', houseIds: ['h1'] });
    expect(getOpLog()).toEqual([{ op: 'get', path: 'admins/a1' }]);
  });

  it('returns undefined for a missing admin', async () => {
    expect(await getAdmin('missing')).toBeUndefined();
    expect(getOpLog()).toEqual([{ op: 'get', path: 'admins/missing' }]);
  });
});

describe('createAdmin', () => {
  it('sets admins/{auto id} with the id filled in when none is given', async () => {
    const result = await createAdmin({ houseIds: ['h1'] } as unknown as Admin);

    expect(result).toEqual({ houseIds: ['h1'], id: 'auto-1' });
    expect(getOpLog()).toEqual([
      { op: 'set', path: 'admins/auto-1', data: { houseIds: ['h1'], id: 'auto-1' } },
    ]);
    expect(readDoc('admins/auto-1')).toEqual({ houseIds: ['h1'], id: 'auto-1' });
  });

  it('keeps the given id', async () => {
    await createAdmin({ id: 'a7' } as unknown as Admin);

    expect(getOpLog()).toEqual([{ op: 'set', path: 'admins/a7', data: { id: 'a7' } }]);
  });
});

describe('updateAdmin', () => {
  it('updates admins/{id} with the id and changes, then reads it back', async () => {
    seedDoc('admins/a1', { id: 'a1', houseIds: ['h1'] });

    const result = await updateAdmin('a1', { houseIds: ['h1', 'h2'] } as Partial<Admin>);

    expect(result).toEqual({ id: 'a1', houseIds: ['h1', 'h2'] });
    expect(getOpLog()).toEqual([
      { op: 'update', path: 'admins/a1', data: { id: 'a1', houseIds: ['h1', 'h2'] } },
      { op: 'get', path: 'admins/a1' },
    ]);
  });

  it('rejects for a missing admin without reading it back', async () => {
    await expect(updateAdmin('missing', {})).rejects.toMatchObject({
      code: 'firestore/not-found',
    });
    expect(getOpLog()).toEqual([{ op: 'update', path: 'admins/missing', data: { id: 'missing' } }]);
  });
});

describe('deleteAdmin', () => {
  it('reads the admin, archives it under admin-archive/{id}, then deletes it', async () => {
    seedDoc('admins/a1', { id: 'a1', houseIds: ['h1'] });

    expect(await deleteAdmin('a1')).toBe('a1');
    expect(getOpLog()).toEqual([
      { op: 'get', path: 'admins/a1' },
      { op: 'set', path: 'admin-archive/a1', data: { id: 'a1', houseIds: ['h1'] } },
      { op: 'delete', path: 'admins/a1' },
    ]);
    expect(readDoc('admins/a1')).toBeUndefined();
    expect(readDoc('admin-archive/a1')).toEqual({ id: 'a1', houseIds: ['h1'] });
  });

  it('skips the archive when the admin does not exist', async () => {
    expect(await deleteAdmin('missing')).toBe('missing');
    expect(getOpLog()).toEqual([
      { op: 'get', path: 'admins/missing' },
      { op: 'delete', path: 'admins/missing' },
    ]);
  });

  it('does not delete when the archive write fails', async () => {
    seedDoc('admins/a1', { id: 'a1' });
    failNext('set', new Error('denied'), 'admin-archive/a1');

    await expect(deleteAdmin('a1')).rejects.toThrow('denied');
    expect(getOpLog().map((e) => e.op)).toEqual(['get', 'set']);
    expect(readDoc('admins/a1')).toEqual({ id: 'a1' });
  });
});

describe('sendAdminInvite', () => {
  it('calls createInvitation with email, houseId and the admin role', async () => {
    seedCall('createInvitation', { token: 't1' });

    await expect(sendAdminInvite('a@example.com', 'h1', 'Oak')).resolves.toBeUndefined();
    expect(getOpLog()).toEqual([
      {
        op: 'call',
        path: 'createInvitation',
        data: { email: 'a@example.com', houseId: 'h1', role: 'admin' },
      },
    ]);
  });

  it('propagates a callable failure', async () => {
    failNext('call', new Error('permission-denied'), 'createInvitation');

    await expect(sendAdminInvite('a@example.com', 'h1', 'Oak')).rejects.toThrow(
      'permission-denied',
    );
  });
});

describe('getAdmins', () => {
  it('queries admins by one where clause and keys the result by id', async () => {
    // seedQuery keeps `id` out of the data; getAdmins keys by the stored id field.
    seedDoc('admins/a1', { id: 'a1', role: 'manager' });
    seedDoc('admins/a2', { id: 'a2', role: 'owner' });

    expect(await getAdmins('role', '==', 'manager')).toEqual({
      a1: { id: 'a1', role: 'manager' },
    });
    expect(getOpLog()).toEqual([
      { op: 'getDocs', path: 'admins', constraints: [['where', 'role', '==', 'manager']] },
    ]);
  });

  it('returns an empty object when nothing matches', async () => {
    expect(await getAdmins('role', '==', 'none')).toEqual({});
  });
});

describe('getHouseAdmins', () => {
  it('queries admins whose houseIds contain the house and returns them as a list', async () => {
    seedDoc('admins/a1', { id: 'a1', houseIds: ['h1'] });
    seedDoc('admins/a2', { id: 'a2', houseIds: ['h2'] });

    expect(await getHouseAdmins({ id: 'h1' } as House)).toEqual([{ id: 'a1', houseIds: ['h1'] }]);
    expect(getOpLog()).toEqual([
      {
        op: 'getDocs',
        path: 'admins',
        constraints: [['where', 'houseIds', 'array-contains', 'h1']],
      },
    ]);
  });
});
