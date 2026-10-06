import { logger } from 'firebase-functions';
import { HttpsError } from 'firebase-functions/v2/https';
import Stripe from 'stripe';
import { mapStripeError } from '../util/stripe';

/**
 * The minimal slice of the Stripe client this module needs. It is injected by the
 * caller (`api/stripe.ts`) rather than imported from it, which keeps this module
 * free of a circular dependency on the lazy client Proxy and makes it trivially
 * mockable without reaching for the `stripe` package.
 */
export type CardValidationClient = Pick<Stripe, 'setupIntents' | 'customers'>;

/**
 * 3DS / additional-verification outcome. This product is US-only, where 3DS on an
 * off-session setup is uncommon, so we deliberately do NOT implement a client-side
 * confirmation flow — we fail cleanly with its own message instead.
 */
export const CARD_REQUIRES_ACTION_MESSAGE =
  'This card requires additional verification. Please try a different card.';

/** Any other non-`succeeded` SetupIntent outcome. */
export const CARD_UNUSABLE_MESSAGE =
  'This payment method could not be verified. Please try a different card.';

/**
 * Sanitized view of a Stripe error for logging. Stripe error objects can embed the
 * PaymentMethod (billing_details name/email, card last4), so never log the raw
 * object — the cross-product PII rule forbids it. Type/code/decline_code/request id
 * are the diagnostic content and carry no PII.
 */
const describeStripeError = (error: unknown) => {
  const e = error as {
    type?: unknown;
    code?: unknown;
    decline_code?: unknown;
    requestId?: unknown;
  };
  return {
    stripeErrorType: typeof e?.type === 'string' ? e.type : 'unknown',
    stripeErrorCode: typeof e?.code === 'string' ? e.code : undefined,
    declineCode: typeof e?.decline_code === 'string' ? e.decline_code : undefined,
    stripeRequestId: typeof e?.requestId === 'string' ? e.requestId : undefined,
  };
};

/**
 * Deletes a Stripe customer whose card just failed validation.
 *
 * The customer was created moments earlier by `createCustomer` and has no
 * subscription, invoice, or payment history, so deleting it is safe and keeps the
 * invariant "a Stripe customer exists only for an operator who passed validation".
 * Best-effort: a cleanup failure is logged but never masks the card error, since
 * the card error is what the operator needs to see.
 */
const discardUnvalidatedCustomer = async (
  client: CardValidationClient,
  customerId: string,
): Promise<void> => {
  try {
    await client.customers.del(customerId);
  } catch (error) {
    logger.error('Failed to delete customer after card validation failure', {
      customerId,
      ...describeStripeError(error),
    });
  }
};

/**
 * Confirms an off-session SetupIntent against a just-attached payment method so an
 * unusable card fails signup immediately.
 *
 * Why this is needed: every new subscription carries `trial_period_days`
 * (TRIAL_PERIOD_DAYS), so nothing is charged at signup. Without this check a
 * declined card produces a fully successful signup and the failure only surfaces
 * TRIAL_PERIOD_DAYS later as an `invoice.payment_failed` webhook.
 *
 * Contract: resolves only when the SetupIntent reached `succeeded`. On any other
 * outcome it deletes the customer and throws an HttpsError — callers MUST NOT
 * create a subscription if this rejects.
 */
export const assertPaymentMethodUsable = async (
  client: CardValidationClient,
  customerId: string,
  paymentMethodId: string,
): Promise<void> => {
  let setupIntent: Stripe.SetupIntent;
  try {
    setupIntent = await client.setupIntents.create({
      customer: customerId,
      payment_method: paymentMethodId,
      // Explicit card-only: keeps redirect-based methods (which would demand a
      // return_url) out of an off-session confirm, and makes the outcome set
      // deterministic (succeeded / requires_action / decline error).
      //
      // Stripe's guidance is to never pass payment_method_types, and to use
      // allowed_payment_method_types where an intent genuinely needs an
      // allowlist — which this one does. That parameter does not exist in the
      // pinned SDK (stripe@20.3.1 declares it on neither SetupIntents nor
      // PaymentIntents), so it cannot be adopted until the SDK is upgraded. Do
      // not "fix" this by deleting the line: an off-session confirm with
      // redirect methods enabled fails for want of a return_url.
      payment_method_types: ['card'],
      usage: 'off_session',
      confirm: true,
    });
  } catch (error) {
    logger.error('Card validation SetupIntent failed', {
      customerId,
      ...describeStripeError(error),
    });
    await discardUnvalidatedCustomer(client, customerId);
    // mapStripeError surfaces Stripe's own decline copy for a StripeCardError
    // (useful and safe for the operator) and a generic message otherwise.
    throw mapStripeError(error);
  }

  if (setupIntent.status === 'succeeded') return;

  const requiresAction = setupIntent.status === 'requires_action';
  // Logged (not silent) so the frequency of requires_action is observable.
  logger.warn('Card validation did not succeed', {
    customerId,
    setupIntentStatus: setupIntent.status,
    requiresAction,
  });
  await discardUnvalidatedCustomer(client, customerId);
  throw new HttpsError(
    'failed-precondition',
    requiresAction ? CARD_REQUIRES_ACTION_MESSAGE : CARD_UNUSABLE_MESSAGE,
  );
};
