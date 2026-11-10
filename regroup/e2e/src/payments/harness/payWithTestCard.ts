import type Stripe from 'stripe';

export const paymentIntentId = (clientSecret: string): string => clientSecret.split('_secret_')[0];

/** What the PaymentSheet does with a card: confirms the resident's intent. */
export async function confirmWithCard(
  stripe: Stripe,
  clientSecret: string,
  pm:
    | 'pm_card_visa'
    | 'pm_card_chargeDeclined'
    | 'pm_card_chargeDeclinedInsufficientFunds'
    | 'pm_card_chargeDeclinedExpiredCard',
): Promise<Stripe.PaymentIntent> {
  return stripe.paymentIntents.confirm(paymentIntentId(clientSecret), { payment_method: pm });
}
