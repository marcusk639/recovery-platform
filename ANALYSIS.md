# Recovery Platform — Launch Readiness & Claude Code Configuration Analysis

> Generated via the five-phase repo-analysis prompt (`/run-prompt repo-analysis-optimized`).
> Configuration and structural claims (Parts 3–4) were directly verified against the working
> tree on 2026-06-03. Launch-readiness and blocker claims (Parts 1–2) are synthesized from the
> products' own `/docs` and `CLAUDE.md` files; because doc-vs-code drift was observed during
> verification (see the correction note in §1.2), **doc-derived blockers should be re-checked
> against current code before sprint commitment.**

## Executive Summary

The recovery-platform is a **flat monorepo with no workspace tooling** (no root `package.json`
workspaces, `turbo.json`, or `nx.json`) consolidating four independent recovery products plus an
empty `shared/` placeholder and a cross-app `recovery-api/` service. Overall launch readiness is
**~6/10**: monetization and product surfaces are largely built (homegroups V4 shipped, detox is
tech-complete), but launch is gated less by engineering and more by **manual activation steps**
(setting live Stripe prices, wiring email automations, migrating paid PDFs) plus a **feature-
readiness gap** concentrated in `regroup` (low test coverage) and the absence of platform-wide
quality-gate hooks. The single highest-leverage action this week is to **set the homegroups
intergroup/treatment-center Stripe default prices and run one real card through claim-and-pay
end-to-end**, because `getDefaultPriceForProduct()` throws at runtime when prices are unset,
silently failing every paid checkout. If all CRITICAL blockers are cleared, **first revenue is
~1–2 weeks out** (most blockers are console/ops actions), with App Store review (1–7 days) as the
long pole for the mobile products.

---

## Part 1: Launch Readiness Assessment

### 1.1 Four-Vector Scorecard

| Vector                   | Score (1–10) | Status                                | Critical Blockers                                                                            |
| ------------------------ | ------------ | ------------------------------------- | -------------------------------------------------------------------------------------------- |
| Monetization Readiness   | 6            | Infra built, activation pending       | Stripe default prices unset (homegroups); detox revenue gated on email + PDF migration       |
| Product Completeness     | 7            | Two products launch-ready             | regroup payments + Oxford-house flow incomplete                                              |
| Prioritization Clarity   | 8            | Code-verified roadmap exists          | Cross-product sequencing implicit, not documented                                            |
| Feature Readiness        | 4            | Weakest vector                        | regroup ~5% test coverage; no platform secret-scan / pre-commit hooks; recovery-api untested |
| **OVERALL LAUNCH SCORE** | **6**        | **Activation-gated, not build-gated** | **Stripe price activation; regroup test coverage; email/PDF revenue wiring**                 |

### 1.2 Pre-Launch Blocker List (All Vectors, Ranked)

| Rank | Vector            | Severity | Blocker                                                                                                                                                     | Source                                                                                    | Effort      |
| ---- | ----------------- | -------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------- | ----------- |
| 1    | Monetization      | CRITICAL | homegroups intergroup/treatment-center Stripe **default prices unset** → `getDefaultPriceForProduct()` throws, silent checkout failure                      | `homegroups/docs/product/roadmap.md` (R-1/R-2), `homegroups/CLAUDE.md`                    | S (console) |
| 2    | Monetization      | CRITICAL | detox revenue gated: contact-form `from` double-wrap bug + unwired MailerLite automations + 5 paid PDFs behind Lemon Squeezy migration                      | `detox-recovery/docs/superpowers/plans/2026-05-27-launch-blockers.md`                     | M           |
| 3    | Feature Readiness | CRITICAL | regroup ~5% test coverage on payment/auth/dispute paths                                                                                                     | `regroup/docs/technical/gap-analysis-production-readiness.md` §1.2; `readiness-report.md` | L           |
| 4    | Feature Readiness | HIGH     | No platform-wide **secret-scan / pre-commit hook**; only 2 recovery-api PostToolUse hooks exist                                                             | `.claude/settings.json` (verified)                                                        | S           |
| 5    | Feature Readiness | HIGH     | Stale Google Maps key **rotation** outstanding (key is now env-based; old key ending `...l9Q` must be rotated in GCP Console) — _corrected, see note below_ | `homegroups/functions/src/api/api.ts:9-15` (verified)                                     | S (ops)     |
| 6    | Feature Readiness | HIGH     | recovery-api has no test suite; it is the intended cross-app integration bus                                                                                | `recovery-api/CLAUDE.md`; absence of test dir                                             | M           |
| 7    | Product           | HIGH     | regroup payments + Oxford-house resident flow incomplete                                                                                                    | `regroup/docs/technical/gap-analysis-production-readiness.md`                             | L           |
| 8    | Monetization      | HIGH     | No `stripe` MCP server active despite Stripe being the payment backbone for homegroups                                                                      | `.mcp.json` (verified — only firebase + context7)                                         | S           |
| 9    | Feature Readiness | MEDIUM   | No error-tracking (Sentry/Crashlytics) signal documented across products                                                                                    | absence in docs / `.mcp.json`                                                             | M           |
| 10   | Feature Readiness | MEDIUM   | No CI green-gate documented for most products                                                                                                               | per-project `.github/workflows` review                                                    | M           |
| 11   | Prioritization    | MEDIUM   | Cross-product launch ordering is implicit, not written down                                                                                                 | root `CLAUDE.md`, `docs/strategy/roadmap.md`                                              | S           |
| 12   | Monetization      | MEDIUM   | regroup pricing strategy documented but not implemented                                                                                                     | `regroup/docs/.../PRICING_STRATEGY.md`                                                    | L           |
| 13   | Product           | MEDIUM   | `shared/` is empty — no shared types/utilities despite cross-product referral concept                                                                       | `shared/` (verified, 0 files)                                                             | M           |
| 14   | Feature Readiness | MEDIUM   | Legal surface (ToS / Privacy / App Store metadata) not confirmed present                                                                                    | absence in docs                                                                           | S–M         |
| 15   | Feature Readiness | MEDIUM   | No `Stop`-hook reminder to run review/verify before closing sessions                                                                                        | `.claude/settings.json` (verified)                                                        | S           |

> **Correction note (doc-vs-code drift found during verification):** The exploration subagent
> reported a _hardcoded_ Google Maps API key as a CRITICAL blocker. Direct inspection of
> `homegroups/functions/src/api/api.ts` shows the key is already read from
> `process.env.GOOGLE_MAPS_API_KEY` with a fail-fast guard, and an inline comment documents the
> rotation step. The hardcoding has been remediated; only the **manual rotation of the previously
> exposed key** remains (rank 5). This single discrepancy is why all doc-derived blockers above
> carry the re-verify caveat.

### 1.3 Sprint-Ready Priority Queue

**Tier 1 — Launch-Blocking (must complete)**

1. Set homegroups intergroup Tier A/B + treatment-center Stripe default prices; run claim-and-pay with a real card in incognito, confirming `pk_live_`.
2. Fix detox contact-form `from` double-wrap bug; verify form submission delivers.
3. Land a smoke-level test pass over regroup payment/auth/dispute happy paths (does not need full coverage to launch — needs the revenue-critical paths green).

**Tier 2 — Revenue-Enabling (enables first payment)** 4. Wire detox MailerLite automations; migrate the 5 paid PDFs to Lemon Squeezy. 5. Add the `stripe` MCP server and a Stripe/auth PostToolUse review hook. 6. Rotate the old Google Maps key in GCP Console and set the new secret.

**Tier 3 — Quality-Improving (reduces launch risk)** 7. Add a repo-wide secret-scan pre-commit/PreToolUse hook and a `Stop` review reminder. 8. Stand up error tracking (Sentry for web/functions, Crashlytics for RN). 9. Add a minimal recovery-api test suite around the 5 callables.

**Tier 4 — Post-Launch (explicitly deferred)** 10. Populate `shared/` with cross-product referral types. 11. Implement regroup full pricing strategy. 12. Document cross-product launch sequencing in root `CLAUDE.md`.

---

## Part 2: Launch-Accelerating Agent Stack

### 2.1 Recommended Agents by Launch Vector

**Monetization Readiness Agents**
| Agent | Role | Justification |
|-------|------|---------------|
| `monetization-architect` (exists, root) | Validate/implement revenue model, pricing tiers, payment flows | Directly owns blocker #1/#2; already present in `.claude/agents/` |
| `payment-integration` | Stripe subscription lifecycle, webhook correctness | homegroups Stripe activation + regroup payment completion (blockers #1, #7, #12) |
| `product-strategy-advisor` (exists, root) | Confirm monetization fits product/market | Already present; pairs with go-to-market skill |

**Product Completeness Agents**
| Agent | Role | Justification |
|-------|------|---------------|
| `product-manager` (exists, root) | Scope discipline: launch vs post-launch | regroup Oxford-flow scoping (blocker #7); enforce Tier-4 deferral |
| `planner` | Break product gaps into sprint tasks | Convert Tier-1/2 list into executable tasks |
| `product-strategy-advisor` (exists) | Kill/prioritize features to the launch bar | Prevents scope creep on weakest products |

**Prioritization Clarity Agents**
| Agent | Role | Justification |
|-------|------|---------------|
| `planner` | Convert ranked blocker list into ordered sprint | §1.2 → §1.3 sequencing |
| `architect` | Identify which tech choices gate others | recovery-api as future bus (blocker #6, #13) |
| `monorepo-health` (exists, root) | Triage cross-package debt ranking | Already present; ranks sub-packages by risk/effort |

**Feature Readiness Agents**
| Agent | Role | Justification |
|-------|------|---------------|
| `tdd-guide` | Tests-first on revenue-critical paths | regroup ~5% coverage; recovery-api untested (blockers #3, #6) |
| `security-reviewer` | Pre-launch scan on auth/payments/Firestore rules | Stripe + Firebase auth surfaces across products |
| `code-reviewer` | Catch quality regressions during sprint | High-velocity launch sprint risk |
| `e2e-runner` | Validate claim-and-pay and onboarding flows | Blocker #1 verification (real-card flow) |
| `build-error-resolver` | Keep CI green during sprint | Multiple stacks, no documented green-gate |
| `doc-updater` | Keep docs in sync with code | The drift in §1.2 is exactly this failure mode |
| `cross-product-integrity` (exists, root) | Enforce data-isolation / referral rules | Prevents cross-Firestore violations pre-bus |

### 2.2 Complete Agent Stack — Priority Order

1. `monetization-architect` — unblocks first revenue (highest leverage).
2. `payment-integration` — completes Stripe/regroup payment paths.
3. `tdd-guide` — closes the feature-readiness gap that drags the overall score.
4. `planner` — turns the blocker list into an ordered sprint.
5. `security-reviewer` — gates auth/payment/Firestore before exposure.
6. `e2e-runner` — proves the revenue path actually works.
7. `product-manager` / `product-strategy-advisor` — hold the launch scope line.
8. `code-reviewer` + `build-error-resolver` — sustain quality through the sprint.
9. `doc-updater` + `cross-product-integrity` + `monorepo-health` — keep docs honest and isolation intact.

---

## Part 3: Full Claude Code Configuration

_(Tables below are verified against the working tree on 2026-06-03.)_

### 3.1 Recommended Skills

| Skill                                                    | Launch Vector     | When to Use                                    | Justification                                    |
| -------------------------------------------------------- | ----------------- | ---------------------------------------------- | ------------------------------------------------ |
| `stripe:stripe-projects`, `stripe:stripe-best-practices` | Monetization      | Activating/validating Stripe prices & webhooks | Blocker #1/#8                                    |
| `recovery-app-go-to-market`                              | Monetization      | Pricing/positioning validation                 | Domain-specific GTM for these products           |
| `firebase:firebase-security-rules-auditor`               | Feature Readiness | Auditing Firestore rules per project           | 4 separate Firebase projects, auth-sensitive     |
| `e2e-testing`, `mobile-e2e`                              | Feature Readiness | Claim-and-pay + RN onboarding flows            | Blocker #1 verification; RN products             |
| `error-tracking`                                         | Feature Readiness | Wiring Sentry/Crashlytics                      | Blocker #9                                       |
| `security-review`, `security-scan`                       | Feature Readiness | Pre-launch auth/payment scan                   | Stripe + Firebase auth surfaces                  |
| `doc-organizer-recovery` (exists)                        | Prioritization    | Keeping `/docs` current & non-stale            | Already installed; directly addresses §1.2 drift |
| `codebase-review`, `gsd-audit-milestone`                 | Prioritization    | Triaging remaining tech debt                   | regroup readiness gap                            |
| `deployment-patterns`, `github`                          | Feature Readiness | CI green-gate per product                      | Blocker #10                                      |

### 3.2 Recommended Hooks

| Hook Type               | Trigger                                          | Command                                    | Launch Gate Enforced       | Status                               |
| ----------------------- | ------------------------------------------------ | ------------------------------------------ | -------------------------- | ------------------------------------ |
| PostToolUse             | Edit/Write to `/recovery-api/src/`               | `npm run typecheck` (tail 30)              | Type safety on the API bus | **EXISTS** (`.claude/settings.json`) |
| PostToolUse             | Edit/Write `*.ts/js/json/md` in `/recovery-api/` | `prettier --write`                         | Formatting                 | **EXISTS**                           |
| PreToolUse              | Edit/Write to `**/.env*`                         | Block + point to Secret Manager            | No secrets in source       | RECOMMEND                            |
| PreToolUse / pre-commit | Any commit                                       | secret-scan (e.g. semgrep/gitleaks)        | No leaked credentials      | RECOMMEND (blocker #4)               |
| PostToolUse             | Edit to payment/auth/Stripe files                | Run `security-reviewer` agent              | Pre-launch security gate   | RECOMMEND                            |
| PostToolUse             | Edit to `**/*.test.*` / `**/__tests__/**`        | Run that product's test command            | Tests stay green           | RECOMMEND                            |
| Stop                    | Session end                                      | Remind to run `/code-review` and `/verify` | Review-before-close        | RECOMMEND (blocker #15)              |

> Existing hooks cover only recovery-api typecheck + prettier. There is **no secret-scan,
> no payment/auth review gate, and no Stop reminder** — the highest-value additions for launch.

### 3.3 Recommended MCP Servers

| Server     | Status                                       | Launch Vector     | Justification                                 |
| ---------- | -------------------------------------------- | ----------------- | --------------------------------------------- |
| `firebase` | **ACTIVE** (`.mcp.json`, dir → recovery-api) | All               | 4 Firebase projects; core infra               |
| `context7` | **ACTIVE** (`@upstash/context7-mcp@3.0.0`)   | Feature Readiness | Up-to-date library docs                       |
| `serena`   | ACTIVE (session MCP)                         | All               | Symbol-aware code navigation/editing          |
| `stripe`   | **RECOMMENDED**                              | Monetization      | Payment backbone; not configured (blocker #8) |
| `github`   | **RECOMMENDED**                              | Feature Readiness | PR/CI workflow automation                     |
| `sentry`   | **RECOMMENDED**                              | Feature Readiness | Error tracking (blocker #9)                   |
| `semgrep`  | **RECOMMENDED**                              | Feature Readiness | Secret/vuln scanning (blocker #4)             |

### 3.4 CLAUDE.md Recommendations

**Root `CLAUDE.md` (strong; gaps):**

- Add an explicit **cross-product launch-sequencing** section (which product ships first and why) — currently implicit (blocker #11).
- Add a **Definition of Done / launch bar** (test-coverage floor, security-scan pass, error-tracking wired) so the four vectors have written acceptance criteria.
- The Privacy / Secrets / Error-logging cross-cutting rules are present and good — keep, and add a line referencing the secret-scan hook once added.

**Per-project `CLAUDE.md`:**

- `recovery-api`: add a **testing section** — it is the intended integration bus and has no test signal (blocker #6).
- `regroup`: add a **launch-readiness/coverage section** linking the gap-analysis doc, so the ~5% coverage state is visible at the top of context (blocker #3).
- `detox-recovery`: add a **monetization-activation checklist** (MailerLite, Lemon Squeezy PDF migration) (blocker #2).
- `shared`: add a one-line note that it is intentionally empty pending cross-product referral types (blocker #13).

---

## Part 4: Repository Overview

### 4.1 Architecture & Structure

- **Type:** flat monorepo, **no workspace tooling** (no root `package.json` workspaces, `pnpm-workspace.yaml`, `turbo.json`, or `nx.json` — verified).
- **Components (6):** `recovery-api/` (Firebase Functions v2, TS — cross-app service), `homegroups/` (Homegroups; RN + Firebase + Redux + Stripe), `regroup/` (Regroup; RN 0.72 + Cloud Functions + Angular web), `detox-recovery/` (NextStep; Next.js 15), `shared/` (**empty**), plus `.claude/` tooling.
- **Integration topology:** products are independent today (separate Firebase projects, auth, Firestore). `recovery-api` is the _intended_ future integration bus exposing 5 callables (`createReferral`, `getReferrals`, `getReferral`, `getUserProfile`, `updateUserProfile`) with `X-Service-Key`/`X-App-Id`/`X-User-Uid` auth (Phase 1).
- **Existing `.claude/` config (verified):** 6 root agents (`cross-product-integrity`, `documentation-architect`, `monetization-architect`, `monorepo-health`, `product-manager`, `product-strategy-advisor`); 5 skills (`doc-organizer-recovery`, `engineer-prompt-for-skill`, `monorepo-run-check`, `new-referral-flow`, `prompt-engineer`); 2 recovery-api PostToolUse hooks; MCP = firebase + context7 only.

### 4.2 Current State by Project

- **homegroups (Homegroups):** most mature. V4 features shipped; Stripe integration present; launch gated on setting live default prices + claim-and-pay verification. Maps key now env-based.
- **detox-recovery (NextStep):** tech-complete Next.js 15; revenue gated on contact-form bug + email automations + paid-PDF migration. Closest to first revenue.
- **regroup (Regroup, Regroup):** lowest feature-readiness; ~5% test coverage on critical paths; payments + Oxford-house flow incomplete; pricing strategy documented but not implemented.
- **recovery-api:** functional 5-callable service; **no test suite**; foundation for future cross-app integration.
- **shared:** empty placeholder.

### 4.3 Future Desired State

- `recovery-api` becomes the integration bus: cross-app referrals via `POST /api/referrals` instead of direct Firestore cross-queries; Phase 2 adds Firebase custom-token auth with an `appId` claim.
- `shared/` holds cross-product referral types/utilities.
- Each product reaches a written launch bar (coverage floor, security scan, error tracking) enforced by hooks.

---

## Per-Project Sections

### Project: recovery-api

**Stack:** Firebase Functions v2 (TypeScript), Firebase project `recovery-platform`.
**Launch Score:** 6/10 (service works; untested; not yet the live bus).

#### Pre-Launch Blockers

- HIGH — No test suite on the 5 callables (`recovery-api/CLAUDE.md`; no test dir).
- MEDIUM — Phase 2 token auth not implemented (`recovery-api/CLAUDE.md`).

#### Launch-Accelerating Agent Stack

`tdd-guide` (Feature) → `security-reviewer` (Feature) → `architect` (Prioritization) → `code-reviewer` (Feature) → `cross-product-integrity` (Product).

#### Optimal Claude Code Configuration

Skills: `e2e-testing`, `security-review`. Hooks: payment/auth review gate (already has typecheck+prettier). MCP: `github`, `sentry`. CLAUDE.md: add testing section.

### Project: homegroups (Homegroups)

**Stack:** React Native (TS) + Firebase (`recovery-connect-cad4b`) + Redux Toolkit + Stripe.
**Launch Score:** 7/10 (most launch-ready; activation-gated).

#### Pre-Launch Blockers

- CRITICAL — Intergroup/treatment-center Stripe default prices unset → silent checkout failure (`homegroups/docs/product/roadmap.md` R-1/R-2).
- HIGH — Rotate old Google Maps key in GCP Console (`homegroups/functions/src/api/api.ts:9-15` — env-based; rotation pending).

#### Launch-Accelerating Agent Stack

`monetization-architect` (Monetization) → `payment-integration` (Monetization) → `e2e-runner` (Feature) → `security-reviewer` (Feature) → `product-manager` (Product).

#### Optimal Claude Code Configuration

Skills: `stripe:stripe-projects`, `mobile-e2e`, `firebase:firebase-security-rules-auditor`. Hooks: Stripe/auth review gate, secret-scan. MCP: `stripe`, `sentry`. CLAUDE.md: keep maps-rotation note until completed.

### Project: regroup (Regroup)

**Stack:** React Native 0.72 + Firebase Cloud Functions + Angular web, Firebase `phoenix-cleanhouse`.
**Launch Score:** 4/10 (weakest; coverage + incomplete flows).

#### Pre-Launch Blockers

- CRITICAL — ~5% test coverage on payment/auth/dispute paths (`regroup/docs/technical/gap-analysis-production-readiness.md` §1.2; `readiness-report.md`).
- HIGH — Payments + Oxford-house resident flow incomplete (same gap-analysis).

#### Launch-Accelerating Agent Stack

`tdd-guide` (Feature) → `payment-integration` (Monetization) → `planner` (Prioritization) → `product-manager` (Product) → `security-reviewer` (Feature).

#### Optimal Claude Code Configuration

Skills: `e2e-testing`, `mobile-e2e`, `codebase-review`, `gsd-audit-milestone`. Hooks: test-on-edit, secret-scan. MCP: `stripe`, `sentry`. CLAUDE.md: add coverage/readiness section.

### Project: detox-recovery (NextStep)

**Stack:** Next.js 15, Firebase `nextstep-recovery`.
**Launch Score:** 7/10 (tech-complete; revenue wiring pending).

#### Pre-Launch Blockers

- CRITICAL — Contact-form `from` double-wrap bug; unwired MailerLite automations; 5 paid PDFs behind Lemon Squeezy migration (`detox-recovery/docs/superpowers/plans/2026-05-27-launch-blockers.md`).

#### Launch-Accelerating Agent Stack

`monetization-architect` (Monetization) → `product-strategy-advisor` (Monetization) → `e2e-runner` (Feature) → `code-reviewer` (Feature) → `doc-updater` (Prioritization).

#### Optimal Claude Code Configuration

Skills: `recovery-app-go-to-market`, `stripe:stripe-best-practices`, `vercel:nextjs`, `error-tracking`. Hooks: Stripe/email review gate. MCP: `stripe`, `vercel`, `sentry`. CLAUDE.md: add activation checklist.

### Project: shared

**Stack:** TypeScript (reserved). **Launch Score:** N/A (empty — verified 0 files).

#### Pre-Launch Blockers

- MEDIUM — Empty despite a platform-wide cross-product referral concept (`shared/`).

#### Launch-Accelerating Agent Stack

`architect` (Prioritization) → `cross-product-integrity` (Product). Post-launch.

#### Optimal Claude Code Configuration

Skills: `api-design`. CLAUDE.md: add a one-line "intentionally empty pending referral types" note.

---

## Appendix: Implementation Roadmap

### This Week (Launch-Blocking)

1. **Set homegroups intergroup/treatment-center Stripe default prices** and run claim-and-pay with a real card (incognito, confirm `pk_live_`). Without this, every paid checkout throws silently — shortest path to first paying customer.
2. **Fix detox contact-form `from` double-wrap bug** and verify delivery — unblocks the closest-to-revenue product.
3. **Smoke-test regroup revenue-critical paths** (payment/auth/dispute happy paths green) — enough to launch without waiting on full coverage.

### Next 30 Days (Revenue-Enabling + Quality)

- Wire detox MailerLite automations; migrate 5 paid PDFs to Lemon Squeezy.
- Add `stripe` + `github` + `sentry` MCP servers; add Stripe/auth PostToolUse review hook and a repo-wide secret-scan hook.
- Rotate the old Google Maps key in GCP Console; set the new secret.
- Stand up error tracking; add a minimal recovery-api test suite; raise regroup coverage on critical paths.

### Post-Launch (Deferred)

- Populate `shared/` with cross-product referral types; implement recovery-api Phase 2 token auth.
- Implement regroup full pricing strategy.
- Document cross-product launch sequencing and a written launch Definition-of-Done in root `CLAUDE.md`.

---

**Note:** All findings are grounded in files read during this analysis. Configuration and structural
claims (Parts 3–4) were directly verified against the working tree; launch-readiness and blocker
claims (Parts 1–2) derive from the products' `/docs` and `CLAUDE.md` files. One doc-vs-code
discrepancy was found and corrected (§1.2, the Google Maps key). Any claim without a source-file
citation should be treated as uncertain and verified independently before action.
