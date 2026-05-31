// src/services/__tests__/setup-wizard.test.ts
//
// Unit tests for setup-wizard.ts.
//
// The module has many dependencies (firebase-setup, house, invites, admin,
// storage, users, subscription, geolocation, google/timezone, util/…).
// We mock them all so no native code runs.

// ─── Mocks ───────────────────────────────────────────────────────────────────

jest.mock('../../../firebase-setup', () => {
  const mockBatch = {
    set: jest.fn(),
    update: jest.fn(),
    delete: jest.fn(),
    commit: jest.fn().mockResolvedValue(undefined),
  };

  const docObj = {
    id: 'generated-doc-id',
    get: jest.fn(() => Promise.resolve({ exists: false, data: () => null })),
    set: jest.fn(() => Promise.resolve()),
    update: jest.fn(() => Promise.resolve()),
    delete: jest.fn(() => Promise.resolve()),
  };

  const collectionObj: any = {
    doc: jest.fn(() => docObj),
    where: jest.fn(),
    orderBy: jest.fn().mockReturnThis(),
    limit: jest.fn().mockReturnThis(),
    get: jest.fn(() => Promise.resolve({ docs: [] })),
    add: jest.fn(() => Promise.resolve({ id: 'mock-id' })),
  };
  collectionObj.where = jest.fn(() => collectionObj);

  return {
    firestore: {
      collection: jest.fn(() => collectionObj),
      batch: jest.fn(() => mockBatch),
      _mockBatch: mockBatch,
      _collectionObj: collectionObj,
      _docObj: docObj,
    },
    functions: {
      httpsCallable: jest.fn(() =>
        jest.fn(() => Promise.resolve({ data: true })),
      ),
    },
  };
});

jest.mock('../house', () => ({
  houseCollection: {
    doc: jest.fn(() => ({ id: 'house-doc-id' })),
  },
}));

jest.mock('../invitations', () => ({
  createInvitation: jest.fn(() => Promise.resolve({ token: 'mock-token' })),
}));

jest.mock('../admin', () => ({
  adminCollection: {
    doc: jest.fn(() => ({ id: 'admin-doc-id' })),
  },
  getAdmin: jest.fn(),
}));

jest.mock('../storage', () => ({
  uploadHousePhoto: jest.fn(() =>
    Promise.resolve({ houseId: 'h1', url: 'https://mock-photo-url' }),
  ),
}));

jest.mock('../users', () => ({
  refreshClaims: jest.fn(() => Promise.resolve()),
  getAuthUser: jest.fn(() => Promise.resolve({ uid: 'mock-user' })),
}));

jest.mock('../subscription', () => ({
  updateSubscriptionHouses: jest.fn(() =>
    Promise.resolve({ subscriptionMetadata: { plan: 'pro' } }),
  ),
}));

jest.mock('../../util/geolocation', () => ({
  geohash: jest.fn(() => 'mock-geohash'),
}));

jest.mock('../../util/house', () => ({
  getInitialPhase: jest.fn(() => ({ name: 'Phase 1' })),
}));

jest.mock('../../util/logging', () => ({
  logException: jest.fn(),
}));

jest.mock('../../util/forEach', () => ({
  asyncForEach: jest.fn(async (items: any, fn: any) => {
    for (const item of Object.values(items)) {
      await fn(item);
    }
  }),
}));

jest.mock('../../../google/timezone', () => ({
  getTimezone: jest.fn(() => Promise.resolve('America/Chicago')),
}));

// ─── Imports ─────────────────────────────────────────────────────────────────

import { functions } from '../../../firebase-setup';
import * as adminService from '../admin';
import * as invitationsService from '../invitations';
import { getAdmin } from '../admin';
import {
  addPotentialSuperAdminPrivilege,
  addAdminAuthorization,
  addGuestAuthorization,
  sendAllInvites,
  createAdminInvite,
  createGuestInvite,
  uploadHousePhotos,
} from '../setup-wizard';
import { User } from '../../entities/User';
import { Houses } from '../../types';
import Admin from '../../entities/Admin';

// ─── Helpers ─────────────────────────────────────────────────────────────────

const makeUser = (overrides: Partial<User> = {}): User =>
  ({
    uid: 'operator-uid',
    id: 'operator-id',
    email: 'operator@test.com',
    firstName: 'Alice',
    lastName: 'Smith',
    adminId: undefined,
    isAdmin: false,
    isSuperAdmin: false,
    orgSetupCompleted: false,
    ...overrides,
  } as unknown as User);

const makeHouses = (): Houses =>
  ({
    h1: {
      id: 'h1',
      name: 'House One',
      ownerId: 'operator-id',
      adminIds: [],
      superAdminIds: [],
      pendingAdminInvites: ['admin@test.com'],
      pendingGuestInvites: ['guest@test.com'],
      seniorPeerEmails: [],
      imageUrl: undefined,
      lat: 41.8781,
      lng: -87.6298,
    },
  } as unknown as Houses);

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('setup-wizard service', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    // Restore httpsCallable default
    (functions.httpsCallable as jest.Mock).mockReturnValue(
      jest.fn(() => Promise.resolve({ data: true })),
    );
  });

  // ── addPotentialSuperAdminPrivilege ───────────────────────────────────────

  describe('addPotentialSuperAdminPrivilege', () => {
    it('returns the callable function from functions.httpsCallable', async () => {
      const result = await addPotentialSuperAdminPrivilege();

      expect(functions.httpsCallable).toHaveBeenCalledWith(
        'givePotentialSuperAdminPrivilege',
      );
      expect(typeof result).toBe('function');
    });
  });

  // ── addAdminAuthorization ─────────────────────────────────────────────────

  describe('addAdminAuthorization', () => {
    it('calls the addAdminAuthorization cloud function with the admin object', async () => {
      const admin = { id: 'a1', email: 'admin@test.com' } as Admin;

      await addAdminAuthorization(admin);

      expect(functions.httpsCallable).toHaveBeenCalledWith(
        'addAdminAuthorization',
      );
    });

    it('throws when the callable returns falsy data', async () => {
      (functions.httpsCallable as jest.Mock).mockReturnValue(
        jest.fn(() => Promise.resolve({ data: null })),
      );

      const admin = { id: 'a1' } as Admin;

      await expect(addAdminAuthorization(admin)).rejects.toMatchObject({
        message: 'Something went wrong.',
      });
    });

    it('propagates cloud function errors', async () => {
      (functions.httpsCallable as jest.Mock).mockReturnValue(
        jest.fn(() => Promise.reject(new Error('Function error'))),
      );

      await expect(
        addAdminAuthorization({ id: 'a1' } as Admin),
      ).rejects.toThrow('Function error');
    });
  });

  // ── addGuestAuthorization ─────────────────────────────────────────────────

  describe('addGuestAuthorization', () => {
    it('calls the addGuestAuthorization cloud function', async () => {
      const guest = { id: 'g1', houseId: 'h1' } as any;

      await addGuestAuthorization(guest);

      expect(functions.httpsCallable).toHaveBeenCalledWith(
        'addGuestAuthorization',
      );
    });

    it('throws when the callable returns falsy data', async () => {
      (functions.httpsCallable as jest.Mock).mockReturnValue(
        jest.fn(() => Promise.resolve({ data: false })),
      );

      await expect(
        addGuestAuthorization({ id: 'g1' } as any),
      ).rejects.toMatchObject({
        message: 'Something went wrong',
      });
    });

    it('propagates cloud function errors', async () => {
      (functions.httpsCallable as jest.Mock).mockReturnValue(
        jest.fn(() => Promise.reject(new Error('Guest auth failed'))),
      );

      await expect(addGuestAuthorization({ id: 'g1' } as any)).rejects.toThrow(
        'Guest auth failed',
      );
    });
  });

  // ── createAdminInvite ─────────────────────────────────────────────────────

  describe('createAdminInvite', () => {
    it('forwards email + houseId + role=admin to createInvitation', async () => {
      await createAdminInvite('admin@test.com', 'h1');

      expect(invitationsService.createInvitation).toHaveBeenCalledWith({
        email: 'admin@test.com',
        houseId: 'h1',
        role: 'admin',
      });
    });

    it('resolves with the token returned by createInvitation', async () => {
      (invitationsService.createInvitation as jest.Mock).mockResolvedValueOnce({
        token: 'token-abc',
      });

      const result = await createAdminInvite('admin@test.com', 'h1');

      expect(result).toEqual({ token: 'token-abc' });
    });
  });

  // ── createGuestInvite ─────────────────────────────────────────────────────

  describe('createGuestInvite', () => {
    it('forwards email + houseId + role=guest + initialPhase to createInvitation', async () => {
      await createGuestInvite('guest@test.com', 'h1', 'Phase 1');

      expect(invitationsService.createInvitation).toHaveBeenCalledWith({
        email: 'guest@test.com',
        houseId: 'h1',
        role: 'guest',
        initialPhase: 'Phase 1',
      });
    });

    it('resolves with the token returned by createInvitation', async () => {
      (invitationsService.createInvitation as jest.Mock).mockResolvedValueOnce({
        token: 'token-xyz',
      });

      const result = await createGuestInvite('guest@test.com', 'h1', 'Phase 1');

      expect(result).toEqual({ token: 'token-xyz' });
    });
  });

  // ── sendAllInvites ────────────────────────────────────────────────────────

  describe('sendAllInvites', () => {
    it('calls createInvitation once per pending invite', async () => {
      const houses = makeHouses();
      const operator = makeUser();

      await sendAllInvites(houses, operator);

      // makeHouses() has 1 admin + 1 guest = 2 invitations.
      expect(invitationsService.createInvitation).toHaveBeenCalledTimes(2);
    });

    it('issues createInvitation calls for both admin and guest roles', async () => {
      const houses = makeHouses();
      const operator = makeUser();

      await sendAllInvites(houses, operator);

      const calls = (invitationsService.createInvitation as jest.Mock).mock
        .calls;
      const roles = calls.map(([arg]) => arg.role);
      expect(roles).toContain('admin');
      expect(roles).toContain('guest');
    });

    it('skips admin invites when admin flag is false', async () => {
      const houses = makeHouses();
      const operator = makeUser();

      await sendAllInvites(houses, operator, true, false);

      const calls = (invitationsService.createInvitation as jest.Mock).mock
        .calls;
      const roles = calls.map(([arg]) => arg.role);
      expect(roles).not.toContain('admin');
    });

    it('skips guest invites when guest flag is false', async () => {
      const houses = makeHouses();
      const operator = makeUser();

      await sendAllInvites(houses, operator, false, true);

      const calls = (invitationsService.createInvitation as jest.Mock).mock
        .calls;
      const roles = calls.map(([arg]) => arg.role);
      expect(roles).not.toContain('guest');
    });

    it('propagates errors from createInvitation', async () => {
      (invitationsService.createInvitation as jest.Mock).mockRejectedValue(
        new Error('Email service down'),
      );

      await expect(sendAllInvites(makeHouses(), makeUser())).rejects.toThrow(
        'Email service down',
      );
    });
  });

  // ── uploadHousePhotos ─────────────────────────────────────────────────────

  describe('uploadHousePhotos', () => {
    it('returns an empty array when no houses have imageUrl', async () => {
      const houses: Houses = {
        h1: { id: 'h1', imageUrl: undefined } as any,
      };

      const result = await uploadHousePhotos(houses);

      expect(result).toEqual([]);
    });

    it('uploads photos only for houses that have imageUrl set', async () => {
      const { uploadHousePhoto } = require('../storage');
      (uploadHousePhoto as jest.Mock).mockResolvedValue({
        houseId: 'h1',
        url: 'https://mock-url',
      });

      const houses: Houses = {
        h1: { id: 'h1', imageUrl: 'file://local/photo.jpg' } as any,
        h2: { id: 'h2', imageUrl: undefined } as any,
      };

      const result = await uploadHousePhotos(houses);

      expect(uploadHousePhoto).toHaveBeenCalledTimes(1);
      expect(result).toHaveLength(1);
    });
  });
});
