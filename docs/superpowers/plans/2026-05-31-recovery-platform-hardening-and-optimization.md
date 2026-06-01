# Recovery Platform — Hardening & Optimization Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:subagent-driven-development` (recommended) or `superpowers:executing-plans` to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Close 8 critical security vulnerabilities, fix financial data integrity bugs, optimize Firebase Cloud Functions, gate the homegroups V4.4 launch, migrate RATS to sustainable pricing tiers, and establish Maestro E2E testing across both React Native apps.

**Architecture:** Six independent tracks — each track is self-contained and can be executed in parallel by separate agents. Track A (security) is the hard gate: regroup must not ship publicly until Tasks 1–5 are complete. Tracks B–F have no blocking dependencies on each other but should follow Track A.

**Tech Stack:** Firebase Cloud Functions v2 (TypeScript), Firestore security rules, ~~Hono.js~~ Firebase Functions v2 (recovery-api — see amendment below), React Native 0.72 (homegroups/regroup), Next.js 15 (detox-recovery), Stripe Node.js SDK, Zod validation, Maestro E2E CLI.

---

> **Amendment — 2026-06-01:** `recovery-api` was migrated from Hono.js on Cloud Run to Firebase Functions v2 callables (commit `c571946`). The following plan updates apply:
>
> - **Task 5 (C5 `fromApp` hardcode) — ALREADY RESOLVED.** The migration replaced the hardcoded `fromApp: "detox-recovery"` with `fromApp: context.appId`, derived from the authenticated `ServiceAuthContext`. File: `recovery-api/src/callable/referrals.ts:31`. No further action needed.
> - **Architecture:** `src/routes/` no longer exists. Routes are now `src/callable/` (callable functions) and `src/http/` (HTTP functions). Auth uses `requireServiceAuth` with `X-Service-Key` + `X-App-Id` headers, not Firebase JWT Bearer tokens for service-to-service calls.
> - **Track A gate:** Tasks 1–4 remain required. Task 5 is complete. Track A is satisfied by Tasks 1–4 + 3 (Firestore rules).

**Agents & skills referenced:**

- Security: `homegroups/.claude/agents/security/stripe-reviewer.md`, `firebase:firebase-security-rules-auditor`, `ecc:security-scan`
- Firebase: `firebase:firebase-firestore`, `homegroups/.claude/skills/test-rules/SKILL.md`
- Pricing: `regroup/.claude/agents/revenue-architect.md`, `stripe:stripe-best-practices`
- E2E: `ecc:e2e-testing`
- Dependencies: `ecc:refactor-clean`

---

## Track A — Critical Security (gate: complete before any public regroup launch)

### Task 1: Fix `deleteAdminAuthorization`, `promoteGuestsToAdmin`, `removePrivilegesForGuests` — privilege escalation (C1–C3)

**Why:** Any Firebase-authenticated user (including regular residents) can currently strip or grant admin claims across the entire platform. `assertCanGrantClaimForHouses` is already imported and used correctly in `addGuestAuthorization` and `addAdminAuthorization` in the same file — it just needs to be added to the three unprotected callables.

**Files:**

- Modify: `regroup/functions/src/callable/auth.ts`
- Test: `regroup/functions/src/__tests__/callable/auth.test.ts` (create if absent)

**Skill to use:** Run `ecc:security-scan` after completing this task to verify no other unguarded callables exist.

- [ ] **Step 1: Add guard to `deleteAdminAuthorization`**

  In `regroup/functions/src/callable/auth.ts`, locate `deleteAdminAuthorization`. After the `const { admin, adminHouseIds, superAdminHouseIds } = data;` destructure and before the first `if (adminHouseIds?.length)` block, insert:

  ```typescript
  const allHouseIds = [...(adminHouseIds ?? []), ...(superAdminHouseIds ?? [])];
  if (allHouseIds.length === 0) {
    throw new HttpsError(
      "invalid-argument",
      "deleteAdminAuthorization requires at least one houseId",
    );
  }
  await assertCanGrantClaimForHouses({
    callerUid: request.auth.uid,
    callerToken: request.auth.token,
    targetUid: admin.userId,
    houseIds: allHouseIds,
    callableName: "deleteAdminAuthorization",
  });
  ```

- [ ] **Step 2: Add guard to `promoteGuestsToAdmin`**

  In the same file, locate `promoteGuestsToAdmin`. After the `parseInput` line and before `getGuestsAsUsers(data)`, insert:

  ```typescript
  const houseIds = [...new Set(data.map((g) => g.houseId))];
  if (houseIds.length === 0) return "success";
  await assertCanGrantClaimForHouses({
    callerUid: request.auth.uid,
    callerToken: request.auth.token,
    targetUid: data[0].userId,
    houseIds,
    callableName: "promoteGuestsToAdmin",
  });
  ```

- [ ] **Step 3: Add guard to `removePrivilegesForGuests`**

  In the same file, locate `removePrivilegesForGuests`. After `parseInput` and before `getGuestsAsUsers(data.guests)`, insert:

  ```typescript
  const houseIds = [...new Set(data.guests.map((g) => g.houseId))];
  if (houseIds.length === 0) return "success";
  await assertCanGrantClaimForHouses({
    callerUid: request.auth.uid,
    callerToken: request.auth.token,
    targetUid: data.guests[0].userId,
    houseIds,
    callableName: "removePrivilegesForGuests",
  });
  ```

- [ ] **Step 4: Write failing tests** (create `regroup/functions/src/__tests__/callable/auth.test.ts` if absent)

  ```typescript
  import {
    deleteAdminAuthorization,
    promoteGuestsToAdmin,
    removePrivilegesForGuests,
  } from "../../callable/auth";

  const makeRequest = (uid: string, data: unknown) => ({
    auth: { uid, token: {} },
    data,
  });

  describe("deleteAdminAuthorization — authorization guard", () => {
    it("throws permission-denied when caller is not admin of target houses", async () => {
      await expect(
        (deleteAdminAuthorization as any).run(
          makeRequest("non-admin-uid", {
            admin: { userId: "victim-uid" },
            adminHouseIds: ["house-123"],
            superAdminHouseIds: [],
          }),
        ),
      ).rejects.toMatchObject({ code: "permission-denied" });
    });
  });

  describe("promoteGuestsToAdmin — authorization guard", () => {
    it("throws permission-denied when caller has no admin claim for the house", async () => {
      await expect(
        (promoteGuestsToAdmin as any).run(
          makeRequest("non-admin-uid", [
            { userId: "target-uid", houseId: "house-123" },
          ]),
        ),
      ).rejects.toMatchObject({ code: "permission-denied" });
    });
  });

  describe("removePrivilegesForGuests — authorization guard", () => {
    it("throws permission-denied when caller is not admin of the house", async () => {
      await expect(
        (removePrivilegesForGuests as any).run(
          makeRequest("non-admin-uid", {
            guests: [{ userId: "target-uid", houseId: "house-123" }],
            role: "admin",
          }),
        ),
      ).rejects.toMatchObject({ code: "permission-denied" });
    });
  });
  ```

- [ ] **Step 5: Run tests — expect FAIL before fix, PASS after**

  ```bash
  cd regroup/functions
  npm test -- --testPathPattern="callable/auth" --verbose
  ```

  Expected after fix: all `permission-denied` assertions pass.

- [ ] **Step 6: Commit**

  ```bash
  git add regroup/functions/src/callable/auth.ts regroup/functions/src/__tests__/callable/auth.test.ts
  git commit -m "fix(regroup): add assertCanGrantClaimForHouses guard to 3 unprotected auth callables (C1-C3)"
  ```

---

### Task 2: Fix `givePotentialSuperAdminPrivilege` — self-grant privilege escalation (C4)

**Why:** Any authenticated user can call this and set `potentialSuperAdmin: true` on their own JWT claims. The fix: gate it so it can only be called when the caller has zero existing house admin claims (i.e., a brand-new operator setting up their first house).

**Files:**

- Modify: `regroup/functions/src/callable/auth.ts`

- [ ] **Step 1: Replace the callable body**

  Find `givePotentialSuperAdminPrivilege` and replace the entire function body with:

  ```typescript
  export const givePotentialSuperAdminPrivilege = onCall(async (request) => {
    if (!request.auth)
      throw new HttpsError("unauthenticated", "Login required");

    const token = request.auth.token as Record<string, unknown>;
    const hasExistingAdmin =
      token.admin && Object.keys(token.admin as object).length > 0;
    const hasExistingSuperAdmin =
      token.superAdmin && Object.keys(token.superAdmin as object).length > 0;

    if (hasExistingAdmin || hasExistingSuperAdmin) {
      throw new HttpsError(
        "permission-denied",
        "givePotentialSuperAdminPrivilege is only available to users with no existing house claims",
      );
    }

    const user = await auth().getUser(request.auth.uid);
    const current = (user.customClaims ?? {}) as Record<string, unknown>;
    return auth().setCustomUserClaims(request.auth.uid, {
      ...current,
      potentialSuperAdmin: true,
    });
  });
  ```

- [ ] **Step 2: Add test**

  In `regroup/functions/src/__tests__/callable/auth.test.ts`, add:

  ```typescript
  describe("givePotentialSuperAdminPrivilege — blocks existing admins", () => {
    it("throws permission-denied when caller already has admin claims for a house", async () => {
      await expect(
        (givePotentialSuperAdminPrivilege as any).run({
          auth: {
            uid: "existing-admin-uid",
            token: { admin: { "house-abc": true } },
          },
          data: {},
        }),
      ).rejects.toMatchObject({ code: "permission-denied" });
    });

    it("allows a brand-new user with zero house claims", async () => {
      // auth().getUser mocked to return empty customClaims
      await expect(
        (givePotentialSuperAdminPrivilege as any).run({
          auth: { uid: "new-user-uid", token: {} },
          data: {},
        }),
      ).resolves.not.toThrow();
    });
  });
  ```

- [ ] **Step 3: Run tests**

  ```bash
  cd regroup/functions
  npm test -- --testPathPattern="callable/auth" --verbose
  ```

  Expected: PASS.

- [ ] **Step 4: Commit**

  ```bash
  git add regroup/functions/src/callable/auth.ts
  git commit -m "fix(regroup): block self-grant of potentialSuperAdmin for users with existing house claims (C4)"
  ```

---

### Task 3: Fix Firestore rules — `admins` and `houses` world-readable (C7, C8)

**Why:** Every signed-in Firebase user can read all house documents (including `stripeAccountId`, rent amounts, admin UIDs) and all admin documents (which UIDs administer which houses). For a recovery population this is a direct safety risk — admin identity must not be exposed to non-members.

**Files:**

- Modify: `regroup/mobile/firebase/firestore.rules`

**Skill to use:** `homegroups/.claude/skills/test-rules/SKILL.md` and `firebase:firebase-security-rules-auditor` — run Firestore rules tests before and after.

- [ ] **Step 1: Fix the `admins` collection rule (line 95)**

  Find this block:

  ```
  match /admins/{adminId} {
    allow read: if signedIn(); // need to adjust house search to not query admins...
  ```

  Change the `allow read` line to:

  ```
  match /admins/{adminId} {
    allow read: if isAdmin(resource.data.houseIds) || isSameUser(adminId);
  ```

- [ ] **Step 2: Fix the `houses` collection rule (line 152)**

  Find:

  ```
  match /houses/{houseId} {
    allow read: if signedIn();
  ```

  Change to:

  ```
  match /houses/{houseId} {
    allow read: if isGuestOrAdmin([houseId]);
  ```

- [ ] **Step 3: Start the Firebase emulator and verify rules parse**

  ```bash
  cd regroup
  firebase emulators:start --only firestore
  ```

  Expected: no `Error in security rules` lines in the output.

- [ ] **Step 4: Verify expected access patterns**

  Using the Emulator UI (http://localhost:4000/firestore) or `@firebase/rules-unit-testing`, confirm:

  | Caller                | Resource                | Expected |
  | --------------------- | ----------------------- | -------- |
  | Unauthenticated       | `/houses/house-abc`     | DENY     |
  | Signed-in non-member  | `/houses/house-abc`     | DENY     |
  | Guest of `house-abc`  | `/houses/house-abc`     | ALLOW    |
  | Admin of `house-abc`  | `/houses/house-abc`     | ALLOW    |
  | Signed-in non-member  | `/admins/admin-doc-id`  | DENY     |
  | `isSameUser(adminId)` | `/admins/their-own-doc` | ALLOW    |

- [ ] **Step 5: Commit**

  ```bash
  git add regroup/mobile/firebase/firestore.rules
  git commit -m "fix(regroup): scope houses and admins Firestore reads to house members only (C7, C8)"
  ```

---

### Task 4: Rotate and remove the Google Maps API key (C6)

**Why:** `const API_KEY = "AIzaSyCKXu_eJrW6QBamTNPyCOQy_lVO2xhwl9Q"` is a string literal at `homegroups/functions/src/api/api.ts:9`. API keys in git history are considered compromised regardless of current source state.

**Files:**

- Modify: `homegroups/functions/src/api/api.ts`

**Agent to use:** `ecc:security-scan` to verify no other hardcoded keys remain after the fix.

- [ ] **Step 1: Rotate the key immediately**

  In [Google Cloud Console → APIs & Services → Credentials](https://console.cloud.google.com/apis/credentials):
  1. Find the key ending in `...l9Q`
  2. Click "Regenerate key" (or delete and create new)
  3. Restrict the new key: Application restrictions → IP addresses (Cloud Functions IPs); API restrictions → Timezone API + Geocoding API only
  4. Copy the new key value

- [ ] **Step 2: Store the new key in Firebase Secret Manager**

  ```bash
  cd homegroups
  firebase functions:secrets:set GOOGLE_MAPS_API_KEY
  # Paste the new key value when prompted
  ```

- [ ] **Step 3: Update `homegroups/functions/src/api/api.ts` line 9**

  Replace:

  ```typescript
  const API_KEY = "AIzaSyCKXu_eJrW6QBamTNPyCOQy_lVO2xhwl9Q";
  ```

  With:

  ```typescript
  const API_KEY = process.env.GOOGLE_MAPS_API_KEY;
  if (!API_KEY) {
    throw new Error("GOOGLE_MAPS_API_KEY environment variable is not set");
  }
  ```

- [ ] **Step 4: Declare the secret on the function(s) that use `getAreaMeetings` or related exports**

  Find which exported Cloud Function calls into `api.ts`:

  ```bash
  grep -rn "getAreaMeetings\|getTimezone\|reverseGeocode" homegroups/functions/src/ --include="*.ts"
  ```

  For each function that uses the API key, add `secrets: ["GOOGLE_MAPS_API_KEY"]` to its options object.

- [ ] **Step 5: Build and type-check**

  ```bash
  cd homegroups/functions
  npm run build
  ```

  Expected: no errors.

- [ ] **Step 6: Run `ecc:security-scan` on `homegroups/functions/src/` to verify no remaining hardcoded keys**

- [ ] **Step 7: Commit**

  ```bash
  git add homegroups/functions/src/api/api.ts homegroups/functions/src/index.ts
  git commit -m "fix(homegroups): remove hardcoded Google Maps API key, provision via Secret Manager (C6)"
  ```

---

### Task 5: Fix `fromApp` hardcoded as `"detox-recovery"` in recovery-api (C5)

**Why:** `recovery-api/src/routes/referrals.ts:26` hardcodes `fromApp: "detox-recovery"` for every caller. Referrals created by homegroups or regroup are stored with the wrong app identity, corrupting all cross-product analytics and routing.

**Files:**

- Modify: `recovery-api/src/routes/referrals.ts`
- Test: `recovery-api/src/routes/referrals.test.ts` (create if absent)

- [ ] **Step 1: Add `SOURCE_APPS` enum and extend `CreateReferralSchema`**

  In `recovery-api/src/routes/referrals.ts`, after the existing `TARGET_APPS` const (line 7–11), add:

  ```typescript
  const SOURCE_APPS = [
    "detox-recovery",
    "homegroups",
    "phoenix-cleanhouse",
  ] as const;
  ```

  Then in `CreateReferralSchema` (currently lines 13–19), add `fromApp` as a required field:

  ```typescript
  const CreateReferralSchema = z.object({
    toApp: z.enum(TARGET_APPS),
    fromApp: z.enum(SOURCE_APPS), // add this line
    clientName: z.string().min(1).max(100),
    clientEmail: z.string().email(),
    condition: z.string().max(200).optional(),
    notes: z.string().max(500).optional(),
  });
  ```

- [ ] **Step 2: Remove the hardcoded `fromApp` from the POST handler**

  Delete line 26:

  ```typescript
  fromApp: "detox-recovery",   // DELETE THIS LINE
  ```

  The `...body` spread on the next line already includes `fromApp` from the validated request. The resulting `db.collection("referrals").add(...)` block should read:

  ```typescript
  const ref = await db.collection("referrals").add({
    referredBy: uid,
    status: "pending",
    createdAt: new Date(),
    ...body, // body now includes fromApp from the validated schema
  });
  ```

- [ ] **Step 3: Write tests**

  Create `recovery-api/src/routes/referrals.test.ts`:

  ```typescript
  describe("POST /api/referrals — fromApp validation", () => {
    it("rejects requests missing fromApp with 400", async () => {
      const res = await app.request("/api/referrals", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: "Bearer test-token",
        },
        body: JSON.stringify({
          toApp: "homegroups",
          clientName: "Test User",
          clientEmail: "test@example.com",
        }),
      });
      expect(res.status).toBe(400);
    });

    it("rejects invalid fromApp value with 400", async () => {
      const res = await app.request("/api/referrals", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: "Bearer test-token",
        },
        body: JSON.stringify({
          toApp: "homegroups",
          fromApp: "unknown-app",
          clientName: "Test User",
          clientEmail: "test@example.com",
        }),
      });
      expect(res.status).toBe(400);
    });

    it("accepts a valid fromApp and stores it in Firestore", async () => {
      const res = await app.request("/api/referrals", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: "Bearer test-token",
        },
        body: JSON.stringify({
          toApp: "homegroups",
          fromApp: "phoenix-cleanhouse",
          clientName: "Test User",
          clientEmail: "test@example.com",
        }),
      });
      expect(res.status).toBe(201);
      // assert the stored doc has fromApp: "phoenix-cleanhouse"
    });
  });
  ```

- [ ] **Step 4: Run tests**

  ```bash
  cd recovery-api
  npm test -- --testPathPattern="referrals" --verbose
  ```

  Expected: PASS.

- [ ] **Step 5: Update all callers in the monorepo**

  ```bash
  grep -rn "api/referrals\|POST.*referrals" --include="*.ts" .
  ```

  For each caller, add `fromApp` to the request body with the correct app identifier (`"homegroups"`, `"phoenix-cleanhouse"`, or `"detox-recovery"`).

- [ ] **Step 6: Commit**

  ```bash
  git add recovery-api/src/routes/referrals.ts recovery-api/src/routes/referrals.test.ts
  git commit -m "fix(recovery-api): accept fromApp from request body instead of hardcoding detox-recovery (C5)"
  ```

---

## Track B — Financial Integrity (regroup — before Stripe payment processing goes live)

### Task 6: Fix balance race condition + migrate to integer cents (H2, H5)

**Why:** The Stripe webhook decrements guest balance with a non-atomic read-modify-write at `stripeWebhook.ts:326–336`. Stripe delivers webhooks at-least-once — concurrent retries double-decrement. Additionally, balance is stored as float dollars (IEEE 754 rounding accumulates errors on financial data). Both must be fixed together.

**Files:**

- Modify: `regroup/functions/src/webhooks/stripeWebhook.ts`
- Modify: `regroup/functions/src/scheduled/scheduledRentCollection.ts`
- Create: `regroup/functions/src/scripts/migrateBalanceToCents.ts`

**Agent to use:** `regroup/.claude/agents/revenue-architect.md` for payment flow context.

- [ ] **Step 1: Find all balance read/write sites**

  ```bash
  grep -n "rentOwed\|currentBalance\|amountDollars\|balanceCents" \
    regroup/functions/src/webhooks/stripeWebhook.ts \
    regroup/functions/src/scheduled/scheduledRentCollection.ts
  ```

  Note every line number that reads or writes a balance field.

- [ ] **Step 2: Replace non-atomic decrement with `FieldValue.increment`**

  In `stripeWebhook.ts`, find the balance decrement block (around lines 326–336):

  ```typescript
  // BEFORE (non-atomic, float arithmetic)
  const guestDoc = await guestRef.get();
  const currentBalance = guestDoc.data()?.rentOwed ?? 0;
  const amountDollars = paymentIntent.amount / 100;
  await guestRef.update({ rentOwed: currentBalance - amountDollars });
  ```

  Replace with:

  ```typescript
  // AFTER (atomic, integer cents — Stripe amounts are already in cents)
  const amountCents = paymentIntent.amount;
  await guestRef.update({
    rentOwedCents: admin.firestore.FieldValue.increment(-amountCents),
  });
  ```

- [ ] **Step 3: Fix `scheduledRentCollection.ts:65`**

  Find the rent charge write that uses `Math.round` or float dollars and replace:

  ```typescript
  // BEFORE
  rentOwed: currentRentOwed + rentAmountDollars,

  // AFTER
  rentOwedCents: admin.firestore.FieldValue.increment(rentAmountCents),
  ```

  Where `rentAmountCents` is sourced from `house.monthlyRentCents` (see Step 5 for the field migration).

- [ ] **Step 4: Update all `rentOwed` readers**

  ```bash
  grep -rn "rentOwed" regroup/functions/src/ regroup/mobile/src/ --include="*.ts" --include="*.tsx"
  ```

  For each: rename to `rentOwedCents`. Divide by 100 **only** at the display boundary in UI components — never in business logic.

- [ ] **Step 5: Create migration script**

  Create `regroup/functions/src/scripts/migrateBalanceToCents.ts`:

  ```typescript
  import * as admin from "firebase-admin";
  admin.initializeApp();
  const db = admin.firestore();

  async function migrate() {
    const guests = await db.collection("guests").get();
    let batch = db.batch();
    let count = 0;

    for (const doc of guests.docs) {
      const rentOwed: unknown = doc.data().rentOwed;
      if (typeof rentOwed === "number") {
        batch.update(doc.ref, {
          rentOwedCents: Math.round(rentOwed * 100),
          rentOwed: admin.firestore.FieldValue.delete(),
        });
        count++;
        if (count % 499 === 0) {
          await batch.commit();
          batch = db.batch();
          console.log(`Committed ${count} guest docs`);
        }
      }
    }
    await batch.commit();
    console.log(`Migration complete: ${count} docs updated`);
  }

  migrate().catch(console.error);
  ```

  Run this script against the **emulator** first, then production:

  ```bash
  # Against emulator
  FIRESTORE_EMULATOR_HOST=localhost:8080 npx ts-node src/scripts/migrateBalanceToCents.ts

  # Against production (after emulator validation)
  npx ts-node src/scripts/migrateBalanceToCents.ts
  ```

- [ ] **Step 6: Test the webhook handler**

  ```bash
  cd regroup/functions
  npm test -- --testPathPattern="stripeWebhook" --verbose
  ```

  Expected: existing tests pass; the `FieldValue.increment` path is covered.

- [ ] **Step 7: Commit**

  ```bash
  git add regroup/functions/src/webhooks/stripeWebhook.ts \
          regroup/functions/src/scheduled/scheduledRentCollection.ts \
          regroup/functions/src/scripts/migrateBalanceToCents.ts
  git commit -m "fix(regroup): atomic balance decrement via FieldValue.increment, migrate to integer cents (H2, H5)"
  ```

---

## Track C — Firebase Optimization

### Task 7: Move Stripe client to module scope in regroup webhook (L13)

**Why:** `new Stripe(...)` is called inside two handlers in `stripeWebhook.ts` (lines 950 and 1141), and three times in `stripeConnect.ts` (lines 44, 106, 121). Creating a Stripe client on every warm invocation wastes initialization time. The utility `createStripeClient()` already exists in `regroup/functions/src/util/stripe.ts`.

**Files:**

- Modify: `regroup/functions/src/webhooks/stripeWebhook.ts`
- Modify: `regroup/functions/src/http/stripeConnect.ts`

- [ ] **Step 1: Confirm `createStripeClient` export name**

  ```bash
  grep -n "export" regroup/functions/src/util/stripe.ts | head -10
  ```

  Note the exact export name.

- [ ] **Step 2: Add module-level singleton to `stripeWebhook.ts`**

  Near the top of the file, after the existing imports, add:

  ```typescript
  import { createStripeClient } from "../util/stripe";

  // Module-level singleton — reused across warm Cloud Function invocations
  const stripe = createStripeClient();
  ```

- [ ] **Step 3: Delete both per-request instantiations in `stripeWebhook.ts`**

  Remove these two blocks (lines 950–952 and 1141–1143):

  ```typescript
  const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
    apiVersion: "2026-01-28.clover" as any,
  });
  ```

- [ ] **Step 4: Apply the same fix to `stripeConnect.ts`**

  Add the module-level singleton import, remove all three `new Stripe(...)` instantiations.

- [ ] **Step 5: Run tests**

  ```bash
  cd regroup/functions
  npm test
  ```

  Expected: all tests pass.

- [ ] **Step 6: Commit**

  ```bash
  git add regroup/functions/src/webhooks/stripeWebhook.ts regroup/functions/src/http/stripeConnect.ts
  git commit -m "perf(regroup): move Stripe client to module scope for warm-invocation reuse (L13)"
  ```

---

### Task 8: Replace `new Date().toISOString()` with `FieldValue.serverTimestamp()` in regroup webhook (H17)

**Why:** 9 locations in `stripeWebhook.ts` use client-generated string timestamps instead of Firestore server timestamps. These have clock-skew risk, are stored as non-queryable strings, and diverge from the pattern already used correctly in the homegroups webhook.

**Files:**

- Modify: `regroup/functions/src/webhooks/stripeWebhook.ts`

- [ ] **Step 1: Find all 9 occurrences**

  ```bash
  grep -n "new Date().toISOString\|toISOString()" regroup/functions/src/webhooks/stripeWebhook.ts
  ```

  Expected: lines 579, 651, 652, 721, 722, 792, 793, 863, 929.

- [ ] **Step 2: Replace all occurrences**

  Use the Serena `replace_content` tool (regex replace across the file):
  - Pattern: `new Date\(\)\.toISOString\(\)`
  - Replacement: `admin.firestore.FieldValue.serverTimestamp()`

  Verify `import * as admin from "firebase-admin"` already exists in the file imports (it does — confirmed from `init.ts`).

- [ ] **Step 3: Fix any TypeScript type mismatches**

  ```bash
  cd regroup/functions
  npx tsc --noEmit
  ```

  If fields are typed as `string` but now receive `FieldValue`, update the type to `string | FirebaseFirestore.FieldValue`. In Zod schemas for these fields, wrap with `.or(z.custom<FirebaseFirestore.FieldValue>())` if needed.

- [ ] **Step 4: Run tests**

  ```bash
  npm test -- --testPathPattern="stripeWebhook"
  ```

- [ ] **Step 5: Commit**

  ```bash
  git add regroup/functions/src/webhooks/stripeWebhook.ts
  git commit -m "fix(regroup): replace new Date().toISOString() with FieldValue.serverTimestamp() in webhook (H17)"
  ```

---

### Task 9: Fix PII logging in regroup and homegroups functions (H4, H15)

**Why:** Full `User` and `Guest` objects (name, email, phone) are logged at `regroup/functions/src/callable/subscriptions.ts:289` and `auth.ts:54`. Free-text ban reasons (which may contain member names or health context) are logged at `homegroups/functions/src/callable/banUser.ts:132–137`. This violates the "never log PII" rule in the root CLAUDE.md.

**Files:**

- Modify: `regroup/functions/src/callable/subscriptions.ts` (line 289)
- Modify: `regroup/functions/src/callable/auth.ts` (line 54)
- Modify: `homegroups/functions/src/callable/banUser.ts` (lines 132–137)

- [ ] **Step 1: Fix `subscriptions.ts:289`**

  Find the `logger.info(...)` call that passes a full user object. Replace with:

  ```typescript
  // BEFORE
  logger.info("Processing subscription for user", user);

  // AFTER
  logger.info("Processing subscription for user", { userId: user.id });
  ```

- [ ] **Step 2: Fix `auth.ts:54`**

  Find the `logger.info(...)` call that passes a full guest object. Replace with:

  ```typescript
  // BEFORE
  logger.info("Adding authorization for guest", guest);

  // AFTER
  logger.info("Adding authorization for guest", {
    userId: guest.userId,
    houseId: guest.houseId,
  });
  ```

- [ ] **Step 3: Fix `banUser.ts:132–137`**

  Find the `logger.info()` call that includes `reason: data.reason`. Replace with:

  ```typescript
  // BEFORE
  logger.info("Banning user", {
    userId: data.userId,
    reason: data.reason,
    groupId: data.groupId,
  });

  // AFTER
  logger.info("Banning user", { userId: data.userId, groupId: data.groupId });
  ```

- [ ] **Step 4: Scan for remaining PII log calls**

  ```bash
  grep -rn "logger.info\|logger.warn\|logger.error" \
    regroup/functions/src/callable/ \
    homegroups/functions/src/callable/ \
    --include="*.ts" | grep -v "userId\|houseId\|groupId\|{error}" | head -30
  ```

  Review any hits that pass complex objects. Reduce to non-PII identifiers only.

- [ ] **Step 5: Commit**

  ```bash
  git add regroup/functions/src/callable/subscriptions.ts \
          regroup/functions/src/callable/auth.ts \
          homegroups/functions/src/callable/banUser.ts
  git commit -m "fix: remove PII from Cloud Functions logger calls (H4, H15)"
  ```

---

## Track D — Homegroups V4.4 Launch Gate

### Task 10: Set Stripe default prices on Intergroup Tier A and Tier B (manual — Stripe Dashboard)

**Why:** `getDefaultPriceForProduct()` in `homegroups/functions/src/utils/stripe.ts` throws `"Product X has no default price set"` at runtime. Both intergroup products have no default price configured — all intergroup and treatment-center checkouts will fail until this is done.

**Files:** Stripe Dashboard only — no code changes.

- [ ] **Step 1: Get the product IDs from the functions environment**

  ```bash
  cat homegroups/functions/.env | grep STRIPE_PRODUCT_ID_INTERGROUP
  ```

  Note `STRIPE_PRODUCT_ID_INTERGROUP_A` and `STRIPE_PRODUCT_ID_INTERGROUP_B`.

- [ ] **Step 2: Set default price on Tier A (`STRIPE_PRODUCT_ID_INTERGROUP_A`)**

  In [Stripe Dashboard → Products](https://dashboard.stripe.com/products) (use test mode first):
  1. Find the product matching the Tier A product ID
  2. Click "Add a price" → $99/month recurring (per `detox-recovery/docs/monetization.md` Treatment Center Basic Listing)
  3. After saving, click the new price → "Set as default"

- [ ] **Step 3: Set default price on Tier B (`STRIPE_PRODUCT_ID_INTERGROUP_B`)**

  Same steps:
  - Price: $299/month recurring (Referral Partner tier)
  - Set as default

- [ ] **Step 4: Smoke-test with the Firebase emulator**

  ```bash
  cd homegroups
  firebase emulators:start --only functions,firestore,auth
  ```

  Trigger `createIntergroup` with `{ tier: "tier_a", type: "intergroup", name: "Test Intergroup" }` via the emulator and confirm a checkout session URL is returned without error.

- [ ] **Step 5: Update docs to record the prices**

  In `homegroups/docs/BILLING_AND_PAYMENTS.md`, update the pricing table rows that show "TBD":

  ```markdown
  | Intergroup — Tier A | $99/month | Monthly | — | `STRIPE_PRODUCT_ID_INTERGROUP_A` |
  | Intergroup — Tier B | $299/month | Monthly | — | `STRIPE_PRODUCT_ID_INTERGROUP_B` |
  ```

- [ ] **Step 6: Commit**

  ```bash
  git add homegroups/docs/BILLING_AND_PAYMENTS.md
  git commit -m "docs(homegroups): record confirmed Intergroup Tier A/B Stripe prices"
  ```

---

### Task 11: Upgrade homegroups/functions firebase-admin to v13 (H19, H22)

**Why:** `homegroups/functions/package.json` pins `firebase-admin: "^11.11.1"` (two major versions behind v13). The companion `firebase-functions-test: "0.2.0"` is incompatible with `firebase-functions v7`. Both must be upgraded together.

**Files:**

- Modify: `homegroups/functions/package.json`

**Agent to use:** `ecc:build-fix` if the upgrade triggers TypeScript breaking changes.

- [ ] **Step 1: Upgrade packages**

  ```bash
  cd homegroups/functions
  npm install firebase-admin@^13.0.0 firebase-functions@^7.0.0 firebase-functions-test@^3.0.0
  ```

- [ ] **Step 2: Run the type-check and note breaking changes**

  ```bash
  npx tsc --noEmit 2>&1 | head -50
  ```

  Common v13 breaking changes:
  - `admin.firestore()` → use `getFirestore()` from `firebase-admin/firestore`
  - `admin.auth()` → use `getAuth()` from `firebase-admin/auth`
  - See the [firebase-admin v13 migration guide](https://firebase.google.com/docs/admin/migrate-node-v13)

  Fix each error. Use the `ecc:build-fix` agent if there are many.

- [ ] **Step 3: Run the full test suite**

  ```bash
  npm test
  ```

  Fix any test failures caused by the `firebase-functions-test@^3.x` API changes.

- [ ] **Step 4: Commit**

  ```bash
  git add homegroups/functions/package.json homegroups/functions/package-lock.json
  git commit -m "chore(homegroups): upgrade firebase-admin to v13, firebase-functions-test to v3 (H19, H22)"
  ```

---

## Track E — RATS Pricing Migration

### Task 12: Configure Stripe products for new RATS pricing tiers

**Why:** Current RATS pricing (~$20/month) loses ~$178K/year. `regroup/mobile/PRICING_STRATEGY.md` defines the approved model. This task sets up the Stripe products so the code in Task 13 has real Price IDs to reference.

**Files:** Stripe Dashboard (manual) + `regroup/functions/src/config.ts`.

**Agent to use:** `regroup/.claude/agents/revenue-architect.md` for context on tier limits.

- [ ] **Step 1: Create 6 Stripe products and prices in test mode**

  In [Stripe Dashboard → Products (test mode)](https://dashboard.stripe.com/test/products):

  | Product name                  | Price   | Interval | Env var                          |
  | ----------------------------- | ------- | -------- | -------------------------------- |
  | RATS Traditional Starter      | $69.00  | Monthly  | `STRIPE_PRICE_TRAD_STARTER`      |
  | RATS Traditional Professional | $129.00 | Monthly  | `STRIPE_PRICE_TRAD_PROFESSIONAL` |
  | RATS Traditional Enterprise   | $249.00 | Monthly  | `STRIPE_PRICE_TRAD_ENTERPRISE`   |
  | RATS Oxford Standard          | $49.00  | Monthly  | `STRIPE_PRICE_OXFORD_STANDARD`   |
  | RATS Oxford Plus              | $89.00  | Monthly  | `STRIPE_PRICE_OXFORD_PLUS`       |
  | RATS Oxford Network           | $299.00 | Monthly  | `STRIPE_PRICE_OXFORD_NETWORK`    |

  For each: set the price as default on the product. Copy the `price_xxx` ID.

- [ ] **Step 2: Store Price IDs as Firebase secrets**

  ```bash
  cd regroup
  firebase functions:secrets:set STRIPE_PRICE_TRAD_STARTER
  firebase functions:secrets:set STRIPE_PRICE_TRAD_PROFESSIONAL
  firebase functions:secrets:set STRIPE_PRICE_TRAD_ENTERPRISE
  firebase functions:secrets:set STRIPE_PRICE_OXFORD_STANDARD
  firebase functions:secrets:set STRIPE_PRICE_OXFORD_PLUS
  firebase functions:secrets:set STRIPE_PRICE_OXFORD_NETWORK
  ```

- [ ] **Step 3: Add tier constants to `regroup/functions/src/config.ts`**

  ```typescript
  export const SUBSCRIPTION_TIERS = {
    traditional: {
      starter: {
        priceEnvVar: "STRIPE_PRICE_TRAD_STARTER",
        maxResidents: 10,
        maxProperties: 1,
        label: "Traditional Starter",
      },
      professional: {
        priceEnvVar: "STRIPE_PRICE_TRAD_PROFESSIONAL",
        maxResidents: 20,
        maxProperties: 3,
        label: "Traditional Professional",
      },
      enterprise: {
        priceEnvVar: "STRIPE_PRICE_TRAD_ENTERPRISE",
        maxResidents: null,
        maxProperties: null,
        label: "Traditional Enterprise",
      },
    },
    oxford: {
      standard: {
        priceEnvVar: "STRIPE_PRICE_OXFORD_STANDARD",
        maxResidents: 15,
        maxProperties: 1,
        label: "Oxford Standard",
      },
      plus: {
        priceEnvVar: "STRIPE_PRICE_OXFORD_PLUS",
        maxResidents: 25,
        maxProperties: 1,
        label: "Oxford Plus",
      },
      network: {
        priceEnvVar: "STRIPE_PRICE_OXFORD_NETWORK",
        maxResidents: null,
        maxProperties: null,
        label: "Oxford Network",
      },
    },
  } as const;

  export type HouseType = keyof typeof SUBSCRIPTION_TIERS;
  export type TraditionalTier = keyof typeof SUBSCRIPTION_TIERS.traditional;
  export type OxfordTier = keyof typeof SUBSCRIPTION_TIERS.oxford;
  export type TierKey = TraditionalTier | OxfordTier;
  ```

- [ ] **Step 4: Type-check**

  ```bash
  cd regroup/functions
  npx tsc --noEmit
  ```

- [ ] **Step 5: Commit**

  ```bash
  git add regroup/functions/src/config.ts
  git commit -m "feat(regroup): add SUBSCRIPTION_TIERS config for new RATS pricing model"
  ```

---

### Task 13: Update subscription creation callable to use new tiers

**Why:** The subscription creation callable currently looks up a single hardcoded price. It needs to accept `houseType` and `tier` parameters and resolve the correct Price ID from the new `SUBSCRIPTION_TIERS` config.

**Files:**

- Modify: `regroup/functions/src/callable/subscriptions.ts`
- Test: `regroup/functions/src/__tests__/callable/subscriptions.test.ts`

- [ ] **Step 1: Find the subscription creation callable and its current schema**

  ```bash
  grep -n "createSubscription\|onCall\|z.object" regroup/functions/src/callable/subscriptions.ts | head -20
  ```

- [ ] **Step 2: Add `houseType` and `tier` to the input schema**

  ```typescript
  import { HouseType, TierKey, SUBSCRIPTION_TIERS } from "../config";

  // Add to the existing Zod schema:
  const createSubscriptionSchema = z.object({
    houseId: z.string().min(1),
    houseType: z.enum(["traditional", "oxford"] as const),
    tier: z.string().min(1),
    // ... keep existing fields
  });
  ```

- [ ] **Step 3: Resolve Price ID from config inside the callable**

  Before creating the Stripe subscription, add:

  ```typescript
  const tierMap = SUBSCRIPTION_TIERS[data.houseType as HouseType];
  const tierConfig = tierMap[data.tier as TierKey];

  if (!tierConfig) {
    throw new HttpsError(
      "invalid-argument",
      `Unknown tier "${data.tier}" for houseType "${data.houseType}"`,
    );
  }

  const priceId = process.env[tierConfig.priceEnvVar];
  if (!priceId) {
    throw new HttpsError(
      "internal",
      `Price ID not configured for env var: ${tierConfig.priceEnvVar}`,
    );
  }
  ```

  Pass `priceId` to `stripe.subscriptions.create({ items: [{ price: priceId }], ... })`.

- [ ] **Step 4: Persist tier metadata to the Firestore subscription document**

  When writing the subscription doc to Firestore, include:

  ```typescript
  {
    houseType: data.houseType,
    tier: data.tier,
    maxResidents: tierConfig.maxResidents,
    maxProperties: tierConfig.maxProperties,
    // ... existing fields
  }
  ```

- [ ] **Step 5: Write tests**

  In `subscriptions.test.ts`, add:

  ```typescript
  describe("createSubscription — tier routing", () => {
    beforeEach(() => {
      process.env.STRIPE_PRICE_TRAD_PROFESSIONAL = "price_test_pro_123";
    });

    it("resolves Traditional Professional price ID correctly", async () => {
      const stripeSpy = jest.spyOn(stripe.subscriptions, "create");
      await callCreateSubscription({
        houseId: "house-abc",
        houseType: "traditional",
        tier: "professional",
      });
      expect(stripeSpy).toHaveBeenCalledWith(
        expect.objectContaining({ items: [{ price: "price_test_pro_123" }] }),
      );
    });

    it("throws invalid-argument for an unrecognized tier string", async () => {
      await expect(
        callCreateSubscription({
          houseId: "house-abc",
          houseType: "traditional",
          tier: "nonexistent",
        }),
      ).rejects.toMatchObject({ code: "invalid-argument" });
    });

    it("throws internal when the env var for the tier is not set", async () => {
      delete process.env.STRIPE_PRICE_TRAD_STARTER;
      await expect(
        callCreateSubscription({
          houseId: "house-abc",
          houseType: "traditional",
          tier: "starter",
        }),
      ).rejects.toMatchObject({ code: "internal" });
    });
  });
  ```

- [ ] **Step 6: Run tests**

  ```bash
  cd regroup/functions
  npm test -- --testPathPattern="subscriptions" --verbose
  ```

  Expected: PASS.

- [ ] **Step 7: Commit**

  ```bash
  git add regroup/functions/src/callable/subscriptions.ts \
          regroup/functions/src/__tests__/callable/subscriptions.test.ts
  git commit -m "feat(regroup): tier-based Stripe subscription creation using new RATS pricing model (PRICING_STRATEGY.md)"
  ```

---

## Track F — Maestro E2E Testing

### Task 14: Install Maestro and write the first homegroups critical flow

**Why:** Both React Native apps use Detox, which requires native module integration. The existing `regroup/mobile/docs/e2e/E2E_TESTING_BLOCKERS.md` confirms Detox has known blockers. Maestro operates as a standalone CLI against the compiled simulator binary — no app-side changes required.

**Files:**

- Create: `e2e-maestro/homegroups/login-and-join-group.yaml`
- Create: `e2e-maestro/README.md`

**Skill to use:** `ecc:e2e-testing` for general E2E patterns; Maestro docs at `docs.maestro.dev`.

- [ ] **Step 1: Install Maestro CLI**

  ```bash
  brew install maestro
  maestro --version
  ```

  Expected: a version number is printed (1.x).

- [ ] **Step 2: Get the homegroups bundle ID**

  ```bash
  grep -r "PRODUCT_BUNDLE_IDENTIFIER" homegroups/mobile/ios/ | head -3
  ```

  Note the bundle ID (e.g. `com.homegroups.recoveryconnect`).

- [ ] **Step 3: Build and launch the homegroups iOS simulator binary**

  ```bash
  cd homegroups/mobile
  npm run ios
  ```

  Wait for the app to be running in the simulator.

- [ ] **Step 4: Create the test directory structure**

  ```bash
  mkdir -p /Users/marcus/dev/recovery-platform/e2e-maestro/homegroups
  mkdir -p /Users/marcus/dev/recovery-platform/e2e-maestro/regroup
  ```

- [ ] **Step 5: Write the login flow**

  Create `e2e-maestro/homegroups/login-and-join-group.yaml` (replace bundle ID and element selectors with actual values from the running app):

  ```yaml
  appId: com.homegroups.recoveryconnect # replace with actual bundle ID from Step 2
  ---
  - launchApp:
      clearState: true

  - assertVisible: "Sign In"
  - tapOn: "Sign In"
  - tapOn:
      id: "email-input"
  - inputText: "test@example.com"
  - tapOn:
      id: "password-input"
  - inputText: "TestPassword123!"
  - tapOn: "Log In"

  - assertVisible: "My Groups"

  - tapOn: "Find a Group"
  - assertVisible: "Search"
  - inputText: "Test Homegroup"
  - tapOn:
      index: 0
  - assertVisible: "Request to Join"
  - tapOn: "Request to Join"
  - assertVisible:
      text: "Request Sent"
      optional: true
  ```

- [ ] **Step 6: Run the flow against the simulator**

  ```bash
  maestro test e2e-maestro/homegroups/login-and-join-group.yaml
  ```

  Adjust `tapOn` selectors and `assertVisible` text to match actual UI. Use `maestro studio` for interactive element inspection if needed.

- [ ] **Step 7: Write `e2e-maestro/README.md`**

  ```markdown
  # Maestro E2E Tests

  Standalone CLI tests against compiled simulator/emulator binaries.
  No app-side changes required.

  ## Prerequisites

      brew install maestro
      # iOS Simulator or Android Emulator must be running with the app installed

  ## Run tests

      # All homegroups flows
      maestro test e2e-maestro/homegroups/

      # All regroup flows
      maestro test e2e-maestro/regroup/

      # Single flow
      maestro test e2e-maestro/homegroups/login-and-join-group.yaml

  ## Coexistence with Detox

  Both apps have legacy Detox config (npm run test:e2e:ios). Maestro runs alongside
  Detox — no removal needed. Migrate critical flows to Maestro incrementally.
  ```

- [ ] **Step 8: Commit**

  ```bash
  git add e2e-maestro/
  git commit -m "test: add Maestro E2E scaffold and homegroups login-and-join-group flow"
  ```

---

### Task 15: Write the first regroup/RATS critical flow

**Files:**

- Create: `e2e-maestro/regroup/login-and-view-dashboard.yaml`

- [ ] **Step 1: Get the regroup bundle ID**

  ```bash
  grep -r "PRODUCT_BUNDLE_IDENTIFIER" regroup/mobile/ios/ | head -3
  ```

- [ ] **Step 2: Build and launch the regroup iOS simulator binary**

  ```bash
  cd regroup/mobile
  npm run ios
  ```

- [ ] **Step 3: Write the dashboard flow**

  Create `e2e-maestro/regroup/login-and-view-dashboard.yaml`:

  ```yaml
  appId: com.regroup.rats # replace with actual bundle ID from Step 1
  ---
  - launchApp:
      clearState: true

  - assertVisible: "Sign In"
  - tapOn: "Sign In"
  - tapOn:
      id: "email-input"
  - inputText: "operator@example.com"
  - tapOn:
      id: "password-input"
  - inputText: "TestPassword123!"
  - tapOn: "Log In"

  - assertVisible: "My Houses"

  - tapOn:
      index: 0 # first house in list
  - assertVisible: "Residents"
  - assertVisible: "Activities"

  - tapOn: "Residents"
  - tapOn:
      index: 0 # first resident
  - assertVisible: "Phase"
  ```

- [ ] **Step 4: Run the flow**

  ```bash
  maestro test e2e-maestro/regroup/login-and-view-dashboard.yaml
  ```

  Adjust selectors to match actual UI text and element IDs.

- [ ] **Step 5: Commit**

  ```bash
  git add e2e-maestro/regroup/
  git commit -m "test: add Maestro E2E regroup/RATS login-and-view-dashboard flow"
  ```

---

## Self-Review

**Spec coverage:**

- [x] C1–C4 privilege escalation → Tasks 1–2
- [x] C5 `fromApp` hardcode → Task 5
- [x] C6 Google Maps API key → Task 4
- [x] C7–C8 Firestore rules → Task 3
- [x] H2 balance race condition → Task 6
- [x] H4 PII logging → Task 9
- [x] H5 float arithmetic → Task 6
- [x] H15 banUser PII logging → Task 9
- [x] H17 `serverTimestamp` → Task 8
- [x] H19 `firebase-admin` v11 → Task 11
- [x] H22 `firebase-functions-test` incompatibility → Task 11
- [x] L13 Stripe client per-request → Task 7
- [x] Intergroup Stripe launch gate → Task 10
- [x] RATS pricing migration → Tasks 12–13
- [x] Maestro E2E → Tasks 14–15

**Deferred (tracked in `CODEBASE-REVIEW.md`, each needs its own plan):**

- H9: 26 homegroups screens bypassing model/thunk architecture
- H20/H21: axios v0.19 CVEs + Angular 9 EOL in regroup/web
- H3: In-memory rate limiter in detox-recovery (needs Redis/Upstash decision)
- M9: Populate `shared/` workspace package with duplicate utilities
- L1: Zero accessibility labels across 55+ homegroups screens

---

## Execution Options

**Plan saved to:** `docs/superpowers/plans/2026-05-31-recovery-platform-hardening-and-optimization.md`

**1. Subagent-Driven (recommended):** Use `superpowers:subagent-driven-development` — dispatch a fresh subagent per task, review between tasks, fast iteration.

**2. Inline Execution:** Use `superpowers:executing-plans` — batch execution with checkpoints.

**Ordering constraint:** Track A (Tasks 1–5) must complete before any public regroup launch. Tracks B–F are independent and can run in parallel after Track A.
