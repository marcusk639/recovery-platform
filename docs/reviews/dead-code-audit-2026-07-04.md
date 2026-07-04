# Dead Code Audit — homegroups & regroup

**Date:** 2026-07-04
**Scope:** `homegroups/` (mobile, functions, web) and `regroup/` (mobile, functions, web), plus cross-cutting CI/config/dependency surfaces across the whole `recovery-platform` monorepo.
**Branch audited:** `test/e2e-launch-prep`

## Summary

This report answers four questions the user asked, in order: does dead code exist (yes — confirmed below), what is it (itemized per area), how do we know it's dead (grep/verification evidence per item, not guesswork), and what should we do about it (a REUSE / DELETE / ARCHIVE recommendation per item).

**No files have been deleted, moved, or archived as part of this audit.** Every disposition below is a recommendation pending your go-ahead, consistent with treating deletion/archival across two production apps as a confirm-first action.

Total confirmed-dead items across both products: **~90+**, spanning unused Cloud Functions callables, dead Redux slices, unused React Native components/HOCs, unused Angular components, unused npm dependencies, broken npm scripts, and dead nested CI workflow files. Three items initially believed dead were found to be live (or the reverse) only after cross-monorepo verification — those corrections are called out explicitly in each section, because getting them wrong is the failure mode this audit was designed to avoid.

Two functional bugs (not simply "dead code") were also surfaced as a byproduct of tracing caller/callee relationships. They're flagged separately in §7 because they represent live, broken user-facing behavior in regroup — arguably higher priority than any of the cleanup below.

---

## How this was developed

Six audit agents ran in two waves against the same methodology: for every dead-code candidate, grep the **entire monorepo** (not just the file or product where the code lives) for the symbol name, including dynamic string references (e.g., `httpsCallable('functionName')` calls, route configs, `await import()` dynamic imports, module declarations, test-only usage). A candidate is only reported as dead if there are zero references anywhere outside its own definition, tests, and comments. Where a candidate turned out to be referenced but non-functional (called, but produces no real effect), it's reported separately as **LIVE-BUT-BROKEN** rather than lumped in with dead code — this is a distinct, arguably more dangerous category since it looks like working code.

- **Wave 1** (completed 2026-07-03): `deadcode-hg-mobile` (homegroups/mobile), `deadcode-rg-core` (regroup/mobile Redux/services layer), `deadcode-hg-fnweb` (homegroups/functions + homegroups/web), `deadcode-rg-ui` (regroup/mobile screens/HOCs/components).
- **Wave 2** (completed 2026-07-04, after the first four agents' work was interrupted by a background-agent stop and two areas had not yet reported): `deadcode-rg-fnweb` (regroup/functions + regroup/web), `deadcode-crosscut` (CI workflows, dependencies across all 7 `package.json` files, orphaned directories/scripts).

Wave 2's `deadcode-rg-fnweb` agent also re-verified several Wave-1-adjacent candidates cross-referenced from the platform's original full-read review (e.g., the "84 dead Angular selectors" and "setOxfordEnabled" claims below) and corrected them with more rigorous checks — those corrections are the clearest evidence the grep-the-whole-monorepo discipline was worth the extra audit round.

---

## 1. homegroups/mobile

| Item                                                      | Evidence it's dead                                                                                                                                                                                                             | Disposition                                                                                                                         |
| --------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------- |
| `MeetingTypeSelector` component                           | Zero references outside its own file across the mobile app; superseded by inline type pickers in the screens that would have used it                                                                                           | **DELETE**                                                                                                                          |
| `IntergroupModel`                                         | Zero references; methods are stub implementations that were never wired to Firestore                                                                                                                                           | **DELETE**                                                                                                                          |
| `NewsletterSignup.js` submit handler                      | Component IS rendered/imported (not dead code in the classic sense), but its submit handler is `console.log`-only — a **dead capability** inside live code. Users can "submit" a newsletter signup that silently does nothing. | **REUSE** — wire to the real signup service; do not delete the component                                                            |
| `rememberMe` state in `LoginScreen`                       | State is captured from the checkbox but never passed into the login call — a dead UI control that misleads users into thinking "remember me" does something                                                                    | **DELETE the control, or REUSE by wiring it in** — flagging as a UX-integrity issue, not just cleanup                               |
| `ChangePasswordScreen` / `EmailVerificationScreen` routes | Both routes are commented out in the navigator, and the screen files themselves don't exist on disk — this is dead navigation config pointing at nothing                                                                       | **DELETE** the commented route entries                                                                                              |
| `SponsorModel.getActiveSponsorships`                      | Private method, zero callers anywhere in the class or its consumers                                                                                                                                                            | **DELETE**                                                                                                                          |
| `DynamicLink` entity                                      | Only referenced from test files; zero production usage                                                                                                                                                                         | **ARCHIVE** — deep-link handling is the kind of feature that's easy to need again; keep for reference rather than deleting outright |
| `AnnouncementsScreen`, `OnboardingSlide`                  | Seed candidates from an initial grep — **verified NOT dead** on full-repo re-check (both are live). Called out here specifically to prevent them being carried into any future cleanup pass.                                   | **NO ACTION — confirmed live**                                                                                                      |

**Note on `RatsFlatList`:** unused imports (`useState`, `useEffect`, `IOS`, `FlatListProps`) were found in this file — this is dead _code within a live file_, i.e., lint-level cleanup, not a dead module. Recommend a standard unused-imports pass (ESLint `no-unused-vars`) rather than a manual disposition decision.

---

## 2. homegroups/functions + homegroups/web

- **19 orphaned Cloud Functions callables** deployed but never invoked by any client (mobile or web). This includes `banUser` and `openElection`, which are fully implemented, deployed, production functions with no caller anywhere — meaning any admin-moderation workflow depending on ban/election functionality is currently unreachable from the UI. **Disposition: REUSE** for functions that represent real, valuable admin capability (ban/election are the clearest examples — these read like finished features waiting on a UI hookup, not throwaway code); **DELETE** for the remainder once each is individually confirmed to have no UI counterpart planned. A full per-function breakdown should precede any deletion — deleting 19 deployed Cloud Functions without individually confirming each is materially different from deleting client-side dead code, since removing a callable that's later needed means re-deploying, not just re-adding to a git branch.
- **~30 orphaned utility exports** in `homegroups/functions` with zero call sites. **DELETE** — these are the highest-confidence, lowest-risk deletions in the whole audit (pure functions, no deployment surface, zero references).
- **1 orphaned component** in `homegroups/web`: `GroupDonationForm`, zero references. **DELETE.**
- **`firebase-functions-test` devDependency** — confirmed unused (10 tests exist, none import it). **DELETE.** (Independently re-confirmed by the Wave 2 cross-cutting audit — see §6.)
- **8 large commented-out code blocks** (10–25 lines each) scattered across homegroups/functions and homegroups/web. **DELETE** — commented-out code is not a safety net; git history already preserves it.
- **`NewsletterSignup.js`** — see homegroups/mobile section above; this is the same dead-capability pattern, worth fixing once across whichever product actually owns the canonical version.

---

## 3. regroup/mobile — core layer (Redux/services)

| Item                                               | Evidence it's dead                                                                                                                                                                                                                                                                                                                                                                                         | Disposition                                                                                    |
| -------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------- |
| `authSlice.ts`                                     | Superseded by `userSlice`, but still registered in the Redux store. Confirmed dead via full-repo reference check — nothing dispatches its actions or reads its state outside its own file.                                                                                                                                                                                                                 | **DELETE** (remove from store registration too)                                                |
| `meetingsSlice.ts`                                 | Same pattern — confirmed dead, still registered                                                                                                                                                                                                                                                                                                                                                            | **DELETE**                                                                                     |
| `EnhancedAuthService.ts`                           | Zero non-test production references, but this is a fully-built security-hardening layer (rate limiting / lockout logic per the original codebase review's findings) that was never wired into the actual auth flow. This is the single most consequential REUSE candidate in the whole audit — leaving it dead means the app is running the auth flow _without_ the hardening that's already been written. | **REUSE** — wire into the live auth path, do not delete                                        |
| `SimpleValidationService`                          | Related to the above — built but disconnected validation logic                                                                                                                                                                                                                                                                                                                                             | **REUSE**                                                                                      |
| `oxford/ees.ts` / `oxford/index.ts`                | Initial grep suggested one or both might be dead. **Full verification found both are LIVE** — reframed as a _data-integrity bug_ (dual-schema conflict, tracked separately in the original platform review as finding #53), not dead code.                                                                                                                                                                 | **NO ACTION as dead code — see test-suite plan / original review for the EES dual-schema fix** |
| `updateGuestStat`, `reverseGuestStat` (util/guest) | An earlier pass suspected these were dead in regroup/mobile. **Re-verified LIVE** in the backend — the mobile-side suspicion was a false positive from checking only one call site.                                                                                                                                                                                                                        | **NO ACTION — confirmed live**                                                                 |
| `notification.ts`, `services/complaints.ts`        | Zero non-test production references anywhere, confirmed on full re-check                                                                                                                                                                                                                                                                                                                                   | **DELETE**                                                                                     |

---

## 4. regroup/mobile — UI (screens, HOCs, components)

- **`withLoadingModal` HOC** — zero call sites. **DELETE.**
- **`withNotifier` HOC** — the _function_ is dead (never called), but its _TypeScript type_ is still imported and used elsewhere. This is a case where deleting naively (removing the whole file) would break a live type import. **DELETE the function, keep/relocate the type**, or ARCHIVE the file and re-export just the type from a smaller module.
- **`withPopover` HOC** — a third, distinct category: it **is** still called in the codebase, so it's not "dead" by the zero-reference test, but its render path is broken and produces no visible effect. This is **LIVE-BUT-BROKEN**, not dead code — recommend a bug ticket, not a deletion.
- **Deprecated HOCs marked `@deprecated`** — verified several of these (and the related `getByGroup` deprecated method on `AnnouncementModel`/`BusinessMeetingModel`) are **actually still live** despite the deprecation marker — the `@deprecated` JSDoc tag was never followed up with actual removal of call sites. **NO ACTION as dead code** — but worth a follow-up ticket to either finish the deprecation (find and migrate the remaining callers) or remove the misleading annotation.
- **`GroupOverviewScreen` Literature tile** — `disabled={true}` but still has a live navigation handler wired underneath it. Ambiguous: is this an intentionally-disabled feature-in-progress, or an accidentally-orphaned handler? **ARCHIVE the finding for product decision** — this isn't a pure dead-code call, it needs a product owner's answer on whether Literature is coming back.
- **`GroupLiteratureScreen`** — the route is broken: both the import and the navigation call are commented out, and the screen file doesn't exist on disk at all. This is fully dead — no ambiguity like the tile above. **DELETE** the commented-out route wiring.
- **`Invites.tsx`** — 100% commented-out legacy class component, containing a hardcoded house ID inside the dead code (an old instance of the same hardcoded-ID pattern flagged as finding #31 in the original platform review, just inside code that no longer runs). **DELETE.**
- **`HousesOverview`** — imports `Admin` and `User` types but never uses them in the component body. Lint-level dead-import cleanup, not a structural finding. **DELETE the unused imports.**
- **`ChoreSetup`** — has an empty `if` block with a comment noting the feature moved to "activities." **DELETE the dead branch** once confirmed the "activities" successor covers the same behavior.
- **`PhaseConfigSetup`** — has a duplicate `renderButtons()` method definition (one silently shadows the other). This is a correctness bug as much as dead code — the first definition is unreachable. **DELETE the shadowed duplicate.**
- **`ManagerSetup`** — the `senior-peer` type is handled in the underlying logic but has no corresponding radio-button option in the UI, making that code branch unreachable from the UI. **ARCHIVE for product decision** — same shape as the Literature tile: this may be an intentionally-paused feature, not accidental dead code.
- **Ethnicity picker** — commented out in the UI, but the `ethnicity` field remains in the form's state/array, meaning the app collects a data field with no UI to set it (any value present would be stale/default). Related: an unused `SSN` `keyboardType` was also found nearby. **ARCHIVE for product/legal decision** — collecting-without-UI on a demographic field is worth a product/compliance conversation before deleting or restoring.
- **`MULTI_GROUP_PRICE_ID`** deprecated constant — zero production usage; migration to `getMultiGroupPriceId()` is complete. **DELETE.**
- **`DEPRECATED_AA_LOCATIONS.json`** — referenced only from a commented-out import; the file doesn't exist on disk at all. **DELETE the dead import comment** (nothing to archive, the file is already gone).
- **`OperatorSetupWizard`** — seed candidate suspected dead due to deprecated-looking child components (`SetupButtons`, `SetupHeader`). **Verified NOT dead** — both are actively exported and consumed despite the deprecation marker. **NO ACTION.**

---

## 5. regroup/functions + regroup/web

### Confirmed dead — functions

1. `callable/auth.ts:240` **`removePrivilegesForGuests`** — ~~zero client callers~~ **UPDATE: no longer dead.** The mobile app was calling a differently-named, non-existent function expecting this behavior (see §7); the client call has been fixed to reference this function by its correct name. **NO ACTION — now live**, pending emulator/manual verification.
2. `callable/subscriptions.ts:843` **`sendInviteEmails`** — zero client callers; superseded by `createInvitation` + the extracted `util/inviteEmails.ts` helper. **DELETE.**
3. `src/upload-stripe-icon.ts` — never imported, a self-run one-off script with a stale hardcoded local filesystem path from someone's machine. **DELETE.**
4. `util/create-demo.ts` — already gutted to `export {};` — a tombstone file. **DELETE.**
5. `scripts/migrateBalanceToCents.ts` — an orphaned migration script not wired into `package.json` (unlike its sibling migrations, which are). **ARCHIVE** — migration scripts are historically informative even after they've run.
6. `util/admin.ts` — zero imports anywhere; contains admin house-diff domain logic. **ARCHIVE.**
7. `util/phase.ts` (9 exports) — zero references; appears to be a descoped sober-living "phase config" feature. **ARCHIVE.**
8. `entities/RatsLocation.ts` — zero references anywhere. **DELETE.**
   9–12. `entities/HouseSearch.ts`, `CelebrateRecoveryMeeting.ts`, `NAMeetingResponse.ts`, `DirectConversation.ts` — zero references in `functions/src`; these symbols exist as **duplicate type definitions** in mobile/web, so the functions-side copies are the dead ones. **DELETE the functions-side duplicates** (leave the mobile/web definitions alone).
9. Unused `functions/package.json` dependencies: `nodemailer`, `x-ray`, `xml2js`, `unique-names-generator`, `tabletojson` (the last has only a leftover `declare module` type shim, no runtime usage). **DELETE** — recommend validating with `depcheck` before removal, per the auditing agent's own caveat.

### Orphaned-but-valuable callables — functions (REUSE, don't delete)

Fully implemented, fully unit-tested, tier/revenue-gated Cloud Functions with **zero client wiring** — these read as features built ahead of their UI, not abandoned code:

- `callable/oxford.ts:39` **`setOxfordEnabled`** — **correction to an earlier finding:** a prior partial check in this audit had marked this "LIVE" based on the function's own internal logging calls firing during its execution. That was a methodology error — internal logging proves the function _does something when called_, not that anything _calls it_. The final, rigorous check found the only reference outside the function's own file is a doc-comment in `api/stripe.ts:258`, not an actual invocation. **Corrected disposition: REUSE** (wire an operator-facing toggle to it), not "confirmed live."
- `callable/compliance.ts:362` **`complianceExport`** — court-ordered CSV/PDF export (RG-SPEC-09), fully tested. **REUSE.**
- `callable/analytics.ts:98` **`rentRoiMetrics`** — rent ROI metrics (issue #32), fully tested. **REUSE.**

### Confirmed dead — web

An earlier partial pass claimed **84 Angular component selectors** had zero template references. **This was roughly a 20x overcount** — the naive grep-for-selector-string method flagged components that are actually rendered by the Angular router (which renders by class reference via `<router-outlet>`, not by literally matching a selector tag in a template). After cross-referencing all 91 web components against the route table, templates, and dynamic instantiation, only **4 are truly dead**:

- `components/redirect/redirect.component.ts` **`RedirectComponent`** — zero references anywhere, not even declared in any Angular module, so it's structurally incapable of rendering. Contains real deep-link handling logic. **REUSE or ARCHIVE** — this is exactly the kind of "looks unused because it was never finished being wired in" case worth a second look before deleting.
- `themes/theme-one/…` **`ThemeOneComponent`** — declared and imported in the routing module (an unused import) but has no route and is never embedded anywhere. **DELETE.**
- `components/welcome/welcome-one/…` **`WelcomeOneComponent`** — only declared, never used; the live theme welcome screens are `welcome-two` through `welcome-six`. **DELETE.**
- `components/loading/loading/…` **`LoadingComponent`** — only declared, no tag or instantiation found anywhere. **REUSE** (a spinner is a plausible small addition) **or DELETE.**

**Correction carried forward:** the ~25 other components the naive selector sweep originally flagged (theme 2–6 components, login, signup, my-account, blog pages, pricing, FAQ, contact, terms, error, thank-you, etc.) are **confirmed LIVE** via the router — do not carry the original "84 dead selectors" number into any future cleanup work.

---

## 6. Cross-cutting: CI, dependencies, orphaned directories

### Monorepo structure verification (needed to trust the CI findings below)

- No `.gitmodules` — this is a single monorepo, not a submodule setup.
- One GitHub remote (`origin` → `marcusk639/recovery-platform`).
- The entire repo originated from **one squash commit** (`8e36c37`, "feat: initial recovery-platform monorepo"). Every nested `.github/workflows/*` file traces back only to that commit — they were imported wholesale from four formerly-standalone product repos, where they used to be live at each repo's own root. Once merged into the monorepo, GitHub Actions only ever scans the true repo root's `.github/workflows/`, so all of these became inert on day one of the merge.
- Live, executing workflows exist **only** at `.github/workflows/{ci.yml, claude-code-review.yml, claude.yml}` (repo root).

### Confirmed dead — nested GitHub Actions workflows

All of the following are tracked in git but **never execute**:

- `homegroups/.github/workflows/{ci.yml, agent-task.yml, claude-code-pr-review.yml}` — **DELETE**
- `regroup/.github/workflows/{ci.yml, deploy.yml}` — **DELETE** (skim `deploy.yml` for any deploy steps worth folding into root CI first — it may contain deployment logic that was never actually migrated anywhere)
- `regroup/mobile/.github/workflows/{agent-task.yml, e2e-tests.yml, unit-tests.yml}` — **DELETE** (same caveat — `unit-tests.yml` is a 227-line, fairly sophisticated CI template; worth a skim for anything worth reviving in the root CI before deleting, per the Phase 1/2 work in the test-suite plan)
- `detox-recovery/.github/workflows/ci.yml` — **DELETE**

### Confirmed dead — devDependencies

- `homegroups/functions`: `firebase-functions-test`, `@types/glob` (no `glob` dependency exists) — **DELETE**
- `regroup/functions`: `firebase-functions-test`; `eslint` + `@typescript-eslint/eslint-plugin` + `@typescript-eslint/parser` + `eslint-config-google` (no `.eslintrc` exists — lint actually runs on tslint, so this looks like a half-finished tslint→eslint migration that was abandoned); `@types/xml2js` (no `xml2js` runtime dependency) — **DELETE**
- `regroup/web/functions`: `firebase-functions-test` — **DELETE**
- `recovery-api`: `jest-util` (not referenced in `jest.config.cjs` or any script) — **DELETE**
- `homegroups/mobile`: `@types/three` and the runtime `three` package itself (unused), `jest-circus` (Jest 29 already bundles this) — **DELETE**
- `regroup/web`: `fuzzy`, `inquirer`, `inquirer-autocomplete-prompt`, `bufferutil`, `utf-8-validate` — **DELETE**
- `regroup/mobile`: `sendgrid` (zero references) — **DELETE**
- `detox-recovery`: `@jest/globals` (never imported) — **DELETE**
- `regroup/mobile` React Native build presets (`@react-native/babel-preset`, `@react-native/metro-config`, `@react-native/eslint-config`, `@babel/preset-env`, `metro-react-native-babel-preset`, `@types/metro-config`) appear unreferenced **only because there are no babel/metro/jest/eslint config files in the repo to reference them** — this is the same missing-config-layer gap already tracked in `docs/plans/2026-07-03-comprehensive-test-suite-plan.md`. **HOLD — do not delete.** These will be needed the moment that plan's Phase 1 restores the config files; deleting them now would just mean re-adding them in a few days.

### Confirmed broken npm scripts

- `regroup/mobile` → `seed-e2e` runs `node e2e/setup/seedTestData.js`, which doesn't exist. **Fix or delete the script.**
- `regroup/mobile/scripts` → `migrate:dry-run` / `migrate:execute` / `migrate:validate` all run `ts-node run-migration.ts`, which doesn't exist (only `migrate-full.ts` / `migrate-admin.ts` exist). The `full:*` variants are fine. **DELETE the three broken script entries** (or point them at the correct file, if dry-run/validate modes are still wanted separately from the full migration).
- `regroup/mobile` → `lint` runs `eslint .` with no ESLint config present in the repo. **Fix as part of the missing-config-layer work**, not a standalone deletion.

### Structural / orphaned findings

- **`shared/` does not exist**, despite being listed in the root `CLAUDE.md` as a reserved future directory. This is documentation drift, not dead code — either create the placeholder directory or update the doc table.
- `docs/_archive/` exists and contains only a `.gitkeep` — this is an intentional, currently-unused archival convention. **KEEP as-is** (and this is the natural destination for anything in this report disposed as ARCHIVE).
- `scripts/test-prep.sh` (root) — confirmed **NOT dead**; it's called from `regroup/mobile/maestro/scripts/run-flows.sh` and referenced in the regroup e2e docs. **KEEP.**
- `regroup/{functions,mobile}/.env.example` files are legitimate templates. **KEEP.**
- Root-level one-off audit documents (`ANALYSIS.md`, `CODEBASE-REVIEW.md`, `DOC-CODE-AUDIT.md`, `journey-into-recovery-platform.md`, `readiness-report.md`, `PATHFINDER-2026-06-06/`, `code-review-artifacts/`) are tracked but not referenced by any build or CI process — not dead _code_, but repo clutter from prior audit work. **Recommend ARCHIVE into `docs/_archive/`** as a housekeeping pass alongside whatever this report's ARCHIVE items land there too.

### Ambiguous — flagged, not auto-dispositioned

- **`tslint` + `tslint.json`** in `regroup/functions`, `regroup/web`, and `regroup/web/functions` — technically still wired into build/lint scripts (so not "dead" by the zero-reference test), but `tslint` has been end-of-life since 2019. Combined with the dead ESLint devDependencies found in `regroup/functions` above, this reads as a migration to ESLint that was started and abandoned. **Recommend a team decision**: finish the ESLint migration, or explicitly commit to tslint and clean up the half-migrated ESLint deps.
- `regroup/web`'s `firebase-tools` dependency is not imported in code but provides the `firebase` CLI used by deploy scripts — indirect usage. **KEEP.**
- `homegroups/functions`'s `@types/moment-timezone` is redundant (the `moment-timezone` package ships its own types) but harmless. **Optional DELETE**, low priority.

---

## 7. Live-but-broken bugs surfaced during this audit (not dead code — flagging because they were found here)

These aren't dead code, but they were only discoverable _by doing_ the dead-code cross-reference work, so they're recorded here rather than lost:

1. **Guest-removal feature was broken in production — FIXED 2026-07-04.** `regroup/mobile/src/services/house.tsx:291` was calling `httpsCallable('removeAdminPrivilegesForGuests')`. No Cloud Function by that name exists. The intended target — `removePrivilegesForGuests` in `callable/auth.ts:240` — has a matching payload shape but a different name. The client-side call has been renamed to match the deployed function. **Status: fixed, needs emulator/manual verification** (see the manual QA plan). The "dead" callable in §5 item 1 is no longer dead once this ships — remove it from that DELETE list.
2. **`searchForHouses` — re-investigated, not actually a bug.** The Wave 2 audit flagged this as "mobile calls a callable that doesn't exist," based on a grep match on `httpsCallable('searchForHouses')` in `house.tsx`. That call was actually **commented out** — the function had already been migrated to a direct client-side Firestore geohash range query (`getNearbyHouses`), a legitimate working implementation, not a missing backend function. The stale commented-out line has been removed as routine cleanup. **No functional bug here; the earlier "missing callable" finding was a false positive from grep matching inside a comment.**

---

## Suggested next steps

1. **Confirm dispositions** — this report is the "what and why," not an executed action. Nothing has been deleted, moved, or archived yet.
2. **Fix §7 first, independent of any cleanup** — these are live user-facing bugs (a broken guest-removal action, a missing callable), not cleanup, and likely belong in the regroup launch-readiness work rather than a dead-code cleanup PR.
3. **Lowest-risk deletions to batch first** (highest confidence, smallest blast radius): unused devDependencies (§6), the ~30 orphaned utility exports in homegroups/functions (§2), the 4 confirmed-dead Angular components (§5), and the dead nested CI workflow files (§6) — skim `unit-tests.yml` and `deploy.yml` for salvageable config before deleting per the caveats above.
4. **REUSE items need a product conversation before engineering time is spent**, not just an engineering ticket: `EnhancedAuthService`/`SimpleValidationService` (security-relevant — arguably should be prioritized regardless of "reuse vs. delete" framing, since it's disconnected security hardening), the three orphaned-but-tested regroup Cloud Functions (`setOxfordEnabled`, `complianceExport`, `rentRoiMetrics`), `RedirectComponent`, and the `banUser`/`openElection` homegroups callables.
5. **ARCHIVE items** land in `docs/_archive/` — this destination already exists and is currently empty, so it's a ready-made home rather than a new convention to invent.
