---
generated: 2026-05-31
level: 1
level_name: Bare
score: 17
total: 45
stack: node-typescript-monorepo
monorepo: true
pillars:
  style-validation: { pass: 1, total: 4 }
  testing: { pass: 8, total: 14 }
  git-hooks: { pass: 0, total: 5 }
  documentation: { pass: 5, total: 9 }
  agent-config: { pass: 0, total: 5 }
  code-quality: { pass: 0, total: 3 }
  dev-environment: { pass: 1, total: 3 }
  agentic-workflow: { pass: 2, total: 2 }
---

# Harness Readiness Report

**Project:** recovery-platform (TypeScript flat monorepo)
**Level:** 1 / 5 (Bare)
**Score:** 17 / 45 criteria passing
**Sub-packages:** homegroups/mobile, homegroups/functions, regroup/mobile, regroup/functions, regroup/web, detox-recovery, recovery-api

## Pillar Scores

```
Style & Validation    ██░░░░  1/4
Testing               ███░░░  8/14
Git Hooks             ░░░░░░  0/5
Documentation         ███░░░  5/9
Agent Configuration   ░░░░░░  0/5
Code Quality          ░░░░░░  0/3
Dev Environment       ██░░░░  1/3
Agentic Workflow      ██████  2/2
```

## Monorepo Breakdown (app-scoped pillars)

| Package              | Test Runner | Tests Exist | Coverage Threshold | File Size OK | Secrets Clean |
| -------------------- | ----------- | ----------- | ------------------ | ------------ | ------------- |
| homegroups/mobile    | pass        | pass        | fail               | fail         | pass          |
| homegroups/functions | pass        | pass        | fail               | fail         | fail (AIza)   |
| regroup/mobile       | pass        | partial     | fail               | fail         | pass          |
| regroup/functions    | pass        | partial     | fail               | fail         | pass          |
| regroup/web          | fail        | fail        | fail               | fail         | pass          |
| detox-recovery       | pass        | pass        | fail               | pass         | pass          |
| recovery-api         | pass        | fail (1)    | fail               | pass         | pass          |

## Passing

- Git repository exists (.git/)
- Sub-package manifests exist (7x package.json)
- Linter configured: ESLint in homegroups/mobile, homegroups/functions, regroup/mobile, detox-recovery; TSLint in regroup/functions and regroup/web; lint scripts present in 6/7 packages
- Test runner configured: Jest in all packages except regroup/web (react-native preset, ts-jest, next/jest per package)
- homegroups/mobile: test files colocated in src/models/**tests**/ and src/store/slices/**tests**/
- homegroups/functions: 55+ test files across src/**tests**/ and src/tests/
- regroup/mobile: test runner configured
- regroup/functions: test runner configured with --runInBand
- detox-recovery: test runner configured; 19 test files covering components, API routes, pages, lib
- recovery-api: test runner configured (ESM Jest via NODE_OPTIONS flag)
- CLAUDE.md exists: root + 9 sub-product CLAUDE.md files
- Architecture section: root covers products, stacks, Firebase projects, integration map; sub-products have directory trees and module counts
- Critical Gotchas: v1 vs v2 callable syntax trap, JWT claims 1000-byte limit, honeypot silent-success contract, Cloud Run CPU throttling, .js import extension requirement, WEB_ORIGIN 4-file change rule — all specific and non-obvious
- No drift: verified recovery-api route tree, detox-recovery pages, homegroups trigger count match codebase
- Content quality: project-specific operational knowledge throughout; no generic boilerplate
- Build/dev commands documented in each sub-product CLAUDE.md
- Agentic workflow system: Superpowers plugin active globally; homegroups/.claude/ has 5 project skills and 4 domain subagents
- Session-start validation: global SessionStart hook runs gsd-check-update.js and gsd-session-state.sh

## Failing

- Formatter: Prettier in homegroups/mobile, regroup/mobile, detox-recovery only; absent from homegroups/functions, regroup/functions, regroup/web, recovery-api
- Lint-on-commit: no husky, no lint-staged, no .pre-commit-config.yaml anywhere
- No default exports rule: import/no-default-export not in any ESLint config
- Coverage threshold: zero coverageThreshold in any jest.config; tests run but never fail on insufficient coverage
- TDD enforcement rule file: no .claude/rules/tdd.md at repo or sub-package level
- recovery-api test files: only health.test.ts exists; referrals.ts and users.ts have no tests
- Pre-commit hook: .git/hooks/ contains only .sample files; no active hook
- Pre-push hook: .git/hooks/ contains only .sample files; no active hook
- Secret scanning: no hook to run it; no gitleaks/detect-secrets config at repo root
- File size limits enforced via hook: no hook; check-file-sizes.js not installed
- Smart test caching: no pre-push hook; no .test-passed SHA cache
- .claude/settings.json: only settings.local.json exists (Serena MCP allows only); no shared checked-in settings with allow/deny lists
- Allow list: repo-level settings allows only MCP tools; global settings uses wildcard '\*'
- Deny list: empty at both repo and global level
- Path-scoped rules: no .claude/rules/ directory at repo root
- Enforcement hierarchy: CLAUDE.md prose has no hook or settings backup
- Source files over 300 lines: reflectionsLibrary.ts (2224), schema.ts (1365), GroupModel.ts (1311), stripeUtils.ts (1120), authSlice.ts (1000), UserModel.ts (651), DirectMessageModel.ts (689), groupsSlice.ts (702), sponsorshipSlice.ts (700), meetings.ts (698), MemberModel.ts (723), TreasuryModel.ts (622), ChatModel.ts (606), generateTreasuryReport.ts (421), scheduledAdminRequestProcessor.ts (370) — and many more
- Hardcoded secret: homegroups/functions/src/api/api.ts:10 contains active Google Maps API key (AIza\*); line 31 has a second AIza key in a comment
- Consistent style: TSLint (deprecated 2019) in regroup/functions and regroup/web vs ESLint elsewhere; inconsistent Prettier adoption; two linting frameworks in one monorepo
- .env.example: regroup/mobile, recovery-api, detox-recovery have templates; homegroups/mobile, homegroups/functions, regroup/functions, regroup/web do not (4/7 missing)
- Unified install: no root package.json; no bootstrap.sh; developers must set up each sub-package independently
- Commands section in root CLAUDE.md: intentionally omitted but no pointer to sub-product files
- Quality gates documented: no file size limits, coverage thresholds, or function length limits in any CLAUDE.md
- Code Review Checklist: review subagents exist but no checklist-format guide for cross-cutting invariants
- Auto-generated sections: no AUTO: markers; all directory trees and module counts are manually maintained

## Recommended Next Steps

### To reach Level 2

1. Add Prettier to homegroups/functions, regroup/functions, recovery-api
2. Migrate regroup/functions and regroup/web from TSLint to ESLint + @typescript-eslint
3. Write referrals.test.ts and users.test.ts for recovery-api (health.test.ts is the only test file)

### Quick wins

4. Rotate and remove the hardcoded Google Maps API key from homegroups/functions/src/api/api.ts — move to Secret Manager
5. Add .claude/settings.json (checked-in, shared) with targeted allow list and deny list blocking force-push and rm -rf
6. Create .claude/rules/tdd.md and .claude/rules/code-quality.md using harness templates
7. Add .env.example to homegroups/mobile, homegroups/functions, regroup/functions, regroup/web
8. Add coverageThreshold to every jest.config: start with { global: { lines: 60 } }

### To reach Level 3

9. Install pre-commit hook (.git/hooks/pre-commit or husky) running: secret scan + lint + file-size check
10. Install pre-push hook running tests with SHA-based caching
11. Add quality gates to root CLAUDE.md: file size limits, coverage minimums
12. Add code review checklist to root CLAUDE.md covering cross-cutting invariants (PII logging, Firestore isolation, security pipeline order, Stripe cents)
13. Create root bootstrap.sh documenting per-product install sequence
