// src/__tests__/api/cardValidation.integration.test.ts
//
// Spec item 9 — SetupIntent card validation at signup.
//
// Integration tests proving SUBSCRIPTION IS NEVER CREATED when validation fails.

class HttpsError extends Error {
  code: string;
  details?: unknown;
  constructor(code: string, message: string, details?: unknown) {
    super(message);
    this.code = code;
    this.details = details;
    this.name = 'HttpsError';
  }
}

jest.mock('firebase-functions/v2/https', () => ({
  onCall: (optsOrHandler: unknown, handler?: unknown) =>
    typeof optsOrHandler === 'function' ? optsOrHandler : handler,
  HttpsError,
}));

jest.mock('firebase-functions', () => ({
  logger: { info: jest.fn(), error: jest.fn(), warn: jest.fn() },
}));

const mockSetupIntentsCreate = jest.fn();
const mockCustomersCreate = jest.fn();
const mockCustomersDel = jest.fn();
const mockSubscriptionsCreate = jest.fn();

jest.mock('stripe', () =>
  jest.fn().mockImplementation(() => ({
    setupIntents: {
      create: (...args: unknown[]) => mockSetupIntentsCreate(...args),
    },
    customers: {
      create: (...args: unknown[]) => mockCustomersCreate(...args),
      del: (...args: unknown[]) => mockCustomersDel(...args),
    },
    subscriptions: {
      create: (...args: unknown[]) => mockSubscriptionsCreate(...args),
    },
  })),
);

import { CARD_REQUIRES_ACTION_MESSAGE, type CardValidationClient } from '../../api/cardValidation';
import { initializeTierCustomer, initializeCustomer } from '../../api/stripe';

const client = () =>
  ({
    setupIntents: {
      create: (...args: unknown[]) => mockSetupIntentsCreate(...args),
    },
    customers: { del: (...args: unknown[]) => mockCustomersDel(...args) },
  }) as unknown as CardValidationClient;

// Shape matching what the Stripe SDK throws for a declined card. mapStripeError
// duck-types on `type`, so this exercises the real classification path.
const cardError = (message: string, declineCode = 'generic_decline') =>
  Object.assign(new Error(message), {
    type: 'StripeCardError',
    code: 'card_declined',
    decline_code: declineCode,
    requestId: 'req_123',
    message,
  });

describe('customer initialization blocks subscription creation on a bad card', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    process.env.STRIPE_SECRET_KEY = 'sk_test';
    process.env.STRIPE_API_VERSION = '2026-01-28.clover';
    process.env.STRIPE_PRICE_TRAD_STARTER = 'price_starter';
    mockCustomersCreate.mockResolvedValue({ id: 'cus_1' });
    mockCustomersDel.mockResolvedValue({ id: 'cus_1', deleted: true });
    mockSubscriptionsCreate.mockResolvedValue({
      id: 'sub_1',
      status: 'trialing',
      items: { data: [{ id: 'si_1', plan: { id: 'price_starter' } }] },
    });
  });

  afterEach(() => {
    delete process.env.STRIPE_PRICE_TRAD_STARTER;
  });

  it('initializeTierCustomer: declined card → throws, NO subscription created', async () => {
    mockSetupIntentsCreate.mockRejectedValue(cardError('Your card was declined.'));

    await expect(
      initializeTierCustomer('op@example.com', 'pm_1', 'traditional', 'starter', 'user_1', 'month'),
    ).rejects.toMatchObject({
      code: 'failed-precondition',
      message: 'Your card was declined.',
    });

    expect(mockSubscriptionsCreate).not.toHaveBeenCalled();
    expect(mockCustomersDel).toHaveBeenCalledWith('cus_1');
  });

  it('initializeTierCustomer: requires_action → throws, NO subscription created', async () => {
    mockSetupIntentsCreate.mockResolvedValue({ status: 'requires_action' });

    await expect(
      initializeTierCustomer('op@example.com', 'pm_1', 'traditional', 'starter', 'user_1', 'month'),
    ).rejects.toMatchObject({ message: CARD_REQUIRES_ACTION_MESSAGE });

    expect(mockSubscriptionsCreate).not.toHaveBeenCalled();
  });

  it('initializeTierCustomer: good card → validates, then creates the subscription', async () => {
    mockSetupIntentsCreate.mockResolvedValue({ status: 'succeeded' });

    const meta = await initializeTierCustomer(
      'op@example.com',
      'pm_1',
      'traditional',
      'starter',
      'user_1',
      'month',
    );

    expect(mockSetupIntentsCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        customer: 'cus_1',
        payment_method: 'pm_1',
        usage: 'off_session',
        confirm: true,
      }),
    );
    expect(mockSubscriptionsCreate).toHaveBeenCalledWith(
      expect.objectContaining({ customer: 'cus_1', trial_period_days: 7 }),
    );
    expect(meta).toMatchObject({
      customerId: 'cus_1',
      subscriptionId: 'sub_1',
      subscriptionItemId: 'si_1',
      status: 'trialing',
    });
    expect(mockCustomersDel).not.toHaveBeenCalled();
  });

  it('initializeCustomer (legacy path): declined card → throws, NO subscription created', async () => {
    mockSetupIntentsCreate.mockRejectedValue(cardError('Your card was declined.'));

    await expect(
      initializeCustomer('op@example.com', 'pm_1', false, 'user_1'),
    ).rejects.toMatchObject({ message: 'Your card was declined.' });

    expect(mockSubscriptionsCreate).not.toHaveBeenCalled();
    expect(mockCustomersDel).toHaveBeenCalledWith('cus_1');
  });

  it('initializeCustomer (legacy path): good card → creates the subscription', async () => {
    mockSetupIntentsCreate.mockResolvedValue({ status: 'succeeded' });

    const meta = await initializeCustomer('op@example.com', 'pm_1', false, 'user_1');

    expect(mockSubscriptionsCreate).toHaveBeenCalledWith(
      expect.objectContaining({ customer: 'cus_1', trial_period_days: 7 }),
    );
    expect(meta.customerId).toBe('cus_1');
    expect(mockCustomersDel).not.toHaveBeenCalled();
  });
});
