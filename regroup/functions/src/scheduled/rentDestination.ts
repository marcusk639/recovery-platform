/**
 * Where an autopay rent charge is sent: the guest's house's Stripe Connect
 * account, read from the house document.
 *
 * Autopay used to take the destination from `guest.stripeConnectId`, a field
 * nothing in the app writes. Every charge therefore went out with no
 * `transfer_data`, so the resident's full rent settled in the platform balance
 * and the house received nothing. The house document is the only place the
 * connected account is recorded (connectStripeAccount writes it), and its
 * `stripeStatus` is the same gate `createPaymentIntent` applies to one-off rent.
 */
import { houseCollection } from '../api/firestore';

export interface RentDestination {
  /** The house's Stripe Connect account id. */
  accountId: string;
}

/**
 * Resolves a house's destination, or null when the house can't receive rent
 * right now: missing, no connected account, or not `active`. A failed read
 * rejects; it is not the same as "not ready" and must surface as a failure.
 */
export type RentDestinationLookup = (
  houseId: string | undefined,
) => Promise<RentDestination | null>;

/**
 * One lookup per collection run. Each house is read once however many of its
 * guests are due, and every guest in the run sees the same answer.
 */
export function createRentDestinationLookup(): RentDestinationLookup {
  const byHouse = new Map<string, Promise<RentDestination | null>>();

  return (houseId) => {
    if (!houseId) return Promise.resolve(null);

    let pending = byHouse.get(houseId);
    if (!pending) {
      pending = houseCollection
        .doc(houseId)
        .get()
        .then((snap) => {
          const house = snap.exists ? snap.data() : undefined;
          const accountId = house?.stripeAccountId;
          if (typeof accountId !== 'string' || accountId === '') return null;
          if (house?.stripeStatus !== 'active') return null;
          return { accountId };
        });
      byHouse.set(houseId, pending);
    }
    return pending;
  };
}
