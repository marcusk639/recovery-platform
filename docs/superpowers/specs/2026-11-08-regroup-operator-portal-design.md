# Regroup Operator Portal: Design

- **Status:** draft for owner approval, 2026-11-08
- **Branch and worktree:** `feat/regroup-operator-portal` at `~/dev/rp-regroup-portal`, off `origin/main`
- **Facts checked against:** `origin/main` at `9f56d38c`
- **Decision labels:** "Owner" means the owner decided or confirmed it in conversation. "Builder's call" means the author of this document chose it and the owner may overrule it.

## 1. Intent

House operators and admins run a business from a phone today. A web portal gives them a second way to do the same work at a desk, where it is easier to compare houses, read long records and clear a backlog.

The phone app stays the main product. The portal adds to it and replaces nothing.

The roadmap already lists a web admin portal as an area where Regroup is behind competitors (`regroup/docs/go-to-market/roadmap.md`, "Feature parity"). Today `regroup/web` holds only marketing pages, account pages and billing.

**Success (Builder's call; the owner did not name a measure):** an operator with several houses can do a normal week's desk work across all of them without picking up the phone, and nothing the portal writes looks any different to the phone app.

## 2. Goals, non-goals, anti-goals

### Goals (Owner)

1. Operators and admins sign in and land on all of their houses at a glance.
2. They can drill down from all houses to one house to one resident.
3. They can see each resident's statuses, information and payments.
4. They can work with applications, payments, disputes, activities and the other primary features from section 5.
5. Operators can act from the portal, not only view.
6. It ships soon after the phone app launches.

### Non-goals for the first release

- Replacing the phone app, or changing what it does.
- Residents using the portal. They keep the phone app (Owner confirmed the audience; excluding them follows from it).
- GPS meeting logging and other resident-only tools (Owner).
- Chat and Oxford governance (Owner).
- Migrating or modernizing the Angular app. `regroup/web` stays as the marketing and billing site (Owner). Its Angular 9 upgrade remains a separate roadmap item, RG-RM-19.

### Anti-goals (these count as failure even if the portal works)

- **Delaying or destabilizing the phone launch.** The portal must never take priority over launch work, block a mobile PR, or push anything into production during the launch deploy freeze.
- **Weakening the data rules.** No security rule gets loosened to make the portal easier to build.
- **Writes the phone app can't trust.** A portal write must match the phone app's write exactly. Disputes are the strictest case.
- **Silent failure.** A button that does nothing, or an error nobody sees, is failure. A native feature must never be quietly stubbed in a shipped build.
- **Wrong money shown or recorded.** On a money path, a loud failure beats a wrong number.
- **Resident data exposed.** No names, contact details, health or recovery information in logs, URLs, analytics or error reports, and none left on an unattended screen.

## 3. Timing and how it is built

| Decision                                                                                                                   | Source                             |
| -------------------------------------------------------------------------------------------------------------------------- | ---------------------------------- |
| Work starts now, alongside the launch work                                                                                 | Owner                              |
| Separate branch and worktree from the mobile work                                                                          | Owner                              |
| Ships after operators are on the phone app, and not long after                                                             | Owner                              |
| The portal is not required for the phone launch                                                                            | Owner                              |
| Reuse the phone's screens and data code in the browser through react-native-web, and build only desktop-specific parts new | Owner, after the test in section 4 |
| React and TypeScript, client-rendered, login-only, no server rendering                                                     | Builder's call                     |
| New package at `regroup/portal`, importing `regroup/mobile/src` read-only through a web adapter layer                      | Builder's call                     |
| Its own Firebase Hosting site in `phoenix-cleanhouse` and in staging (`regroup-e2e`)                                       | Builder's call                     |
| The first production deploy happens after launch day (P10 of the launch roadmap)                                           | Builder's call                     |
| If it is running late, ship the core areas first and add the rest later (section 5)                                        | Owner                              |
| HIPAA decision D-12 stands, and the portal follows it (section 6)                                                          | Owner                              |
| Bundler, styling approach for new pages, and test tools                                                                    | Left to builder                    |

Client rendering is chosen so private data is never rendered on a web server, and because nothing behind a login needs search-engine visibility.

## 4. What the test showed

On 2026-11-08 a throwaway test ran three phone screens in desktop Chrome, using `main` (React Native 0.72, React 18.2), react-native-web 0.21.4, the Firebase JavaScript compat SDK and an esbuild bundle. It used a local emulator with the real `firestore.rules` and fictional data. The test code is not part of this work and should not be relied on.

**Passed:**

- The real `login` thunk signed in, and `GuestList` loaded through the real rules.
- `Disputes` approved a dispute. The rules accepted the write, with the fields `regroup/CLAUDE.md` requires, and "Successfully disputed" and UNDO DECISION then appeared.
- `PaymentDashboard` recorded a $500 manual payment: 50,000 cents written, `rentOwed` reduced by 50,000 in one batch, and the overdue balance refreshed. `victory-native` was replaced by `victory`, which rendered. The Collected figure and chart in that test are not evidence, because the faked `listHousePayments` read Firestore, while the real callable returns only Stripe charges.

**Needed to make it run:**

| Item                                                                | Purpose                                                                                                                                               |
| ------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- |
| Replacement `firebase-setup` and `@react-native-firebase/*` modules | Same names and call shapes, backed by the web SDK                                                                                                     |
| `react-native` alias to a thin wrapper over `react-native-web`      | Adds exports that `react-native-gesture-handler` 2.9.0 expects and react-native-web lacks, such as `DrawerLayoutAndroid`                              |
| `Alert` replacement                                                 | Needed by Approve and Reject (section 7)                                                                                                              |
| `@sentry/react-native` replacement                                  | `logException` crashed without it                                                                                                                     |
| `react-native-keyboard-aware-scroll-view` replacement               | Plain `ScrollView`                                                                                                                                    |
| Two one-line changes to the copied mobile code                      | `util/user.ts` reads the private `_user` field, and `components/rats-search-bar/index.tsx` assigns `navigator.geolocation`, which throws in a browser |
| The phone's providers, including `Auth` from `components/auth/auth` | Without `Auth`, screens treat the user as a non-admin and hide the action buttons                                                                     |

**Stubbed, so not proven:** geolocation service, Google Places autocomplete, `react-native-iphone-x-helper`, `react-native-picker-select`, `react-native-reanimated`, and three `react-native-vector-icons` sets. Icons were blank in the test.

**Not tested:**

- The React Native 0.88 upgrade (#160, React 19.3), which merges before this work matters.
- Importing `regroup/mobile/src` in place. The test used a copy.
- Any other screen, including those with date, file or image pickers.
- Server calls. There was no functions emulator, and `listHousePayments` was faked with a direct read.
- Production builds. Vite's production build failed on older packages that ship JSX in `.js` files, and Vite's dev server re-optimized in a loop. esbuild handled it, unminified, at 6.2 MB.

**To check:** the dashboard showed $0 outstanding with two residents overdue, and the real `listHousePayments` doesn't return manual payments. So a recorded cash payment may never appear in the phone's Collected figure, history or chart. If so, this is existing phone behavior and may be a launch issue. Find out, because operators will read that card.

## 5. What operators see

The owner picked this layout from mockups: option A, "All houses at a glance". The layout files are in `.superpowers/brainstorm/` in the main checkout (`portal-home.html`, `portal-drilldown.html`). They are not committed and show structure, not visual design.

**All houses (home), new work.** Left navigation plus a table with one row per house: beds filled, health, rent overdue, applications waiting and open disputes. Totals across all houses sit above it.

**One house.** A breadcrumb back to all houses, the house's summary numbers, and tabs for its work. The tabs hold the house's sections, and the left navigation keeps only Houses and Sign out (Owner chose tabs, 2026-11-09). Opening a house dispatches `selectHouseById`, the same selection the phone uses, so reused screens work unchanged.

**One resident.** A header with status, phase, room and move-in date, the actions from the table below, then this week's activities, payments, recovery and legal information, and open items. This page combines several phone screens, so expect new layout around reused parts.

### Reuse or rebuild (Builder's call)

Reuse a phone screen by default. Rebuild its layout only when the phone layout gets in the way at a desk: long lists that need columns, sorting or filtering, or forms stretched past a readable width. Keep its data hooks and service calls either way, so writes stay identical. Shipping a reused screen in a constrained-width container is acceptable for a first release.

### Scope of the first release

"Primary features" was left open by the owner. The table below is the Builder's call on what that covers. Mobile paths are under `regroup/mobile/src/screens/`.

**Release stages (Owner).** If the work is running late, the core ships first: all houses, residents, applications, payments, disputes and activities. Beds, drug tests, documents, issues, complaints and reports can follow. Any area not yet shipped must be absent from navigation, and a reused screen linking to one must say so visibly. Build this ability in from the start.

| Area                  | Portal does                                                                                           | Start reading at                                                 |
| --------------------- | ----------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------- |
| Houses                | All-houses table, one-house summary, house health                                                     | `HousesOverview`, `HouseOverview`                                |
| Residents             | List, full record, edit, staff notes, discharge                                                       | `GuestList`, `Profile`, `StaffNotes`                             |
| Beds                  | View and assign                                                                                       | `Beds`                                                           |
| Applications          | List, read, move through pending, reviewing, approved, rejected, then intake on approval              | `Applications`, `ResidentIntake`                                 |
| Payments              | House and resident history, balances and aging, record a manual payment                               | `HouseSettings/PaymentDashboard`, `BalanceDashboard`, `Payments` |
| Disputes              | List, approve, reject, undo a decision                                                                | `Disputes`, `hooks/useBaseActivityScreen.ts`                     |
| Activities            | View all five types, verify, and whatever else the phone offers staff. No staff logging or correcting | `Activity`, `StatUpdates`, `components/StatSummaryScreen.tsx`    |
| Drug tests            | History and add a result                                                                              | `DrugTesting`                                                    |
| Issues and complaints | View and handle                                                                                       | `Issues`, `Complaints`                                           |
| Documents             | List, open, upload, delete                                                                            | `Documents`                                                      |
| Reports               | Admin report and resident compliance export                                                           | `AdminReport`, `Profile/GuestHome`                               |

**Stays on the phone for the first release (Builder's call):** first-time setup wizards, Stripe Connect onboarding and settings, invitations, house configuration, and in-app rent payment by residents. Subscription purchase and billing management stay on the existing web site, and the portal links to them.

**Intake (Builder's call).** On the phone, approving an application leads straight into `ResidentIntake` (`screens/Applications/ApplicationDetailScreen.tsx`), and nothing tracks an approved applicant who was never admitted. So intake is in the first release, with the same flow. The screen has no native libraries.

**Activities (Builder's call).** On the phone, logging is a resident action and staff verify (`components/StatSummaryScreen.tsx`, `hooks/useBaseActivityScreen.ts`). `useUpdateActivity` has no caller outside `state/queries`. Adding staff logging or correcting would create writes the phone doesn't have, and a meeting logged from a desk would skip the location check and could reach the court export.

**Oxford houses (Builder's call).** They are included, minus governance. Their governance links in `HouseSummary` (Oxford hub, officers, expense share, business meetings, voting) show a visible "use the phone" message. The rent screens checked have no Oxford-specific handling, so the portal shows what the phone shows. Include an Oxford house in test data, and confirm the home table's money column is correct for one.

**Do not reuse these.** The launch design lists them as dead code: `CreateGuest`, `GuestUpdate`, `HouseConfig`, `HouseChoreOverview`, `HouseInfo`, `HouseActivity`, `ProfileUpdate`, `ChoreRotationSetupScreen`, `PaymentWebView` and `ManagerIntro`. See its section 4.2 for the full list.

### Who sees what (Owner confirmed)

Owners see all of their houses. Managers and peer leaders see only the houses they run. Within a house, managers see as much as owners, which is more than the phone shows them, and peer leaders are shown less: no house money totals, no balance column, no Payments or Reports, and no legal fields (Owner, 2026-11-09). The portal hides what a role can't do, but the security rules and callables are what enforce it.

## 6. Constraints

### From the launch work

Read `docs/superpowers/specs/2026-11-06-regroup-launch-reboot-design.md` and `docs/superpowers/plans/2026-11-06-regroup-launch-roadmap.md`.

- **Deploy freeze.** Regroup functions, hosting, Firestore rules and indexes reach production only in launch phase P8, and the freeze starts when the first P4 billing fix lands on `main`. Until launch finishes, the portal runs only on emulators and `regroup-e2e`.
- **Backend changes.** Prefer none. A backend change the portal needs (such as a new index) goes in its own PR with tests, and reaches production only after the freeze. It must not be slipped into a launch deploy.
- **Launch scope.** The launch design's non-goals exclude new features. The portal is separate work on its own branch and must not be added to launch phases or the upgrade PR, #160.
- **No mobile edits during launch.** Until launch finishes, `regroup/mobile` stays unchanged by this work. Handle differences in the adapter layer. If something truly can't be, raise it with the owner rather than editing mobile. Small mobile cleanups, like the two lines in section 4, can follow launch.
- **Moving target.** Mobile file layout will move when #160 merges, and Firestore rules changed in 9 commits since 2026-10-01. Rebase on `origin/main` often, and treat `origin/main` as the source of truth rather than this document's paths.
- **Attention.** The owner is the one reviewer for both tracks. When they conflict, launch work wins.

### From the monorepo

- `regroup/CLAUDE.md`, `regroup/functions/CLAUDE.md` and `regroup/mobile/CLAUDE.md` are binding.
- New source files stay at 300 lines or fewer, and commit scopes name the product, such as `feat(regroup-portal):`.
- Never query another product's Firestore.
- Money paths get an independent reviewer who reasons from the domain model.
- The pre-push hook and CI know only about listed packages, so `regroup/portal` must be added or its tests will not run.
- Serena indexes the directory a session starts in. Start sessions in the worktree, or use Read and Grep on its paths.

### Privacy (Builder's call, within the owner's anti-goal)

- Sign out automatically after 15 minutes idle, and keep the session out of persistent browser storage. Check whether reused state is persisted to browser storage, and keep resident data out of it.
- Keep resident names and other personal details out of URLs (use ids), page titles, analytics and error reports. Reused code logs through `logException`, so the web replacement must not send personal data, and browser console output needs the same review.
- **HIPAA (Owner):** decision D-12 stands (`regroup/docs/go-to-market/project-management.md`, resolved 2026-06-13): accept the free Google Cloud BAA, and keep protected health information out of Stripe. The portal sends resident data to no new vendor, and error reports carry no personal data. Its release doesn't wait on any further HIPAA decision. `docs/launch-readiness/TODO.md` and the launch design still list this as open, and D-12 is what applies here. D-12 also notes 42 CFR Part 2, so the production privacy check (section 8) confirms the portal adds nothing that changes its position. Multi-factor sign-in and access audit logs are not in the first release.

## 7. Hard parts to plan around

**Adapter layer.** It lives in `regroup/portal` and maps the mobile imports to web versions. #160 adds `src/integration/rnfb-to-web.ts`, which already maps the phone's Firebase imports to the web SDK for integration tests and records differences the app depends on, such as `firestore/<code>` error codes. Port its logic. The build must keep an explicit list of allowed replacements and fail on any other native import, so nothing is silently stubbed. The test's catch-all stub is not acceptable in a shipped build. Mobile code calls some native libraries while loading (`util/geolocation.ts`), so those need an inert replacement with a written reason, or the app won't start.

**`Alert`.** react-native-web's `Alert.alert` is an empty function, and about 49 mobile source files call it, 17 in first-release screens. Approve and Reject confirm through it, so they do nothing without a replacement, and `PaymentDashboard` reports a failed payment through it. Build a real replacement first: a modal supporting titles, messages and multiple buttons with their callbacks. Test it on the failure paths.

**Native features with no direct web version.** Date and time pickers, `react-native-picker-select`, document and image pickers (`Documents`), Places autocomplete, icons (use a web icon font), and any `react-native-reanimated` use all need web replacements. File actions like CSV export and PDF need browser downloads. `Platform.OS` branches appear in 14 mobile files and need review, because `web` may fall into the wrong branch.

**Navigation.** Reused screens call `useNavigation`, and native-stack worked in the test. A reused screen may navigate to a route the portal doesn't include, so every route must either exist or fail visibly. Browser back and URLs need a decision, using ids only.

**Package resolution.** Importing `regroup/mobile/src` makes bundlers look in `regroup/mobile/node_modules`, which is not where the portal's web packages live. The bundler must resolve bare imports from `regroup/portal`, without touching the mobile install. CI and fresh clones must work without `pod install`.

**CI coupling.** A mobile change can break the portal. The portal's CI must run when `regroup/mobile/src` changes, so breakage shows up early. Until launch finishes that check must not block mobile PRs, per the anti-goals. Whether it blocks after launch is left to the builder.

**Disputes.** `regroup/CLAUDE.md`, "Activity disputes", is the specification. Clients write only the activity, and the server maintains everything else. Reuse the phone's hook and service, and never reconstruct the write. Prove the portal against the rules tests and the emulator, including refusals.

**Permissions and stale tokens.** Rules read Firebase Auth claims. A promoted account's token keeps its old claims for up to an hour, and the phone force-refreshes at sign-in and app start. A long-open browser tab is a new case: it must handle losing access. The role system is in `regroup/functions/CLAUDE.md`.

**Which houses an operator sees.** The phone loads them with `useHousesByAdmin(user.adminId)`. Confirm this returns the right houses for co-owners, managers and peer leaders before relying on it for the home screen.

**The all-houses table.** Rules are per house, and there is no existing all-houses summary. The first version loads per-house data in the browser. If that is too slow for a reasonable operator, a server summary is follow-up work subject to the freeze. Build it so a slow or failed house shows as such, never as zero.

**Money.** Stored amounts are integer cents, while `listPayments` and `listHousePayments` report dollars, and `services/payments.ts` converts at its boundary. Reuse that service rather than calling them directly. Payment reads and callables enforce authority separately from the role records (`regroup/functions/CLAUDE.md`, "Not moved to records"). Test against the real callables, since the test faked them.

**Subscription gate.** The phone blocks operators without an active subscription (`Subscription` screens). The portal must apply the same rule, or it becomes a way around the paywall. Reuse the phone's logic, and check what the server enforces versus what is client-only.

**PDF export.** The phone's export uses a native library and is unavailable on iOS (`src/services/reportExport.ts`). The compliance export is used for court purposes, so its content must match the phone's. The method on the web is left to the builder.

**No real usage yet.** The launch design records that nobody is using the current build. The portal starts before there is operator feedback, so expect to revise later slices after launch.

## 8. Build order (Builder's call)

Each slice runs end to end on staging before the next starts.

1. **Foundation, and the go/no-go check.** Create `regroup/portal` importing mobile code in place, with the explicit replacement list, against the 0.88 upgrade (#160, branch `chore/regroup-rn-upgrade` until it merges). The test already covered 0.72, and #160 moves the phone to the modular Firebase API, so the portal targets 0.88 only. Rerun the three tested screens plus one screen with a picker, using the real callables on the emulator. Prove a production build. If 0.88 or in-place imports break the approach, stop and bring it to the owner.
2. Sign-in, permissions, subscription gate, idle sign-out and the desktop shell. The `Alert` replacement moves into step 1, because the dispute check needs it.
3. All houses, then one house, then the resident list and record.
4. Resident actions, applications with intake, staff notes and activities.
5. Payments, with the independent money review.
6. Disputes, against the rules tests.
7. Beds, drug tests, documents, issues, complaints and reports. These can follow the first production release (section 5).
8. Desktop polish on the reused screens that need it most.
9. Production release after launch: Hosting site, domain, security review and privacy check. If slices 7 and 8 aren't finished and the work is running late, release after slice 6.

## 9. Left to the builder

Bundler, styling for new pages, visual design within the agreed layout, the domain name, the PDF method, browser URL scheme, and test tools. Tests must include an emulator-backed suite that proves portal writes pass the same rules as phone writes, and browser journeys for the money and dispute paths.
