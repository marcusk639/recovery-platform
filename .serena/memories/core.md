# recovery-platform core

Flat monorepo of independent products, each its own Firebase project; never cross-query Firestore between products (cross-product flows go through `recovery-api`). Authoritative per-area rules live in each package's CLAUDE.md and `.claude/rules/*.md` (path-scoped via `paths:` frontmatter).

## Source map
- `recovery-api/` — cross-app API (Functions). Emulator ports offset (5002/8082/9100).
- `homegroups/` — 12-step groups: `mobile/` (RN 0.72), `web/`, `functions/`.
- `regroup/` — sober living: `mobile/` (RN app, codename `rats`), `web/` (Angular 9), `functions/`. Mobile layout, native pins, payments/notification surfaces and test baseline: `mem:regroup/mobile/core`.
- `detox-recovery/` — Next.js product.
- `e2e-maestro/` — Maestro Cloud flows run by CI; `scripts/git-hooks/` source of installed hooks; `.claude/agent-gates/verify-diff.sh` test-tamper gate.
- `docs/superpowers/{specs,plans}/` — Superpowers design docs and plans (repo-level); product-level ones under `<product>/mobile/docs/superpowers/`.

## Invariants
- Vocabulary: `meeting` = 12-step meeting in every product (as in homegroups). Sober-living house meetings are a separate concept, "house meeting" (`regroup:house-meeting`). Regroup code (`functions/src/callable/meetings.ts`) still says "meeting" for house meetings: legacy naming. Regroup `guest` = resident.
- Never log PII; log full errors server-side, sanitized messages to clients.
- Coverage floors are ratchets (raise only). Test files/counts guarded by verify-diff (pre-commit + CI `test-tamper`).
- Commit scope must name the product (`fix(regroup-mobile): …`).
- `.claude/settings.json` denies every force-push form and `--no-verify`; branch updates use merge commits. PRs squash-merge.
- Serena indexes the session's start directory; `lib/` dirs are not indexed (Grep them).

Further: tech stack `mem:tech_stack`; commands `mem:suggested_commands`; conventions `mem:conventions`; done-checklist `mem:task_completion`.
