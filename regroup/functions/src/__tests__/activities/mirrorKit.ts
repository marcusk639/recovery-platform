// Shared fixtures and helpers for the house dispute mirror tests
// (houseDisputeMirror*.test.ts): activity a1 of guest g1 in house h1.
import { FakeFirestore, asFirestore } from './fakeFirestore';
import { mirrorHouseDispute } from '../../activities/houseDisputeMirror';

type Data = Record<string, unknown>;

export const NOW = '2026-01-15T12:00:00.000Z';

export const active = {
  guestId: 'g1',
  houseId: 'h1',
  type: 'chore',
  status: 'active',
  loggedBy: 'resident-uid',
};
export const disputed = {
  ...active,
  status: 'disputed',
  disputeReason: 'Kitchen not cleaned',
  disputedBy: 'peer-uid',
};
export const approved = {
  ...disputed,
  status: 'resolved',
  disputed: 'successful',
  incomplete: true,
  disputeResolvedBy: 'mgr',
};
export const rejected = {
  ...disputed,
  status: 'resolved',
  disputed: 'rejected',
  incomplete: false,
  disputeResolvedBy: 'mgr',
};

/** Helpers bound to the test's current FakeFirestore (re-created per test). */
export const mirrorHelpers = (db: () => FakeFirestore) => {
  const archives = () =>
    [...(db().collections.get('disputes') ?? new Map()).entries()].filter(
      ([id]) => id.startsWith('a1') || id.includes('uuid'),
    );
  return {
    house: () => db().read('houses', 'h1')!,
    live: () => db().read('house-disputes', 'h1'),
    /** Archived disputes for activity a1 (ids are {key}[_{stamp}][_{decision id}]). */
    archives,
    archiveOf: (prefix: string) => archives().find(([id]) => id.startsWith(prefix))?.[1],
    /** Deliver an event whose payload is before/after; the committed doc is whatever commit() set. */
    deliver: (before: Data | undefined, after: Data | undefined, now = NOW) =>
      mirrorHouseDispute(asFirestore(db()), 'a1', before, after, { now }),
    commit: (state: Data | undefined) => {
      if (state) db().seed('activities', 'a1', state);
      else db().collections.get('activities')?.delete('a1');
    },
  };
};
