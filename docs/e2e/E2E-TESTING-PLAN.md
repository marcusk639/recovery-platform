# Mobile E2E Testing Plan — Homegroups & Regroup

> Authored 2026-06-21 via `/make-plan` after a Phase-0 discovery pass (3 subagents).
> Standard: **Maestro** + the `mobile-e2e` skill conventions, run on the **Firebase emulator** with **seeded data**.
> Each phase is self-contained and executable in a fresh chat context. Cite the doc references at the top of each phase before writing any YAML.

---

## How to use this plan

- Execute phases consecutively. Phases 1–2 and 5–6 are **generic** (shared approach); Phase 3 is **Homegroups-specific**, Phase 4 is **Regroup-specific**.
- Before authoring any Maestro YAML in any phase, the executor MUST: (a) read the cited `mobile-e2e` reference files, and (b) call `mcp__maestro__cheat_sheet` and confirm every command used appears in it. Do not invent commands.
- "Copy from" means literally adapt the cited template/existing flow — do not transform unrelated code or write from memory.

---

## Phase 0 — Discovery (DONE — consolidated findings)

### 0.1 Authoritative Maestro tooling

**The `mobile-e2e` skill** (`~/.claude/skills/mobile-e2e/`) is the platform standard. Read these before writing flows:

- `SKILL.md` — 3 workflows: **analyze** (`/mobile-e2e analyze` → `docs/e2e/<feature>-test-plan.md`), **generate** (`/mobile-e2e generate <doc>` → `.maestro/` tree + `scripts/e2e-run.sh`), **run** (`/mobile-e2e run <env>` → `docs/e2e/reports/YYYY-MM-DD-<env>.md`).
- `references/testid-conventions.md` — kebab-case, screen/feature prefix, type suffix (`-button`,`-input`,`-list`,`-screen`,`-modal`,`-link`,`-toggle`,`-item`); dynamic items append id (`card-{id}`).
- `references/maestro-templates.md` — copy-ready config.yaml, utils flows (launch-app/resume-app/login/login-with-otp), individual-flow template, master `run-all.yaml`, interaction patterns, timeout table.
- `references/maestro-gotchas.md`, `references/troubleshooting.md` (25 solved problems) — read before debugging.
- `scripts/e2e-run.template.sh` — copy to each app's `scripts/e2e-run.sh`.

**Maestro MCP** (load via ToolSearch `select:mcp__maestro__*`):

- LOCAL: `list_devices` → `inspect_screen` → `run`. Every local call needs a `device_id` from `list_devices`. `run` takes exactly one of `{yaml}` / `{files}` / `{dir}` + `device_id`; `include_tags`/`exclude_tags` are dir-mode only (bare names, no `@`). Viewer: `http://127.0.0.1:10004/`.
- CLOUD: `list_cloud_devices` → `run_on_cloud` (needs app binary `.ipa`/`.apk` + flows; `device_model`/`device_os` verbatim from list) → poll `get_cloud_run_status` every 60s until SUCCESS/ERROR/CANCELED/WARNING.
- `inspect_screen` abbreviated keys (`txt`,`rid`,`a11y`,`cls`) are NOT selectors. Valid selectors: `text`, `id`, `index`, position (`below`/`above`/`leftOf`/`rightOf`). `text:` is full-string regex IGNORE_CASE — anchor or use full string.

### 0.2 ALLOWED Maestro commands (only these — from cheat_sheet)

- Header keys: `appId`(req), `name`, `env`, `tags`, `jsEngine`, `onFlowStart`, `onFlowComplete`; `---` separates header from commands.
- Lifecycle: `launchApp`(clearState,clearKeychain,stopApp,permissions,arguments), `stopApp`, `killApp`, `clearState`, `clearKeychain`, `setPermissions`.
- Assertions: `assertVisible`, `assertNotVisible`, `assertTrue`, `assertScreenshot`(needs name), `assertWithAI`, `assertNoDefectsWithAI`.
- Interaction: `tapOn`, `doubleTapOn`, `longPressOn`, `inputText`, `eraseText`, `pressKey`, `back`(Android), `hideKeyboard`, `copyTextFrom`, `setClipboard`, `pasteText`.
- Scroll: `scroll`, `scrollUntilVisible`, `swipe`.
- Waiting: `extendedWaitUntil`(visible/notVisible+timeout), `waitForAnimationToEnd`.
- Control: `runFlow`(file/commands,env,when), `runScript`, `evalScript`, `retry`(0–3), `repeat`.
- Device/media: `takeScreenshot`, `startRecording`/`stopRecording`, `addMedia`, `setLocation`, `travel`, `setOrientation`, `setAirplaneMode`, `openLink`.
- Selectors: `text`,`id`,`index`,`enabled`,`checked`,`focused`,`selected`,`below`/`above`/`leftOf`/`rightOf`,`containsChild`,`containsDescendants`,`childOf`,`point`. Every command supports `label` + `optional`.
- `when`: `visible`, `notVisible`, `true:${js}`, `platform`.

### 0.3 ANTI-PATTERNS — do NOT use (these commands don't exist)

- NO `waitFor`/`wait`/`sleep`/`delay` → use `extendedWaitUntil` / `waitForAnimationToEnd`.
- NO `assertText`/`expect`/`verify` → `assertVisible`/`assertNotVisible`/`assertTrue`.
- NO `type`/`enterText`/`fillText` → `inputText`; NO `clearText` → `eraseText`.
- NO `click`/`press`/`touch` → `tapOn`; NO `scrollDown`/`scrollTo` → `scroll`/`scrollUntilVisible` w/ `direction`.
- Never bare `assertScreenshot` (needs a name). `pressKey: back`/`back` are Android-only.
- iOS modals: `pressKey: Escape` does NOT dismiss; tap a real dismiss control. gorhom BottomSheet content is invisible to Maestro — assert the trigger, not sheet internals.

### 0.4 Current state — the two apps DIVERGE

| Aspect            | Homegroups (`homegroups/mobile`)                                                                                                                                      | Regroup (`regroup/mobile`)                                                                                                                                                                                                                                |
| ----------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Existing E2E      | **Detox** — 19 specs in `e2e/screens/`, helpers `e2e/helpers.js` (`by.id`). Detox 20 runner config likely incomplete (`e2e/init.js` uses deprecated Jasmine adapter). | **Maestro** (small, production-grade) + larger Detox suite (18 specs, fragile).                                                                                                                                                                           |
| Maestro present?  | **No** (`maestro/` must be created)                                                                                                                                   | **Yes**: `maestro/{config.yaml,flows/smoke.yaml,subflows/login.yaml,subflows/logout.yaml,scripts/reset-and-seed.sh,scripts/assert-firestore.js}`                                                                                                          |
| Backend for tests | **Live Firebase** `recovery-connect-cad4b` + real account (`E2E_TEST_EMAIL/PASSWORD` from `e2e/.env.e2e`). **No emulator, no seed.**                                  | **Firebase emulator** (`src/config/firebase-emulator.ts`, gate `__DEV__ && Settings.get('IS_E2E_TEST')==='1'`, host `127.0.0.1`, Auth:9099 Firestore:8080 Storage:9199) + **seed** (`e2e/setup/seedTestData.js`, accounts `e2e/setup/testAccounts.json`). |
| testIDs           | **525** `testID=` (7 a11y) — target by `id`. Login/Landing/Register/MeetingFinder/GroupList well-instrumented.                                                        | **955** `testID=` but **critical gaps**: SetupWizards/\*, MeetingSearch, Oxford screens, HouseConfig, Beds, Invites have ZERO.                                                                                                                            |
| Bundle / appId    | iOS `org.recoveryconnect`, Android `com.recoveryconnect`, app `RecoveryConnect`                                                                                       | iOS `com.rats.dev`, Android `com.regroup.app`, AppRegistry `rats` (passed via `-e APP_ID=`)                                                                                                                                                               |
| Build/run         | `npx react-native run-ios --udid <UDID>`; Metro :8081 (conflicts w/ regroup — kill first). Run skill paths are STALE.                                                 | `cd regroup/mobile && npm run ios` (iPhone 14 Pro); functions emulator `cd regroup && firebase emulators:start` (UI :4000).                                                                                                                               |

**Implication:** Regroup's emulator+seed+Maestro setup is the platform model. Homegroups must be brought up to it (the largest single work item). Trust grep'd real testIDs over `regroup/mobile/docs/e2e/MAESTRO_GUIDE.md` (its example IDs have drifted).

### 0.5 DECISIONS required before Phase 1 (surface to user)

1. **Homegroups: convert Detox→Maestro** (recommended — selectors port cleanly `by.id('x')`→`id:"x"`, `by.text('Meetings')`→`"Meetings"`; unifies tooling) vs keep Detox. This plan assumes convert.
2. **Homegroups: add Firebase emulator support** (recommended — parity with regroup, no live-data risk) vs keep live-Firebase + dedicated test account. Emulator parity is a **code change in `homegroups/mobile/src`** (add `connectAuthEmulator`/`connectFirestoreEmulator` behind an `IS_E2E_TEST` gate). This plan assumes emulator parity.
3. **Secret hygiene (do first):** `homegroups/mobile/.env` reportedly contains a live Stripe + Google Maps key committed — rotate/remove before any CI work (cross-references launch-readiness A5-style key hygiene).

---

## Phase 1 — Shared Maestro + emulator + seed foundation (GENERIC)

**Goal:** both apps boot a debug build against the Firebase emulator with seeded data, and have an identical `.maestro/` skeleton + run script.

**Doc references:** `~/.claude/skills/mobile-e2e/references/maestro-templates.md` (config.yaml, utils flows), `scripts/e2e-run.template.sh`; regroup exemplars `regroup/mobile/maestro/config.yaml`, `regroup/mobile/src/config/firebase-emulator.ts`, `regroup/mobile/e2e/setup/seedTestData.js`, `regroup/mobile/e2e/setup/testAccounts.json`.

**What to implement:**

1. **Regroup (already exists — formalize):** confirm `maestro/config.yaml` matches skill conventions; ensure `maestro/utils/` exists (rename/add `launch-app.yaml` alongside existing `subflows/login.yaml`,`logout.yaml` if adopting skill layout). No backend work needed.
2. **Homegroups (new):**
   - Add emulator wiring in `src` behind an `IS_E2E_TEST` gate **copied from** `regroup/mobile/src/config/firebase-emulator.ts` (Auth:9099, Firestore:8080, Functions:5001, host `127.0.0.1`). Wire it into the Firebase init in `homegroups/mobile/src/services/firebase/config.ts`.
   - Create `homegroups/mobile/maestro/` mirroring regroup: `config.yaml` (copy from skill template; `disableAnimations:true`, `flows:[flows/*]`, `testOutputDir: maestro/output`), `utils/launch-app.yaml`, `subflows/login.yaml`, `subflows/logout.yaml`.
   - Create a seed script `homegroups/mobile/e2e/setup/seedTestData.js` (Admin SDK against emulator, `FIRESTORE_EMULATOR_HOST=127.0.0.1:8080`, `FIREBASE_AUTH_EMULATOR_HOST=127.0.0.1:9099`, project `recovery-connect-cad4b`) seeding: a seeker (none), a member user + a group + membership, an admin/super-admin user + an admin group with treasury/meetings. **Mirror the claim-shape used by `onMemberWrite`** (memberGroups/adminGroups/treasurerGroups arrays in claims) — see `mem:deep-dive/homegroups`.
   - Create `homegroups/mobile/e2e/setup/testAccounts.json` (e.g. `seeker`, `member@hg-e2e.com`, `admin@hg-e2e.com`, password `TestPassword123!`).
   - Copy `scripts/e2e-run.template.sh` → `homegroups/mobile/scripts/e2e-run.sh`; add npm scripts `maestro:seed`, `maestro:ios`, `maestro:smoke:ios` modeled on regroup's `package.json`.
3. **Both:** document the local loop in each app's `docs/e2e/README.md`: T1 emulators → T2 seed → T2 `npm run ios` (debug, emulator gate) → T3 `npm run maestro:smoke:ios`.

**Verification checklist:**

- `cd regroup && firebase emulators:start` and (separately) the homegroups emulators boot without port clash (run one app at a time).
- `npm run maestro:seed` populates the emulator (check Emulator UI :4000 / homegroups equivalent).
- Debug build launches and `connectToEmulators()` fires only when `IS_E2E_TEST=1` (log line present).
- `mcp__maestro__list_devices` returns a booted simulator id.

**Anti-pattern guards:** do NOT point E2E at live Firebase once emulator parity lands. Do NOT seed claims as maps where homegroups expects arrays (or vice-versa for regroup, which uses `{houseId:true}` maps — regroup gotcha P0-1). Do NOT hardcode `appId` in flows — parameterize via `env`/`-e APP_ID` (regroup convention).

---

## Phase 2 — Auth + smoke foundation flows (GENERIC, per-app instances)

**Goal:** launch + login + logout + smoke prove out on both apps using real testIDs.

**Doc references:** regroup `maestro/flows/smoke.yaml`, `maestro/subflows/{login,logout}.yaml` (copy as the canonical shape); skill `references/maestro-templates.md` login util.

**What to implement (Regroup — mostly exists, verify):** confirm `smoke.yaml` (launchApp clearState + `arguments:{IS_E2E_TEST:"1"}` → assert `id:initial-landing-screen`), `subflows/login.yaml` (→ `house-tab`, real IDs `sign-in-button`,`login-screen`,`email-input`,`password-input`,`login-button`), `subflows/logout.yaml`. Add a `signup.yaml` and `password-reset.yaml` using confirmed IDs (`signup-email-input`,`signup-password-input`,`reset-email-input`).

**What to implement (Homegroups — new, copy regroup shape):**

- `maestro/flows/smoke.yaml`: `launchApp:{clearState:true, arguments:{IS_E2E_TEST:"1"}}` → `assertVisible: {id: "landing-screen"}`.
- `maestro/subflows/login.yaml`: from landing tap `landing-signin-button` → on `login-screen` `inputText` into `login-email-input`/`login-password-input` → `tapOn:{id:login-signin-button}` → `extendedWaitUntil:{visible:{id:group-list-screen}, timeout:60000}`. Params `EMAIL`/`PASSWORD`.
- `maestro/subflows/logout.yaml`: Profile tab (`by text "Profile"`) → sign-out control → assert `landing-screen`.
- `maestro/flows/auth/register.yaml`: `landing-register-button` → `register-screen` → `register-email-input`/`register-password-input` → `register-create-account-button`.

**Verification checklist:** `mcp__maestro__run` each smoke/login/logout flow on the booted sim (local workflow). All green. `inspect_screen` confirms target ids exist on screen before asserting.

**Anti-pattern guards:** tabs in homegroups are targeted by visible **text** (`"Meetings"`,`"Profile"`,`"Admin"`), not testID — keep that. Don't assume `login-submit-button` (regroup guide drift) — the real id is `login-button` (regroup) / `login-signin-button` (homegroups).

---

## Phase 3 — Homegroups feature flows (APP-SPECIFIC)

**Goal:** cover the seeker / member / admin journeys. Port the 19 existing Detox specs (`homegroups/mobile/e2e/screens/`) to Maestro — they encode the selectors and steps already.

**Doc references:** existing Detox specs (selector SSOT) in `homegroups/mobile/e2e/screens/{auth,meetings,messages,profile,treasury,admin,homegroup/*}`; `mem:deep-dive/homegroups` for flow semantics; testID map from Phase 0.

**Flow groups to author (`maestro/flows/<group>/`):**

- **seeker/** — `find-meeting-limited.yaml`: from landing tap `landing-find-meeting-button` → `meetings-screen` → `meetings-search-input` + `meetings-filter-button`/`meetings-filter-modal` → assert results list `meetings-list` (no auth; limited mode).
- **member/** — `join-group.yaml` (group search / invite code → `group-list-screen`), `group-overview.yaml` (`GroupOverviewScreen`, 60 testIDs), `group-chat.yaml`, `group-announcements.yaml`, `messages-inbox.yaml`, `profile-sobriety.yaml` (SobrietyTracker / MyRecoveryJourney).
- **admin/** (seeded super-admin) — `treasury.yaml` (add/edit transaction, donation, handoff), `governance-conscience.yaml`, `governance-elections.yaml`, `bylaws.yaml`, `service-positions.yaml`, `milestones.yaml`, `business-meetings.yaml`, `admin-panel.yaml` (assert `admin-panel-screen`; mark `optional` if account lacks super-admin).
- **meetings/** — `meeting-finder.yaml` (authed full finder), `meeting-checkin.yaml` (QR/check-in is `recoveryconnect://checkin` scheme + server membership/date checks — assert UI path; geofence/QR likely manual).
- Each feature flow starts with `runFlow:{file:../subflows/login.yaml, env:{EMAIL:${HG_MEMBER_EMAIL}, PASSWORD:${HG_PW}}}` (or admin creds).

**Verification checklist:** every flow runs green on emulator via `mcp__maestro__run`. Each Detox spec has a Maestro equivalent (track in `docs/e2e/homegroups-coverage.md`). Post-write assertions for treasury/governance use a `runScript`/Firestore-emulator check (adapt regroup `assert-firestore.js`).

**Anti-pattern guards:** don't automate real Stripe checkout (WebView; subscription happens in web WebView — assert the gate/entry, not the card form). Don't depend on live data — every flow must be reproducible from seed. Mark super-admin-only flows `optional:true` so the suite degrades gracefully.

---

## Phase 4 — Regroup feature flows (APP-SPECIFIC)

**Goal:** cover operator vs resident/guest, the paywall, and the **Oxford-vs-Traditional** divergence. Includes a **testID-instrumentation sub-task** (critical gaps from Phase 0).

**Doc references:** regroup Detox specs `regroup/mobile/e2e/tests/*` (selector + step SSOT), `mem:deep-dive/regroup`, `regroup/mobile/src/navigation/navigators.tsx` (route map incl. Oxford routes ~402-421, SubscriptionGate ~193-195), `entities/House.tsx` (`houseType`).

**Sub-task 4a — add missing testIDs (blocking for the flows below):** instrument, following `references/testid-conventions.md`:

- `SetupWizards/*` (ManagerSetup, HouseSetup, ChoreSetup, GuestSetup) — highest-value untested flow.
- `StatUpdates/MeetingSearch.tsx`, `NewMeeting.tsx`, `MeetingFilterForm.tsx`, `MeetingSearchBar.tsx`.
- `HouseConfig/*`, `Beds/*`, `Invites/Invites.tsx`, Oxford screens (`OxfordDashboard`, `OfficerManagement`, `EESTracker`, `BusinessMeetings`, `Voting`, `CharterCompliance`).

**Sub-task 4b — extend seed:** `e2e/setup/seedTestData.js` currently seeds only traditional houses. Add an **Oxford-typed house** (`houseType:'oxford'`) with officers + an active subscription, and a **no-subscription house** (to exercise the paywall). Keep the **claims-as-maps** `{houseId:true}` shape (regroup gotcha).

**Flow groups (`maestro/flows/<group>/`):**

- **operator/** — `operator-setup-wizard.yaml` (after 4a), `house-dashboard.yaml` (HouseSummary), `invite-guest.yaml` + `invite-manager.yaml` (IDs exist), `beds-rooms.yaml`, `treasury.yaml` (BalanceDashboard), `disputes.yaml`, `multi-house-switch.yaml` (use `test-multi-house@rats-e2e.com`, `house-option-${id}`).
- **resident/** — `guest-home.yaml`, `guest-setup.yaml`, `meeting-search.yaml` (after 4a; check-in geofence via `setLocation` + assert, real GPS manual), `activity-verification.yaml`, `guest-stats.yaml`, `medication.yaml`.
- **paywall/** — `paywall-gated.yaml` (no-sub house → assert `SubscriptionRequiredScreen`), `paywall-ungated.yaml` (active-sub house → reach `house-tab`). Note `isDemoHouse`/`isDemo` bypass.
- **oxford/** — `oxford-dashboard.yaml`, `officer-management.yaml`, `ees-tracker.yaml`, `business-meetings.yaml`, `voting.yaml`, `charter-compliance.yaml` — only run when the seeded house `houseType:'oxford'`; tag `oxford` so traditional-only runs can `exclude_tags: [oxford]`.
- Reuse `subflows/login.yaml` with the appropriate seeded account.

**Verification checklist:** flows green on emulator. 4a testIDs present (grep). Oxford flows only pass against the Oxford-seeded house. Persistence-sensitive flows (guest edit — cites P0-5) use `maestro/scripts/assert-firestore.js` to confirm written fields.

**Anti-pattern guards:** don't automate Stripe WebView (RentPayment / SubscriptionHandler) — assert entry + use emulator/mocked state. Geofenced check-in: use `setLocation` to a seeded meeting's coords; real-GPS check-in stays manual. Don't seed claims as arrays (rules use `.keys().hasAny(...)`).

---

## Phase 5 — Tags, release-checks, CI & cloud (GENERIC)

**Goal:** organize flows for selective runs and wire automation.

**Doc references:** skill `references/maestro-templates.md` (master `run-all.yaml`), `release-checks/{staging,production}/` structure; Maestro MCP cloud workflow (Phase 0.1).

**What to implement:**

- Tag every flow: `smoke`, `regression`, `p0`, plus app-specific (`oxford`, `admin`). Build `maestro/flows/run-all.yaml` masters per app via `runFlow`.
- `maestro/release-checks/{staging,production}/run-all.yaml` per app (production flows READ-ONLY — assert, never mutate).
- CI workflow (GitHub Actions) per app: boot emulator → seed → build debug → `maestro test` selected tags. (No CI E2E workflow exists today.) Store `MAESTRO_*`-prefixed env / Firebase test creds as CI secrets.
- Optional cloud: build `.ipa`/`.apk`, `run_on_cloud` with device from `list_cloud_devices`; gate behind `MAESTRO_CLOUD_API_KEY` (never echo).

**Verification checklist:** `mcp__maestro__run` with `dir` + `include_tags:[smoke]` runs only smoke. CI dry-run green on a PR. Cloud run reaches a terminal status.

**Anti-pattern guards:** `include_tags`/`exclude_tags` are dir-mode only, bare names (no `@`). Don't run two apps' emulators simultaneously (port conflicts; platform rule). Production release-checks must not write data.

---

## Phase 6 — Verification (FINAL)

1. **Functional:** via Maestro MCP local (`list_devices` → `run`), execute each app's smoke, then full `run-all`, on the emulator. All green (or known-manual flows explicitly skipped/`optional`).
2. **API conformance:** grep every `maestro/**/*.yaml` for anti-patterns — `grep -rEn 'waitFor|sleep|assertText|\b(click|type|enterText|fillText)\b' */mobile/maestro` returns nothing. Confirm every command used appears in `mcp__maestro__cheat_sheet`.
3. **testID conformance:** grep flows for `id:` and confirm each id exists in `src` (no orphan selectors).
4. **Coverage:** `docs/e2e/{homegroups,regroup}-coverage.md` map each critical flow (Phase 0.4 / 3 / 4) to a passing Maestro flow; note manual-only items (OAuth, push, biometrics, geofenced check-in, Stripe WebView).
5. **Reports:** produce `docs/e2e/reports/YYYY-MM-DD-<app>-emulator.md` via the skill's run workflow (PASS/FAIL table, root-cause checklist, testID-gap table).
6. **Doc sync:** update `regroup/mobile/docs/e2e/MAESTRO_GUIDE.md` example IDs to real ones (they have drifted); add a `homegroups/mobile/docs/e2e/README.md`.

---

## Manual / out-of-scope for Maestro (both apps)

Google/Apple/Facebook OAuth (OS sheets), push notifications, biometrics, true geofenced GPS check-in, Stripe WebView card entry. Cover these with unit/integration tests or a manual checklist; assert only the in-app entry points via Maestro.

## Decisions (from 0.5) — RESOLVED 2026-06-21

1. **Convert Homegroups Detox → Maestro: YES.** Port the 19 Detox specs to Maestro (Phase 3).
2. **Add Firebase-emulator parity to Homegroups: YES** — requires the `src` code change in Phase 1 (`connect*Emulator` behind an `IS_E2E_TEST` gate) + a seed script.
3. **Rotate the committed Homegroups `.env` secrets: YES, as a Phase-1 prerequisite** — rotate keys, remove from the committed `.env`, move to env/secret manager before any CI work.
