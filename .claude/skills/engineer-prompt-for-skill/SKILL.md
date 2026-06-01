---
name: engineer-prompt-for-skill
description: >-
  Rewrite/engineer a raw prompt so a SPECIFIC target skill produces the best
  possible result, while preserving the original prompt's intent and spirit. It
  works by selecting the most appropriate available prompt-engineering skill
  (e.g. a "prompt-engineer" or "prompt-engineering-patterns" skill, if one is
  installed) and applying its methodology — tailored to what the target skill
  actually needs. Use this whenever the user wants to "optimize", "tune",
  "adapt", "rewrite", or "engineer" a prompt for use with another skill or
  command, or says things like "make this prompt work well with the X skill",
  "get the best results out of /deep-research with this", "prep this prompt for
  the code-review skill", or hands you both a prompt and the name of a skill
  they intend to run it through. Trigger even when they don't say the words
  "prompt engineering" — a prompt + a target skill is the signal.
---

# Engineer a Prompt for a Target Skill

## What this skill is for

People often have a rough prompt and a skill they want to run it through, but
the prompt isn't shaped the way that skill works best. A research skill wants a
scoped, answerable question; a code-review skill wants the diff and a clear
quality bar; a doc-writing skill wants audience and structure. The raw prompt
usually *contains* the right intent but in a form the target skill can't fully
exploit.

Your job: produce a **rewritten prompt** that makes the **target skill** fire
correctly and produce its best output — without changing what the user actually
asked for. The deliverable is the engineered prompt itself (ready to paste or
run), plus a short rationale and an intent-preservation check.

Three things make this skill different from "just improve the prompt":

1. **It is target-aware.** The rewrite is shaped by *that specific skill's*
   contract — its expected inputs, output format, triggering, and constraints —
   not by generic prompt advice.
2. **It delegates the craft.** It doesn't reinvent prompt-engineering theory; it
   finds the best available prompt-engineering skill and applies its method. If
   none is installed, it falls back to the principles in
   `references/prompt-engineering-fallback.md`.
3. **It is intent-preserving by contract.** The single hardest constraint is
   that the original intent and spirit must survive. A "better" prompt that asks
   for something different is a failure, not an improvement.

## Inputs

You need two things. Extract them from the request; ask only if genuinely
missing or ambiguous.

- **The raw prompt** — the text the user wants engineered. May be a sentence, a
  paragraph, a pasted block, or a description of what they want to ask.
- **The target skill** — the skill the engineered prompt will be run through.
  May be given as a name (`deep-research`), a slash command (`/code-review`), a
  path, or described ("the research one", "your PR reviewer"). Resolve it to a
  concrete installed skill before proceeding. If you can't identify it, ask.

If the user gives a prompt but no target skill, ask which skill they intend to
use it with — the whole point is target-specific shaping, so this is not
optional. If they name a skill that isn't installed, tell them and list the
closest matches you can find.

## Workflow

Work through these steps in order. Don't skip the target-skill inspection — it's
what makes the output good.

### 1. Resolve and study the target skill

Find the target skill's `SKILL.md` and read it. Skills live in places like
`.claude/skills/<name>/`, `~/.claude/skills/<name>/`, plugin skill directories,
and (in some environments) `/mnt/skills/`. Use the available-skills list in your
context to confirm the canonical name, then locate and read the file.

If the target skill has **no `SKILL.md` on disk** (some skills are registered
with only a name + description and no readable file), don't get stuck — its
entry in the available-skills list *is* its contract. The description states its
purpose, triggering, and often its expected inputs and output shape; treat that
as authoritative and extract what you can from it. Note in your rationale that
you worked from the description rather than a full skill file.

From the `SKILL.md` (or the description, when that's all there is), extract the
**contract** — the things that determine whether a prompt gets good output:

- **Purpose**: what it actually does (and does *not* do).
- **Triggering**: what phrasing/signals it keys on. If the engineered prompt
  doesn't match these, the skill may not fire at all.
- **Expected inputs**: required vs. optional. What context does it assume the
  user will provide (files, scope, parameters, format)? What does it complain
  about or ask back for when missing?
- **Output format**: what it produces, and any structure it imposes. The prompt
  should ask in terms compatible with that output.
- **Constraints / failure modes**: anything it explicitly refuses, narrows, or
  warns about. Things it tends to over- or under-do.
- **Examples**: example prompts in the skill are gold — they show the shape that
  skill rewards. Mirror that shape.

If the skill bundles its own "how to invoke me" or "good prompt" guidance, treat
that as authoritative over your general instincts.

### 2. Capture the original intent (before you touch anything)

Before rewriting, write down — for your own use — the **intent inventory** of
the raw prompt. This is the contract you must not break:

- **Core ask(s)**: what the user fundamentally wants. The verbs and the object.
- **Hard constraints**: musts, must-nots, scope boundaries, named entities,
  quantities, formats, deadlines, exclusions.
- **Implicit intent / spirit**: tone, ambition level, the *why* behind the ask.
  E.g. "quick gut-check" vs. "exhaustive audit" are different spirits even if
  the words overlap.
- **Deliberate omissions**: things the user left open on purpose. Don't
  over-specify these into existence.

Keep this list. Step 5 checks the engineered prompt against it.

### 3. Select the prompt-engineering skill to apply

Scan the available skills for one whose job is prompt engineering — a skill
whose name or description is about crafting, optimizing, or patterning prompts
(for example a `prompt-engineer`, `prompt-engineering-patterns`, or similarly
named skill). Check the available-skills list in your context first, then the
skill directories on disk.

Selection rules:

- If exactly one prompt-engineering skill exists, use it.
- If several exist, pick the best fit: prefer one whose methodology matches the
  *target skill's* domain (e.g. a code-prompt skill when the target is a coding
  skill), then prefer the more general/robust one. If it's a close call, state
  your choice and why in one line.
- If none exists, use `references/prompt-engineering-fallback.md`. Say so
  explicitly in your rationale so the user knows no specialized skill was
  applied.

Read the selected skill's `SKILL.md` (and any referenced material it points to)
and **actually apply its method** — its techniques, structure, and checklists —
rather than just gesturing at it. You are the bridge between that skill's
general craft and this target's specific contract.

### 4. Engineer the prompt

Rewrite the raw prompt by applying the selected method *through the lens of the
target skill's contract*. Concretely, a strong engineered prompt usually:

- **Speaks the target skill's language** so it triggers reliably and is
  interpreted as intended.
- **Supplies the context the target skill expects** — fills the gaps the skill
  would otherwise have to ask about (scope, audience, format, constraints,
  relevant files/paths), drawing only from what the user gave or clearly
  implied. Never invent facts to fill a gap; if a required input is genuinely
  missing, leave a clearly marked placeholder like `[FILL IN: target file]`
  rather than fabricating it.
- **Removes ambiguity** that would send the skill down the wrong path.
- **Frames the request to fit the skill's output format** so the result lands in
  a usable shape.
- **Stays proportionate** — don't bloat a casual ask into a 12-point
  specification. Match the engineering effort to the original's ambition
  (the spirit constraint from step 2). Concise and well-aimed beats long.

Calibrate the rewrite's heft to the prompt and target: a one-line lookup needs a
light touch; a complex multi-step task warrants more structure.

### 5. Verify intent preservation (required)

Check the engineered prompt against the intent inventory from step 2. For each
item, confirm it survived:

- Every **core ask** is still present and still primary.
- Every **hard constraint** is preserved exactly (don't loosen "only X" into
  "things like X", don't drop a named entity or a number).
- The **spirit** is intact — you didn't turn a quick question into an audit or
  vice versa.
- You did **not add new requirements** the user didn't ask for, and did not
  quietly resolve their deliberate omissions in a particular direction.

If any check fails, fix the prompt and re-check. This is the gate: an engineered
prompt that drifts from the original intent is wrong no matter how polished.

### 6. Present the result

Output, in this order:

1. **The engineered prompt** — in a fenced code block so it's copy/paste- or
   run-ready, with nothing else inside the block. If the target is a slash
   command, show it as the user would invoke it (e.g. `/deep-research <prompt>`).
2. **What changed and why** — a short bulleted rationale tying each significant
   change to the target skill's contract (e.g. "added the file path because
   code-review expects a concrete diff").
3. **Intent preserved** — a brief confirmation listing the core asks and hard
   constraints you carried through, and noting anything you deliberately did
   *not* add.
4. **Which prompt-engineering skill was applied** — name it, or note that the
   built-in fallback was used.
5. **Offer to run it** — ask if they'd like you to invoke the target skill with
   the engineered prompt now.

Keep the surrounding prose tight. The prompt is the product; everything else is
a short label on it.

## Example

**Input prompt:** "look into whether we should switch our mobile app from redux
to zustand"
**Target skill:** `deep-research`

**Engineered prompt (excerpt of what you'd produce):**

```
Research whether a production React Native app should migrate its state
management from Redux Toolkit to Zustand. Cover, with sources: (1) concrete
migration cost and risk for an existing RTK codebase, (2) runtime and bundle-size
differences at scale, (3) tradeoffs in devtools, middleware, and team
ergonomics, (4) what teams who migrated report 6-12 months later. Conclude with
a clear recommendation and the conditions under which the opposite choice is
right. Scope to current, widely-used versions; ignore pre-1.0 history.
```

*Why:* `deep-research` rewards a scoped, multi-source, answerable question with
an explicit deliverable — so the vague "look into whether" became a structured
question with sub-questions and a required recommendation. *Intent preserved:*
still a Redux→Zustand decision for their mobile app, still open-ended on the
verdict (didn't pre-decide it), just made answerable.

## Notes on judgment

- The target skill's own examples are the best signal for the shape it rewards —
  weight them heavily.
- When the raw prompt is already well-formed for the target, say so and make only
  minimal changes. Don't manufacture work.
- If applying the target's contract would *require* changing the user's intent
  (e.g. the skill simply can't do what they asked), don't silently bend the
  prompt to fit — surface the mismatch and ask how they want to proceed.
