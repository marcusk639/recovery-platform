# Output templates

Two files per run, under `docs/launch-readiness/`. Use the same `<target>` slug and date in both.
For several targets, join the slugs with `-` (e.g. `regroup-functions-homegroups-functions`).

## Contents

- [Plan](#plan)
- [Ledger](#ledger)

## Plan

`docs/launch-readiness/plan-<target>-<YYYY-MM-DD>.md`

```markdown
# Launch readiness — <target> — <YYYY-MM-DD>

**Targets:** <resolved code directories>
**Docs reconciled:** <N documents, M claims> — full ledger: [ledger-<target>-<date>.md](ledger-<target>-<date>.md)
**Previous plan:** <link, or "none">

## 1. Verdict

3–5 sentences: can this target take money from a real customer today? If not, the binding
constraint and roughly what stands between here and there.

## 2. Go-live backlog

### BLOCKER — prevents the first paying customer (dependency order)

| #   | Item | ENG/OPS | Ledger IDs | Level | Confidence | Effort | Depends on |
| --- | ---- | ------- | ---------- | ----- | ---------- | ------ | ---------- |

### MUST-FIX BEFORE LIVE — puts real customers' money, data, PII or trust at risk

(same columns)

### SHOULD-FIX

(same columns)

### DEFERRED — real work, not needed for launch

| Item | Why it can wait | Ledger IDs |

## 3. Already done

Previously reported blockers and STALE-DOC claims verified resolved, each with the evidence that
settles it and the document that still says otherwise.

## 4. Risks

Things that could break a real customer's payment or trust: severity plus the concrete failure
scenario.

## 5. Open questions

`**OPEN QUESTION —** <question> (needed to decide: <decision>)`. Expect the monetization questions
to collect here; that is correct.

## 6. Doc corrections to hand off

CONTRADICTED and STALE-DOC rows that aren't launch-relevant, for the `doc-code-audit` skill:
document, ledger ID, one line.

## 7. Changes since last plan

Newly resolved, newly discovered, still blocked, answered open questions. Omit on a first run.

## 8. How this was verified

- verdict counts across the ledger;
- the highest level reached per area;
- what was run;
- what was read;
- what needed approval and whether it was given;
- what couldn't be checked, and why.
```

## Ledger

`docs/launch-readiness/ledger-<target>-<YYYY-MM-DD>.md`

```markdown
# Claim ledger — <target> — <YYYY-MM-DD>

**Plan:** [plan-<target>-<date>.md](plan-<target>-<date>.md)
**Totals:** <N claims>: <n> IMPLEMENTED · <n> PARTIAL · <n> MISSING · <n> CONTRADICTED · <n> STALE-DOC · <n> UNVERIFIABLE-HERE · <n> UNDOCUMENTED

## <document path> (<n> claims: <counts>)

| ID  | Claim (quoted) | Type | Verdict | Level | Evidence | Note |
| --- | -------------- | ---- | ------- | ----- | -------- | ---- |

## Reverse pass — UNDOCUMENTED

| ID  | What exists | Area | Level | Evidence | Note |
| --- | ----------- | ---- | ----- | -------- | ---- |
```

Keep the plan short enough to act on. The ledger can be as long as the docs require.
