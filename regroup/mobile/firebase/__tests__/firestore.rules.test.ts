/**
 * Firestore Security Rules Tests — paymentMethods subcollection
 *
 * Tests the houses/{houseId}/guests/{guestId}/paymentMethods/{pmId} rule.
 * Requires the Firebase Firestore emulator running on port 8080.
 *
 * Setup:
 *   cd firebase && firebase emulators:start --only firestore
 *   npx jest firebase/__tests__/firestore.rules.test.ts
 */

import {
  initializeTestEnvironment,
  assertSucceeds,
  assertFails,
  RulesTestEnvironment,
} from '@firebase/rules-unit-testing';
import { doc, getDoc, setDoc, updateDoc, deleteDoc } from 'firebase/firestore';
import * as fs from 'fs';
import * as path from 'path';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const PROJECT_ID = 'rats-firestore-rules-test';
const FIRESTORE_HOST = '127.0.0.1';
const FIRESTORE_PORT = 8080;

const RULES_PATH = path.resolve(__dirname, '../firestore.rules');

const ADMIN_UID = 'adminUser';
const GUEST_UID = 'guestUser'; // Firebase Auth UID stored in guest.userId field
const OTHER_UID = 'otherUser'; // Authenticated but not a member of this house
const HOUSE_ID = 'house123';
const HOUSE_ID_OTHER = 'houseOther';
// GUEST_ID is intentionally different from GUEST_UID to validate the get() lookup path.
// The Firestore doc ID does NOT have to match the Auth UID — the rule uses get() to resolve it.
const GUEST_ID = 'guestDocId_notSameAsAuthUid';
const PM_ID = 'pm_test_123';

// ---------------------------------------------------------------------------
// Auth token builders — mirror the custom claims used in firestore.rules
// ---------------------------------------------------------------------------

function authUserOnly(_uid: string) {
  return {};
}

function authHouseAdmin(_uid: string, houseId: string) {
  return { admin: { [houseId]: true } };
}

function authHouseSuperAdmin(_uid: string, houseId: string) {
  return { superAdmin: { [houseId]: true } };
}

function authHouseGuest(_uid: string, houseId: string) {
  return { guest: { [houseId]: true } };
}

// ---------------------------------------------------------------------------
// Test environment setup
// ---------------------------------------------------------------------------

let testEnv: RulesTestEnvironment;

beforeAll(async () => {
  const rules = fs.readFileSync(RULES_PATH, 'utf8');
  testEnv = await initializeTestEnvironment({
    projectId: PROJECT_ID,
    firestore: { rules, host: FIRESTORE_HOST, port: FIRESTORE_PORT },
  });
});

afterAll(async () => {
  await testEnv.cleanup();
});

afterEach(async () => {
  await testEnv.clearFirestore();
});

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function pmDoc(ctx: ReturnType<RulesTestEnvironment['authenticatedContext']>) {
  return doc(
    ctx.firestore(),
    `houses/${HOUSE_ID}/guests/${GUEST_ID}/paymentMethods/${PM_ID}`,
  );
}

function pmDocForGuest(
  ctx: ReturnType<RulesTestEnvironment['authenticatedContext']>,
  guestId: string,
) {
  return doc(
    ctx.firestore(),
    `houses/${HOUSE_ID}/guests/${guestId}/paymentMethods/${PM_ID}`,
  );
}

// ===========================================================================
// TESTS
// ===========================================================================

// ---------------------------------------------------------------------------
// 1. Admin read access
// ---------------------------------------------------------------------------
describe('paymentMethods — admin read access', () => {
  test('ALLOW house admin to read a payment method', async () => {
    const ctx = testEnv.authenticatedContext(
      ADMIN_UID,
      authHouseAdmin(ADMIN_UID, HOUSE_ID),
    );
    await assertSucceeds(getDoc(pmDoc(ctx)));
  });

  test('ALLOW house superAdmin to read a payment method', async () => {
    const ctx = testEnv.authenticatedContext(
      ADMIN_UID,
      authHouseSuperAdmin(ADMIN_UID, HOUSE_ID),
    );
    await assertSucceeds(getDoc(pmDoc(ctx)));
  });

  test('DENY admin of a DIFFERENT house reading payment method', async () => {
    const ctx = testEnv.authenticatedContext(
      ADMIN_UID,
      authHouseAdmin(ADMIN_UID, HOUSE_ID_OTHER),
    );
    await assertFails(getDoc(pmDoc(ctx)));
  });
});

// ---------------------------------------------------------------------------
// 2. Guest self-read access
// ---------------------------------------------------------------------------
describe('paymentMethods — guest self-read access', () => {
  // The rule now uses get() to look up the parent guest document and compare
  // guest.userId == request.auth.uid. Each test that exercises the guest branch
  // must pre-populate the parent guest document so the get() call can resolve.

  test('ALLOW guest to read their OWN payment method (guestId differs from auth.uid — get() resolves userId)', async () => {
    // Create the parent guest document so the security rule's get() call can resolve.
    // GUEST_ID != GUEST_UID on purpose: the Firestore doc ID is intentionally different
    // from the Auth UID to validate that the rule uses get() rather than a naive equality check.
    await testEnv.withSecurityRulesDisabled(async context => {
      const db = context.firestore();
      // Seed the top-level guests collection — that is what the security rule's get() reads.
      await db.doc(`guests/${GUEST_ID}`).set({
        userId: GUEST_UID, // Auth UID stored on the guest document
        houseId: HOUSE_ID,
      });
    });

    const ctx = testEnv.authenticatedContext(
      GUEST_UID,
      authHouseGuest(GUEST_UID, HOUSE_ID),
    );
    await assertSucceeds(getDoc(pmDoc(ctx)));
  });

  test('DENY guest reading another guest payment method (parent guest doc has a different userId)', async () => {
    const otherGuestId = 'someOtherGuestDocId';
    const otherGuestUserId = 'someOtherAuthUid';

    // Pre-populate the other guest's document in the top-level guests collection
    // (that is what the security rule's get() reads).
    await testEnv.withSecurityRulesDisabled(async context => {
      const db = context.firestore();
      await db.doc(`guests/${otherGuestId}`).set({
        userId: otherGuestUserId, // NOT GUEST_UID — different user owns this doc
        houseId: HOUSE_ID,
      });
    });

    const ctx = testEnv.authenticatedContext(
      GUEST_UID,
      authHouseGuest(GUEST_UID, HOUSE_ID),
    );
    await assertFails(getDoc(pmDocForGuest(ctx, otherGuestId)));
  });
});

// ---------------------------------------------------------------------------
// 3. Unauthorized read access
// ---------------------------------------------------------------------------
describe('paymentMethods — unauthorized read access', () => {
  test('DENY unauthenticated user reading payment method', async () => {
    const ctx = testEnv.unauthenticatedContext();
    await assertFails(getDoc(pmDoc(ctx)));
  });

  test('DENY authenticated user with no house role reading payment method', async () => {
    const ctx = testEnv.authenticatedContext(
      OTHER_UID,
      authUserOnly(OTHER_UID),
    );
    await assertFails(getDoc(pmDoc(ctx)));
  });

  test('DENY guest of a DIFFERENT house reading payment method', async () => {
    const ctx = testEnv.authenticatedContext(
      GUEST_UID,
      authHouseGuest(GUEST_UID, HOUSE_ID_OTHER),
    );
    await assertFails(getDoc(pmDoc(ctx)));
  });
});

// ---------------------------------------------------------------------------
// 4. Write access — nobody writes from the client (defense-in-depth)
// ---------------------------------------------------------------------------
describe('paymentMethods — client write access always denied', () => {
  const paymentMethodData = {
    stripePaymentMethodId: 'pm_test_abc123',
    type: 'card',
  };

  test('DENY admin writing (creating) a payment method from the client', async () => {
    const ctx = testEnv.authenticatedContext(
      ADMIN_UID,
      authHouseAdmin(ADMIN_UID, HOUSE_ID),
    );
    await assertFails(setDoc(pmDoc(ctx), paymentMethodData));
  });

  test('DENY guest writing (creating) their own payment method from the client', async () => {
    const ctx = testEnv.authenticatedContext(
      GUEST_UID,
      authHouseGuest(GUEST_UID, HOUSE_ID),
    );
    await assertFails(setDoc(pmDoc(ctx), paymentMethodData));
  });

  test('DENY admin deleting a payment method from the client', async () => {
    const ctx = testEnv.authenticatedContext(
      ADMIN_UID,
      authHouseAdmin(ADMIN_UID, HOUSE_ID),
    );
    await assertFails(deleteDoc(pmDoc(ctx)));
  });

  test('DENY unauthenticated user writing a payment method', async () => {
    const ctx = testEnv.unauthenticatedContext();
    await assertFails(setDoc(pmDoc(ctx), paymentMethodData));
  });

  test('DENY plain authenticated user writing a payment method', async () => {
    const ctx = testEnv.authenticatedContext(
      OTHER_UID,
      authUserOnly(OTHER_UID),
    );
    await assertFails(setDoc(pmDoc(ctx), paymentMethodData));
  });
});

// ---------------------------------------------------------------------------
// Oxford gate — writes require active Oxford subscription
// ---------------------------------------------------------------------------

const OXFORD_HOUSE_ID = 'oxfordHouse';

describe('Oxford officers — write gate', () => {
  test('DENY admin write when oxfordEnabled=true but subscriptionStatus=canceled', async () => {
    const ctx = testEnv.authenticatedContext(
      ADMIN_UID,
      authHouseAdmin(ADMIN_UID, OXFORD_HOUSE_ID),
    );
    await testEnv.withSecurityRulesDisabled(async adminCtx => {
      await setDoc(doc(adminCtx.firestore(), `houses/${OXFORD_HOUSE_ID}`), {
        oxfordEnabled: true,
        subscriptionStatus: 'canceled',
      });
    });
    await assertFails(
      setDoc(doc(ctx.firestore(), `houses/${OXFORD_HOUSE_ID}/officers/o1`), {
        name: 'President',
        userId: ADMIN_UID,
      }),
    );
  });

  test('DENY admin write when subscriptionStatus=active but oxfordEnabled=false', async () => {
    const ctx = testEnv.authenticatedContext(
      ADMIN_UID,
      authHouseAdmin(ADMIN_UID, OXFORD_HOUSE_ID),
    );
    await testEnv.withSecurityRulesDisabled(async adminCtx => {
      await setDoc(doc(adminCtx.firestore(), `houses/${OXFORD_HOUSE_ID}`), {
        oxfordEnabled: false,
        subscriptionStatus: 'active',
      });
    });
    await assertFails(
      setDoc(doc(ctx.firestore(), `houses/${OXFORD_HOUSE_ID}/officers/o1`), {
        name: 'President',
        userId: ADMIN_UID,
      }),
    );
  });

  test('ALLOW admin write when oxfordEnabled=true and subscriptionStatus=active', async () => {
    const ctx = testEnv.authenticatedContext(
      ADMIN_UID,
      authHouseAdmin(ADMIN_UID, OXFORD_HOUSE_ID),
    );
    await testEnv.withSecurityRulesDisabled(async adminCtx => {
      await setDoc(doc(adminCtx.firestore(), `houses/${OXFORD_HOUSE_ID}`), {
        oxfordEnabled: true,
        subscriptionStatus: 'active',
      });
    });
    await assertSucceeds(
      setDoc(doc(ctx.firestore(), `houses/${OXFORD_HOUSE_ID}/officers/o1`), {
        name: 'President',
        userId: ADMIN_UID,
      }),
    );
  });

  test('ALLOW admin write when oxfordEnabled=true and subscriptionStatus=trialing', async () => {
    const ctx = testEnv.authenticatedContext(
      ADMIN_UID,
      authHouseAdmin(ADMIN_UID, OXFORD_HOUSE_ID),
    );
    await testEnv.withSecurityRulesDisabled(async adminCtx => {
      await setDoc(doc(adminCtx.firestore(), `houses/${OXFORD_HOUSE_ID}`), {
        oxfordEnabled: true,
        subscriptionStatus: 'trialing',
      });
    });
    await assertSucceeds(
      setDoc(doc(ctx.firestore(), `houses/${OXFORD_HOUSE_ID}/officers/o1`), {
        name: 'President',
        userId: ADMIN_UID,
      }),
    );
  });

  test('ALLOW admin read of officers even when subscription canceled', async () => {
    const ctx = testEnv.authenticatedContext(
      ADMIN_UID,
      authHouseAdmin(ADMIN_UID, OXFORD_HOUSE_ID),
    );
    await testEnv.withSecurityRulesDisabled(async adminCtx => {
      await setDoc(doc(adminCtx.firestore(), `houses/${OXFORD_HOUSE_ID}`), {
        oxfordEnabled: true,
        subscriptionStatus: 'canceled',
      });
      await setDoc(
        doc(adminCtx.firestore(), `houses/${OXFORD_HOUSE_ID}/officers/o1`),
        { name: 'President', userId: ADMIN_UID },
      );
    });
    await assertSucceeds(
      getDoc(doc(ctx.firestore(), `houses/${OXFORD_HOUSE_ID}/officers/o1`)),
    );
  });
});

// ─── applications subcollection ────────────────────────────────────────────

const APPLICANT_UID = 'applicantUser';
const APP_ID = 'app-test-001';

function appDoc(ctx: ReturnType<RulesTestEnvironment['authenticatedContext']>) {
  return doc(ctx.firestore(), `houses/${HOUSE_ID}/applications/${APP_ID}`);
}

describe('houses/{houseId}/applications/{appId}', () => {
  beforeEach(async () => {
    await testEnv.withSecurityRulesDisabled(async ctx => {
      await setDoc(doc(ctx.firestore(), `houses/${HOUSE_ID}`), {
        id: HOUSE_ID,
        adminIds: [ADMIN_UID],
        superAdminId: ADMIN_UID,
      });
    });
  });

  describe('create', () => {
    it('allows an authenticated user to create their own application', async () => {
      const ctx = testEnv.authenticatedContext(APPLICANT_UID, {});
      await assertSucceeds(
        setDoc(appDoc(ctx), {
          applicantUid: APPLICANT_UID,
          houseId: HOUSE_ID,
          status: 'pending',
          applicantName: 'Alice',
          applicantEmail: 'alice@example.com',
          createdAt: new Date().toISOString(),
        }),
      );
    });

    it('denies creating an application with a mismatched applicantUid', async () => {
      const ctx = testEnv.authenticatedContext(APPLICANT_UID, {});
      await assertFails(
        setDoc(appDoc(ctx), {
          applicantUid: OTHER_UID,
          houseId: HOUSE_ID,
          status: 'pending',
          applicantName: 'Alice',
          applicantEmail: 'alice@example.com',
          createdAt: new Date().toISOString(),
        }),
      );
    });

    it('denies unauthenticated create', async () => {
      const ctx = testEnv.unauthenticatedContext();
      await assertFails(
        setDoc(appDoc(ctx as any), {
          applicantUid: 'anyone',
          status: 'pending',
        }),
      );
    });
  });

  describe('read', () => {
    beforeEach(async () => {
      await testEnv.withSecurityRulesDisabled(async ctx => {
        await setDoc(
          doc(ctx.firestore(), `houses/${HOUSE_ID}/applications/${APP_ID}`),
          {
            applicantUid: APPLICANT_UID,
            houseId: HOUSE_ID,
            status: 'pending',
            applicantName: 'Alice',
            applicantEmail: 'alice@example.com',
          },
        );
      });
    });

    it('allows the applicant to read their own application', async () => {
      const ctx = testEnv.authenticatedContext(APPLICANT_UID, {});
      await assertSucceeds(getDoc(appDoc(ctx)));
    });

    it('allows house admin to read applications', async () => {
      const ctx = testEnv.authenticatedContext(ADMIN_UID, {
        admin: { [HOUSE_ID]: true },
      });
      await assertSucceeds(getDoc(appDoc(ctx)));
    });

    it('denies other authenticated users from reading applications', async () => {
      const ctx = testEnv.authenticatedContext(OTHER_UID, {});
      await assertFails(getDoc(appDoc(ctx)));
    });
  });

  describe('update', () => {
    beforeEach(async () => {
      await testEnv.withSecurityRulesDisabled(async ctx => {
        await setDoc(
          doc(ctx.firestore(), `houses/${HOUSE_ID}/applications/${APP_ID}`),
          {
            applicantUid: APPLICANT_UID,
            houseId: HOUSE_ID,
            status: 'pending',
          },
        );
      });
    });

    it('allows house admin to update status', async () => {
      const ctx = testEnv.authenticatedContext(ADMIN_UID, {
        admin: { [HOUSE_ID]: true },
      });
      await assertSucceeds(
        setDoc(appDoc(ctx), { status: 'approved' }, { merge: true }),
      );
    });

    it('denies applicant from updating their own application after submission', async () => {
      const ctx = testEnv.authenticatedContext(APPLICANT_UID, {});
      await assertFails(
        setDoc(appDoc(ctx), { status: 'approved' }, { merge: true }),
      );
    });
  });
});

describe('Oxford votes — write gate', () => {
  test('DENY admin vote create when subscription canceled', async () => {
    const ctx = testEnv.authenticatedContext(
      ADMIN_UID,
      authHouseAdmin(ADMIN_UID, OXFORD_HOUSE_ID),
    );
    await testEnv.withSecurityRulesDisabled(async adminCtx => {
      await setDoc(doc(adminCtx.firestore(), `houses/${OXFORD_HOUSE_ID}`), {
        oxfordEnabled: true,
        subscriptionStatus: 'canceled',
      });
    });
    await assertFails(
      setDoc(doc(ctx.firestore(), `houses/${OXFORD_HOUSE_ID}/votes/v1`), {
        question: 'Approve budget?',
        createdBy: ADMIN_UID,
      }),
    );
  });

  test('DENY guest vote cast when subscription canceled', async () => {
    const ctx = testEnv.authenticatedContext(
      GUEST_UID,
      authHouseGuest(GUEST_UID, OXFORD_HOUSE_ID),
    );
    await testEnv.withSecurityRulesDisabled(async adminCtx => {
      await setDoc(doc(adminCtx.firestore(), `houses/${OXFORD_HOUSE_ID}`), {
        oxfordEnabled: true,
        subscriptionStatus: 'canceled',
      });
      await setDoc(
        doc(adminCtx.firestore(), `houses/${OXFORD_HOUSE_ID}/votes/v1`),
        { question: 'Approve budget?' },
      );
    });
    await assertFails(
      setDoc(doc(ctx.firestore(), `houses/${OXFORD_HOUSE_ID}/votes/v1`), {
        question: 'Approve budget?',
        vote: 'yes',
      }),
    );
  });
});

// ===========================================================================
// guests/{guestId} field guard tests — .full-review [S1]
// ===========================================================================
//
// Before this guard, the guests update rule allowed any guest to write any
// field on their own doc — so a malicious resident could set rentOwed: 0,
// phase: 'highest', isAdmin: true, etc. The new rule restricts the
// self-edit branch to a personal-fields allowlist; financial / phase /
// privilege / intake fields are admin-only.
//
// Test data convention: GUEST_DOC_ID = the guest's Firestore doc ID.
// The guest's userId field equals GUEST_UID (Firebase Auth UID).

const GUEST_DOC_ID = 'guestDocS1';

const BASELINE_GUEST = {
  id: GUEST_DOC_ID,
  userId: GUEST_UID,
  houseId: HOUSE_ID,
  firstName: 'Alice',
  lastName: 'Smith',
  email: 'alice@example.com',
  rentOwed: 150,
  choreFees: 25,
  phase: 1,
  step: 2,
  status: 'active',
  isAdmin: false,
  version: 3,
};

async function seedGuestDoc() {
  await testEnv.withSecurityRulesDisabled(async ctx => {
    await setDoc(
      doc(ctx.firestore(), `guests/${GUEST_DOC_ID}`),
      BASELINE_GUEST,
    );
  });
}

function guestDocRef(
  ctx: ReturnType<RulesTestEnvironment['authenticatedContext']>,
) {
  return doc(ctx.firestore(), `guests/${GUEST_DOC_ID}`);
}

describe('guests/{guestId} — self-edit field guard (S1)', () => {
  describe('allowed self-edits', () => {
    test('ALLOW guest editing their own firstName', async () => {
      await seedGuestDoc();
      const ctx = testEnv.authenticatedContext(
        GUEST_UID,
        authHouseGuest(GUEST_UID, HOUSE_ID),
      );
      await assertSucceeds(
        updateDoc(guestDocRef(ctx), { firstName: 'Alicia' }),
      );
    });

    test('ALLOW guest editing phoneNumber + emergencyContactName together', async () => {
      await seedGuestDoc();
      const ctx = testEnv.authenticatedContext(
        GUEST_UID,
        authHouseGuest(GUEST_UID, HOUSE_ID),
      );
      await assertSucceeds(
        updateDoc(guestDocRef(ctx), {
          phoneNumber: '555-0100',
          emergencyContactName: 'Bob',
        }),
      );
    });

    test('ALLOW guest opting into autoPay (autoPayEnabled)', async () => {
      await seedGuestDoc();
      const ctx = testEnv.authenticatedContext(
        GUEST_UID,
        authHouseGuest(GUEST_UID, HOUSE_ID),
      );
      await assertSucceeds(
        updateDoc(guestDocRef(ctx), { autoPayEnabled: true }),
      );
    });

    test('ALLOW guest bumping version + updatedAt (optimistic lock)', async () => {
      await seedGuestDoc();
      const ctx = testEnv.authenticatedContext(
        GUEST_UID,
        authHouseGuest(GUEST_UID, HOUSE_ID),
      );
      await assertSucceeds(
        updateDoc(guestDocRef(ctx), {
          firstName: 'Alicia',
          version: 4,
          updatedAt: new Date().toISOString(),
        }),
      );
    });
  });

  describe('forbidden self-edits — financial', () => {
    test('DENY guest zeroing rentOwed', async () => {
      await seedGuestDoc();
      const ctx = testEnv.authenticatedContext(
        GUEST_UID,
        authHouseGuest(GUEST_UID, HOUSE_ID),
      );
      await assertFails(updateDoc(guestDocRef(ctx), { rentOwed: 0 }));
    });

    test('DENY guest zeroing choreFees', async () => {
      await seedGuestDoc();
      const ctx = testEnv.authenticatedContext(
        GUEST_UID,
        authHouseGuest(GUEST_UID, HOUSE_ID),
      );
      await assertFails(updateDoc(guestDocRef(ctx), { choreFees: 0 }));
    });
  });

  describe('forbidden self-edits — phase / status / privilege', () => {
    test('DENY guest advancing their own phase', async () => {
      await seedGuestDoc();
      const ctx = testEnv.authenticatedContext(
        GUEST_UID,
        authHouseGuest(GUEST_UID, HOUSE_ID),
      );
      await assertFails(updateDoc(guestDocRef(ctx), { phase: 5 }));
    });

    test('DENY guest changing their step', async () => {
      await seedGuestDoc();
      const ctx = testEnv.authenticatedContext(
        GUEST_UID,
        authHouseGuest(GUEST_UID, HOUSE_ID),
      );
      await assertFails(updateDoc(guestDocRef(ctx), { step: 10 }));
    });

    test('DENY guest flipping isAdmin to true (privilege escalation)', async () => {
      await seedGuestDoc();
      const ctx = testEnv.authenticatedContext(
        GUEST_UID,
        authHouseGuest(GUEST_UID, HOUSE_ID),
      );
      await assertFails(updateDoc(guestDocRef(ctx), { isAdmin: true }));
    });

    test('DENY guest writing a roles object', async () => {
      await seedGuestDoc();
      const ctx = testEnv.authenticatedContext(
        GUEST_UID,
        authHouseGuest(GUEST_UID, HOUSE_ID),
      );
      await assertFails(
        updateDoc(guestDocRef(ctx), { roles: { admin: true } }),
      );
    });

    test('DENY guest changing their status to discharged', async () => {
      await seedGuestDoc();
      const ctx = testEnv.authenticatedContext(
        GUEST_UID,
        authHouseGuest(GUEST_UID, HOUSE_ID),
      );
      await assertFails(updateDoc(guestDocRef(ctx), { status: 'discharged' }));
    });
  });

  describe('forbidden self-edits — identity / cross-house', () => {
    test('DENY guest changing their userId (defeats ownership check)', async () => {
      await seedGuestDoc();
      const ctx = testEnv.authenticatedContext(
        GUEST_UID,
        authHouseGuest(GUEST_UID, HOUSE_ID),
      );
      await assertFails(
        updateDoc(guestDocRef(ctx), { userId: 'someoneElseUid' }),
      );
    });

    test('DENY guest moving themselves to another house', async () => {
      await seedGuestDoc();
      const ctx = testEnv.authenticatedContext(
        GUEST_UID,
        authHouseGuest(GUEST_UID, HOUSE_ID),
      );
      await assertFails(
        updateDoc(guestDocRef(ctx), { houseId: HOUSE_ID_OTHER }),
      );
    });
  });

  describe('mixed allowed + forbidden in same update', () => {
    test('DENY a write that touches BOTH a personal field AND rentOwed', async () => {
      await seedGuestDoc();
      const ctx = testEnv.authenticatedContext(
        GUEST_UID,
        authHouseGuest(GUEST_UID, HOUSE_ID),
      );
      // hasOnly is all-or-nothing: any field outside the allowlist denies the
      // whole write, preventing attacks that hide a privileged change inside
      // a benign one.
      await assertFails(
        updateDoc(guestDocRef(ctx), {
          firstName: 'Alicia',
          rentOwed: 0,
        }),
      );
    });
  });

  describe('admin branch still has full authority', () => {
    test('ALLOW house admin to set rentOwed on a guest', async () => {
      await seedGuestDoc();
      const ctx = testEnv.authenticatedContext(
        ADMIN_UID,
        authHouseAdmin(ADMIN_UID, HOUSE_ID),
      );
      await assertSucceeds(updateDoc(guestDocRef(ctx), { rentOwed: 200 }));
    });

    test('ALLOW house admin to advance a guest phase', async () => {
      await seedGuestDoc();
      const ctx = testEnv.authenticatedContext(
        ADMIN_UID,
        authHouseAdmin(ADMIN_UID, HOUSE_ID),
      );
      await assertSucceeds(updateDoc(guestDocRef(ctx), { phase: 5 }));
    });

    test('DENY admin of a DIFFERENT house touching the guest', async () => {
      await seedGuestDoc();
      const ctx = testEnv.authenticatedContext(
        ADMIN_UID,
        authHouseAdmin(ADMIN_UID, HOUSE_ID_OTHER),
      );
      await assertFails(updateDoc(guestDocRef(ctx), { rentOwed: 0 }));
    });
  });

  describe('cross-user denials', () => {
    test('DENY a different guest writing this guest doc', async () => {
      await seedGuestDoc();
      const ctx = testEnv.authenticatedContext(
        OTHER_UID,
        authHouseGuest(OTHER_UID, HOUSE_ID),
      );
      // OTHER_UID is in the same house but is not the guest's userId.
      // The self-branch fails (userId mismatch); admin branch fails
      // (no admin claim). Result: deny.
      await assertFails(updateDoc(guestDocRef(ctx), { firstName: 'Mallory' }));
    });
  });
});

describe('invitations/{token} — all client access denied (server-only)', () => {
  const TOKEN = 'test-token-abc';

  test('DENY unauthenticated client read', async () => {
    const ctx = testEnv.unauthenticatedContext();
    await assertFails(getDoc(doc(ctx.firestore(), `invitations/${TOKEN}`)));
  });

  test('DENY unauthenticated client write', async () => {
    const ctx = testEnv.unauthenticatedContext();
    await assertFails(
      setDoc(doc(ctx.firestore(), `invitations/${TOKEN}`), { x: 1 }),
    );
  });

  test('DENY signed-in user read', async () => {
    const ctx = testEnv.authenticatedContext(
      OTHER_UID,
      authUserOnly(OTHER_UID),
    );
    await assertFails(getDoc(doc(ctx.firestore(), `invitations/${TOKEN}`)));
  });

  test('DENY admin of any house writing an invitation directly', async () => {
    const ctx = testEnv.authenticatedContext(
      ADMIN_UID,
      authHouseAdmin(ADMIN_UID, HOUSE_ID),
    );
    await assertFails(
      setDoc(doc(ctx.firestore(), `invitations/${TOKEN}`), {
        token: TOKEN,
        inviterUid: ADMIN_UID,
        houseId: HOUSE_ID,
        role: 'admin',
        invitedEmail: 'x@x.com',
        expiresAt: new Date(Date.now() + 86400000).toISOString(),
        createdAt: new Date().toISOString(),
      }),
    );
  });

  test('DENY redemption-via-client write (anyone trying to set redeemedAt)', async () => {
    // Even if the doc existed somehow, a client cannot mark it redeemed.
    const ctx = testEnv.authenticatedContext(
      OTHER_UID,
      authUserOnly(OTHER_UID),
    );
    await assertFails(
      setDoc(
        doc(ctx.firestore(), `invitations/${TOKEN}`),
        { redeemedAt: new Date().toISOString(), redeemedByUid: OTHER_UID },
        { merge: true },
      ),
    );
  });
});

// ===========================================================================
// guest-archive/{guestId} — admin-only write guard [C5]
// ===========================================================================
//
// guest-archive holds archived discharge + financial records. Before this
// guard, the write rule used isGuestOrAdmin, so a resident could create,
// overwrite, or delete their own discharge/financial history. The rule now
// allows residents to read but restricts create/update/delete to house admins.

const ARCHIVE_DOC_ID = 'archivedGuest1';
const BASELINE_ARCHIVE = {
  id: ARCHIVE_DOC_ID,
  houseId: HOUSE_ID,
  firstName: 'Alice',
  rentOwed: 500,
  dischargeReason: 'completed',
};

async function seedArchiveDoc() {
  await testEnv.withSecurityRulesDisabled(async ctx => {
    await setDoc(
      doc(ctx.firestore(), `guest-archive/${ARCHIVE_DOC_ID}`),
      BASELINE_ARCHIVE,
    );
  });
}

function archiveDocRef(
  ctx: ReturnType<RulesTestEnvironment['authenticatedContext']>,
) {
  return doc(ctx.firestore(), `guest-archive/${ARCHIVE_DOC_ID}`);
}

describe('guest-archive/{guestId} — admin-only write guard (C5)', () => {
  test('ALLOW guest reading archive in their house', async () => {
    await seedArchiveDoc();
    const ctx = testEnv.authenticatedContext(
      GUEST_UID,
      authHouseGuest(GUEST_UID, HOUSE_ID),
    );
    await assertSucceeds(getDoc(archiveDocRef(ctx)));
  });

  test('ALLOW admin creating an archive record', async () => {
    const ctx = testEnv.authenticatedContext(
      ADMIN_UID,
      authHouseAdmin(ADMIN_UID, HOUSE_ID),
    );
    await assertSucceeds(setDoc(archiveDocRef(ctx), BASELINE_ARCHIVE));
  });

  test('ALLOW admin updating an archive record', async () => {
    await seedArchiveDoc();
    const ctx = testEnv.authenticatedContext(
      ADMIN_UID,
      authHouseAdmin(ADMIN_UID, HOUSE_ID),
    );
    await assertSucceeds(updateDoc(archiveDocRef(ctx), { rentOwed: 0 }));
  });

  test('ALLOW admin deleting an archive record', async () => {
    await seedArchiveDoc();
    const ctx = testEnv.authenticatedContext(
      ADMIN_UID,
      authHouseAdmin(ADMIN_UID, HOUSE_ID),
    );
    await assertSucceeds(deleteDoc(archiveDocRef(ctx)));
  });

  test('DENY guest creating an archive record', async () => {
    const ctx = testEnv.authenticatedContext(
      GUEST_UID,
      authHouseGuest(GUEST_UID, HOUSE_ID),
    );
    await assertFails(setDoc(archiveDocRef(ctx), BASELINE_ARCHIVE));
  });

  test('DENY guest overwriting their own discharge/financial record', async () => {
    await seedArchiveDoc();
    const ctx = testEnv.authenticatedContext(
      GUEST_UID,
      authHouseGuest(GUEST_UID, HOUSE_ID),
    );
    await assertFails(updateDoc(archiveDocRef(ctx), { rentOwed: 0 }));
  });

  test('DENY guest deleting an archive record', async () => {
    await seedArchiveDoc();
    const ctx = testEnv.authenticatedContext(
      GUEST_UID,
      authHouseGuest(GUEST_UID, HOUSE_ID),
    );
    await assertFails(deleteDoc(archiveDocRef(ctx)));
  });
});
