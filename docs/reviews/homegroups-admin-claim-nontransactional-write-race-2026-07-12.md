# `requestAdminAccessWithSubscription` — Non-Transactional Write Race (Findings + Design Options)

**Status:** Not planned or scheduled. This is a findings brief surfaced by an independent iterative-review pass (security + payment-integration reviewers, run in parallel) while validating the Wave 7 admin-claim compensation fix (`docs/superpowers/plans/2026-07-12-homegroups-wave7-admin-claim-compensation-race-fix.md`). Wave 7 explicitly deferred this exact question in its own "Deferred Work" section; this document is the promised follow-up write-up, not a decision to build it.

**File in question:** `homegroups/functions/src/callable/requestAdminAccessWithSubscription.ts`

---

## Why this is a separate document, not a Wave 7 task

Wave 7 was scoped as a targeted bug fix (compensating-cancellation cleanup + idempotency-key correctness) with an explicit constraint against restructuring the write ordering. What's described below requires changing _when_ and _how_ the group document's Stripe fields get written relative to the claim transaction — a structural change to the callable's core flow, not a bounded fix. Bundling it into Wave 7 would have re-opened a branch that had already passed five independent review passes for an unrelated, larger change. It needs its own scoping and its own plan once a direction is chosen.

---

## The problem

`requestAdminAccessWithSubscription` does Stripe work (create customer, create subscription) and a **non-transactional** `groupRef.update()` write of the resulting `stripeCustomerId` / `stripeSubscriptionId` / `subscriptionStatus` / etc. fields _before_ it runs the Firestore transaction that actually decides who wins the claim (`isClaimed` / `admins`). Call this pre-transaction write "step 2."

Two independent reviewers, working separately and using different framings, converged on the same root cause:

> Step 2's write and the claim transaction are not atomic with each other, and two callers' step-2 writes are not ordered relative to either caller's transaction. A losing caller's compensating "revert" logic (added in Wave 7 Task 1) decides whether to null the group doc's Stripe fields by checking `staleData.stripeSubscriptionId === <this call's own subscription id>` — but that check only tells you _whose write landed last_, not _who actually won the claim transaction_.

### Concrete scenario (two genuinely concurrent legitimate claimants — no adversary required)

1. Caller A's step 2 runs: Stripe subscription `sub_A` created, `groupRef.update({stripeSubscriptionId: "sub_A", ...})` lands.
2. Caller A's claim transaction runs: `isClaimed` was still `false` → **A wins**. `isClaimed: true, admins: ["A"]` committed. (The transaction itself never touches the Stripe fields — those are set by step 2, not the transaction.)
3. Caller B's step 2 finally completes (it was in flight the whole time, independently of A): Stripe subscription `sub_B` created, `groupRef.update({stripeSubscriptionId: "sub_B", ...})` — **this non-transactional write has no ordering guarantee relative to A's transaction and silently overwrites A's `sub_A` reference.**
4. Caller B's claim transaction runs: sees `isClaimed: true` → **B loses** (`failed-precondition`).
5. B's Wave-7 compensation logic cancels `sub_B` (correct) and reads the doc: `staleData.stripeSubscriptionId === "sub_B"` (B's own id, since B's step-2 write landed most recently) → the guard says "this is still my own write, safe to revert" → nulls `stripeSubscriptionId`, `subscriptionStatus`, and the related fields.

**Final state:** `isClaimed: true`, `admins: ["A"]` — A is the legitimate, paying admin — but `stripeSubscriptionId: null` / `subscriptionStatus: null`. A's real, live, billed subscription (`sub_A`) is now permanently unlinked from the group document.

### Downstream impact (confirmed, not hypothetical)

- `homegroups/functions/src/utils/stripeUtils.ts` locates a group for incoming Stripe webhook events (renewal, cancellation, payment failure) via `.where("stripeSubscriptionId", "==", subscriptionId)` (multiple call sites). With the field nulled, every future webhook event for `sub_A` finds no matching group and silently no-ops. If A's card later fails or A cancels via Stripe's own portal, the app never learns about it — A stays admin indefinitely with no functioning billing sync.
- `homegroups/functions/src/triggers/pubsub/scheduledSubscriptionReconciler.ts` only inspects groups where `subscriptionStatus` is `"trialing"` or `"active"`. With `subscriptionStatus` nulled, the group becomes invisible to the reconciler too — no scheduled job repairs the state either.
- The Wave-7 guard's own inline comment ("never clobber a genuine concurrent winner's data") states an intent the equality check doesn't actually enforce — it just happens to be _correct_ in the ordering the Wave 7 test suite exercises (winner's write lands before the loser reads), but _not_ in the ordering shown above (loser's write lands after the winner's transaction commits).

A related, narrower asymmetry: the revert list (`stripeSubscriptionId`, `stripeSubscriptionItemId`, `subscriptionStatus`, `stripePriceIdGroup`, `stripeProductIdGroup`) never includes `stripeCustomerId`, even though step 2 also blindly writes `stripeCustomerId` on first-time customer creation. In the same interleaving, `stripeCustomerId` can end up permanently pointing at the losing caller's Stripe customer object — breaking any future billing-portal "update payment method" flow keyed off `group.stripeCustomerId`.

### A second, distinct issue surfaced in the same review pass: RPC ack-ambiguity

Separately from the concurrency issue above, one reviewer flagged a general distributed-systems property that predates this branch and applies to _any_ external call in this handler, not just the new code: **a client-observed error does not guarantee the server-side operation didn't actually succeed.**

- If `stripe.subscriptions.cancel()` genuinely succeeds on Stripe's side but the client only sees a network timeout before the response arrives, Wave 7's `cancelSucceeded` flag stays `false` (it's set purely from promise resolution) — so the attempt counter doesn't advance, and a retry replays the _original_ cached idempotent response, which by then reflects a subscription that's actually canceled. This can reach the same "admin granted, no valid subscription" outcome the whole Wave 7 branch exists to prevent, just via ambiguity in the _cancel_ call instead of the _create_ call.
- Symmetrically, if the claim transaction's `Commit` RPC actually succeeds server-side but the client observes a timeout, the code (correctly, from its own point of view) treats this as "unexpected error, not a race loss" and runs compensation — canceling the caller's own just-created, now-legitimately-backing subscription and nulling the group doc's Stripe fields — leaving that user as a permanent admin with no subscription at all, reached without a second caller or race of any kind.

This is a real, if lower-probability, gap, but it's conceptually distinct from the concurrent-write-ordering issue above (it's about _any_ RPC in this handler, not specifically about the two-writer interleaving) and would need its own design conversation (e.g., "on an ambiguous failure, re-verify actual state via `stripe.subscriptions.retrieve()` / re-reading the group doc before deciding whether to compensate," which is a pattern that could apply broadly across this codebase's Stripe-calling code, not just this one file).

### Confirmed NOT an issue

- `stripeSubscriptionAttempt` (the Wave 7 counter) is never read from client input anywhere in this callable — server-only bookkeeping, no tampering surface via the callable itself.
- Separately (pre-existing, unrelated to Wave 7): `firestore.rules`'s `groups/{groupId}` update rule (`allow update: if isGroupAdmin(groupId);`) has no field-level restriction, unlike the `members` collection's explicit guard against writing `isAdmin`. Any group admin can write `stripeSubscriptionId`, `isClaimed`, `admins`, etc. directly via the client SDK, bypassing this callable entirely. This is a much broader, pre-existing gap (affects every Stripe-adjacent field on `groups`, not just the ones this callable manages) — noted here because it was surfaced by the same review pass, but it's really its own separate finding, unrelated to the write-ordering problem above.

---

## Design options (not decided — pick one before writing an implementation plan)

**Option A — Defer all group-doc Stripe-field writes until after the transaction resolves, keyed off the actual winner.**
Move step 2's `groupRef.update()` so it never runs speculatively before the transaction. Instead: run the claim transaction first (using only data already known — Stripe customer/subscription creation would need to happen either inside the transaction's retry envelope, which Firestore transactions don't cleanly support for external API calls, or via a two-phase approach: reserve the claim first with a placeholder, then attach Stripe data only for the confirmed winner). This is the most structurally sound fix (a losing caller's Stripe write could never be observed by anyone as ground truth) but is the largest change — it likely means Stripe subscription creation needs to move to _after_ a caller is confirmed to have won the claim, changing the order of operations (customer/subscription creation currently happens before the payment-method-required guard even matters for return-value purposes). Needs careful handling of "caller wins the claim but then Stripe subscription creation fails" as its own new failure mode.

**Option B — Make the revert guard check transaction-outcome identity, not just field-value equality.**
Before reverting, re-read the group doc and check whether `admins` already includes _this call's own_ `userId` (i.e., did I actually win, regardless of what `stripeSubscriptionId` currently shows) — only revert if the doc does NOT show this caller as a winner. Smaller change than Option A, keeps the existing write-before-transaction shape, but doesn't fully close the underlying race — it only prevents the _revert_ step from clobbering a winner's data after the fact; a losing caller's step-2 write can still transiently overwrite a winner's `stripeSubscriptionId` in the window between the two writes, and nothing re-repairs that overwritten value if the losing caller's compensation guard now correctly declines to revert (the winner's field would sit corrupted until manually noticed). Cheaper to build, incomplete on its own.

**Option C — Reconciliation backstop instead of preventing the race at write time.**
Accept that step-2 writes can race, and instead add a scheduled job (or extend `scheduledSubscriptionReconciler.ts`) that periodically cross-checks `groups.stripeSubscriptionId` against `groups.admins` + a live Stripe lookup, repairing any group whose `stripeSubscriptionId` doesn't correspond to a subscription actually owned by a current admin. Doesn't require touching the callable's control flow at all, but only catches the corruption after the fact (webhook events would still silently miss the group in the interim), and needs careful design to avoid false-positive "repairs" that clobber a legitimate but not-yet-synced state.

**Option D — Do nothing now; monitor.** Given the trigger condition requires two genuinely concurrent legitimate claim attempts on the _same never-before-claimed group_ (a narrower window than it sounds, since most groups get claimed once, quickly, by whoever creates or is invited to admin them), this may be low enough real-world frequency to deprioritize behind other launch work, with a note to revisit if support tickets or Stripe dashboard reconciliation ever surfaces a group with this signature (`admins` non-empty, `stripeSubscriptionId: null`, `isClaimed: true`).

## Recommended next step

Pick a design direction (or explicitly choose Option D), then run this through `superpowers:brainstorming` before `superpowers:writing-plans` — this is exactly the kind of decision with several valid approaches and real tradeoffs that the brainstorming skill exists for, rather than a plan that presupposes one answer.
