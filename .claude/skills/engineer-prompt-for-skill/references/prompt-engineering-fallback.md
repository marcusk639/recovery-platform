# Prompt-engineering fallback principles

Use this **only when no dedicated prompt-engineering skill is installed** in the
environment. If such a skill exists, prefer it — it likely encodes more specific
and better-maintained craft. These principles are a competent default, not a
replacement for a purpose-built skill.

The goal is unchanged: shape the prompt so the **target skill** produces its best
output, while preserving the original intent. These are levers to pull *in
service of the target skill's contract* (its inputs, output format, triggering,
and constraints) — not a checklist to apply mechanically.

## Core levers

1. **Make the ask explicit and singular in focus.** State the task as a clear
   instruction. If there are sub-asks, enumerate them so none is dropped. Lead
   with the actual objective, not preamble.

2. **Supply the context the skill would otherwise have to guess.** Audience,
   purpose, scope, format, relevant files/paths, domain constraints. The best
   prompts pre-answer the questions the skill would ask back. Pull this only
   from what the user gave or clearly implied — never fabricate specifics.

3. **Constrain the output to a usable shape.** If the user (or the target skill)
   cares about format — length, structure, sections, a verdict, a code block —
   say so. Frame the request in terms compatible with what the skill produces.

4. **Remove ambiguity that forks the work.** Pronouns without referents, "it/
   this/that" with no antecedent, vague qualifiers ("good", "better", "soon")
   that the skill could interpret several ways. Pin them down using the user's
   evident intent.

5. **Set the scope boundaries.** What's in and what's out. Time ranges, versions,
   which parts of a codebase, which audience. Under-scoped prompts produce
   sprawling or off-target output.

6. **Give a success criterion when one is implied.** "so that I can X", "the
   answer should let me decide Y", "done means Z passes". This orients the skill
   toward what actually helps.

7. **Show the shape with a tiny example when format matters.** One short
   input→output example disambiguates more than a paragraph of description. Use
   sparingly and only when it doesn't over-constrain a deliberately open ask.

8. **Match the target skill's triggering vocabulary.** Phrase the request using
   terms the skill keys on, so it fires and interprets the prompt as intended.

## Calibration

- **Proportionality beats thoroughness.** A casual, low-stakes ask should stay
  short — over-engineering it changes its spirit and wastes the reader's time. A
  complex, high-stakes task earns structure. Let the original's ambition set the
  ceiling.
- **Concise and well-aimed beats long and exhaustive.** Every added sentence
  should change the output for the better; if it wouldn't, cut it.
- **Don't resolve deliberate openness.** If the user left the verdict, approach,
  or specifics open on purpose, keep them open. Adding constraints they didn't
  ask for is intent drift, not improvement.

## Anti-patterns to avoid

- Burying the actual request under instructions about *how* to think.
- Stacking ALL-CAPS imperatives and rigid templates onto a simple request.
- Inventing facts, constraints, or context to fill a gap — leave a clearly
  marked `[FILL IN: ...]` placeholder instead.
- Changing the task while "improving" it (e.g. broadening "review this function"
  into "audit the whole module").
- Optimizing for prompt elegance rather than for the target skill's output.
