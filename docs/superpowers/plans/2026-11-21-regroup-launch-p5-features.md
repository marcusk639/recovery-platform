# Regroup Launch P5: Features, Universal Links and Rent Setup Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Finish every half-built Regroup feature the launch needs: deep links and universal links that work end to end, checkout that opens in the system browser and hands back to the app, a minimum-version gate, the resident read-only view, the screens nothing opens yet, per-screen role checks, and the phone side of rent charges.

**Architecture:** Mobile changes land on `main` in small PRs, each with its Maestro flow written first and failing (spec §5 step 5). Links get one source of truth: a shared app-link config drives the mobile `linking` prefixes, the Android and iOS registrations, and the `apple-app-site-association` / `assetlinks.json` files that `regroup/web` serves. A test keeps all of them in agreement. Server additions are small, tested callables. Nothing deploys to production (the P4–P8 freeze). Staging (`regroup-e2e`) deploys are allowed for the device checks.

**Tech Stack:** React Native 0.88.1 (React Navigation 7, React Query, Redux Toolkit), `@react-native-firebase/*` 26.4, Firebase Functions v2 (TypeScript, Jest), Angular 9 web on Firebase Hosting plus SSR (Karma), Maestro 2.12, Firestore rules tests.

**Spec:** `docs/superpowers/specs/2026-11-06-regroup-launch-reboot-design.md` (§3.3, §4.1 items 1, 2, 6 and 8, §4.2, §5 step 5, §6, §9) and `docs/superpowers/specs/2026-11-08-regroup-rent-charges-design.md` (§4.1, §4.2, §4.5–4.7, §8). Constraints from `docs/superpowers/specs/2026-11-08-regroup-operator-portal-design.md` §6 (the portal bundles `regroup/mobile/src`). `docs/superpowers/specs/2026-11-09-regroup-staging-operator-design.md` is done (#227); its `npm run e2e:staging-operator` gives the staging operator for the device checks. Roadmap row: `docs/superpowers/plans/2026-11-06-regroup-launch-roadmap.md` P5.

**Facts checked against:** `origin/main` at `523c633d` (2026-11-21). Line numbers move: re-read each file before editing.

## Prerequisites (block the task shown)

| Item | Who | Blocks |
| --- | --- | --- |
| Live store IDs confirmed: iOS bundle `com.rats.dev` (team `D8K3FS4HAX`, the ID in `ios/rats.xcodeproj/project.pbxproj`), Android `com.regroup.app` (spec §4.2, §8.1) | Owner | Task 5 |
| The Play **app-signing** key's SHA-256 (Play Console → Setup → App signing) | Owner | Task 5 (production `assetlinks.json` only; staging uses the debug keystore) |
| Decision D1 (below): how a signed-out prospective resident applies | Owner | Task 16 |
| PR #279 merged (it changes the `linking.ts` prefix, item 18) | Owner merges | Task 2 (rebase onto it) |

## Decisions this plan makes (builder's calls, owner may overrule)

- **App-link paths are an allowlist, not `*`.** The universal-link files claim only `/invite`, `/app/*` and `/checkout-return`. The marketing, pricing, signup and my-account pages are not claimed: the app opens those in the system browser (Task 9), and claiming them would bounce the browser straight back into the app.
- **Staging gets its own app-link domain.** E2EStaging builds associate with `regroup-e2e.web.app`, and production builds with `regroup-app.com`. The staging hosting site serves files naming the `.e2e.stg` IDs, so the staging device pass can verify real universal links without touching production.
- **No new native dependencies.** The pending link is held in Redux, so it survives sign-in within one app session (spec §4.2's signed-out case) but not an app kill. The app version comes from a checked-in constant, which a unit test keeps equal to `Info.plist` and `build.gradle`. If the owner wants a pending link that survives an app kill, AsyncStorage is a separate PR (native install).
- **The minimum-version source is a public callable, `getAppConfig`,** in the style of `getTierCatalog`, backed by the server-only `config/app` document and set with the existing `setServerSwitch` script. Remote Config is not installed, and this avoids a new SDK (spec §4.2 leaves the source to the builder).
- **The version gate is per platform** (`ios` / `android`), because the shipped version names differ (iOS `1.53`, Android `0.55`).
- **#196's remaining collections (`organizations`, `userDeviceTokens`) get no rules and no code change.** Their only client code has no caller (dead code, a spec §2 non-goal), and the server reads neither. Task 21 closes #196 with that evidence.
- **Old `/redirect?url=` links are not kept working.** Nobody holds a live invitation (spec §3.4: no active users), and the route never existed.

## Open for the owner

- **D1, in-app application (spec §4.2: "If the designs conflict, ask the owner").** `IntroHouseSummary` is signed out (AuthStack). `submitApplication` requires a signed-in user and stores `applicantUid`, and the app already signs in anonymously. The options are:
  - **(a) Recommended.** APPLY opens `Apply` directly on the anonymous session. `ApplicationStatus` shows it on that device. When the operator approves and runs intake, the resident joins through the normal invitation, and the application stays linked to the house, not to a login.
  - **(b)** APPLY asks the person to create an account first, then opens `Apply`.

  Task 16 is written for (a) and lists what changes for (b).

## Global Constraints

- Work in a git worktree off `origin/main`, using `git -C <path>`. Commit scopes name the product: `feat(regroup-mobile):`, `fix(regroup-functions):`, `feat(regroup-web):`, `test(regroup):`, `docs(regroup):`.
- Never `--no-verify`. New source files ≤ 300 lines. Coverage floors only go up. No deleted, skipped or `.only` tests, no test-count drops, no `.snap` change without the `test-change-approved` label and a PR note.
- No PII in logs, fixtures, test data or commits. Fixtures use `@rats-e2e.com` accounts.
- **Deploy freeze:** nothing reaches `phoenix-cleanhouse` (functions, hosting/SSR, rules, indexes). Staging deploys (`--project regroup-e2e`) are allowed. Any new composite index goes in `regroup/mobile/firebase/firestore.indexes.json`.
- **Flow first** (spec §5 step 5): for each feature, write its Maestro flow, run it and see it fail for the expected reason, then build. Every Maestro flow starts with `runFlow: ../subflows/guard-e2e-app.yaml` and uses `appId: ${APP_ID}` (`maestro/scripts/flow-lint.js`).
- **Deep-link rows first** (spec §4.2): Task 1's baseline rows and their recorded results come before any link code changes, and pass again afterwards.
- **Coverage matrix:** every covered action updates its row in `regroup/mobile/docs/e2e/coverage-matrix.md` (`Status`, `Covered by`) in the same PR. Rows are never removed. `money` and `data` rows can't be deferred. `node regroup/mobile/scripts/coverage-matrix-check.js` passes.
- **Money:** stored amounts are integer cents, `house.monthlyRent` / `weeklyRent` are dollars, and convert only through `util/money.ts`. Money-path PRs (Tasks 9–12, 14, 22–26) get an independent reviewer reasoning from the domain model (spec §6).
- **Portal coupling:** `regroup/portal` bundles `regroup/mobile/src`. A PR touching `regroup/mobile/src` runs `cd regroup/portal && npx vitest run && node tools/bundle.mjs --production` (pre-push does this too). New mobile imports of native-only modules need a portal adapter entry.
- **Docs stay current:** each PR updates the docs its change makes untrue (see each task's Docs step). Dated plans and reports stay as they are.
- **Security rules:** no rule is loosened beyond what a task states. Every rules change has a rules test (`npm run test:rules` under `firebase emulators:exec --only firestore,storage,auth`).

## Review Focus

1. **Universal links that swallow the web pages the app opens.** The app links out to `https://<web>/pricing` and `/my-account?…`. If the app-link files claimed those paths, iOS and Android would reopen the app instead of the browser. Task 5's test asserts the generated files claim only the allowlist, and Task 9's test asserts every link-out path is outside it.
2. **A deep link that skips the paywall or a role check.** The modal routes (`HouseSettings`, `PaymentDashboard`, `Documents`, …) sit outside `SubscriptionGate`. A link into one must not open for a blocked operator, a blocked resident or a resident without the role. Task 2's test asserts the `linking` screens map holds only the allowlisted routes. Task 20's guard tests open each operator-only screen as a resident.
3. **Links before sign-in, an expired token, and links that arrive while signed in.** A signed-out cold start, a link while signed in, an expired or malformed token, and an `https` URL with extra query parameters must each end on a defined screen, never crash and never drop silently. Task 3's parse and delivery tests cover each.
4. **A version gate that blocks everyone.** A slow or failing `getAppConfig`, a missing value, `1.10` vs `1.9`, or a value for the other platform must all let the user in. Only a value strictly above this build's version blocks. Task 13's tests cover each.
5. **Dollars vs cents in the Rent settings and the custom rate.** `$175` must store `175` on the house (dollars) and `17500` on `customRent.amountCents` (cents). A weekly custom rate must not apply under a monthly schedule. Tasks 22 and 23 pin both with exact values.

---

## File structure

| File | Responsibility |
| --- | --- |
| `regroup/app-links.json` (new) | One source: domains per environment, iOS app IDs, Android package plus fingerprints per environment, claimed paths |
| `regroup/web/scripts/generate-app-links.mjs` (new) | Writes `dist/sapp/browser/app-links/{apple-app-site-association.json,assetlinks.json}` for a target project |
| `regroup/web/scripts/check-app-links.mjs` (new) | Fetches both files from a deployed site and checks status, content type, no redirect and content |
| `regroup/mobile/src/services/appLinks/parseAppLink.ts` (new) | `parseAppLink(url) → AppLink \| null`, the only URL parser |
| `regroup/mobile/src/services/appLinks/deliverAppLink.ts` (new) | Routes a parsed link now, or holds it until sign-in |
| `regroup/mobile/src/navigation/linking.ts` | Allowlisted screens, prefixes from `appLinkPrefixes()` |
| `regroup/mobile/src/services/webBilling.ts` (new) | `openWebBilling(page, opts)`, the single link-out to web billing |
| `regroup/mobile/src/components/version-gate/` (new) | `VersionGate`, `UpdateRequiredScreen`, `compareVersions` |
| `regroup/mobile/src/config/appVersion.ts` (new) | Per-platform shipped version constant |
| `regroup/mobile/src/components/subscription/ResidentLimitedView.tsx` (new) | The blocked resident's view: own payment history and documents |
| `regroup/mobile/src/components/require-house-role/` (new) | `RequireHouseRole`, the per-screen role check |
| `regroup/mobile/src/screens/HouseSettings/RentSettingsScreen.tsx` (new) | Schedule, price and the turn-on preview |
| `regroup/functions/src/callable/getAppConfig.ts` (new) | Public `{ minVersion: { ios, android } }` |
| `regroup/functions/src/callable/previewRentCharges.ts` (new) | What each current resident would be charged if charging turned on |
| `regroup/web/src/app/components/app-link-landing/` (new) | `/invite`, `/app/*` and `/checkout-return` web pages: open the app or show the store links |

---

## Part A: Link baseline (before any link code changes)

### Task 1: Matrix rows and baseline flows for every link the app handles today

**Files:**
- Modify: `regroup/mobile/docs/e2e/coverage-matrix.md` (LINK rows, :177-196)
- Create: `regroup/mobile/maestro/flows/deep-link-invitation-token.yaml`, `regroup/mobile/maestro/flows/deep-link-invitation-signed-in.yaml`, `regroup/mobile/maestro/flows/deep-link-legacy-scheme.yaml`
- Reference: `regroup/mobile/maestro/flows/deep-link-invitation-cold.yaml`, `deep-link-invitation-warm.yaml`

**Interfaces:**
- Produces: LINK rows with recorded baseline results, which Task 4 re-runs.

- [ ] **Step 1: Write the rows.** Today the app handles one link type, the invitation (`services/native-deep-links.ts:11`), in two forms: token (`regroup-app://?type=invitation&token=…`, what `createInvitation` sends) and legacy params (`house=…&email=…`). For each form, add one row per case: signed out, cold (LINK-002 exists); signed out, warm (new); signed in (new); and not installed (device row, DEVS-). Also add `com.rats.dev://` for one form (LINK-007/008 exist). Split LINK-013…020 into one row per `linking` route that Task 2 keeps. Use free IDs from LINK-004 up and LINK-024 onwards. Kind `maestro`, platform `both`, guard `none`.
- [ ] **Step 2: Write the three new flows** on the pattern of `deep-link-invitation-cold.yaml`. The token flow uses a token seeded by `maestro/scripts/seed/index.js`. Add an invitation with a known token, `e2e-invite-token-1`, to the seed if none exists, and assert `invitation-info`. The signed-in flow logs in as `test-guest-a@rats-e2e.com` via `subflows/login.yaml`, then opens the link. The legacy-scheme flow opens the same link with `com.rats.dev://`.
- [ ] **Step 3: Run every LINK flow on iOS and Android** (`maestro/scripts/run-flows.sh <flow> --sim $SIM_UDID`; Android per `maestro/README.md` :53). Record each result in its row (`pass` / `fail`). Expected: the invitation flows pass while signed out; the signed-in invitation fails or lands nowhere (no route exists, finding from `improved-navigation-service.ts:110-146`); every `linking` route fails (the config isn't wired).
- [ ] **Step 4: Check the matrix**, then commit.
  Run: `node regroup/mobile/scripts/coverage-matrix-check.js`. Expected: exit 0.
  ```bash
  git -C <wt> add regroup/mobile/docs/e2e/coverage-matrix.md regroup/mobile/maestro/flows/deep-link-*.yaml regroup/mobile/maestro/scripts/seed/index.js
  git -C <wt> commit -m "test(regroup-mobile): baseline rows and flows for every link the app handles"
  ```

---

## Part B: Deep links and universal links

### Task 2: Wire the `linking` config, with allowlisted routes and the right prefixes

**Files:**
- Create: `regroup/mobile/src/navigation/appLinkPrefixes.ts`
- Modify: `regroup/mobile/src/navigation/linking.ts`, `regroup/mobile/index.js:57`
- Test: `regroup/mobile/src/navigation/__tests__/linking.test.ts`

**Interfaces:**
- Produces: `appLinkPrefixes(): string[]` returns `['regroup-app://', 'com.rats.dev://', <origin of webBaseUrl()>]` (from `config/env.ts:55`), and `linkingConfig: LinkingOptions<RootStackParamList>`. These are consumed by Tasks 3 and 10.

- [ ] **Step 1: Write the failing test.**
  ```ts
  describe('linkingConfig', () => {
    it('accepts the canonical scheme, the legacy scheme for one release, and the web origin', () => {
      expect(linkingConfig.prefixes).toEqual(['regroup-app://', 'com.rats.dev://', 'https://regroup-app.com']);
    });
    it('drops the unregistered regroup:// scheme', () => {
      expect(linkingConfig.prefixes).not.toContain('regroup://');
    });
    it.each(ALLOWED_PATHS)('resolves %s to its screen', (path, route) => {
      expect(getStateFromPath(path, linkingConfig.config)).toMatchObject(expectedState(route));
    });
    it('exposes no operator-only or paywalled screen', () => {
      const screens = flattenScreens(linkingConfig.config);
      for (const r of [Routes.HouseSettings, Routes.PaymentDashboard, Routes.SubscriptionHandler, Routes.PhaseCustomization, Routes.GuestInfo, Routes.SendInvites]) expect(screens).not.toContain(r);
    });
    it('defines each path once', () => { /* no duplicate 'contacts', 'personal', 'account/new' */ });
  });
  ```
  `ALLOWED_PATHS` is the reviewed allowlist. It keeps the `Main` tabs (`app/house`, `app/guest`, `app/activities`, `app/contacts`, `app/chat`, `app/personal`), `auth/login`, `auth/signup/:invitation?` and `app/checkout-return` (Task 10), and nothing that opens outside `SubscriptionGate`.
- [ ] **Step 2: Run it.** `cd regroup/mobile && npx jest src/navigation/__tests__/linking.test.ts`. Expected: FAIL (prefix `regroup://`, duplicates, and operator screens present).
- [ ] **Step 3: Implement.** Rebase onto #279 first. Rewrite `linking.ts` to the allowlist with prefixes from `appLinkPrefixes()`. Pass `linking={linkingConfig}` to `<NavigationContainer>` in `index.js`. Invitation URLs stay with `native-deep-links` (Task 3), so `linking` ignores `?type=invitation` URLs through `getStateFromPath` returning `undefined` for them.
- [ ] **Step 4: Run** the unit test, then the Task 1 `linking`-route flows on both platforms. Expected: PASS. Update those rows.
- [ ] **Step 5: Docs and commit.** Update the "Navigation" section of `regroup/mobile/.claude/rules/architecture.md` and `regroup/mobile/README.md:62`.
  `git commit -m "feat(regroup-mobile): wire deep links through an allowlisted linking config"`

### Task 3: One parser for every incoming link, and delivery that survives sign-in

**Files:**
- Create: `regroup/mobile/src/services/appLinks/parseAppLink.ts`, `regroup/mobile/src/services/appLinks/deliverAppLink.ts`
- Modify: `regroup/mobile/src/services/native-deep-links.ts`, `regroup/mobile/src/screens/Splash/Splash.tsx:159-170,266-291`, `regroup/mobile/src/state/slices/userSlice.ts` (pending link), `regroup/mobile/src/navigation/improved-navigation-service.ts`
- Test: `regroup/mobile/src/services/appLinks/__tests__/parseAppLink.test.ts`, `deliverAppLink.test.ts`

**Interfaces:**
- Produces:
  ```ts
  export type AppLink =
    | { kind: 'invitation'; token: string }
    | { kind: 'invitation-legacy'; params: Record<string, string> }
    | { kind: 'checkout-return'; result: 'success' | 'canceled' | 'portal' };
  export function parseAppLink(url: string): AppLink | null;      // parseAppLink.ts
  export function deliverAppLink(link: AppLink, ctx: { signedIn: boolean; dispatch: AppDispatch }): void; // deliverAppLink.ts
  ```
  `userSlice` gains `pendingAppLink: AppLink | null` with `setPendingAppLink` and `clearPendingAppLink`. These are consumed by Tasks 4 and 10.

- [ ] **Step 1: Write the failing tests.**
  - Parse the same intent from `regroup-app://?type=invitation&token=abc`, `com.rats.dev://?type=invitation&token=abc`, `https://regroup-app.com/invite?token=abc` and `https://regroup-app.com/invite?token=abc&utm_source=email`: each gives `{kind:'invitation', token:'abc'}`.
  - `?type=invitation` as the last parameter (today `getLinkType` slices to the first `&` and gets it wrong, `native-deep-links.ts:153-166`).
  - `https://evil.example/invite?token=abc` → `null`.
  - `https://regroup-app.com/pricing` → `null` (not claimed).
  - `https://regroup-app.com/checkout-return?result=success` and `regroup-app://app/checkout-return?result=portal` → `checkout-return`.
  - An empty, malformed or missing token → `null`.
  - Delivery, signed out: stores the pending link and routes nothing. On sign-in, the pending link is delivered once and cleared.
  - Delivery, signed in: an invitation dispatches `initializeInvitation` and navigates to the invitation screen.
- [ ] **Step 2: Run them.** `npx jest src/services/appLinks`. Expected: FAIL (modules missing).
- [ ] **Step 3: Implement.** Parse with `new URL(...)`; the `URL` polyfill is already used by the RN 0.88 build, so check `index.js` and add `react-native-url-polyfill` only if it's missing and the owner agrees. `isValidDeepLink` and `getLinkType` become thin wrappers over `parseAppLink`, so `Splash.test.tsx` keeps passing. `Splash` calls `deliverAppLink` for the initial URL and the listener. `improved-navigation-service` gains a signed-in invitation route, the existing redeem screen.
- [ ] **Step 4: Run** the unit tests plus `Splash.test.tsx` and the Task 1 flows (signed-in invitation now `pass`). Expected: PASS, every baseline row unchanged or better.
- [ ] **Step 5: Commit.** `feat(regroup-mobile): one parser for app links, delivered after sign-in`

### Task 4: Email links become `https` app links

**Files:**
- Modify: `regroup/functions/src/callable/invitations.ts:81-82` (`buildInviteLink`), `regroup/functions/src/util/inviteEmails.ts:27-52`, `regroup/functions/src/util/user.ts:29-46` (`createConfirmationEmail`)
- Test: `regroup/functions/src/__tests__/util/inviteEmails.test.ts` (new), `regroup/functions/src/__tests__/util/user.test.ts:146-157`, `__tests__/callable/invitations.test.ts`

**Interfaces:**
- Consumes: Task 3's `https://<web origin>/invite?token=` form.
- Produces: `buildInviteLink(token: string, webOrigin: string): string` returns `${webOrigin}/invite?token=${encodeURIComponent(token)}`. `webOrigin` comes from the functions' existing web-URL config; read `functions/CLAUDE.md` "Callable contracts" for the param name, and add `WEB_BASE_URL` with default `https://regroup-app.com` only if none exists.

- [ ] **Step 1: Write the failing tests.**
  - `sendOneInviteEmail` with an https link: the HTML href and the plain-text body both equal the https link, and neither contains `com.rats.dev` or `/redirect`.
  - `buildInviteLink('t 1', 'https://regroup-e2e.web.app')` → `'https://regroup-e2e.web.app/invite?token=t%201'`.
  - `createConfirmationEmail`: replace the `/redirect?url=` expectation (`user.test.ts:146-151`) with "an app link passes through unwrapped". Keep the test count the same (edit the case in place).
- [ ] **Step 2: Run them.** `cd regroup/functions && npx jest src/__tests__/util src/__tests__/callable/invitations.test.ts`. Expected: FAIL.
- [ ] **Step 3: Implement.** Remove the `com.rats.dev` rewrite and the `/redirect` wrap.
- [ ] **Step 4: Run** `npm test -- --forceExit`, then re-run every Task 1 baseline flow using the new token link. Expected: all pass, with no baseline row worse.
- [ ] **Step 5: Docs and commit.** Update `regroup/functions/CLAUDE.md` (invitation link format) and add matrix rows per email type (spec §4.2: "Each email type gets its own coverage-matrix rows").
  `fix(regroup-functions): invitation and account emails send https app links`

### Task 5: Serve the universal-link files from `regroup/web`

**Files:**
- Create: `regroup/app-links.json`, `regroup/web/scripts/generate-app-links.mjs`, `regroup/web/scripts/check-app-links.mjs`, `regroup/web/scripts/__tests__/app-links.test.mjs`
- Modify: `regroup/web/firebase.json` (rewrites and headers before `**`), `regroup/web/package.json` (`build:ssr*` runs the generator; `test:scripts` picks up the test)
- Delete: nothing. The stale `regroup/mobile/.well-known/apple-app-site-association` and `regroup/mobile/apple-app-site-association` stay until Task 7, which points their header at the new source.

**Interfaces:**
- Produces: `app-links.json`, shaped as:
  ```json
  { "paths": ["/invite", "/app/*", "/checkout-return"],
    "environments": {
      "phoenix-cleanhouse": { "domain": "regroup-app.com", "iosAppIds": ["D8K3FS4HAX.com.rats.dev"], "android": [{ "package": "com.regroup.app", "sha256": ["<OWNER: Play app-signing SHA-256>"] }] },
      "regroup-e2e": { "domain": "regroup-e2e.web.app", "iosAppIds": ["D8K3FS4HAX.com.rats.dev.e2e.stg"], "android": [{ "package": "com.regroup.app.e2e.stg", "sha256": ["<debug keystore SHA-256>"] }] } } }
  ```
  `generate-app-links.mjs --project <id> --out <dir>` writes:
  - `apple-app-site-association.json` (`applinks.details[].appIDs` + `components` from `paths`, plus `webcredentials` none);
  - `assetlinks.json` (`delegate_permission/common.handle_all_urls` per package).

  Consumed by Tasks 6–8. The generator refuses an unknown project, and refuses a placeholder fingerprint for `phoenix-cleanhouse`.

- [ ] **Step 1: Write the failing tests** (`node --test`).
  - The generated AASA for `regroup-e2e` lists exactly the staging app ID, and its components cover `/invite`, `/app/*` and `/checkout-return` and nothing else.
  - Neither file claims `/`, `/pricing`, `/signup`, `/my-account`, `/login` or `*` (Review Focus 1).
  - `assetlinks.json` for `regroup-e2e` names `com.regroup.app.e2e.stg` with the fingerprint.
  - `--project phoenix-cleanhouse` with the placeholder fingerprint exits non-zero.
  - `firebase.json`:
    - rewrites `/.well-known/apple-app-site-association` and `/apple-app-site-association` to `/app-links/apple-app-site-association.json`, and `/.well-known/assetlinks.json` to `/app-links/assetlinks.json`;
    - lists all three before the `**` → `ssr` rewrite;
    - sets `Content-Type: application/json` on `/app-links/**`.
- [ ] **Step 2: Run them.** `cd regroup/web && npm run test:scripts`. Expected: FAIL.
- [ ] **Step 3: Implement.** Write into `dist/sapp/browser/app-links/`, a dot-free folder, because hosting ignores `**/.*`. Run the generator from both `build:ssr` and `build:ssr:e2e-staging` with the matching project.
- [ ] **Step 4: Run the tests** (PASS). Then **deploy staging web** (`--project regroup-e2e`, codebase-qualified per `regroup/web/CLAUDE.md` § Staging) and run `node scripts/check-app-links.mjs https://regroup-e2e.web.app --project regroup-e2e`. Expected: both URLs return 200, `application/json`, no redirect, and content equal to the generated files. Record the output in the PR. This is row LINK-021 (kind `unit`), plus a new row for the deployed check (kind `staging`).
- [ ] **Step 5: Docs and commit.** Update `regroup/web/CLAUDE.md` (app-link files, and that the production fingerprint comes from the owner). Add a P8 runbook line to the roadmap's launch section: fetch both files from `regroup-app.com` after the production web deploy (spec §5 step 8.5).
  `feat(regroup-web): serve universal-link files from one checked-in source`

### Task 6: The web page behind every app link (installed or not)

**Files:**
- Create: `regroup/web/src/app/components/app-link-landing/app-link-landing.component.{ts,html,scss,spec.ts}`
- Modify: `regroup/web/src/app/app-routing.module.ts` (routes `invite`, `app/**`, `checkout-return`, all before `**`), the declaring module

**Interfaces:**
- Consumes: Task 5's paths.
- Produces: a page that keeps the intent. The query string is preserved into an "Open in Regroup" button (`regroup-app://<same path and query>`) and shown with the App Store link (`id1502040260`, from `redirect.component.ts:253`) and the Play link (`com.regroup.app`).

- [ ] **Step 1: Write the failing Karma spec.**
  - `/invite?token=abc` renders the open button with href `regroup-app://invite?token=abc` and both store links.
  - `/checkout-return?result=success` renders "Return to Regroup" with href `regroup-app://app/checkout-return?result=success`.
  - A query with `<script>` is rendered escaped (Angular binding, no `innerHTML`).
  - No PII is logged.
- [ ] **Step 2: Run it.** `cd regroup/web && npx ng test --watch=false --include=src/app/components/app-link-landing`. Expected: FAIL.
- [ ] **Step 3: Implement.** No automatic redirect or iframe trick. One tap opens the app; on iOS, Safari's own universal-link banner also applies.
- [ ] **Step 4: Run** the spec (PASS), deploy staging web, and open `https://regroup-e2e.web.app/invite?token=abc` in a browser. Expected: the page renders server-side, with no 404. Add a matrix row (the not-installed case).
- [ ] **Step 5: Commit.** `feat(regroup-web): app-link landing page that keeps the link's intent`

### Task 7: App registrations match the link files

**Files:**
- Modify:
  - `regroup/mobile/ios/rats/rats.entitlements`, `ratsDebug.entitlements` (keep `applinks:regroup-app.com`)
  - Create `regroup/mobile/ios/rats/ratsE2EStaging.entitlements` (`applinks:regroup-e2e.web.app`), and point the E2EStaging build config at it (`project.pbxproj:1041`)
  - `regroup/mobile/android/app/src/main/AndroidManifest.xml:41-47`: host from a manifest placeholder `appLinkHost`, plus `android:pathPrefix` entries matching `app-links.json`
  - `android/app/build.gradle`: `manifestPlaceholders = [appLinkHost: 'regroup-app.com']`, and `regroup-e2e.web.app` for `e2eStaging`
  - The headers of both stale AASA files in `regroup/mobile`: state that they're superseded by `regroup/app-links.json`. Edit them only if they're JSON-with-comment-safe; otherwise list them in the doc and leave them as they are.
- Test: `regroup/mobile/scripts/__tests__/app-link-registrations.test.js` (new, mobile Jest)

**Interfaces:**
- Consumes: `regroup/app-links.json`.

- [ ] **Step 1: Write the failing test.** It reads the entitlements, the manifest, `build.gradle` and `app-links.json`, and asserts:
  - each environment's domain appears in that variant's associated domains and its Android host;
  - the Android path filters equal `paths`;
  - the E2EStaging config uses the staging entitlements;
  - `applinks:cleanhouse.page.link` and the `example` scheme are still present. Their removal is the release after launch (spec §4.2), so the test pins today's state and the follow-up flips it.
- [ ] **Step 2: Run it.** `npx jest scripts/__tests__/app-link-registrations.test.js`. Expected: FAIL.
- [ ] **Step 3: Implement** the registrations above.
- [ ] **Step 4: Verify.**
  - Run the test (PASS).
  - Run `verify-ios-variants.sh` and `verify-android-variants.sh`, and build `e2eStaging`. Expected: pass.
  - Then on a device or emulator with the staging APK: `adb shell pm verify-app-links --re-verify com.regroup.app.e2e.stg` and `adb shell pm get-app-links com.regroup.app.e2e.stg`. Expected: `regroup-e2e.web.app: verified`. Record the output in the PR.
- [ ] **Step 5: Commit.** `feat(regroup-mobile): app-link registrations follow the shared link config`

### Task 8: Universal links on real devices (device checklist rows)

**Files:**
- Modify: `regroup/mobile/docs/e2e/coverage-matrix.md` (DEVS-/DEVP- rows), `regroup/docs/operations/manual-tasks/2026-11-06-rn-0.88-merge-device-pass.md` (a "Universal links" section)

- [ ] **Step 1: Add rows.** For each link kind (invitation, checkout return, one `/app/*` route), one DEVS- row (staging build, `https://regroup-e2e.web.app/...`) and one DEVP- row (production TestFlight/internal build, `https://regroup-app.com/...`), each in three cases:
  - **Installed and signed in:** tapping from Mail/Messages opens the app on the right screen.
  - **Installed and signed out:** opens the app, and after sign-in lands on the target.
  - **Not installed:** the landing page with the store links, keeping the token.

  Also add the Android `pm get-app-links` check and the iOS check (`sysdiagnose`, not needed; use the long-press preview: "Open in Regroup").
- [ ] **Step 2: Write the checklist steps** with exact URLs and expected screens.
- [ ] **Step 3: Check the matrix** (exit 0) and commit. `docs(regroup-mobile): device checks for universal links`

---

## Part C: Checkout in the system browser, and the hand-back

### Task 9: Link out to web billing instead of the WebViews

**Files:**
- Create: `regroup/mobile/src/services/webBilling.ts`, `regroup/mobile/maestro/flows/billing-link-out.yaml`
- Modify:
  - `src/screens/Subscription/SubscriptionRequiredScreen.tsx:22-50`
  - `src/components/subscription/PlanRequiredPanel.tsx:21` (currently navigates to `SubscriptionHandler`)
  - `src/screens/Oxford/OxfordDashboard.tsx:214`
  - `src/screens/SubscriptionHandler/SubscriptionHandler.tsx` (render a link-out screen; no WebView)
  - `src/screens/SignUp/SignUpWebView.tsx` and `SignUp.tsx:252`: the operator role opens `pricing` in the browser
- Test: `src/services/__tests__/webBilling.test.ts`, the `SubscriptionHandler` and `SubscriptionRequiredScreen` tests

**Interfaces:**
- Consumes: `webBaseUrl()` (`config/env.ts:55`).
- Produces: `openWebBilling(page: 'pricing' | 'my-account', opts?: { email?: string }): Promise<boolean>` opens `${webBaseUrl()}/${page}?from=app` (plus `&email=` when given) with `Linking.openURL`. It returns `false` and shows the existing error alert when the URL can't open.

- [ ] **Step 1: Write the flow** (`billing-link-out.yaml`). Signed in as a plan-required operator (seed one: `test-plan-required@rats-e2e.com`, a house with no `subscriptionStatus`), tap `view-plans-button` and assert that the app is no longer in the foreground. Maestro can't read the browser, so assert the app's `SubscriptionHandler` WebView test ID `subscription-webview` is **not** visible. Run it. Expected: FAIL (the WebView opens).
- [ ] **Step 2: Write the failing unit tests.**
  - `openWebBilling('pricing')` opens `https://regroup-app.com/pricing?from=app`, and honours `RATS_WEB_URL`.
  - Every path `openWebBilling` can produce is outside `app-links.json` `paths` (Review Focus 1).
  - `SubscriptionHandler` renders no `WebView`.
  - `SubscriptionRequiredScreen` uses `openWebBilling('my-account')`.
- [ ] **Step 3: Implement.** No code path collects payment in-app (spec §4.1 item 6). `react-native-webview` stays installed: rent's `PaymentWebView` is dead code, out of scope.
- [ ] **Step 4: Run** the unit tests and the flow on both platforms (PASS). Update rows BILL-* for link-out.
- [ ] **Step 5: Docs and commit.** Update `regroup/mobile/.claude/rules/architecture.md` "Subscription & Paywall", `regroup/docs/launch-readiness/billing-go-live-runbook.md` (link-out), and `regroup/docs/technical/architecture.md` (billing section).
  `feat(regroup-mobile): checkout and plan management open in the browser`

### Task 10: The app handles the checkout hand-back

**Files:**
- Modify: `src/services/appLinks/deliverAppLink.ts` (the `checkout-return` branch), `src/navigation/linking.ts` (`app/checkout-return`)
- Create: `regroup/mobile/maestro/flows/billing-hand-back.yaml`
- Test: `deliverAppLink.test.ts`

**Interfaces:**
- Consumes: `AppLink` `checkout-return` (Task 3).
- Produces: on `checkout-return`, the app invalidates the query keys that `SubscriptionGate` refreshes on foreground: `['user', uid]`, the house detail and `['paywall','config']` (`SubscriptionGate.tsx:42-76`). It then lets the gate decide. A signed-out hand-back is held and delivered after sign-in.

- [ ] **Step 1: Write the flow.** It is the LINK-011/012 rows (guard `money`). The test operator `test-plan-required@…` is signed in. The flow sets the house's `subscriptionStatus: 'trialing'` through `maestro/scripts/assert-firestore.js`'s admin helper (or a seed script step), opens `regroup-app://app/checkout-return?result=success`, and asserts that the plan-required screen is gone and `house-tab` is visible. In a second case, signed out, it opens the link, signs in and asserts the same. Run it. Expected: FAIL.
- [ ] **Step 2: Write the failing unit tests.** Each result invalidates the three keys once. `canceled` shows the plan-required screen again with no error.
- [ ] **Step 3: Implement** the branch.
- [ ] **Step 4: Run** the unit tests and the flow, on both platforms (PASS). Update LINK-011/012.
- [ ] **Step 5: Commit.** `feat(regroup-mobile): the checkout hand-back refreshes the plan state`

### Task 11: Web pages hand back to the app

**Files:**
- Modify:
  - `regroup/web/src/app/components/signup/signup.component.ts:49-54` (`setBillingCompleted`) and `signup.component.html:109-121`
  - `regroup/web/src/app/components/billing-info/billing-info.component.ts:182-192` (drop the WebView `postMessage`)
  - `regroup/web/src/app/components/my-account/my-account.component.ts:75-90` (the portal `returnUrl` keeps `?from=app`, and the page shows "Return to Regroup" when present)
- Test: the matching `*.spec.ts`

**Interfaces:**
- Consumes: Task 6's `/checkout-return` page and Task 10's result values.
- Produces: with `?from=app`, success navigates to `/checkout-return?result=success`, and my-account (after the portal) shows a link to `/checkout-return?result=portal`. Without `from=app`, nothing changes.

- [ ] **Step 1: Write the failing specs.**
  - Signup with `from=app`: after billing completes, the router navigates to `/checkout-return?result=success`.
  - Without `from=app`, the "Download the app" block stays.
  - `ReactNativeWebView.postMessage` is never called.
  - The portal `returnUrl` still passes `safeReturnUrlSchema` (a server test in `functions/src/__tests__/callable/subscriptions.test.ts` asserts that `https://regroup-app.com/my-account?from=app` is accepted).
- [ ] **Step 2: Run them.** Expected: FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** the web specs and `regroup/functions` tests (PASS). The Playwright journey (LINK-023) is P6. Leave it `missing` with a note.
- [ ] **Step 5: Commit.** `feat(regroup-web): checkout and plan changes return to the app`

### Task 12: Prices, trial length and the sales switch come from the catalog

**Files:**
- Modify:
  - Web: `regroup/web/src/app/entities/TierCatalog.ts:31-34` (add `trialDays: number; salesOpen: boolean`), `order-summary.component.ts:4` (drop `TRIAL_DAYS`), `pricing-one.component.ts`, `tier-picker.component.ts`, `signup.component.ts:95-115`, `work.component.html:22` ("30-day free trial" → "free trial")
  - Mobile: create `src/services/tierCatalog.ts`; modify `src/screens/Oxford/OxfordDashboard.tsx:203,218,224`
- Test: the web specs for those components; `src/services/__tests__/tierCatalog.oplog.test.ts`; `OxfordDashboard` test

**Interfaces:**
- Consumes: the `getTierCatalog` response `{ currency, tiers, trialDays, salesOpen }` (`functions/src/callable/getTierCatalog.ts:49-54`).
- Produces: `getTierCatalog(): Promise<TierCatalogResponse | null>` (mobile), returning `null` on any error.

- [ ] **Step 1: Write the failing tests.**
  - Web: the order summary shows the catalog's `trialDays` (a fixture with `5` renders "5-day").
  - With `salesOpen: false`, the pricing and signup pages show "Coming soon", no checkout button exists, and `createOperatorSubscription` is never called.
  - With the catalog unavailable, no price and no trial number are shown.
  - `work.component.html` contains no digit before "-day".
  - Mobile: the Oxford upgrade card shows `$49/month` and `Start 7-Day Free Trial` from a fixture with `amountCents: 4900`, `trialDays: 7`. With the catalog `null`, it shows "See plans" and no number.
- [ ] **Step 2: Run them.** Expected: FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** the specs and Jest (PASS). Add or update the BILL rows for both sales-switch states (guard `money`).
- [ ] **Step 5: Commit.** Two commits, one per package: `feat(regroup-web): …` and `feat(regroup-mobile): …`.

---

## Part D: Gates

### Task 13: Minimum-version gate

**Files:**
- Create:
  - `regroup/functions/src/callable/getAppConfig.ts` (export in `functions/src/index.ts`), and `functions/src/__tests__/callable/getAppConfig.test.ts`
  - `regroup/mobile/src/config/appVersion.ts`
  - `regroup/mobile/src/components/version-gate/{VersionGate.tsx,UpdateRequiredScreen.tsx,compareVersions.ts}` and tests
  - `regroup/mobile/maestro/flows/version-gate.yaml`
- Modify:
  - `regroup/functions/src/scripts/setServerSwitch.ts` (switch `minVersion`, `--platform ios|android --value <x.y[.z]|none>`)
  - `regroup/mobile/src/App.tsx:118-140` (wrap `RootNavigatorMemo` in `VersionGate`)
  - `regroup/mobile/maestro/scripts/seed/index.js` (`config/app`)
- Test: `regroup/mobile/scripts/__tests__/app-version.test.js` (keeps `appVersion.ts` equal to the native files)

**Interfaces:**
- Produces:
  - `getAppConfig` (public, no auth, like `getTierCatalog`). It returns `{ minVersion: { ios: string | null; android: string | null } }`, read from the server-only `config/app`, and caches 60 s. A missing doc gives `null`s.
  - `compareVersions(a: string, b: string): -1 | 0 | 1`, numeric per dotted part.
  - `APP_VERSION: { ios: string; android: string }`.
  - `<VersionGate>` renders children unless `compareVersions(APP_VERSION[Platform.OS], min) < 0`.

- [ ] **Step 1: Write the flow** (GATE-001/002). The seed sets `config/app.minVersion.ios = '99.0'` (and the Android equivalent): launch, then assert `update-required-screen` and its store button. Then the seed removes it: launch and assert `initial-landing-screen`. Run it. Expected: FAIL.
- [ ] **Step 2: Write the failing unit tests.**
  - `compareVersions('1.10','1.9') === 1`, `('1.53','1.53.0') === 0`, `('0.55','1.0') === -1`.
  - The gate allows when the callable rejects, times out after 3 s (fake timers), returns `null`, returns a malformed value, or names only the other platform (Review Focus 4).
  - The gate blocks only when `min` is strictly greater.
  - `app-version.test.js`: `APP_VERSION.ios` equals `CFBundleShortVersionString` / `MARKETING_VERSION`, and `APP_VERSION.android` equals `versionName`.
  - `getAppConfig.test.ts`: reads `config/app`, nulls on a missing doc, needs no auth.
- [ ] **Step 3: Implement.** `UpdateRequiredScreen` uses the store links from Task 6. The gate runs before sign-in (above the navigator; `getAppConfig` needs no auth), and the callable is fetched once per launch and on foreground.
- [ ] **Step 4: Run** the unit tests (functions and mobile), then the flow on both platforms (PASS). Update GATE-001/002.
- [ ] **Step 5: Docs and commit.**
  - `regroup/functions/CLAUDE.md`: how to set `minVersion` without a deploy.
  - `regroup/docs/operations/`: one paragraph in the launch runbook for spec §5 step 10.6, setting it only once the new version is downloadable.
  - `regroup/mobile/CLAUDE.md`: bump `appVersion.ts` with every release, which the test enforces.

  Commit in two commits: `feat(regroup-functions): public getAppConfig with the minimum version` and `feat(regroup-mobile): minimum-version gate that fails open`.

### Task 14: Read-only view for residents of a blocked house

**Files:**
- Create: `regroup/mobile/src/components/subscription/ResidentLimitedView.tsx`, its test, and `regroup/mobile/maestro/flows/resident-limited-view.yaml`
- Modify:
  - `src/components/subscription/SubscriptionGate.tsx:86-88` (`grace_expired` for a guest renders `ResidentLimitedView`)
  - `regroup/mobile/firebase/firestore.rules:1251-1254` (documents: a resident reads documents whose `guestId` is their own guest record)
  - The document-link callable, if it checks admin only (find `getDocumentLink` in `regroup/functions/src`)
  - `src/screens/Documents/DocumentListScreen.tsx` (works for a resident's own documents, read-only: no upload or delete)
- Test: `firebase/__tests__/documents.rules.test.ts` (or the existing documents rules suite), the gate component test (none exists today), and the document-link callable test

**Interfaces:**
- Consumes: `GateStatus` (`hooks/useSubscriptionGate.ts:19-27`), `Routes.PaymentHistory`, `Routes.Documents` (params `{houseId, guestId, title}`).
- Produces: `ResidentLimitedView`, a blocked-screen message with two buttons, `limited-payment-history` (→ `PaymentHistory`, CSV export included) and `limited-documents` (→ `Documents` for their own `guestId`), plus sign-out. Plan-required for a resident is the same as `grace_expired`; the stored name for plan-required is P4b's call (spec §8), so match whatever P4b chose, or map both.

- [ ] **Step 1: Write the flow** (BILL rows for the resident, guard `data`). Seed a house with `subscriptionStatus: 'canceled'` and no grace, and resident `test-guest-lapsed@rats-e2e.com` with one payment and one document. Sign in and assert the limited view. Open payment history and assert the payment row and `export-csv-button`. Go back, open documents and assert the document row, with no upload button. Assert `house-tab` is **not** reachable. Run it. Expected: FAIL.
- [ ] **Step 2: Write the failing tests.**
  - Rules:
    - the resident reads their own document;
    - the resident is refused another resident's document and every write;
    - an admin still reads the house's documents;
    - a resident of another house is refused.
  - Gate component: a guest with `grace_expired` sees `ResidentLimitedView`, and an operator with `subscription_required` still sees `SubscriptionRequiredScreen`.
  - Deep links: `linking` exposes neither screen, so the limited view is the only way in (Review Focus 2).
- [ ] **Step 3: Implement.** The rules change is a widening limited to the resident's own records. Name it in the PR, and run the full rules suite.
- [ ] **Step 4: Run** the rules tests (`firebase emulators:exec --only firestore,storage,auth … npm run test:rules`), Jest and the flow, on both platforms. Expected: PASS.
- [ ] **Step 5: Docs and commit.** Update `regroup/mobile/.claude/rules/architecture.md` (Subscription & Paywall) and `regroup/docs/product/requirements.md`.
  `feat(regroup-mobile): residents of a blocked house keep their payment history and documents`

---

## Part E: Screens nothing opens, and role checks

### Task 15: Oxford business meeting detail

**Files:**
- Modify:
  - `src/navigation/types.ts` (add `BusinessMeetingDetail = 'businessMeetingDetail'`, with param `{ meeting: BusinessMeeting }`, using the Oxford entity type the screen reads)
  - `src/navigation/navigators.tsx` (register it in the modal group)
  - `src/screens/Oxford/BusinessMeetings.tsx:109` (`navigate(Routes.BusinessMeetingDetail, { meeting: item })`)
- Test: `src/screens/Oxford/__tests__/BusinessMeetings.test.tsx` (new case), `regroup/mobile/maestro/flows/oxford-business-meeting.yaml`

- [ ] **Step 1: Write the flow** (OXF business meetings row). Sign in as `test-oxford-operator@…` and open Business Meetings. The seed gives one meeting. Tap it and assert the detail screen's attendees section. Run it. Expected: FAIL.
- [ ] **Step 2: Write the failing test:** tapping a row calls `navigate(Routes.BusinessMeetingDetail, { meeting })`.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** the test and the flow on both platforms (PASS).
- [ ] **Step 5: Commit.** `fix(regroup-mobile): Oxford business meetings open their detail`

### Task 16: In-app application (needs D1)

**Files:**
- Modify:
  - `src/screens/IntroHouseSummary/IntroHouseSummary.tsx:254-263` (APPLY → `Routes.Apply`); keep self-signup on its existing "Sign up" entry (`apply-button` stays the test ID)
  - `src/screens/Application/ApplyScreen.tsx:73-74` (`navigate(Routes.ApplicationStatus, …)`; drop the stale comment)
  - `src/screens/Application/ApplicationStatusScreen.tsx:85`
  - `src/screens/ResidentIntake/IntakeFormScreen.tsx:85` (pre-fill from `applicationId`)
  - `src/navigation/navigators.tsx` (make `Apply` and `ApplicationStatus` reachable from AuthStack, or register them there)
- Test:
  - Update the `IntroHouseSummary.test.tsx:538-543` expectation in place
  - New screen tests for Apply, ApplicationStatus and the Intake pre-fill
  - `regroup/mobile/maestro/flows/application-to-intake.yaml` (cross-role, XROLE row)

**Interfaces:**
- Consumes: `useSubmitApplication`, `useMyApplications`, `useUpdateApplicationStatus` (`state/queries/applicationQueries.ts`), and `submitApplication(houseId, data)` (`services/applications.ts:33`).
- Produces: `IntakeFormScreen` reads `getApplication(houseId, applicationId)` (add it to `services/applications.ts` if it's missing) and pre-fills name, contact and the fields the form shares.

- [ ] **Step 1: Write the flow.**
  - **The prospective resident:** a cold launch (signed out), house search → test house → APPLY, fill the 3 steps, submit, and assert `ApplicationStatus` shows "pending".
  - **The operator** (sign in as `test-manager@…`): Applications → the new application → Approve, and assert Intake opens pre-filled with the applicant's name.

  Run it. Expected: FAIL (APPLY goes to Signup).
- [ ] **Step 2: Write the failing unit tests:**
  - APPLY navigates to `Routes.Apply` with `{houseId, houseName}`;
  - the Apply submit navigates to `ApplicationStatus`;
  - Intake pre-fills from the application;
  - an anonymous submit is accepted by the rules (the existing `applications` rules test gains an anonymous-auth case);
  - under D1 (b), submit refuses an anonymous user, and APPLY routes to Signup first.
- [ ] **Step 3: Implement** per D1.
- [ ] **Step 4: Run** the tests, the rules suite and the flow, on both platforms (PASS).
- [ ] **Step 5: Docs and commit.** Update `regroup/docs/product/requirements.md` (the application path).
  `feat(regroup-mobile): prospective residents apply in the app, and approval opens a pre-filled intake`

### Task 17: Guest CSV import works and has an entry point

**Files:**
- Modify:
  - `src/screens/GuestImport/GuestImportScreen.tsx:26,52-56,61` (use `currentHouse`; show the parser's missing-column message; add a header with back; invalidate the guest queries)
  - `src/services/guestImport.ts` (quoted CSV fields, RFC 4180 subset)
  - `src/screens/HouseSettings/HouseSettings.tsx:211-217` (item `guestImport`, "Import residents from CSV", next to `guests`)
- Test: `__tests__/GuestImportScreen.test.tsx` (mock `{ currentHouse }`, not `{ house }`), `services/__tests__/guestImport.test.ts`, `regroup/mobile/maestro/flows/operator-guest-import.yaml`

- [ ] **Step 1: Write the flow** (OPS import row, guard `data`). As `test-manager@…`: House Settings → Import, pick `maestro/fixtures/guests.csv` (add it: 2 fictional rows, one name containing a comma in quotes), and assert the preview shows 2 rows. Import, then assert both names in the guest list, and check one `guests` doc with `assert-firestore.js`. Run it. Expected: FAIL (no entry point; the import returns early).
- [ ] **Step 2: Write the failing unit tests.**
  - With `currentHouse` set, the import calls `importGuestsFromRows(currentHouse.id, rows)`.
  - A missing column shows "Missing column: <name>".
  - `"Smith, Jr."` parses as one field.
  - After import, `guestKeys` is invalidated.
- [ ] **Step 3: Implement.** The picker is the system file picker, and the flow uses Maestro's file-pick support or the `EMU-002` approach (see `device-document-upload.yaml`).
- [ ] **Step 4: Run** the tests and the flow on both platforms (PASS).
- [ ] **Step 5: Commit.** `fix(regroup-mobile): CSV import uses the selected house, and House Settings opens it`

### Task 18: Balance dashboard has an entry point

**Files:**
- Modify: `src/screens/HouseSettings/PaymentDashboard.tsx:403-414` (make the Outstanding stat a button, `outstanding-stat` → `Routes.BalanceDashboard`), `src/screens/HouseSettings/HouseSettings.tsx:226-232` (item `balances`)
- Test: the `PaymentDashboard` test, `regroup/mobile/maestro/flows/operator-balances.yaml`

- [ ] **Step 1: Write the flow** (OPS balances row, guard `money`). As `test-manager@…`: Payment Dashboard, tap Outstanding, and assert that the `BalanceDashboard` total equals the seeded residents' `rentOwed + choreFees`. Compute the expected value in the seed and pass it as an env var. Run it. Expected: FAIL.
- [ ] **Step 2: Write the failing test:** tapping `outstanding-stat` navigates to `Routes.BalanceDashboard`.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** the test and the flow, both platforms (PASS).
- [ ] **Step 5: Commit.** `feat(regroup-mobile): open the balance dashboard from Payments and House Settings`

### Task 19: Add Home shows for operators only, and admin state is right everywhere

**Files:**
- Modify: `src/screens/Personal/Personal.tsx:334-348`
- Test: `src/screens/Personal/__tests__/Personal.test.tsx:559-572` (edit in place), the existing `DataContext.adminHouses.test.tsx`

**Interfaces:**
- Produces: `canAddHouse(user, admin): boolean` (in `src/util/roles.ts`) returns true when the user owns a house (`admin.superAdmin.length > 0`) or is an operator without one yet (`user.potentialSuperAdmin === true`). It is false for a manager or peer leader.

- [ ] **Step 1: Write the failing tests:**
  - a manager with `superAdmin: []` → Add Home hidden;
  - an owner of one house → shown;
  - a new operator (`potentialSuperAdmin`, no houses) → shown;
  - the admin record not loaded yet → hidden, then shown once it loads.

  Update today's "shown when `superAdmin: []`" case (`Personal.test.tsx:559-572`) to the manager expectation, which is an intended behaviour change; note it in the PR.
- [ ] **Step 2: Run them.** Expected: FAIL.
- [ ] **Step 3: Implement.** Audit the other `userAsAdmin` readers for the not-yet-loaded window: `withHouseSetupWizard`, `useHouseSetupWizard`, Disputes, ActivityScreen, HouseChat, DirectChat/BaseChat, EditUserInfoForm and title-bar-right-button. Where a null admin changes behaviour (not only display), add a loading guard and a test. Record the audit table in the PR body.
- [ ] **Step 4: Run** Jest and the existing `operator-setup-wizard` flow (PASS).
- [ ] **Step 5: Commit.** `fix(regroup-mobile): Add Home is for operators, and screens wait for the admin record`

### Task 20: Operator-only screens check the role themselves

**Files:**
- Create: `src/components/require-house-role/RequireHouseRole.tsx` and its test
- Modify:
  - `src/screens/HouseOverview/HouseSummary/HouseSummary.tsx:283-306`: Drug Testing, Resident Intake and Applications only for `isAdmin`
  - Wrap each of these in `RequireHouseRole`: DrugTestingScreen, DrugTestForm, IntakeFormScreen, ApplicationList, ApplicationDetail, GuestImport, BalanceDashboard, PaymentDashboard, HouseSettings, StripeSettingsScreen, AdminReportScreen, StaffNotesFeed
  - DrugTestHistory: check first whether residents open their own history (grep `Routes.DrugTestHistory` callers). If they do, guard it as "self or admin".
- Test: `HouseSummary.test.tsx` (new visibility cases), and one guard test per screen, as a table-driven test in `require-house-role/__tests__/screens.test.tsx`

**Interfaces:**
- Produces: `<RequireHouseRole houseId={string} minRank={'admin' | 'manager'}>`. It renders children, or a "You don't have access to this" screen (`no-access-screen`) with a back button. `'manager'` excludes peer leaders, for the money screens (BalanceDashboard, PaymentDashboard, StripeSettings, AdminReport), per the rent spec §4.7 and the portal spec §5. Peer-leader detection reuses whatever `regroup/portal` uses to hide money from peer leaders (it shipped in #210). Find it and import it, and don't re-derive it.

- [ ] **Step 1: Write the failing tests.**
  - HouseSummary as a resident: no `drug-testing-section`, `intake-section` or `applications-section` (the test IDs are in the file).
  - As an admin: all three present.
  - For each screen, rendered with a resident token: `no-access-screen`.
  - The money screens with a peer-leader role: `no-access-screen`.
  - A resident following a link: `linking` doesn't expose them (Task 2), so screens are reached only by navigation, and the guard is the second line.
- [ ] **Step 2: Run them.** Expected: FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** Jest, the portal checks (the portal renders several of these screens, so its vitest suite must stay green), and the RES visibility row flow (add `resident-no-operator-links.yaml`: as `test-guest-a`, House tab, assert the three sections are absent).
- [ ] **Step 5: Commit.** `fix(regroup-mobile): operator-only screens check the role, not just the rules`

### Task 21: Close #196 with evidence

- [ ] **Step 1: Verify.** On `main`, `staffNotes`, `choreRotations` and `paywall` have rules. `organizations` and `userDeviceTokens` are reached only by code with no caller (`state/slices/setupSlice.ts:76-81`, never dispatched; `services/notifications.tsx:84-98`, never called), and the server reads neither. `admin-archive` is no longer written by mobile.
- [ ] **Step 2: Comment on #196** with those facts and paths, and close it as resolved (dead client code, a spec §2 non-goal). Ask the owner before closing if he wants the dead code removed instead. That would delete tests and needs the `test-change-approved` label.

---

## Part F: Rent charges, the phone side (rent-charges spec)

### Task 22: Rent section in House Settings and the setup wizard, with a turn-on preview

**Files:**
- Create:
  - `src/screens/HouseSettings/RentSettingsScreen.tsx` and test
  - `regroup/functions/src/callable/previewRentCharges.ts`, `functions/src/__tests__/callable/previewRentCharges.test.ts`
  - `regroup/mobile/maestro/flows/operator-rent-setup.yaml`
- Modify:
  - `src/screens/HouseSettings/HouseSettings.tsx` (item `rent` → `Routes.RentSettings`)
  - `src/navigation/types.ts`, `navigators.tsx`
  - `src/screens/SetupWizards/HouseSetup.tsx:243-253` (restore the frequency picker as a three-way choice)
  - `regroup/docs/product/requirements.md`, and the "no accrual job" comments in both `util/money.ts` files (rent spec §8)

**Interfaces:**
- Consumes: the house fields `rentFrequency: 'weekly' | 'monthly' | 'both'` ('both' = charging off), `weeklyRent` / `monthlyRent` in **dollars** (the rules: `firestore.rules:552-566`, ≤ 2500 / ≤ 10000), and the server charge rule in `functions/src/rent/chargeRule.ts`.
- Produces: `previewRentCharges({ houseId, frequency, price }) → { residents: { guestId, label, amountCents, daysCovered, daysInPeriod, firstDay }[] }`. It is manager-and-above only (the same check `createHouses`-era callables use for house rank ≥ 2), computes with the same `chargeRule` and `period` functions as the job, writes nothing, and logs no names.

- [ ] **Step 1: Write the flow** (rent spec §8, required). As `test-manager@…`: House Settings → Rent, choose Weekly and $175. The preview lists the current residents with **$0 now, first charge next Monday** (existing residents start next period, rent spec §2). Confirm, then add a resident through Intake with today's move-in date. Their balance shows the prorated amount: the expected cents for the run date come from the same formula, computed in the flow's script step. Pay it with the test card (`subflows/payment-sheet-card.yaml`) and assert the balance is $0. Run it. Expected: FAIL.
- [ ] **Step 2: Write the failing tests.**
  - `previewRentCharges`:
    - $175 weekly for a Wednesday join → 12500 cents, 5 of 7;
    - existing residents → 0 now, with `firstDay` the next Monday;
    - a peer leader → `permission-denied`;
    - the house's timezone is used (a fixture in `America/Los_Angeles`).
  - `RentSettingsScreen`:
    - saving "175" writes `weeklyRent: 175` (dollars) and `rentFrequency: 'weekly'`;
    - "Off" writes `'both'`;
    - an Oxford house can't choose weekly or monthly (rules `:562`);
    - a peer leader sees the screen read-only.
  - `HouseSetup`: the picker offers Weekly, Monthly and Off.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** the functions and mobile tests, then the flow on both platforms (PASS). Add the Maestro row (RENT/CHARGE, guard `money`).
- [ ] **Step 5: Commit.** Two commits: `feat(regroup-functions): preview what turning on rent charges would charge` and `feat(regroup-mobile): set a house's rent schedule and price`.

### Task 23: A resident's custom rate

**Files:**
- Create: `src/components/custom-rent/CustomRentField.tsx` and test
- Modify: the resident profile screen staff use (`src/screens/Profile/GuestHome.tsx`, the admin section near `:557`), and `RentSettingsScreen` (after a schedule switch, list the residents whose custom rate no longer applies)
- Test: `firebase/__tests__/` (the existing `customRent` rules cases, `firestore.rules:284-297`), and the component test

**Interfaces:**
- Consumes: `guests.customRent: { amountCents: number; frequency: 'weekly' | 'monthly' } | null`, valid per the rules (≤ 250000 weekly, ≤ 1000000 monthly), and read by `functions/src/rent/rate.ts:51`.

- [ ] **Step 1: Write the failing tests.**
  - Entering $600 under a monthly house writes `{ amountCents: 60000, frequency: 'monthly' }`.
  - Clearing writes `null`.
  - $0 is allowed (a scholarship bed).
  - Under a weekly house, an existing monthly custom rate shows "Not used while rent is weekly" (Review Focus 5).
  - The field is hidden for a peer leader and on the user's own record.
  - A rules test: a peer leader writing another resident's `customRent` is refused. If it's missing, add it next to the existing cases.
- [ ] **Step 2: Run them.** Expected: FAIL.
- [ ] **Step 3: Implement.** Convert with `dollarsToCents` from `util/money.ts`.
- [ ] **Step 4: Run** Jest and the rules suite (PASS). Extend `operator-rent-setup.yaml` with one custom-rate step, so the next charge for that resident uses it, asserted through `assert-firestore.js` on the `rentCharges` doc's `rateSource: 'custom'` (use the field name in `functions/src/rent/types.ts`).
- [ ] **Step 5: Commit.** `feat(regroup-mobile): managers set a resident's own rent rate`

### Task 24: Charges appear in the resident's history

**Files:**
- Modify: `src/screens/Payments/PaymentHistory.tsx:46-101` (merge charges and payments by date), and create `src/services/rentCharges.ts` (`listGuestCharges(guestId): Promise<RentCharge[]>`)
- Test: `src/services/__tests__/rentCharges.oplog.test.ts`, the `PaymentHistory` test, and the rules (`firestore.rules:670-690`: confirm that a resident reads their own `rentCharges` and an admin their house's; add tests if missing)

**Interfaces:**
- Produces: `RentCharge { id, guestId, houseId, amountCents, daysCovered, daysInPeriod, firstDay, rateSource }`, mapped from the server shape in `functions/src/rent/types.ts`.

- [ ] **Step 1: Write the failing tests.**
  - The history shows "Rent, Nov 16–22: $175.00" as a charge row between two payments, ordered by date.
  - A prorated row shows "5 of 7 days".
  - The CSV export includes charges as negative-direction rows (or a type column; match the existing export's format).
  - A resident can't list another resident's charges (rules).
- [ ] **Step 2: Run them.** Expected: FAIL.
- [ ] **Step 3: Implement.** Add an index if the query needs one.
- [ ] **Step 4: Run** Jest, the rules suite and `guest-rent-history.yaml` (extend it to assert one charge row). Expected: PASS.
- [ ] **Step 5: Commit.** `feat(regroup-mobile): residents see why their balance went up`

### Task 25: The balance edit that staff can reach warns when the balance moved

**Files:**
- Modify: determine first which reachable screen edits `rentOwed`. `GuestUpdate` has no navigate call (dead code per the launch spec §4.2), and `EditUserInfoForm` avoids sending money fields. If no reachable screen edits the balance, add a "Balance" edit to the staff section of the resident profile, reusing `GuestUpdateForm`'s money fields and its existing "The balance changed" confirm (`GuestUpdateForm.tsx:90`) rather than copying them.
- Test: the reused form's tests, plus the new entry point's test

- [ ] **Step 1: Write the failing tests:**
  - a manager opens the balance edit, and a charge lands (the test updates the guest doc); saving shows "The balance changed", and confirming saves the new figure;
  - a peer leader can't open it;
  - nobody can edit their own balance.
- [ ] **Step 2: Run them.** Expected: FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** Jest and `operator-manual-payment.yaml` (it must still pass). Expected: PASS.
- [ ] **Step 5: Commit.** `fix(regroup-mobile): staff can correct a balance, with a warning when it moved`

---

## Part G: Close-out

### Task 26: Matrix, roadmap and docs sweep

- [ ] **Step 1:** Re-run every LINK baseline row from Task 1 on both platforms, and record the results. Expected: every row that passed before still passes (spec §4.2, P5 exit condition).
- [ ] **Step 2:** Run `node regroup/mobile/scripts/coverage-matrix-check.js --kinds maestro --id-prefix LINK` and the same for `GATE`, `BILL`, `OXF`, `OPS` and `RES` (non-release mode). Expected: exit 0, and the P5 rows `pass`.
- [ ] **Step 3:** Update the roadmap P5 row status, spec §3.3's items (each fixed, with its PR), and `regroup/docs/README.md` if a doc was added (fix its broken links then, spec §6).
- [ ] **Step 4:** Commit: `docs(regroup): P5 done: features, links, rent setup`

## Order and parallelism

- **Part A first.** Task 1 must be recorded before Tasks 2–4 change link code.
- **Then:** Tasks 2 → 3 → 4, and Task 5 → 6 → 7 → 8 (Task 5 needs the owner's IDs for production; staging can go first).
- Part C needs Tasks 3, 5 and 6.
- Parts D, E and F are independent of the link work and of each other, so they can run in parallel lanes. Keep at most 2–3 open PRs at once.
- One PR per task, or per two small adjacent tasks (15 + 18, for example). Money-path PRs (9–12, 14, 22–25) get the independent domain-model review before merge.
