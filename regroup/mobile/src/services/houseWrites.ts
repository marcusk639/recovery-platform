/**
 * House fields only the server writes. firestore.rules refuses any client
 * change to them on houses/{houseId} (its test pins this list to the rule), so
 * a whole-house save holding an older value than the server's would fail
 * outright. stripeAccountId and stripeStatus decide where rent goes.
 */
export const SERVER_OWNED_HOUSE_FIELDS = [
  'subscriptionStatus',
  'guestGraceEndsAt',
  'stripeAccountApi',
  'superAdminId',
  'houseType',
  'ownerId',
  'rentChargesStartDate',
  'rentChargesStartedAtMs',
  'stripeAccountId',
  'stripeStatus',
] as const;

/**
 * A copy of a house write without the server-owned fields. An update that
 * omits a field leaves the server's value in place.
 */
export function withoutServerOwnedHouseFields<T extends object>(house: T): T {
  const copy = { ...house } as Record<string, unknown>;
  for (const field of SERVER_OWNED_HOUSE_FIELDS) {
    delete copy[field];
  }
  return copy as T;
}
