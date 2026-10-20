# Regroup Server-Side House Creation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A paying operator who finishes the setup wizard ends up with their houses created, owning them, holding the `admin` and `superAdmin` claims for them, and entitled, with no permission-denied error along the way.

**Architecture:** A new `createHouses` callable does in one Firestore transaction what the wizard used to attempt as a client batch:

- create the house docs;
- create or extend the operator's `admins` doc;
- update `users/{uid}`;
- record the houses in `subscriptionMetadata`.

Once the transaction commits, it grants both house-scoped claims in a single `setCustomUserClaims` call. The client wizard then calls the callable, refreshes its token, and does the work that needs a claim: photo uploads and invitations. Client creation of houses is then closed off in the rules.

**Tech Stack:** Firebase Functions v2 (`onCall`), firebase-admin Firestore transactions, zod (`parseInput`), `ngeohash`, React Native Firebase, Jest, `@firebase/rules-unit-testing`.

**Spec:** `docs/launch-readiness/plan-regroup-recovery-api-2026-10-19.md`, item B1, with evidence REV-A3 in `ledger-regroup-recovery-api-2026-10-19.md`.

## Global Constraints

- Work in a worktree off `origin/main`. Use `git -C <path>`, never `cd && git`.
- Source files stay at or under 300 lines; the pre-commit hook blocks new files over that. `callable/subscriptions.ts` (755 lines) and `mobile/src/screens/Personal/Personal.tsx` are already over: don't grow them, and extract code instead.
- Commit scopes: `regroup-functions`, `regroup-mobile`. A bare `functions`/`mobile` scope is blocked by the hook.
- Never log PII. Log uid and house ids only, never names, emails or addresses.
- `HttpsError` messages are user-safe. Raw errors are logged server-side only.
- Server-owned house fields are never taken from client input: `ownerId`, `adminIds`, `superAdminIds`, `subscriptionStatus`, `guestGraceEndsAt`, `stripeAccountId`, `stripeAccountApi`, `stripeStatus`, `isDemoHouse`, `certified`, `oxfordEnabled`.
- Claims merge and never overwrite. Read the current claims once and preserve every role map and `potentialSuperAdmin`.
- Functions tests: `cd regroup/functions && npx jest <path>`. Mobile tests: `cd regroup/mobile && npx jest <path>`. Rules tests: `cd regroup/mobile/firebase && npx -y firebase-tools@15 emulators:exec --only firestore --project demo-rules "cd .. && npx jest --config jest.config.rules.js --no-coverage --forceExit <path>"` (npm firebase-tools, never Homebrew).

## Review Focus

1. **Retry after a partial failure.** The transaction committed but the claim grant failed, or the client timed out. A second call with the same house ids must succeed, grant the claims, and create nothing twice. (Task 4: `"retrying with the same ids re-grants claims without rewriting houses"`.)
2. **House id already taken by someone else.** A client-chosen id that collides with another owner's house must fail with `already-exists` and must not change that house. (Task 4: `"rejects an id owned by another operator"`.)
3. **Operator who already has an admin doc** (adding a second house in-app via `inApp: true`). The existing `admins` doc is extended, not replaced, and existing `houseIds` survive. (Task 4: `"extends an existing admin doc"`.)
4. **Lapsed or absent subscription.** An operator with `past_due`, `canceled` or no `subscriptionMetadata.tier` cannot create houses. A house must never exist for an unentitled operator, which is the invariant `setHouseSubscriptionStatusOnCreate` logs about. (Task 4: `"denies without an active or trialing tier subscription"`.)
5. **Client-supplied server-owned fields.** A payload carrying `subscriptionStatus: "active"`, `stripeAccountId` or `ownerId` of another user is ignored, and the server values win. (Task 3: `"drops server-owned fields from client input"`.)

---

### Task 1: Extract the subscription house-cap logic into a pure function

`updateSubscriptionHouses` keeps the property-cap and multi-property checks inline (`callable/subscriptions.ts:540-595`). `createHouses` needs the same checks inside its transaction. Move them out without changing behaviour.

**Files:**

- Create: `regroup/functions/src/util/subscriptionHouses.ts`
- Modify: `regroup/functions/src/callable/subscriptions.ts:539-595` (the `action === "add"` and remove branches call the new functions)
- Test: `regroup/functions/src/__tests__/util/subscriptionHouses.test.ts`

**Interfaces:**

- Produces: `addHousesToSubscription(meta: OperatorSubscription, houseIds: string[], now?: Date): OperatorSubscription`. It throws `HttpsError("failed-precondition", …)` with the two exact existing messages, and returns new metadata whose `houses` gains `{ numberOfGuests: 0 }` per new id and whose `lastUpdatedAt` is `now.toISOString()`.
- Produces: `removeHouseFromSubscription(meta: OperatorSubscription, houseId: string, now?: Date): OperatorSubscription`.

- [ ] **Step 1: Write the failing tests**

```ts
describe('addHousesToSubscription', () => {
  const base = { tier: 'starter', houseType: 'traditional', maxProperties: 1, houses: {} } as any;
  it('adds a first house with zero guests', () => {
    expect(addHousesToSubscription(base, ['h1'], new Date('2026-10-20T00:00:00Z')).houses).toEqual({
      h1: { numberOfGuests: 0 },
    });
  });
  it('rejects a second house on a tier without multiProperty', () => {
    expect(() =>
      addHousesToSubscription({ ...base, houses: { h1: { numberOfGuests: 2 } } }, ['h2']),
    ).toThrow('Your plan does not include multiple properties — upgrade to add more houses');
  });
  it('rejects a house past maxProperties on a multi-property tier', () => {
    /* tier "professional", maxProperties 3, 3 houses → "Property limit reached for your plan" */
  });
  it('treats an id already present as a no-op and keeps its guest count', () => {
    /* houses {h1:{numberOfGuests:4}} + ["h1"] → h1 still 4 */
  });
  it('denies multi-property when tierAllows throws (fail-closed)', () => {
    /* houseType "bogus" */
  });
});
```

- [ ] **Step 2: Run the tests and confirm they fail**

Run: `cd regroup/functions && npx jest src/__tests__/util/subscriptionHouses.test.ts`
Expected: FAIL, "Cannot find module '../../util/subscriptionHouses'".

- [ ] **Step 3: Implement both functions**

Move the loop body verbatim, keeping the `tierAllows` try/catch fail-closed, and keep the `logger.error` with uid replaced by `houseType`/`tier` only. In `updateSubscriptionHouses`, replace the inline blocks with calls to the new functions. Its signature, return value and messages don't change.

- [ ] **Step 4: Run the new and existing suites**

Run: `cd regroup/functions && npx jest src/__tests__/util/subscriptionHouses.test.ts src/__tests__/callable/subscriptions.test.ts`
Expected: PASS, with the same test count as before for `subscriptions.test.ts`.

- [ ] **Step 5: Commit**

```bash
git add regroup/functions/src/util/subscriptionHouses.ts regroup/functions/src/callable/subscriptions.ts regroup/functions/src/__tests__/util/subscriptionHouses.test.ts
git commit -m "refactor(regroup-functions): extract the subscription house-cap checks"
```

### Task 2: Grant admin and superAdmin claims in one merge

**Files:**

- Modify: `regroup/functions/src/util/claims.ts` (add a function; leave `createClaims`/`deleteClaim` alone)
- Test: `regroup/functions/src/__tests__/util/claims.test.ts` (create it if absent)

**Interfaces:**

- Produces: `grantHouseRoles(userId: string, houseIds: string[]): Promise<void>`. It reads `auth().getUser` once, adds every id to both `admin` and `superAdmin`, preserves `guest` and `potentialSuperAdmin` as they are, and calls `setCustomUserClaims` exactly once.

- [ ] **Step 1: Write the failing tests:**
  - `"adds the houses to both admin and superAdmin"`: existing claims `{admin:{a:true}}`, then `grantHouseRoles(uid, ["h1"])` sets `{admin:{a:true,h1:true}, superAdmin:{h1:true}, guest:{}}`.
  - `"preserves guest claims and potentialSuperAdmin"`: existing `{guest:{g:true}, potentialSuperAdmin:true}` keeps both.
  - `"writes claims exactly once"`: `setCustomUserClaims` is called once.
  - `"migrates a legacy array-shaped claim to the map shape"`: existing `{admin:["a"]}` becomes `admin:{a:true,h1:true}`.
- [ ] **Step 2: Run the tests and confirm they fail.** Run `cd regroup/functions && npx jest src/__tests__/util/claims.test.ts`. Expected: FAIL, "grantHouseRoles is not a function".
- [ ] **Step 3: Implement `grantHouseRoles`** using the existing `parseCurrentClaims`.
- [ ] **Step 4: Run the tests and confirm they pass.**
- [ ] **Step 5: Commit** with `feat(regroup-functions): grant house admin roles in a single claims merge`.

### Task 3: Build a house document from whitelisted client input

**Files:**

- Create: `regroup/functions/src/houses/houseInput.ts` (the zod schema and `buildHouseDoc`)
- Test: `regroup/functions/src/__tests__/houses/houseInput.test.ts`

**Interfaces:**

- Produces: `createHouseInputSchema` (zod) and `type CreateHouseInput = z.infer<typeof createHouseInputSchema>`.
  - `id` is required and matches `/^[A-Za-z0-9]{20}$/` (a Firestore auto-id generated client-side).
  - `name` is required, non-empty, max 120.
  - `lat`/`lng` are required, as numbers or numeric strings.
  - Everything else is optional client-editable config: `street`, `city`, `state`, `zip`, `country`, `timezone`, `phoneNumber`, `monthlyRent`, `weeklyRent`, `maximumCapacity`, `depositsAndFees`, `rentFrequency`, `gender`, `baths`, `wifi`, `managerSetupType`, `houseType`, `phases`, `chores`, `rooms`, `pendingAdminInvites`, `pendingGuestInvites`, `seniorPeerEmails`.
  - Unknown keys are stripped with `.strip()`, not passed through.
- Produces: `buildHouseDoc(input: CreateHouseInput, ctx: { ownerUid: string; adminId: string; subscriptionStatus: "active" | "trialing"; now: string }): Record<string, unknown>`. Server values:
  - `ownerId: ownerUid`, `adminIds: [adminId]`, `superAdminIds: [adminId]`;
  - `subscriptionStatus`;
  - `geohash: encode(lat, lng)` from `ngeohash` (default precision, which matches mobile `util/geolocation.ts:11`);
  - `currentCapacity: 0`, `stripeStatus: "not_connected"`, `isDemoHouse: false`, `certified: false`;
  - `imageUrl: ""`, `avatar: ""`;
  - `createdAt: now`.

- [ ] **Step 1: Write the failing tests:**
  - `"drops server-owned fields from client input"`: input with `subscriptionStatus:"active"`, `stripeAccountId:"acct_x"`, `ownerId:"evil"`, `isDemoHouse:true`, `oxfordEnabled:true` produces `ownerId === ctx.ownerUid`, no `stripeAccountId`, `isDemoHouse === false`, no `oxfordEnabled`, and `subscriptionStatus === ctx.subscriptionStatus`.
  - `"computes geohash on the server"`: lat 30.2672, lng -97.7431 gives `geohash === encode(30.2672, -97.7431)`.
  - `"rejects an id that is not a 20-char auto-id"`: `"../users/x"` fails the schema parse.
  - `"keeps wizard configuration"`: `phases`, `chores`, `rooms`, `pendingGuestInvites` and `managerSetupType` round-trip unchanged.
- [ ] **Step 2: Run the tests and confirm they fail.**
- [ ] **Step 3: Implement the schema and `buildHouseDoc`.** Before finalising the whitelist, diff it against `regroup/mobile/src/entities/House.ts`. Add every field the setup wizard sets that isn't in the server-owned list above, and list any you add in the commit body.
- [ ] **Step 4: Run the tests and confirm they pass.**
- [ ] **Step 5: Commit** with `feat(regroup-functions): whitelist house creation input`.

### Task 4: `createHouses` callable

**Files:**

- Create: `regroup/functions/src/callable/houses.ts`
- Modify: `regroup/functions/src/index.ts` (add `export { createHouses } from './callable/houses';`)
- Test: `regroup/functions/src/__tests__/callable/houses.test.ts` (mock `firebase-functions/v2/https` and `firebase-admin` the way `__tests__/callable/invitations.test.ts:1-45` does, with an in-memory transaction fake whose `get`/`create`/`set`/`update` record calls)

**Interfaces:**

- Consumes: `addHousesToSubscription` (Task 1), `grantHouseRoles` (Task 2), `createHouseInputSchema`/`buildHouseDoc` (Task 3), and `operatorStatusToHouseStatus` (`util/entitlement.ts:181`).
- Produces: the callable `createHouses`.
  - Input: `{ houses: CreateHouseInput[] }`, 1–10 items with unique ids.
  - Returns `{ houseIds: string[]; admin: Admin; subscriptionMetadata: OperatorSubscription }`.

Behaviour, in order:

1. If there is no `request.auth`, throw `unauthenticated`.
2. Read `users/{uid}`. Map `subscriptionMetadata.status` through `operatorStatusToHouseStatus`. Unless `meta.tier` is set and the mapped status is `active` or `trialing`, throw `failed-precondition` with "An active subscription is required to create a house".
3. Run `runTransaction`:
   1. Read every requested house. If a house exists with `ownerId === uid`, it counts as already created. If a house exists with any other owner, throw `already-exists` with "A house with this id already exists".
   2. Resolve the admin doc. If `user.adminId` is set, read it and require `admin.userId === uid`, otherwise throw `permission-denied`. If not set, create a new `admins` doc with `{ id, email: user.email.toLowerCase(), firstName, lastName, userId: uid, houseIds: [], superAdmin: [] }`.
   3. Call `addHousesToSubscription(meta, newIds)`.
   4. `tx.create` each new house with `buildHouseDoc`.
   5. `tx.set` the admin doc with `houseIds` and `superAdmin` as set-unions including all requested ids.
   6. `tx.update` `users/{uid}` with `{ orgSetupCompleted: true, isAdmin: true, isSuperAdmin: true, adminId, housesOwned: union, subscriptionMetadata: newMeta }`.
4. After the commit, call `grantHouseRoles(uid, allRequestedIds)`. If the claim grant fails, log the uid and house ids, then throw `internal` with "Houses were created but access could not be granted. Try again." Retrying is safe (see Review Focus 1).
5. Log `house.created` with uid, house ids and status only.

- [ ] **Step 1: Write the failing tests** (each name below asserts the behaviour it describes):
  - `"rejects unauthenticated callers"`
  - `"denies without an active or trialing tier subscription"`: `past_due`, `canceled`, missing `tier`, and missing metadata (four cases).
  - `"creates houses, admin doc and user fields in one transaction"`: asserts `create` ×N, one admin `set`, one user `update`, and `subscriptionStatus` on each house equal to the operator's mapped status.
  - `"grants admin and superAdmin claims after the transaction"`: `grantHouseRoles` is called with uid and the ids, after the commit.
  - `"extends an existing admin doc"`: existing `houseIds:["old"]` becomes `["old","h1"]`.
  - `"rejects an admin doc that belongs to another user"`
  - `"retrying with the same ids re-grants claims without rewriting houses"`
  - `"rejects an id owned by another operator"`
  - `"enforces the property cap"`: an error from `addHousesToSubscription` propagates and nothing is written.
  - `"reports a claim-grant failure as retryable"`
- [ ] **Step 2: Run the tests and confirm they fail.** Run `cd regroup/functions && npx jest src/__tests__/callable/houses.test.ts`.
- [ ] **Step 3: Implement the callable** at or under 300 lines. If needed, split the transaction body into `houses/createHousesTx.ts`.
- [ ] **Step 4: Run the tests and typecheck.** Run `cd regroup/functions && npx jest src/__tests__/callable/houses.test.ts && npx tsc --noEmit`. Expected: PASS and no type errors.
- [ ] **Step 5: Commit** with `feat(regroup-functions): create houses server-side with createHouses`.

### Task 5: Close client-side house creation in the rules and delete the dead client path

**Files:**

- Modify: `regroup/mobile/firebase/firestore.rules:196`, changing `allow create: if isAdmin([houseId]);` to `allow create: if false;` with a one-line comment saying houses are created by the `createHouses` callable.
- Modify: `regroup/mobile/src/services/house.tsx:162-190` (delete `createHouseBatch`, which only its test uses) and `regroup/mobile/src/services/__tests__/house.test.ts:464+` (delete its `describe`).
- Test: `regroup/mobile/firebase/__tests__/firestore.rules.test.ts`

- [ ] **Step 1: Write the failing rules tests:**
  - `"a client cannot create a house even holding superAdmin for its id"`: context `{ superAdmin: { h1: true } }` and `setDoc(houses/h1)` → `assertFails`.
  - `"a new operator holding only potentialSuperAdmin cannot create a house"` (the B1 probe, kept as a regression test).
- [ ] **Step 2: Run the rules suite** with the emulator command from Global Constraints. Expected: the first new test fails, because a superAdmin can currently create. Note any existing tests that seed houses through an authenticated context.
- [ ] **Step 3: Change the rule, and move every house seed in the suite into `withSecurityRulesDisabled`.**
- [ ] **Step 4: Run the full rules suite and `npx jest src/services/__tests__/house.test.ts`.** Expected: all pass.
- [ ] **Step 5: Commit** with `fix(regroup-mobile): houses are created server-side only`.

### Task 6: Route the setup wizard through `createHouses`

**Files:**

- Modify: `regroup/mobile/src/services/setup-wizard.ts` (`initializeHouses`, lines 139-270)
- Modify: `regroup/mobile/src/services/subscription.ts` (add the callable wrapper)
- Test: `regroup/mobile/src/services/__tests__/setup-wizard.test.ts`

**Interfaces:**

- Consumes: the `createHouses` callable (Task 4).
- Produces: `createHouses(houses: HouseCreatePayload[]): Promise<{ houseIds: string[]; admin: Admin; subscriptionMetadata: OperatorSubscription }>` in `services/subscription.ts`.
- `initializeHouses(houses, operator, inApp)` keeps its return shape `{ houses, inviteError, admin, user, token }`, so `setupSlice.submitHouseSetup` and `useHouseSetupWizard` don't change.

New order inside `initializeHouses`:

1. Compute `timezone` per house as today (`getTimezone`). Build payloads without `imageUrl`/`avatar` (local file URIs).
2. `await createHouses(payloads)`.
3. `token = await getAuthUser(true)`, which picks up the new claims.
4. Upload photos (`uploadHousePhotos`), then `houseCollection.doc(id).update({ imageUrl, avatar })` per house. This is best-effort: log the exception and continue.
5. Run `sendAllInvites` and capture `inviteError` as today.
6. Return `user` as `{ ...operator, orgSetupCompleted: true, isAdmin: true, isSuperAdmin: true, adminId: admin.id, housesOwned, subscriptionMetadata }`.

Delete the client batch, the client `addAdminAuthorization` call, and the client `updateSubscriptionHouses` call from this function. `addAdminAuthorization` stays exported because invite flows still use it.

- [ ] **Step 1: Write the failing tests** (replacing the old batch assertions):
  - `"calls createHouses with sanitised payloads and no local image URIs"`
  - `"refreshes the token before uploading photos and sending invites"`: call order is `createHouses`, then `getAuthUser(true)`, then `uploadHousePhoto`, then `createInvitation`.
  - `"does not write houses, admins or users from the client"`: `firestore.batch` is never called.
  - `"a failed photo upload still completes setup"`
  - `"throws 'Failed to create houses.' when createHouses rejects"`
- [ ] **Step 2: Run the tests and confirm they fail.** Run `cd regroup/mobile && npx jest src/services/__tests__/setup-wizard.test.ts src/hooks/__tests__/useHouseSetupWizard.test.ts`.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run both suites plus `npx tsc --noEmit`.** Expected: PASS.
- [ ] **Step 5: Commit** with `fix(regroup-mobile): setup wizard creates houses through createHouses`.

### Task 7: End-to-end check in the emulators

**Files:** none committed, unless the check exposes a bug (then a test plus fix in the owning task's files).

- [ ] **Step 1:** Start Firestore, Auth and Functions emulators for regroup (`/regroup-run-functions`). Seed `users/op1` with `subscriptionMetadata: { tier: "starter", houseType: "traditional", status: "trialing", maxProperties: 1, houses: {} }` and an Auth user `op1` holding only `{ potentialSuperAdmin: true }`.
- [ ] **Step 2:** As `op1`, call `createHouses` with one house. Expected:
  - `houses/<id>` exists with `ownerId: "op1"` and `subscriptionStatus: "trialing"`;
  - the `op1` claims include `admin.<id>` and `superAdmin.<id>`;
  - `users/op1.subscriptionMetadata.houses.<id>` is present.
- [ ] **Step 3:** With a token refreshed for those claims, update `houses/<id>.imageUrl` from the client SDK. Expected: allowed.
- [ ] **Step 4:** Call `createHouses` again with the same id. Expected: success and no duplicate writes. Then call it with a second id. Expected: `failed-precondition` "Your plan does not include multiple properties — upgrade to add more houses".
