// Fixtures for the chargeResident suites. Not a suite (jest matches *.test.ts).
import { mem } from './memFirestore';

export const H = 'H';
export const MAX = Number.MAX_SAFE_INTEGER;
// Noon in New York on the given date.
export const at = (date: string) => new Date(`${date}T17:00:00Z`);

export const house = (o: Record<string, unknown> = {}, id = H) =>
  mem.seed(`houses/${id}`, {
    rentFrequency: 'weekly',
    weeklyRent: 175,
    monthlyRent: 800,
    timezone: 'America/New_York',
    rentChargesStartDate: '2026-11-11',
    rentChargesStartedAtMs: 0,
    stripeAccountId: 'acct_1',
    ...o,
  });
export const guest = (o: Record<string, unknown> = {}, id = 'g1') =>
  mem.seed(`guests/${id}`, {
    houseId: H,
    userId: 'u1',
    status: 'active',
    rentOwed: 0,
    moveInDate: '2026-11-18',
    ...o,
  });
export const account = (o: Record<string, unknown> = {}) =>
  mem.seed('rentAccounts/g1', {
    guestId: 'g1',
    houseId: H,
    houseJoinedAtMs: 1,
    joinedOn: '2026-11-11',
    reactivatedOn: null,
    anchoredTo: '2026-11-11',
    chargeFrom: '2026-11-11',
    chargedThrough: null,
    updatedAtMs: 1,
    ...o,
  });
export const owed = () => mem.get('guests/g1')?.rentOwed;
export const charges = () => mem.paths('rentCharges/');
