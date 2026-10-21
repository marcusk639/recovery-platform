// End to end through runAccountDeletion with the real Stripe ownership checks
// (only the Stripe client is faked): an attacker who planted a victim's billing
// ids in their own guest doc or user doc deletes their account, and the victim's
// customer survives and their subscription is not cancelled.
import { h, resetHarness } from './deletionHarness';

const mockStripe = {
  customers: { retrieve: jest.fn(), del: jest.fn() },
  subscriptions: { retrieve: jest.fn(), cancel: jest.fn() },
};

jest.mock('firebase-admin', () => require('./deletionHarness').adminModule);
jest.mock('firebase-functions/v2', () => require('./deletionHarness').functionsModule);
jest.mock('../../api/firestore', () => require('./deletionHarness').firestoreModule);
jest.mock('../../api/stripe', () => ({ stripe: mockStripe }));
jest.mock('../../accountDeletion/memberRecords', () => require('./deletionHarness').memberModule);
jest.mock(
  '../../accountDeletion/houseRecords',
  () => require('./deletionHarness').houseRecordsModule,
);
jest.mock('../../accountDeletion/personalData', () => require('./deletionHarness').personalModule);

import { logger } from 'firebase-functions';
import { runAccountDeletion } from '../../accountDeletion';

const NOW = '2026-10-20T00:00:00.000Z';
const ALL = ['operator', 'members', 'personal', 'userDoc', 'auth'];

beforeEach(() => {
  resetHarness();
  jest.spyOn(logger, 'error').mockImplementation(() => undefined);
  jest.spyOn(logger, 'warn').mockImplementation(() => undefined);
  mockStripe.customers.del.mockResolvedValue({ deleted: true });
  mockStripe.subscriptions.cancel.mockResolvedValue({ status: 'canceled' });
});

describe('account deletion with planted billing ids', () => {
  it("does not delete a co-resident's customer copied into the attacker's guest doc", async () => {
    h.users = { attacker: { id: 'attacker' } };
    h.guests = { forged: { userId: 'attacker', houseId: 'h1', stripeCustomerId: 'cus_victim' } };
    mockStripe.customers.retrieve.mockResolvedValue({
      id: 'cus_victim',
      metadata: { userId: 'victim-uid' },
    });

    const result = await runAccountDeletion('attacker', NOW);

    expect(result.completed).toEqual(ALL);
    expect(mockStripe.customers.retrieve).toHaveBeenCalledWith('cus_victim');
    expect(mockStripe.customers.del).not.toHaveBeenCalled();
    expect(logger.error).toHaveBeenCalledWith(
      'accountDeletion.stripe_not_owned',
      expect.objectContaining({ uid: 'attacker', id: 'cus_victim' }),
    );
  });

  it("does not cancel an operator's subscription planted in the attacker's user doc", async () => {
    // A user may delete and recreate their own user doc, so before the rules fix
    // it could carry another operator's ids.
    h.users = {
      attacker: {
        id: 'attacker',
        subscriptionMetadata: { subscriptionId: 'sub_victim', customerId: 'cus_victim' },
      },
    };
    mockStripe.subscriptions.retrieve.mockResolvedValue({
      id: 'sub_victim',
      metadata: { userId: 'victim-uid' },
      customer: 'cus_victim',
    });

    const result = await runAccountDeletion('attacker', NOW);

    expect(result.completed).toEqual(ALL);
    expect(mockStripe.subscriptions.retrieve).toHaveBeenCalledWith('sub_victim');
    expect(mockStripe.subscriptions.cancel).not.toHaveBeenCalled();
    expect(mockStripe.customers.del).not.toHaveBeenCalled();
  });
});
