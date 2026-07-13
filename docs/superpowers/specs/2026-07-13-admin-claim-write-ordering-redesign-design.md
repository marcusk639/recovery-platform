# Admin-Claim Write-Ordering Redesign — Design Spec

**Status:** Approved design, not yet planned/implemented. Next step: `superpowers:writing-plans` against this spec.

**Origin:** `docs/reviews/homegroups-admin-claim-nontransactional-write-race-2026-07-12.md` — an iterative-review pass (security + payment-integration reviewers) found, independently and by different reasoning paths, that `requestAdminAccessWithSubscription.ts` writes Stripe fields to the `groups/{groupId}` document non-transactionally _before_ the Firestore transaction that decides who wins an admin claim. Two genuinely concurrent legitimate claimants (or a client double-tap) can have their writes interleave in a way that permanently corrupts the actual winner's `stripeSubscriptionId`, breaking that admin's webhook sync and reconciler visibility with no automated repair path. This spec also folds in a second, related finding from the same review: RPC ack-ambiguity (a client-observed failure from Stripe or Firestore doesn't guarantee the operation didn't actually succeed server-side), which the review flagged as a distinct but compounding risk in this same file's error handling.

**File:** `homegroups/functions/src/callable/requestAdminAccessWithSubscription.ts`

**Priority:** Important, not launch-blocking. Scheduled as its own wave once this spec is approved and planned.

**Dependency:** This spec assumes Wave 6's `requireAuth` migration (PR #46 — confirmed as of this revision: `state: OPEN`, `mergeable: MERGEABLE`, `mergeStateStatus: UNSTABLE`, i.e. open and mergeable but with a pending/failing check, not yet merged) has landed by the time this work is implemented — line references below to the auth guard assume `const uid = requireAuth(request);` rather than the raw `if (!userId) throw ...` check still present in `main` today. If PR #46 hasn't merged yet when this is implemented, adapt the guard reference accordingly; nothing else in this spec depends on that migration.

**Pre-implementation verification already done for this revision:** checked both call sites of this callable (`homegroups/mobile/src/store/slices/groupsSlice.ts`, `homegroups/web/src/pages/ClaimGroupPage.js`, `homegroups/web/src/pages/SubscribePage.js`) — neither sets up a Firestore listener on the group document's Stripe fields during the claim flow; both simply `await` the callable's own response. Removing the speculative pre-transaction writes (§1) has no client-side impact — nothing currently depends on those fields appearing before the callable resolves.

**Revision note:** this spec was revised after an adversarial `/plan-review` pass found a real correctness gap in the first draft (§3/§4 below now address it) and an unhandled-error path in the ack-ambiguity check. Both are incorporated below, not deferred.

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

**Web-checkout (`subscriptionId` supplied) path — new failure handling, previously absent.** Today this path has zero compensation logic (`subscriptionCreatedThisCall` is never set `true` here, so the whole compensation block is skipped even on failure). Under this design, if this path's caller loses the claim transaction, they hold a real, already-billed Stripe subscription with no group attached. Auto-canceling isn't safe (potential refund implications the backend can't resolve unilaterally) and a blind retry won't help (the subscription is real and valid, the _group_ is what's unavailable). This case gets its own distinct error — see the error contract table below, row 17.

### 2. Final live-status check (closes the "was this a stale/replayed value?" question generally)

Immediately before the "grant admin only if active/trialing" guard, replace trust in whatever `subscriptionStatus` value is currently held (from a fresh `create()` or an idempotent replay of a prior `create()`) with one authoritative re-check:

```ts
subscriptionStatus = (await stripe.subscriptions.retrieve(stripeSubscriptionId))
  .status;
```

**Skip this specific re-check for the web-checkout (`subscriptionId`-supplied) path** — that branch already did its own fresh `retrieve()` moments earlier at verify time with no Stripe calls in between, so a second one is a pure-waste extra round-trip with no correctness benefit. Only the create-new-subscription path needs this, since its local `subscriptionStatus` can genuinely come from an idempotent replay whose cached response predates a later cancellation.

This is the choke point that makes acting on stale _create()_ data impossible regardless of whether the value in hand is a fresh response or a replay — it closes the general idempotency-replay-staleness question and (per §3) feeds into the cancel-ack-ambiguity path, in one place, as the review's payment-integration pass recommended.

**Cost tradeoff, stated explicitly:** this adds one Stripe API round-trip to every successful new-subscription claim (not just failure/retry paths). Given this callable is called rarely per user (an admin-claim action, not a hot path), the added latency is judged acceptable in exchange for closing the staleness question outright — noted here as a conscious tradeoff, not a silent side effect.

### 3. Compensation: safety check, then ack-ambiguity-aware cancellation

The original draft of this spec canceled the subscription unconditionally whenever `subscriptionCreatedThisCall` was true. An adversarial review pass found this was wrong in one specific case: **a same-user concurrent double-request** (double-tap, or a client retrying before it ever saw a response) shares the _same_ Stripe idempotency key, so both requests receive the _identical_ subscription object from Stripe — not two separate ones. If one of those two requests wins the claim transaction and the other loses, the loser's "cancel my own created subscription" logic would cancel the _same_ object the winner's now-committed claim depends on, breaking a legitimate admin's subscription through a path distinct from (but just as damaging as) the original write-ordering bug.

The fix: before canceling anything, re-read the group document once and use it for **two** checks — reusing a single Firestore read for both, rather than two separate reads:

```ts
catch (txError: any) {
  const isRaceLoss =
    txError instanceof HttpsError && txError.code === "failed-precondition";

  let postTxData: FirebaseFirestore.DocumentData | undefined;
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

  // Check 1 (ack-ambiguity recovery): did THIS call's own transaction
  // actually commit, despite the client observing an error?
  if (postTxData?.admins?.includes(userId)) {
    return buildAdminAccessResponse(groupId, stripeSubscriptionId, subscriptionStatus, postTxData);
  }

  // Check 2 (concurrent-owner protection): is the subscription this call is
  // about to cancel now backing SOMEONE's committed claim? Because Stripe's
  // idempotency key is shared across concurrent same-user requests, "someone"
  // here is necessarily this same user's other concurrent request — no other
  // user's idempotency key could ever collide with this one. If the doc's
  // current stripeSubscriptionId matches what we're about to cancel AND the
  // group is now claimed, back off — canceling would break that commit.
  const subscriptionNowOwnedBySomeone =
    subscriptionCreatedThisCall &&
    stripeSubscriptionId &&
    postTxData?.isClaimed === true &&
    postTxData?.stripeSubscriptionId === stripeSubscriptionId;

  if (
    subscriptionCreatedThisCall &&
    stripeSubscriptionId &&
    !subscriptionNowOwnedBySomeone &&
    !postTxReadFailed
  ) {
    // Safe to cancel: nobody's committed claim depends on this object.
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
      // Standalone increment, no other fields — safe under concurrent
      // writes regardless of anything else happening to this document.
      await groupRef.update({
        stripeSubscriptionAttempt: admin.firestore.FieldValue.increment(1),
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      });
    }
  } else if (subscriptionNowOwnedBySomeone) {
    logger.warn(
      `Skipping compensation: subscription ${stripeSubscriptionId} now backs a committed claim for group ${groupId} (likely this user's own concurrent request) — not canceling.`,
    );
  } else if (postTxReadFailed && subscriptionCreatedThisCall) {
    // Conservative default when we can't confirm safety: an orphaned live
    // subscription (caught later by the reconciler/audit query) is a much
    // smaller harm than canceling a subscription someone else now depends
    // on for admin access. Do not cancel when uncertain.
    logger.warn(
      `Skipping compensation for subscription ${stripeSubscriptionId}: could not confirm safety after a failed re-read — erring toward not canceling.`,
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

`buildAdminAccessResponse(...)` is a small shared helper extracted from the happy path's existing return-construction (currently only built once, inline, at the end of the happy path) so the ack-ambiguity recovery branch and the normal-completion return use identical logic rather than duplicating the response shape.

Note the ordering: the ack-ambiguity check (did _I_ win?) and the concurrent-owner check (does _someone_ — necessarily this same user's other request — now own this subscription?) both read from the _same_ `postTxData` snapshot, so there's no additional Firestore round-trip beyond what the original draft already required, and no new TOCTOU window: Firestore's transaction consistency guarantees that if `txError`'s `isClaimed`-check-failed branch fired, some commit already happened _before_ this read, and that commit's own `tx.update()` (per §1) already wrote its own Stripe fields atomically — so this read is guaranteed to reflect that commit's true state, not a stale snapshot racing it.

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
| 15  | **Transaction actually committed despite a thrown/observed error (§3)**                                 | _(none — returns success)_       | _(none — identical success response shape to the happy path)_                                                                                                                               | **New recovery path. Fully transparent to the client — no new UI needed.**                                                                                                      |
| 16  | Unexpected/transient failure, non-race, nothing was written (§1 makes this retry-safe)                  | `internal`                       | Current: "Failed to process admin access request due to an unexpected error. Please try again." Proposed: **"A temporary issue occurred and no charge was made — it's safe to try again."** | **Message content is a proposal, not final — the guarantee it communicates (safe to retry) is new and real under this design; exact wording is the downstream UX spec's call.** |
| 17  | **Web-checkout path: caller loses the claim after their subscription was already verified/billed (§1)** | `failed-precondition` (proposed) | Proposed: **"Your payment was processed, but this group was claimed by someone else before your request completed. Contact support to arrange a refund or transfer."**                      | **New. Needs a distinct client treatment (support-contact flow), NOT a retry button — retrying will not help and the backend will not auto-cancel this subscription.**          |
| 18  | Outer catch-all (truly unexpected, no more specific error applied)                                      | `internal`                       | "Failed to process admin access request with subscription."                                                                                                                                 | Unchanged                                                                                                                                                                       |

**Rows 15, 16, and 17 are the ones the downstream UX spec needs to design against.** 15 requires no new UI (transparent success). 16 is an existing error code whose retry-safety guarantee is newly real and worth the client knowing (currently the client likely already shows _some_ generic error state for `internal` — the question for the UX spec is whether to add a "you can safely try again" affirmation). 17 is a genuinely new failure mode requiring new client-side handling (support-contact UI, not a retry affordance) — it did not exist as a distinct, reachable error before this design (the web-checkout path previously had no failure handling for this case at all).

---

## Testing Impact

Most of Wave 7's compensation/revert test suite (`homegroups/functions/src/__tests__/requestAdminAccessWithSubscription.test.ts`, the `"compensating-cancellation on transaction failure"` and `"idempotency-key replay after compensation"` describe blocks) tests behavior this design removes — they will be deleted and replaced, not incrementally patched, since the code they exercise (the clobber guard, the conditional revert) no longer exists.

New test scenarios required:

- **Concurrent-claimant test:** two callers racing to claim the same never-before-claimed group — verify only the actual transaction winner's Stripe fields ever appear in Firestore, at any point, transiently or otherwise.
- **Ack-ambiguity recovery (§3):** mock the transaction to throw while having actually applied its write — verify the catch block's re-read detects this and returns the identical success shape, with no compensation attempted.
- **Concurrent-owner protection (§3) — the scenario the plan-review pass found missing from the first draft:** simulate two same-user concurrent requests sharing one Stripe subscription object (identical idempotency key → identical mocked `create()` response for both); one call's transaction commits, the other's fails. Verify the losing call's compensation does **NOT** cancel the shared subscription, and verify a subsequent read shows the winning call's admin grant still backed by a live, uncanceled subscription.
- **Cancel-ack-ambiguity, both directions (§3):** `cancel()` rejects but `retrieve()` confirms canceled → counter advances; `cancel()` rejects and `retrieve()` shows still-active → counter does not advance, retry reuses the same key.
- **Compensation re-read failure (§3):** mock `groupRef.get()` inside the catch block to reject — verify compensation is skipped entirely (no cancel attempted) rather than throwing an unhandled/raw error, and the function still returns the intended `internal` error to the client.
- **Final live-status gate (§2):** a stale "trialing" value present in local state (via a replayed `create()` response), but `retrieve()` reports "canceled" — verify the grant guard correctly rejects using the live value, not the stale one.
- **Web-checkout residual case (§1, row 17):** losing caller in the `subscriptionId`-supplied path receives the new distinct error, not a generic `internal` error and not silent cancellation.

## Rollout

No data migration or backfill required — this changes write _behavior_ going forward, not the Firestore schema.

**Required task, not optional:** a one-off audit query, run once shortly after deploy, for any existing group already showing the corruption signature (`isClaimed: true`, `admins` non-empty, `stripeSubscriptionId: null`) from before this fix shipped — this design prevents future occurrences but doesn't retroactively repair ones that already happened. This should be an explicit task in the implementation plan (not a passing mention), even if the remediation itself ends up manual (e.g., look up each affected admin's Stripe customer by `userId`/email and manually relink).

**Rollback:** standard Cloud Function redeploy of the previous version if a defect surfaces post-deploy — no data-shape changes mean rolling back is a plain code revert, no compensating migration needed.

## Cross-Functional Dependency

**Row 17 of the error contract (web-checkout residual, "contact support") needs an operational path to exist before or alongside shipping it.** Emitting a "contact support for a refund or transfer" error with no runbook behind it just relocates the problem to an unprepared support inbox. Confirm (or create) a support process for this specific scenario as part of planning this work — this is a cross-functional dependency, not a pure engineering task, and should be tracked as its own item rather than assumed to already exist.

## Explicitly Out of Scope for This Spec

**Mobile and web client UX changes** (screens, retry buttons, support-contact flows, copy) for rows 15–17 of the error contract above are a separate subsystem with separate design concerns (UX copy, per-platform screen states) and should be brainstormed as their own spec once this one is implemented (or at minimum approved), using this document's error contract table as the authoritative, accurate starting context — not a re-derivation of what errors exist or what they mean.
