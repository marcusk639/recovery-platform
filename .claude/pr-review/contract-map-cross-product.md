# Contract map: cross-product and repo-wide links

The map is guidance, not truth. Confirm every link by grep or read before reporting on it.
Which file owns which link type is listed at the top of `contract-map-homegroups.md`.

Root rules: `CLAUDE.md` (data isolation, privacy, secrets) and `recovery-api/CLAUDE.md`.
Vocabulary differs per product: `docs/ecosystem/vocabulary.md`.

## recovery-api

No consumer imports recovery-api. Each one hand-copies the contract: `X-*` headers, the `{ data }` request
envelope and `{ result }` response, app-id strings, the function name in the URL, and the `DirectoryMeeting` shape.
A one-sided change compiles and passes both packages' tests, then fails at runtime. The directory clients
return `[]` on any error, so the failure looks like "no meetings".

Surface (`recovery-api/src/index.ts`): `createReferral`, `getReferrals`, `getReferral`, `getUserProfile`,
`updateUserProfile`, `findMeetings`, `health`, plus the `refreshDirectory` schedule and identity/user stubs.
Region is set in `recovery-api/src/config.ts`. Auth is `requireServiceAuth` in `recovery-api/src/middleware/auth.ts`.
The app registry `recovery-api/src/config/apps.ts` is the source of truth for app ids.

Consumers:

| Consumer       | Client                                                     | Caller and mapping                                                                                                                                                                      |
| -------------- | ---------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| homegroups     | `homegroups/functions/src/api/recoveryApi.ts`              | `homegroups/functions/src/callable/findMeetings.ts`, `homegroups/functions/src/utils/directoryMapping.ts`, `homegroups/functions/src/entities/DirectoryMeeting.ts`                      |
| regroup        | `regroup/functions/src/api/recoveryApi.ts`                 | `regroup/functions/src/callable/meetings.ts`, `regroup/functions/src/util/directoryMapping.ts`, `regroup/functions/src/entities/DirectoryMeeting.ts`, `regroup/functions/src/config.ts` |
| detox-recovery | `detox-recovery/app/api/contact/route.ts` (referral relay) | Env and URL in `detox-recovery/apphosting.yaml`, `detox-recovery/env.example`                                                                                                           |

Contract tests that pin one side: `homegroups/functions/src/__tests__/api/recoveryApi.test.ts`,
`regroup/functions/src/__tests__/api/recoveryApi.test.ts`. There is no two-sided test.

| If this changes in recovery-api                                               | Check                                                                                                                     |
| ----------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------- |
| A callable export renamed or removed                                          | The URL built in both `recoveryApi.ts` files, and the relay URL in `detox-recovery/apphosting.yaml`                       |
| Header names or semantics in `recovery-api/src/middleware/auth.ts`            | Headers set in both `recoveryApi.ts` files and in `detox-recovery/app/api/contact/route.ts`                               |
| App ids, display names, aliases or flags in `recovery-api/src/config/apps.ts` | `X-App-Id` literals in all three consumers, and detox's display-name and interest-to-app maps in `route.ts`               |
| `findMeetings` schema (`recovery-api/src/callable/findMeetings.ts`)           | The request built in `homegroups/functions/src/callable/findMeetings.ts` and `regroup/functions/src/callable/meetings.ts` |
| `DirectoryMeeting` fields, providers, day/time normalisation                  | `recovery-api/src/entities/DirectoryMeeting.ts` ↔ both consumer entity copies and both `directoryMapping.ts` files        |
| Result limits, default radius, per-bound read limit                           | Both products' result handling                                                                                            |
| `createReferral` schema limits (`recovery-api/src/callable/referrals.ts`)     | Truncation in `detox-recovery/app/api/contact/route.ts`                                                                   |
| Response envelope or the `meetings` key                                       | Response parsing in both `recoveryApi.ts` files (errors become `[]`)                                                      |
| Region or project                                                             | Every base URL: both functions env configs and `detox-recovery/apphosting.yaml`                                           |
| `firebase-functions` upgrade (App Check, CORS defaults)                       | All raw `fetch` callers                                                                                                   |

| If this changes in a consumer                        | Check                                                                                                              |
| ---------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------ |
| `X-App-Id` value, header set, or `{ data }` wrapping | `recovery-api/src/middleware/auth.ts` and `recovery-api/src/config/apps.ts` (the app must be allowed to originate) |
| Env var names for base URL or key                    | That package's env example and deploy config. detox uses different names from the functions packages.              |
| A new server-to-server call                          | It checks the response status, logs only non-PII status, and has a test pinning URL, headers and envelope          |
| A new holder of the service key                      | Security-relevant. The key value must never be logged, committed or sent to a client.                              |

Cross-product referrals go through `createReferral`. See the `new-referral-flow` skill (`.claude/skills/`).

## twin-helper

Helpers and entities duplicated between `homegroups/functions/src/` and `regroup/functions/src/`.
When a PR edits one twin, ask whether the other needs the same change, and say which way you decided.

| Pair                                                                                                                                                                        | Relationship                                                                     |
| --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------- |
| `homegroups/functions/src/entities/DirectoryMeeting.ts` ↔ `regroup/functions/src/entities/DirectoryMeeting.ts`                                                              | Identical; a third copy lives in `recovery-api/src/entities/DirectoryMeeting.ts` |
| `homegroups/functions/src/api/recoveryApi.ts` ↔ `regroup/functions/src/api/recoveryApi.ts`                                                                                  | Identical except the app id                                                      |
| `homegroups/functions/src/api/api.ts` ↔ `regroup/functions/src/api/api.ts`                                                                                                  | Meeting-source fetch helpers. Fixes in one may need porting to the other.        |
| `homegroups/functions/src/utils/location.ts` ↔ `regroup/functions/src/util/location.ts`                                                                                     | Drifted in import style only                                                     |
| `homegroups/functions/src/utils/date.ts` ↔ `regroup/functions/src/util/date.ts`                                                                                             | Formatting helpers, partly drifted                                               |
| `homegroups/functions/src/utils/directoryMapping.ts` ↔ `regroup/functions/src/util/directoryMapping.ts`                                                                     | Different code that encodes the same server enums                                |
| `homegroups/functions/src/utils/email.ts` ↔ `regroup/functions/src/util/email.ts`                                                                                           | Shared sender identity                                                           |
| Meeting-source response entities (`AAMeetingResponse`, `NAMeetingResponse`, `MeetingLocation`, `RatsLocation`, `GeocodeResponse`, `CelebrateRecoveryMeeting`, `BaseEntity`) | Same names in both `entities/` folders, some drifted                             |

recovery-api already has hardened meeting identity and geohash helpers in `recovery-api/src/lib/meetings/identity.ts`.
A PR adding new hashing or geohash helpers in a product (for example next to `regroup/functions/src/util/geohash.ts`)
should say why it isn't reusing that logic.

Twin helpers are a known cost. `shared/` does not exist yet (root `CLAUDE.md`). Don't flag duplication itself,
only a fix applied to one twin that the other also needs.

## config-coupling

| If this changes                                                                                                                                                                 | Check                                                                                                                                                                                                     | Why                                                                                       |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------- |
| `.firebaserc` or a hard-coded project id                                                                                                                                        | The product-to-project table in root `CLAUDE.md`. A product must never point at another product's project.                                                                                                | Class 14. Ambient-project mistakes are class 11.                                          |
| `firebase.json` (functions source, codebases, predeploy, emulator ports)                                                                                                        | The other `firebase.json` files for that product: `regroup/firebase.json`, `regroup/web/firebase.json`, `regroup/mobile/firebase/firebase.json`, `homegroups/firebase.json`, `recovery-api/firebase.json` | regroup splits functions, hosting and rules across three files. Ports differ per package. |
| Runtime or engines in `*/functions/package.json`                                                                                                                                | `firebase.json` runtime and CI Node version in `.github/workflows/ci.yml`                                                                                                                                 | They must agree.                                                                          |
| A dependency major bump (`firebase-functions`, `firebase-admin`, `zod`, `stripe`, React Native)                                                                                 | Other packages on the old major, and behaviour changes in the bump                                                                                                                                        | Majors differ across packages on purpose. Some are kept in step deliberately.             |
| An env var name                                                                                                                                                                 | Its env example, deploy config (`detox-recovery/apphosting.yaml`), secret declarations on the function, and any scripts that generate env files                                                           | Renames break deploys silently.                                                           |
| `.github/workflows/ci.yml`                                                                                                                                                      | That the change does what the PR claims                                                                                                                                                                   | It is the only workflow GitHub runs for products.                                         |
| A nested workflow: `homegroups/.github/workflows/ci.yml`, `regroup/.github/workflows/ci.yml`, `regroup/.github/workflows/deploy.yml`, `detox-recovery/.github/workflows/ci.yml` | Note that it has no effect                                                                                                                                                                                | GitHub only reads the root `.github/workflows/`.                                          |
| Package lists in hooks and scripts                                                                                                                                              | `scripts/git-hooks/pre-push`, `scripts/git-hooks/commit-msg` (scope list), `scripts/session-check.sh`, `scripts/test-prep.sh`                                                                             | Adding or renaming a package needs every list updated.                                    |
| `scripts/git-hooks/pre-commit`                                                                                                                                                  | `scripts/install-git-hooks.sh` and the gates root `CLAUDE.md` describes                                                                                                                                   | Hooks are local only. CI does not re-check them.                                          |
| `docs/launch-readiness/` runbooks                                                                                                                                               | The project ids and URLs they name, against `.firebaserc` and deploy config                                                                                                                               | Runbooks drift from config.                                                               |

## logging

Norm: server code uses the Firebase `logger` with ids only. Clients log through the package logger.
PII must never be logged (root `CLAUDE.md`). Full error objects are logged server-side, and only sanitised messages go to clients.

| If this changes                                                                          | Check                                                                                                                                                                                                                          |
| ---------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Any added `logger.*` / `console.*` call                                                  | Arguments for `email`, `clientEmail`, `clientName`, `displayName`, `name`, `phone`, `sobrietyDate`, `address`, tokens, or raw `request.data` / request bodies. Check multi-line calls too.                                     |
| `regroup/mobile/src/util/logging.ts` or `regroup/mobile/src/util/simple-debug-logger.ts` | Their PII rule (`regroup/mobile/CLAUDE.md`) still holds, callers don't pass whole user or guest objects, and nothing imports `debug-logger` (forbidden by `regroup/mobile/CLAUDE.md` as a PII leak; use `simple-debug-logger`) |
| Error handling that forwards a third-party message to the client                         | Messages should be fixed strings (`HttpsError` with a fixed message). A raw upstream message can carry details.                                                                                                                |
| Logging around Stripe or recovery-api calls                                              | Log status and ids, never keys or customer details                                                                                                                                                                             |

Model to follow: recovery-api logs only zod issue paths, never input values.

## tests

| If this changes                                                                                 | Check                                                                                                                                                                                            | Why                                                              |
| ----------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------- |
| A test file deleted, renamed, skipped, or assertions weakened                                   | `.claude/agent-gates/verify-diff.sh` categories (deleted, disabled, hollow assert, count drop, snapshot churn)                                                                                   | The installed pre-commit runs it locally. CI does not.           |
| A test that mocks the other side of a contract                                                  | Whether reverting the fix would still pass. Mocks of Firebase or Stripe can hide the behaviour under test.                                                                                       | Class 10.                                                        |
| Fixtures                                                                                        | Fixture fields and ids against what production writes                                                                                                                                            | Fixtures production never produces.                              |
| Coverage floors in jest configs (recovery-api, homegroups/functions, detox-recovery)            | They are ratchets: raise, never lower (root `CLAUDE.md`)                                                                                                                                         | A lowered floor is a finding.                                    |
| Rules tests                                                                                     | `homegroups/functions/src/tests/security-rules.test.ts`, `regroup/mobile/firebase/__tests__/firestore.rules.test.ts`, and whether CI runs each                                                   | A rules change "covered" by a suite CI never runs is unverified. |
| Region regression tests                                                                         | `homegroups/functions/src/__tests__/joinGroupByInviteCode.test.ts`, `homegroups/functions/src/__tests__/adminRemoval.test.ts`, `homegroups/functions/src/__tests__/sendGroupInviteEmail.test.ts` | They pin callable regions. Changing them needs a reason.         |
| E2E and Maestro flows (`regroup/e2e/`, `homegroups/mobile/maestro/flows/invite-code-join.yaml`) | Whether CI treats failures as blocking                                                                                                                                                           | Some jobs are non-blocking.                                      |

## review-config

The reviewer's knowledge and scripts run from the base branch, so a PR's edits to them don't apply to its own review. The workflow file is the exception: `pull_request` runs the PR's own copy, so an edit to it does take effect in that PR's run.

| If this changes                                                        | Check                                                                                                                                                                                                                                           |
| ---------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `.github/workflows/claude-code-review.yml`                             | Permissions stay `contents: read`, `pull-requests: write`, `issues: read`, `id-token: write`; checkouts keep `persist-credentials: false`; draft, `e2e-fix/*` and fork guards remain; scripts run from the base checkout; full output stays off |
| `.claude/pr-review/routing.json`                                       | Every `linkType` still has exactly one `## <linkType>` heading across the three contract maps (`.claude/pr-review/checks/test/knowledge.test.mjs`)                                                                                              |
| A contract map, `checklist.md`, `conventions.md`, `false-positives.md` | Backticked paths exist (same test). No current exploitable weakness or secret is written into a committed file.                                                                                                                                 |
| `.claude/pr-review/checks/` scripts                                    | Node built-ins only, no installs, files ≤ 300 lines, tests under `.claude/pr-review/checks/test/`                                                                                                                                               |
| Workflow: the model's runtime (`claude_args`, `settings`) | `--strict-mcp-config` stays, so only the action's own MCP servers load (never a PR's `.mcp.json`), and `settings` keeps `"disableAllHooks": true`, so no hook from the checkout runs |
| Workflow: the model's tools (`claude_args`) | No `Bash`; `MultiEdit`, `NotebookEdit`, `WebFetch` and `WebSearch` stay in `--disallowedTools`. No inline-comment MCP tool: `mcp__github_inline_comment__create_inline_comment` stays in `--disallowedTools`; the model writes `<OUT>/inline.json` and publish posts it. `Write`/`Edit` are allowed only as `Write(/<OUT>/**)` and `Edit(/<OUT>/**)`; workspace `Write(...)`/`Edit(...)` stay denied; reads of the workspace `.git/**` and of `//proc/**` stay denied; `Write`/`Edit` of `<RUNNER_TEMP>/_runner_file_commands/**` (GITHUB_ENV and the other command files) and `<RUNNER_TEMP>/prstate-snapshot/**` stay explicitly denied |
| Workflow: Run start step | Sets `RUN_STARTED_AT`, `OUT` and `STATE_FILE` through `GITHUB_ENV` before any other step (the `runner` context is not available in a job-level `env`); facts and publish fail closed when `OUT` or `STATE_FILE` is unset |
| Workflow: state snapshot | `STATE_FILE` stays outside the model's `--add-dir` (only `<OUT>` is added); publish reads it, never `<OUT>/state.json` |
| Workflow: "Restore reviewer knowledge from base" step | Still runs after Facts and before Review, replacing the working tree's `.claude/pr-review/` with the base copy |
| Workflow: Publish step secrets | `PR_REVIEW_ID_KEY` and `SECURITY_ADVISORY_TOKEN` appear only in the Publish step's `env`, never in Facts, Review or a job-level `env` |
| Workflow: Publish step node process | The step's own `env` sets `NODE_OPTIONS: ""` and `BASH_ENV: ""` (step env overrides anything exported through `GITHUB_ENV`, so nothing preloads into the node process or the bash shell that starts it), and `node` runs with `--no-warnings` only, no other flags taken from the environment |
| Workflow: base checkout | "Clear base checkout path" (`rm -rf .review-base`) runs before "Checkout base (trusted scripts)", so a `.review-base/` shipped in the PR head is never reused; facts runs from `.review-base` |
| Workflow: scripts not on base | When the base has no `facts.mjs`, Facts outputs `tier=none` and `max_turns=0`, so the Review step (the model run) is skipped |
| Workflow: publish checkout | `.review-publish` is removed, then checked out fresh from the base SHA after Review (`persist-credentials: false`); publish runs from it |
| Workflow: job `if` | Skips Dependabot (`github.actor != 'dependabot[bot]'`; its runs get no secrets) as well as drafts, `e2e-fix/*` and forks |
