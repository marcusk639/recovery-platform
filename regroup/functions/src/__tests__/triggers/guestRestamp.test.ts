// src/__tests__/triggers/guestRestamp.test.ts
//
// Wiring of onGuestLinkedRestamp: every guests/{guestId} write hands the
// before/after guest to restampGuestActivities (covered in
// __tests__/activities/guestRestamp.test.ts), and it retries.

jest.mock('firebase-functions/v2/firestore', () => ({
  onDocumentWritten: jest.fn((options: unknown, handler: unknown) => ({ options, handler })),
}));
jest.mock('../../api/firestore', () => ({ ratsFirestore: { name: 'rats-db' } }));
jest.mock('../../activities/guestRestamp', () => ({
  restampGuestActivities: jest.fn(async () => ({ scanned: 0, stamped: 0 })),
}));
jest.mock('../../rent/chargeAccountStamp', () => ({
  stampGuestCharges: jest.fn(async () => ({ scanned: 0, stamped: 0 })),
}));

import { onGuestLinkedRestamp } from '../../triggers/firestore/guestRestamp';
import { restampGuestActivities } from '../../activities/guestRestamp';
import { stampGuestCharges } from '../../rent/chargeAccountStamp';

const trigger = onGuestLinkedRestamp as unknown as {
  options: { document: string; retry: boolean };
  handler: (event: unknown) => Promise<void>;
};
const snap = (data: Record<string, unknown> | undefined) => ({ data: () => data });

describe('onGuestLinkedRestamp', () => {
  it('listens on guests/{guestId} and retries on failure', () => {
    expect(trigger.options).toEqual({ document: 'guests/{guestId}', retry: true });
  });

  it('passes the guest id and both versions, and propagates a failure', async () => {
    await trigger.handler({
      params: { guestId: 'g1' },
      data: { before: snap({ userId: 'x' }), after: snap({ userId: 'u' }) },
    });
    expect(restampGuestActivities).toHaveBeenCalledWith(
      { name: 'rats-db' },
      'g1',
      { userId: 'x' },
      { userId: 'u' },
    );
    (restampGuestActivities as jest.Mock).mockRejectedValueOnce(new Error('aborted'));
    await expect(
      trigger.handler({
        params: { guestId: 'g1' },
        data: { before: snap(undefined), after: snap({ userId: 'u' }) },
      }),
    ).rejects.toThrow('aborted');
  });
});

// Owner decision 2026-11-26: a record linking to an account also gets its rent charges.
describe('onGuestLinkedRestamp: rent charges', () => {
  it("hands the same guest and versions to stampGuestCharges", async () => {
    (stampGuestCharges as jest.Mock).mockClear();
    await trigger.handler({
      params: { guestId: 'g1' },
      data: { before: snap({ houseId: 'h1' }), after: snap({ houseId: 'h1', userId: 'u' }) },
    });
    expect(stampGuestCharges).toHaveBeenCalledWith(
      { name: 'rats-db' },
      'g1',
      { houseId: 'h1' },
      { houseId: 'h1', userId: 'u' },
    );
  });

  it('still stamps the charges when the activities fail, and retries the event', async () => {
    (stampGuestCharges as jest.Mock).mockClear();
    (restampGuestActivities as jest.Mock).mockRejectedValueOnce(new Error('aborted'));
    await expect(
      trigger.handler({
        params: { guestId: 'g1' },
        data: { before: snap(undefined), after: snap({ userId: 'u' }) },
      }),
    ).rejects.toThrow('aborted');
    expect(stampGuestCharges).toHaveBeenCalled();
  });

  it('retries the event when the charges fail', async () => {
    (stampGuestCharges as jest.Mock).mockRejectedValueOnce(new Error('unavailable'));
    await expect(
      trigger.handler({
        params: { guestId: 'g1' },
        data: { before: snap(undefined), after: snap({ userId: 'u' }) },
      }),
    ).rejects.toThrow('unavailable');
  });
});

describe('onGuestLinkedRestamp age cutoff (S1)', () => {
  it('stops retrying an event older than RETRY_CUTOFF_MS', async () => {
    (restampGuestActivities as jest.Mock).mockClear();
    await trigger.handler({
      time: new Date(Date.now() - 7 * 60 * 60 * 1000).toISOString(),
      params: { guestId: 'g1' },
      data: { before: snap({ userId: 'x' }), after: snap({ userId: 'u' }) },
    });
    expect(restampGuestActivities).not.toHaveBeenCalled();
  });
});
