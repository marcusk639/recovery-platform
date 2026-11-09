// Test data the seed doesn't set up, added by the specs that need it.
import { getAuth } from 'firebase-admin/auth';
import { admin, type Account } from './helpers';

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
