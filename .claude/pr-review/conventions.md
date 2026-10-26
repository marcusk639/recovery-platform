# Practised conventions per package

These are what the code actually does, so a PR that departs from them needs a reason. The package
`CLAUDE.md` files are the source of truth and hold the detail. Read the relevant one rather than relying on this summary.

| Package        | Instructions                                                                                                                                                           |
| -------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Repo root      | `CLAUDE.md`                                                                                                                                                            |
| homegroups     | `homegroups/CLAUDE.md`, `homegroups/functions/CLAUDE.md`, `homegroups/mobile/CLAUDE.md`, `homegroups/web/CLAUDE.md`                                                    |
| regroup        | `regroup/CLAUDE.md`, `regroup/functions/CLAUDE.md`, `regroup/mobile/CLAUDE.md`, `regroup/web/CLAUDE.md`; mobile rules in `regroup/mobile/.claude/rules/conventions.md` |
| recovery-api   | `recovery-api/CLAUDE.md`                                                                                                                                               |
| detox-recovery | `detox-recovery/CLAUDE.md`                                                                                                                                             |

## Callable auth and input validation

| Package              | Pattern                                                                                                                                                                                                                                                                                                                                                    |
| -------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| homegroups/functions | `requireAuth(request)` and `validateData(schema, request.data)` from `homegroups/functions/src/utils/callableWrapper.ts` (Zod). Scaffold: the `homegroups-new-callable` skill.                                                                                                                                                                             |
| regroup/functions    | Inline `if (!request.auth) throw new HttpsError('unauthenticated', ...)`, then `parseInput(schema, request.data)` from `regroup/functions/src/validation/index.ts` (zod, strips unknown keys). Authorisation through `regroup/functions/src/util/houseAuth.ts`, `regroup/functions/src/util/authGuard.ts` and `regroup/functions/src/util/entitlement.ts`. |
| recovery-api         | `requireServiceAuth(request)` from `recovery-api/src/middleware/auth.ts`, with app ids resolved through `recovery-api/src/config/apps.ts`.                                                                                                                                                                                                                 |

A new callable that skips its package's pattern is worth a comment. One that skips auth entirely must be on
the list in `false-positives.md` or be a finding.

## Errors and logging

- Throw `HttpsError` with a fixed, generic message. Log the full error server-side with ids only.
- Use the Firebase `logger` in functions, not `console`. Log ids, never names, emails or recovery details.
- Some client code matches on server error messages (see callable in `contract-map-homegroups.md`). Changing those strings is a contract change.

## Money

- Integer cents end to end, with branded types in regroup (`regroup/functions/src/util/money.ts`).
- Stored payment amounts are cents. If a package `CLAUDE.md` says otherwise, check the code, since docs here have lagged the code.
- Webhooks claim an event before doing the work and mark it done after (`regroup/functions/src/webhooks/stripeWebhook.ts`).
- Signature verification uses the raw body and a per-endpoint secret (`regroup/functions/CLAUDE.md`).
- regroup entitlement gating and its deliberate exceptions are in `regroup/functions/CLAUDE.md`.

## Functions runtime

- `setGlobalOptions`: homegroups in `homegroups/functions/src/index.ts` (no region), regroup in
  `regroup/functions/src/init.ts` (no region), recovery-api in `recovery-api/src/config.ts` (sets `us-central1`).
- Callables are v2 everywhere. homegroups keeps most Firestore triggers on v1 on purpose. Don't flag a v1
  trigger as outdated. Do flag a v1 `onCall` given a `region` (class 6).
- regroup functions are split across two codebases (`regroup/firebase.json` and `regroup/web/firebase.json`).

## TypeScript strictness

| Package              | `strict`                                                                  |
| -------------------- | ------------------------------------------------------------------------- |
| recovery-api         | on                                                                        |
| regroup/functions    | on                                                                        |
| detox-recovery       | on                                                                        |
| homegroups/functions | off. Implicit `any` and unchecked nulls compile, so read types carefully. |
| homegroups/web       | plain JS, no types                                                        |
| regroup/web          | old TypeScript (Angular); check `regroup/web/CLAUDE.md`                   |

## Repo-wide

- New source files ≤ 300 lines (pre-commit). Split oversized files by extracting modules.
- Commit scope names the product (`fix(regroup-mobile): ...`), per `scripts/git-hooks/commit-msg`.
- Coverage floors only go up.
- PRs land as squash merges.
- Cross-product flows go through recovery-api. See `contract-map-cross-product.md`.
