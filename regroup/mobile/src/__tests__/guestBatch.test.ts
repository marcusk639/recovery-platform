import { commitGuestOps, GUEST_BATCH_SIZE, GuestBatchOp } from '../services/guestBatch';

it('commits guest ops in batches of GUEST_BATCH_SIZE, below the rules read limit', async () => {
  const batches: string[][] = [];
  const newBatch = () => {
    const ops: string[] = [];
    batches.push(ops);
    return { delete: (id: string) => ops.push(id), commit: jest.fn(async () => undefined) } as any;
  };
  const ops: GuestBatchOp[] = Array.from({ length: 2 * GUEST_BATCH_SIZE + 3 }, (_, i) => (b) => {
    b.delete(`g${i}` as any);
  });
  await commitGuestOps(newBatch, ops);
  expect(GUEST_BATCH_SIZE).toBeLessThan(19);
  expect(batches.map((b) => b.length)).toEqual([GUEST_BATCH_SIZE, GUEST_BATCH_SIZE, 3]);
});

it('commits nothing for no ops', async () => {
  const newBatch = jest.fn();
  await commitGuestOps(newBatch, []);
  expect(newBatch).not.toHaveBeenCalled();
});
