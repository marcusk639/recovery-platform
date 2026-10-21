// writeOperatorSubscription stores a new operator subscription without
// resetting the subscription houses map, the property-cap count createHouses
// enforces. Replacing it let an operator at the cap subscribe again and add a
// full new set of houses.

let mockUsers: Record<string, Record<string, unknown>> = {};
const mockTxUpdate = jest.fn((ref: { id: string }, data: Record<string, unknown>) => {
  mockUsers[ref.id] = { ...mockUsers[ref.id], ...data };
});
jest.mock('../../api/firestore', () => ({
  userCollection: { doc: (id: string) => ({ id }) },
  // Stand-in for the real deep strip (the real module needs an initialized app).
  stripUndefinedDeep: (v: unknown) => JSON.parse(JSON.stringify(v)),
  ratsFirestore: {
    runTransaction: async (fn: (tx: unknown) => Promise<unknown>) =>
      fn({
        get: async (ref: { id: string }) => ({ data: () => mockUsers[ref.id] }),
        update: mockTxUpdate,
      }),
  },
}));

import { writeOperatorSubscription } from '../../util/operatorSubscriptionWrite';

beforeEach(() => {
  mockUsers = {};
  jest.clearAllMocks();
});

describe('writeOperatorSubscription', () => {
  it('keeps the stored houses map when an operator at the cap subscribes again', async () => {
    mockUsers.op = {
      subscriptionMetadata: {
        tier: 'starter',
        subscriptionId: 'sub_old',
        houses: { h1: { numberOfGuests: 3 } },
      },
    };

    const written = await writeOperatorSubscription('op', {
      tier: 'professional',
      subscriptionId: 'sub_new',
      status: 'trialing',
    });

    expect(written.houses).toEqual({ h1: { numberOfGuests: 3 } });
    expect(mockUsers.op.subscriptionMetadata).toEqual({
      tier: 'professional',
      subscriptionId: 'sub_new',
      status: 'trialing',
      houses: { h1: { numberOfGuests: 3 } },
    });
  });

  it('ignores a houses map on the new metadata in favour of the stored one', async () => {
    mockUsers.op = { subscriptionMetadata: { houses: { h1: {} } } };
    await writeOperatorSubscription('op', { houses: {}, tier: 'starter' });
    expect((mockUsers.op.subscriptionMetadata as { houses: unknown }).houses).toEqual({ h1: {} });
  });

  it('starts with an empty houses map for a first subscription', async () => {
    mockUsers.op = { id: 'op' };
    const written = await writeOperatorSubscription('op', { tier: 'starter' });
    expect(written.houses).toEqual({});
  });

  it('drops undefined fields, which Firestore update rejects', async () => {
    mockUsers.op = {};
    await writeOperatorSubscription('op', { tier: 'starter', currentPeriodEnd: undefined });
    const [, data] = mockTxUpdate.mock.calls[0];
    expect(data.subscriptionMetadata).not.toHaveProperty('currentPeriodEnd');
  });
});
