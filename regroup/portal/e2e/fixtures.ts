// Test data the seed doesn't set up, added by the specs that need it.
import { getAuth } from 'firebase-admin/auth';
import { formatInTimeZone } from 'date-fns-tz';
import type { Browser, Page } from '@playwright/test';
import { admin, SECOND_HOUSE, signInAs, signInAsRaw, type Account } from './helpers';

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
export async function setWeekStats(guestId: string, stats: Partial<Stats>, startDate = weekStart()): Promise<void> {
  const guest = (await admin().doc(`guests/${guestId}`).get()).data()!;
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

// Mondays before this week's, newest first.
export function earlierWeeks(count: number): string[] {
  const start = new Date(`${weekStart()}T00:00:00Z`);
  return Array.from({ length: count }, (_, i) => {
    const d = new Date(start);
    d.setUTCDate(d.getUTCDate() - 7 * (i + 1));
    return d.toISOString().split('T')[0];
  });
}

// A next phase after the seed's Default, so a compliant resident can advance.
export async function addSecondPhase(houseId = 'test-house-123'): Promise<void> {
  await admin().doc(`houses/${houseId}`).update({
    'phases.Phase 2': {
      name: 'Phase 2',
      order: 2,
      rules: { meetings: 0, nightsOutAllowed: 0, supporter: true, work: 0, chore: true, medications: false },
    },
  });
}

// Gives a resident's own account the manager tier, so staff ranked below can't discharge them.
export async function makeResidentAManager(uid: string, houseId = 'test-house-123'): Promise<void> {
  await admin().doc(`house-roles/${houseId}_${uid}`).set({ tier: 'manager', primary: false, houseId, grantedBy: 'test', via: 'test' });
  const user = await getAuth().getUser(uid);
  const claims = (user.customClaims ?? {}) as { admin?: object };
  await getAuth().setCustomUserClaims(uid, { ...claims, admin: { ...claims.admin, [houseId]: true } });
}

// A manager made the way the app makes one: the owner's createInvitation, then
// redeemInvitation as the invited account (claims and house-roles, server-side),
// then the users and admins docs SignUpForm writes. Unlike the seeded operator,
// their uid is in neither ownerId nor adminIds, and their admins doc id is random.
export async function addInvitedManager(
  browser: Browser,
  houseId = 'test-house-123',
): Promise<{ email: string; uid: string; adminId: string }> {
  const email = `invited-manager-${Date.now()}@rats-e2e.com`;
  const user = await getAuth().createUser({ email, password: process.env.E2E_TEST_PASSWORD!, emailVerified: true });
  const call = async (signIn: (page: Page) => Promise<void>, name: string, data: object) => {
    const context = await browser.newContext();
    try {
      const page = await context.newPage();
      await signIn(page);
      await page.waitForFunction(() => (window as any).__portalTest?.uid?.());
      return await page.evaluate(({ name, data }) => (window as any).__portalTest.callable(name, data), { name, data });
    } finally {
      await context.close();
    }
  };
  const { data } = await call((page) => signInAs(page, 'manager'), 'createInvitation', { email, houseId, role: 'admin' });
  const adminId = admin().collection('admins').doc().id;
  const profile = { email, firstName: 'Ivy', lastName: 'Invited' };
  await admin().doc(`users/${user.uid}`).set({
    id: user.uid, uid: user.uid, ...profile,
    isAdmin: true, isSuperAdmin: false, isGuest: false, isAnonymous: false,
    adminId, infoEntered: true, orgSetupCompleted: true,
  });
  await admin().doc(`admins/${adminId}`).set({ id: adminId, userId: user.uid, ...profile, houseIds: [houseId], superAdmin: [] });
  await call((page) => signInAsRaw(page, email), 'redeemInvitation', { token: data.token });
  return { email, uid: user.uid, adminId };
}

// The seed writes three Stripe-style records; money tests start from none.
export async function clearPayments(houseId = 'test-house-123'): Promise<void> {
  const snap = await admin().collection('payments').where('houseId', '==', houseId).get();
  await Promise.all(snap.docs.map((d) => d.ref.delete()));
}
