// src/services/__tests__/organization.test.ts
//
// Unit tests for the organization service.
//
// organization.ts imports firebase-setup (firestore) and delegates all
// Firestore work to the crud service. We mock both so every Firestore
// interaction is fully observable without touching native code.

// ─── Mocks ───────────────────────────────────────────────────────────────────

jest.mock('../../../firebase-setup', () => ({
  firestore: {
    collection: jest.fn(() => ({})),
  },
}));

jest.mock('../crud', () => ({
  create: jest.fn(),
  get: jest.fn(),
  update: jest.fn(),
  deleteObject: jest.fn(),
  getByAttribute: jest.fn(),
}));

// ─── Imports ─────────────────────────────────────────────────────────────────

import * as crud from '../crud';
import {
  createOrganization,
  getOrganization,
  updateOrganization,
  deleteOrganization,
  getUserOrganizations,
} from '../organization';
import Organization from '../../entities/Organization';

// ─── Helpers ─────────────────────────────────────────────────────────────────

const makeOrg = (overrides: Partial<Organization> = {}): Organization => {
  const org = new Organization();
  org.id = 'org1';
  (org as any).name = 'Test Org';
  (org as any).owners = ['user1'];
  (org as any).houseIds = [];
  return Object.assign(org, overrides);
};

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('organization service', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  // ── createOrganization ────────────────────────────────────────────────────

  describe('createOrganization', () => {
    it('delegates to crud.create and returns the created organization', async () => {
      const org = makeOrg();
      (crud.create as jest.Mock).mockResolvedValue(org);

      const result = await createOrganization({ name: 'Test Org' });

      expect(crud.create).toHaveBeenCalledTimes(1);
      expect(result).toEqual(org);
    });

    it('passes the collection and the shaped org object to crud.create', async () => {
      const org = makeOrg();
      (crud.create as jest.Mock).mockResolvedValue(org);

      await createOrganization({ name: 'Test Org', owners: ['owner1'] });

      const [, passedObj] = (crud.create as jest.Mock).mock.calls[0];
      expect(passedObj.name).toBe('Test Org');
      expect(passedObj.owners).toEqual(['owner1']);
    });

    it('stamps createdAt and updatedAt as ISO strings', async () => {
      (crud.create as jest.Mock).mockImplementation((_col, obj) =>
        Promise.resolve(obj),
      );

      const result = await createOrganization({ name: 'Stamped Org' });

      expect(typeof (result as any).createdAt).toBe('string');
      expect(typeof (result as any).updatedAt).toBe('string');
    });

    it('initialises id to empty string before crud.create assigns one', async () => {
      (crud.create as jest.Mock).mockImplementation((_col, obj) =>
        Promise.resolve(obj),
      );

      const result = await createOrganization({ name: 'Empty Id' });

      // The object sent to crud has id = '' (crud fills it in)
      const [, passedObj] = (crud.create as jest.Mock).mock.calls[0];
      expect(passedObj.id).toBe('');
    });

    it('propagates errors from crud.create', async () => {
      (crud.create as jest.Mock).mockRejectedValue(new Error('Create failed'));

      await expect(createOrganization({})).rejects.toThrow('Create failed');
    });
  });

  // ── getOrganization ───────────────────────────────────────────────────────

  describe('getOrganization', () => {
    it('delegates to crud.get with the correct id', async () => {
      const org = makeOrg();
      (crud.get as jest.Mock).mockResolvedValue(org);

      const result = await getOrganization('org1');

      expect(crud.get).toHaveBeenCalledWith(expect.anything(), 'org1');
      expect(result).toEqual(org);
    });

    it('propagates errors from crud.get', async () => {
      (crud.get as jest.Mock).mockRejectedValue(new Error('Not found'));

      await expect(getOrganization('missing')).rejects.toThrow('Not found');
    });
  });

  // ── updateOrganization ────────────────────────────────────────────────────

  describe('updateOrganization', () => {
    it('delegates to crud.update with merged id and updates', async () => {
      (crud.update as jest.Mock).mockResolvedValue(undefined);

      await updateOrganization('org1', { name: 'Updated Name' });

      expect(crud.update).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({ id: 'org1', name: 'Updated Name' }),
      );
    });

    it('passes through arbitrary update fields', async () => {
      (crud.update as jest.Mock).mockResolvedValue(undefined);

      await updateOrganization('org1', { numberOfHouses: 5, owners: ['u1', 'u2'] });

      const [, passedObj] = (crud.update as jest.Mock).mock.calls[0];
      expect(passedObj.numberOfHouses).toBe(5);
      expect(passedObj.owners).toEqual(['u1', 'u2']);
    });

    it('propagates errors from crud.update', async () => {
      (crud.update as jest.Mock).mockRejectedValue(new Error('Update failed'));

      await expect(updateOrganization('org1', {})).rejects.toThrow('Update failed');
    });
  });

  // ── deleteOrganization ────────────────────────────────────────────────────

  describe('deleteOrganization', () => {
    it('first fetches the org, then delegates to crud.deleteObject', async () => {
      const org = makeOrg();
      (crud.get as jest.Mock).mockResolvedValue(org);
      (crud.deleteObject as jest.Mock).mockResolvedValue(undefined);

      await deleteOrganization('org1');

      expect(crud.get).toHaveBeenCalledWith(expect.anything(), 'org1');
      expect(crud.deleteObject).toHaveBeenCalledWith(expect.anything(), org);
    });

    it('propagates errors when getOrganization fails', async () => {
      (crud.get as jest.Mock).mockRejectedValue(new Error('Not found'));

      await expect(deleteOrganization('missing')).rejects.toThrow('Not found');
      expect(crud.deleteObject).not.toHaveBeenCalled();
    });

    it('propagates errors from crud.deleteObject', async () => {
      const org = makeOrg();
      (crud.get as jest.Mock).mockResolvedValue(org);
      (crud.deleteObject as jest.Mock).mockRejectedValue(new Error('Delete failed'));

      await expect(deleteOrganization('org1')).rejects.toThrow('Delete failed');
    });
  });

  // ── getUserOrganizations ──────────────────────────────────────────────────

  describe('getUserOrganizations', () => {
    it('queries by ownerId and returns the resulting array', async () => {
      const orgs = [makeOrg({ id: 'org1' }), makeOrg({ id: 'org2' })];
      (crud.getByAttribute as jest.Mock).mockResolvedValue(orgs);

      const result = await getUserOrganizations('user1');

      expect(crud.getByAttribute).toHaveBeenCalledWith(
        expect.anything(),
        'ownerId',
        '==',
        'user1',
      );
      expect(result).toHaveLength(2);
      expect(result[0].id).toBe('org1');
      expect(result[1].id).toBe('org2');
    });

    it('returns an empty array when the user has no organizations', async () => {
      (crud.getByAttribute as jest.Mock).mockResolvedValue([]);

      const result = await getUserOrganizations('newuser');

      expect(result).toEqual([]);
    });

    it('propagates errors from crud.getByAttribute', async () => {
      (crud.getByAttribute as jest.Mock).mockRejectedValue(new Error('Query failed'));

      await expect(getUserOrganizations('user1')).rejects.toThrow('Query failed');
    });
  });
});
