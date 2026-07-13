# Homegroups Wave 7 (Admin-Claim Compensating-Cancellation Race Fix) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Close a narrow race window in `requestAdminAccessWithSubscription.ts` where a Firestore transaction failure unrelated to a genuine claim-race loss causes the callable to cancel a freshly-created Stripe subscription without reverting the group document's now-stale Stripe fields, so that a client retry can silently trust stale "trialing"/"active" data and grant admin access with no valid subscription behind it.

**Architecture:** No new services or files. One targeted fix inside `requestAdminAccessWithSubscription.ts`'s existing `catch (txError)` block (currently lines 291-310): distinguish a genuine "already claimed" race loss (the deliberate `HttpsError` thrown inside the transaction callback) from any other transaction failure, and in both cases revert the group document's Stripe fields that this call wrote in step 2 — guarded so it never clobbers a legitimate concurrent winner's data.

**Tech Stack:** Firebase Cloud Functions v2 (TypeScript) + Stripe + Firestore transactions. Jest + ts-jest, following this file's existing hand-rolled Firestore/Stripe mock conventions (no new test infrastructure needed).

## Global Constraints

- All paths relative to `/Users/marcusklein/dev/recovery-platform/homegroups/functions/` unless stated otherwise.
- This is a single-file fix. Do not touch `createGroupWithSubscription.ts` or any other callable — its compensating-cancellation logic already correctly distinguishes expected `HttpsError`s from unexpected errors (see `catch (error: any) { if (error instanceof HttpsError) throw error; ... }` around line 336) and has no equivalent bug, since it creates a brand-new group document per call rather than contending for one shared document's `isClaimed` field.
- **Task 1** does not change the payment-method-required guard (`if (!paymentMethodId) throw new HttpsError("invalid-argument", ...)`, around line 208) or any Stripe API call parameters, idempotency keys, or the transaction's own claim logic (the `tx.get`/`tx.update` block, lines 274-289) — Task 1 is scoped strictly to the `catch (txError)` block that follows the transaction. **Task 2** (added after Task 1's independent review surfaced a residual gap) is explicitly allowed — and required — to touch the subscription idempotency key; that constraint applied only to Task 1.
- `npx tsc --noEmit` must stay clean and the full existing test suite must pass (baseline: 70 suites / 772 tests, confirmed passing before Task 1) in addition to each task's new regression tests.
- No new npm dependencies.

---

## File Structure

| File                                                                 | Change                                                                                                                                                                                                                                                                                                                                                                 |
| -------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `functions/src/callable/requestAdminAccessWithSubscription.ts`       | Task 1: rework the `catch (txError)` block to distinguish race-loss from unexpected errors and revert stale group-doc Stripe fields in both cases, guarded against clobbering a legitimate winner. Task 2: incorporate a persisted attempt counter into the subscription idempotency key so a compensated attempt's Stripe response can't be replayed by a fast retry. |
| `functions/src/__tests__/requestAdminAccessWithSubscription.test.ts` | Task 1: regression tests for both failure modes plus a retry-after-failure test proving stale data is no longer trusted. Task 2: regression tests proving a fast retry after compensation uses a fresh idempotency key and the attempt counter persists.                                                                                                               |

---

## Task 1: Fix the Compensating-Cancellation Race/Error Conflation

**Files:**

- Modify: `functions/src/callable/requestAdminAccessWithSubscription.ts`
- Modify: `functions/src/__tests__/requestAdminAccessWithSubscription.test.ts`

**Interfaces:** No signature changes — `requestAdminAccessWithSubscription`'s input/output types are unchanged. The behavior change is entirely inside error handling: on any transaction failure that isn't a genuine "already claimed" race loss, the callable now (a) still throws (as it always did), but as a generic `HttpsError("internal", ...)` instead of leaking the raw Firestore error, and (b) reverts `groups/{groupId}`'s `stripeSubscriptionId`, `stripeSubscriptionItemId`, `subscriptionStatus`, `stripePriceIdGroup`, `stripeProductIdGroup` fields back to unset if — and only if — the document still shows this call's own `stripeSubscriptionId` (i.e., a genuine race winner's later write is never overwritten).

**Context — read this before starting:** The current code (verify against the file's actual current line numbers, they may have shifted since this plan was written):

```typescript
try {
  await db.runTransaction(async (tx) => {
    const txGroupSnap = await tx.get(groupRef);
    const txGroupData = txGroupSnap.data();
    if (txGroupData?.isClaimed === true) {
      throw new HttpsError(
        "failed-precondition",
        "This group has already been claimed by another admin.",
      );
    }
    tx.update(groupRef, {
      isClaimed: true,
      admins: admin.firestore.FieldValue.arrayUnion(userId),
      pendingAdminRequests: admin.firestore.FieldValue.arrayRemove(userId),
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    });
  });
} catch (txError: any) {
  // Compensating action: if THIS call freshly created a Stripe
  // subscription but the transaction lost the claim race, cancel the
  // subscription so the losing claimant isn't billed. Mirrors the
  // rollback pattern in createGroupWithSubscription.ts.
  if (subscriptionCreatedThisCall && stripeSubscriptionId) {
    try {
      await stripe.subscriptions.cancel(stripeSubscriptionId);
      logger.warn(
        `Compensating: Canceled Stripe subscription ${stripeSubscriptionId} after claim transaction failed for group ${groupId} by user ${userId}.`,
      );
    } catch (stripeCancelError) {
      logger.error(
        `Error canceling Stripe subscription ${stripeSubscriptionId} in compensation:`,
        stripeCancelError,
      );
    }
  }
  throw txError;
}
```

**The bug this task closes:** Step 2 (a few dozen lines earlier in the same function) writes `stripeCustomerId`, `stripeSubscriptionId`, `subscriptionStatus: "trialing"` (or `"active"`) to `groups/{groupId}` **before** the transaction runs (Stripe calls can't happen inside a Firestore transaction). If the transaction then fails for a reason that is **not** a genuine "already claimed" race loss — e.g. a transient Firestore error, contention on the same document from an unrelated write, `DEADLINE_EXCEEDED` — the current code still cancels the Stripe subscription (correct), but does **not** revert the stale `stripeSubscriptionId`/`subscriptionStatus` fields already written to the group document. `isClaimed` was never set (the transaction never committed), so a client retry of the same call re-enters the function, sees `stripeSubscriptionId` already present and `subscriptionStatus === "trialing"` in Firestore, **skips** the "create a new subscription" branch entirely (that branch only fires when `!stripeSubscriptionId || subscriptionStatus === "canceled"/"incomplete"/"past_due"`), passes the "only grant admin if active/trialing" guard using this now-false stale data, and successfully claims the group — granting admin access backed by a Stripe subscription that was already canceled. This reaches the same outcome (admin granted with no valid subscription) the pre-existing payment-method-required gate exists to prevent, just via a different path.

`createGroupWithSubscription.ts`'s own compensating-cancellation block (around line 335-357) already distinguishes expected `HttpsError`s (propagated without compensation, since those represent legitimate client-facing rejections with no Stripe side effect to clean up) from unexpected errors (compensated + wrapped in a generic `"internal"` error) — that's the precedent this fix follows, adapted for this file's specific need: here, the expected `HttpsError` (`"already claimed"`) **does** need compensation (a real subscription was created and needs canceling), so the distinction is used differently — to decide whether to also revert group-doc fields and how to shape the rethrown error, not whether to compensate at all.

- [ ] **Step 1: Write failing regression tests**

Read `functions/src/__tests__/requestAdminAccessWithSubscription.test.ts` first to confirm its current mock structure exactly matches what's shown below (the `buildMockDb()`/`docStore`/`mockStripeSubscriptionsCancel` conventions) — it may have shifted slightly since this plan was written. Add a new `describe` block:

```typescript
describe("requestAdminAccessWithSubscription — compensating-cancellation on transaction failure", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    docStore = {};
    mockDb = buildMockDb();
    setupDefaults();
  });

  it("on a genuine already-claimed race loss: cancels the subscription, reverts the stale group-doc Stripe fields, and rethrows the original error", async () => {
    // Force the transaction to behave as if another caller claimed the
    // group first, by overriding runTransaction to simulate the real
    // isClaimed-check-then-throw behavior after the group doc has been
    // externally marked claimed between this call's step 2 write and the
    // transaction running.
    const originalRunTransaction = mockDb.runTransaction;
    let transactionAttempt = 0;
    mockDb.runTransaction = (async (fn: (tx: any) => Promise<unknown>) => {
      transactionAttempt++;
      if (transactionAttempt === 1) {
        // Simulate a concurrent winner claiming the group with its own
        // Stripe subscription just before this call's transaction reads it.
        docStore[`groups/${GROUP_ID}`] = {
          ...docStore[`groups/${GROUP_ID}`],
          isClaimed: true,
          admins: ["winner-user"],
          stripeSubscriptionId: "sub_winner", // winner's own write already landed
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

    // This call's freshly-created subscription was canceled.
    expect(mockStripeSubscriptionsCancel).toHaveBeenCalledWith("sub_test");

    // The winner's Stripe fields were NOT clobbered — the doc still shows
    // the winner's subscription, not reverted/nulled.
    const finalGroup = docStore[`groups/${GROUP_ID}`] as Record<
      string,
      unknown
    >;
    expect(finalGroup.stripeSubscriptionId).toBe("sub_winner");
    expect(finalGroup.admins).toEqual(["winner-user"]);
  });

  it("on an unexpected (non-race) transaction failure: cancels the subscription, reverts THIS call's own stale group-doc Stripe fields, and throws a generic internal error instead of leaking the raw error", async () => {
    mockDb.runTransaction = (async () => {
      throw new Error("DEADLINE_EXCEEDED: transaction timed out");
    }) as typeof mockDb.runTransaction;

    mockStripeSubscriptionsCancel.mockResolvedValue({});

    const request = makeRequest(USER_ID, {
      groupId: GROUP_ID,
      paymentMethodId: PAYMENT_METHOD_ID,
    });

    await expect(
      (requestAdminAccessWithSubscription as any)(request), // eslint-disable-line @typescript-eslint/no-explicit-any
    ).rejects.toMatchObject({ code: "internal" });

    expect(mockStripeSubscriptionsCancel).toHaveBeenCalledWith("sub_test");

    // This call's own stale Stripe fields were reverted, not left trusting
    // a subscription that no longer exists.
    const finalGroup = docStore[`groups/${GROUP_ID}`] as Record<
      string,
      unknown
    >;
    expect(finalGroup.stripeSubscriptionId).toBeNull();
    expect(finalGroup.subscriptionStatus).toBeNull();
  });

  it("retry after an unexpected transaction failure creates a fresh subscription rather than trusting stale data", async () => {
    mockDb.runTransaction = (async () => {
      throw new Error("DEADLINE_EXCEEDED: transaction timed out");
    }) as typeof mockDb.runTransaction;
    mockStripeSubscriptionsCancel.mockResolvedValue({});

    const request = makeRequest(USER_ID, {
      groupId: GROUP_ID,
      paymentMethodId: PAYMENT_METHOD_ID,
    });

    await expect(
      (requestAdminAccessWithSubscription as any)(request), // eslint-disable-line @typescript-eslint/no-explicit-any
    ).rejects.toMatchObject({ code: "internal" });

    // Now let the retry succeed normally.
    mockDb.runTransaction = buildMockDb().runTransaction;
    mockStripeSubscriptionsCreate.mockResolvedValue({
      id: "sub_retry",
      status: "trialing",
      items: { data: [{ id: "si_retry" }] },
      latest_invoice: { payment_intent: {} },
    });

    const retryResult = await (requestAdminAccessWithSubscription as any)(
      // eslint-disable-line @typescript-eslint/no-explicit-any
      request,
    );

    expect(retryResult).toMatchObject({ success: true });
    // A NEW subscription was created on retry — proves the retry did not
    // treat the reverted (canceled) subscription as still valid.
    expect(mockStripeSubscriptionsCreate).toHaveBeenCalledTimes(2); // once in the failed attempt, once on retry
  });
});
```

Adapt the exact mock-override mechanism (`mockDb.runTransaction = ...`) to whatever this test file's actual current `buildMockDb()`/`mockDb` structure supports — read the file first and adjust if the real shape differs from what's shown above (the plan's research captured it accurately at write time, but re-verify before finalizing).

- [ ] **Step 2: Run the tests to verify they fail**

Run: `cd functions && npx jest src/__tests__/requestAdminAccessWithSubscription.test.ts -t "compensating-cancellation on transaction failure"`
Expected: FAIL — the current code doesn't distinguish error types, doesn't revert stale fields, and rethrows the raw `txError` instead of wrapping unexpected errors as `"internal"`.

- [ ] **Step 3: Implement the fix**

Read the file first to confirm current exact line numbers for the `catch (txError)` block (approximately lines 291-310, may have shifted). Replace it with:

```typescript
      } catch (txError: any) {
        const isRaceLoss =
          txError instanceof HttpsError &&
          txError.code === "failed-precondition";

        // Compensating action: if THIS call freshly created a Stripe
        // subscription, cancel it regardless of whether the transaction
        // failed due to a genuine claim-race loss or an unrelated error —
        // in both cases we don't know the admin grant went through, so an
        // orphaned live subscription is the wrong default. Mirrors the
        // rollback pattern in createGroupWithSubscription.ts.
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

          // Revert the group doc's Stripe fields THIS call wrote in step 2
          // — but only if the doc still points at this call's own
          // subscription. A genuine race winner's later write must never be
          // clobbered by the loser's cleanup; comparing against the current
          // stripeSubscriptionId value is the guard.
          try {
            const staleSnap = await groupRef.get();
            const staleData = staleSnap.data();
            if (staleData?.stripeSubscriptionId === stripeSubscriptionId) {
              await groupRef.update({
                stripeSubscriptionId: null,
                stripeSubscriptionItemId: null,
                subscriptionStatus: null,
                stripePriceIdGroup: null,
                stripeProductIdGroup: null,
                updatedAt: admin.firestore.FieldValue.serverTimestamp(),
              });
            }
          } catch (revertError) {
            logger.error(
              `Error reverting stale group doc Stripe fields after compensation for group ${groupId}:`,
              revertError,
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

- [ ] **Step 4: Run the new tests to verify they pass**

Run: `cd functions && npx jest src/__tests__/requestAdminAccessWithSubscription.test.ts -t "compensating-cancellation on transaction failure"`
Expected: PASS (all 3 new tests).

- [ ] **Step 5: Run the file's full existing test suite to confirm no regression**

Run: `cd functions && npx jest src/__tests__/requestAdminAccessWithSubscription.test.ts`
Expected: PASS — all pre-existing tests (payment-method-required, successful grant, subscriptionId-already-supplied path) plus the 3 new ones.

- [ ] **Step 6: Typecheck and run the full functions suite**

Run: `cd functions && npx tsc --noEmit && npm test -- --passWithNoTests --forceExit`
Expected: both exit 0, full suite green (baseline 70 suites / 772 tests + 3 new tests = 775).

- [ ] **Step 7: Commit**

```bash
cd /Users/marcusklein/dev/recovery-platform
git add homegroups/functions/src/callable/requestAdminAccessWithSubscription.ts homegroups/functions/src/__tests__/requestAdminAccessWithSubscription.test.ts
git commit -m "fix(homegroups-functions): stop trusting stale Stripe fields after a non-race transaction failure in requestAdminAccessWithSubscription

A Firestore transaction failure that isn't a genuine claim-race loss
(e.g. a transient error) canceled the freshly-created Stripe
subscription but left the group doc's stripeSubscriptionId/
subscriptionStatus fields stale from step 2's earlier write. A client
retry would then skip re-creating a subscription and grant admin
using that stale trialing/active status, reaching the same
free-admin outcome the payment-method-required gate exists to
prevent, via a different path. Now the catch block distinguishes the
two failure modes and reverts the group doc's own stale fields
(guarded against clobbering a genuine concurrent winner's data) in
both cases."
```

---

## Task 2: Prevent Idempotency-Key Replay From Re-Granting Admin on a Canceled Subscription

**Files:**

- Modify: `functions/src/callable/requestAdminAccessWithSubscription.ts`
- Modify: `functions/src/__tests__/requestAdminAccessWithSubscription.test.ts`

**Interfaces:** No signature changes. Adds one new group-document field, `stripeSubscriptionAttempt` (`number`, defaults to absent/0), read at the top of the Stripe-customer/subscription section and persisted by the Task 1 revert block. The `stripe.subscriptions.create` idempotency key changes from `` `req-admin-${userId}-${groupId}-subscription` `` to `` `req-admin-${userId}-${groupId}-subscription-${subscriptionAttempt}` ``.

**Context — read this before starting, it changes an assumption Task 1 made:** Task 1's independent final review found that Task 1 closes the stale-Firestore-data problem, but a **fast** client retry (within Stripe's 24-hour idempotency window) of a call whose subscription was just compensated (canceled) hits a different failure mode: `stripe.subscriptions.create` is called again with the **exact same deterministic idempotency key** used by the failed attempt. Stripe does not re-execute the call — it replays the **original cached response**, i.e. the now-canceled `sub_loser` with its stale `status: "trialing"`. That stale-but-replayed status then passes the "grant admin only if active/trialing" guard again, reaching the same free-admin-on-invalid-subscription outcome Task 1 was built to prevent, just via Stripe's own idempotency semantics instead of stale Firestore data.

The fix: make the idempotency key vary across attempts **only when a prior attempt for this same user+group was actually compensated** (canceled). A normal client-side network retry of the _same_ logical call (no compensation happened, e.g. the client never received a successful response) must keep hitting the _same_ idempotency key — that's the whole point of idempotency keys, to prevent double-charging when a client retries its own unanswered request. So: persist a `stripeSubscriptionAttempt` counter on the group document, only incrementing it inside Task 1's revert block (which only runs after a real compensation event), and fold the current counter value into the idempotency key. Read the file first to confirm current exact line numbers — Task 1 will have already been committed, so these will differ from Task 1's own line references.

- [ ] **Step 1: Write failing regression tests**

Read `functions/src/__tests__/requestAdminAccessWithSubscription.test.ts` first — Task 1 will have already added a `describe("requestAdminAccessWithSubscription — compensating-cancellation on transaction failure", ...)` block; add a new block after it:

```typescript
describe("requestAdminAccessWithSubscription — idempotency-key replay after compensation", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    docStore = {};
    mockDb = buildMockDb();
    setupDefaults();
  });

  it("uses a different Stripe idempotency key on a retry after the prior attempt's subscription was compensated", async () => {
    // First attempt: transaction fails for a non-race reason, subscription
    // gets created then compensated (canceled + reverted) per Task 1.
    mockDb.runTransaction = (async () => {
      throw new Error("DEADLINE_EXCEEDED: transaction timed out");
    }) as typeof mockDb.runTransaction;
    mockStripeSubscriptionsCancel.mockResolvedValue({});

    const request = makeRequest(USER_ID, {
      groupId: GROUP_ID,
      paymentMethodId: PAYMENT_METHOD_ID,
    });

    await expect(
      (requestAdminAccessWithSubscription as any)(request), // eslint-disable-line @typescript-eslint/no-explicit-any
    ).rejects.toMatchObject({ code: "internal" });

    const firstCallArgs = mockStripeSubscriptionsCreate.mock.calls[0];
    const firstIdempotencyKey = firstCallArgs[1].idempotencyKey;

    // The attempt counter must have persisted to the group doc so the next
    // call reads a different value.
    const afterFirstAttempt = docStore[`groups/${GROUP_ID}`] as Record<
      string,
      unknown
    >;
    expect(afterFirstAttempt.stripeSubscriptionAttempt).toBe(1);

    // Retry: let the transaction succeed this time.
    mockDb.runTransaction = buildMockDb().runTransaction;
    mockStripeSubscriptionsCreate.mockResolvedValue({
      id: "sub_retry",
      status: "trialing",
      items: { data: [{ id: "si_retry" }] },
      latest_invoice: { payment_intent: {} },
    });

    const retryResult = await (requestAdminAccessWithSubscription as any)(
      // eslint-disable-line @typescript-eslint/no-explicit-any
      request,
    );

    expect(retryResult).toMatchObject({ success: true });

    const secondCallArgs = mockStripeSubscriptionsCreate.mock.calls[1];
    const secondIdempotencyKey = secondCallArgs[1].idempotencyKey;

    // The critical assertion: different idempotency keys mean Stripe will
    // NOT replay the first (canceled) subscription's cached response.
    expect(secondIdempotencyKey).not.toBe(firstIdempotencyKey);
  });

  it("reuses the same idempotency key across calls when no compensation has occurred (preserves legitimate client-retry dedup)", async () => {
    // No transaction failure this time — a plain successful call followed
    // by a second call before anything was ever compensated should still
    // read attempt=0 both times (nothing incremented it).
    const request = makeRequest(USER_ID, {
      groupId: GROUP_ID,
      paymentMethodId: PAYMENT_METHOD_ID,
    });

    await (requestAdminAccessWithSubscription as any)(request); // eslint-disable-line @typescript-eslint/no-explicit-any

    const firstCallArgs = mockStripeSubscriptionsCreate.mock.calls[0];
    const firstIdempotencyKey = firstCallArgs[1].idempotencyKey;

    expect(firstIdempotencyKey).toBe(
      `req-admin-${USER_ID}-${GROUP_ID}-subscription-0`,
    );
  });
});
```

Adapt the exact mock-override mechanism to whatever this test file's actual current shape is after Task 1's changes — read the file first.

- [ ] **Step 2: Run the tests to verify they fail**

Run: `cd functions && npx jest src/__tests__/requestAdminAccessWithSubscription.test.ts -t "idempotency-key replay after compensation"`
Expected: FAIL — the idempotency key doesn't yet vary, and `stripeSubscriptionAttempt` isn't yet persisted.

- [ ] **Step 3: Implement the fix**

Read the file first to confirm current exact line numbers (post-Task-1). Two changes:

**3a. Read the attempt counter** where `stripeCustomerId`/`stripeSubscriptionId`/`subscriptionStatus` are first destructured from `groupData` (Task 1 left this block untouched, so it's still near the top of the `try` block):

```typescript
let stripeCustomerId: string | undefined = groupData.stripeCustomerId;
let stripeSubscriptionId: string | undefined = groupData.stripeSubscriptionId;
let subscriptionStatus: string | undefined = groupData.subscriptionStatus;
// Fed into the subscription's idempotency key below. Only incremented
// by the compensation/revert block after a real cancellation — a
// plain client-side retry of an unanswered call (no compensation yet)
// must keep hitting the SAME idempotency key so Stripe still dedupes
// it; only a retry that follows an actual cancellation should mint a
// fresh key so Stripe creates a genuinely new subscription instead of
// replaying the canceled one's cached response.
const subscriptionAttempt: number = groupData.stripeSubscriptionAttempt || 0;
```

**3b. Fold it into the idempotency key** at the `stripe.subscriptions.create` call:

```typescript
            { idempotencyKey: `req-admin-${userId}-${groupId}-subscription-${subscriptionAttempt}` },
```

(This replaces the existing `{ idempotencyKey: \`req-admin-${userId}-${groupId}-subscription\` }`— do NOT touch the customer-creation idempotency key a few dozen lines earlier,`req-admin-${userId}-${groupId}-customer`; reusing the same Stripe customer across attempts is correct and desired, only the subscription key needs to vary.)

**3c. Increment it inside Task 1's revert block.** Find the `groupRef.update({...})` call inside the `if (staleData?.stripeSubscriptionId === stripeSubscriptionId) { ... }` guard (added by Task 1) and add one field:

```typescript
await groupRef.update({
  stripeSubscriptionId: null,
  stripeSubscriptionItemId: null,
  subscriptionStatus: null,
  stripePriceIdGroup: null,
  stripeProductIdGroup: null,
  stripeSubscriptionAttempt: admin.firestore.FieldValue.increment(1),
  updatedAt: admin.firestore.FieldValue.serverTimestamp(),
});
```

(`FieldValue.increment(1)` treats a missing field as `0` and sets it to `1` — no separate "does this field exist yet" check is needed.)

- [ ] **Step 4: Run the new tests to verify they pass**

Run: `cd functions && npx jest src/__tests__/requestAdminAccessWithSubscription.test.ts -t "idempotency-key replay after compensation"`
Expected: PASS (both new tests).

- [ ] **Step 5: Run the file's full test suite (Task 1's tests + Task 2's tests + pre-existing) to confirm no regression**

Run: `cd functions && npx jest src/__tests__/requestAdminAccessWithSubscription.test.ts`
Expected: PASS — all tests (pre-existing + Task 1's 3 + Task 2's 2 = 8 in this file).

- [ ] **Step 6: Typecheck and run the full functions suite**

Run: `cd functions && npx tsc --noEmit && npm test -- --passWithNoTests --forceExit`
Expected: both exit 0, full suite green (baseline 772 + Task 1's 3 + Task 2's 2 = 777).

- [ ] **Step 7: Update Task 1's test 3 comment**

The final whole-branch review of Task 1 flagged that test 3 (`retry after an unexpected transaction failure creates a fresh subscription rather than trusting stale data`)'s comment overstated what it proved before this task's fix existed — it claimed the retry "did not treat the reverted (canceled) subscription as still valid," which was only true at the Firestore-staleness level, not the Stripe-idempotency-replay level this task also closes. Now that Task 2 actually closes the idempotency-replay gap too, re-read that test's comment and confirm/update it to accurately reflect the now-complete picture (the retry both re-enters the create branch AND gets a genuinely fresh Stripe response, not a replayed one).

- [ ] **Step 8: Commit**

```bash
cd /Users/marcusklein/dev/recovery-platform
git add homegroups/functions/src/callable/requestAdminAccessWithSubscription.ts homegroups/functions/src/__tests__/requestAdminAccessWithSubscription.test.ts
git commit -m "fix(homegroups-functions): prevent Stripe idempotency-key replay from re-granting admin after a compensated subscription attempt

Task 1 closed the stale-Firestore-data half of the retry-after-failure
bug, but a fast retry (within Stripe's 24h idempotency window) of a
compensated attempt still replayed the canceled subscription's cached
Stripe response via the deterministic idempotency key, reaching the
same free-admin outcome through a different path. The subscription
idempotency key now includes a persisted per-group attempt counter
that only increments when a real compensation (cancellation) occurs
— a plain client-side retry of an unanswered call still dedupes
correctly, but a retry following an actual cancellation now creates
a genuinely new Stripe subscription instead of replaying the old
one's stale trialing status."
```

---

## Deferred Work (explicitly out of scope for this task)

- The broader question of whether two truly concurrent legitimate claim attempts (two different users, both racing to claim the same unclaimed group with their own Stripe subscriptions) can have their step-2 writes interleave in a way that corrupts the eventual winner's Firestore Stripe fields is a more foundational restructuring question (e.g. moving the Stripe customer/subscription creation inside the transaction's optimistic-retry envelope, or deferring the Firestore write of `stripeSubscriptionId`/`subscriptionStatus` until after the transaction commits) — flagged for a human decision on priority, not addressed here. This task's fix guards against this specific scenario clobbering the winner (see Step 3's `staleData?.stripeSubscriptionId === stripeSubscriptionId` check) but does not redesign the write ordering.
- `handleSubscriptionDeleted` in `functions/src/utils/stripeUtils.ts` (the `customer.subscription.deleted` webhook handler) already exists as an eventual-consistency backstop for stale subscription data and is unaffected by this fix — it remains a useful second layer of defense, not a substitute for this task's synchronous revert.
