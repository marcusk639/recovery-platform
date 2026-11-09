#!/usr/bin/env node
/**
 * Reset the local Firebase emulators and seed the fixtures the Maestro flows
 * expect. Emulator-only: guard.js refuses any project that is not demo- and any
 * non-loopback emulator host.
 *
 *   E2E_TEST_PASSWORD=... node maestro/scripts/seed/index.js
 *
 * Optional env:
 *   GCLOUD_PROJECT          default demo-regroup-e2e (what the E2EEmulator app uses)
 *   E2E_STRIPE_ACCOUNT_ID   a test-mode connected account in the e2e Stripe sandbox.
 *                           Needed by flows that load Stripe data (the payment
 *                           dashboard, the PaymentSheet); without it the house
 *                           gets a placeholder and those screens fail to load.
 *   E2E_RENT_CENTS          resident A's balance, default 15000. The PaymentSheet's
 *                           idempotency key includes the amount, so vary it to
 *                           repeat a pay case against the same sandbox.
 *
 * Needs the auth, firestore and functions emulators: the seed waits for
 * Firestore triggers (house subscription status, the dispute mirror) to settle.
 * Logs ids and counts only.
 */
const { seedTarget } = require('./guard');

const target = seedTarget(process.env);
process.env.GCLOUD_PROJECT = target.projectId;
process.env.FIRESTORE_EMULATOR_HOST = target.firestoreHost;
process.env.FIREBASE_AUTH_EMULATOR_HOST = target.authHost;

const { initializeApp } = require('firebase-admin/app');
const { getAuth } = require('firebase-admin/auth');
const { getFirestore, Timestamp } = require('firebase-admin/firestore');
const d = require('./docs');

const PLACEHOLDER_STRIPE_ACCOUNT = 'acct_e2e_placeholder';
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function resetEmulators({ projectId, firestoreHost, authHost }) {
  const urls = [
    `http://${firestoreHost}/emulator/v1/projects/${projectId}/databases/(default)/documents`,
    `http://${authHost}/emulator/v1/projects/${projectId}/accounts`,
  ];
  for (const url of urls) {
    const res = await fetch(url, { method: 'DELETE' });
    if (!res.ok) {
      throw new Error(`Emulator reset failed (${res.status}) for ${url}`);
    }
  }
}

async function main() {
  initializeApp({ projectId: target.projectId });
  const auth = getAuth();
  const db = getFirestore();
  const now = Date.now();
  const stripeAccountId = process.env.E2E_STRIPE_ACCOUNT_ID || PLACEHOLDER_STRIPE_ACCOUNT;

  await resetEmulators(target);

  const manager = d.operator('manager', d.HOUSE, false, now);
  const oxford = d.operator('oxford-operator', d.OXFORD, true, now);
  const guestA = d.resident('guest-a', Number(process.env.E2E_RENT_CENTS || 15000));
  const guestB = d.resident('guest-b', 0);
  // Not onboarded yet, for oxford-onboarding.yaml. The other Oxford house has finished.
  const oxfordNew = d.operator('oxford-new-operator', d.OXFORD_NEW, true, now);
  const people = [manager, oxford, oxfordNew, guestA, guestB];

  // 1. Accounts, claims and users docs, before houses: the subscription trigger reads them.
  for (const p of people) {
    await auth.createUser({
      uid: p.uid,
      email: p.email,
      password: target.password,
      emailVerified: true,
    });
    await auth.setCustomUserClaims(p.uid, p.claims);
    await db.doc(`users/${p.uid}`).set(p.user);
  }
  for (const p of [manager, oxford, oxfordNew]) {
    await db.doc(`admins/${p.uid}`).set(p.admin);
  }
  await sleep(1500);

  // 2. Houses and their owner role records.
  await db.doc(`houses/${d.HOUSE}`).set(
    d.house(d.HOUSE, 'E2E Test House', manager.uid, now, {
      stripeAccountId,
      stripeStatus: 'active',
    }),
  );
  await db.doc(`houses/${d.OXFORD}`).set(
    d.house(d.OXFORD, 'E2E Oxford House', oxford.uid, now, {
      houseType: 'oxford',
      oxfordOnboardingComplete: true,
      oxfordEnabled: true,
      currentCapacity: 0,
    }),
  );
  const ownerRole = {
    tier: 'owner',
    primary: true,
    grantedBy: 'seed',
    grantedAt: d.iso(now),
    via: 'seed',
  };
  await db.doc(`house-roles/${d.HOUSE}_${manager.uid}`).set(ownerRole);
  await db.doc(`house-roles/${d.OXFORD}_${oxford.uid}`).set(ownerRole);
  await db.doc(`houses/${d.OXFORD_NEW}`).set(
    d.house(d.OXFORD_NEW, 'E2E New Oxford House', oxfordNew.uid, now, {
      houseType: 'oxford',
      oxfordOnboardingComplete: false,
      oxfordEnabled: true,
      currentCapacity: 0,
    }),
  );
  await db.doc(`house-roles/${d.OXFORD_NEW}_${oxfordNew.uid}`).set(ownerRole);

  // 3. Residents.
  for (const g of [guestA, guestB]) {
    await db.doc(`guests/${g.guest.id}`).set(g.guest);
  }

  // 4. This week's activities: guest-b's (guest-a can dispute them) and one already disputed.
  await db.doc('activities/test-activity-b1').set(d.activity('guest-b', 1, Timestamp, now));
  await db.doc('activities/test-activity-b2').set(
    d.activity('guest-b', 2, Timestamp, now, {
      type: 'meeting',
      data: { type: 'meeting', meetingName: 'AA Monday', meetingType: 'AA', duration: 60 },
    }),
  );
  await db.doc('activities/test-activity-123').set(
    d.activity('guest-a', 3, Timestamp, now, {
      status: 'disputed',
      disputeReason: 'Kitchen was not cleaned.',
      disputedBy: guestB.uid,
      disputedAt: Timestamp.fromMillis(now - 3600000),
    }),
  );

  // 5. Payments.
  for (const p of d.payments(Timestamp, now)) {
    await db.doc(`payments/${p.id}`).set(p);
  }

  await db.doc(`houses/${d.HOUSE}/applications/test-app-1`).set(d.application(now));

  // 6. After the dispute-mirror trigger runs, pin the entry the operator flow looks for.
  await sleep(4000);
  await db.doc(`house-disputes/${d.HOUSE}`).set({
    disputes: {
      'test-activity-123': {
        id: 'test-dispute-123',
        activityId: 'test-activity-123',
        guestId: 'guest-a',
        houseId: d.HOUSE,
        type: 'chore',
        message: 'Kitchen was not cleaned.',
        disputedBy: guestB.uid,
        status: 'pending',
        challenges: [],
        createdAt: d.iso(now),
        updatedAt: d.iso(now),
      },
    },
  });

  // 7. The reset fires onGuestWrite delete events for the previous run's guest
  // docs; one that lands after step 1 revokes the fresh guest claims. Re-apply last.
  await sleep(2000);
  for (const p of people) {
    await auth.setCustomUserClaims(p.uid, p.claims);
  }

  const payments = await db.collection('payments').get();
  console.log(
    `Seeded ${target.projectId}: ${people.length} accounts, 2 houses, 3 activities, ` +
      `${payments.size} payments.` +
      (stripeAccountId === PLACEHOLDER_STRIPE_ACCOUNT
        ? ' E2E_STRIPE_ACCOUNT_ID is not set: the payment dashboard and PaymentSheet flows will fail.'
        : ''),
  );
}

main().then(
  () => process.exit(0),
  (err) => {
    console.error('Seed failed:', err);
    process.exit(1);
  },
);
