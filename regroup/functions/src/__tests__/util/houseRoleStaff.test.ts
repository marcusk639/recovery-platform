// src/__tests__/util/houseRoleStaff.test.ts
//
// staffUids: the uids holding a staff tier (owner, manager, peer leader) on a
// house, read from house-roles/{houseId}_{uid}. Residents and records with an
// unknown tier are excluded; the uid comes from the document id.

const where = jest.fn();
let docs: Array<{ id: string; data: () => Record<string, unknown> }> = [];

jest.mock('firebase-admin', () => ({
  firestore: () => ({
    collection: (name: string) => {
      if (name !== 'house-roles') throw new Error(`unexpected collection ${name}`);
      return {
        where: (...args: unknown[]) => {
          where(...args);
          return { get: async () => ({ docs }) };
        },
      };
    },
  }),
  auth: () => ({}),
}));
jest.mock('firebase-functions', () => ({ logger: { info: jest.fn(), warn: jest.fn() } }));

import { staffUids } from '../../util/houseRoleStore';

const record = (uid: string, tier: string) => ({
  id: `h1_${uid}`,
  data: () => ({ houseId: 'h1', tier }),
});

describe('staffUids', () => {
  it('returns the owner, manager and peer-leader uids of the house only', async () => {
    docs = [
      record('owner', 'owner'),
      record('mgr', 'manager'),
      record('peer', 'peerLeader'),
      record('res', 'resident'),
      record('odd', 'bogus'),
    ];
    await expect(staffUids('h1')).resolves.toEqual(['owner', 'mgr', 'peer']);
    expect(where).toHaveBeenCalledWith('houseId', '==', 'h1');
  });

  it('leaves peer leaders out when asked (applications are for owners and managers)', async () => {
    docs = [
      record('owner', 'owner'),
      record('mgr', 'manager'),
      record('peer', 'peerLeader'),
      record('res', 'resident'),
    ];
    await expect(staffUids('h1', { peerLeaders: false })).resolves.toEqual(['owner', 'mgr']);
  });

  it('returns an empty list for a house with no records', async () => {
    docs = [];
    await expect(staffUids('h1')).resolves.toEqual([]);
  });
});
