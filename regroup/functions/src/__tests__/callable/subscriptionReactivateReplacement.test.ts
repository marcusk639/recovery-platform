// Reactivate's replacement replaces the operator's whole plan, built from the
// record it read before Stripe created the subscription. Written as is, it put
// back that read's houses map: a resident counted while Stripe worked (an
// invitation redeemed) was lost, and a house deleted meanwhile came back. The
// replacement is written in a transaction that keeps the stored houses map.

class HttpsError extends Error {
  code: string;
  constructor(code: string, message: string) {
    super(message);
    this.code = code;
  }
}
jest.mock('firebase-functions/v2/https', () => ({
  onCall: (_opts: unknown, handler: Function) => handler,
  HttpsError,
}));
jest.mock('firebase-functions', () => ({
  logger: { info: jest.fn(), error: jest.fn(), warn: jest.fn() },
}));
jest.mock('firebase-functions/params', () => ({
  defineSecret: jest.fn((name: string) => ({ name })),
}));
jest.mock('stripe', () => jest.fn().mockImplementation(() => ({})));
jest.mock('firebase-admin', () => ({
  firestore: Object.assign(
    jest.fn(() => ({})),
    {},
  ),
}));

// As the real one: the replacement carries the houses map of the record it was given.
const mockReactivate = jest.fn(async (_customer: string, meta: { houses?: object }) => ({
  subscriptionId: 'sub_new',
  customerId: 'cus_1',
  status: 'active',
  houseType: 'traditional',
  tier: 'professional',
  houses: meta.houses ?? {},
}));
jest.mock('../../api/stripe', () => ({
  reactivateSubscription: (customer: string, meta: { houses?: object }) =>
    mockReactivate(customer, meta),
  findLiveSubscriptionForUser: async () => null,
  failedBeforeSubscription: () => false,
}));

// One stored user doc; getUser returns the copy read before it moved on.
let mockStored: Record<string, any>;
let mockStaleRead: Record<string, any>;
const mockApplyUpdate = (data: Record<string, unknown>) => {
  for (const [key, value] of Object.entries(data)) {
    const [top, nested] = key.split('.');
    if (nested) mockStored[top] = { ...mockStored[top], [nested]: value };
    else mockStored[top] = value;
  }
};
jest.mock('../../api/firestore', () => ({
  userCollection: { doc: (id: string) => ({ id }) },
  stripUndefinedDeep: (v: unknown) => v,
  ratsFirestore: {
    runTransaction: async (fn: (tx: unknown) => Promise<unknown>) =>
      fn({
        get: async () => ({ exists: true, data: () => mockStored }),
        update: (_ref: unknown, data: Record<string, unknown>) => mockApplyUpdate(data),
      }),
  },
  getUser: jest.fn(async () => JSON.parse(JSON.stringify(mockStaleRead))),
  updateUser: jest.fn(async (_id: string, data: Record<string, unknown>) => mockApplyUpdate(data)),
  getHouse: jest.fn(),
  upsertSubscriptionDoc: jest.fn(),
}));
jest.mock('../../util/houseRoles', () => ({ isPrimaryOwner: async () => true }));
jest.mock('../../util/email', () => ({ sendEmail: jest.fn(), regroupEmail: 'x@y.z' }));
jest.mock('../../util/operatorHouses', () => ({ setOperatorHousesStatus: jest.fn() }));
jest.mock('../../util/salesSwitch', () => ({ isSalesOpen: async () => true }));
jest.mock('../../util/superAdminClaim', () => ({ grantPotentialSuperAdminClaim: jest.fn() }));

import { reactivateOperatorSubscription } from '../../callable/subscriptions';

const CANCELED = {
  subscriptionId: 'sub_old',
  customerId: 'cus_1',
  status: 'canceled',
  houseType: 'traditional',
  tier: 'professional',
  maxResidents: 20,
  maxProperties: 3,
};
const reactivate = () =>
  (reactivateOperatorSubscription as unknown as Function)({
    auth: { uid: 'op', token: { email: 'op@test.com' } },
    data: { user: { id: 'op', subscriptionMetadata: { ...CANCELED } } },
  });

beforeEach(() => {
  jest.clearAllMocks();
  process.env.TIER_BILLING_ENABLED = 'true';
  process.env.STRIPE_PRICE_TRAD_PROFESSIONAL = 'price_pro';
});
afterEach(() => {
  delete process.env.TIER_BILLING_ENABLED;
  delete process.env.STRIPE_PRICE_TRAD_PROFESSIONAL;
});

describe("Reactivate's replacement", () => {
  it('keeps a resident counted, and a house removed, while Stripe created it', async () => {
    mockStaleRead = {
      id: 'op',
      email: 'op@test.com',
      subscriptionMetadata: {
        ...CANCELED,
        houses: { h1: { numberOfGuests: 1 }, h2: { numberOfGuests: 0 } },
      },
    };
    mockStored = {
      id: 'op',
      email: 'op@test.com',
      subscriptionMetadata: { ...CANCELED, houses: { h1: { numberOfGuests: 2 } } },
    };

    const result = await reactivate();

    expect(mockStored.subscriptionMetadata).toMatchObject({
      subscriptionId: 'sub_new',
      status: 'active',
      houses: { h1: { numberOfGuests: 2 } },
    });
    // The new record replaces the lock Reactivate took.
    expect(mockStored.subscriptionMetadata.checkoutStartedAt).toBeUndefined();
    expect(result.subscriptionMetadata.houses).toEqual({ h1: { numberOfGuests: 2 } });
  });
});
