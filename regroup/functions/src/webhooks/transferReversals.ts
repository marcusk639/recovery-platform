/**
 * Pull rent back from a house when it's refunded or disputed, and give it back
 * when a dispute is won.
 *
 * Rent is a destination charge: the house's Connect account receives the
 * charge as a transfer, and the platform takes its application fee. Stripe
 * debits a refund or a dispute from the PLATFORM balance and, by default,
 * leaves the transfer alone. Without reversing it, the house keeps rent it no
 * longer earned and the platform carries the loss. Refunds are issued from the
 * Stripe Dashboard, so this runs from the webhook, not from a refund call.
 *
 * Amount: the house gives back only its net share, `amount × (charge − fee) /
 * charge`. That is what it actually received, so the platform forgoes its fee
 * on the refunded or disputed part. Economically this is Stripe's
 * `refund_application_fee` behaviour, done as a single exact reversal so a won
 * dispute can return precisely what was taken.
 *
 * Exactly once: Stripe idempotency keys expire after 24 hours, and a later
 * refund event on the same charge re-scans earlier refunds. Each reversal
 * therefore carries the refund or dispute id in its metadata, and existing
 * reversals are checked before creating one. Idempotency keys still guard
 * concurrent retries of the same event.
 *
 * Stripe errors propagate, so the webhook releases the event for retry. The one
 * exception is a charge lookup that answers resource_missing for an event that
 * belongs to a connected account or to the other Stripe mode: that event was never
 * ours to act on, so it is acknowledged (see retrieveChargeOrNull).
 */
import type Stripe from 'stripe';
import { logger } from 'firebase-functions';
import { isResourceMissing } from '../util/stripe';

/** Dispute statuses in which Stripe has taken the disputed money from the platform. */
const FUNDS_WITHDRAWN: ReadonlySet<Stripe.Dispute.Status> = new Set([
  'needs_response',
  'under_review',
  'lost',
]);

/** The part of `amount` the house actually received: pro rata to charge minus platform fee. */
export function houseNetShare(
  amount: number,
  charge: Pick<Stripe.Charge, 'amount' | 'application_fee_amount'>,
): number {
  if (!(amount > 0) || !(charge.amount > 0)) return 0;
  const fee = charge.application_fee_amount ?? 0;
  return Math.max(0, Math.round((amount * (charge.amount - fee)) / charge.amount));
}

function transferIdOf(charge: Stripe.Charge): string | null {
  const t = charge.transfer;
  return typeof t === 'string' ? t : (t?.id ?? null);
}

function chargeIdOf(dispute: Stripe.Dispute): string | null {
  return typeof dispute.charge === 'string' ? dispute.charge : (dispute.charge?.id ?? null);
}

async function existingReversals(
  stripe: Stripe,
  transferId: string,
): Promise<Stripe.TransferReversal[]> {
  return (await stripe.transfers.listReversals(transferId, { limit: 100 })).data;
}

/** What the webhook knows about the event that triggered a reversal step. */
export interface EventContext {
  eventType: string;
  /** event.account: set when a connected-account event reached the platform handler. */
  account?: string | null;
  /** event.livemode, when Stripe sent it. Absent is treated as same-mode. */
  livemode?: boolean;
  /**
   * deployedStripeMode() === 'live': true unless the deployed key is a test key
   * (an unset or unrecognised key counts as live).
   */
  deployedLivemode: boolean;
}

/**
 * Retrieves the charge a refund or dispute event points at.
 *
 * resource_missing is acknowledged (null) only when the event was never ours to
 * act on: it carries a connected-account id, or it carries a livemode that
 * differs from the deployed mode. verifyStripeWebhook already rejects
 * other-mode events, so that second branch is defence in depth; don't relax
 * the verifier on the strength of it. Otherwise it is rethrown after an error log.
 * A signed, same-mode platform event whose charge the key cannot see means a
 * wrong key or account, and acknowledging would mark the event done and drop
 * the reversal for good; a 500 lets Stripe retry until that is fixed.
 *
 * Scoped to this one lookup on purpose: resource_missing from any later call (a
 * stale transfer, a deleted destination) also propagates.
 */
async function retrieveChargeOrNull(
  stripe: Stripe,
  chargeId: string,
  ctx: EventContext,
): Promise<Stripe.Charge | null> {
  try {
    return await stripe.charges.retrieve(chargeId);
  } catch (err) {
    if (!isResourceMissing(err)) throw err;
    const otherMode = ctx.livemode !== undefined && ctx.livemode !== ctx.deployedLivemode;
    if (ctx.account || otherMode) {
      logger.info('transferReversals: charge not found in Stripe, event not ours; ignoring', {
        eventType: ctx.eventType,
        chargeId,
        account: ctx.account ?? null,
      });
      return null;
    }
    logger.error('transferReversals: charge not found for a same-mode platform event', {
      eventType: ctx.eventType,
      chargeId,
    });
    throw err;
  }
}

/** Reversible amount left on the transfer, so a reversal can't overshoot. */
async function remainingOnTransfer(stripe: Stripe, transferId: string): Promise<Stripe.Transfer> {
  return stripe.transfers.retrieve(transferId);
}

/**
 * Reverse the house's net share of every settled refund on a charge that
 * hasn't already been reversed. Returns how many reversals were created.
 */
export async function reverseTransfersForRefunds(
  stripe: Stripe,
  chargeId: string,
  ctx: EventContext,
): Promise<number> {
  const charge = await retrieveChargeOrNull(stripe, chargeId, ctx);
  if (!charge) return 0;
  const transferId = transferIdOf(charge);
  if (!transferId) {
    logger.info(
      'transferReversals: refunded charge has no transfer to a house; nothing to reverse',
      {
        chargeId,
      },
    );
    return 0;
  }

  const refunds = (await stripe.refunds.list({ charge: chargeId, limit: 100 })).data;
  const done = new Set(
    (await existingReversals(stripe, transferId)).map((r) => r.metadata?.refundId).filter(Boolean),
  );

  let created = 0;
  for (const refund of refunds) {
    // Pending refunds can still fail, returning the money to the platform;
    // charge.refund.updated brings them back here once they settle.
    if (refund.status !== 'succeeded') continue;
    // Refunded with reverse_transfer (e.g. ticked in the Dashboard): Stripe
    // already pulled it back.
    if (refund.transfer_reversal) continue;
    if (done.has(refund.id)) continue;

    const transfer = await remainingOnTransfer(stripe, transferId);
    const amount = Math.min(
      houseNetShare(refund.amount, charge),
      transfer.amount - transfer.amount_reversed,
    );
    if (amount <= 0) continue;

    const reversal = await stripe.transfers.createReversal(
      transferId,
      { amount, metadata: { reason: 'refund', refundId: refund.id, chargeId } },
      { idempotencyKey: `refund-reversal-${refund.id}` },
    );
    created += 1;
    logger.info('transferReversals: reversed house share of a refund', {
      chargeId,
      refundId: refund.id,
      reversalId: reversal.id,
      amount,
    });
  }
  return created;
}

/**
 * Pull the house's net share of a dispute once Stripe has taken the money.
 * Inquiries (`warning_*`) and `prevented` disputes take nothing, so nothing is
 * pulled. Returns true when a reversal was created.
 */
export async function reverseTransferForDispute(
  stripe: Stripe,
  dispute: Stripe.Dispute,
  ctx: EventContext,
): Promise<boolean> {
  if (!FUNDS_WITHDRAWN.has(dispute.status)) return false;

  const chargeId = chargeIdOf(dispute);
  if (!chargeId) return false;
  const charge = await retrieveChargeOrNull(stripe, chargeId, ctx);
  if (!charge) return false;
  const transferId = transferIdOf(charge);
  if (!transferId) {
    logger.info(
      'transferReversals: disputed charge has no transfer to a house; nothing to reverse',
      {
        chargeId,
        disputeId: dispute.id,
      },
    );
    return false;
  }

  const reversals = await existingReversals(stripe, transferId);
  if (reversals.some((r) => r.metadata?.disputeId === dispute.id)) return false;

  const transfer = await remainingOnTransfer(stripe, transferId);
  const amount = Math.min(
    houseNetShare(dispute.amount, charge),
    transfer.amount - transfer.amount_reversed,
  );
  if (amount <= 0) return false;

  const reversal = await stripe.transfers.createReversal(
    transferId,
    { amount, metadata: { reason: 'dispute', disputeId: dispute.id, chargeId } },
    { idempotencyKey: `dispute-reversal-${dispute.id}` },
  );
  logger.info('transferReversals: reversed house share of a dispute', {
    chargeId,
    disputeId: dispute.id,
    reversalId: reversal.id,
    amount,
  });
  return true;
}

/**
 * When a dispute is won, Stripe returns the money to the platform; transfer
 * exactly what the dispute reversal took back to the same house. Returns true
 * when a transfer was created.
 */
export async function restoreTransferAfterWonDispute(
  stripe: Stripe,
  dispute: Stripe.Dispute,
  ctx: EventContext,
): Promise<boolean> {
  if (dispute.status !== 'won') return false;

  const chargeId = chargeIdOf(dispute);
  if (!chargeId) return false;
  const charge = await retrieveChargeOrNull(stripe, chargeId, ctx);
  if (!charge) return false;
  const transferId = transferIdOf(charge);
  if (!transferId) return false;

  const reversal = (await existingReversals(stripe, transferId)).find(
    (r) => r.metadata?.disputeId === dispute.id,
  );
  if (!reversal) {
    logger.info('transferReversals: won dispute had no reversal to restore', {
      chargeId,
      disputeId: dispute.id,
    });
    return false;
  }

  const group = `dispute-restore-${dispute.id}`;
  if ((await stripe.transfers.list({ transfer_group: group, limit: 1 })).data.length > 0)
    return false;

  const transfer = await remainingOnTransfer(stripe, transferId);
  const destination =
    typeof transfer.destination === 'string' ? transfer.destination : transfer.destination?.id;
  if (!destination) {
    logger.error('transferReversals: original transfer has no destination; cannot restore', {
      transferId,
      disputeId: dispute.id,
    });
    return false;
  }

  await stripe.transfers.create(
    {
      amount: reversal.amount,
      currency: reversal.currency,
      destination,
      transfer_group: group,
      metadata: { reason: 'dispute_won', disputeId: dispute.id, reversalId: reversal.id, chargeId },
    },
    { idempotencyKey: group },
  );
  logger.info('transferReversals: returned house share after a won dispute', {
    chargeId,
    disputeId: dispute.id,
    amount: reversal.amount,
  });
  return true;
}
