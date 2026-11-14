/**
 * organization.ts against the normalized Firebase operation log.
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
  seedDoc,
} from '../../../__mocks__/firebase-modular/log';
import {
  createOrganization,
  deleteOrganization,
  getOrganization,
  getUserOrganizations,
  updateOrganization,
} from '../organization';
import Organization from '../../entities/Organization';

const ISO = expect.stringMatching(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);

beforeEach(() => {
  resetOpLog();
});

describe('createOrganization', () => {
  it('sets organizations/{auto id}, replacing the empty id, with both timestamps', async () => {
    const result = await createOrganization({ ownerId: 'u1' } as Partial<Organization>);

    const expected = { ownerId: 'u1', id: 'auto-1', createdAt: ISO, updatedAt: ISO };
    expect(result).toEqual(expected);
    expect(getOpLog()).toEqual([{ op: 'set', path: 'organizations/auto-1', data: expected }]);
  });

  it('ignores an id passed in the data', async () => {
    await createOrganization({ id: 'o9', ownerId: 'u1' } as Partial<Organization>);

    expect(getOpLog()[0].path).toBe('organizations/auto-1');
  });

  it('propagates a write failure', async () => {
    failNext('set', new Error('denied'), 'organizations/auto-1');

    await expect(createOrganization({ ownerId: 'u1' } as Partial<Organization>)).rejects.toThrow(
      'denied',
    );
  });
});

describe('getOrganization', () => {
  it('reads organizations/{id}', async () => {
    seedDoc('organizations/o1', { id: 'o1', ownerId: 'u1' });

    expect(await getOrganization('o1')).toEqual({ id: 'o1', ownerId: 'u1' });
    expect(getOpLog()).toEqual([{ op: 'get', path: 'organizations/o1' }]);
  });
});

describe('updateOrganization', () => {
  it('updates organizations/{id} with the id and changes', async () => {
    seedDoc('organizations/o1', { id: 'o1', ownerId: 'u1' });

    await updateOrganization('o1', { ownerId: 'u2' } as Partial<Organization>);

    expect(getOpLog()).toEqual([
      { op: 'update', path: 'organizations/o1', data: { id: 'o1', ownerId: 'u2' } },
    ]);
    expect(readDoc('organizations/o1')).toEqual({ id: 'o1', ownerId: 'u2' });
  });
});

describe('deleteOrganization', () => {
  it('reads the organization, then deletes it by its stored id', async () => {
    seedDoc('organizations/o1', { id: 'o1', ownerId: 'u1' });

    await deleteOrganization('o1');

    expect(getOpLog()).toEqual([
      { op: 'get', path: 'organizations/o1' },
      { op: 'delete', path: 'organizations/o1' },
    ]);
    expect(readDoc('organizations/o1')).toBeUndefined();
  });

  it('throws for a missing organization after the read, without deleting', async () => {
    await expect(deleteOrganization('missing')).rejects.toThrow(TypeError);
    expect(getOpLog()).toEqual([{ op: 'get', path: 'organizations/missing' }]);
  });
});

describe('getUserOrganizations', () => {
  it('queries organizations by ownerId', async () => {
    seedDoc('organizations/o1', { id: 'o1', ownerId: 'u1' });
    seedDoc('organizations/o2', { id: 'o2', ownerId: 'u2' });

    expect(await getUserOrganizations('u1')).toEqual([{ id: 'o1', ownerId: 'u1' }]);
    expect(getOpLog()).toEqual([
      { op: 'getDocs', path: 'organizations', constraints: [['where', 'ownerId', '==', 'u1']] },
    ]);
  });
});
