# Regroup Launch P1: Start-up Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make it impossible for the Maestro suite to drive a production-pointed build. Settle the CI smoke job that may already do so. Create the coverage matrix that is the acceptance checklist for all later phases. Create the Firestore exports bucket the backfills need.

**Architecture:**

- **The guard has two layers.**
  - A Node module (`e2e-build-guard.js`, pure functions plus a small CLI) checks the installed app's ID suffix and its bundle's E2E marker. Every runner script calls it before Maestro starts.
  - A Maestro subflow at the top of every flow refuses any `APP_ID` that isn't an e2e variant, so a bare `maestro test` is caught too.
- **The coverage matrix** is a markdown table with fixed columns. A Node checker validates it and, in `--release` mode, gates the launch.

**Tech Stack:** Node (CommonJS scripts, Jest 29 via `regroup/mobile`'s `jest.config.js`), Maestro 2.x YAML, bash, gcloud.

**Spec:** `docs/superpowers/specs/2026-11-06-regroup-launch-reboot-design.md`, §3.4 (anonymous accounts, verified sources), §4.3 (suite guard, coverage matrix, deferring rows), §5 step 1, §6.1 (backfill row), §9.

## Global Constraints

See `docs/superpowers/plans/2026-11-06-regroup-launch-roadmap.md`. In particular:

- worktree off `origin/main`;
- `git -C`;
- product-scoped commit messages;
- new files ≤ 300 lines;
- no PII;
- every PR updates the docs it changes.

These changes land on `main` before P2 merges `main` into the upgrade branch.

**Tasks 1–3 gate P2** (roadmap). Task 3 is independent of Tasks 1–2. Run it first if the owner decides quickly: it stops the CI smoke job, which otherwise runs on every PR push, #160's included, against a production-config build. Tasks 4–5 don't gate P2.

- E2E app IDs end in `.e2e.emu` or `.e2e.stg`: iOS `com.rats.dev.e2e.emu` / `com.rats.dev.e2e.stg`, Android `com.regroup.app.e2e.emu` / `com.regroup.app.e2e.stg`.
- Bundle markers are exact strings: `regroup-e2e-variant=emulator`, `regroup-e2e-variant=staging`, `regroup-e2e-variant=none` (`regroup/mobile/src/config/env.ts`, `scripts/verify-*-variants.sh`).
- Production app IDs that must always be refused: `com.rats.dev`, `com.regroup.app`.

## Review Focus

1. **A production ID with an e2e-looking prefix,** such as `com.rats.dev.e2e.emu.evil` or `com.rats.dev.e2e`. A suffix check must match the whole final segment, so both are refused. → Task 1 tests.
2. **A bundle with two markers or none.** It must be refused, not treated as e2e. An old build that predates markers has none. → Task 1 tests.
3. **An e2e app ID whose bundle says `=none`.** A store bundle with an e2e ID, from a mis-set build configuration, is refused. → Task 1 tests.
4. **A new flow file added without the guard subflow.** The lint test fails, so a future flow can't silently skip it. → Task 2 test.
5. **A deferred row in the matrix that is money or data.** The checker refuses it even when a reason is given. → Task 4 tests.

---

### Task 1: e2e build guard module and CLI

**Files:**

- Create: `regroup/mobile/maestro/scripts/e2e-build-guard.js`
- Test: `regroup/mobile/maestro/scripts/__tests__/e2e-build-guard.test.js`

**Interfaces:**

- Produces (CommonJS exports):
  - `E2E_SUFFIXES: { '.e2e.emu': 'emulator', '.e2e.stg': 'staging' }`
  - `checkAppId(appId: string): { ok: boolean, variant?: 'emulator'|'staging', reason?: string }`
  - `checkBundleMarkers(bundleText: string, expectedVariant: 'emulator'|'staging'): { ok: boolean, reason?: string }`. It finds every match of `/regroup-e2e-variant=[a-z]+/g` and is ok only if there is exactly one distinct match, equal to `regroup-e2e-variant=<expectedVariant>`.
  - CLI: `node maestro/scripts/e2e-build-guard.js --platform ios|android --app-id <id> [--device <udid|serial>]`. It exits 0 on pass. On refusal it prints `e2e-build-guard: REFUSED <reason>` to stderr and exits 1.
- **The CLI's bundle lookup:**
  - **iOS:** `xcrun simctl get_app_container <device|booted> <appId> app`, then read `<container>/main.jsbundle`.
  - **Android:** `adb [-s serial] shell pm path <appId>` gives the base APK path. `adb pull` it to a temp dir, then run `unzip -p <apk> assets/index.android.bundle`. The marker survives Hermes compilation (`verify-android-variants.sh` header).

- [ ] **Step 1: Write the failing tests**

```js
const { checkAppId, checkBundleMarkers } = require('../e2e-build-guard');

describe('checkAppId', () => {
  it.each([
    ['com.rats.dev.e2e.emu', 'emulator'],
    ['com.rats.dev.e2e.stg', 'staging'],
    ['com.regroup.app.e2e.emu', 'emulator'],
    ['com.regroup.app.e2e.stg', 'staging'],
  ])('accepts %s as %s', (id, variant) => {
    expect(checkAppId(id)).toEqual({ ok: true, variant });
  });
  it.each([
    'com.rats.dev',
    'com.regroup.app',
    'com.rats.dev.e2e',
    'com.rats.dev.e2e.emu.evil',
    'e2e.emu',
    '',
    undefined,
  ])('refuses %p', (id) => {
    const r = checkAppId(id);
    expect(r.ok).toBe(false);
    expect(r.reason).toMatch(/not an e2e app id/);
  });
});

describe('checkBundleMarkers', () => {
  it('accepts exactly one matching marker', () => {
    expect(checkBundleMarkers('x regroup-e2e-variant=emulator y', 'emulator')).toEqual({
      ok: true,
    });
  });
  it('accepts the same marker repeated', () => {
    expect(
      checkBundleMarkers('regroup-e2e-variant=staging..regroup-e2e-variant=staging', 'staging').ok,
    ).toBe(true);
  });
  it('refuses a missing marker', () => {
    expect(checkBundleMarkers('no marker here', 'emulator')).toMatchObject({
      ok: false,
      reason: expect.stringMatching(/no e2e marker/),
    });
  });
  it('refuses a store bundle', () => {
    expect(checkBundleMarkers('regroup-e2e-variant=none', 'emulator')).toMatchObject({
      ok: false,
      reason: expect.stringMatching(/=none/),
    });
  });
  it('refuses the wrong variant', () => {
    expect(checkBundleMarkers('regroup-e2e-variant=staging', 'emulator').ok).toBe(false);
  });
  it('refuses two different markers', () => {
    expect(
      checkBundleMarkers('regroup-e2e-variant=emulator regroup-e2e-variant=staging', 'emulator').ok,
    ).toBe(false);
  });
});
```

- [ ] **Step 2: Run them to see them fail**

  Run: `cd regroup/mobile && npx jest maestro/scripts/__tests__/e2e-build-guard.test.js`
  Expected: FAIL, "Cannot find module '../e2e-build-guard'".

- [ ] **Step 3: Implement `checkAppId`, `checkBundleMarkers` and the CLI in `e2e-build-guard.js`**

  - Guard the CLI with `if (require.main === module)`.
  - Use `child_process.execFileSync`, never a shell string. Device and app ID are passed as arguments.
  - Delete the temp dir in a `finally`.

- [ ] **Step 4: Run the tests to see them pass**

  Run: `cd regroup/mobile && npx jest maestro/scripts/__tests__/e2e-build-guard.test.js`
  Expected: PASS, 17 tests.

- [ ] **Step 5: Smoke the CLI against real installs.** Record the results in the PR description.

  - Run: `node maestro/scripts/e2e-build-guard.js --platform ios --app-id com.rats.dev`
    Expected: exit 1, `REFUSED … not an e2e app id`.
  - With the E2EEmulator build installed on the E2E-iPhone simulator, run: `node maestro/scripts/e2e-build-guard.js --platform ios --app-id com.rats.dev.e2e.emu --device 809BD7B9-D9D5-45D2-AEA8-12F885F54407`
    Expected: exit 0.

- [ ] **Step 6: Commit**

```bash
git -C <worktree> add regroup/mobile/maestro/scripts/e2e-build-guard.js regroup/mobile/maestro/scripts/__tests__/e2e-build-guard.test.js
git -C <worktree> commit -m "feat(regroup-mobile): e2e build guard refuses non-e2e app ids and bundles"
```

### Task 2: Wire the guard into every way the suite runs

**Files:**

- Create: `regroup/mobile/maestro/subflows/guard-e2e-app.yaml`
- Modify: every flow in `regroup/mobile/maestro/flows/` except `run-all.yaml` and `debug-*.yaml`. Its first step becomes the guard subflow.
- Modify: `regroup/mobile/maestro/subflows/login.yaml`. Same: first step.
- Modify: `regroup/mobile/maestro/scripts/run-flows.sh`. Its preflight runs the guard CLI after the "is installed" check.
- Modify: `regroup/mobile/package.json`. Each `maestro:*` script runs `node maestro/scripts/e2e-build-guard.js --platform <ios|android> --app-id <its APP_ID> &&` before `maestro test`.
- Modify: `regroup/mobile/maestro/flows/smoke.yaml`. Its header run lines use `com.rats.dev.e2e.emu` / `com.regroup.app.e2e.emu`.
- Modify: `regroup/mobile/maestro/README.md`, `regroup/mobile/docs/e2e/MAESTRO_GUIDE.md`. Document the guard and remove any run line with a production app ID.
- Test: `regroup/mobile/maestro/scripts/__tests__/flows-guarded.test.js`

**Interfaces:**

- Consumes: the Task 1 CLI.
- Produces: the subflow `../subflows/guard-e2e-app.yaml`. Every new flow written in P3–P6 must start with it, and the lint test enforces that.

- [ ] **Step 1: Write the failing lint test**

  For each `*.yaml` in `maestro/flows` except `run-all.yaml` and `debug-*.yaml`, and for `maestro/subflows/login.yaml`, the test:

  - splits the file at the `---` document separator;
  - finds the first command item;
  - asserts that it is `- runFlow:` whose `file:` is `../subflows/guard-e2e-app.yaml`;
  - asserts that it appears before any `launchApp`.

  A second test asserts that no file under `maestro/`, `docs/e2e/` or `package.json` contains `APP_ID=com.rats.dev ` or `APP_ID=com.regroup.app `, with a trailing space or end of line. Regex: `/APP_ID=com\.(rats\.dev|regroup\.app)(\s|$|")/m`.

- [ ] **Step 2: Run it to see it fail**

  Run: `cd regroup/mobile && npx jest maestro/scripts/__tests__/flows-guarded.test.js`
  Expected: FAIL. It lists every flow lacking the guard, and `smoke.yaml` for the production `APP_ID` lines.

- [ ] **Step 3: Write `guard-e2e-app.yaml`**

```yaml
# Refuses to run against anything but an e2e build. Every launch of a
# production build creates an anonymous account in production (design §3.4).
appId: ${APP_ID}
---
- assertTrue:
    condition: ${APP_ID.endsWith('.e2e.emu') || APP_ID.endsWith('.e2e.stg')}
    label: 'APP_ID must be an e2e variant (.e2e.emu / .e2e.stg), never a production app id'
```

- [ ] **Step 4: Add the subflow as the first step of each flow and of `login.yaml`.** Wire the CLI into `run-flows.sh` and the `package.json` scripts. Fix the `smoke.yaml` header and the two docs.

- [ ] **Step 5: Run the lint test and the whole mobile suite**

  Run: `cd regroup/mobile && npx jest maestro/scripts && npx jest`
  Expected: PASS, and the total test count is higher than before.

- [ ] **Step 6: Prove both layers on the simulator.** Record the results in the PR description.

  - Run: `maestro test -e APP_ID=com.rats.dev -e E2E_TEST_PASSWORD=x maestro/flows/smoke.yaml`
    Expected: fails at the guard assertion, and **the app is never launched**.
  - Run: `maestro/scripts/run-flows.sh smoke` with the E2EEmulator build installed.
    Expected: the guard passes and smoke passes.

- [ ] **Step 7: Commit**

```bash
git -C <worktree> add regroup/mobile/maestro regroup/mobile/package.json regroup/mobile/docs/e2e/MAESTRO_GUIDE.md
git -C <worktree> commit -m "fix(regroup-mobile): every Maestro entry point refuses production builds"
```

### Task 3: The CI Maestro Cloud smoke job (owner decision first)

**Files:**

- Modify: `.github/workflows/ci.yml`, the `regroup-maestro-smoke` job (~286-327)
- Possibly delete: `e2e-maestro/regroup/login-and-view-dashboard.yaml`

**Why:** the job builds `assembleDebug`, whose `google-services.json` is `phoenix-cleanhouse`. It runs a `clearState` login flow with `appId: com.rats.dev`, which doesn't match the APK's `com.regroup.app`, and it's `continue-on-error`. So it either writes to production or does nothing while looking green (spec §3.4).

- [ ] **Step 1: Ask the owner which option he wants** (this changes CI):
  - **(a, recommended)** Remove the regroup Maestro Cloud job and the stale flow file. The real suite moves to CI later, per the owner's decision in spec §4.3.
  - **(b)** Rebuild it on the `e2eStaging` APK, with the staging Firebase config and the guard. This needs a CI secret carrying `google-services.e2e-staging.json`, and a staging account, which P3 creates. So (b) can't finish before P3.
- [ ] **Step 2: Apply the chosen option.** For (a):
  - delete the job block;
  - delete the flow file;
  - leave the homegroups job untouched.
  - In the PR description, say the flow file deletion is intended (the test-tamper gate may flag it; the owner applies `test-change-approved` if so).
- [ ] **Step 3: Verify.** Run: `npx --yes @action-validator/cli .github/workflows/ci.yml` (or `actionlint` if installed). Expected: valid. Open the PR and confirm the regroup Maestro Cloud check no longer appears while the homegroups one still runs.
- [ ] **Step 4: Commit and record.**
  - Commit: `ci(regroup): stop the Maestro Cloud smoke job driving a production-config build`.
  - Update spec §3.4's CI bullet to say what was done. This is a docs-current rule edit in the same PR.

### Task 4: Coverage matrix and checker

**Files:**

- Create: `regroup/mobile/scripts/coverage-matrix-check.js`
- Test: `regroup/mobile/scripts/coverage-matrix-check.test.js`
- Create: `regroup/mobile/docs/e2e/coverage-matrix.md`

**Interfaces:**

- **Matrix format:** one markdown table under the heading `## Rows`, with exactly these columns in order:

  `ID | Area | Action | Role | Platform | Fixture | Kind | Covered by | Guard | Status | Deferred`

  - `ID`: `AREA-NNN`, unique (e.g. `BILL-003`, `LINK-012`). Device-checklist rows use `DEVS-NNN` for the staging pass (checked in P7) and `DEVP-NNN` for the production pass (checked in P9), so each pass can be gated on its own.
  - `Role`: `signed-out|operator|manager|resident|oxford|any`
  - `Platform`: `ios|android|both|web`
  - `Fixture`: `clean|legacy|both|n/a`
  - `Kind`: `maestro|playwright|staging|device|unit`
  - `Covered by`: a repo-relative path, or a device-checklist item id; `—` while missing.
  - `Guard`: `money|data|none`. Money and data rows can never be deferred (spec §4.3).
  - `Status`: `pass|fail|missing|deferred`
  - `Deferred`: `<checklist|post-launch>: <reason> (YYYY-MM-DD)`, or `—`.

- **Exports:**
  - `parseMatrix(markdown: string): Row[]`
  - `selectRows(rows: Row[], { kinds?: string[], excludeKinds?: string[], idPrefix?: string }): Row[]` returns the rows a gate covers. With no options it returns every row.
  - `validate(rows: Row[], { repoRoot: string, release: boolean }): string[]`, which returns error strings, empty when valid. Structural checks always run on **all** rows. The release check (every row `pass` or validly `deferred`) runs on the rows passed in.
- **CLI:** `node scripts/coverage-matrix-check.js [--release] [--kinds a,b] [--exclude-kinds a,b] [--id-prefix P]`.
  - It prints counts per status for the selected rows.
  - It exits 1 on any validation error. With `--release` it also exits 1 if any **selected** row is not `pass` or validly `deferred`.
  - The phase gates (roadmap):
    - P6: `--release --exclude-kinds device`;
    - P7: `--release --kinds device --id-prefix DEVS-`;
    - before launch step 10.5: `--release` with no filter.
  - An unknown kind in `--kinds` or `--exclude-kinds` exits 1, so a typo can't empty a gate. So does a filter that selects zero rows.

- [ ] **Step 1: Write the failing tests.**

  The fixture rows are inline markdown strings. Assert:

  - a duplicate ID → error `duplicate id`;
  - an unknown enum value → error naming the column;
  - `Status: deferred` with `Guard: money` → error `cannot defer a money row`, and the same for `data`;
  - `deferred` with `Deferred: —` → error `needs reason and date`;
  - `Kind: maestro` with a `Covered by` path that doesn't exist and `Status` not `missing` → error `missing file`;
  - in release mode, a `missing` or `fail` row → an error naming its ID;
  - in release mode, a valid `deferred` row with `Guard: none` → no error;
  - `selectRows` with `excludeKinds: ['device']` drops `Kind: device` rows and keeps the rest;
  - `selectRows` with `kinds: ['device'], idPrefix: 'DEVS-'` keeps only `DEVS-` device rows (not `DEVP-`);
  - in release mode over `selectRows(rows, { excludeKinds: ['device'] })`, a `missing` device row → no error, and a `missing` maestro row → an error naming its ID;
  - a structural error in a row the filter excludes, such as a duplicate ID, is still reported;
  - the CLI exits 1 for `--kinds devise` (unknown kind) and for a filter selecting zero rows.

- [ ] **Step 2: Run them to see them fail.**

  Run: `cd regroup/mobile && npx jest scripts/coverage-matrix-check.test.js`
  Expected: FAIL, module not found.

- [ ] **Step 3: Implement `parseMatrix`, `validate` and the CLI.**

- [ ] **Step 4: Run them to see them pass.** Same command. Expected: PASS.

- [ ] **Step 5: Write `coverage-matrix.md`.**

  - **Header:** the column definitions above, and the deferral rule, quoted from spec §4.3.
  - **Rows:** one row per action × role, with the platform `both` unless the action is one platform's.
  - **Sources to enumerate**, all marked `missing` unless an existing flow already asserts the outcome. Today only the 6 passing flows qualify, per spec §3.5:
    - Appendix A of the spec, every cell;
    - the cross-role flows listed under Appendix A;
    - the billing states (spec §4.1 items 1, 2 and 8): allowed, grace, plan required for the operator, resident read-only view, grace expired, Oxford gate, sales-open closed and open;
    - the minimum-version gate, blocking and failing open (spec §4.2);
    - every deep link: each route in `regroup/mobile/src/services/native-deep-links.ts` and `src/navigation/linking.ts`, the checkout hand-back, invitation and account-email links. Each gets the three cases signed in, signed out and not installed, plus `com.rats.dev://` rows (spec §4.2);
    - the staging round-trip scenarios (spec §4.3);
    - the device-checklist items, both passes (spec §4.3), as `Kind: device`, with IDs `DEVS-…` (staging pass) and `DEVP-…` (production pass).
  - **Guard values:** `money` for checkout, charges, grace and lapse, paywall states and the sales switch; `data` for payment history, documents and backfill outcomes.

- [ ] **Step 6: Validate.**

  Run: `cd regroup/mobile && node scripts/coverage-matrix-check.js`
  Expected: exit 0, with counts printed (most rows `missing`).

  Run: `node scripts/coverage-matrix-check.js --release`
  Expected: exit 1, listing the missing rows. That is correct for now.

  Run: `node scripts/coverage-matrix-check.js --kinds device --id-prefix DEVS-` and `--kinds device --id-prefix DEVP-`
  Expected: each exits 0 and prints a non-zero count, which proves both passes have rows.

- [ ] **Step 7: Commit.**

  - Commit: `test(regroup): coverage matrix and checker, the launch acceptance checklist`.
  - Link the matrix from `regroup/mobile/maestro/README.md`.

### Task 5: Firestore exports bucket for backfills (production, owner yes)

**Files:** Modify: `regroup/docs/operations/data-recovery.md` (record the bucket name; remove the "doesn't exist yet" line).

Facts: production Firestore `(default)` is in `nam5` (US multi-region), project number `155667333239`.

- [ ] **Step 1: Get the owner's yes to create the bucket.**

  It is a new production resource with storage cost. Then run:

```bash
gcloud storage buckets create gs://phoenix-cleanhouse-firestore-exports \
  --project=phoenix-cleanhouse --location=US --uniform-bucket-level-access --public-access-prevention
gcloud storage buckets add-iam-policy-binding gs://phoenix-cleanhouse-firestore-exports \
  --member=serviceAccount:service-155667333239@gcp-sa-firestore.iam.gserviceaccount.com --role=roles/storage.admin
```

- [ ] **Step 2: Prove an export works.**

  This is a read-only export of a small collection, and it contains no PII in logs. Run:

  `gcloud firestore export gs://phoenix-cleanhouse-firestore-exports/2026-11-xx-smoke --collection-ids=paywall --project=phoenix-cleanhouse`

  Expected: the operation completes (the collection may be empty). Then delete that smoke folder.

- [ ] **Step 3: Update `data-recovery.md`.** Set the bucket name in "Before a risky production write" and the table. Commit: `docs(regroup): record the Firestore exports bucket`.

---

**Done when:**

- Tasks 1–5 are merged to `main`.
- The guard is proven on both layers.
- The CI job decision is applied.
- The matrix validates.
- The bucket is recorded.

Update the spec's §5 step 1 bullets to "done" with dates (docs-current rule).
