// deleteGuestCustomer deletes a resident's autopay customer only when Stripe
// ties it to the account being deleted. Guest docs are client-creatable, so a
// customer id read from one proves nothing on its own: without this check a
// user could copy a co-resident's customer id into a guest doc of their own,
// delete their account, and delete the co-resident's customer and saved card.

const mockCustomersRetrieve = jest.fn();
const mockCustomersDel = jest.fn();

jest.mock('stripe', () =>
  jest.fn().mockImplementation(() => ({
    customers: {
      retrieve: (...args: unknown[]) => mockCustomersRetrieve(...args),
      del: (...args: unknown[]) => mockCustomersDel(...args),
    },
  })),
);

const mockGetUser = jest.fn();
jest.mock('firebase-admin', () => ({
  auth: () => ({ getUser: (uid: string) => mockGetUser(uid) }),
}));

import { logger } from 'firebase-functions';
import { deleteGuestCustomer } from '../../api/stripeDeletion';

const warn = jest.spyOn(logger, 'warn').mockImplementation(() => undefined);

const UID = 'resident-uid';
const account = (email: string | undefined, emailVerified: boolean) => ({
  uid: UID,
  email,
  emailVerified,
});

describe('deleteGuestCustomer', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    process.env.STRIPE_SECRET_KEY = 'sk_test';
    mockCustomersDel.mockResolvedValue({ deleted: true });
    mockGetUser.mockResolvedValue(account('res@example.com', true));
  });

  it("deletes a customer whose metadata.userId is the account's uid", async () => {
    mockCustomersRetrieve.mockResolvedValue({ id: 'cus_1', metadata: { userId: UID } });
    await deleteGuestCustomer(UID, 'cus_1');
    expect(mockCustomersDel).toHaveBeenCalledWith('cus_1');
    expect(mockGetUser).not.toHaveBeenCalled();
  });

  it("deletes a customer whose email is the account's verified Auth email, ignoring case", async () => {
    mockCustomersRetrieve.mockResolvedValue({
      id: 'cus_1',
      email: ' Res@Example.com',
      metadata: {},
    });
    await deleteGuestCustomer(UID, 'cus_1');
    expect(mockGetUser).toHaveBeenCalledWith(UID);
    expect(mockCustomersDel).toHaveBeenCalledWith('cus_1');
  });

  it.each([
    [
      'belongs to another user (metadata)',
      { email: 'victim@example.com', metadata: { userId: 'victim-uid' } },
    ],
    ["has another person's email", { email: 'victim@example.com', metadata: {} }],
    ['has no email and no metadata', { metadata: null }],
  ])('skips a customer that %s, logging ids only', async (_label, customer) => {
    mockCustomersRetrieve.mockResolvedValue({ id: 'cus_victim', ...customer });
    await expect(deleteGuestCustomer(UID, 'cus_victim')).resolves.toBeUndefined();
    expect(mockCustomersDel).not.toHaveBeenCalled();
    expect(warn).toHaveBeenCalledWith(
      'deleteGuestCustomer: customer not tied to this account, skipped',
      { uid: UID, customerId: 'cus_victim' },
    );
    expect(JSON.stringify(warn.mock.calls)).not.toContain('example.com');
  });

  it('does not trust a matching email when the Auth email is unverified', async () => {
    mockGetUser.mockResolvedValue(account('res@example.com', false));
    mockCustomersRetrieve.mockResolvedValue({
      id: 'cus_1',
      email: 'res@example.com',
      metadata: {},
    });
    await deleteGuestCustomer(UID, 'cus_1');
    expect(mockCustomersDel).not.toHaveBeenCalled();
  });

  it('treats an already-deleted customer as done without deleting again', async () => {
    mockCustomersRetrieve.mockResolvedValue({ id: 'cus_1', deleted: true });
    await deleteGuestCustomer(UID, 'cus_1');
    expect(mockCustomersDel).not.toHaveBeenCalled();
  });

  it('treats a missing customer as already deleted', async () => {
    mockCustomersRetrieve.mockRejectedValue(
      Object.assign(new Error('No such customer'), {
        type: 'StripeInvalidRequestError',
        code: 'resource_missing',
      }),
    );
    await expect(deleteGuestCustomer(UID, 'cus_gone')).resolves.toBeUndefined();
    expect(mockCustomersDel).not.toHaveBeenCalled();
  });

  it('rethrows other retrieve and Auth failures so the step is retried', async () => {
    mockCustomersRetrieve.mockRejectedValueOnce(new Error('stripe down'));
    await expect(deleteGuestCustomer(UID, 'cus_1')).rejects.toThrow('stripe down');

    mockCustomersRetrieve.mockResolvedValue({ id: 'cus_1', email: 'res@example.com' });
    mockGetUser.mockRejectedValueOnce(new Error('auth down'));
    await expect(deleteGuestCustomer(UID, 'cus_1')).rejects.toThrow('auth down');
    expect(mockCustomersDel).not.toHaveBeenCalled();
  });
});
