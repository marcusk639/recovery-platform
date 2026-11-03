/**
 * The documents the Maestro flows expect, built for the current schema and
 * rules. Identities (ids, emails, names) come from e2e/setup/testAccounts.json.
 *
 * Firebase uids are `e2e-<account id>`; a resident's guests/{id} doc uses the
 * account id itself (guest-a, guest-b), which is what flows tap by testID.
 */
const accounts = require('../../../e2e/setup/testAccounts.json').accounts;

const HOUSE = 'test-house-123';
const OXFORD = 'test-house-oxford';
const account = (id) => accounts.find((a) => a.id === id);
const uidOf = (id) => `e2e-${id}`;
const iso = (now) => new Date(now).toISOString();

function operator(id, houseId, oxford, now) {
  const a = account(id);
  const uid = uidOf(id);
  const yearAhead = now + 365 * 86400000;
  return {
    uid,
    email: a.email,
    claims: {
      admin: { [houseId]: true },
      superAdmin: { [houseId]: true },
      potentialSuperAdmin: false,
    },
    user: {
      id: uid,
      uid,
      email: a.email,
      firstName: a.firstName,
      lastName: a.lastName,
      phoneNumber: a.phone,
      isAdmin: true,
      isSuperAdmin: true,
      isGuest: false,
      isAnonymous: false,
      adminId: uid,
      houseId,
      orgSetupCompleted: true,
      infoEntered: true,
      potentialSuperAdmin: false,
      housesOwned: [houseId],
      ...(oxford ? { houseType: 'oxford' } : {}),
      subscriptionMetadata: {
        status: 'active',
        subscriptionId: `sub_${uid}`,
        customerId: `cus_${uid}`,
        currentPeriodEnd: yearAhead,
        houses: { [houseId]: { numberOfGuests: oxford ? 0 : 2 } },
        oxfordEnabled: !!oxford,
      },
    },
    admin: {
      id: uid,
      userId: uid,
      email: a.email,
      firstName: a.firstName,
      lastName: a.lastName,
      phoneNumber: a.phone,
      houseIds: [houseId],
      superAdmin: [houseId],
      uniqueAdminAttribute: 'admin',
    },
  };
}

function resident(id, rentOwed) {
  const a = account(id);
  const uid = uidOf(id);
  return {
    uid,
    email: a.email,
    claims: { guest: { [HOUSE]: true } },
    user: {
      id: uid,
      uid,
      email: a.email,
      firstName: a.firstName,
      lastName: a.lastName,
      isGuest: true,
      isAdmin: false,
      isSuperAdmin: false,
      isAnonymous: false,
      houseId: HOUSE,
      guestId: id,
      infoEntered: true,
      orgSetupCompleted: false,
      housesOwned: [],
      subscriptionMetadata: { status: '', houses: {}, oxfordEnabled: false },
    },
    guest: {
      id,
      userId: uid,
      houseId: HOUSE,
      firstName: a.firstName,
      lastName: a.lastName,
      displayName: `${a.firstName} ${a.lastName}`,
      email: a.email,
      phoneNumber: a.phone,
      status: 'active',
      phase: 'Default',
      step: 1,
      isAdmin: false,
      infoEntered: true,
      hasJob: false,
      rentOwed,
      choreFees: 0,
      dailyHabit: 0,
      supporters: [],
      jobs: [],
      version: 0,
      sobrietyDate: '2025-01-01',
      drugOfChoice: 'None',
      currentChore: 'Kitchen',
    },
  };
}

function house(id, name, owner, now, extra = {}) {
  return {
    id,
    name,
    ownerId: owner,
    superAdminId: owner,
    adminIds: [owner],
    superAdminIds: [owner],
    subscriptionStatus: 'active',
    houseType: 'traditional',
    isDemoHouse: false,
    stripeStatus: 'not_connected',
    street: '100 Test St',
    city: 'Austin',
    state: 'TX',
    zip: '78701',
    country: 'US',
    lat: 30.2672,
    lng: -97.7431,
    geohash: '9v6kpm',
    timezone: 'America/Chicago',
    maximumCapacity: 10,
    currentCapacity: 2,
    monthlyRent: 0,
    weeklyRent: 0,
    rentFrequency: 'both',
    phases: {
      Default: {
        name: 'Default',
        order: 1,
        rules: {
          meetings: 0,
          nightsOutAllowed: 0,
          supporter: true,
          work: 0,
          chore: true,
          medications: false,
        },
      },
    },
    chores: {
      Kitchen: { name: 'Kitchen', description: 'Clean the kitchen.' },
      Bathroom: { name: 'Bathroom', description: 'Clean the bathroom.' },
    },
    rooms: {},
    issues: {},
    complaints: {},
    disputes: {},
    applications: {},
    health: {},
    awaitingVerification: [],
    managerSetupType: 'operator-only',
    createdAt: iso(now),
    ...extra,
  };
}

function activity(guestId, hoursAgo, Timestamp, now, extra = {}) {
  const at = Timestamp.fromMillis(now - hoursAgo * 3600000);
  const uid = uidOf(guestId);
  return {
    guestId,
    houseId: HOUSE,
    type: 'chore',
    residentUid: uid,
    loggedBy: uid,
    verified: false,
    status: 'active',
    timestamp: at,
    loggedAt: at,
    data: { type: 'chore', choreType: 'Kitchen', choreName: 'Kitchen' },
    ...extra,
  };
}

/**
 * Card payments as the Stripe webhook writes them: createdAt is a Timestamp.
 * e2e-pay-a-latest is dated two hours after the seed, so a manual payment a
 * flow records afterwards must sort BELOW it. A manual record stored with a
 * string createdAt (the bug fixed in #168) would sort above every Timestamp.
 */
function payments(Timestamp, now) {
  const card = (id, guestId, amount, offsetMs) => ({
    id,
    guestId,
    houseId: HOUSE,
    guestUserId: uidOf(guestId),
    amount,
    description: 'Rent Payment',
    status: 'succeeded',
    stripePaymentIntentId: `pi_${id}`,
    createdAt: Timestamp.fromMillis(now + offsetMs),
  });
  return [
    card('e2e-pay-a-latest', 'guest-a', 2222, 2 * 3600000),
    card('e2e-pay-a-old', 'guest-a', 1111, -5 * 86400000),
    card('e2e-pay-b', 'guest-b', 7777, -86400000),
  ];
}

module.exports = { HOUSE, OXFORD, uidOf, iso, operator, resident, house, activity, payments };
