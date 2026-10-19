---
name: launch-readiness-plan
description: Reconcile the documentation for any part of the recovery-platform monorepo against its code and produce an evidence-backed, prioritized go-live backlog — what must be done before it can take money from a real customer. Every checkable claim in the targeted docs is verified against code, config, deploy state or a test-mode call; the backlog is derived from the mismatches. Re-runnable; each run re-verifies the previous plan rather than trusting it. Use when asked what's left before we can go live, are we ready to launch, for a pre-launch audit, docs vs code before launch, a go-live backlog, a launch plan, what is blocking revenue, or how close something is to shipping. Takes code targets (homegroups, regroup, detox-recovery, recovery-api, or a subproject such as regroup/functions) and optional doc targets (paths or globs, e.g. docs:regroup/docs/**). No argument, or recovery-platform, means the whole platform.
---

# Launch Readiness Plan

Reconciles what the documentation says against what the code, config and deploy state actually
do, and turns the mismatches into an ordered go-live backlog. Writes two files under
`docs/launch-readiness/`:

- `plan-<target>-<YYYY-MM-DD>.md`: the backlog, written for the person deciding what to do next.
- `ledger-<target>-<YYYY-MM-DD>.md`: every claim checked, with its verdict and evidence.

Documentation here drifts faster than it is updated, and launch blockers hide in the gap
between what docs claim and what code does. So the docs are not background reading. They are
the list of claims this skill exists to check.

## Arguments

`$ARGUMENTS` is an optional space- or comma-separated list. Plain entries are **code targets**.
Entries prefixed `docs:` are **doc targets** (paths or globs). Empty means the entire platform.

| Code target                                    | Scope analysed                                                         |
| ---------------------------------------------- | ---------------------------------------------------------------------- |
| _(empty)_ or `recovery-platform` or `platform` | Everything below, plus the cross-product referral layer                |
| `homegroups`                                   | `homegroups/{mobile,web,functions}` (project `recovery-connect-cad4b`) |
| `homegroups/mobile`                            | RN iOS+Android app only                                                |
| `homegroups/web`                               | CRA marketing/web app only                                             |
| `homegroups/functions`                         | Cloud Functions backend only                                           |
| `regroup`                                      | `regroup/{mobile,web,functions}` (project `phoenix-cleanhouse`)        |
| `regroup/mobile`                               | RN 0.72 app only                                                       |
| `regroup/web`                                  | Angular app + its SSR functions only                                   |
| `regroup/functions`                            | Cloud Functions backend only                                           |
| `detox-recovery`                               | Next.js 15 site (project `nextsteprecovery-1d5c2`), no subprojects     |
| `recovery-api`                                 | Shared Functions API (project `recovery-platform`), no subprojects     |

Examples: `/launch-readiness-plan regroup/functions`,
`/launch-readiness-plan regroup docs:regroup/docs/go-to-market/**`.

**Default doc set** when no `docs:` target is given, for each code target:

- the target's own `*.md` files and its `docs/` folder;
- its product's `docs/` folder;
- every `CLAUDE.md` / `AGENTS.md` on the path from the repo root to the target;
- launch-readiness and plan documents under `docs/launch-readiness/`;
- the previous plan and ledger for the same target.

Leave out generated or vendored markdown (`node_modules`, `dist`, `lib`, `public`, `.next`).
State the resolved code list and doc list at the top of both output files.

For a **subproject** target, leave out the product docs that belong to a sibling subproject
(for `regroup/functions`, skip `regroup/docs/technical/mobile/**` and `regroup/docs/technical/web/**`).
Include sibling docs only for claims about the target itself. A product-wide doc set can run to
tens of thousands of lines; reconcile what the target is accountable for.

### Scoping rule for subproject targets

A subproject can't be judged in isolation: a mobile payment screen is worthless if the callable
behind it is misconfigured. So:

- **Analyse** only the target's own files and the target's doc set.
- **You may read** sibling subprojects and other products to verify a call site, a region, a
  contract, or a schema.
- **Attribute** every finding to the subproject that must change. If the fix belongs to a
  sibling, record it as `EXTERNAL DEPENDENCY — <target>: <what it needs>` rather than widening
  scope.

### Which areas apply to which target

Skip areas that can't apply, and say in the plan that you skipped them and why.

| Area                  | mobile | web        | functions      | detox-recovery   | recovery-api    |
| --------------------- | ------ | ---------- | -------------- | ---------------- | --------------- |
| Money path            | yes    | yes        | yes            | only if it sells | yes             |
| Auth & onboarding     | yes    | yes        | contracts only | yes              | auth model only |
| Deploy & config       | yes    | yes        | yes            | yes              | yes             |
| Store & distribution  | yes    | domain/SEO | no             | domain/SEO       | no              |
| Retention mechanics   | yes    | yes        | triggers/jobs  | yes              | no              |
| Operational readiness | yes    | yes        | yes            | yes              | yes             |

What to check in each area is in [references/areas.md](references/areas.md).

## The bar: first paying customer

"Launch-ready" means one specific thing, and every judgement resolves against it:

> A real user signs up, pays with a **live** card, the charge succeeds, the money lands in the
> right account, and they receive what they paid for.

Anything that doesn't move the target toward that event isn't a blocker. Say so plainly and put
it in Deferred rather than padding the backlog.

## Evidence rules

These apply to the main session and to every subagent; pass them on verbatim.

<evidence_rules>

1. **Every factual claim cites a file path with line, commit SHA, config key, or command
   output.** Format: `(evidence: regroup/functions/src/callable/payments.ts:42)`. A ledger
   entry cites both the doc (`doc:`) and the artifact (`code:`).
2. **Record the verification level reached, and never claim more.** The levels are defined in
   [references/verification-ladder.md](references/verification-ladder.md). Code that compiles
   and passes its tests isn't evidence that an external service accepts the call.
3. **The repo can't tell you what will sell.** It holds no user research, pricing validation,
   CAC/LTV, funnel or retention data. Market size, willingness to pay, competitor positioning,
   conversion and channel claims are out of scope. Don't estimate them or reason from "typical
   SaaS benchmarks".
4. When an answer needs data the repo doesn't hold, write
   `**OPEN QUESTION —** <the question> (needed to decide: <the decision it blocks>)` and move on.
5. Label every backlog item **ENG** (someone writes code) or **OPS** (someone uses a console,
   submits a form, signs an agreement, runs a deploy or migration). In this repo the true
   blockers have historically been ops, and plans that only look at code miss them.
6. "I couldn't determine X" is a finding, not a failure.
   </evidence_rules>

## Safety: read-only by default

This skill reviews; it doesn't change the world. Reading code, running tests, typecheck and a
local emulator are fine. **Ask the user first** before anything with side effects or cost:

- any call that writes to an external service, including Stripe test mode (it creates real
  objects on a real account);
- any read or write against production data (`phoenix-cleanhouse` and the other live projects);
- any deploy, migration, or Secret Manager write.

Read-only checks of deploy state (listing functions, indexes, rules releases, webhook endpoints)
are fine without asking. The verification ladder lists which checks fall where.

## Re-runs

This skill is meant to be re-run as development continues.

Before Phase 2, find the most recent plan and ledger for the same target under
`docs/launch-readiness/`. If they exist:

1. Re-verify every backlog item and every open question in the previous plan against current
   code. Nothing carries forward on trust. Resolved items go in **Already Done** with the
   evidence that settles them.
2. Re-check every previous ledger entry whose verdict was not `IMPLEMENTED` at level 4 or 5.
3. Add **Changes Since Last Plan**: newly resolved, newly discovered, still blocked, and answered
   open questions.

Treat the previous plan exactly like every other document: a hypothesis about the past. A plan
that agrees with its predecessor without re-verifying it is worthless.

## Phase 1 — Resolve targets and the doc set

Resolve code targets to directories and the doc set to a concrete file list (see Arguments).
Work from a git worktree off `origin/main`, or confirm files with `git show origin/main:<path>`.
The main checkout is often parked on an older commit, which makes merged work look missing.

Cluster the docs for Phase 2: group by product and topic (money, auth, deploy, ops, product
specs, CLAUDE.md files). Aim for clusters a single subagent can read completely.

## Phase 2 — Build the claim ledger

Dispatch **parallel subagents**, one per doc cluster, at most three at a time. Each one extracts
every checkable claim from its docs and checks it against the code. The claim types, the verdict
definitions, the row schema and worked examples are in
[references/claim-ledger.md](references/claim-ledger.md); give that file to each subagent along
with the evidence rules.

Every claim gets exactly one verdict: `IMPLEMENTED`, `PARTIAL`, `MISSING`, `CONTRADICTED`,
`STALE-DOC`, or `UNVERIFIABLE-HERE`. Each verdict needs a doc citation and an artifact citation.

## Phase 3 — Reverse pass and ground truth by area

The ledger only covers what the docs mention, so the most dangerous gaps can be missing from it
entirely. In parallel with Phase 2, dispatch one subagent per applicable area (see
[references/areas.md](references/areas.md)). Each one:

- traces its area end to end in code, config and deploy state;
- adds launch-relevant code that no targeted doc mentions to the ledger as `UNDOCUMENTED`.
  Examples: money paths, scheduled jobs, security rules, webhooks, data migrations;
- checks for the failure classes listed in the areas file. Each of those has already hurt this
  repo.

Read `readiness-report.md` first for the current state of the test and build harness.

## Phase 4 — Verify what will gate the backlog

Subagent reports are leads, not findings. Before an item enters the backlog as `BLOCKER` or
`MUST-FIX BEFORE LIVE`, the main session re-verifies it independently, at the highest
verification level reachable without asking the user.

Where only a higher level can settle it (a test-mode call against Stripe, a live deploy-state
read), say so. Then either ask the user for approval or record the item at the level reached,
with the confidence that level supports. Never upgrade a verdict from an agent's say-so.

## Phase 5 — Think before you write

Reason explicitly, in the response, before drafting:

1. **What is the single binding constraint?** If everything else were finished, what still
   prevents a live charge? Name one thing.
2. **What is genuinely done?** List it. This is how stale-doc claims get retired.
3. **What is ops, not engineering?** Ops items usually can't be parallelised away and often
   carry external latency (store review, Stripe verification or access requests, domain
   propagation). They dominate the real timeline.
4. **What would you cut?** Name work that looks important and isn't. A plan that defers nothing
   hasn't been thought about.
5. **Where could you be wrong?** State the assumptions that, if false, would reorder the plan.
   Pay particular attention to items whose verification stopped below level 4.

## Phase 6 — Write the two files

The templates are in [references/output-templates.md](references/output-templates.md).

The **plan** contains:

- a verdict;
- the go-live backlog in four tiers (`BLOCKER`, `MUST-FIX BEFORE LIVE`, `SHOULD-FIX`,
  `DEFERRED`), with blockers ordered by dependency;
- Already Done;
- Risks;
- Open Questions;
- Doc corrections to hand off;
- Changes Since Last Plan;
- How this was verified.

Every backlog item carries:

- ENG or OPS;
- the ledger IDs it comes from;
- the verification level reached;
- confidence;
- rough effort (hours, days or weeks, never invented precision);
- what it depends on.

The **ledger** holds every claim row, grouped by document, with verdict counts per document. The
plan links to it.

Docs that are wrong but not launch-relevant go in the plan's **Doc corrections** list for
hand-off to the `doc-code-audit` skill, rather than into the backlog. This skill is about
go-live, not documentation hygiene.

Write for a reader who will act on it: specific file paths, exact console steps, real command
lines. No motivational framing and no invented percentages.

## Repo facts worth knowing before you start

- Flat monorepo, **no root `package.json`**; each package installs independently. Four separate
  Firebase projects: homegroups `recovery-connect-cad4b`, regroup `phoenix-cleanhouse`,
  recovery-api `recovery-platform`, detox-recovery `nextsteprecovery-1d5c2`. Never cross-query
  Firestore between products.
- **Do work in a worktree off `origin/main`.** PRs land as squash merges, and a PR whose base is
  another PR's branch can show as merged on GitHub without ever reaching `main`. Confirm on
  `origin/main` with the two-dot check in the root `CLAUDE.md`, not with the PR state.
- **Deploy state isn't committed state.** Firestore rules and indexes are deployed by hand
  (regroup: `npm run deploy:rules` in `regroup/mobile`; indexes via
  `firebase deploy --only firestore:indexes`). Nothing in CI deploys them. Data migrations are
  scripts someone has to run, sometimes with a cutoff tied to a deploy time.
- **Stripe, regroup:** the platform does not have Accounts v2 enabled; access needs a request to
  Stripe. New house accounts use Accounts v1 behind the `CONNECT_ACCOUNTS_API` switch, and each
  house records `stripeAccountApi`. A test-mode key for regroup's platform is in GCP Secret
  Manager as `STRIPE_TEST_SECRET_KEY` (project `phoenix-cleanhouse`). Read it into memory only,
  never print it, and use it only for test-mode checks the user has approved.
- **Documents go stale.** Treat every document, including CLAUDE.md files and earlier plans, as a
  hypothesis about the past. Past examples of claims stated as open while already resolved in
  code: the Google Maps key hardcode, the regroup functions build break, "Stripe test values
  only" for regroup, and a Dec-2025 regroup production-readiness gap analysis that was stale
  throughout.
- Callable region drift once caused a total production outage (invite-join). Check declared
  regions against client call sites.
- Stripe products with **no default price** make `getDefaultPriceForProduct()` throw, and
  checkout fails with no visible error. This has recurred across several docs.
- `firebase-tools` must come from npm, not Homebrew. The brew build ships a code-signing-tainted
  `fsevents.node` that gets the process killed with no output.
- Never log PII. Never commit secrets. Both are enforced at pre-commit.

## Before you finish

- [ ] Both files are written, the plan links to the ledger, and both list the resolved targets
- [ ] Every ledger row has a verdict, a `doc:` citation, an artifact citation and a verification
      level
- [ ] Every `BLOCKER` and `MUST-FIX` item was re-verified by the main session, not just reported
      by a subagent
- [ ] No verdict or confidence claims more than its verification level supports
- [ ] Every backlog item is labelled ENG or OPS and is traceable to ledger IDs
- [ ] Already Done is not empty; if nothing was stale, say you checked and found nothing
- [ ] Nothing external was written to, and no production data read, without the user's approval
- [ ] No market, pricing or conversion numbers appear anywhere outside Open Questions
- [ ] The blockers are in dependency order, and you can defend item 1 as the binding constraint
