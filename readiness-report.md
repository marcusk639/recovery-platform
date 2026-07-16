---
generated: 2026-07-15
level: 1
level_name: Bare
score: 9
total: 36
stack: node-typescript-monorepo
monorepo: true
pillars:
  style-validation: { pass: 0, total: 4 }
  testing: { pass: 0, total: 5 }
  git-hooks: { pass: 0, total: 5 }
  documentation: { pass: 5, total: 9 }
  agent-config: { pass: 1, total: 5 }
  code-quality: { pass: 0, total: 3 }
  dev-environment: { pass: 2, total: 3 }
  agentic-workflow: { pass: 1, total: 2 }
---

# Harness Readiness Report

**Project:** recovery-platform (TypeScript flat monorepo)
**Level:** 1 / 5 (Bare)
**Score:** 9 / 36 criteria passing
**Delta:** was Level 1, 17/45 (38%) on 2026-05-31 → now 9/36 (25%). Part of the drop is stricter scoring (aggregated criteria now require ALL 7 sub-packages to pass); part is real regression from the Mac migration (see Changes below).
**Sub-packages:** homegroups/mobile, homegroups/functions, regroup/mobile, regroup/functions, regroup/web, detox-recovery, recovery-api

## Pillar Scores

```
Style & Validation    ░░░░░░ 0/4
Testing               ░░░░░░ 0/5
Git Hooks             ░░░░░░ 0/5
Documentation         ███░░░ 5/9
Agent Configuration   █░░░░░ 1/5
Code Quality          ░░░░░░ 0/3
Dev Environment       ████░░ 2/3
Agentic Workflow      ███░░░ 1/2
```

## Monorepo Breakdown (app-scoped criteria: Testing 5 + Code Quality 3)

| Package              | Runner | Colocated | Coverage | Tests Pass     | TDD Rule | ≤300 Lines      | Secrets Clean       | Style Consistent | Score |
| -------------------- | ------ | --------- | -------- | -------------- | -------- | --------------- | ------------------- | ---------------- | ----- |
| homegroups/mobile    | ✓      | ✗         | ✗        | ✓ (CI)         | ✗        | ✗ (142 files)   | ✗ (AIza in config)  | ✓                | 3/8   |
| homegroups/functions | ✓      | ✓         | ✗        | ✓ (CI)         | ✗        | ✗ (52 files)    | ✓ (AIza remediated) | ✓                | 5/8   |
| regroup/mobile       | ✗      | ✓         | ✗        | ✗ (unrunnable) | ✗        | ✗ (181 files)   | ✗ (AIza in config)  | ✗                | 1/8   |
| regroup/functions    | ✓      | ✓         | ✗        | ✓ (CI)         | ✗        | ✗ (23 files)    | ✓                   | ✗ (TSLint)       | 4/8   |
| regroup/web          | ✗      | ✓         | ✗        | ✗ (no CI/conf) | ✗        | ✗ (1 file)      | ✗ (AIza in .ts src) | ✗ (legacy)       | 1/8   |
| detox-recovery       | ✓      | ✓         | ✗        | ✓ (CI)         | ✗        | ✗ (1 file)      | ✓                   | ✓                | 5/8   |
| recovery-api         | ✓      | ✓         | ✗        | ✓ (CI)         | ✗        | ✗ (1 test file) | ✓                   | ✓                | 5/8   |

Note: "Tests Pass" evidence is GitHub Actions main-branch run 29366193051 (success, 2026-07-14) — node_modules is absent in all 7 packages after the Mac migration, so nothing was runnable locally.

## Passing

- ✓ CLAUDE.md exists — 11 files covering root, both products, and all 7 sub-packages, with deliberate lazy-loaded hierarchy
- ✓ Commands sections — every documented command spot-checked against package.json exists (zero phantom commands, including complex `deploy:batched` / `migrate:*` variants)
- ✓ Architecture sections — directory trees, key modules, and data flow documented in all 7 units
- ✓ Critical Gotchas — specific, non-obvious, and current (admin-claim write-ordering rule updated in step with the 2026-07-13 redesign commit)
- ✓ Documentation content quality — exceptionally high signal density; copy-paste commands, silent-failure modes, config quirks, PII traps; almost no boilerplate
- ✓ `.claude/settings.json` exists at repo level (PostToolUse typecheck/prettier/secret-scan + Stop hooks), plus unusually rich sub-package `.claude/` dirs
- ✓ `.env.example` templates — 5/7 packages (recovery-api, detox-recovery, homegroups/functions, regroup/mobile, regroup/functions); detox even has `setup:env` hydration
- ✓ Build/dev commands documented and matching package.json across products
- ✓ Agentic workflow system — Superpowers plugin enabled globally; 6 repo skills + 6 repo agents; per-package run/review skills

## Failing

- ✗ Linter (aggregate) — regroup/mobile has a `lint` script but NO ESLint config file; recovery-api has no linter at all; regroup/functions + regroup/web still on deprecated TSLint
- ✗ Formatter — Prettier config in only 2/7 packages (homegroups/mobile, recovery-api); no root config, no .editorconfig
- ✗ Lint-on-commit — no husky, no lint-staged, no pre-commit framework anywhere
- ✗ No-default-exports rule — absent from every ESLint config
- ✗ Test runner (aggregate) — regroup/mobile scripts reference jest.config.integration.js / jest.config.rules.js that don't exist; regroup/web's angular.json points at a missing karma.conf.js
- ✗ Test colocation (aggregate) — homegroups/mobile: 19 centralized test files vs ~319 source files
- ✗ Coverage threshold — zero `coverageThreshold` occurrences repo-wide (0/7)
- ✗ Tests pass (aggregate) — regroup/mobile (302 test files, unrunnable) and regroup/web (101 specs, no CI job) have no passing evidence; CI also weakens its own gate with `--passWithNoTests --forceExit`
- ✗ TDD enforcement rule file — none at repo or package level (0/7); TDD exists only as global harness culture
- ✗ Pre-commit hook — `.git/hooks/` has only samples; no `.husky/`
- ✗ Pre-push hook — none; nothing runs tests before push
- ✗ Secret scanning at commit time — only a warn-only (always exit 0) Claude PostToolUse hook; non-Claude commits entirely unscanned
- ✗ File size limits — neither stated in any CLAUDE.md/rule nor enforced by any hook
- ✗ Smart test caching — no `.test-passed` mechanism
- ✗ Quality gates documented — no file-size/function-length/complexity limits anywhere in the doc hierarchy
- ✗ Code Review Checklist — reviewer subagents documented in only 2/7 units (homegroups, regroup/web)
- ✗ Auto-generated doc sections — zero `<!-- AUTO:name -->` markers; all counts/trees hand-maintained
- ✗ No drift — recovery-api's `findMeetings` callable missing from recovery-api/CLAUDE.md AND root CLAUDE.md; 90-vs-91 callable count, 16-vs-15 models, 20-vs-21 pages; detox route table omits /privacy and /terms; regroup/functions tree omits compliance.ts/analytics.ts
- ✗ Allow list — no `permissions` block in any repo-level settings file
- ✗ Deny list — none at repo level; global settings has blanket `Bash` allow with empty deny
- ✗ Path-scoped rules — no `.claude/rules/` with `globs:` frontmatter anywhere (regroup/mobile's .claude/*.md docs are ready-made candidates)
- ✗ Enforcement hierarchy — only the .env-commit rule has mechanical backing; PII/error-sanitization/cross-product rules are prose-only, and all enforcement evaporates outside Claude sessions
- ✗ File sizes ≤300 lines — 0/7 apps; bimodal: mobile apps have 142/181 oversized files (worst 2,531 lines), three packages fail by exactly 1 file
- ✗ Secrets in source — AIza keys in Firebase client config (public-by-design, but matches scanner) in both mobile apps; regroup/web bakes the key into environment.ts source
- ✗ Consistent style — repo spans TSLint, legacy .eslintrc, flat config, and no-linter across packages
- ✗ Dependencies install cleanly — node_modules absent in ALL 7 packages post-migration; `npm ls` in recovery-api reports all 13 deps UNMET
- ✗ Session-start validation — the gsd session hooks from the previous audit are gone from settings; no validate-docs mechanism

## Changes Since Last Report (2026-05-31)

- ↑ Now passing: repo-level `.claude/settings.json` (agent-config was 0/5, now 1/5); `.env.example` coverage (dev-env 1/3 → 2/3); the hardcoded AIza key in homegroups/functions was remediated and regroup/mobile added a regression test for it
- ↓ Regressed: **No drift** (findMeetings callable + count rot since the recent homegroups/meetings work); **session-start validation** (gsd SessionStart hooks no longer present — lost in the Mac migration); **regroup/mobile ESLint config** (previously reported configured, now missing); two repo Claude hooks hardcode the old `/Users/marcus/...` path and silently no-op; node_modules wiped by the migration (tests unrunnable locally)
- Methodology note: aggregate criteria now require all 7 sub-packages to pass, which lowers the headline score independent of real changes; the per-app table above is the comparable view
