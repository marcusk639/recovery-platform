# Claim ledger

How documentation claims are extracted, judged against the code, and recorded. Every subagent
building part of the ledger gets this file and the evidence rules from SKILL.md.

## Contents

- [What counts as a claim](#what-counts-as-a-claim)
- [Verdicts](#verdicts)
- [Row schema](#row-schema)
- [Worked examples](#worked-examples)
- [What a subagent returns](#what-a-subagent-returns)

## What counts as a claim

A claim is any statement in a document that the code, config, deploy state or an external
service could prove or disprove. Extract every one of these:

| Claim type             | Looks like                                                                              |
| ---------------------- | --------------------------------------------------------------------------------------- |
| Feature                | "Residents can pay rent by card", "autopay collects rent on the due date"               |
| Requirement            | "Amounts are stored in cents", "the webhook verifies signatures"                        |
| Checklist item         | `- [ ] Set the live webhook secret`, "before launch: …"                                 |
| Known issue / TODO     | "Index X is stale", "TODO: wire the paywall", "BLOCKER: …"                              |
| Deploy or ops step     | "Deploy with `npm run deploy:rules`", "set `TIER_BILLING_ENABLED`"                      |
| Architecture statement | "`stripeConnectReturn` syncs status to Firestore", "only the webhook writes `payments`" |
| Config or console fact | "Live price IDs exist", "the Connect webhook is registered"                             |

Skip what can't be checked: opinions, roadmap wishes with no date or acceptance criterion, and
market or pricing assertions. Those last ones go to Open Questions if a decision depends on them.

A sentence can contain several claims; record each separately. Don't paraphrase a claim into
something more checkable than it is. Quote the shortest exact fragment that carries it.

## Verdicts

Exactly one per claim.

| Verdict             | Meaning                                                                              | Typically becomes                                          |
| ------------------- | ------------------------------------------------------------------------------------ | ---------------------------------------------------------- |
| `IMPLEMENTED`       | The claim holds, at the verification level recorded                                  | Nothing, or Already Done if a doc said it was open         |
| `PARTIAL`           | Some of it holds; the row says exactly what is missing                               | Backlog item for the missing part                          |
| `MISSING`           | The doc claims or requires it; nothing implements it                                 | Backlog item                                               |
| `CONTRADICTED`      | The code does something different from what the doc says                             | Backlog item if launch-relevant, else a doc correction     |
| `STALE-DOC`         | The doc says open or broken; the code shows it resolved                              | Already Done, plus a doc correction                        |
| `UNVERIFIABLE-HERE` | Settling it needs a console, a live or test-mode call, or data the repo doesn't hold | Open question or an OPS check, naming what would settle it |
| `UNDOCUMENTED`      | Reverse pass only: launch-relevant code no targeted doc mentions                     | Backlog item if it carries risk; else noted                |

Rules:

- Choose `CONTRADICTED` over `MISSING` when the code does _something_ in that place. The
  difference matters: a missing feature is built, a contradicted one needs a decision about which
  side is right.
- Choose `UNVERIFIABLE-HERE` over `IMPLEMENTED` when the claim is about an external system and
  you only reached level 1 or 2 (see `verification-ladder.md`). For example, "the Stripe call
  works" can't be settled by mocks.
- A claim in a CLAUDE.md file is still a claim. Those files steer every future agent session, so
  a `CONTRADICTED` one there is worth a doc correction even when it isn't launch-relevant.

## Row schema

One table per document, in the ledger file:

```
### regroup/functions/CLAUDE.md  (12 claims: 7 IMPLEMENTED, 1 PARTIAL, 2 CONTRADICTED, 1 STALE-DOC, 1 UNVERIFIABLE-HERE)

| ID | Claim (quoted) | Type | Verdict | Level | Evidence | Note |
|---|---|---|---|---|---|---|
| RF-03 | "`payments` docs store `amount` in dollars" | requirement | CONTRADICTED | L2 | doc: regroup/functions/CLAUDE.md:118 · code: regroup/functions/src/webhooks/stripeWebhook.ts:402 writes paymentIntent.amount (cents), since PR #86 | Doc predates #86 |
```

- **ID:** a short per-document prefix plus a number, stable within the run. Backlog items cite
  these IDs.
- **Level:** `L1`–`L5` from the verification ladder.
- **Evidence:** always `doc:` plus at least one artifact (`code:`, `config:`, `cmd:`, `commit:`,
  `deploy:`).
- **Note:** one line. Why the verdict, what is missing, or what would settle it.

## Worked examples

Illustrative. Each is a real case from this repo; the specifics will have changed by the time you
read this, so re-verify rather than copying.

**STALE-DOC.** A gap analysis lists "Stripe has only test values for regroup" as a blocker. The
config and git history show live price IDs already committed. Verdict: STALE-DOC, at L1 (or L5
with a read-only Stripe price lookup). It goes in Already Done, and the gap analysis goes on the
doc-corrections list.

**CONTRADICTED.** A doc says rent payments store `amount` in dollars. After PR #86 the webhook
writes cents. Verdict: CONTRADICTED. It isn't a launch blocker in itself, but any analytics or
export built from the doc would be off by 100×, so it's a doc correction and a risk note.

**MISSING, found by following a field.** A doc says scheduled autopay collects rent. The code has
a scheduled job, but it takes its Stripe destination from `guest.stripeConnectId`, and nothing in
the repo writes that field. Verdict: PARTIAL, with the note "transfer destination never set". In
a schemaless store this kind of writer/reader mismatch fails silently. Grep every field on the
money path for its writers.

**UNVERIFIABLE-HERE that later turned out to be a blocker.** "New houses are created as Stripe
Accounts v2 recipients." The code is correct by its mocks, and its tests pass. Only a test-mode
call against the real platform showed that Accounts v2 isn't enabled for it, so every create
fails. From the code alone the verdict is UNVERIFIABLE-HERE at L2, with "needs a test-mode create
on the platform (L4)". Never IMPLEMENTED.

**UNDOCUMENTED.** A data migration script exists, has never run, and its correctness depends on a
deploy timestamp. No targeted doc mentions it. It goes in the ledger from the reverse pass and
into the backlog as OPS.

## What a subagent returns

- the ledger tables for its documents;
- verdict counts per document;
- a short list of the rows it believes are `BLOCKER` or `MUST-FIX` candidates, with one line each
  on why. These are candidates only; the main session re-verifies them before they enter the
  backlog;
- anything it couldn't read or settle, and why.

It doesn't edit files, run deploys or migrations, call external services, or read production
data. Those need the user's approval through the main session.
