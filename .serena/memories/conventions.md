# Conventions

- Conventional commits, product-scoped (`feat(regroup-mobile):`, `chore(platform):`), body explains why; long-form rationale lives in code comments next to non-obvious native/Gradle config (this repo comments every pin with evidence).
- Build-config decisions are recorded with evidence (npm tarballs, CI run ids) in comments or `<product>/mobile/docs/build/*.md` (e.g. `regroup/mobile/docs/build/stripe-rn-version-decision.md`).
- New source files ≤ 300 lines (pre-commit); split by extracting modules.
- Regroup mobile: relative imports only in source (`@/` alias is Jest-only); `logException` from `src/util/logging.ts` for errors (no console in prod code); `auth` is a singleton from `firebase-setup.ts` (`auth.currentUser`).
- Product-specific conventions: regroup `regroup/mobile/.claude/rules/conventions.md`; homegroups has no rules dir, use `homegroups/mobile/CLAUDE.md`.
