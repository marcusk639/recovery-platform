# Admin-Claim Write-Ordering Redesign — Design Spec

**Status:** Approved design, not yet planned/implemented. Next step: `superpowers:writing-plans` against this spec.

**Origin:** `docs/reviews/homegroups-admin-claim-nontransactional-write-race-2026-07-12.md` — an iterative-review pass (security + payment-integration reviewers) found, independently and by different reasoning paths, that `requestAdminAccessWithSubscription.ts` writes Stripe fields to the `groups/{groupId}` document non-transactionally _before_ the Firestore transaction that decides who wins an admin claim. Two genuinely concurrent legitimate claimants (or a client double-tap) can have their writes interleave in a way that permanently corrupts the actual winner's `stripeSubscriptionId`, breaking that admin's webhook sync and reconciler visibility with no automated repair path. This spec also folds in a second, related finding from the same review: RPC ack-ambiguity (a client-observed failure from Stripe or Firestore doesn't guarantee the operation didn't actually succeed server-side), which the review flagged as a distinct but compounding risk in this same file's error handling.

**File:** `homegroups/functions/src/callable/requestAdminAccessWithSubscription.ts`

**Priority:** Important, not launch-blocking. Scheduled as its own wave once this spec is approved and planned.

**Dependency:** This spec assumes Wave 6's `requireAuth` migration (currently open as PR #46, unmerged as of this writing) has landed by the time this work is implemented — line references below to the auth guard assume `const uid = requireAuth(request);` rather than the raw `if (!userId) throw ...` check still present in `main` today. If PR #46 hasn't merged yet when this is implemented, adapt the guard reference accordingly; nothing else in this spec depends on that migration.

---

## Problem Summary

`requestAdminAccessWithSubscription` does Stripe work (create/verify customer and subscription) and then writes the resulting Stripe identifiers to the group document via plain `groupRef.update()` calls — **before** running the Firestore transaction that atomically decides who actually wins the admin claim (`isClaimed` / `admins`). These writes are not ordered relative to a concurrent caller's own writes, so a losing caller's write can land _after_ the winner's transaction has already committed, silently overwriting the winner's `stripeSubscriptionId` with the loser's own (now-canceled) value. Wave 7 (already merged) added compensating cleanup for the _losing_ caller's own write, but that cleanup has no way to distinguish "this is genuinely my own stale write" from "this happens to match my subscription ID because I overwrote the actual winner's field" — the guard it uses (`staleData.stripeSubscriptionId === <my own ID>`) only reflects write-order, not claim-transaction outcome.

Separately, the same review found that this file's error handling generally assumes "the client observed an error" implies "the operation didn't happen" — which isn't guaranteed for either Stripe API calls or Firestore transaction commits. Under specific network-timing conditions this can independently produce a free-admin-on-invalid-subscription outcome or an incorrectly-compensated (and thus needlessly recreated) subscription.

Full technical detail, concrete scenario walkthroughs, and downstream impact (webhook lookups in `stripeUtils.ts`, `scheduledSubscriptionReconciler.ts` blindness) are in the findings doc linked above — this spec doesn't repeat that analysis, only the design that resolves it.

---

## Design

### 1. Write-ordering fix

Stop writing `stripeCustomerId` / `stripeSubscriptionId` / `subscriptionStatus` / `stripeSubscriptionItemId` / `stripePriceIdGroup` / `stripeProductIdGroup` to the group document speculatively, in either the "create new subscription" branch or the "verify existing `subscriptionId`" (web-checkout) branch. These values stay local variables — exactly as they are today — all the way through to a single assembly point immediately before the claim transaction. Build one `claimStripeFields` object there (from whichever branch actually ran), omitting genuinely-absent fields rather than setting them to `undefined` (Firestore rejects literal `undefined`). The transaction's `tx.update()` becomes:

```ts
tx.update(groupRef, {
  isClaimed: true,
  admins: admin.firestore.FieldValue.arrayUnion(userId),
  pendingAdminRequests: admin.firestore.FieldValue.arrayRemove(userId),
  updatedAt: admin.firestore.FieldValue.serverTimestamp(),
  ...claimStripeFields,
});
```

One atomic write; no additional Firestore round-trip. A losing caller's Stripe identifiers are never written anywhere — there is nothing to corrupt and, for the create-new path, nothing to revert on failure. This deletes Wave 7's entire clobber-guard mechanism (the `staleSnap`/`staleData.stripeSubscriptionId === stripeSubscriptionId` check and the conditional revert `groupRef.update()`) — it existed specifically to reason about speculative writes that no longer happen.

Compensation on failure shrinks to: cancel the Stripe subscription if this call created one (`subscriptionCreatedThisCall && stripeSubscriptionId`, unchanged from today), decide via live re-verification (see §3) whether to advance the retry-safe attempt counter, rethrow. No group-doc revert step.

**Web-checkout (`subscriptionId` supplied) path — new failure handling, previously absent.** Today this path has zero compensation logic (`subscriptionCreatedThisCall` is never set `true` here, so the whole compensation block is skipped even on failure). Under this design, if this path's caller loses the claim transaction, they hold a real, already-billed Stripe subscription with no group attached. Auto-canceling isn't safe (potential refund implications the backend can't resolve unilaterally) and a blind retry won't help (the subscription is real and valid, the _group_ is what's unavailable). This case gets its own distinct error — see §4, item 6.

### 2. Final live-status check (closes the "was this a stale/replayed value?" question generally)

Immediately before the "grant admin only if active/trialing" guard, replace trust in whatever `subscriptionStatus` value is currently held (from a fresh `create()`, an idempotent replay of a prior `create()`, or the web-checkout `retrieve()`) with one authoritative re-check:

```ts
subscriptionStatus = (await stripe.subscriptions.retrieve(stripeSubscriptionId))
  .status;
```

This is the single choke point that makes acting on stale data impossible regardless of which code path produced the value in hand — it closes both the general idempotency-replay-staleness question and (per §3) the cancel-ack-ambiguity path, in one place, as the review's payment-integration pass recommended.

### 3. Cancel-ack-ambiguity fix

When compensating (cancel the subscription this call created), don't infer success/failure purely from whether the `cancel()` promise resolves. After the `cancel()` call (whether it resolved or threw), re-verify actual state:

```ts
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
```

Advance the `stripeSubscriptionAttempt` counter (still via `FieldValue.increment(1)`, still safe under concurrent access since increments commute) only when `cancelConfirmed === true` — i.e., driven by Stripe's actual reported state, not by whether the `cancel()` call itself appeared to succeed. If the cancel didn't actually happen (confirmed via retrieve), the counter stays put and a retry correctly reuses the same idempotency key, replaying the still-valid original subscription rather than minting a wasteful second one.

### 4. Transaction-ack-ambiguity fix

In the transaction's `catch` block, before running any compensation, re-read the group document and check whether `admins` already includes this caller's own `userId`:

```ts
catch (txError: any) {
  const postTxSnap = await groupRef.get();
  const postTxData = postTxSnap.data();
  if (postTxData?.admins?.includes(userId)) {
    // The transaction actually committed; the client only failed to receive
    // the acknowledgment. Treat as a win, not a failure — do NOT compensate.
    return {
      success: true,
      groupId,
      subscriptionId: stripeSubscriptionId,
      subscriptionStatus,
      group: postTxData,
    };
  }
  // ... existing race-loss / unexpected-error handling, now compensation-only
  // (no revert step, per §1) ...
}
```

Extract the success-response construction (currently only built once, at the end of the happy path) into a small shared helper so this recovery branch and the normal-completion return use identical logic rather than duplicating the response shape.

---

## Client-Facing Error Contract (authoritative reference for the downstream UX spec)

This table is the complete, precise input for whoever designs the mobile/web UI changes. Every code/message pair below is either unchanged from the current shipped behavior or explicitly marked as new/changed.

| #   | Trigger                                                                                                 | Code                             | Message (current or proposed)                                                                                                                                                               | Status                                                                                                                                                                          |
| --- | ------------------------------------------------------------------------------------------------------- | -------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | Not authenticated                                                                                       | `unauthenticated`                | "Must be authenticated." (post-PR-#46)                                                                                                                                                      | Unchanged                                                                                                                                                                       |
| 2   | Missing `groupId`                                                                                       | `invalid-argument`               | "Group ID is required."                                                                                                                                                                     | Unchanged                                                                                                                                                                       |
| 3   | Stripe product not configured (ops/config error)                                                        | `failed-precondition`            | "Stripe product ID for groups is not configured."                                                                                                                                           | Unchanged                                                                                                                                                                       |
| 4   | Group doesn't exist                                                                                     | `not-found`                      | "Group not found."                                                                                                                                                                          | Unchanged                                                                                                                                                                       |
| 5   | Caller already an admin                                                                                 | `already-exists`                 | "User is already an admin of this group."                                                                                                                                                   | Unchanged                                                                                                                                                                       |
| 6   | Group already claimed (pre-check, before any Stripe work)                                               | `failed-precondition`            | "This group has already been claimed by another admin."                                                                                                                                     | Unchanged                                                                                                                                                                       |
| 7   | Caller already has a pending admin request                                                              | `already-exists`                 | "User already has a pending admin request for this group."                                                                                                                                  | Unchanged                                                                                                                                                                       |
| 8   | Web-checkout `subscriptionId` belongs to a different group                                              | `permission-denied`              | "Subscription does not belong to this group."                                                                                                                                               | Unchanged                                                                                                                                                                       |
| 9   | Web-checkout `subscriptionId` not active/trialing (checked at verify time)                              | `failed-precondition`            | "Subscription is not active. Status: {status}"                                                                                                                                              | Unchanged                                                                                                                                                                       |
| 10  | Web-checkout `subscriptionId` invalid/lookup failed                                                     | `invalid-argument`               | "Invalid or inactive subscription ID provided."                                                                                                                                             | Unchanged                                                                                                                                                                       |
| 11  | No email available for new Stripe customer                                                              | `failed-precondition`            | "User email is required to create a Stripe customer."                                                                                                                                       | Unchanged                                                                                                                                                                       |
| 12  | New subscription requested with no payment method                                                       | `invalid-argument`               | "A payment method is required to request admin access for this group."                                                                                                                      | Unchanged (pre-existing security fix, untouched by this design)                                                                                                                 |
| 13  | **Subscription genuinely not active/trialing at the live-verified moment of grant**                     | `failed-precondition`            | "Cannot grant admin access: subscription status is '{status}'. A valid subscription is required."                                                                                           | **Same message, now driven by a fresh `retrieve()` instead of a potentially-stale local value (§2) — behaviorally more reliable, not client-visibly different.**                |
| 14  | Genuine race loss (transaction's own `isClaimed` throw)                                                 | `failed-precondition`            | "This group has already been claimed by another admin."                                                                                                                                     | Unchanged                                                                                                                                                                       |
| 15  | **Transaction actually committed despite a thrown/observed error (§4)**                                 | _(none — returns success)_       | _(none — identical success response shape to the happy path)_                                                                                                                               | **New recovery path. Fully transparent to the client — no new UI needed.**                                                                                                      |
| 16  | Unexpected/transient failure, non-race, nothing was written (§1 makes this retry-safe)                  | `internal`                       | Current: "Failed to process admin access request due to an unexpected error. Please try again." Proposed: **"A temporary issue occurred and no charge was made — it's safe to try again."** | **Message content is a proposal, not final — the guarantee it communicates (safe to retry) is new and real under this design; exact wording is the downstream UX spec's call.** |
| 17  | **Web-checkout path: caller loses the claim after their subscription was already verified/billed (§1)** | `failed-precondition` (proposed) | Proposed: **"Your payment was processed, but this group was claimed by someone else before your request completed. Contact support to arrange a refund or transfer."**                      | **New. Needs a distinct client treatment (support-contact flow), NOT a retry button — retrying will not help and the backend will not auto-cancel this subscription.**          |
| 18  | Outer catch-all (truly unexpected, no more specific error applied)                                      | `internal`                       | "Failed to process admin access request with subscription."                                                                                                                                 | Unchanged                                                                                                                                                                       |

**Rows 15, 16, and 17 are the ones the downstream UX spec needs to design against.** 15 requires no new UI (transparent success). 16 is an existing error code whose retry-safety guarantee is newly real and worth the client knowing (currently the client likely already shows _some_ generic error state for `internal` — the question for the UX spec is whether to add a "you can safely try again" affirmation). 17 is a genuinely new failure mode requiring new client-side handling (support-contact UI, not a retry affordance) — it did not exist as a distinct, reachable error before this design (the web-checkout path previously had no failure handling for this case at all).

---

## Testing Impact

Most of Wave 7's compensation/revert test suite (`homegroups/functions/src/__tests__/requestAdminAccessWithSubscription.test.ts`, the `"compensating-cancellation on transaction failure"` and `"idempotency-key replay after compensation"` describe blocks) tests behavior this design removes — they will be deleted and replaced, not incrementally patched, since the code they exercise (the clobber guard, the conditional revert) no longer exists.

New test scenarios required:

- **Concurrent-claimant test:** two callers racing to claim the same never-before-claimed group — verify only the actual transaction winner's Stripe fields ever appear in Firestore, at any point, transiently or otherwise.
- **Ack-ambiguity recovery (§4):** mock the transaction to throw while having actually applied its write — verify the catch block's re-read detects this and returns the identical success shape, with no compensation attempted.
- **Cancel-ack-ambiguity, both directions (§3):** `cancel()` rejects but `retrieve()` confirms canceled → counter advances; `cancel()` rejects and `retrieve()` shows still-active → counter does not advance, retry reuses the same key.
- **Final live-status gate (§2):** a stale "trialing" value present in local state (via a replayed `create()` response), but `retrieve()` reports "canceled" — verify the grant guard correctly rejects using the live value, not the stale one.
- **Web-checkout residual case (§1, row 17):** losing caller in the `subscriptionId`-supplied path receives the new distinct error, not a generic `internal` error and not silent cancellation.

## Rollout

No data migration or backfill required — this changes write _behavior_ going forward, not the Firestore schema. Recommended one-off, separate from the code deploy: an audit query for any existing group already showing the corruption signature (`isClaimed: true`, `admins` non-empty, `stripeSubscriptionId: null`) from before this fix ships, since this design prevents future occurrences but doesn't retroactively repair ones that already happened.

## Explicitly Out of Scope for This Spec

**Mobile and web client UX changes** (screens, retry buttons, support-contact flows, copy) for rows 15–17 of the error contract above are a separate subsystem with separate design concerns (UX copy, per-platform screen states) and should be brainstormed as their own spec once this one is implemented (or at minimum approved), using this document's error contract table as the authoritative, accurate starting context — not a re-derivation of what errors exist or what they mean.
