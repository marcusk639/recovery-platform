# Homegroups Wave 8 (Admin-Claim Write-Ordering Redesign) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Close the non-transactional write-ordering race in `requestAdminAccessWithSubscription.ts` (a concurrent legitimate claimant's Stripe fields can be silently corrupted by another caller's write) and the RPC ack-ambiguity gaps in the same file's error handling, per the approved design at `docs/superpowers/specs/2026-07-13-admin-claim-write-ordering-redesign-design.md`.

**Architecture:** Defer all group-document Stripe field writes into the single atomic `tx.update()` call that already grants `admins`/`isClaimed` — a losing caller's Stripe identifiers are never written anywhere, so there is nothing to corrupt and (for the create-new path) nothing to revert. Add a final live-status re-check before granting admin, so no code path can act on a stale/replayed Stripe response. Add an ack-ambiguity re-read in the failure path so a transaction that actually committed (despite the client observing an error) is treated as a win, not a failure — and this same check, given the callable's `userId`-scoped idempotency keys, is what makes a same-user concurrent double-request safe without any additional bookkeeping.

**Tech Stack:** Firebase Cloud Functions v2 (TypeScript) + Stripe + Firestore transactions. Jest + ts-jest, following this file's existing hand-rolled Firestore/Stripe mock conventions.

## Global Constraints

- All paths relative to `/Users/marcusklein/dev/recovery-platform/homegroups/functions/` unless stated otherwise.
- This is a single-file production-code change (`src/callable/requestAdminAccessWithSubscription.ts`) plus its test file and one small doc update. Do not touch `createGroupWithSubscription.ts` or any other callable.
- **Dependency:** this plan assumes Wave 6's `requireAuth` migration (PR #46) has merged, so the auth guard is `const uid = requireAuth(request);`. Read the file first — if PR #46 hasn't merged yet when this task starts, adapt the guard reference to whatever the file's actual current auth-check line looks like; nothing else in this plan depends on that migration.
- `npx tsc --noEmit` must stay clean and the full existing test suite must pass (baseline: confirm current count by running the suite before Task 1) in addition to each task's new/changed tests.
- No new npm dependencies.
- **Cross-functional note, not a code task:** Task 4 ships a new "contact support" error (row 17 of the design spec's error contract). Per the spec, confirm a support process exists for this scenario before or alongside deploying Task 4 — this is an operational dependency, not something any task below can close by itself.
- **Row 16 of the error contract (the generic `internal` message) is deliberately left with its current wording in this plan.** The design spec proposed alternative wording affirming retry-safety but explicitly flagged it as "the downstream UX spec's call," not a backend decision to make unilaterally. Tasks 1 and 3 below keep the existing message text unchanged — only the underlying retry-safety guarantee changes (a real, automatic side effect of Task 1's write-ordering fix), not the copy. Whoever writes the downstream client-UX spec can update this string independently of this plan.
- **The full detailed design, including the exact reasoning for every check and the complete error-contract reference, lives in the design spec** (`docs/superpowers/specs/2026-07-13-admin-claim-write-ordering-redesign-design.md`) — read it once before starting Task 1; individual task briefs below don't repeat that reasoning, only the concrete steps.

---

## File Structure

| File                                                                 | Change                                                                                                                                                                         |
| -------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `functions/src/callable/requestAdminAccessWithSubscription.ts`       | Remove speculative writes, merge into transaction (Task 1); live-status re-check (Task 2); ack-ambiguity-aware compensation (Task 3); new web-checkout residual error (Task 4) |
| `functions/src/__tests__/requestAdminAccessWithSubscription.test.ts` | Delete Wave 7's now-obsolete compensation/idempotency-key describe blocks; add new tests per task                                                                              |
| `homegroups/CLAUDE.md`                                               | Small doc note on the new write-ordering pattern (Task 5)                                                                                                                      |
| `functions/scripts/auditCorruptedGroupClaims.ts` (new)               | One-off audit script for pre-existing corrupted groups (Task 6)                                                                                                                |

---

## Task 1: Remove Speculative Writes; Merge Stripe Fields Into the Claim Transaction

**Files:**

- Modify: `functions/src/callable/requestAdminAccessWithSubscription.ts`
- Modify: `functions/src/__tests__/requestAdminAccessWithSubscription.test.ts`

**Interfaces:** No signature changes. Behavior change: `groups/{groupId}`'s `stripeCustomerId` / `stripeSubscriptionId` / `subscriptionStatus` / `stripeSubscriptionItemId` / `stripePriceIdGroup` / `stripeProductIdGroup` are no longer written until the claim transaction commits — they land in the same `tx.update()` call that sets `isClaimed`/`admins`, for whichever caller actually wins.

**Context:** Read `docs/superpowers/specs/2026-07-13-admin-claim-write-ordering-redesign-design.md` §1 for the full reasoning (the write-ordering race, why it corrupts a winner's data, and why this closes it). Read the current file first — line numbers below are approximate and will have shifted if PR #46 or any other change landed since this plan was written.

- [ ] **Step 1: Write failing tests for the new behavior**

Add to `functions/src/__tests__/requestAdminAccessWithSubscription.test.ts`, in a new `describe` block (read the file's existing `buildMockDb`/`docStore`/`makeRequest`/`seedUnclaimedGroup`/`setupDefaults` helpers first to match conventions exactly):

```typescript
describe("requestAdminAccessWithSubscription — write-ordering (Stripe fields only land for the transaction winner)", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    docStore = {};
    mockDb = buildMockDb();
    setupDefaults();
  });

  it("does not write any Stripe fields to the group doc before the claim transaction commits", async () => {
    // Intercept the moment right before the transaction runs to inspect
    // whether any Stripe fields have been written yet.
    const originalRunTransaction = mockDb.runTransaction;
    let stripeFieldsWrittenBeforeTransaction = false;
    mockDb.runTransaction = (async (fn: (tx: any) => Promise<unknown>) => {
      const preTxGroup = docStore[`groups/${GROUP_ID}`] as
        Record<string, unknown> | undefined;
      if (preTxGroup?.stripeSubscriptionId !== undefined) {
        stripeFieldsWrittenBeforeTransaction = true;
      }
      return originalRunTransaction(fn);
    }) as typeof mockDb.runTransaction;

    const request = makeRequest(USER_ID, {
      groupId: GROUP_ID,
      paymentMethodId: PAYMENT_METHOD_ID,
    });

    await (requestAdminAccessWithSubscription as any)(request); // eslint-disable-line @typescript-eslint/no-explicit-any

    expect(stripeFieldsWrittenBeforeTransaction).toBe(false);

    // After the transaction commits, the fields ARE present (written
    // atomically with the win).
    const finalGroup = docStore[`groups/${GROUP_ID}`] as Record<
      string,
      unknown
    >;
    expect(finalGroup.stripeSubscriptionId).toBe("sub_test");
    expect(finalGroup.admins).toEqual([USER_ID]);
  });

  it("on a genuine already-claimed race loss, never writes this caller's own Stripe fields anywhere — the winner's data is untouched", async () => {
    const originalRunTransaction = mockDb.runTransaction;
    let transactionAttempt = 0;
    mockDb.runTransaction = (async (fn: (tx: any) => Promise<unknown>) => {
      transactionAttempt++;
      if (transactionAttempt === 1) {
        docStore[`groups/${GROUP_ID}`] = {
          ...docStore[`groups/${GROUP_ID}`],
          isClaimed: true,
          admins: ["winner-user"],
          stripeSubscriptionId: "sub_winner",
          subscriptionStatus: "trialing",
        };
      }
      return originalRunTransaction(fn);
    }) as typeof mockDb.runTransaction;

    mockStripeSubscriptionsCancel.mockResolvedValue({});

    const request = makeRequest(USER_ID, {
      groupId: GROUP_ID,
      paymentMethodId: PAYMENT_METHOD_ID,
    });

    await expect(
      (requestAdminAccessWithSubscription as any)(request), // eslint-disable-line @typescript-eslint/no-explicit-any
    ).rejects.toMatchObject({ code: "failed-precondition" });

    // The winner's Stripe fields are exactly as the winner left them —
    // this caller's own (now-canceled) subscription was never written
    // anywhere, so there's nothing to have clobbered them with.
    const finalGroup = docStore[`groups/${GROUP_ID}`] as Record<
      string,
      unknown
    >;
    expect(finalGroup.stripeSubscriptionId).toBe("sub_winner");
    expect(finalGroup.admins).toEqual(["winner-user"]);
    expect(mockStripeSubscriptionsCancel).toHaveBeenCalledWith("sub_test");
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `cd functions && node_modules/.bin/jest src/__tests__/requestAdminAccessWithSubscription.test.ts -t "write-ordering"`
Expected: FAIL — the current code writes Stripe fields via `groupRef.update()` before the transaction runs, so `stripeFieldsWrittenBeforeTransaction` will be `true` in the first test.

- [ ] **Step 3: Implement the write-ordering fix**

Read the file's current state first to confirm exact line numbers. Three changes:

**3a. Delete the eager write in the customer-creation branch** (currently inside `if (!stripeCustomerId) { ... }`):

```typescript
// DELETE this line (keep everything else in the branch):
await groupRef.update({ stripeCustomerId });
```

`stripeCustomerId` stays a local variable, used later when assembling `claimStripeFields`.

**3b. Delete the eager write in the subscription-creation branch** (currently inside the `if (!stripeSubscriptionId || subscriptionStatus === ...)` block):

```typescript
// DELETE this whole block (keep the lines above and below it that build
// stripeSubscriptionId, subscriptionStatus, subscriptionCreatedThisCall,
// subscriptionItemId as local variables):
await groupRef.update({
  stripeCustomerId,
  stripeSubscriptionId,
  subscriptionStatus,
  stripeSubscriptionItemId: subscriptionItemId,
  stripePriceIdGroup: groupPriceId,
  stripeProductIdGroup: productIdGroup,
  updatedAt: admin.firestore.FieldValue.serverTimestamp(),
});
```

Keep `subscriptionItemId`, `groupPriceId` as local variables — rename/promote them so they're in scope for the `claimStripeFields` assembly in 3c (e.g. `let stripeSubscriptionItemId: string | undefined;` and `let stripePriceIdGroup: string | undefined;` declared near the other `let stripeCustomerId`/`stripeSubscriptionId` declarations, assigned inside this branch instead of only existing as `const subscriptionItemId`/`groupPriceId` local to the `if` block).

**3c. Delete the eager write in the web-checkout verify branch** (currently inside `if (subscriptionId) { ... }`, the success case):

```typescript
// DELETE:
await groupRef.update({
  stripeCustomerId,
  stripeSubscriptionId,
  subscriptionStatus,
  stripeSubscriptionItemId: subscriptionItemId,
  updatedAt: admin.firestore.FieldValue.serverTimestamp(),
});
```

Same treatment: keep `subscriptionItemId` (rename to the shared `stripeSubscriptionItemId` local variable) so it's available later.

**3d. Assemble `claimStripeFields` immediately before the transaction** (right after the "Guard: only grant admin if subscription is active or trialing" check, before the `try { await db.runTransaction(...) }` block):

```typescript
// Assemble exactly once, from whichever branch above actually ran.
// Firestore rejects literal `undefined` — omit absent fields rather than
// setting them to undefined.
const claimStripeFields: Record<string, unknown> = { stripeCustomerId };
if (stripeSubscriptionId !== undefined) {
  claimStripeFields.stripeSubscriptionId = stripeSubscriptionId;
}
if (subscriptionStatus !== undefined) {
  claimStripeFields.subscriptionStatus = subscriptionStatus;
}
if (stripeSubscriptionItemId !== undefined) {
  claimStripeFields.stripeSubscriptionItemId = stripeSubscriptionItemId;
}
if (stripePriceIdGroup !== undefined) {
  claimStripeFields.stripePriceIdGroup = stripePriceIdGroup;
}
if (stripeProductIdGroup !== undefined) {
  claimStripeFields.stripeProductIdGroup = stripeProductIdGroup;
}
```

(`stripeProductIdGroup` here is the module-level `productIdGroup` constant, only relevant when a new subscription was created this call — assign a local `stripeProductIdGroup = productIdGroup;` inside the subscription-creation branch, mirroring `stripePriceIdGroup`, rather than reusing the module constant name directly in the conditional, so the "only include what this call actually touched" logic reads consistently across all five fields.)

**3e. Merge `claimStripeFields` into the transaction's `tx.update()`:**

```typescript
tx.update(groupRef, {
  isClaimed: true,
  admins: admin.firestore.FieldValue.arrayUnion(userId),
  pendingAdminRequests: admin.firestore.FieldValue.arrayRemove(userId),
  updatedAt: admin.firestore.FieldValue.serverTimestamp(),
  ...claimStripeFields,
});
```

**3f. Simplify the catch block — remove Wave 7's revert-guard logic entirely** (the `staleSnap`/`staleData.stripeSubscriptionId === stripeSubscriptionId` check and its conditional `groupRef.update({stripeSubscriptionId: null, ...})`). Replace the whole `catch (txError: any) { ... }` block with this minimal version (Tasks 2-3 will elaborate it further — this step's only job is proving the write-ordering fix works on its own):

```typescript
} catch (txError: any) {
  const isRaceLoss =
    txError instanceof HttpsError && txError.code === "failed-precondition";

  if (subscriptionCreatedThisCall && stripeSubscriptionId) {
    try {
      await stripe.subscriptions.cancel(stripeSubscriptionId);
      logger.warn(
        `Compensating: Canceled Stripe subscription ${stripeSubscriptionId} after claim transaction ${
          isRaceLoss ? "lost the claim race" : "failed unexpectedly"
        } for group ${groupId} by user ${userId}.`,
      );
    } catch (stripeCancelError) {
      logger.error(
        `Error canceling Stripe subscription ${stripeSubscriptionId} in compensation:`,
        stripeCancelError,
      );
    }
  }

  if (isRaceLoss) {
    throw txError;
  }
  logger.error(
    `Unexpected error in claim transaction for group ${groupId} by user ${userId}:`,
    txError,
  );
  throw new HttpsError(
    "internal",
    "Failed to process admin access request due to an unexpected error. Please try again.",
  );
}
```

No group-doc revert — there's nothing to revert, since nothing was written for a losing caller.

- [ ] **Step 4: Run the new tests to verify they pass**

Run: `cd functions && node_modules/.bin/jest src/__tests__/requestAdminAccessWithSubscription.test.ts -t "write-ordering"`
Expected: PASS.

- [ ] **Step 5: Delete Wave 7's now-obsolete describe blocks**

Delete the entire `describe("requestAdminAccessWithSubscription — compensating-cancellation on transaction failure", ...)` block and the entire `describe("requestAdminAccessWithSubscription — idempotency-key replay after compensation", ...)` block — these test the clobber-guard and idempotency-counter mechanisms this task removes. (Task 3 adds their replacements.)

- [ ] **Step 6: Run the full file's test suite**

Run: `cd functions && node_modules/.bin/jest src/__tests__/requestAdminAccessWithSubscription.test.ts`
Expected: PASS (the "payment method requirement" describe block's 3 pre-existing tests + this task's 2 new tests = 5).

- [ ] **Step 7: Typecheck and run the full functions suite**

Run: `cd functions && npx tsc --noEmit && node_modules/.bin/jest --passWithNoTests --forceExit`
Expected: both exit 0.

- [ ] **Step 8: Commit**

```bash
cd /Users/marcusklein/dev/recovery-platform
git add homegroups/functions/src/callable/requestAdminAccessWithSubscription.ts homegroups/functions/src/__tests__/requestAdminAccessWithSubscription.test.ts
git commit -m "fix(homegroups-functions): stop writing Stripe fields speculatively before the admin-claim transaction commits

Group-document Stripe fields (stripeCustomerId, stripeSubscriptionId,
subscriptionStatus, etc.) were written non-transactionally before the
Firestore transaction that decides who wins an admin claim. Two
genuinely concurrent legitimate claimants could have their writes
interleave, silently corrupting the actual winner's stripeSubscriptionId
with a losing caller's now-canceled value — breaking that admin's
Stripe webhook sync and reconciler visibility permanently, with no
automated repair path.

These fields now land only inside the transaction's own atomic
tx.update(), for whichever caller actually wins. A losing caller's
Stripe identifiers are never written anywhere, so there is nothing to
corrupt and nothing to revert on failure — this also deletes Wave 7's
clobber-guard revert logic, which existed only to reason about the
speculative writes removed here."
```

---

## Task 2: Final Live-Status Check Before the Grant Guard

**Files:**

- Modify: `functions/src/callable/requestAdminAccessWithSubscription.ts`
- Modify: `functions/src/__tests__/requestAdminAccessWithSubscription.test.ts`

**Interfaces:** No signature changes. Behavior change: immediately before the "grant admin only if active/trialing" guard, `subscriptionStatus` is re-derived from a live `stripe.subscriptions.retrieve()` call rather than trusted from whatever value is already held — except for the web-checkout path, which is exempted (see below).

**Context:** Read the design spec §2 for the full reasoning. Read the current file first for exact line numbers (post-Task-1).

- [ ] **Step 1: Write a failing test**

Add to a new describe block in the test file:

```typescript
describe("requestAdminAccessWithSubscription — final live-status re-check before granting admin", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    docStore = {};
    mockDb = buildMockDb();
    setupDefaults();
  });

  it("rejects using a live retrieve() result even when the create() response's own status looked valid (stale/replayed data)", async () => {
    // Simulate an idempotent replay: the create() call's own response
    // still shows "trialing" (a cached response from before some earlier
    // cancellation), but a live retrieve() reveals it's actually canceled.
    mockStripeSubscriptionsCreate.mockResolvedValue({
      id: "sub_test",
      status: "trialing", // stale — this is what create()'s cached response shows
      items: { data: [{ id: "si_test" }] },
      latest_invoice: { payment_intent: {} },
    });
    mockStripeSubscriptionsRetrieve.mockResolvedValue({
      status: "canceled", // the live truth
    });

    const request = makeRequest(USER_ID, {
      groupId: GROUP_ID,
      paymentMethodId: PAYMENT_METHOD_ID,
    });

    await expect(
      (requestAdminAccessWithSubscription as any)(request), // eslint-disable-line @typescript-eslint/no-explicit-any
    ).rejects.toMatchObject({ code: "failed-precondition" });

    // Confirm the guard's rejection message reflects the LIVE status, not
    // the stale create() response's status.
    await expect(
      (requestAdminAccessWithSubscription as any)(request), // eslint-disable-line @typescript-eslint/no-explicit-any
    ).rejects.toMatchObject({
      message: expect.stringContaining("canceled"),
    });
  });

  it("does NOT re-check live status for the web-checkout (subscriptionId-supplied) path — it already verified moments earlier", async () => {
    mockStripeSubscriptionsRetrieve.mockResolvedValue({
      id: "sub_already_created",
      status: "trialing",
      metadata: { groupId: GROUP_ID },
      customer: "cus_existing",
      items: { data: [{ id: "si_existing" }] },
    });

    const request = makeRequest(USER_ID, {
      groupId: GROUP_ID,
      subscriptionId: "sub_already_created",
    });

    await expect(
      (requestAdminAccessWithSubscription as any)(request), // eslint-disable-line @typescript-eslint/no-explicit-any
    ).resolves.toMatchObject({ success: true });

    // Exactly one retrieve() call — the verify-time one. No second call
    // right before the guard for this path.
    expect(mockStripeSubscriptionsRetrieve).toHaveBeenCalledTimes(1);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `cd functions && node_modules/.bin/jest src/__tests__/requestAdminAccessWithSubscription.test.ts -t "final live-status re-check"`
Expected: FAIL.

- [ ] **Step 3: Implement the fix**

Read the file first to confirm the exact current position of the "Guard: only grant admin if subscription is active or trialing" check. Add a flag to distinguish which branch ran (set near the top where `subscriptionId`-branch vs. create-new-branch is decided — e.g. `const usedWebCheckoutVerify = Boolean(subscriptionId);`), then immediately before the guard:

```typescript
if (!usedWebCheckoutVerify && stripeSubscriptionId) {
  subscriptionStatus = (
    await stripe.subscriptions.retrieve(stripeSubscriptionId)
  ).status;
}

// Guard: only grant admin if subscription is active or trialing
if (subscriptionStatus !== "active" && subscriptionStatus !== "trialing") {
  throw new HttpsError(
    "failed-precondition",
    `Cannot grant admin access: subscription status is '${subscriptionStatus}'. A valid subscription is required.`,
  );
}
```

- [ ] **Step 4: Run the new tests to verify they pass**

Run: `cd functions && node_modules/.bin/jest src/__tests__/requestAdminAccessWithSubscription.test.ts -t "final live-status re-check"`
Expected: PASS.

- [ ] **Step 5: Run the full file's test suite, then typecheck and the full functions suite**

Run: `cd functions && node_modules/.bin/jest src/__tests__/requestAdminAccessWithSubscription.test.ts && npx tsc --noEmit && node_modules/.bin/jest --passWithNoTests --forceExit`
Expected: all exit 0.

- [ ] **Step 6: Commit**

```bash
cd /Users/marcusklein/dev/recovery-platform
git add homegroups/functions/src/callable/requestAdminAccessWithSubscription.ts homegroups/functions/src/__tests__/requestAdminAccessWithSubscription.test.ts
git commit -m "fix(homegroups-functions): re-verify live Stripe subscription status before granting admin access

The grant guard previously trusted whatever subscriptionStatus value
was already in local scope — which, for the create-new-subscription
path, could be a stale idempotent replay of an earlier create() call
whose cached response predates a later cancellation. Now re-derives
status from a live retrieve() call immediately before the guard,
closing the general idempotency-replay-staleness question regardless
of which code path produced the value in hand. The web-checkout
(subscriptionId-supplied) path is exempted — it already did its own
fresh retrieve() moments earlier with no Stripe calls in between, so a
second one would be a pure-waste extra round-trip."
```

---

## Task 3: Ack-Ambiguity-Aware Compensation

**Files:**

- Modify: `functions/src/callable/requestAdminAccessWithSubscription.ts`
- Modify: `functions/src/__tests__/requestAdminAccessWithSubscription.test.ts`

**Interfaces:** No signature changes. The `catch (txError)` block (last touched in Task 1) is replaced with the full ack-ambiguity-aware version. New behavior: (a) a transaction that actually committed despite the client observing an error now returns success rather than throwing; (b) canceling the compensating subscription is confirmed via a live `retrieve()` rather than trusted from the `cancel()` call's own resolution; (c) a failure to re-read the group doc during compensation is handled gracefully (skip compensation, don't crash) rather than left unspecified.

**Context:** Read the design spec §3 in full — it explains why the ack-ambiguity check alone (no separate "concurrent owner" check) is sufficient, given this callable's `userId`-scoped idempotency keys. Read the current file first for exact line numbers (post-Task-2).

- [ ] **Step 1: Write failing tests**

Add to a new describe block:

```typescript
describe("requestAdminAccessWithSubscription — ack-ambiguity-aware compensation", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    docStore = {};
    mockDb = buildMockDb();
    setupDefaults();
  });

  it("treats a transaction that actually committed (despite a thrown error) as a win, not a failure", async () => {
    // Simulate the ack-ambiguity scenario: the transaction's write goes
    // through (docStore reflects it), but the client-observed call still
    // throws (e.g. the ack itself was lost to a network error).
    mockDb.runTransaction = (async (fn: (tx: any) => Promise<unknown>) => {
      const tx = {
        get: async (ref: any) => ref.get(),
        update: (ref: any, data: Record<string, unknown>) => {
          docStore[ref.path] = { ...(docStore[ref.path] || {}), ...data };
        },
      };
      await fn(tx); // the write actually happens
      throw new Error("DEADLINE_EXCEEDED: ack lost"); // but the client sees an error
    }) as typeof mockDb.runTransaction;

    const request = makeRequest(USER_ID, {
      groupId: GROUP_ID,
      paymentMethodId: PAYMENT_METHOD_ID,
    });

    await expect(
      (requestAdminAccessWithSubscription as any)(request), // eslint-disable-line @typescript-eslint/no-explicit-any
    ).resolves.toMatchObject({ success: true });

    // No compensation ran — the subscription this call created is still
    // live, because the claim genuinely succeeded.
    expect(mockStripeSubscriptionsCancel).not.toHaveBeenCalled();

    const finalGroup = docStore[`groups/${GROUP_ID}`] as Record<
      string,
      unknown
    >;
    expect(finalGroup.admins).toEqual([USER_ID]);
    expect(finalGroup.stripeSubscriptionId).toBe("sub_test");
  });

  it("a same-user concurrent double-request sharing one subscription object: the loser's ack-ambiguity check catches it, no cancellation attempted", async () => {
    // Both "concurrent" calls in this test use the SAME idempotency key
    // (subscriptionAttempt reads as 0 for both, since neither has
    // triggered a compensation), so the mock returns the identical
    // subscription object for both — this IS the scenario the design
    // spec's invariant argument is about.
    const originalRunTransaction = mockDb.runTransaction;
    let transactionAttempt = 0;
    mockDb.runTransaction = (async (fn: (tx: any) => Promise<unknown>) => {
      transactionAttempt++;
      if (transactionAttempt === 1) {
        // Simulate this exact user's OTHER concurrent request having
        // already committed with the shared subscription object.
        docStore[`groups/${GROUP_ID}`] = {
          ...docStore[`groups/${GROUP_ID}`],
          isClaimed: true,
          admins: [USER_ID], // same user, not a different one
          stripeSubscriptionId: "sub_test", // the SAME object this call also holds
          subscriptionStatus: "trialing",
        };
      }
      return originalRunTransaction(fn);
    }) as typeof mockDb.runTransaction;

    const request = makeRequest(USER_ID, {
      groupId: GROUP_ID,
      paymentMethodId: PAYMENT_METHOD_ID,
    });

    // This call's OWN transaction attempt fails (isClaimed already true),
    // but since admins already includes THIS SAME userId, the
    // ack-ambiguity check must catch it and return success.
    await expect(
      (requestAdminAccessWithSubscription as any)(request), // eslint-disable-line @typescript-eslint/no-explicit-any
    ).resolves.toMatchObject({ success: true });

    expect(mockStripeSubscriptionsCancel).not.toHaveBeenCalled();
  });

  it("cancel-ack-ambiguity: cancel() rejects but retrieve() confirms canceled — advances the attempt counter", async () => {
    mockDb.runTransaction = (async () => {
      throw new Error("DEADLINE_EXCEEDED: transaction timed out");
    }) as typeof mockDb.runTransaction;
    mockStripeSubscriptionsCancel.mockRejectedValue(
      new Error("Stripe API error: ack lost, but cancellation went through"),
    );
    mockStripeSubscriptionsRetrieve.mockResolvedValue({ status: "canceled" });

    const request = makeRequest(USER_ID, {
      groupId: GROUP_ID,
      paymentMethodId: PAYMENT_METHOD_ID,
    });

    await expect(
      (requestAdminAccessWithSubscription as any)(request), // eslint-disable-line @typescript-eslint/no-explicit-any
    ).rejects.toMatchObject({ code: "internal" });

    const afterFirstAttempt = docStore[`groups/${GROUP_ID}`] as Record<
      string,
      unknown
    >;
    expect(afterFirstAttempt.stripeSubscriptionAttempt).toBe(1);
  });

  it("cancel-ack-ambiguity: cancel() rejects and retrieve() shows still-active — does NOT advance the counter", async () => {
    mockDb.runTransaction = (async () => {
      throw new Error("DEADLINE_EXCEEDED: transaction timed out");
    }) as typeof mockDb.runTransaction;
    mockStripeSubscriptionsCancel.mockRejectedValue(
      new Error("Stripe API error: cancellation genuinely failed"),
    );
    mockStripeSubscriptionsRetrieve.mockResolvedValue({ status: "trialing" });

    const request = makeRequest(USER_ID, {
      groupId: GROUP_ID,
      paymentMethodId: PAYMENT_METHOD_ID,
    });

    await expect(
      (requestAdminAccessWithSubscription as any)(request), // eslint-disable-line @typescript-eslint/no-explicit-any
    ).rejects.toMatchObject({ code: "internal" });

    const afterFirstAttempt = docStore[`groups/${GROUP_ID}`] as Record<
      string,
      unknown
    >;
    expect(afterFirstAttempt.stripeSubscriptionAttempt).toBeUndefined();
  });

  it("a failed re-read during compensation skips cancellation entirely rather than throwing unhandled", async () => {
    mockDb.runTransaction = (async () => {
      throw new Error("DEADLINE_EXCEEDED: transaction timed out");
    }) as typeof mockDb.runTransaction;

    const originalBuildDocRef = docStore; // no-op reference to keep lint happy
    const groupRef = mockDb.collection("groups").doc(GROUP_ID) as unknown as {
      get: jest.Mock;
    };
    groupRef.get.mockRejectedValueOnce(
      new Error("Firestore unavailable during re-read"),
    );

    const request = makeRequest(USER_ID, {
      groupId: GROUP_ID,
      paymentMethodId: PAYMENT_METHOD_ID,
    });

    await expect(
      (requestAdminAccessWithSubscription as any)(request), // eslint-disable-line @typescript-eslint/no-explicit-any
    ).rejects.toMatchObject({ code: "internal" });

    expect(mockStripeSubscriptionsCancel).not.toHaveBeenCalled();
  });
});
```

Read the test file's actual current mock helper signatures first (`buildMockDb`, `buildDocRef`) to confirm the last test's approach for forcing a single `.get()` call to reject works against the real mock shape — adjust if the real helpers don't expose a `.get` jest mock the way this illustrative test assumes.

- [ ] **Step 2: Run the tests to verify they fail**

Run: `cd functions && node_modules/.bin/jest src/__tests__/requestAdminAccessWithSubscription.test.ts -t "ack-ambiguity-aware compensation"`
Expected: FAIL.

- [ ] **Step 3: Implement the fix**

Read the current file first. Replace the `catch (txError: any) { ... }` block (last touched in Task 1) with:

```typescript
} catch (txError: any) {
  const isRaceLoss =
    txError instanceof HttpsError && txError.code === "failed-precondition";

  let postTxData: any;
  let postTxReadFailed = false;
  try {
    postTxData = (await groupRef.get()).data();
  } catch (postTxReadError) {
    postTxReadFailed = true;
    logger.error(
      `Error re-reading group ${groupId} after transaction failure:`,
      postTxReadError,
    );
  }

  // Ack-ambiguity recovery: did THIS call's own transaction actually
  // commit, despite the client observing an error? Relies on this
  // callable's subscription idempotency key being scoped to `userId` —
  // that's what makes this single check sufficient even for a same-user
  // concurrent double-request sharing one Stripe subscription object; see
  // the design spec for the full argument. No separate "does someone else
  // own this subscription" check is needed.
  if (postTxData?.admins?.includes(userId)) {
    const updatedGroupSnap = await groupRef.get();
    return {
      success: true,
      groupId,
      subscriptionId: stripeSubscriptionId,
      subscriptionStatus,
      group: updatedGroupSnap.data(),
    };
  }

  if (subscriptionCreatedThisCall && stripeSubscriptionId && !postTxReadFailed) {
    let cancelConfirmed = false;
    try {
      await stripe.subscriptions.cancel(stripeSubscriptionId);
    } catch (stripeCancelError) {
      logger.error(
        `Error canceling Stripe subscription ${stripeSubscriptionId} in compensation:`,
        stripeCancelError,
      );
    }
    try {
      const currentState =
        await stripe.subscriptions.retrieve(stripeSubscriptionId);
      cancelConfirmed = currentState.status === "canceled";
    } catch (retrieveError) {
      logger.error(
        `Error verifying cancellation state for ${stripeSubscriptionId}:`,
        retrieveError,
      );
    }
    if (cancelConfirmed) {
      await groupRef.update({
        stripeSubscriptionAttempt: admin.firestore.FieldValue.increment(1),
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      });
    }
    logger.warn(
      `Compensating: Canceled Stripe subscription ${stripeSubscriptionId} after claim transaction ${
        isRaceLoss ? "lost the claim race" : "failed unexpectedly"
      } for group ${groupId} by user ${userId}. Confirmed canceled: ${cancelConfirmed}.`,
    );
  } else if (postTxReadFailed && subscriptionCreatedThisCall) {
    logger.warn(
      `Skipping compensation for subscription ${stripeSubscriptionId}: could not confirm ack-ambiguity state after a failed re-read — erring toward not canceling.`,
    );
  }

  if (isRaceLoss) {
    throw txError;
  }
  logger.error(
    `Unexpected error in claim transaction for group ${groupId} by user ${userId}:`,
    txError,
  );
  throw new HttpsError(
    "internal",
    "Failed to process admin access request due to an unexpected error. Please try again.",
  );
}
```

(The success-response construction is inlined here rather than extracted into a separate `buildAdminAccessResponse` helper — the design spec suggested a shared helper, but with only two call sites total in this file, read both after this change and decide whether extraction genuinely reduces duplication or just adds an indirection; inline is fine if the two are simple enough to eyeball as identical.)

- [ ] **Step 4: Run the new tests to verify they pass**

Run: `cd functions && node_modules/.bin/jest src/__tests__/requestAdminAccessWithSubscription.test.ts -t "ack-ambiguity-aware compensation"`
Expected: PASS.

- [ ] **Step 5: Run the full file's test suite, then typecheck and the full functions suite**

Run: `cd functions && node_modules/.bin/jest src/__tests__/requestAdminAccessWithSubscription.test.ts && npx tsc --noEmit && node_modules/.bin/jest --passWithNoTests --forceExit`
Expected: both exit 0.

- [ ] **Step 6: Commit**

```bash
cd /Users/marcusklein/dev/recovery-platform
git add homegroups/functions/src/callable/requestAdminAccessWithSubscription.ts homegroups/functions/src/__tests__/requestAdminAccessWithSubscription.test.ts
git commit -m "fix(homegroups-functions): recover from ack-ambiguous transaction/cancel failures instead of over-compensating

Two RPC ack-ambiguity gaps closed: (1) if the claim transaction
actually committed but the client only observed an error (a lost ack,
not a genuine failure), the callable now re-reads the group doc,
recognizes its own committed win, and returns success instead of
needlessly canceling a subscription that's now legitimately backing
the caller's own admin grant; (2) if the compensating cancel() call
itself fails ambiguously, the attempt counter now only advances when a
live retrieve() confirms the subscription is actually canceled, rather
than trusting cancel()'s own promise resolution. A failed re-read
during compensation is now handled explicitly (skip compensation, log,
continue) rather than left to propagate an unhandled error."
```

---

## Task 4: Web-Checkout Residual Case — New Distinct Error

**Files:**

- Modify: `functions/src/callable/requestAdminAccessWithSubscription.ts`
- Modify: `functions/src/__tests__/requestAdminAccessWithSubscription.test.ts`

**Interfaces:** No signature changes. A caller who used the web-checkout (`subscriptionId`-supplied) path and then loses the claim transaction now receives a distinct `failed-precondition` error (row 17 of the design spec's error contract) instead of the generic `internal` error, since their subscription is real and already billed — auto-canceling isn't safe and a blind retry won't help.

**Context:** Read the design spec's error contract row 17 for the exact proposed message. Read the current file first (post-Task-3) — the `catch (txError)` block currently only branches on `subscriptionCreatedThisCall` (true only for the create-new path); this task adds a distinct branch for the web-checkout path.

**Cross-functional note:** per the plan's Global Constraints, confirm a support process exists for this scenario before or alongside deploying this task.

- [ ] **Step 1: Write a failing test**

```typescript
describe("requestAdminAccessWithSubscription — web-checkout residual case (already-billed subscription, lost the claim)", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    docStore = {};
    mockDb = buildMockDb();
    setupDefaults();
  });

  it("gives a distinct support-contact error, not a generic internal error, when the web-checkout caller loses the claim", async () => {
    mockStripeSubscriptionsRetrieve.mockResolvedValue({
      id: "sub_already_created",
      status: "trialing",
      metadata: { groupId: GROUP_ID },
      customer: "cus_existing",
      items: { data: [{ id: "si_existing" }] },
    });
    mockDb.runTransaction = (async () => {
      throw new HttpsError(
        "failed-precondition",
        "This group has already been claimed by another admin.",
      );
    }) as typeof mockDb.runTransaction;

    const request = makeRequest(USER_ID, {
      groupId: GROUP_ID,
      subscriptionId: "sub_already_created",
    });

    await expect(
      (requestAdminAccessWithSubscription as any)(request), // eslint-disable-line @typescript-eslint/no-explicit-any
    ).rejects.toMatchObject({
      code: "failed-precondition",
      message: expect.stringContaining("Contact support"),
    });

    // The subscription is NOT auto-canceled — refund implications the
    // backend can't resolve unilaterally.
    expect(mockStripeSubscriptionsCancel).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd functions && node_modules/.bin/jest src/__tests__/requestAdminAccessWithSubscription.test.ts -t "web-checkout residual case"`
Expected: FAIL — currently this scenario falls through to the generic `internal` error.

- [ ] **Step 3: Implement the fix**

Read the current file first. In the `catch (txError: any)` block (from Task 3), before the final `if (isRaceLoss) { throw txError; } ... throw new HttpsError("internal", ...)`, add a branch for the web-checkout path (use the `usedWebCheckoutVerify` flag introduced in Task 2):

```typescript
if (usedWebCheckoutVerify && !postTxData?.admins?.includes(userId)) {
  throw new HttpsError(
    "failed-precondition",
    "Your payment was processed, but this group was claimed by someone else before your request completed. Contact support to arrange a refund or transfer.",
  );
}

if (isRaceLoss) {
  throw txError;
}
// ... existing internal-error throw ...
```

(Place this check after the ack-ambiguity recovery check from Task 3 — a web-checkout caller whose transaction actually committed should still hit the success-return path, not this new error.)

- [ ] **Step 4: Run the new test to verify it passes**

Run: `cd functions && node_modules/.bin/jest src/__tests__/requestAdminAccessWithSubscription.test.ts -t "web-checkout residual case"`
Expected: PASS.

- [ ] **Step 5: Run the full file's test suite, then typecheck and the full functions suite**

Run: `cd functions && node_modules/.bin/jest src/__tests__/requestAdminAccessWithSubscription.test.ts && npx tsc --noEmit && node_modules/.bin/jest --passWithNoTests --forceExit`
Expected: both exit 0.

- [ ] **Step 6: Commit**

```bash
cd /Users/marcusklein/dev/recovery-platform
git add homegroups/functions/src/callable/requestAdminAccessWithSubscription.ts homegroups/functions/src/__tests__/requestAdminAccessWithSubscription.test.ts
git commit -m "feat(homegroups-functions): give the web-checkout residual case its own error instead of a generic internal failure

A caller using the web-checkout (subscriptionId-supplied) path who
loses the claim transaction previously got the same generic 'internal,
please try again' error as any other unexpected failure — but their
subscription is real and already billed, so retrying doesn't help and
auto-canceling isn't safe (refund implications the backend can't
resolve unilaterally). This case now surfaces a distinct
failed-precondition error pointing the client toward support instead."
```

---

## Task 5: Documentation Update

**Files:**

- Modify: `homegroups/CLAUDE.md`

**Interfaces:** None — documentation only.

- [ ] **Step 1: Update the Stripe/Subscriptions section**

Read `homegroups/CLAUDE.md`'s "Critical Domain Rules > Stripe / Subscriptions" section first to match its existing tone/formatting. The `stripeSubscriptionAttempt` line (added in Wave 7) is still accurate as-is — no change needed there. Add one new bullet documenting the write-ordering pattern:

```markdown
- `requestAdminAccessWithSubscription`'s group-document Stripe fields (`stripeCustomerId`, `stripeSubscriptionId`, `subscriptionStatus`, etc.) are written exactly once, atomically, inside the same Firestore transaction that grants `admins`/`isClaimed` — never speculatively beforehand. This is deliberate: a losing concurrent caller's Stripe identifiers must never be observable anywhere, so there's nothing for a race to corrupt. See `docs/superpowers/specs/2026-07-13-admin-claim-write-ordering-redesign-design.md` for the full design.
```

- [ ] **Step 2: Commit**

```bash
cd /Users/marcusklein/dev/recovery-platform
git add homegroups/CLAUDE.md
git commit -m "docs(homegroups): document the admin-claim write-ordering pattern"
```

---

## Task 6: One-Off Audit Script for Pre-Existing Corrupted Groups

**Files:**

- Create: `functions/scripts/auditCorruptedGroupClaims.ts`

**Interfaces:** Standalone script, not part of the deployed Functions bundle — matches this repo's existing `scripts/` convention (one-off data scripts run manually with `ts-node`, not regular dev tooling).

**Context:** Per the design spec's Rollout section — this design prevents future occurrences of the write-ordering corruption but doesn't retroactively repair groups already affected. Run once, shortly after Tasks 1-4 deploy, to find any group already showing the corruption signature from before the fix shipped.

- [ ] **Step 1: Write the script**

Read `functions/src/utils/firebase.ts` first to match this codebase's existing Admin SDK initialization convention for standalone scripts (check for an existing similar script elsewhere in `functions/scripts/` or `homegroups/scripts/` for the exact init pattern used, since this directory's existing scripts are described as "run with `ts-node`" per `homegroups/CLAUDE.md`'s Root-Level Gotchas — read one existing script there first to copy its Admin SDK bootstrap exactly, rather than reinventing it).

```typescript
/**
 * One-off audit: find groups showing the write-ordering corruption
 * signature from before the Wave 8 fix — isClaimed true, admins
 * non-empty, but stripeSubscriptionId null. Read-only; does not
 * repair anything (this is a detection tool, not a migration).
 *
 * Run with: npx ts-node scripts/auditCorruptedGroupClaims.ts
 */
import * as admin from "firebase-admin";

// Match this file's Admin SDK init to whatever pattern the codebase's
// other one-off scripts already use — read one first and copy it exactly.
if (!admin.apps.length) {
  admin.initializeApp();
}

const db = admin.firestore();

async function main() {
  const snapshot = await db
    .collection("groups")
    .where("isClaimed", "==", true)
    .where("stripeSubscriptionId", "==", null)
    .get();

  if (snapshot.empty) {
    console.log("No groups found matching the corruption signature.");
    return;
  }

  console.log(
    `Found ${snapshot.size} group(s) with isClaimed=true, stripeSubscriptionId=null:`,
  );
  for (const doc of snapshot.docs) {
    const data = doc.data();
    console.log(
      `  ${doc.id}: admins=${JSON.stringify(data.admins)}, subscriptionStatus=${data.subscriptionStatus}`,
    );
  }
  console.log(
    "\nFor each group above, manually look up the admin's Stripe customer by userId/email and relink stripeSubscriptionId if a valid subscription exists.",
  );
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error("Audit script failed:", error);
    process.exit(1);
  });
```

Adjust the Firestore query if `admins` needs an explicit non-empty check beyond the two `where` clauses shown (Firestore doesn't support a native "array non-empty" query — if `isClaimed: true` + `stripeSubscriptionId: null` alone produces too many false positives, e.g. groups mid-flight in a legitimate first claim attempt, add a client-side filter on `data.admins?.length > 0` after fetching, or an additional composite index/query if the result set is large).

- [ ] **Step 2: Run it against the production or a staging project to confirm it executes cleanly**

Run: `cd functions && npx ts-node scripts/auditCorruptedGroupClaims.ts`
Expected: exits 0, prints either "No groups found" or a list of affected group IDs for manual follow-up. This step is exploratory/one-off — there's no pass/fail assertion beyond "the script runs without crashing and its query is well-formed."

- [ ] **Step 3: Commit**

```bash
cd /Users/marcusklein/dev/recovery-platform
git add homegroups/functions/scripts/auditCorruptedGroupClaims.ts
git commit -m "chore(homegroups-functions): add one-off audit script for pre-Wave-8 admin-claim data corruption"
```
