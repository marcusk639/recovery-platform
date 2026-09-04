---
name: launch-readiness-plan
description: Produce an evidence-backed launch and monetization work plan for one or more recovery-platform apps. Use when asked what needs to happen before launch, what is blocking revenue, what to build next, how close an app is to shipping, or for a launch plan, go-to-market readiness, or monetization roadmap. Takes app targets as arguments (homegroups, regroup, detox-recovery, recovery-api); with no argument it analyses the whole platform.
---

# Launch Readiness Plan

Produces `docs/launch-readiness/plan-<target>-<YYYY-MM-DD>.md`: an ordered, evidence-backed
account of what must happen before the target can take money from a real customer.

## Arguments

`$ARGUMENTS` is an optional space/comma-separated list of targets:
`homegroups`, `regroup`, `detox-recovery`, `recovery-api`, or `platform`.
**Empty argument means the whole platform** — all four, plus the cross-product referral layer.

## The bar: first paying customer

"Launch-ready" means one specific thing, and every judgement resolves against it:

> A real user signs up, pays with a **live** card, the charge succeeds, the money lands in the
> right account, and they receive what they paid for.

Anything that does not move the target toward that event is not a launch blocker. Say so
plainly and put it in Deferred rather than padding the critical path.

## Evidence rules — non-negotiable

<evidence_rules>
1. **Every factual claim cites a file path, commit SHA, config key, or command output.**
   Format: `(evidence: homegroups/functions/src/callable/x.ts:42)`.
2. **The repo cannot tell you what will sell.** It holds no user research, no pricing
   validation, no CAC/LTV, no funnel or retention data. Any claim about market size, willingness
   to pay, competitor positioning, conversion rates, or channel performance is **out of scope**.
   Do not estimate them. Do not reason from "typical SaaS benchmarks."
3. When an answer requires data the repo does not contain, write it as:
   `**OPEN QUESTION —** <the question> (needed to decide: <the decision it blocks>)`
   and move on. A short plan full of real citations beats a long one built on inference.
4. Distinguish **engineering work** (someone writes code) from **ops work** (someone clicks
   through a console, submits a form, signs an agreement). Label every item. Historically in
   this repo the true blockers have been ops, and plans that only look at code miss them.
5. Uncertain is an acceptable answer. "I could not determine X from the repo" is a finding,
   not a failure.
</evidence_rules>

## Phase 1 — Verify before you believe

<critical>
The documentation in this repo goes stale faster than it gets updated. A plan built by trusting
docs will list finished work as blockers. This is not hypothetical — every one of these was
found stated-as-open in committed docs while already being resolved in code:

- the Google Maps API key hardcode (remediated; `ANALYSIS.md` corrects itself inline)
- the regroup functions build break (fixed)
- the H11 regroup→homegroups isolation violation (reverted as dead code)
- Stripe "test values only" for regroup (wrong — live price IDs already existed)
- the regroup iOS bundle-id mismatch (false alarm; test-target ids are normal)
- `regroup/docs/technical/gap-analysis-production-readiness.md` (Dec-2025, stale wholesale)

Treat every document as a **hypothesis about the past**, and the code, config, and git history
as the present. Known-stale as of 2026-09-04: `CODEBASE-REVIEW.md`, `DOC-CODE-AUDIT.md`
(2026-06-01), `ANALYSIS.md` (2026-06-10). Several CLAUDE.md files also carry stale doc paths
after a `docs/` restructure and a skills flattening.
</critical>

For every candidate blocker you find in a document, before it enters the plan:
1. Locate the code, config, or console setting it refers to.
2. Determine current state from that artifact — not from the doc.
3. If resolved, it goes in **Already Done**, not the critical path.
4. If unresolved, cite the artifact proving it.

## Phase 2 — Establish ground truth

Read `readiness-report.md` first for current harness state, then dispatch **parallel
subagents** (one per area; do not do this serially) scoped to the target(s):

<areas>
- **Money path.** Trace signup → checkout → webhook → entitlement end to end. Stripe product
  and price configuration, live vs test keys, webhook registration and signing secrets, Connect
  onboarding, the `switch` in each webhook handler vs the events actually registered. Does a
  payment produce a durable entitlement the app reads?
- **Auth and onboarding.** Can a brand-new user reach a paid state unaided? Every step where
  they can get stuck, drop, or need manual intervention.
- **Deploy and config.** What is deployed vs committed: Firestore rules, indexes, callable
  regions, secrets, environment values. Anything live-only or commit-only is a risk.
- **Store and distribution.** iOS/Android build health, bundle ids, store metadata, privacy
  labels, review-guideline exposure. For web targets: domain, SSL, SEO basics.
- **Retention mechanics already in the code.** Notifications, invites, referrals, re-engagement
  surfaces. Report what exists; do NOT model their impact.
- **Operational readiness.** Error visibility, support path, abuse/refund handling, cost per
  user. What happens the first time something breaks for a paying customer?
</areas>

Give each subagent the evidence rules above verbatim. Require file-path citations in returns.

## Phase 3 — Think before you write

Reason explicitly, in the response, before drafting the document:

1. **What is the single binding constraint?** If everything else were finished, what still
   prevents a live charge? Name one thing.
2. **What is genuinely done?** List it — this is how stale-doc zombies get killed.
3. **What is ops, not engineering?** These usually cannot be parallelised away and often have
   external latency (store review, Stripe verification, domain propagation). They dominate the
   real timeline.
4. **What would you cut?** Name work that looks important and is not. A plan that defers
   nothing has not been thought about.
5. **Where could you be wrong?** State the assumptions that, if false, reorder the plan.

Prefer a short critical path with real evidence over a comprehensive-looking backlog.

## Phase 4 — Write the document

Write to `docs/launch-readiness/plan-<target>-<YYYY-MM-DD>.md`:

<output_format>
1. **Verdict** — 3-5 sentences. Can this target take money today? If not, the binding
   constraint and roughly what stands between here and there.
2. **Critical path** — an ordered table. Each row: item, ENG or OPS, evidence citation,
   blocks-what, rough effort (hours/days/weeks — never invent precise estimates). Order is
   dependency order, not importance order.
3. **Already done** — previously-reported blockers verified resolved, with the evidence that
   settles each. Explicitly names the doc that still claims otherwise, so it can be corrected.
4. **Risks** — things that could break a real customer's payment or trust. Severity plus the
   concrete failure scenario, not adjectives.
5. **Deferred** — real work that is not launch-blocking, with one line on why it can wait.
6. **Open questions** — everything the repo could not answer, each tagged with the decision it
   blocks. Expect the monetization questions to concentrate here. That is correct, not a gap.
7. **How this was verified** — what you ran, what you read, what you could not check and why.
</output_format>

Write for a reader who will act on it: specific file paths, exact console steps, real command
lines. No motivational framing, no "leverage synergies," no invented percentages.

## Repo facts worth knowing before you start

- Flat monorepo, **no root `package.json`**. Each package installs independently.
- Four separate Firebase projects: homegroups `recovery-connect-cad4b`, regroup
  `phoenix-cleanhouse`, recovery-api `recovery-platform`, detox-recovery
  `nextsteprecovery-1d5c2`. **Never cross-query Firestore between products.** `detox-recovery`
  has a `firebase.json` but no `.firebaserc` — nothing is pinned there.
- Node 22 and Java 21 are keg-only and exported via `~/.zshrc`. `firebase-tools` must come from
  npm, never Homebrew (the brew build ships a code-signing-tainted `fsevents.node` that gets the
  process SIGKILLed with zero output).
- `regroup/web`'s test runner cannot start — `angular.json` references a `karma.conf.js` that
  has never existed. It has no CI test job either, so nothing has ever exercised it.
- Recurring real blocker across six separate docs: Stripe products with **no default price**.
  `getDefaultPriceForProduct()` throws at runtime, and checkout fails with no visible error.
- Callable region drift has caused a total production outage once already (invite-join). Check
  declared regions against client call sites.
- Never log PII. Never commit secrets. Both are enforced at pre-commit.

## Before you finish

- [ ] Every claim carries a citation, or is marked OPEN QUESTION
- [ ] Every critical-path item is labelled ENG or OPS
- [ ] Already Done is non-empty (if nothing was stale, say you checked and found none)
- [ ] No market, pricing, or conversion numbers appear anywhere outside Open Questions
- [ ] The critical path is ordered by dependency and you can defend item #1 as the binding constraint
