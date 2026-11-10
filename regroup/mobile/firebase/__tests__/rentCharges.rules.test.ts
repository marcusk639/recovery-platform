/**
 * Firestore Security Rules Tests — rent settings, rent charges and own-balance edits.
 *
 * The server charges rent from the house's price (functions src/rent/). These rules
 * keep its records server-only, let a manager or above set the price and schedule (a
 * peer leader also owes rent there, owner decision 2026-11-10), let staff set other
 * residents' rates and balances, and stop anyone editing their own.
 *
 *   cd firebase && firebase emulators:exec --only firestore --project demo-test \
 *     "npm --prefix .. run test:rules -- rentCharges"
 */

import { assertSucceeds, assertFails } from '@firebase/rules-unit-testing';
import { doc, getDoc, setDoc, updateDoc, deleteDoc, Timestamp } from 'firebase/firestore';
import { ADMIN, HOUSE, OWNER, PEER, RESIDENT, useRentRulesEnv } from './rentRulesHarness';

const rules = useRentRulesEnv('demo-rent-charges-rules-test');
const as = rules.as;

describe('houses: rent settings', () => {
  it('an admin sets the weekly price and schedule', () =>
    assertSucceeds(
      updateDoc(doc(as(ADMIN), `houses/${HOUSE}`), { rentFrequency: 'weekly', weeklyRent: 175 }),
    ));
  // A peer leader holds the admin claim but also owes rent here (owner decision 2026-11-10).
  it('a peer leader can still edit a house field that is not rent', () =>
    assertSucceeds(updateDoc(doc(as(PEER), `houses/${HOUSE}`), { name: 'Renamed' })));
  it.each([
    ['rentFrequency', 'weekly'],
    ['weeklyRent', 175],
    ['monthlyRent', 800],
  ])('a peer leader cannot set %s', (field, value) =>
    assertFails(updateDoc(doc(as(PEER), `houses/${HOUSE}`), { [field]: value })));
  it('a super admin cannot write rentChargesStartDate', () =>
    assertFails(
      updateDoc(doc(as(OWNER), `houses/${HOUSE}`), { rentChargesStartDate: '2026-11-01' }),
    ));
  it('a plain admin cannot write rentChargesStartedAtMs', () =>
    assertFails(updateDoc(doc(as(ADMIN), `houses/${HOUSE}`), { rentChargesStartedAtMs: 1 })));
  it('a resident cannot change rentFrequency', () =>
    assertFails(updateDoc(doc(as(RESIDENT), `houses/${HOUSE}`), { rentFrequency: 'weekly' })));
  it("rentFrequency 'daily' is refused", () =>
    assertFails(updateDoc(doc(as(OWNER), `houses/${HOUSE}`), { rentFrequency: 'daily' })));
  it('weeklyRent "175" (a string) is refused', () =>
    assertFails(updateDoc(doc(as(ADMIN), `houses/${HOUSE}`), { weeklyRent: '175' })));
  it('weeklyRent 17500 is refused', () =>
    assertFails(updateDoc(doc(as(OWNER), `houses/${HOUSE}`), { weeklyRent: 17500 })));
  it('weeklyRent above $2,500 is refused, while monthlyRent 3000 is allowed', async () => {
    await assertFails(updateDoc(doc(as(ADMIN), `houses/${HOUSE}`), { weeklyRent: 2501 }));
    await assertSucceeds(updateDoc(doc(as(ADMIN), `houses/${HOUSE}`), { monthlyRent: 3000 }));
  });
  it('a weekly customRent above $2,500 (250000 cents) is refused', () =>
    assertFails(
      updateDoc(doc(as(ADMIN), 'guests/gResident'), {
        customRent: { amountCents: 250001, frequency: 'weekly' },
      }),
    ));
  it('a negative monthlyRent is refused', () =>
    assertFails(updateDoc(doc(as(ADMIN), `houses/${HOUSE}`), { monthlyRent: -1 })));
  it('stripeAccountId is still refused for a plain admin', () =>
    assertFails(updateDoc(doc(as(ADMIN), `houses/${HOUSE}`), { stripeAccountId: 'acct_x' })));
});

describe('Oxford houses and the charging-start state', () => {
  const oxford = () =>
    rules.env().withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), 'houses/oxford1'), {
        id: 'oxford1',
        houseType: 'oxford',
        rentFrequency: 'both',
      });
    });
  const oxfordAdmin = () =>
    rules.env().authenticatedContext('ox', { superAdmin: { oxford1: true } }).firestore();
  it('an Oxford house admin can still edit the house', async () => {
    await oxford();
    await assertSucceeds(updateDoc(doc(oxfordAdmin(), 'houses/oxford1'), { name: 'Oxford One' }));
  });
  it('an Oxford house cannot be put on a weekly or monthly price schedule', async () => {
    await oxford();
    await assertFails(updateDoc(doc(oxfordAdmin(), 'houses/oxford1'), { rentFrequency: 'weekly' }));
    await assertFails(
      updateDoc(doc(oxfordAdmin(), 'houses/oxford1'), { rentFrequency: 'monthly' }),
    );
  });
  it('a traditional house still can', () =>
    assertSucceeds(updateDoc(doc(as(OWNER), `houses/${HOUSE}`), { rentFrequency: 'monthly' })));
  it("a house's admins can read its charging-start state; nobody writes it", async () => {
    await rules.env().withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), `rentHouseStates/${HOUSE}`), {
        startDate: '2026-11-11',
        startedAtMs: 1,
      });
    });
    await assertSucceeds(getDoc(doc(as(ADMIN), `rentHouseStates/${HOUSE}`)));
    await assertFails(getDoc(doc(as(RESIDENT), `rentHouseStates/${HOUSE}`)));
    await assertFails(
      setDoc(doc(as(OWNER), `rentHouseStates/${HOUSE}`), { startDate: '2026-01-01' }),
    );
  });
});

describe('guests: rates and balances', () => {
  it("an admin sets another resident's customRent {amountCents: 12000, frequency: 'weekly'}", () =>
    assertSucceeds(
      updateDoc(doc(as(ADMIN), 'guests/gResident'), {
        customRent: { amountCents: 12000, frequency: 'weekly' },
      }),
    ));
  it("an admin clears another resident's customRent", () =>
    assertSucceeds(updateDoc(doc(as(ADMIN), 'guests/gResident'), { customRent: null })));
  it("an admin sets another resident's rentOwed", () =>
    assertSucceeds(updateDoc(doc(as(PEER), 'guests/gResident'), { rentOwed: 5000 })));
  it('customRent {amountCents: 12.5, ...} is refused', () =>
    assertFails(
      updateDoc(doc(as(ADMIN), 'guests/gResident'), {
        customRent: { amountCents: 12.5, frequency: 'weekly' },
      }),
    ));
  it('customRent with an unknown schedule or extra key is refused', async () => {
    await assertFails(
      updateDoc(doc(as(ADMIN), 'guests/gResident'), {
        customRent: { amountCents: 100, frequency: 'both' },
      }),
    );
    await assertFails(
      updateDoc(doc(as(ADMIN), 'guests/gResident'), {
        customRent: { amountCents: 100, frequency: 'weekly', note: 'x' },
      }),
    );
  });
  it('a peer leader cannot lower their own rentOwed', () =>
    assertFails(updateDoc(doc(as(PEER), 'guests/gPeer'), { rentOwed: 0 })));
  it('a peer leader cannot lower their own choreFees', () =>
    assertFails(updateDoc(doc(as(PEER), 'guests/gPeer'), { choreFees: -100 })));
  it('a peer leader cannot set their own customRent', () =>
    assertFails(
      updateDoc(doc(as(PEER), 'guests/gPeer'), {
        customRent: { amountCents: 0, frequency: 'weekly' },
      }),
    ));
  it.each([
    ['moveInDate', '2030-01-01'],
    ['importedAt', '2030-01-01T00:00:00.000Z'],
    ['rentDueDate', '2030-01-01'],
  ])(
    'a peer leader cannot change their own %s (it decides what they are charged)',
    (field, value) => assertFails(updateDoc(doc(as(PEER), 'guests/gPeer'), { [field]: value })),
  );
  it("an admin can still set another resident's moveInDate", () =>
    assertSucceeds(updateDoc(doc(as(PEER), 'guests/gResident'), { moveInDate: '2026-11-18' })));
  it('customRent above $10,000 (1000000 cents) is refused', () =>
    assertFails(
      updateDoc(doc(as(ADMIN), 'guests/gResident'), {
        customRent: { amountCents: 1000001, frequency: 'monthly' },
      }),
    ));
  it('a peer leader can still edit their own phoneNumber', () =>
    assertSucceeds(updateDoc(doc(as(PEER), 'guests/gPeer'), { phoneNumber: '5550100' })));
  it('a resident cannot write their own customRent', () =>
    assertFails(
      updateDoc(doc(as(RESIDENT), 'guests/gResident'), {
        customRent: { amountCents: 0, frequency: 'weekly' },
      }),
    ));
  describe('a self-created resident record', () => {
    // A valid invitation, so customRent is the only thing that can refuse the create.
    beforeEach(() =>
      rules.env().withSecurityRulesDisabled(async (ctx) => {
        await setDoc(doc(ctx.firestore(), `admission-tickets/newcomer_${HOUSE}`), {
          role: 'guest',
          initialPhase: '',
          used: false,
          expiresAt: Timestamp.fromMillis(Date.now() + 86400000),
        });
      }));
    const record = { userId: 'newcomer', houseId: HOUSE, status: 'active' };
    it('is allowed with a valid invitation', () =>
      assertSucceeds(setDoc(doc(as('newcomer'), 'guests/gNew'), record)));
    it('may not carry customRent', () =>
      assertFails(
        setDoc(doc(as('newcomer'), 'guests/gNew'), {
          ...record,
          customRent: { amountCents: 0, frequency: 'weekly' },
        }),
      ));
  });
  it('no client may change rentLinkedTo', async () => {
    await assertFails(updateDoc(doc(as(OWNER), 'guests/gResident'), { rentLinkedTo: 'gOther' }));
    await assertFails(updateDoc(doc(as(ADMIN), 'guests/gResident'), { rentLinkedTo: 'gOther' }));
  });
  it('a staff-created record must name the caller as intakeCompletedBy', async () => {
    await assertFails(
      setDoc(doc(as(ADMIN), 'guests/gIntake2'), {
        houseId: HOUSE,
        status: 'active',
        intakeCompletedBy: 'someoneElse',
      }),
    );
    await assertSucceeds(
      setDoc(doc(as(ADMIN), 'guests/gIntake3'), {
        houseId: HOUSE,
        status: 'active',
        intakeCompletedBy: ADMIN,
      }),
    );
  });
  it('an admin-created record may not carry rentLinkedTo', () =>
    assertFails(
      setDoc(doc(as(ADMIN), 'guests/gIntake'), {
        houseId: HOUSE,
        status: 'active',
        createdBy: ADMIN,
        rentLinkedTo: 'gResident',
      }),
    ));
});

describe('rentCharges', () => {
  it('a resident reads their own rentCharges doc', () =>
    assertSucceeds(getDoc(doc(as(RESIDENT), 'rentCharges/gResident_2026-11-18'))));
  it("a resident cannot read another resident's rentCharges doc in the same house", () =>
    assertFails(getDoc(doc(as(RESIDENT), 'rentCharges/gOther_2026-11-18'))));
  it('an admin reads any rentCharges doc in the house', () =>
    assertSucceeds(getDoc(doc(as(ADMIN), 'rentCharges/gOther_2026-11-18'))));
  it('no client may write rentCharges', async () => {
    await assertFails(
      setDoc(doc(as(OWNER), 'rentCharges/gResident_2026-11-25'), {
        guestId: 'gResident',
        houseId: HOUSE,
        amountCents: 1,
      }),
    );
    await assertFails(
      updateDoc(doc(as(ADMIN), 'rentCharges/gResident_2026-11-18'), { amountCents: 0 }),
    );
    await assertFails(deleteDoc(doc(as(OWNER), 'rentCharges/gResident_2026-11-18')));
  });
});

describe('rentAccounts and config', () => {
  it('no client may read or write rentAccounts or config', async () => {
    await assertFails(getDoc(doc(as(OWNER), 'rentAccounts/gResident')));
    await assertFails(getDoc(doc(as(RESIDENT), 'rentAccounts/gResident')));
    await assertFails(
      setDoc(doc(as(OWNER), 'rentAccounts/gResident'), { chargedThrough: '2027-01-01' }),
    );
    await assertFails(getDoc(doc(as(OWNER), 'config/rentCharges')));
    await assertFails(getDoc(doc(as(OWNER), 'rentChargeReversals/r1')));
    await assertFails(setDoc(doc(as(OWNER), 'rentChargeReversals/r1'), { amountCents: 1 }));
    await assertFails(setDoc(doc(as(OWNER), 'config/rentCharges'), { paused: true }));
  });
});
