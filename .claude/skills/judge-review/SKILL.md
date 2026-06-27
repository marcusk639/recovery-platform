---
name: judge-review
description: Adversarial pre-review pass for recovery-platform code changes. Run after any Builder agent produces output. Uses Tier C model (OpenRouter DeepSeek V4 Flash) for cost efficiency. Returns structured JSON findings before human review.
---

# Judge Review — recovery-platform

Run this skill after any multi-file code change in recovery-platform, before creating a PR.

## When to invoke

- After any change touching 2+ files
- Before creating a PR
- Skip for: documentation-only changes, package.json script additions, config-only edits

## Model to use

Use `TIER_C_MODEL` (OpenRouter DeepSeek V4 Flash via `$OPENROUTER_API_KEY`).
Escalate to Tier B (Claude Sonnet) ONLY if the change touches:

- Firebase Auth or security rules
- Stripe webhook handlers
- Cross-product integration (recovery-api ↔ homegroups/regroup)

Do NOT use Claude Max / Opus for this pass — it defeats the cost purpose.

## Judge prompt template

Use this prompt with the Tier C model, substituting [DIFF] with the actual code change:

---

You are an adversarial code reviewer for a TypeScript Firebase monorepo with 5 products: homegroups, regroup, detox-recovery, recovery-api, and shared.

Review the following code change and check for ALL of the following issues:

1. Logic errors or off-by-one issues in business logic
2. Missing TypeScript types or unsafe `any` casts
3. Firebase security rule violations (cross-product Firestore data access, missing auth checks)
4. Missing error handling in async functions (unhandled promise rejections, missing try/catch)
5. Stripe webhook signature verification bypass or missing idempotency
6. Redux state mutations (direct state.field = value patterns, should use Immer/RTK patterns)
7. Missing Zod validation on any external inputs (API params, Firestore reads, webhook payloads)
8. Tests that clearly should exist but are absent for new public functions

CODE CHANGE:
[DIFF]

Return a JSON object with this exact schema:
{
"issues": [
{
"severity": "critical" | "high" | "medium" | "low",
"location": "filename:line",
"rule": "one of the 8 checks above",
"description": "specific description of the problem",
"suggestion": "specific fix"
}
],
"verdict": "approve" | "revise",
"summary": "one sentence overall assessment"
}

## verdict is "revise" if ANY critical or high severity issue exists. verdict is "approve" only if no critical/high issues found.

## Output

The skill returns the raw JSON from the judge model. Review issues before merging.
This skill does NOT block commits — it informs your review decision.
