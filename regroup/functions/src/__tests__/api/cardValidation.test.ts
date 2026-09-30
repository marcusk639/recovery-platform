// src/__tests__/api/cardValidation.test.ts
//
// Spec item 9 — SetupIntent card validation at signup.
//
// Unit tests for assertPaymentMethodUsable in isolation (the injected-client contract).

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
const mockCustomersDel = jest.fn();

jest.mock('stripe', () =>
  jest.fn().mockImplementation(() => ({
    setupIntents: {
      create: (...args: unknown[]) => mockSetupIntentsCreate(...args),
    },
    customers: {
      del: (...args: unknown[]) => mockCustomersDel(...args),
    },
  })),
);

import { logger } from 'firebase-functions';
import {
  assertPaymentMethodUsable,
  CARD_REQUIRES_ACTION_MESSAGE,
  CARD_UNUSABLE_MESSAGE,
  type CardValidationClient,
} from '../../api/cardValidation';

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

describe('assertPaymentMethodUsable', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockCustomersDel.mockResolvedValue({ id: 'cus_1', deleted: true });
  });

  it('confirms an off-session SetupIntent against the customer + payment method', async () => {
    mockSetupIntentsCreate.mockResolvedValue({
      id: 'seti_1',
      status: 'succeeded',
    });

    await expect(assertPaymentMethodUsable(client(), 'cus_1', 'pm_1')).resolves.toBeUndefined();

    expect(mockSetupIntentsCreate).toHaveBeenCalledWith({
      customer: 'cus_1',
      payment_method: 'pm_1',
      payment_method_types: ['card'],
      usage: 'off_session',
      confirm: true,
    });
    expect(mockCustomersDel).not.toHaveBeenCalled();
  });

  it("surfaces Stripe's own decline copy for a card error, and nothing internal", async () => {
    mockSetupIntentsCreate.mockRejectedValue(cardError('Your card was declined.'));

    await expect(assertPaymentMethodUsable(client(), 'cus_1', 'pm_1')).rejects.toMatchObject({
      code: 'failed-precondition',
      message: 'Your card was declined.',
    });
  });

  it('does not leak internal detail for a non-card Stripe failure', async () => {
    mockSetupIntentsCreate.mockRejectedValue(
      Object.assign(new Error('boom'), {
        type: 'NotAStripeError',
        stack: 'at secretInternals (/srv/lib/api/stripe.js:1:1)',
      }),
    );

    const err = (await assertPaymentMethodUsable(client(), 'cus_1', 'pm_1').then(
      () => undefined,
      (e) => e,
    )) as HttpsError;

    expect(err).toBeDefined();
    expect(err.code).toBe('internal');
    expect(err.message).toBe('An unexpected error occurred');
    expect(err.message).not.toMatch(/srv|stripe\.js|boom/);
  });

  it('throws a distinct message for requires_action (3DS) without a subscription', async () => {
    mockSetupIntentsCreate.mockResolvedValue({
      id: 'seti_1',
      status: 'requires_action',
    });

    await expect(assertPaymentMethodUsable(client(), 'cus_1', 'pm_1')).rejects.toMatchObject({
      code: 'failed-precondition',
      message: CARD_REQUIRES_ACTION_MESSAGE,
    });
    expect(CARD_REQUIRES_ACTION_MESSAGE).not.toEqual(CARD_UNUSABLE_MESSAGE);
    // Frequency must be observable rather than silent.
    expect(logger.warn).toHaveBeenCalledWith(
      'Card validation did not succeed',
      expect.objectContaining({
        setupIntentStatus: 'requires_action',
        requiresAction: true,
      }),
    );
  });

  it('throws the generic unusable message for any other non-succeeded status', async () => {
    mockSetupIntentsCreate.mockResolvedValue({
      id: 'seti_1',
      status: 'requires_payment_method',
    });

    await expect(assertPaymentMethodUsable(client(), 'cus_1', 'pm_1')).rejects.toMatchObject({
      code: 'failed-precondition',
      message: CARD_UNUSABLE_MESSAGE,
    });
  });

  it('deletes the just-created customer on a decline so none is orphaned', async () => {
    mockSetupIntentsCreate.mockRejectedValue(
      cardError('Your card has insufficient funds.', 'insufficient_funds'),
    );

    await expect(assertPaymentMethodUsable(client(), 'cus_1', 'pm_1')).rejects.toThrow();

    expect(mockCustomersDel).toHaveBeenCalledWith('cus_1');
  });

  it('deletes the customer on requires_action too', async () => {
    mockSetupIntentsCreate.mockResolvedValue({ status: 'requires_action' });

    await expect(assertPaymentMethodUsable(client(), 'cus_1', 'pm_1')).rejects.toThrow();

    expect(mockCustomersDel).toHaveBeenCalledWith('cus_1');
  });

  it('still reports the card error when customer cleanup itself fails', async () => {
    mockSetupIntentsCreate.mockRejectedValue(cardError('Your card was declined.'));
    mockCustomersDel.mockRejectedValue(
      Object.assign(new Error('No such customer'), {
        type: 'StripeInvalidRequestError',
      }),
    );

    await expect(assertPaymentMethodUsable(client(), 'cus_1', 'pm_1')).rejects.toMatchObject({
      message: 'Your card was declined.',
    });
    expect(logger.error).toHaveBeenCalledWith(
      'Failed to delete customer after card validation failure',
      expect.objectContaining({ customerId: 'cus_1' }),
    );
  });

  it('logs no PII — no email, name, or card detail reaches the logs', async () => {
    mockSetupIntentsCreate.mockRejectedValue(
      Object.assign(new Error('Your card was declined.'), {
        type: 'StripeCardError',
        code: 'card_declined',
        decline_code: 'generic_decline',
        requestId: 'req_123',
        // Stripe attaches the PaymentMethod to card errors — it must not be logged.
        payment_method: {
          id: 'pm_1',
          card: { last4: '0002', brand: 'visa' },
          billing_details: { name: 'Jane Doe', email: 'jane@example.com' },
        },
      }),
    );

    await expect(assertPaymentMethodUsable(client(), 'cus_1', 'pm_1')).rejects.toThrow();

    const logged = JSON.stringify(
      (logger.error as jest.Mock).mock.calls.concat((logger.warn as jest.Mock).mock.calls),
    );
    expect(logged).not.toMatch(/jane@example\.com|Jane Doe|0002/);
    expect(logged).toContain('generic_decline');
  });
});
