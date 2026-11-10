// Test data the seed doesn't set up, added by the specs that need it.
import { getAuth } from 'firebase-admin/auth';
import { formatInTimeZone } from 'date-fns-tz';
import { admin, SECOND_HOUSE, type Account } from './helpers';

const EMAILS: Record<Account, string> = {
  manager: 'test-manager@rats-e2e.com',
  'oxford-operator': 'test-oxford-operator@rats-e2e.com',
};
const HOUSES: Record<Account, string> = { manager: 'test-house-123', 'oxford-operator': 'test-house-oxford' };

// Keeps the admin claim and drops superAdmin. The role record is lowered too, or
// the sign-in recovery would re-grant the claim to a primary owner.
async function makeStaff(account: Account, tier: 'manager' | 'peerLeader'): Promise<void> {
  const user = await getAuth().getUserByEmail(EMAILS[account]);
  const house = HOUSES[account];
  await admin().doc(`house-roles/${house}_${user.uid}`).set({ tier, primary: false, houseId: house, grantedBy: 'test', via: 'test' });
  const claims = (user.customClaims ?? {}) as { admin?: object };
  await getAuth().setCustomUserClaims(user.uid, { admin: { ...claims.admin, [house]: true } });
  await admin().doc(`users/${user.uid}`).update({ isSuperAdmin: false });
}

export const makeManager = (account: Account) => makeStaff(account, 'manager');
export const makePeerLeader = (account: Account) => makeStaff(account, 'peerLeader');

export const twoBedsOneFilled = {
  '2A': { id: '2A', beds: { b1: { id: 'b1', guestId: 'guest-a' }, b2: { id: 'b2', guestId: null } } },
};

export const setRooms = (houseId: string, rooms: object) => admin().doc(`houses/${houseId}`).update({ rooms });

// The Monday the app reads for, the same as useCurrentWeek in the seed house's zone.
export function weekStart(timeZone = 'America/Chicago'): string {
  const d = new Date(`${formatInTimeZone(new Date(), timeZone, 'yyyy-MM-dd')}T00:00:00Z`);
  const day = d.getUTCDay();
  d.setUTCDate(d.getUTCDate() + (day === 0 ? -6 : 1 - day));
  return d.toISOString().split('T')[0];
}

type Stats = { meetingsAttended: number; hoursWorked: number; choresCompleted: number; primarySupporterMet: number; medicationTaken: number };

// The rules read the summary's houseId, so it carries the guest's.
export async function setWeekStats(guestId: string, stats: Partial<Stats>): Promise<void> {
  const guest = (await admin().doc(`guests/${guestId}`).get()).data()!;
  const startDate = weekStart();
  await admin().doc(`week-summaries/${guestId}_${startDate}`).set({
    id: `${guestId}_${startDate}`,
    guestId,
    houseId: guest.houseId,
    startDate,
    stats: { meetingsAttended: 0, hoursWorked: 0, choresCompleted: 0, primarySupporterMet: 0, medicationTaken: 0, ...stats },
    dailyStats: {},
    lastUpdated: new Date().toISOString(),
  });
}

export async function addHouseClaim(account: Account, houseId: string): Promise<void> {
  const user = await getAuth().getUserByEmail(EMAILS[account]);
  const claims = (user.customClaims ?? {}) as { admin?: object; superAdmin?: object };
  await getAuth().setCustomUserClaims(user.uid, {
    ...claims,
    admin: { ...claims.admin, [houseId]: true },
    superAdmin: { ...claims.superAdmin, [houseId]: true },
  });
}

export async function removeSecondHouse(): Promise<void> {
  const user = await getAuth().getUserByEmail(EMAILS.manager);
  const claims = (user.customClaims ?? {}) as { admin?: Record<string, boolean>; superAdmin?: Record<string, boolean> };
  const without = (map: Record<string, boolean> = {}) => Object.fromEntries(Object.entries(map).filter(([id]) => id !== SECOND_HOUSE));
  await admin().doc(`house-roles/${SECOND_HOUSE}_${user.uid}`).delete();
  await getAuth().setCustomUserClaims(user.uid, { ...claims, admin: without(claims.admin), superAdmin: without(claims.superAdmin) });
}

export async function addOxfordResident(rentOwed: number): Promise<void> {
  const guest = (await admin().doc('guests/guest-b').get()).data()!;
  await admin().doc('guests/guest-ox').set({
    ...guest,
    id: 'guest-ox',
    userId: '',
    houseId: 'test-house-oxford',
    firstName: 'Olive',
    lastName: 'Oxford',
    displayName: 'Olive Oxford',
    rentOwed,
  });
}

// Ids can't hold '_', because the rules split summary ids on it.
export async function addResidents(houseId: string, count: number): Promise<void> {
  const guest = (await admin().doc('guests/guest-b').get()).data()!;
  const batch = admin().batch();
  for (let i = 0; i < count; i++) {
    batch.set(admin().doc(`guests/zed${i}`), {
      ...guest,
      id: `zed${i}`,
      userId: '',
      houseId,
      firstName: 'Zed',
      lastName: `Resident${i}`,
      displayName: `Zed Resident${i}`,
      phase: 'Default',
      rentOwed: 0,
    });
  }
  await batch.commit();
}

export const uidOf = async (account: Account) => (await getAuth().getUserByEmail(EMAILS[account])).uid;
