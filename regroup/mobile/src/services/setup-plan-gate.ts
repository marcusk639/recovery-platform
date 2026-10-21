import { OperatorSubscription } from '../entities/User';

// operatorStatusToHouseStatus (functions/src/util/entitlement.ts) maps these
// to an active or trialing house; "cancelling" still bills until period end.
const ENTITLED_STATUSES = new Set(['active', 'trialing', 'cancelling']);

/**
 * Client mirror of the createHouses entitlement gate, assertCanCreateHouses in
 * functions/src/houses/createHousesTx.ts: subscription metadata with a tier
 * and an entitled status. Evaluate it on a fresh read of the user doc — the
 * Redux copy is not updated when the operator subscribes on the web.
 */
export const canCreateHouses = (meta: Partial<OperatorSubscription> | null | undefined): boolean =>
  !!meta && !!meta.tier && ENTITLED_STATUSES.has(String(meta.status ?? ''));
