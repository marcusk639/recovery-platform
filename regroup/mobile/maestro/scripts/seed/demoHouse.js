/**
 * The shared App Review demo account and its demo house, for
 * demo-account-refused.yaml (S5). The account is the one the landing screen's
 * Demo link signs in to (InitialLandingForm.tsx: its email and password are in
 * the app), with the `demo: true` claim that `npm run demo:mark-account` sets
 * in production, and staff claims on a house flagged isDemoHouse, as App
 * Review sees it. Emulator only, like the rest of the seed.
 */
const d = require('./docs');

const DEMO_HOUSE = 'test-house-demo';
const DEMO_UID = 'e2e-demo-user';
const DEMO_EMAIL = 'demo_user@appdemo.net';
// Public by design: the app's Demo link signs in with it.
const DEMO_PASSWORD = 'DemoUser1';

function demoHouse(now) {
  const yearAhead = now + 365 * 86400000;
  const account = {
    uid: DEMO_UID,
    email: DEMO_EMAIL,
    password: DEMO_PASSWORD,
    claims: {
      admin: { [DEMO_HOUSE]: true },
      superAdmin: { [DEMO_HOUSE]: true },
      potentialSuperAdmin: false,
      demo: true,
    },
    user: {
      id: DEMO_UID,
      uid: DEMO_UID,
      email: DEMO_EMAIL,
      firstName: 'Demo',
      lastName: 'User',
      isAdmin: true,
      isSuperAdmin: true,
      isGuest: false,
      isAnonymous: false,
      adminId: DEMO_UID,
      houseId: DEMO_HOUSE,
      orgSetupCompleted: true,
      infoEntered: true,
      potentialSuperAdmin: false,
      housesOwned: [DEMO_HOUSE],
      subscriptionMetadata: {
        status: 'active',
        tier: 'professional',
        maxResidents: 20,
        maxProperties: 3,
        subscriptionId: `sub_${DEMO_UID}`,
        customerId: `cus_${DEMO_UID}`,
        currentPeriodEnd: yearAhead,
        houses: { [DEMO_HOUSE]: { numberOfGuests: 0 } },
        oxfordEnabled: false,
      },
    },
    admin: {
      id: DEMO_UID,
      userId: DEMO_UID,
      email: DEMO_EMAIL,
      firstName: 'Demo',
      lastName: 'User',
      houseIds: [DEMO_HOUSE],
      superAdmin: [DEMO_HOUSE],
      uniqueAdminAttribute: 'admin',
    },
  };
  const house = d.house(DEMO_HOUSE, 'E2E Demo House', DEMO_UID, now, {
    isDemoHouse: true,
    currentCapacity: 0,
  });
  // What scheduled/demoAccountRestore watches (util/demoAccountState.ts).
  const config = { uid: DEMO_UID, tokensValidAfter: null };
  return { account, house, config };
}

module.exports = { DEMO_HOUSE, DEMO_UID, DEMO_EMAIL, demoHouse };
