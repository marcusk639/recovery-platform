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
} from "@firebase/rules-unit-testing";
import { doc, getDoc, setDoc, updateDoc, deleteDoc } from "firebase/firestore";
import * as fs from "fs";
import * as path from "path";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const PROJECT_ID = "rats-firestore-rules-test";
const FIRESTORE_HOST = "127.0.0.1";
const FIRESTORE_PORT = 8080;

const RULES_PATH = path.resolve(__dirname, "../firestore.rules");

const ADMIN_UID = "adminUser";
const GUEST_UID = "guestUser"; // Firebase Auth UID stored in guest.userId field
const OTHER_UID = "otherUser"; // Authenticated but not a member of this house
const HOUSE_ID = "house123";
const HOUSE_ID_OTHER = "houseOther";
// GUEST_ID is intentionally different from GUEST_UID to validate the get() lookup path.
// The Firestore doc ID does NOT have to match the Auth UID — the rule uses get() to resolve it.
const GUEST_ID = "guestDocId_notSameAsAuthUid";
const PM_ID = "pm_test_123";

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
  const rules = fs.readFileSync(RULES_PATH, "utf8");
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

function pmDoc(ctx: ReturnType<RulesTestEnvironment["authenticatedContext"]>) {
  return doc(
    ctx.firestore(),
    `houses/${HOUSE_ID}/guests/${GUEST_ID}/paymentMethods/${PM_ID}`,
  );
}

function pmDocForGuest(
  ctx: ReturnType<RulesTestEnvironment["authenticatedContext"]>,
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
describe("paymentMethods — admin read access", () => {
  test("ALLOW house admin to read a payment method", async () => {
    const ctx = testEnv.authenticatedContext(
      ADMIN_UID,
      authHouseAdmin(ADMIN_UID, HOUSE_ID),
    );
    await assertSucceeds(getDoc(pmDoc(ctx)));
  });

  test("ALLOW house superAdmin to read a payment method", async () => {
    const ctx = testEnv.authenticatedContext(
      ADMIN_UID,
      authHouseSuperAdmin(ADMIN_UID, HOUSE_ID),
    );
    await assertSucceeds(getDoc(pmDoc(ctx)));
  });

  test("DENY admin of a DIFFERENT house reading payment method", async () => {
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
describe("paymentMethods — guest self-read access", () => {
  // The rule now uses get() to look up the parent guest document and compare
  // guest.userId == request.auth.uid. Each test that exercises the guest branch
  // must pre-populate the parent guest document so the get() call can resolve.

  test("ALLOW guest to read their OWN payment method (guestId differs from auth.uid — get() resolves userId)", async () => {
    // Create the parent guest document so the security rule's get() call can resolve.
    // GUEST_ID != GUEST_UID on purpose: the Firestore doc ID is intentionally different
    // from the Auth UID to validate that the rule uses get() rather than a naive equality check.
    await testEnv.withSecurityRulesDisabled(async (context) => {
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

  test("DENY guest reading another guest payment method (parent guest doc has a different userId)", async () => {
    const otherGuestId = "someOtherGuestDocId";
    const otherGuestUserId = "someOtherAuthUid";

    // Pre-populate the other guest's document in the top-level guests collection
    // (that is what the security rule's get() reads).
    await testEnv.withSecurityRulesDisabled(async (context) => {
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
describe("paymentMethods — unauthorized read access", () => {
  test("DENY unauthenticated user reading payment method", async () => {
    const ctx = testEnv.unauthenticatedContext();
    await assertFails(getDoc(pmDoc(ctx)));
  });

  test("DENY authenticated user with no house role reading payment method", async () => {
    const ctx = testEnv.authenticatedContext(
      OTHER_UID,
      authUserOnly(OTHER_UID),
    );
    await assertFails(getDoc(pmDoc(ctx)));
  });

  test("DENY guest of a DIFFERENT house reading payment method", async () => {
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
describe("paymentMethods — client write access always denied", () => {
  const paymentMethodData = {
    stripePaymentMethodId: "pm_test_abc123",
    type: "card",
  };

  test("DENY admin writing (creating) a payment method from the client", async () => {
    const ctx = testEnv.authenticatedContext(
      ADMIN_UID,
      authHouseAdmin(ADMIN_UID, HOUSE_ID),
    );
    await assertFails(setDoc(pmDoc(ctx), paymentMethodData));
  });

  test("DENY guest writing (creating) their own payment method from the client", async () => {
    const ctx = testEnv.authenticatedContext(
      GUEST_UID,
      authHouseGuest(GUEST_UID, HOUSE_ID),
    );
    await assertFails(setDoc(pmDoc(ctx), paymentMethodData));
  });

  test("DENY admin deleting a payment method from the client", async () => {
    const ctx = testEnv.authenticatedContext(
      ADMIN_UID,
      authHouseAdmin(ADMIN_UID, HOUSE_ID),
    );
    await assertFails(deleteDoc(pmDoc(ctx)));
  });

  test("DENY unauthenticated user writing a payment method", async () => {
    const ctx = testEnv.unauthenticatedContext();
    await assertFails(setDoc(pmDoc(ctx), paymentMethodData));
  });

  test("DENY plain authenticated user writing a payment method", async () => {
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

const OXFORD_HOUSE_ID = "oxfordHouse";

describe("Oxford officers — write gate", () => {
  test("DENY admin write when oxfordEnabled=true but subscriptionStatus=canceled", async () => {
    const ctx = testEnv.authenticatedContext(
      ADMIN_UID,
      authHouseAdmin(ADMIN_UID, OXFORD_HOUSE_ID),
    );
    await testEnv.withSecurityRulesDisabled(async (adminCtx) => {
      await setDoc(doc(adminCtx.firestore(), `houses/${OXFORD_HOUSE_ID}`), {
        oxfordEnabled: true,
        subscriptionStatus: "canceled",
      });
    });
    await assertFails(
      setDoc(doc(ctx.firestore(), `houses/${OXFORD_HOUSE_ID}/officers/o1`), {
        name: "President",
        userId: ADMIN_UID,
      }),
    );
  });

  test("DENY admin write when subscriptionStatus=active but oxfordEnabled=false", async () => {
    const ctx = testEnv.authenticatedContext(
      ADMIN_UID,
      authHouseAdmin(ADMIN_UID, OXFORD_HOUSE_ID),
    );
    await testEnv.withSecurityRulesDisabled(async (adminCtx) => {
      await setDoc(doc(adminCtx.firestore(), `houses/${OXFORD_HOUSE_ID}`), {
        oxfordEnabled: false,
        subscriptionStatus: "active",
      });
    });
    await assertFails(
      setDoc(doc(ctx.firestore(), `houses/${OXFORD_HOUSE_ID}/officers/o1`), {
        name: "President",
        userId: ADMIN_UID,
      }),
    );
  });

  test("ALLOW admin write when oxfordEnabled=true and subscriptionStatus=active", async () => {
    const ctx = testEnv.authenticatedContext(
      ADMIN_UID,
      authHouseAdmin(ADMIN_UID, OXFORD_HOUSE_ID),
    );
    await testEnv.withSecurityRulesDisabled(async (adminCtx) => {
      await setDoc(doc(adminCtx.firestore(), `houses/${OXFORD_HOUSE_ID}`), {
        oxfordEnabled: true,
        subscriptionStatus: "active",
      });
    });
    await assertSucceeds(
      setDoc(doc(ctx.firestore(), `houses/${OXFORD_HOUSE_ID}/officers/o1`), {
        name: "President",
        userId: ADMIN_UID,
      }),
    );
  });

  test("ALLOW admin write when oxfordEnabled=true and subscriptionStatus=trialing", async () => {
    const ctx = testEnv.authenticatedContext(
      ADMIN_UID,
      authHouseAdmin(ADMIN_UID, OXFORD_HOUSE_ID),
    );
    await testEnv.withSecurityRulesDisabled(async (adminCtx) => {
      await setDoc(doc(adminCtx.firestore(), `houses/${OXFORD_HOUSE_ID}`), {
        oxfordEnabled: true,
        subscriptionStatus: "trialing",
      });
    });
    await assertSucceeds(
      setDoc(doc(ctx.firestore(), `houses/${OXFORD_HOUSE_ID}/officers/o1`), {
        name: "President",
        userId: ADMIN_UID,
      }),
    );
  });

  test("ALLOW admin read of officers even when subscription canceled", async () => {
    const ctx = testEnv.authenticatedContext(
      ADMIN_UID,
      authHouseAdmin(ADMIN_UID, OXFORD_HOUSE_ID),
    );
    await testEnv.withSecurityRulesDisabled(async (adminCtx) => {
      await setDoc(doc(adminCtx.firestore(), `houses/${OXFORD_HOUSE_ID}`), {
        oxfordEnabled: true,
        subscriptionStatus: "canceled",
      });
      await setDoc(
        doc(adminCtx.firestore(), `houses/${OXFORD_HOUSE_ID}/officers/o1`),
        { name: "President", userId: ADMIN_UID },
      );
    });
    await assertSucceeds(
      getDoc(doc(ctx.firestore(), `houses/${OXFORD_HOUSE_ID}/officers/o1`)),
    );
  });
});

// ─── applications subcollection ────────────────────────────────────────────

const APPLICANT_UID = "applicantUser";
const APP_ID = "app-test-001";

function appDoc(ctx: ReturnType<RulesTestEnvironment["authenticatedContext"]>) {
  return doc(ctx.firestore(), `houses/${HOUSE_ID}/applications/${APP_ID}`);
}

describe("houses/{houseId}/applications/{appId}", () => {
  beforeEach(async () => {
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), `houses/${HOUSE_ID}`), {
        id: HOUSE_ID,
        adminIds: [ADMIN_UID],
        superAdminId: ADMIN_UID,
      });
    });
  });

  describe("create", () => {
    it("allows an authenticated user to create their own application", async () => {
      const ctx = testEnv.authenticatedContext(APPLICANT_UID, {});
      await assertSucceeds(
        setDoc(appDoc(ctx), {
          applicantUid: APPLICANT_UID,
          houseId: HOUSE_ID,
          status: "pending",
          applicantName: "Alice",
          applicantEmail: "alice@example.com",
          createdAt: new Date().toISOString(),
        }),
      );
    });

    it("denies creating an application with a mismatched applicantUid", async () => {
      const ctx = testEnv.authenticatedContext(APPLICANT_UID, {});
      await assertFails(
        setDoc(appDoc(ctx), {
          applicantUid: OTHER_UID,
          houseId: HOUSE_ID,
          status: "pending",
          applicantName: "Alice",
          applicantEmail: "alice@example.com",
          createdAt: new Date().toISOString(),
        }),
      );
    });

    it("denies unauthenticated create", async () => {
      const ctx = testEnv.unauthenticatedContext();
      await assertFails(
        setDoc(appDoc(ctx as any), {
          applicantUid: "anyone",
          status: "pending",
        }),
      );
    });
  });

  describe("read", () => {
    beforeEach(async () => {
      await testEnv.withSecurityRulesDisabled(async (ctx) => {
        await setDoc(
          doc(ctx.firestore(), `houses/${HOUSE_ID}/applications/${APP_ID}`),
          {
            applicantUid: APPLICANT_UID,
            houseId: HOUSE_ID,
            status: "pending",
            applicantName: "Alice",
            applicantEmail: "alice@example.com",
          },
        );
      });
    });

    it("allows the applicant to read their own application", async () => {
      const ctx = testEnv.authenticatedContext(APPLICANT_UID, {});
      await assertSucceeds(getDoc(appDoc(ctx)));
    });

    it("allows house admin to read applications", async () => {
      const ctx = testEnv.authenticatedContext(ADMIN_UID, {
        admin: { [HOUSE_ID]: true },
      });
      await assertSucceeds(getDoc(appDoc(ctx)));
    });

    it("denies other authenticated users from reading applications", async () => {
      const ctx = testEnv.authenticatedContext(OTHER_UID, {});
      await assertFails(getDoc(appDoc(ctx)));
    });
  });

  describe("update", () => {
    beforeEach(async () => {
      await testEnv.withSecurityRulesDisabled(async (ctx) => {
        await setDoc(
          doc(ctx.firestore(), `houses/${HOUSE_ID}/applications/${APP_ID}`),
          {
            applicantUid: APPLICANT_UID,
            houseId: HOUSE_ID,
            status: "pending",
          },
        );
      });
    });

    it("allows house admin to update status", async () => {
      const ctx = testEnv.authenticatedContext(ADMIN_UID, {
        admin: { [HOUSE_ID]: true },
      });
      await assertSucceeds(
        setDoc(appDoc(ctx), { status: "approved" }, { merge: true }),
      );
    });

    it("denies applicant from updating their own application after submission", async () => {
      const ctx = testEnv.authenticatedContext(APPLICANT_UID, {});
      await assertFails(
        setDoc(appDoc(ctx), { status: "approved" }, { merge: true }),
      );
    });
  });
});

describe("Oxford votes — write gate", () => {
  test("DENY admin vote create when subscription canceled", async () => {
    const ctx = testEnv.authenticatedContext(
      ADMIN_UID,
      authHouseAdmin(ADMIN_UID, OXFORD_HOUSE_ID),
    );
    await testEnv.withSecurityRulesDisabled(async (adminCtx) => {
      await setDoc(doc(adminCtx.firestore(), `houses/${OXFORD_HOUSE_ID}`), {
        oxfordEnabled: true,
        subscriptionStatus: "canceled",
      });
    });
    await assertFails(
      setDoc(doc(ctx.firestore(), `houses/${OXFORD_HOUSE_ID}/votes/v1`), {
        question: "Approve budget?",
        createdBy: ADMIN_UID,
      }),
    );
  });

  test("DENY guest vote cast when subscription canceled", async () => {
    const ctx = testEnv.authenticatedContext(
      GUEST_UID,
      authHouseGuest(GUEST_UID, OXFORD_HOUSE_ID),
    );
    await testEnv.withSecurityRulesDisabled(async (adminCtx) => {
      await setDoc(doc(adminCtx.firestore(), `houses/${OXFORD_HOUSE_ID}`), {
        oxfordEnabled: true,
        subscriptionStatus: "canceled",
      });
      await setDoc(
        doc(adminCtx.firestore(), `houses/${OXFORD_HOUSE_ID}/votes/v1`),
        { question: "Approve budget?" },
      );
    });
    await assertFails(
      setDoc(doc(ctx.firestore(), `houses/${OXFORD_HOUSE_ID}/votes/v1`), {
        question: "Approve budget?",
        vote: "yes",
      }),
    );
  });

  // Hardened 2026-07-07: vote casting now goes exclusively through the
  // castOxfordVote Cloud Function (Admin SDK, bypasses these rules), which
  // resolves the caller's guestId from their own auth uid. These tests pin
  // down that NO client — guest or admin — can update a vote doc directly
  // even while Oxford voting is fully active, closing the anonymous-vote
  // tally-tampering gap (a modified client could previously write
  // results/voterIds/individualVotes to whatever it wanted).
  describe("update denial while Oxford is fully active", () => {
    beforeEach(async () => {
      await testEnv.withSecurityRulesDisabled(async (adminCtx) => {
        await setDoc(doc(adminCtx.firestore(), `houses/${OXFORD_HOUSE_ID}`), {
          oxfordEnabled: true,
          subscriptionStatus: "active",
        });
        await setDoc(
          doc(adminCtx.firestore(), `houses/${OXFORD_HOUSE_ID}/votes/v1`),
          {
            question: "Approve budget?",
            results: { yes: 1, no: 0, abstain: 0 },
            voterIds: ["someGuest"],
            individualVotes: {},
            isAnonymous: true,
          },
        );
      });
    });

    test("DENY guest updating a vote doc directly, even with active Oxford", async () => {
      const ctx = testEnv.authenticatedContext(
        GUEST_UID,
        authHouseGuest(GUEST_UID, OXFORD_HOUSE_ID),
      );
      await assertFails(
        setDoc(
          doc(ctx.firestore(), `houses/${OXFORD_HOUSE_ID}/votes/v1`),
          { results: { yes: 99, no: 0, abstain: 0 } },
          { merge: true },
        ),
      );
    });

    test("DENY admin updating a vote doc directly, even with active Oxford", async () => {
      const ctx = testEnv.authenticatedContext(
        ADMIN_UID,
        authHouseAdmin(ADMIN_UID, OXFORD_HOUSE_ID),
      );
      await assertFails(
        setDoc(
          doc(ctx.firestore(), `houses/${OXFORD_HOUSE_ID}/votes/v1`),
          { results: { yes: 99, no: 0, abstain: 0 } },
          { merge: true },
        ),
      );
    });

    test("DENY guest clearing their own id out of voterIds to re-vote", async () => {
      const ctx = testEnv.authenticatedContext(
        GUEST_UID,
        authHouseGuest(GUEST_UID, OXFORD_HOUSE_ID),
      );
      await assertFails(
        setDoc(
          doc(ctx.firestore(), `houses/${OXFORD_HOUSE_ID}/votes/v1`),
          { voterIds: [] },
          { merge: true },
        ),
      );
    });
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

const GUEST_DOC_ID = "guestDocS1";

const BASELINE_GUEST = {
  id: GUEST_DOC_ID,
  userId: GUEST_UID,
  houseId: HOUSE_ID,
  firstName: "Alice",
  lastName: "Smith",
  email: "alice@example.com",
  rentOwed: 150,
  choreFees: 25,
  phase: 1,
  step: 2,
  status: "active",
  isAdmin: false,
  version: 3,
};

async function seedGuestDoc() {
  await testEnv.withSecurityRulesDisabled(async (ctx) => {
    await setDoc(
      doc(ctx.firestore(), `guests/${GUEST_DOC_ID}`),
      BASELINE_GUEST,
    );
  });
}

function guestDocRef(
  ctx: ReturnType<RulesTestEnvironment["authenticatedContext"]>,
) {
  return doc(ctx.firestore(), `guests/${GUEST_DOC_ID}`);
}

describe("guests/{guestId} — self-edit field guard (S1)", () => {
  describe("allowed self-edits", () => {
    test("ALLOW guest editing their own firstName", async () => {
      await seedGuestDoc();
      const ctx = testEnv.authenticatedContext(
        GUEST_UID,
        authHouseGuest(GUEST_UID, HOUSE_ID),
      );
      await assertSucceeds(
        updateDoc(guestDocRef(ctx), { firstName: "Alicia" }),
      );
    });

    test("ALLOW guest editing phoneNumber + emergencyContactName together", async () => {
      await seedGuestDoc();
      const ctx = testEnv.authenticatedContext(
        GUEST_UID,
        authHouseGuest(GUEST_UID, HOUSE_ID),
      );
      await assertSucceeds(
        updateDoc(guestDocRef(ctx), {
          phoneNumber: "555-0100",
          emergencyContactName: "Bob",
        }),
      );
    });

    test("ALLOW guest opting into autoPay (autoPayEnabled)", async () => {
      await seedGuestDoc();
      const ctx = testEnv.authenticatedContext(
        GUEST_UID,
        authHouseGuest(GUEST_UID, HOUSE_ID),
      );
      await assertSucceeds(
        updateDoc(guestDocRef(ctx), { autoPayEnabled: true }),
      );
    });

    test("ALLOW guest bumping version + updatedAt (optimistic lock)", async () => {
      await seedGuestDoc();
      const ctx = testEnv.authenticatedContext(
        GUEST_UID,
        authHouseGuest(GUEST_UID, HOUSE_ID),
      );
      await assertSucceeds(
        updateDoc(guestDocRef(ctx), {
          firstName: "Alicia",
          version: 4,
          updatedAt: new Date().toISOString(),
        }),
      );
    });
  });

  describe("forbidden self-edits — financial", () => {
    test("DENY guest zeroing rentOwed", async () => {
      await seedGuestDoc();
      const ctx = testEnv.authenticatedContext(
        GUEST_UID,
        authHouseGuest(GUEST_UID, HOUSE_ID),
      );
      await assertFails(updateDoc(guestDocRef(ctx), { rentOwed: 0 }));
    });

    test("DENY guest zeroing choreFees", async () => {
      await seedGuestDoc();
      const ctx = testEnv.authenticatedContext(
        GUEST_UID,
        authHouseGuest(GUEST_UID, HOUSE_ID),
      );
      await assertFails(updateDoc(guestDocRef(ctx), { choreFees: 0 }));
    });
  });

  describe("forbidden self-edits — phase / status / privilege", () => {
    test("DENY guest advancing their own phase", async () => {
      await seedGuestDoc();
      const ctx = testEnv.authenticatedContext(
        GUEST_UID,
        authHouseGuest(GUEST_UID, HOUSE_ID),
      );
      await assertFails(updateDoc(guestDocRef(ctx), { phase: 5 }));
    });

    test("DENY guest changing their step", async () => {
      await seedGuestDoc();
      const ctx = testEnv.authenticatedContext(
        GUEST_UID,
        authHouseGuest(GUEST_UID, HOUSE_ID),
      );
      await assertFails(updateDoc(guestDocRef(ctx), { step: 10 }));
    });

    test("DENY guest flipping isAdmin to true (privilege escalation)", async () => {
      await seedGuestDoc();
      const ctx = testEnv.authenticatedContext(
        GUEST_UID,
        authHouseGuest(GUEST_UID, HOUSE_ID),
      );
      await assertFails(updateDoc(guestDocRef(ctx), { isAdmin: true }));
    });

    test("DENY guest writing a roles object", async () => {
      await seedGuestDoc();
      const ctx = testEnv.authenticatedContext(
        GUEST_UID,
        authHouseGuest(GUEST_UID, HOUSE_ID),
      );
      await assertFails(
        updateDoc(guestDocRef(ctx), { roles: { admin: true } }),
      );
    });

    test("DENY guest changing their status to discharged", async () => {
      await seedGuestDoc();
      const ctx = testEnv.authenticatedContext(
        GUEST_UID,
        authHouseGuest(GUEST_UID, HOUSE_ID),
      );
      await assertFails(updateDoc(guestDocRef(ctx), { status: "discharged" }));
    });
  });

  describe("forbidden self-edits — identity / cross-house", () => {
    test("DENY guest changing their userId (defeats ownership check)", async () => {
      await seedGuestDoc();
      const ctx = testEnv.authenticatedContext(
        GUEST_UID,
        authHouseGuest(GUEST_UID, HOUSE_ID),
      );
      await assertFails(
        updateDoc(guestDocRef(ctx), { userId: "someoneElseUid" }),
      );
    });

    test("DENY guest moving themselves to another house", async () => {
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

  describe("mixed allowed + forbidden in same update", () => {
    test("DENY a write that touches BOTH a personal field AND rentOwed", async () => {
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
          firstName: "Alicia",
          rentOwed: 0,
        }),
      );
    });
  });

  describe("admin branch still has full authority", () => {
    test("ALLOW house admin to set rentOwed on a guest", async () => {
      await seedGuestDoc();
      const ctx = testEnv.authenticatedContext(
        ADMIN_UID,
        authHouseAdmin(ADMIN_UID, HOUSE_ID),
      );
      await assertSucceeds(updateDoc(guestDocRef(ctx), { rentOwed: 200 }));
    });

    test("ALLOW house admin to advance a guest phase", async () => {
      await seedGuestDoc();
      const ctx = testEnv.authenticatedContext(
        ADMIN_UID,
        authHouseAdmin(ADMIN_UID, HOUSE_ID),
      );
      await assertSucceeds(updateDoc(guestDocRef(ctx), { phase: 5 }));
    });

    test("DENY admin of a DIFFERENT house touching the guest", async () => {
      await seedGuestDoc();
      const ctx = testEnv.authenticatedContext(
        ADMIN_UID,
        authHouseAdmin(ADMIN_UID, HOUSE_ID_OTHER),
      );
      await assertFails(updateDoc(guestDocRef(ctx), { rentOwed: 0 }));
    });
  });

  describe("cross-user denials", () => {
    test("DENY a different guest writing this guest doc", async () => {
      await seedGuestDoc();
      const ctx = testEnv.authenticatedContext(
        OTHER_UID,
        authHouseGuest(OTHER_UID, HOUSE_ID),
      );
      // OTHER_UID is in the same house but is not the guest's userId.
      // The self-branch fails (userId mismatch); admin branch fails
      // (no admin claim). Result: deny.
      await assertFails(updateDoc(guestDocRef(ctx), { firstName: "Mallory" }));
    });
  });
});

describe("invitations/{token} — all client access denied (server-only)", () => {
  const TOKEN = "test-token-abc";

  test("DENY unauthenticated client read", async () => {
    const ctx = testEnv.unauthenticatedContext();
    await assertFails(getDoc(doc(ctx.firestore(), `invitations/${TOKEN}`)));
  });

  test("DENY unauthenticated client write", async () => {
    const ctx = testEnv.unauthenticatedContext();
    await assertFails(
      setDoc(doc(ctx.firestore(), `invitations/${TOKEN}`), { x: 1 }),
    );
  });

  test("DENY signed-in user read", async () => {
    const ctx = testEnv.authenticatedContext(
      OTHER_UID,
      authUserOnly(OTHER_UID),
    );
    await assertFails(getDoc(doc(ctx.firestore(), `invitations/${TOKEN}`)));
  });

  test("DENY admin of any house writing an invitation directly", async () => {
    const ctx = testEnv.authenticatedContext(
      ADMIN_UID,
      authHouseAdmin(ADMIN_UID, HOUSE_ID),
    );
    await assertFails(
      setDoc(doc(ctx.firestore(), `invitations/${TOKEN}`), {
        token: TOKEN,
        inviterUid: ADMIN_UID,
        houseId: HOUSE_ID,
        role: "admin",
        invitedEmail: "x@x.com",
        expiresAt: new Date(Date.now() + 86400000).toISOString(),
        createdAt: new Date().toISOString(),
      }),
    );
  });

  test("DENY redemption-via-client write (anyone trying to set redeemedAt)", async () => {
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

const ARCHIVE_DOC_ID = "archivedGuest1";
const BASELINE_ARCHIVE = {
  id: ARCHIVE_DOC_ID,
  houseId: HOUSE_ID,
  firstName: "Alice",
  rentOwed: 500,
  dischargeReason: "completed",
};

async function seedArchiveDoc() {
  await testEnv.withSecurityRulesDisabled(async (ctx) => {
    await setDoc(
      doc(ctx.firestore(), `guest-archive/${ARCHIVE_DOC_ID}`),
      BASELINE_ARCHIVE,
    );
  });
}

function archiveDocRef(
  ctx: ReturnType<RulesTestEnvironment["authenticatedContext"]>,
) {
  return doc(ctx.firestore(), `guest-archive/${ARCHIVE_DOC_ID}`);
}

describe("guest-archive/{guestId} — admin-only write guard (C5)", () => {
  test("ALLOW guest reading archive in their house", async () => {
    await seedArchiveDoc();
    const ctx = testEnv.authenticatedContext(
      GUEST_UID,
      authHouseGuest(GUEST_UID, HOUSE_ID),
    );
    await assertSucceeds(getDoc(archiveDocRef(ctx)));
  });

  test("ALLOW admin creating an archive record", async () => {
    const ctx = testEnv.authenticatedContext(
      ADMIN_UID,
      authHouseAdmin(ADMIN_UID, HOUSE_ID),
    );
    await assertSucceeds(setDoc(archiveDocRef(ctx), BASELINE_ARCHIVE));
  });

  test("ALLOW admin updating an archive record", async () => {
    await seedArchiveDoc();
    const ctx = testEnv.authenticatedContext(
      ADMIN_UID,
      authHouseAdmin(ADMIN_UID, HOUSE_ID),
    );
    await assertSucceeds(updateDoc(archiveDocRef(ctx), { rentOwed: 0 }));
  });

  test("ALLOW admin deleting an archive record", async () => {
    await seedArchiveDoc();
    const ctx = testEnv.authenticatedContext(
      ADMIN_UID,
      authHouseAdmin(ADMIN_UID, HOUSE_ID),
    );
    await assertSucceeds(deleteDoc(archiveDocRef(ctx)));
  });

  test("DENY guest creating an archive record", async () => {
    const ctx = testEnv.authenticatedContext(
      GUEST_UID,
      authHouseGuest(GUEST_UID, HOUSE_ID),
    );
    await assertFails(setDoc(archiveDocRef(ctx), BASELINE_ARCHIVE));
  });

  test("DENY guest overwriting their own discharge/financial record", async () => {
    await seedArchiveDoc();
    const ctx = testEnv.authenticatedContext(
      GUEST_UID,
      authHouseGuest(GUEST_UID, HOUSE_ID),
    );
    await assertFails(updateDoc(archiveDocRef(ctx), { rentOwed: 0 }));
  });

  test("DENY guest deleting an archive record", async () => {
    await seedArchiveDoc();
    const ctx = testEnv.authenticatedContext(
      GUEST_UID,
      authHouseGuest(GUEST_UID, HOUSE_ID),
    );
    await assertFails(deleteDoc(archiveDocRef(ctx)));
  });
});

// ===========================================================================
// bugs/{bugId} — reporter-scoped access [H-sec-3]
// ===========================================================================
//
// Previously `allow read, write: if signedIn()` let any signed-in user read or
// overwrite every house's bug reports (free-text that may contain resident PII).
// The rule now scopes access to the report's `reporter`; developers triage via
// the Admin SDK / console (bypasses rules).

const BUG_ID = "bug1";
const BUG_DOC = {
  id: BUG_ID,
  description: "crash on save",
  reporter: GUEST_UID,
};

function bugRef(ctx: ReturnType<RulesTestEnvironment["authenticatedContext"]>) {
  return doc(ctx.firestore(), `bugs/${BUG_ID}`);
}

async function seedBug(reporter: string = GUEST_UID) {
  await testEnv.withSecurityRulesDisabled(async (ctx) => {
    await setDoc(doc(ctx.firestore(), `bugs/${BUG_ID}`), {
      ...BUG_DOC,
      reporter,
    });
  });
}

describe("bugs/{bugId} — reporter-scoped access (H-sec-3)", () => {
  test("ALLOW reporter creating their own bug report", async () => {
    const ctx = testEnv.authenticatedContext(
      GUEST_UID,
      authUserOnly(GUEST_UID),
    );
    await assertSucceeds(setDoc(bugRef(ctx), BUG_DOC));
  });

  test("DENY creating a bug report attributed to another user", async () => {
    const ctx = testEnv.authenticatedContext(
      GUEST_UID,
      authUserOnly(GUEST_UID),
    );
    await assertFails(setDoc(bugRef(ctx), { ...BUG_DOC, reporter: OTHER_UID }));
  });

  test("DENY unauthenticated user creating a bug report", async () => {
    const ctx = testEnv.unauthenticatedContext();
    await assertFails(setDoc(bugRef(ctx), BUG_DOC));
  });

  test("ALLOW reporter reading their own bug report", async () => {
    await seedBug();
    const ctx = testEnv.authenticatedContext(
      GUEST_UID,
      authUserOnly(GUEST_UID),
    );
    await assertSucceeds(getDoc(bugRef(ctx)));
  });

  test("DENY a different signed-in user reading another user bug report", async () => {
    await seedBug();
    const ctx = testEnv.authenticatedContext(
      OTHER_UID,
      authUserOnly(OTHER_UID),
    );
    await assertFails(getDoc(bugRef(ctx)));
  });

  test("ALLOW reporter updating their own bug report", async () => {
    await seedBug();
    const ctx = testEnv.authenticatedContext(
      GUEST_UID,
      authUserOnly(GUEST_UID),
    );
    await assertSucceeds(
      updateDoc(bugRef(ctx), { description: "more detail" }),
    );
  });

  test("DENY a different user updating another user bug report", async () => {
    await seedBug();
    const ctx = testEnv.authenticatedContext(
      OTHER_UID,
      authUserOnly(OTHER_UID),
    );
    await assertFails(updateDoc(bugRef(ctx), { description: "tamper" }));
  });

  test("ALLOW reporter deleting their own bug report", async () => {
    await seedBug();
    const ctx = testEnv.authenticatedContext(
      GUEST_UID,
      authUserOnly(GUEST_UID),
    );
    await assertSucceeds(deleteDoc(bugRef(ctx)));
  });

  test("DENY a different user deleting another user bug report", async () => {
    await seedBug();
    const ctx = testEnv.authenticatedContext(
      OTHER_UID,
      authUserOnly(OTHER_UID),
    );
    await assertFails(deleteDoc(bugRef(ctx)));
  });
});

// ===========================================================================
// feedback/{feedbackId} — submitter/admin-scoped access [H-sec-4]
// ===========================================================================
//
// Previously `allow read, write: if signedIn()` exposed every user's feedback
// (may contain PII) to all signed-in users. Access is now scoped to the
// submitter (`reviewer`) or a house admin. App-level feedback (houseId == '')
// is submitter-only since no one is an admin of ''.

const FB_ID = "fb1";
const FB_DOC = {
  id: FB_ID,
  description: "great app",
  reviewer: GUEST_UID,
  type: "house",
  houseId: HOUSE_ID,
};

function fbRef(ctx: ReturnType<RulesTestEnvironment["authenticatedContext"]>) {
  return doc(ctx.firestore(), `feedback/${FB_ID}`);
}

async function seedFeedback(overrides: Record<string, unknown> = {}) {
  await testEnv.withSecurityRulesDisabled(async (ctx) => {
    await setDoc(doc(ctx.firestore(), `feedback/${FB_ID}`), {
      ...FB_DOC,
      ...overrides,
    });
  });
}

describe("feedback/{feedbackId} — submitter/admin-scoped access (H-sec-4)", () => {
  test("ALLOW submitter creating their own feedback", async () => {
    const ctx = testEnv.authenticatedContext(
      GUEST_UID,
      authHouseGuest(GUEST_UID, HOUSE_ID),
    );
    await assertSucceeds(setDoc(fbRef(ctx), FB_DOC));
  });

  test("DENY creating feedback attributed to another user", async () => {
    const ctx = testEnv.authenticatedContext(
      GUEST_UID,
      authHouseGuest(GUEST_UID, HOUSE_ID),
    );
    await assertFails(setDoc(fbRef(ctx), { ...FB_DOC, reviewer: OTHER_UID }));
  });

  test("ALLOW submitter reading their own feedback", async () => {
    await seedFeedback();
    const ctx = testEnv.authenticatedContext(
      GUEST_UID,
      authHouseGuest(GUEST_UID, HOUSE_ID),
    );
    await assertSucceeds(getDoc(fbRef(ctx)));
  });

  test("ALLOW house admin reading house-scoped feedback", async () => {
    await seedFeedback();
    const ctx = testEnv.authenticatedContext(
      ADMIN_UID,
      authHouseAdmin(ADMIN_UID, HOUSE_ID),
    );
    await assertSucceeds(getDoc(fbRef(ctx)));
  });

  test("DENY a non-submitter, non-admin member reading feedback", async () => {
    await seedFeedback();
    const ctx = testEnv.authenticatedContext(
      OTHER_UID,
      authHouseGuest(OTHER_UID, HOUSE_ID),
    );
    await assertFails(getDoc(fbRef(ctx)));
  });

  test("DENY admin of a different house reading feedback", async () => {
    await seedFeedback();
    const ctx = testEnv.authenticatedContext(
      ADMIN_UID,
      authHouseAdmin(ADMIN_UID, HOUSE_ID_OTHER),
    );
    await assertFails(getDoc(fbRef(ctx)));
  });

  test("DENY admin reading app-level feedback (houseId empty)", async () => {
    await seedFeedback({ type: "app", houseId: "" });
    const ctx = testEnv.authenticatedContext(
      ADMIN_UID,
      authHouseAdmin(ADMIN_UID, HOUSE_ID),
    );
    await assertFails(getDoc(fbRef(ctx)));
  });

  test("ALLOW submitter reading their own app-level feedback", async () => {
    await seedFeedback({ type: "app", houseId: "" });
    const ctx = testEnv.authenticatedContext(
      GUEST_UID,
      authUserOnly(GUEST_UID),
    );
    await assertSucceeds(getDoc(fbRef(ctx)));
  });

  test("ALLOW house admin deleting house feedback", async () => {
    await seedFeedback();
    const ctx = testEnv.authenticatedContext(
      ADMIN_UID,
      authHouseAdmin(ADMIN_UID, HOUSE_ID),
    );
    await assertSucceeds(deleteDoc(fbRef(ctx)));
  });

  test("DENY a stranger deleting feedback", async () => {
    await seedFeedback();
    const ctx = testEnv.authenticatedContext(
      OTHER_UID,
      authUserOnly(OTHER_UID),
    );
    await assertFails(deleteDoc(fbRef(ctx)));
  });
});

// ===========================================================================
// contact/{contactId} — bounded public create, server-only reads [H-sec-5]
// ===========================================================================
//
// The public contact form stays open to unauthenticated submitters, but the
// payload is size-bounded (spam / quota-drain / SendGrid cost amplification) and
// all client reads/updates/deletes are denied (triaged server-side).

const CONTACT_DOC = {
  name: "Alice",
  email: "alice@example.com",
  message: "Hello, I have a question.",
  subject: "Inquiry",
};

function contactRef(
  ctx: ReturnType<RulesTestEnvironment["unauthenticatedContext"]>,
  id: string = "c1",
) {
  return doc(ctx.firestore(), `contact/${id}`);
}

describe("contact/{contactId} — bounded public create, server-only reads (H-sec-5)", () => {
  test("ALLOW unauthenticated bounded submission", async () => {
    const ctx = testEnv.unauthenticatedContext();
    await assertSucceeds(setDoc(contactRef(ctx), CONTACT_DOC));
  });

  test("DENY submission with an oversized message", async () => {
    const ctx = testEnv.unauthenticatedContext();
    await assertFails(
      setDoc(contactRef(ctx), { ...CONTACT_DOC, message: "x".repeat(5001) }),
    );
  });

  test("DENY submission missing the email field", async () => {
    const ctx = testEnv.unauthenticatedContext();
    await assertFails(
      setDoc(contactRef(ctx), { name: "A", message: "hi", subject: "s" }),
    );
  });

  test("DENY submission with too many fields", async () => {
    const ctx = testEnv.unauthenticatedContext();
    const payload: Record<string, string> = {
      message: "m",
      email: "e@e.com",
    };
    for (let i = 0; i < 13; i++) {
      payload[`extra${i}`] = String(i);
    }
    await assertFails(setDoc(contactRef(ctx), payload));
  });

  test("DENY signed-in user reading a contact submission", async () => {
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), "contact/c1"), CONTACT_DOC);
    });
    const ctx = testEnv.authenticatedContext(
      OTHER_UID,
      authUserOnly(OTHER_UID),
    );
    await assertFails(getDoc(doc(ctx.firestore(), "contact/c1")));
  });

  test("DENY signed-in user updating/deleting a contact submission", async () => {
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), "contact/c1"), CONTACT_DOC);
    });
    const ctx = testEnv.authenticatedContext(
      OTHER_UID,
      authUserOnly(OTHER_UID),
    );
    await assertFails(
      updateDoc(doc(ctx.firestore(), "contact/c1"), { name: "x" }),
    );
    await assertFails(deleteDoc(doc(ctx.firestore(), "contact/c1")));
  });
});

// ===========================================================================
// beta-users/{docId} — server-only [H-sec-5]
// ===========================================================================
//
// No client read/write path exists; the allowlist is admin/console-managed.
// All client access is denied to remove the unauthenticated-write surface.

describe("beta-users/{docId} — server-only (H-sec-5)", () => {
  test("DENY unauthenticated create", async () => {
    const ctx = testEnv.unauthenticatedContext();
    await assertFails(
      setDoc(doc(ctx.firestore(), "beta-users/users"), { emails: ["a@b.com"] }),
    );
  });

  test("DENY signed-in create", async () => {
    const ctx = testEnv.authenticatedContext(
      OTHER_UID,
      authUserOnly(OTHER_UID),
    );
    await assertFails(
      setDoc(doc(ctx.firestore(), "beta-users/users"), { emails: ["a@b.com"] }),
    );
  });

  test("DENY signed-in read", async () => {
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), "beta-users/users"), {
        emails: ["a@b.com"],
      });
    });
    const ctx = testEnv.authenticatedContext(
      OTHER_UID,
      authUserOnly(OTHER_UID),
    );
    await assertFails(getDoc(doc(ctx.firestore(), "beta-users/users")));
  });
});

// ===========================================================================
// complaints/{complaintId} — house-scoped, houseId immutable [H-sec-2]
// ===========================================================================

const COMPLAINT_ID = "comp1";
const COMPLAINT_DOC = {
  id: COMPLAINT_ID,
  description: "noise after hours",
  plaintiff: GUEST_UID,
  plaintiffType: "guest",
  reply: "",
  houseId: HOUSE_ID,
};

function complaintRef(
  ctx: ReturnType<RulesTestEnvironment["authenticatedContext"]>,
) {
  return doc(ctx.firestore(), `complaints/${COMPLAINT_ID}`);
}

async function seedComplaint() {
  await testEnv.withSecurityRulesDisabled(async (ctx) => {
    await setDoc(
      doc(ctx.firestore(), `complaints/${COMPLAINT_ID}`),
      COMPLAINT_DOC,
    );
  });
}

describe("complaints/{complaintId} — house-scoped, houseId immutable (H-sec-2)", () => {
  test("ALLOW guest of the house creating a complaint", async () => {
    const ctx = testEnv.authenticatedContext(
      GUEST_UID,
      authHouseGuest(GUEST_UID, HOUSE_ID),
    );
    await assertSucceeds(setDoc(complaintRef(ctx), COMPLAINT_DOC));
  });

  test("ALLOW admin of the house creating a complaint", async () => {
    const ctx = testEnv.authenticatedContext(
      ADMIN_UID,
      authHouseAdmin(ADMIN_UID, HOUSE_ID),
    );
    await assertSucceeds(setDoc(complaintRef(ctx), COMPLAINT_DOC));
  });

  test("DENY non-member creating a complaint in the house", async () => {
    const ctx = testEnv.authenticatedContext(
      OTHER_UID,
      authUserOnly(OTHER_UID),
    );
    await assertFails(setDoc(complaintRef(ctx), COMPLAINT_DOC));
  });

  test("DENY creating a complaint scoped to a house the caller is not in", async () => {
    const ctx = testEnv.authenticatedContext(
      GUEST_UID,
      authHouseGuest(GUEST_UID, HOUSE_ID),
    );
    await assertFails(
      setDoc(complaintRef(ctx), { ...COMPLAINT_DOC, houseId: HOUSE_ID_OTHER }),
    );
  });

  test("ALLOW the complainant (plaintiff) reading their own complaint", async () => {
    await seedComplaint(); // plaintiff === GUEST_UID
    const ctx = testEnv.authenticatedContext(
      GUEST_UID,
      authHouseGuest(GUEST_UID, HOUSE_ID),
    );
    await assertSucceeds(getDoc(complaintRef(ctx)));
  });

  test("ALLOW house admin reading a complaint", async () => {
    await seedComplaint();
    const ctx = testEnv.authenticatedContext(
      ADMIN_UID,
      authHouseAdmin(ADMIN_UID, HOUSE_ID),
    );
    await assertSucceeds(getDoc(complaintRef(ctx)));
  });

  test("DENY a house member who is not the complainant reading a complaint", async () => {
    await seedComplaint(); // plaintiff === GUEST_UID
    const ctx = testEnv.authenticatedContext(
      "guest-2",
      authHouseGuest("guest-2", HOUSE_ID),
    );
    await assertFails(getDoc(complaintRef(ctx)));
  });

  test("DENY non-member reading a complaint", async () => {
    await seedComplaint();
    const ctx = testEnv.authenticatedContext(
      OTHER_UID,
      authUserOnly(OTHER_UID),
    );
    await assertFails(getDoc(complaintRef(ctx)));
  });

  test("ALLOW member updating a complaint while preserving houseId", async () => {
    await seedComplaint();
    const ctx = testEnv.authenticatedContext(
      ADMIN_UID,
      authHouseAdmin(ADMIN_UID, HOUSE_ID),
    );
    await assertSucceeds(updateDoc(complaintRef(ctx), { reply: "handled" }));
  });

  test("DENY update that re-parents the complaint to another house", async () => {
    await seedComplaint();
    const ctx = testEnv.authenticatedContext(
      ADMIN_UID,
      authHouseAdmin(ADMIN_UID, HOUSE_ID),
    );
    await assertFails(
      updateDoc(complaintRef(ctx), { houseId: HOUSE_ID_OTHER }),
    );
  });

  test("DENY guest deleting a complaint", async () => {
    await seedComplaint();
    const ctx = testEnv.authenticatedContext(
      GUEST_UID,
      authHouseGuest(GUEST_UID, HOUSE_ID),
    );
    await assertFails(deleteDoc(complaintRef(ctx)));
  });

  test("ALLOW admin deleting a complaint", async () => {
    await seedComplaint();
    const ctx = testEnv.authenticatedContext(
      ADMIN_UID,
      authHouseAdmin(ADMIN_UID, HOUSE_ID),
    );
    await assertSucceeds(deleteDoc(complaintRef(ctx)));
  });
});

// ===========================================================================
// disputes/{disputeId} — house-scoped, houseId immutable [H-sec-2]
// ===========================================================================

const DISPUTE_ID = "disp1";
const DISPUTE_DOC = {
  id: DISPUTE_ID,
  guestId: GUEST_UID,
  houseId: HOUSE_ID,
  activityId: "act1",
  type: "CHORE",
  message: "I completed this chore",
  status: "pending",
  createdDate: "2026-06-22T00:00:00.000Z",
  createdAt: "2026-06-22T00:00:00.000Z",
  updatedAt: "2026-06-22T00:00:00.000Z",
};

function disputeRef(
  ctx: ReturnType<RulesTestEnvironment["authenticatedContext"]>,
) {
  return doc(ctx.firestore(), `disputes/${DISPUTE_ID}`);
}

async function seedDispute() {
  await testEnv.withSecurityRulesDisabled(async (ctx) => {
    await setDoc(doc(ctx.firestore(), `disputes/${DISPUTE_ID}`), DISPUTE_DOC);
  });
}

describe("disputes/{disputeId} — house-scoped, houseId immutable (H-sec-2)", () => {
  test("ALLOW guest of the house creating a dispute", async () => {
    const ctx = testEnv.authenticatedContext(
      GUEST_UID,
      authHouseGuest(GUEST_UID, HOUSE_ID),
    );
    await assertSucceeds(setDoc(disputeRef(ctx), DISPUTE_DOC));
  });

  test("DENY non-member creating a dispute in the house", async () => {
    const ctx = testEnv.authenticatedContext(
      OTHER_UID,
      authUserOnly(OTHER_UID),
    );
    await assertFails(setDoc(disputeRef(ctx), DISPUTE_DOC));
  });

  test("DENY creating a dispute scoped to a house the caller is not in", async () => {
    const ctx = testEnv.authenticatedContext(
      GUEST_UID,
      authHouseGuest(GUEST_UID, HOUSE_ID),
    );
    await assertFails(
      setDoc(disputeRef(ctx), { ...DISPUTE_DOC, houseId: HOUSE_ID_OTHER }),
    );
  });

  test("ALLOW house admin reading a dispute", async () => {
    await seedDispute();
    const ctx = testEnv.authenticatedContext(
      ADMIN_UID,
      authHouseAdmin(ADMIN_UID, HOUSE_ID),
    );
    await assertSucceeds(getDoc(disputeRef(ctx)));
  });

  test("ALLOW the disputing resident reading their own dispute", async () => {
    await seedDispute(); // guestId === GUEST_UID
    const ctx = testEnv.authenticatedContext(
      GUEST_UID,
      authHouseGuest(GUEST_UID, HOUSE_ID),
    );
    await assertSucceeds(getDoc(disputeRef(ctx)));
  });

  test("DENY a house member who is not the disputing resident reading a dispute", async () => {
    await seedDispute(); // guestId === GUEST_UID
    const ctx = testEnv.authenticatedContext(
      "guest-2",
      authHouseGuest("guest-2", HOUSE_ID),
    );
    await assertFails(getDoc(disputeRef(ctx)));
  });

  test("DENY non-member reading a dispute", async () => {
    await seedDispute();
    const ctx = testEnv.authenticatedContext(
      OTHER_UID,
      authUserOnly(OTHER_UID),
    );
    await assertFails(getDoc(disputeRef(ctx)));
  });

  test("ALLOW member resolving a dispute while preserving houseId", async () => {
    await seedDispute();
    const ctx = testEnv.authenticatedContext(
      ADMIN_UID,
      authHouseAdmin(ADMIN_UID, HOUSE_ID),
    );
    await assertSucceeds(
      updateDoc(disputeRef(ctx), { status: "resolved", resolvedBy: ADMIN_UID }),
    );
  });

  test("DENY update that re-parents the dispute to another house", async () => {
    await seedDispute();
    const ctx = testEnv.authenticatedContext(
      ADMIN_UID,
      authHouseAdmin(ADMIN_UID, HOUSE_ID),
    );
    await assertFails(updateDoc(disputeRef(ctx), { houseId: HOUSE_ID_OTHER }));
  });

  test("DENY guest deleting a dispute", async () => {
    await seedDispute();
    const ctx = testEnv.authenticatedContext(
      GUEST_UID,
      authHouseGuest(GUEST_UID, HOUSE_ID),
    );
    await assertFails(deleteDoc(disputeRef(ctx)));
  });

  test("ALLOW admin deleting a dispute", async () => {
    await seedDispute();
    const ctx = testEnv.authenticatedContext(
      ADMIN_UID,
      authHouseAdmin(ADMIN_UID, HOUSE_ID),
    );
    await assertSucceeds(deleteDoc(disputeRef(ctx)));
  });

  // P1-2 identity pinning: guestId must match request.auth.uid for guest creates
  test("DENY guest creating a dispute attributed to a different guestId", async () => {
    const ctx = testEnv.authenticatedContext(
      GUEST_UID,
      authHouseGuest(GUEST_UID, HOUSE_ID),
    );
    await assertFails(
      setDoc(disputeRef(ctx), { ...DISPUTE_DOC, guestId: OTHER_UID }),
    );
  });

  test("ALLOW admin creating a dispute attributed to another resident", async () => {
    const ctx = testEnv.authenticatedContext(
      ADMIN_UID,
      authHouseAdmin(ADMIN_UID, HOUSE_ID),
    );
    // Admin may file on behalf of any guestId — guestId != admin's UID
    await assertSucceeds(
      setDoc(disputeRef(ctx), { ...DISPUTE_DOC, guestId: OTHER_UID }),
    );
  });
});

// P1-2: complaint plaintiff identity pinning
describe("complaints/{complaintId} — plaintiff identity pinning (P1-2)", () => {
  test("DENY guest creating a complaint attributed to a different plaintiff", async () => {
    const ctx = testEnv.authenticatedContext(
      GUEST_UID,
      authHouseGuest(GUEST_UID, HOUSE_ID),
    );
    await assertFails(
      setDoc(complaintRef(ctx), { ...COMPLAINT_DOC, plaintiff: OTHER_UID }),
    );
  });

  test("ALLOW admin creating a complaint with an anonymous plaintiff (empty string)", async () => {
    const ctx = testEnv.authenticatedContext(
      ADMIN_UID,
      authHouseAdmin(ADMIN_UID, HOUSE_ID),
    );
    // Anonymous complaints are admin-only by construction (plaintiff == '')
    await assertSucceeds(
      setDoc(complaintRef(ctx), { ...COMPLAINT_DOC, plaintiff: "" }),
    );
  });

  test("DENY guest creating an anonymous complaint (plaintiff empty — admin-only)", async () => {
    const ctx = testEnv.authenticatedContext(
      GUEST_UID,
      authHouseGuest(GUEST_UID, HOUSE_ID),
    );
    await assertFails(
      setDoc(complaintRef(ctx), { ...COMPLAINT_DOC, plaintiff: "" }),
    );
  });
});

// ===========================================================================
// issues/{issueId} — house-scoped, houseId immutable (P1-2)
// ===========================================================================
//
// The issues update rule previously used request.resource.data.houseId (the
// new value) for membership checks without enforcing houseId immutability.
// This would allow re-parenting an issue to a different house. The rule now
// mirrors disputes/complaints: membership is checked against resource.data
// (existing house) and houseId must not change.

const ISSUE_ID = "issue1";
const ISSUE_DOC = {
  id: ISSUE_ID,
  type: "MAINTENANCE",
  description: "Leaky faucet in bathroom",
  emergency: false,
  issuer: GUEST_UID,
  resolver: "",
  houseId: HOUSE_ID,
  status: "OPEN",
};

function issueRef(
  ctx: ReturnType<RulesTestEnvironment["authenticatedContext"]>,
) {
  return doc(ctx.firestore(), `issues/${ISSUE_ID}`);
}

async function seedIssue() {
  await testEnv.withSecurityRulesDisabled(async (ctx) => {
    await setDoc(doc(ctx.firestore(), `issues/${ISSUE_ID}`), ISSUE_DOC);
  });
}

describe("issues/{issueId} — house-scoped, houseId immutable (P1-2)", () => {
  describe("create", () => {
    test("ALLOW guest of the house creating an issue", async () => {
      const ctx = testEnv.authenticatedContext(
        GUEST_UID,
        authHouseGuest(GUEST_UID, HOUSE_ID),
      );
      await assertSucceeds(setDoc(issueRef(ctx), ISSUE_DOC));
    });

    test("ALLOW admin of the house creating an issue", async () => {
      const ctx = testEnv.authenticatedContext(
        ADMIN_UID,
        authHouseAdmin(ADMIN_UID, HOUSE_ID),
      );
      await assertSucceeds(setDoc(issueRef(ctx), ISSUE_DOC));
    });

    test("DENY non-member creating an issue", async () => {
      const ctx = testEnv.authenticatedContext(
        OTHER_UID,
        authUserOnly(OTHER_UID),
      );
      await assertFails(setDoc(issueRef(ctx), ISSUE_DOC));
    });

    test("DENY creating an issue scoped to a house the caller is not in", async () => {
      const ctx = testEnv.authenticatedContext(
        GUEST_UID,
        authHouseGuest(GUEST_UID, HOUSE_ID),
      );
      await assertFails(
        setDoc(issueRef(ctx), { ...ISSUE_DOC, houseId: HOUSE_ID_OTHER }),
      );
    });
  });

  describe("read", () => {
    test("ALLOW guest reading an issue in their house", async () => {
      await seedIssue();
      const ctx = testEnv.authenticatedContext(
        GUEST_UID,
        authHouseGuest(GUEST_UID, HOUSE_ID),
      );
      await assertSucceeds(getDoc(issueRef(ctx)));
    });

    test("ALLOW admin reading an issue in their house", async () => {
      await seedIssue();
      const ctx = testEnv.authenticatedContext(
        ADMIN_UID,
        authHouseAdmin(ADMIN_UID, HOUSE_ID),
      );
      await assertSucceeds(getDoc(issueRef(ctx)));
    });

    test("DENY non-member reading an issue", async () => {
      await seedIssue();
      const ctx = testEnv.authenticatedContext(
        OTHER_UID,
        authUserOnly(OTHER_UID),
      );
      await assertFails(getDoc(issueRef(ctx)));
    });
  });

  describe("update — houseId immutability", () => {
    test("ALLOW guest updating an issue (houseId unchanged)", async () => {
      await seedIssue();
      const ctx = testEnv.authenticatedContext(
        GUEST_UID,
        authHouseGuest(GUEST_UID, HOUSE_ID),
      );
      await assertSucceeds(updateDoc(issueRef(ctx), { status: "IN_PROGRESS" }));
    });

    test("ALLOW admin updating an issue (houseId unchanged)", async () => {
      await seedIssue();
      const ctx = testEnv.authenticatedContext(
        ADMIN_UID,
        authHouseAdmin(ADMIN_UID, HOUSE_ID),
      );
      await assertSucceeds(
        updateDoc(issueRef(ctx), { status: "RESOLVED", resolver: ADMIN_UID }),
      );
    });

    test("DENY update that re-parents the issue to another house", async () => {
      await seedIssue();
      const ctx = testEnv.authenticatedContext(
        ADMIN_UID,
        authHouseAdmin(ADMIN_UID, HOUSE_ID),
      );
      await assertFails(updateDoc(issueRef(ctx), { houseId: HOUSE_ID_OTHER }));
    });

    test("DENY non-member updating an issue", async () => {
      await seedIssue();
      const ctx = testEnv.authenticatedContext(
        OTHER_UID,
        authUserOnly(OTHER_UID),
      );
      await assertFails(updateDoc(issueRef(ctx), { status: "RESOLVED" }));
    });
  });

  describe("delete", () => {
    test("ALLOW admin deleting an issue", async () => {
      await seedIssue();
      const ctx = testEnv.authenticatedContext(
        ADMIN_UID,
        authHouseAdmin(ADMIN_UID, HOUSE_ID),
      );
      await assertSucceeds(deleteDoc(issueRef(ctx)));
    });

    test("DENY guest deleting an issue", async () => {
      await seedIssue();
      const ctx = testEnv.authenticatedContext(
        GUEST_UID,
        authHouseGuest(GUEST_UID, HOUSE_ID),
      );
      await assertFails(deleteDoc(issueRef(ctx)));
    });
  });
});

// ---------------------------------------------------------------------------
// houses/{houseId} — delete rule
//
// Regression coverage for 2026-07-05: the delete rule used to read
// `request.resource.data.id`, but `request.resource` does not exist on
// delete operations (there is no incoming document) — so the rule always
// evaluated to false/error and no admin could ever delete a house. Fixed to
// use the `houseId` path segment directly, matching every other rule in
// this match block.
// ---------------------------------------------------------------------------
describe("houses/{houseId} — delete", () => {
  async function seedHouse() {
    await testEnv.withSecurityRulesDisabled(async (context) => {
      await context
        .firestore()
        .doc(`houses/${HOUSE_ID}`)
        .set({ id: HOUSE_ID, name: "Test House" });
    });
  }

  function houseRef(
    ctx: ReturnType<RulesTestEnvironment["authenticatedContext"]>,
  ) {
    return doc(ctx.firestore(), `houses/${HOUSE_ID}`);
  }

  test("ALLOW an admin of the house to delete it", async () => {
    await seedHouse();
    const ctx = testEnv.authenticatedContext(
      ADMIN_UID,
      authHouseAdmin(ADMIN_UID, HOUSE_ID),
    );
    await assertSucceeds(deleteDoc(houseRef(ctx)));
  });

  // Regression coverage for 2026-07-07: this rule used isHouseAdmin(houseId)
  // (admin claim only), inconsistent with every sibling rule in this match
  // block (create/update/read all use isAdmin([houseId]), which also grants
  // superAdmin) — a superAdmin who can edit a house couldn't delete it.
  test("ALLOW a superAdmin of the house to delete it", async () => {
    await seedHouse();
    const ctx = testEnv.authenticatedContext(
      ADMIN_UID,
      authHouseSuperAdmin(ADMIN_UID, HOUSE_ID),
    );
    await assertSucceeds(deleteDoc(houseRef(ctx)));
  });

  test("DENY a guest of the house deleting it", async () => {
    await seedHouse();
    const ctx = testEnv.authenticatedContext(
      GUEST_UID,
      authHouseGuest(GUEST_UID, HOUSE_ID),
    );
    await assertFails(deleteDoc(houseRef(ctx)));
  });

  test("DENY an admin of a DIFFERENT house deleting it", async () => {
    await seedHouse();
    const ctx = testEnv.authenticatedContext(
      ADMIN_UID,
      authHouseAdmin(ADMIN_UID, HOUSE_ID_OTHER),
    );
    await assertFails(deleteDoc(houseRef(ctx)));
  });

  test("DENY an unauthenticated user deleting it", async () => {
    await seedHouse();
    const ctx = testEnv.unauthenticatedContext();
    await assertFails(deleteDoc(houseRef(ctx)));
  });
});

// ---------------------------------------------------------------------------
// houses/{houseId} — update: sensitive financial/ownership fields restricted
// to superAdmin ("Operator") only.
//
// The app's own permission model (src/context/rules.ts) grants regular
// `admin` only `house:partial-edit`, and reserves `house:full-edit` — which
// gates the financial/ownership controls in HouseSummary.tsx — for
// `superAdmin` alone. Before this fix, the update rule used isAdmin([houseId])
// (true for both admin AND superAdmin) with no field restriction beyond the
// one already applied to guests, so a regular admin could write
// stripeAccountId/stripeStatus/monthlyRent/weeklyRent/adminIds/ownerId
// directly via the API/SDK even though the UI never exposes that capability
// to them. Tightened so admins are held to the same sensitive-field
// allowlist as guests; only superAdmin may touch those fields.
// ---------------------------------------------------------------------------
describe("houses/{houseId} — update: sensitive fields restricted to superAdmin", () => {
  async function seedHouse() {
    await testEnv.withSecurityRulesDisabled(async (context) => {
      await context
        .firestore()
        .doc(`houses/${HOUSE_ID}`)
        .set({
          id: HOUSE_ID,
          name: "Test House",
          stripeAccountId: "acct_original",
          stripeStatus: "pending",
          monthlyRent: 500,
          weeklyRent: 125,
          adminIds: [ADMIN_UID],
          ownerId: "originalOwner",
        });
    });
  }

  function houseRef(
    ctx: ReturnType<RulesTestEnvironment["authenticatedContext"]>,
  ) {
    return doc(ctx.firestore(), `houses/${HOUSE_ID}`);
  }

  describe("regular admin", () => {
    test("DENY a regular admin updating stripeAccountId", async () => {
      await seedHouse();
      const ctx = testEnv.authenticatedContext(
        ADMIN_UID,
        authHouseAdmin(ADMIN_UID, HOUSE_ID),
      );
      await assertFails(
        updateDoc(houseRef(ctx), { stripeAccountId: "acct_hijacked" }),
      );
    });

    test("DENY a regular admin updating monthlyRent/weeklyRent", async () => {
      await seedHouse();
      const ctx = testEnv.authenticatedContext(
        ADMIN_UID,
        authHouseAdmin(ADMIN_UID, HOUSE_ID),
      );
      await assertFails(
        updateDoc(houseRef(ctx), { monthlyRent: 999, weeklyRent: 250 }),
      );
    });

    test("DENY a regular admin updating adminIds", async () => {
      await seedHouse();
      const ctx = testEnv.authenticatedContext(
        ADMIN_UID,
        authHouseAdmin(ADMIN_UID, HOUSE_ID),
      );
      await assertFails(
        updateDoc(houseRef(ctx), { adminIds: [ADMIN_UID, OTHER_UID] }),
      );
    });

    test("DENY a regular admin updating ownerId", async () => {
      await seedHouse();
      const ctx = testEnv.authenticatedContext(
        ADMIN_UID,
        authHouseAdmin(ADMIN_UID, HOUSE_ID),
      );
      await assertFails(updateDoc(houseRef(ctx), { ownerId: OTHER_UID }));
    });

    test("ALLOW a regular admin updating a non-sensitive field (house:partial-edit)", async () => {
      await seedHouse();
      const ctx = testEnv.authenticatedContext(
        ADMIN_UID,
        authHouseAdmin(ADMIN_UID, HOUSE_ID),
      );
      await assertSucceeds(updateDoc(houseRef(ctx), { name: "Renamed House" }));
    });
  });

  describe("superAdmin", () => {
    test("ALLOW a superAdmin updating stripeAccountId", async () => {
      await seedHouse();
      const ctx = testEnv.authenticatedContext(
        ADMIN_UID,
        authHouseSuperAdmin(ADMIN_UID, HOUSE_ID),
      );
      await assertSucceeds(
        updateDoc(houseRef(ctx), { stripeAccountId: "acct_new" }),
      );
    });

    test("ALLOW a superAdmin updating monthlyRent/weeklyRent/adminIds/ownerId", async () => {
      await seedHouse();
      const ctx = testEnv.authenticatedContext(
        ADMIN_UID,
        authHouseSuperAdmin(ADMIN_UID, HOUSE_ID),
      );
      await assertSucceeds(
        updateDoc(houseRef(ctx), {
          monthlyRent: 999,
          weeklyRent: 250,
          adminIds: [ADMIN_UID, OTHER_UID],
          ownerId: OTHER_UID,
        }),
      );
    });

    test("ALLOW a superAdmin updating a non-sensitive field", async () => {
      await seedHouse();
      const ctx = testEnv.authenticatedContext(
        ADMIN_UID,
        authHouseSuperAdmin(ADMIN_UID, HOUSE_ID),
      );
      await assertSucceeds(updateDoc(houseRef(ctx), { name: "Renamed House" }));
    });
  });

  describe("guest (unchanged behavior)", () => {
    test("DENY a guest updating stripeAccountId", async () => {
      await seedHouse();
      const ctx = testEnv.authenticatedContext(
        GUEST_UID,
        authHouseGuest(GUEST_UID, HOUSE_ID),
      );
      await assertFails(
        updateDoc(houseRef(ctx), { stripeAccountId: "acct_hijacked" }),
      );
    });

    test("ALLOW a guest updating a non-sensitive field", async () => {
      await seedHouse();
      const ctx = testEnv.authenticatedContext(
        GUEST_UID,
        authHouseGuest(GUEST_UID, HOUSE_ID),
      );
      await assertSucceeds(updateDoc(houseRef(ctx), { name: "Renamed House" }));
    });
  });
});

// ---------------------------------------------------------------------------
// Demo account house-scoping (isDemoHouse gate)
//
// InitialLandingForm.tsx wires a "Use the demo" button to hardcoded credentials
// for demo_user@appdemo.net — reachable via raw Firestore/Auth REST calls,
// bypassing the app UI entirely. isDemoScopedHouses() restricts this specific
// account's house-role claims (however they were granted) to only houses
// explicitly flagged isDemoHouse: true, regardless of what custom claims the
// account happens to hold. Non-demo accounts must be completely unaffected.
// ---------------------------------------------------------------------------
describe("Demo account house-scoping (isDemoHouse gate)", () => {
  const DEMO_EMAIL = "demo_user@appdemo.net";
  const DEMO_UID = "demoAccountUid";
  const DEMO_HOUSE_ID = "demoHouse123"; // will be seeded with isDemoHouse: true
  const NON_DEMO_HOUSE_ID = HOUSE_ID; // reused; seeded per-test with isDemoHouse: false or absent

  function authDemoAdmin(houseId: string) {
    return { ...authHouseAdmin(DEMO_UID, houseId), email: DEMO_EMAIL };
  }

  function authDemoGuest(houseId: string) {
    return { ...authHouseGuest(DEMO_UID, houseId), email: DEMO_EMAIL };
  }

  async function seedHouseWithFlag(
    houseId: string,
    isDemoHouse: boolean | undefined,
  ) {
    await testEnv.withSecurityRulesDisabled(async (context) => {
      const data: Record<string, unknown> = { id: houseId, name: "Test House" };
      if (isDemoHouse !== undefined) {
        data.isDemoHouse = isDemoHouse;
      }
      await context.firestore().doc(`houses/${houseId}`).set(data);
    });
  }

  // -------------------------------------------------------------------------
  // houses/{houseId}
  // -------------------------------------------------------------------------
  describe("houses/{houseId}", () => {
    function houseRef(
      ctx: ReturnType<RulesTestEnvironment["authenticatedContext"]>,
      houseId: string,
    ) {
      return doc(ctx.firestore(), `houses/${houseId}`);
    }

    test("ALLOW demo account (admin claim) to read a house flagged isDemoHouse: true", async () => {
      await seedHouseWithFlag(DEMO_HOUSE_ID, true);
      const ctx = testEnv.authenticatedContext(
        DEMO_UID,
        authDemoAdmin(DEMO_HOUSE_ID),
      );
      await assertSucceeds(getDoc(houseRef(ctx, DEMO_HOUSE_ID)));
    });

    test("ALLOW demo account (admin claim) to update a house flagged isDemoHouse: true", async () => {
      await seedHouseWithFlag(DEMO_HOUSE_ID, true);
      const ctx = testEnv.authenticatedContext(
        DEMO_UID,
        authDemoAdmin(DEMO_HOUSE_ID),
      );
      await assertSucceeds(
        updateDoc(houseRef(ctx, DEMO_HOUSE_ID), { name: "Updated Name" }),
      );
    });

    test("DENY demo account (admin claim) reading a house flagged isDemoHouse: false, despite holding an admin claim for it", async () => {
      await seedHouseWithFlag(NON_DEMO_HOUSE_ID, false);
      const ctx = testEnv.authenticatedContext(
        DEMO_UID,
        authDemoAdmin(NON_DEMO_HOUSE_ID),
      );
      await assertFails(getDoc(houseRef(ctx, NON_DEMO_HOUSE_ID)));
    });

    test("DENY demo account (admin claim) reading a house whose isDemoHouse field is absent", async () => {
      await seedHouseWithFlag(NON_DEMO_HOUSE_ID, undefined);
      const ctx = testEnv.authenticatedContext(
        DEMO_UID,
        authDemoAdmin(NON_DEMO_HOUSE_ID),
      );
      await assertFails(getDoc(houseRef(ctx, NON_DEMO_HOUSE_ID)));
    });

    test("DENY demo account (admin claim) updating a house flagged isDemoHouse: false", async () => {
      await seedHouseWithFlag(NON_DEMO_HOUSE_ID, false);
      const ctx = testEnv.authenticatedContext(
        DEMO_UID,
        authDemoAdmin(NON_DEMO_HOUSE_ID),
      );
      await assertFails(
        updateDoc(houseRef(ctx, NON_DEMO_HOUSE_ID), { name: "Updated Name" }),
      );
    });

    test("ALLOW a non-demo admin to read a house flagged isDemoHouse: true (unaffected by the gate)", async () => {
      await seedHouseWithFlag(DEMO_HOUSE_ID, true);
      const ctx = testEnv.authenticatedContext(
        ADMIN_UID,
        authHouseAdmin(ADMIN_UID, DEMO_HOUSE_ID),
      );
      await assertSucceeds(getDoc(houseRef(ctx, DEMO_HOUSE_ID)));
    });

    test("ALLOW a non-demo admin to read/update a house flagged isDemoHouse: false (unaffected by the gate)", async () => {
      await seedHouseWithFlag(NON_DEMO_HOUSE_ID, false);
      const ctx = testEnv.authenticatedContext(
        ADMIN_UID,
        authHouseAdmin(ADMIN_UID, NON_DEMO_HOUSE_ID),
      );
      await assertSucceeds(getDoc(houseRef(ctx, NON_DEMO_HOUSE_ID)));
      await assertSucceeds(
        updateDoc(houseRef(ctx, NON_DEMO_HOUSE_ID), { name: "Updated Name" }),
      );
    });

    test("DENY a non-demo admin of a DIFFERENT house reading a house flagged isDemoHouse: true (unaffected by the gate — ordinary house-role scoping still applies)", async () => {
      await seedHouseWithFlag(DEMO_HOUSE_ID, true);
      const ctx = testEnv.authenticatedContext(
        ADMIN_UID,
        authHouseAdmin(ADMIN_UID, HOUSE_ID_OTHER),
      );
      await assertFails(getDoc(houseRef(ctx, DEMO_HOUSE_ID)));
    });
  });

  // -------------------------------------------------------------------------
  // guests/{guestId}
  // -------------------------------------------------------------------------
  describe("guests/{guestId}", () => {
    const DEMO_GUEST_DOC_ID = "demoGuestDoc";

    async function seedGuest(guestDocId: string, houseId: string) {
      await testEnv.withSecurityRulesDisabled(async (context) => {
        await context.firestore().doc(`guests/${guestDocId}`).set({
          userId: "someGuestAuthUid",
          houseId,
        });
      });
    }

    function guestRef(
      ctx: ReturnType<RulesTestEnvironment["authenticatedContext"]>,
      guestDocId: string,
    ) {
      return doc(ctx.firestore(), `guests/${guestDocId}`);
    }

    test("ALLOW demo account (admin claim) to read a guest under a house flagged isDemoHouse: true", async () => {
      await seedHouseWithFlag(DEMO_HOUSE_ID, true);
      await seedGuest(DEMO_GUEST_DOC_ID, DEMO_HOUSE_ID);
      const ctx = testEnv.authenticatedContext(
        DEMO_UID,
        authDemoAdmin(DEMO_HOUSE_ID),
      );
      await assertSucceeds(getDoc(guestRef(ctx, DEMO_GUEST_DOC_ID)));
    });

    test("ALLOW demo account (admin claim) to create a guest under a house flagged isDemoHouse: true", async () => {
      await seedHouseWithFlag(DEMO_HOUSE_ID, true);
      const ctx = testEnv.authenticatedContext(
        DEMO_UID,
        authDemoAdmin(DEMO_HOUSE_ID),
      );
      await assertSucceeds(
        setDoc(guestRef(ctx, "newDemoGuest"), {
          userId: "newGuestAuthUid",
          houseId: DEMO_HOUSE_ID,
        }),
      );
    });

    test("DENY demo account (admin claim) reading a guest under a house flagged isDemoHouse: false, despite holding an admin claim for it", async () => {
      await seedHouseWithFlag(NON_DEMO_HOUSE_ID, false);
      await seedGuest(DEMO_GUEST_DOC_ID, NON_DEMO_HOUSE_ID);
      const ctx = testEnv.authenticatedContext(
        DEMO_UID,
        authDemoAdmin(NON_DEMO_HOUSE_ID),
      );
      await assertFails(getDoc(guestRef(ctx, DEMO_GUEST_DOC_ID)));
    });

    test("DENY demo account (admin claim) creating a guest under a house flagged isDemoHouse: false", async () => {
      await seedHouseWithFlag(NON_DEMO_HOUSE_ID, false);
      const ctx = testEnv.authenticatedContext(
        DEMO_UID,
        authDemoAdmin(NON_DEMO_HOUSE_ID),
      );
      await assertFails(
        setDoc(guestRef(ctx, "newDemoGuest"), {
          userId: "newGuestAuthUid",
          houseId: NON_DEMO_HOUSE_ID,
        }),
      );
    });

    test("ALLOW a non-demo admin to read a guest under a house flagged isDemoHouse: true (unaffected by the gate)", async () => {
      await seedHouseWithFlag(DEMO_HOUSE_ID, true);
      await seedGuest(DEMO_GUEST_DOC_ID, DEMO_HOUSE_ID);
      const ctx = testEnv.authenticatedContext(
        ADMIN_UID,
        authHouseAdmin(ADMIN_UID, DEMO_HOUSE_ID),
      );
      await assertSucceeds(getDoc(guestRef(ctx, DEMO_GUEST_DOC_ID)));
    });

    test("ALLOW a non-demo admin to read a guest under a house flagged isDemoHouse: false (unaffected by the gate)", async () => {
      await seedHouseWithFlag(NON_DEMO_HOUSE_ID, false);
      await seedGuest(DEMO_GUEST_DOC_ID, NON_DEMO_HOUSE_ID);
      const ctx = testEnv.authenticatedContext(
        ADMIN_UID,
        authHouseAdmin(ADMIN_UID, NON_DEMO_HOUSE_ID),
      );
      await assertSucceeds(getDoc(guestRef(ctx, DEMO_GUEST_DOC_ID)));
    });
  });

  // -------------------------------------------------------------------------
  // houses/{houseId}/chat/{chatId}
  // -------------------------------------------------------------------------
  describe("houses/{houseId}/chat/{chatId}", () => {
    const CHAT_ID = "chatMsg1";

    function chatRef(
      ctx: ReturnType<RulesTestEnvironment["authenticatedContext"]>,
      houseId: string,
    ) {
      return doc(ctx.firestore(), `houses/${houseId}/chat/${CHAT_ID}`);
    }

    test("ALLOW demo account (guest claim) to read and write chat under a house flagged isDemoHouse: true", async () => {
      await seedHouseWithFlag(DEMO_HOUSE_ID, true);
      const ctx = testEnv.authenticatedContext(
        DEMO_UID,
        authDemoGuest(DEMO_HOUSE_ID),
      );
      await assertSucceeds(
        setDoc(chatRef(ctx, DEMO_HOUSE_ID), { text: "hi", senderId: DEMO_UID }),
      );
      await assertSucceeds(getDoc(chatRef(ctx, DEMO_HOUSE_ID)));
    });

    test("DENY demo account (guest claim) reading and writing chat under a house flagged isDemoHouse: false, despite holding a guest claim for it", async () => {
      await seedHouseWithFlag(NON_DEMO_HOUSE_ID, false);
      const ctx = testEnv.authenticatedContext(
        DEMO_UID,
        authDemoGuest(NON_DEMO_HOUSE_ID),
      );
      await assertFails(
        setDoc(chatRef(ctx, NON_DEMO_HOUSE_ID), {
          text: "hi",
          senderId: DEMO_UID,
        }),
      );
      await assertFails(getDoc(chatRef(ctx, NON_DEMO_HOUSE_ID)));
    });

    test("ALLOW a non-demo guest to read and write chat under a house flagged isDemoHouse: true (unaffected by the gate)", async () => {
      await seedHouseWithFlag(DEMO_HOUSE_ID, true);
      const ctx = testEnv.authenticatedContext(
        GUEST_UID,
        authHouseGuest(GUEST_UID, DEMO_HOUSE_ID),
      );
      await assertSucceeds(
        setDoc(chatRef(ctx, DEMO_HOUSE_ID), {
          text: "hi",
          senderId: GUEST_UID,
        }),
      );
    });

    test("ALLOW a non-demo guest to read and write chat under a house flagged isDemoHouse: false (unaffected by the gate)", async () => {
      await seedHouseWithFlag(NON_DEMO_HOUSE_ID, false);
      const ctx = testEnv.authenticatedContext(
        GUEST_UID,
        authHouseGuest(GUEST_UID, NON_DEMO_HOUSE_ID),
      );
      await assertSucceeds(
        setDoc(chatRef(ctx, NON_DEMO_HOUSE_ID), {
          text: "hi",
          senderId: GUEST_UID,
        }),
      );
    });
  });
});

// ---------------------------------------------------------------------------
// users/{userId} — subscriptionMetadata is server-owned
//
// The entitlement gate and the house-create trigger both derive access from
// user.subscriptionMetadata.status. While a client could write it, an operator
// could grant themselves access by editing their own user document, and the
// server-side stamp was forgeable. The Admin SDK bypasses rules, so legitimate
// server writes are unaffected.
// ---------------------------------------------------------------------------

describe("users/{userId} — subscriptionMetadata is server-owned", () => {
  const SELF_UID = "selfUser";

  const seedUser = async (metadata: Record<string, unknown>) => {
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), `users/${SELF_UID}`), {
        uid: SELF_UID,
        email: "self@example.com",
        avatar: "https://example.com/old.png",
        subscriptionMetadata: metadata,
      });
    });
  };

  const selfDoc = () =>
    doc(
      testEnv.authenticatedContext(SELF_UID, authUserOnly(SELF_UID)).firestore(),
      `users/${SELF_UID}`,
    );

  it("denies a client raising its own subscription status to active", async () => {
    // The privilege escalation this rule exists to stop.
    await seedUser({ status: "canceled" });
    await assertFails(
      updateDoc(selfDoc(), { "subscriptionMetadata.status": "active" }),
    );
  });

  it("denies a client replacing the whole subscriptionMetadata object", async () => {
    await seedUser({ status: "canceled" });
    await assertFails(
      updateDoc(selfDoc(), { subscriptionMetadata: { status: "active" } }),
    );
  });

  it("still allows a client to update its other own fields", async () => {
    // The avatar path must keep working — it is the reason the old rule was a
    // blanket allow.
    await seedUser({ status: "active" });
    await assertSucceeds(
      updateDoc(selfDoc(), { avatar: "https://example.com/new.png" }),
    );
  });

  it("allows a full-object update that leaves subscriptionMetadata unchanged", async () => {
    // diff().affectedKeys() only reports keys whose value actually changed, so
    // echoing the same metadata back is permitted.
    await seedUser({ status: "active" });
    await assertSucceeds(
      updateDoc(selfDoc(), {
        avatar: "https://example.com/new.png",
        subscriptionMetadata: { status: "active" },
      }),
    );
  });

  it("allows creating its own user doc with an empty subscription status", async () => {
    // createUser() writes the whole entity, whose default status is "".
    await assertSucceeds(
      setDoc(selfDoc(), {
        uid: SELF_UID,
        email: "self@example.com",
        subscriptionMetadata: { status: "" },
      }),
    );
  });

  it("denies creating its own user doc already marked active", async () => {
    await assertFails(
      setDoc(selfDoc(), {
        uid: SELF_UID,
        email: "self@example.com",
        subscriptionMetadata: { status: "active" },
      }),
    );
  });

  it("still denies access to another user's document", async () => {
    await seedUser({ status: "active" });
    const otherCtx = testEnv.authenticatedContext(
      OTHER_UID,
      authUserOnly(OTHER_UID),
    );
    await assertFails(
      getDoc(doc(otherCtx.firestore(), `users/${SELF_UID}`)),
    );
    await assertFails(
      updateDoc(doc(otherCtx.firestore(), `users/${SELF_UID}`), {
        avatar: "x",
      }),
    );
  });
});
