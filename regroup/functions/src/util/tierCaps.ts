// Cap-enforcement helpers for the tier (flat-fee) billing model. Unlike the
// legacy per-unit quantity model, tier subscriptions bill a flat fee and instead
// enforce maxResidents / maxProperties caps when adding residents or houses.

// `current` is the count BEFORE adding one more. Returns whether adding one
// stays within cap. A null cap means unlimited.
export const withinResidentCap = (
  current: number,
  cap: number | null,
): boolean => cap === null || current < cap;

export const withinPropertyCap = (
  current: number,
  cap: number | null,
): boolean => cap === null || current < cap;

// Sums the tracked resident occupancy across all houses in subscription metadata.
export const totalResidents = (meta: {
  houses?: { [houseId: string]: { numberOfGuests: number } };
}): number =>
  Object.values(meta.houses ?? {}).reduce(
    (sum, house) => sum + (house.numberOfGuests ?? 0),
    0,
  );
