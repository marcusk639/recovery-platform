// src/services/__tests__/dispute.test.ts
//
// Unit tests for the dispute service.
//
// updateDispute uses firestore.batch() to atomically write house and guest
// updates, an optional resolved dispute document, and one notification doc per
// notification in the array.
//
// createDispute delegates to crud.create, passing the disputes collection,
// the dispute object, and dispute.id as the explicit document id.

// ─── Mocks (hoisted before imports) ─────────────────────────────────────────
//
// NOTE: jest.mock factories are hoisted to the top of the file by Babel/Jest
// before ANY variable declarations execute. Therefore mock factory functions
// must be entirely self-contained — they cannot reference variables declared
// in the module scope. We embed the batch mock inside the factory and expose
// it via a private property on the returned firestore object so tests can
// access it after imports resolve.
//
// We also mock ../../util/display to prevent the transitive import chain:
//   Notification.tsx → util/display.tsx → styles/theme.tsx → react-native-size-matters
// (react-native-size-matters uses ESM and is not transformed by the Jest config).

jest.mock('../../util/display', () => ({
  getTodaysDate: jest.fn(() => '2024-01-01'),
  getDaysOfWeek: jest.fn(() => []),
  formatDate: jest.fn((d: string) => d),
}));

jest.mock('../../components/weekdays', () => ({
  daysOfWeek: [],
}));

jest.mock('../../styles/theme', () => ({
  color: {},
  ThemeContext: {},
}));

jest.mock('../../../firebase-setup', () => {
  const mockBatch = {
    update: jest.fn(),
    set: jest.fn(),
    commit: jest.fn().mockResolvedValue(undefined),
  };

  const doc = jest.fn(() => ({ id: 'mock-doc-id' }));
  const collection = jest.fn(() => ({ doc }));

  return {
    firestore: {
      collection,
      batch: jest.fn(() => mockBatch),
      // Expose the batch mock via a private key so tests can reach it
      _mockBatch: mockBatch,
    },
  };
});

jest.mock('../crud', () => ({
  create: jest.fn(),
}));

// ─── Imports (after mocks) ───────────────────────────────────────────────────

import { firestore } from '../../../firebase-setup';
import * as crud from '../crud';
import { updateDispute, createDispute } from '../dispute';
import { Dispute } from '../../entities/Dispute';
import { Notification } from '../../entities/Notification';

// ─── Helpers ─────────────────────────────────────────────────────────────────

const getBatch = () => (firestore as any)._mockBatch as {
  update: jest.Mock;
  set: jest.Mock;
  commit: jest.Mock;
};

const makeDispute = (overrides: Partial<Dispute> = {}): Dispute => ({
  id: 'd1',
  guestId: 'g1',
  houseId: 'h1',
  activityId: 'a1',
  type: 'chore_completed' as any,
  message: 'test dispute',
  status: 'pending',
  createdDate: '2024-01-01',
  createdAt: '2024-01-01T00:00:00.000Z',
  updatedAt: '2024-01-01T00:00:00.000Z',
  ...overrides,
});

const makeNotification = (id: string): Notification => {
  const n = new Notification();
  (n as any).id = id;
  return n;
};

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('dispute service', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    // Restore commit default behaviour after clearAllMocks resets it
    getBatch().commit.mockResolvedValue(undefined);
  });

  // ── updateDispute ─────────────────────────────────────────────────────────

  describe('updateDispute', () => {
    it('calls firestore.batch()', async () => {
      await updateDispute({ id: 'h1' } as any, { id: 'g1' } as any, []);
      expect(firestore.batch).toHaveBeenCalledTimes(1);
    });

    it('commits the batch', async () => {
      await updateDispute({ id: 'h1' } as any, { id: 'g1' } as any, []);
      expect(getBatch().commit).toHaveBeenCalledTimes(1);
    });

    it('calls batch.update twice — once for house, once for guest', async () => {
      await updateDispute({ id: 'h1' } as any, { id: 'g1' } as any, []);
      expect(getBatch().update).toHaveBeenCalledTimes(2);
    });

    it('does not call batch.set when no dispute or notifications are provided', async () => {
      await updateDispute({ id: 'h1' } as any, { id: 'g1' } as any, []);
      expect(getBatch().set).not.toHaveBeenCalled();
    });

    it('calls batch.set once when a resolvedDispute is provided', async () => {
      const dispute = makeDispute({ id: 'd1' });
      await updateDispute({ id: 'h1' } as any, { id: 'g1' } as any, [], dispute);
      expect(getBatch().set).toHaveBeenCalledTimes(1);
    });

    it('writes the resolvedDispute to the disputes collection', async () => {
      const dispute = makeDispute({ id: 'd1' });
      await updateDispute({ id: 'h1' } as any, { id: 'g1' } as any, [], dispute);
      // batch.set is called with (docRef, disputeData)
      expect(getBatch().set).toHaveBeenCalledWith(
        expect.anything(),
        dispute,
      );
    });

    it('calls batch.set once per notification', async () => {
      const notes: Notification[] = [makeNotification('n1'), makeNotification('n2')];
      await updateDispute({ id: 'h1' } as any, { id: 'g1' } as any, notes);
      expect(getBatch().set).toHaveBeenCalledTimes(2);
    });

    it('calls batch.set for both a resolvedDispute and notifications', async () => {
      const dispute = makeDispute({ id: 'd1' });
      const notes: Notification[] = [makeNotification('n1'), makeNotification('n2')];
      await updateDispute({ id: 'h1' } as any, { id: 'g1' } as any, notes, dispute);
      // 1 dispute + 2 notifications = 3 batch.set calls
      expect(getBatch().set).toHaveBeenCalledTimes(3);
    });

    it('still commits the batch even when a resolvedDispute is provided', async () => {
      const dispute = makeDispute({ id: 'd1' });
      await updateDispute({ id: 'h1' } as any, { id: 'g1' } as any, [], dispute);
      expect(getBatch().commit).toHaveBeenCalledTimes(1);
    });
  });

  // ── createDispute ─────────────────────────────────────────────────────────

  describe('createDispute', () => {
    it('delegates to crud.create', async () => {
      const dispute = makeDispute({ id: 'd1' });
      (crud.create as jest.Mock).mockResolvedValue(dispute);

      await createDispute(dispute);

      expect(crud.create).toHaveBeenCalledTimes(1);
    });

    it('passes the dispute object to crud.create', async () => {
      const dispute = makeDispute({ id: 'd1' });
      (crud.create as jest.Mock).mockResolvedValue(dispute);

      await createDispute(dispute);

      expect(crud.create).toHaveBeenCalledWith(
        expect.anything(), // collection reference
        dispute,
        dispute.id,
      );
    });

    it('returns the dispute returned by crud.create', async () => {
      const dispute = makeDispute({ id: 'd1' });
      (crud.create as jest.Mock).mockResolvedValue(dispute);

      const result = await createDispute(dispute);

      expect(result).toBe(dispute);
      expect(result.id).toBe('d1');
    });

    it('propagates errors from crud.create', async () => {
      const dispute = makeDispute({ id: 'd1' });
      (crud.create as jest.Mock).mockRejectedValue(new Error('Firestore error'));

      await expect(createDispute(dispute)).rejects.toThrow('Firestore error');
    });
  });
});
