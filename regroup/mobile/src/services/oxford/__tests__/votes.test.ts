/**
 * votes.ts service — anonymous voting unit tests
 *
 * Tests for the `castVote` function to ensure that:
 *  1. When `isAnonymous` is false, `individualVotes.{guestId}` IS written
 *  2. When `isAnonymous` is true,  `individualVotes.{guestId}` is NOT written
 *
 * The mock replicates the exact Firestore call chain used in votes.ts:
 *   firestore
 *     .collection('houses')
 *     .doc(houseId)
 *     .collection('votes')
 *     .doc(voteId)
 *
 * and the transaction:
 *   firestore.runTransaction(async tx => {
 *     const doc = await tx.get(voteRef);
 *     tx.update(voteRef, payload);
 *   })
 *
 * Strategy: store all mutable mock state on a single `mocks` object.
 * jest.mock factory captures a reference to that object, so mutations
 * inside beforeEach / setupTransaction are visible to the factory.
 */

// ─── Shared mutable mock state ────────────────────────────────────────────────
// Must be declared with `var` (or `let`) so the jest.mock hoisting works
// correctly.  `jest.mock` calls are hoisted to the top of the file — before
// any `const`/`let` initialisers — but `var` declarations ARE hoisted with
// their initial undefined value.  We immediately assign a jest.fn() via
// Object.assign after the declaration so the factory closure sees the same
// object reference throughout the test.

const mocks = {
  transactionUpdate: jest.fn(),
  transactionGet: jest.fn(),
  runTransaction: jest.fn(),
};

// ─── Firebase-setup mock ──────────────────────────────────────────────────────

jest.mock('../../../../firebase-setup', () => {
  // voteRef returned by the deepest .doc(voteId) call
  const voteRef = { id: 'vote-1' };

  // Inner collection (votes sub-collection)
  const votesCollection = { doc: jest.fn(() => voteRef) };

  // House document
  const houseDoc = { collection: jest.fn(() => votesCollection) };

  // Outer houses collection
  const housesCollection = { doc: jest.fn(() => houseDoc) };

  return {
    firestore: {
      collection: jest.fn(() => housesCollection),
      // Delegate to the `mocks` object so test-level setup is visible here.
      // `mocks` is declared in module scope above and is always the same
      // object reference by the time the factory runs.
      runTransaction: (...args: any[]) => mocks.runTransaction(...args),
    },
  };
});

// ─── Import service AFTER mocks ───────────────────────────────────────────────

import { castVote } from '../votes';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function makeVoteData(overrides: Record<string, any> = {}) {
  return {
    id: 'vote-1',
    houseId: 'house-1',
    topic: 'Accept applicant',
    description: '',
    type: 'general' as const,
    options: ['yes', 'no', 'abstain'],
    results: { yes: 2, no: 1, abstain: 0 },
    individualVotes: {},
    threshold: 0.8,
    passed: false,
    createdAt: '2024-01-01T00:00:00.000Z',
    ...overrides,
  };
}

/**
 * Wire up the transaction mocks so that `firestore.runTransaction` executes
 * the callback with a fake transaction that returns `voteData` on `.get()`.
 */
function setupTransaction(voteData: ReturnType<typeof makeVoteData>) {
  mocks.transactionGet.mockResolvedValue({
    exists: true,
    data: () => voteData,
  });

  mocks.runTransaction.mockImplementation(
    async (callback: (tx: any) => Promise<void>) => {
      const transaction = {
        get: mocks.transactionGet,
        update: mocks.transactionUpdate,
      };
      await callback(transaction);
    },
  );
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('votes service — castVote anonymous voting', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  // ── isAnonymous: false ───────────────────────────────────────────────────

  describe('when isAnonymous is false', () => {
    it('writes individualVotes.{guestId} to Firestore', async () => {
      const voteData = makeVoteData({ isAnonymous: false });
      setupTransaction(voteData);

      await castVote('house-1', 'vote-1', 'guest-42', 'yes');

      expect(mocks.transactionUpdate).toHaveBeenCalledTimes(1);
      const [, updatePayload] = mocks.transactionUpdate.mock.calls[0];

      // The dot-notation key `individualVotes.guest-42` must be present as a flat key
      expect(updatePayload['individualVotes.guest-42']).toBe('yes');
    });

    it('updates the results tally', async () => {
      const voteData = makeVoteData({ isAnonymous: false });
      setupTransaction(voteData);

      await castVote('house-1', 'vote-1', 'guest-42', 'yes');

      const [, updatePayload] = mocks.transactionUpdate.mock.calls[0];
      expect(updatePayload.results).toBeDefined();
      expect(updatePayload.results.yes).toBe(3); // was 2, now 3
    });
  });

  // ── isAnonymous: true ────────────────────────────────────────────────────

  describe('when isAnonymous is true', () => {
    it('does NOT write individualVotes.{guestId} to Firestore', async () => {
      const voteData = makeVoteData({ isAnonymous: true });
      setupTransaction(voteData);

      await castVote('house-1', 'vote-1', 'guest-42', 'yes');

      expect(mocks.transactionUpdate).toHaveBeenCalledTimes(1);
      const [, updatePayload] = mocks.transactionUpdate.mock.calls[0];

      // The dot-notation key must NOT be present
      expect(updatePayload).not.toHaveProperty('individualVotes.guest-42');
      // And if the full individualVotes map is present it must not contain guestId
      if (updatePayload.individualVotes) {
        expect(updatePayload.individualVotes).not.toHaveProperty('guest-42');
      }
    });

    it('still updates the results tally when anonymous', async () => {
      const voteData = makeVoteData({ isAnonymous: true });
      setupTransaction(voteData);

      await castVote('house-1', 'vote-1', 'guest-42', 'no');

      const [, updatePayload] = mocks.transactionUpdate.mock.calls[0];
      expect(updatePayload.results).toBeDefined();
      expect(updatePayload.results.no).toBe(2); // was 1, now 2
    });
  });

  // ── missing vote ─────────────────────────────────────────────────────────

  describe('when vote does not exist', () => {
    it('throws an error', async () => {
      mocks.transactionGet.mockResolvedValue({
        exists: false,
        data: () => null,
      });
      mocks.runTransaction.mockImplementation(
        async (callback: (tx: any) => Promise<void>) => {
          const transaction = {
            get: mocks.transactionGet,
            update: mocks.transactionUpdate,
          };
          await callback(transaction);
        },
      );

      await expect(
        castVote('house-1', 'missing-vote', 'guest-42', 'yes'),
      ).rejects.toThrow('Failed to cast vote');
    });
  });
});
