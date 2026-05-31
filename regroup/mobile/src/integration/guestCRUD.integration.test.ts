// src/integration/guestCRUD.integration.test.ts
// Requires Firebase emulator: firebase emulators:start --only firestore,auth
// Run with: npm run test:integration

import { getGuest, updateGuest } from '../services/guest';
import { Guest } from '../entities/Guest';
import { firestore } from '../../firebase-setup';

const GUEST_ID = 'crud-guest-1';

const seedData: Partial<Guest> = {
  id: GUEST_ID,
  userId: 'u1',
  houseId: 'h1',
  firstName: 'Test',
  lastName: 'Guest',
  displayName: 'Test Guest',
  email: 'test.guest@example.com',
  status: 'active',
  phase: 1,
  step: 1,
  sobrietyDate: '2025-01-01',
  drugOfChoice: 'alcohol',
  hasJob: false,
  rentOwed: 0,
  choreFees: 0,
  dailyHabit: 0,
  supporters: [],
  jobs: [],
  isAdmin: false,
  infoEntered: true,
  version: 0,
  createdDate: new Date().toISOString(),
  lastUpdated: new Date().toISOString(),
};

const seedGuest = async (data: Partial<Guest>) => {
  await firestore.collection('guests').doc(GUEST_ID).set(data);
};

describe('guest CRUD (integration)', () => {
  beforeEach(async () => {
    await seedGuest(seedData);
  });

  afterEach(async () => {
    await firestore.collection('guests').doc(GUEST_ID).delete();
  });

  describe('getGuest', () => {
    it('retrieves an existing guest by id', async () => {
      const guest = await getGuest(GUEST_ID);

      expect(guest).toBeDefined();
      expect(guest.id).toBe(GUEST_ID);
      expect(guest.firstName).toBe('Test');
      expect(guest.lastName).toBe('Guest');
    });

    it('includes all seeded fields in the returned guest', async () => {
      const guest = await getGuest(GUEST_ID);

      expect(guest.userId).toBe('u1');
      expect(guest.houseId).toBe('h1');
      expect(guest.status).toBe('active');
      expect(guest.email).toBe('test.guest@example.com');
    });
  });

  describe('updateGuest', () => {
    it('persists a firstName update to Firestore', async () => {
      const updatedData: Partial<Guest> = {
        ...seedData,
        firstName: 'Updated',
      };

      await updateGuest(seedData, updatedData);

      const guest = await getGuest(GUEST_ID);
      expect(guest.firstName).toBe('Updated');
    });

    it('persists a status update to Firestore', async () => {
      const updatedData: Partial<Guest> = {
        ...seedData,
        status: 'inactive',
      };

      await updateGuest(seedData, updatedData);

      const guest = await getGuest(GUEST_ID);
      expect(guest.status).toBe('inactive');
    });

    it('increments version on each update', async () => {
      const updatedData: Partial<Guest> = {
        ...seedData,
        lastName: 'Updated',
      };

      await updateGuest(seedData, updatedData);

      const guest = await getGuest(GUEST_ID);
      // version starts at 0 and should be incremented to 1 after one update
      expect(guest.version).toBeGreaterThan(0);
    });

    it('throws if updatedGuest has no id', async () => {
      const noIdGuest: Partial<Guest> = { firstName: 'No ID' };

      await expect(updateGuest(seedData, noIdGuest)).rejects.toThrow(
        'Guest must have an id for update',
      );
    });
  });
});
