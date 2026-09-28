---
generated: 2026-09-04
level: 1
level_name: Bare
score: 19
total: 36
stack: node-typescript-monorepo
monorepo: true
pillars:
  style-validation: { pass: 2, total: 4 }
  testing: { pass: 0, total: 5 }
  git-hooks: { pass: 4, total: 5 }
  documentation: { pass: 5, total: 9 }
  agent-config: { pass: 2, total: 5 }
  code-quality: { pass: 1, total: 3 }
  dev-environment: { pass: 3, total: 3 }
  agentic-workflow: { pass: 2, total: 2 }
---

# Harness Readiness Report

**Project:** recovery-platform (TypeScript flat monorepo)
**Level:** 1 / 5 (Bare) — gated entirely by `regroup/web`; see below
**Score:** 19 / 36 criteria passing
**Delta:** +10 since 2026-07-15 (was 9/36, Level 1)
**Sub-packages (8):** recovery-api, detox-recovery, homegroups/{functions,web,mobile}, regroup/{functions,web,mobile}

> **Scope change:** the 2026-07-15 report scored 7 sub-packages and omitted `homegroups/web`,
> which has its own `package.json` and is deployable. This report scores 8. A small part of
> the delta is corrected scope, not improvement.

> **Why Level 1 despite 19/36:** levels are gated by the weakest package. `regroup/web`'s test
> runner cannot start, which fails a Level 2 criterion. Seven of eight packages clear Level 2
> and most clear Level 3. Fixing that one package is the single highest-leverage move on this
> report.

## Pillar Scores

```
Style & Validation    ███░░░ 2/4
Testing               ░░░░░░ 0/5
Git Hooks             █████░ 4/5
Documentation         ███░░░ 5/9
Agent Configuration   ██░░░░ 2/5
Code Quality          ██░░░░ 1/3
Dev Environment       ██████ 3/3
Agentic Workflow      ██████ 2/2
```

## Monorepo Breakdown

| Package | Score | Tests | Coverage floor | Files >300 lines | Doc drift |
|---|---|---|---|---|---|
| recovery-api | 26/36 | 14 suites / 124 ✓ | 80/75/78/80 | 0 | none |
| homegroups/functions | 25/36 | 70 suites / 787 ✓ | 75/55/65/75 | 14 | none |
| detox-recovery | 24/36 | 23 suites / 170 ✓ | 90/78/92/90 | 1 | 3 stale doc paths |
| regroup/mobile | 24/36 | 288 suites / 4788 ✓ | none | 81 | none |
| regroup/functions | 23/36 | 44 suites / 678 ✓ | none | 10 | 4 wrong paths |
| homegroups/web | 22/36 | 3 suites / 10 ✓ | none | 11 | skills path stale |
| homegroups/mobile | 22/36 | 19 suites / 98 ✓ | none | 141 | skills path stale |
| regroup/web | 21/36 | **cannot run** | none | 1 | none |

## Passing

- ✓ Linter configured (7/8 packages have a `lint` script; homegroups/web lints via react-scripts)
- ✓ Formatter configured (root `.prettierrc`: semi, singleQuote, printWidth 100)
- ✓ Pre-push hook runs tests (4 fast packages, blocks on failure)
- ✓ Secret scanning wired into pre-commit (Stripe/Anthropic/OpenRouter/AWS/GitHub/PEM/AIza, with Firebase-config allowlist)
- ✓ File-size limit enforced mechanically (`MAX_LINES=300`, blocks new files, warns on legacy)
- ✓ Smart test caching (pre-push SHA cache at `.git/.test-passed`)
- ✓ CLAUDE.md exists for all 8 units (11 files total)
- ✓ Commands sections accurate — every documented npm script verified present in package.json
- ✓ Architecture sections present in all 8 units
- ✓ Quality gates documented and mechanically real
- ✓ Content quality high (region-pinning postmortem, JWT 1000-byte claim limit, Stripe cents-vs-dollars, honeypot silent-200)
- ✓ `.claude/settings.json` exists (typecheck, prettier, secret-scan, session-check, swarm-notify hooks)
- ✓ Enforcement hierarchy real for the 300-line rule (prose in CLAUDE.md + hook enforcement)
- ✓ No hardcoded secrets in source (only client-safe Firebase `AIza` config and an allowlisted test fixture)
- ✓ `.env.example` in 6/8 packages
- ✓ Build/dev commands functional (verified `npm run build` in recovery-api)
- ✓ Dependencies install cleanly in all 8 packages
- ✓ Agentic workflow present (Superpowers plan→TDD→review→verify, plus repo skills incl. judge-review, monorepo-run-check, worktree-dispatch-safety)
- ✓ Session-start validation (`scripts/session-check.sh` as SessionStart hook)

## Failing

- ✗ Lint-on-commit — pre-commit runs secrets + file-size only; no eslint/prettier/lint-staged anywhere, and CI never runs `npm run lint` either
- ✗ No-default-export rule — zero eslint configs enforce it
- ✗ Test runner works in all packages — `regroup/web`'s `angular.json` points at `karma.conf.js`, which has never existed in git history
- ✗ Test colocation — `homegroups/mobile` 18/269 files (6.7%), `homegroups/web` 3/37 (8%)
- ✗ Coverage threshold — only 3/8 packages set one
- ✗ Tests pass everywhere — `regroup/web` executes zero specs
- ✗ TDD enforcement — no TDD rule file anywhere in the repo
- ✗ Critical Gotchas section — only 3 of 8 units have a labelled section
- ✗ Code Review Checklist — none; partially substituted by named reviewer subagents in 2 units
- ✗ Auto-generated doc sections — no `<!-- AUTO: -->` markers, no generate-docs/validate-docs tooling
- ✗ No drift — doc/ restructure and today's skills flattening left stale paths in 5 units
- ✗ No source files over 300 lines — ~258 violations, 222 of them in the two mobile apps
- ✗ Consistent code style — flat ESLint vs legacy `.eslintrc` vs deprecated TSLint (2 packages) vs CRA preset
- ✗ Allow list / deny list — `.claude/settings.json` has no `permissions` block at all
- ✗ Path-scoped rules — no `.claude/rules/` directory at the repo root

## Changes Since Last Report

- ↑ Git Hooks 0/5 → 4/5 — hooks installed from `scripts/git-hooks/` this session
- ↑ Dev Environment 2/3 → 3/3 — dependencies restored in all 8 packages
- ↑ Style & Validation 0/4 → 2/4 — linters/formatter now detectable with deps present
- ↑ Code Quality 0/3 → 1/3 — secret scan now runs clean
- ↑ Agentic Workflow 1/2 → 2/2 — session-start validation confirmed wired
- ↑ Agent Config 1/5 → 2/5 — enforcement hierarchy credited for the 300-line rule
- ↓ Documentation 5/9 → 5/9 (flat) — content quality gained, but drift regressed from the docs
     restructure and this session's skills flattening
- → Testing 0/5 → 0/5 — 7/8 packages now pass tests (was: none runnable), but each criterion
     requires all 8, and `regroup/web` still cannot start its runner
