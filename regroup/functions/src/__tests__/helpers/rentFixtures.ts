// Fixtures for the chargeResident suites. Not a suite (jest matches *.test.ts).
import { mem } from './memFirestore';

export const H = 'H';
export const MAX = Number.MAX_SAFE_INTEGER;
// Noon in New York on the given date.
export const at = (date: string) => new Date(`${date}T17:00:00Z`);

// The charging-start stamp is server-only state (rentHouseStates/{houseId}); the
// rentChargesStartDate / rentChargesStartedAtMs overrides here go there.
export const house = (o: Record<string, unknown> = {}, id = H) => {
  const {
    rentChargesStartDate = '2026-11-11',
    rentChargesStartedAtMs = 0,
    ...rest
  } = o as Record<string, unknown>;
  mem.seed(`houses/${id}`, {
    rentFrequency: 'weekly',
    weeklyRent: 175,
    monthlyRent: 800,
    timezone: 'America/New_York',
    stripeAccountId: 'acct_1',
    ...rest,
  });
  mem.seed(`rentHouseStates/${id}`, {
    startDate: rentChargesStartDate,
    startedAtMs: rentChargesStartedAtMs,
  });
};
export const restamp = (startDate: string | null, startedAtMs: number | null, id = H) =>
  mem.seed(`rentHouseStates/${id}`, { startDate, startedAtMs });
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
// The invitation behind an account's admission to a house. Its invitedEmail is what
// staff typed when inviting; linkIntakeRecord matches on it, not on the email the
// account's own guest record carries.
export const invitedAs = (uid: string, invitedEmail: string, houseId = H) => {
  mem.seed(`admission-tickets/${uid}_${houseId}`, { invitationId: `inv_${uid}`, used: true });
  mem.seed(`invitations/inv_${uid}`, { invitedEmail, houseId });
};
export const owed = () => mem.get('guests/g1')?.rentOwed;
export const charges = () => mem.paths('rentCharges/');
