/**
 * dispute.tsx and guestBatch.ts against the normalized Firebase operation log.
 *
 * Characterization for the React Native 0.88 upgrade (plan Task 2). This file
 * stays byte-identical from Task 2 to the end of Task 10, the modular Firebase
 * migration. Assertions are on outcomes and log entries only.
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
import { createDispute, updateDispute } from '../dispute';
import { GUEST_BATCH_SIZE, commitGuestOps } from '../guestBatch';

// Untyped on purpose: the batch factory is the caller's (namespaced today,
// writeBatch after the migration); the mock serves both.
const mockFirestore = require('../../../__mocks__/firebase-modular/firestore');

beforeEach(() => {
  resetOpLog();
});

describe('updateDispute', () => {
  it('writes the house and the archived dispute in one batch', async () => {
    seedDoc('houses/h1', { id: 'h1' });
    const house = { id: 'h1', disputes: {} } as any;
    const dispute = { id: 'd1', activityId: 'a1', status: 'resolved' } as any;

    await updateDispute(house, dispute);

    expect(getOpLog()).toEqual([
      { op: 'batch.update', path: 'houses/h1', data: house },
      { op: 'batch.set', path: 'disputes/d1', data: dispute },
      { op: 'batch.commit', path: '' },
    ]);
  });

  it('writes only the house when nothing is archived', async () => {
    seedDoc('houses/h1', { id: 'h1' });

    await updateDispute({ id: 'h1' } as any);

    expect(getOpLog().map((e) => e.op)).toEqual(['batch.update', 'batch.commit']);
  });
});

describe('createDispute', () => {
  it('sets the dispute at its own id', async () => {
    const dispute = { id: 'd1', activityId: 'a1' } as any;

    expect(await createDispute(dispute)).toEqual(dispute);
    expect(getOpLog()).toEqual([{ op: 'set', path: 'disputes/d1', data: dispute }]);
  });
});

describe('commitGuestOps', () => {
  const op = (id: string) => (batch: any) =>
    batch.update(mockFirestore.instance.doc(`guests/${id}`), { status: 'x' });

  it(`commits ${GUEST_BATCH_SIZE} guest ops per batch`, async () => {
    const ids = Array.from({ length: GUEST_BATCH_SIZE * 2 + 1 }, (_, i) => `g${i}`);
    ids.forEach((id) => seedDoc(`guests/${id}`, { status: 'active' }));

    await commitGuestOps(() => mockFirestore.writeBatch(mockFirestore.instance), ids.map(op));

    const ops = getOpLog().map((e) => e.op);
    expect(ops.filter((o) => o === 'batch.commit')).toHaveLength(3);
    expect(ops.slice(0, GUEST_BATCH_SIZE + 1)).toEqual([
      ...Array(GUEST_BATCH_SIZE).fill('batch.update'),
      'batch.commit',
    ]);
    expect(readDoc(`guests/g${GUEST_BATCH_SIZE * 2}`)).toEqual({ status: 'x' });
  });

  it('rejects when any batch fails', async () => {
    seedDoc('guests/g0', { status: 'active' });
    failNext('batch.commit', new Error('unavailable'));

    await expect(
      commitGuestOps(() => mockFirestore.writeBatch(mockFirestore.instance), [op('g0')]),
    ).rejects.toThrow('unavailable');
  });
});
