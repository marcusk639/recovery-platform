---
generated: 2026-09-27
targets: regroup/{mobile,web,functions}, homegroups/{mobile,web,functions}
bar: public app-store availability (iOS + Android installable)
sequence: regroup first, then homegroups
supersedes: plan-recovery-platform-2026-09-04.md (bar was "first paying customer")
method: 5 parallel evidence scans + live Firebase REST verification + direct pbxproj parse
---

# Launch Readiness Plan — Regroup, then Homegroups

**Bar change.** The 2026-09-04 plan measured "first paying customer." This one measures
**public store availability**. That reorders almost everything: signing keys, target SDK,
privacy manifests and review policy dominate, while Stripe key mode drops to a
revenue-quality concern except where it breaks a flow a reviewer will exercise.

## Verdict

Neither app can be submitted today. **The 2026-09-04 plan's ordering is wrong for this bar, and
so was this document's own first draft** — Regroup is not the "nearly there" app. It cannot even
be *uploaded*: its Firebase iOS SDK is pinned at 10.7.0, and Apple requires privacy manifests
that Firebase did not ship until 10.24.0, so App Store Connect rejects the binary (ITMS-91061)
before any reviewer sees it. Regroup also has no in-app account deletion at all, and ships a
privacy manifest declaring it collects nothing while actually storing drug-test results,
medications and sobriety dates. Regroup's genuine advantages are real but narrower than they
looked: it has shipped before (iOS build 40), and it has **no Apple Guideline 3.1.1 exposure**,
because its operator subscriptions are sold on the web rather than in the app, and its one in-app
payment — resident rent — falls under **3.1.3(e)**, which requires such real-world-service
payments to use non-IAP methods. Regroup's Stripe rent flow is therefore not merely tolerated but
the *required* approach.

**Homegroups is the healthier codebase and the harder product question.** Its native stack is
modern and internally consistent (Firebase 11.11.0, `@react-native-firebase` 21.13.0,
`react-native-screens` ~3.37.0, React Navigation v6 — the compatible pairing for RN 0.72). Its
blockers are a missing Android release keystore, a missing app-level privacy manifest, a likely
stale `targetSdkVersion`, and one unresolved product decision: it sells digital in-app
functionality through an embedded Stripe WebView, which is a 3.1.1 problem whose worst case is
adopting Apple IAP.

**Regroup-first still holds**, because Homegroups carries an unresolved product-architecture
question while Regroup's work is all known engineering. But Regroup is weeks out, not days, and
the two tracks are no longer close in scope.

The most consequential finding of this run was not a launch item at all: Regroup's Storage bucket
was world-readable and world-writable to the unauthenticated internet from 2020-08-08 until it
was closed during this session. See **Security remediation**.

## Use Homegroups' package.json as Regroup's upgrade target

Regroup must bump Firebase to clear ITMS-91061, and a major bump across eight
`@react-native-firebase` packages on a project whose build is unverified is the riskiest item in
this plan. Do not design that upgrade from scratch. Homegroups already runs a **proven, shipping
combination on the same React Native minor**:

| Package | Regroup (now) | Homegroups (proven target) |
|---|---|---|
| `@react-native-firebase/*` | ^17.3.1 | ^21.13.0 |
| Firebase iOS SDK (resolved) | 10.7.0 — **pre-manifest** | 11.11.0 |
| `react-native-screens` | 4.0.0 | ~3.37.0 |
| `@react-navigation/native` | ^7.0.15 | ^6.1.18 |
| `react-native` | ^0.72.0 | 0.72.9 |

### Migration surface — measured, not estimated

Scanned `regroup/mobile/src` (771 TS/TSX files) on 2026-09-27:

- **Zero v7-only APIs.** No `createStaticNavigation`, `StaticParamList`, or
  `NavigationIndependentTree`. The v7→v6 downgrade is a version change, not a code migration.
- **Zero direct `react-native-screens` imports.** That downgrade is purely transitive.
- **165 files import `@react-navigation`**, 65 of them using `useNavigation`. The API is
  compatible but the *type* surface is wide — expect type errors, not logic errors. This, not the
  API, is R2's real cost.
- **Only 12 files touch Firebase directly, all namespaced-style** (`firestore()`, `auth()`),
  zero modular-style. Namespaced is still supported in RNFB 21.x and was deprecated in v22, so
  targeting 21.13.0 avoids a rewrite. **Verify that deprecation boundary before committing** —
  it is a version-support claim, not something confirmed here.

This is why R1's effort reads as *days* rather than the *days–weeks* an earlier draft assumed:
the Firebase blast radius is 12 files, and the navigation change needs no rewrite.

Regroup is on `react-native-screens` 4.0.0 + Navigation v7, which is the combination Homegroups
retreated from. Aligning Regroup to Homegroups' versions resolves the privacy-manifest blocker
and the suspect navigation stack in one coordinated change, against a reference that is known to
build. Treat Navigation v7 → v6 as a deliberate, evidence-backed downgrade, not a regression.

---

## Security remediation (done and outstanding)

**DONE 2026-09-28.** `phoenix-cleanhouse` Storage live ruleset was `346c6c92-bfab-42b0-9955-ac08230ae3b0`,
released 2020-08-08, containing `allow read, write: if true` on `/{allPaths=**}` — no
authentication of any kind. The bucket holds resident avatars
(evidence: `regroup/mobile/src/services/storage.tsx:13-19`) and resident documents
(evidence: `regroup/mobile/src/services/documents.ts:50`). Because Regroup has shipped, this was
live user data. Replaced with an interim auth-only ruleset
`4b19f102-0389-4c4a-95aa-06c2e0244d1e`, released `2026-09-28T01:50:46Z`, verified via the
firebaserules REST API. Deployed from a scratch config; `regroup/mobile/firebase/storage.rules`
was not modified.

| # | Item | ENG/OPS | Evidence | Effort |
|---|---|---|---|---|
| S1 | **Fix the deploy path.** Until this is fixed, rules and indexes re-drift. Every deploy script in both products is `--only functions`; no CI runs `firebase deploy`. Regroup's rules and indexes live in `regroup/mobile/firebase/`, a directory with **no package manifest**, so no script can deploy them. `regroup/firebase.json` declares only a `functions.predeploy` hook. | ENG | `regroup/firebase.json`; `regroup/mobile/firebase/firebase.json`; deploy scripts in `homegroups/functions/package.json`, `regroup/functions/package.json` | hours |
| S2 | **Supersede the interim Regroup ruleset** with the real 139-line one (`isOwner`/`isHouseAdmin`/`isValidPdfWrite`) after exercising it against real avatar and document paths. The interim rule has **no per-house or per-owner scoping** — any authenticated Regroup user can still read any other resident's files. | OPS | `regroup/mobile/firebase/storage.rules` (139 lines, never deployed) | hours |
| S3 | **Homegroups Storage rules.** Live is `allow read, write: if signedIn()` on all paths (ruleset released 2025-04-07) — every authenticated user reads and writes every file, including full group backups (members, transactions, meetings). | OPS | live ruleset `15887f35-f527-487d-8375-cb4fb3c9c211`; writer at `homegroups/functions/src/triggers/pubsub/scheduledGroupBackups.ts:119-121`; committed fix `homegroups/storage.rules` (74 lines, undeployed) | minutes |
| S4 | **Homegroups Firestore rules — deploying FIXES a bug.** Live rules omit `resource.data.userId == request.auth.uid` on `match /members/{memberId}`; the committed version adds it with the author's note *"getUserGroups is denied without this."* So the live my-groups fetch is broken, and deploying the committed rules repairs it rather than risking it. | OPS | `homegroups/firestore.rules:243` | minutes |
| S5 | **Commit the 3 pending indexes before any index deploy**, or the deploy erases them. | ENG | uncommitted in `homegroups/firestore.indexes.json`, `regroup/mobile/firebase/firestore.indexes.json` | minutes |

Six Firestore indexes are declared but not live (`recovery-connect-cad4b` 54 live / 58 declared;
`phoenix-cleanhouse` 19 / 21). Three were committed in d22e6c4 on 2026-08-31 and never deployed:
`meetingInstances(isCancelled,scheduledAt)`, `servicePositions` COLLECTION_GROUP `(termEndDate)`,
`group_conscience_votes(groupId,openedAt DESC)`. Zero live-but-undeclared — drift is
one-directional, which is consistent with S1 being the sole cause.

### Rollback targets and acceptance criteria

Every rules deploy is reversible by re-releasing the prior ruleset ID. Record these before
deploying anything:

| Target | Prior ruleset (rollback to) | Acceptance criterion for the new deploy |
|---|---|---|
| Regroup Storage | `4b19f102-0389-4c4a-95aa-06c2e0244d1e` (the interim deployed this session) | A resident cannot read another resident's document path; their own avatar and documents still load in the app |
| Regroup Firestore | `c5182030-7f93-4e02-8b4b-fc09b01f52f7` | App loads houses, guests and documents unchanged |
| Homegroups Storage | `15887f35-f527-487d-8375-cb4fb3c9c211` | A signed-in user cannot read `group-backups/**`; avatars and group files still load |
| Homegroups Firestore | `51d74db0-dc19-4bd4-9417-e948ea4b9aeb` | `getUserGroups` returns the caller's groups — **run the repo's rules tests first** (see S4 caveat) |
| Indexes (both) | n/a — index creation is additive | The previously failing query succeeds against production |

**Never roll Regroup Storage back to `346c6c92-bfab-42b0-9955-ac08230ae3b0`** — that is the
world-readable, world-writable 2020 ruleset this session replaced.

**S2's gate, made concrete.** "Exercised against real paths" means: with the 139-line ruleset
active, a signed-in resident can read and write their own avatar and their own documents, an
admin can read their own house's documents, and a resident of house A receives `permission-denied`
for a house B document path. Until that is demonstrated, S2 is not done — and until S2 is done,
any authenticated Regroup user can read every resident's files.

**S4 caveat.** The claim that deploying Homegroups' committed Firestore rules *fixes* the broken
`getUserGroups` rests on an inline code comment, not on verification. The committed rules have
never been deployed. Run the repo's Firestore rules tests before trusting it.

**Ownership.** Every item below is unassigned. If one person owns all of it, say so explicitly in
this document; if not, put a name on each row before starting. Unowned steps in a plan this long
are how the 2020 ruleset survived six years.

Use `npx firebase-tools`, never the Homebrew binary at `/opt/homebrew/bin/firebase` — this repo
documents it being SIGKILLed with zero output.

---

## P0 — Prerequisite: no iOS build is possible on this machine

Verified 2026-09-27: `xcode-select -p` → `/Library/Developer/CommandLineTools`, and `xcodebuild`
requires full Xcode (`xcodebuild -version` → *"requires Xcode, but active developer directory
… is a command line tools instance"*). `regroup/mobile/ios/Pods` does not exist, so `pod install`
has never run here. `node_modules` is present (925 entries).

**Consequence:** neither app's iOS build can be verified, no archive can be produced, and no
binary can be uploaded from this machine. This gates R2, R9, H2 and every iOS submission step in
both tracks, and it is also why this repo's CLAUDE.md documents `npm ci` failing in the mobile
packages (their postinstall runs `pod install`).

| # | Item | ENG/OPS | Effort |
|---|---|---|---|
| P0 | Install full Xcode, then `sudo xcode-select -s /Applications/Xcode.app/Contents/Developer`, then `cd regroup/mobile/ios && pod install` | OPS | hours (mostly download) |

Until P0 is done, the only verifiable work in either track is JavaScript/TypeScript, Cloud
Functions, rules, indexes and Android — which is most of the Security remediation block, so that
work is not blocked.

---

## Track 1 — Regroup critical path

Ordered by dependency. R1 and R2 are one coordinated change; do not sequence them apart.

| # | Item | ENG/OPS | Evidence | Blocks | Effort |
|---|---|---|---|---|---|
| R1 | **Firebase SDK too old for privacy manifests — upload is rejected before review (ITMS-91061).** `Firebase/CoreOnly (10.7.0)` and `FirebaseCore (10.7.0)`. ITMS-91061 has been **enforced since 2025-02-12**, and `FirebaseCore.framework` is a commonly reported trigger. The manifest-bearing Firebase version is in the **10.22–10.24 range — confirm the exact floor against Firebase's iOS release notes** (an earlier draft of this plan asserted 10.24.0 without a source). 10.7.0 is far below either figure, so the premise is not in doubt. Bump the eight `@react-native-firebase` packages to Homegroups' proven ^21.13.0. **Acceptance:** a build uploads to App Store Connect without an ITMS-91061 notice. | ENG | `regroup/mobile/ios/Podfile.lock`; `regroup/mobile/package.json` + its 8 `@react-native-firebase/*` entries | **all iOS submission** | days (see note below) |
| R2 | **Verify iOS builds, against the post-bump tree.** RN 0.72 + `react-native-screens` 4.0.0 + Navigation v7 is the combination Homegroups abandoned; there is no CI iOS build. Align to screens ~3.37.0 + Nav v6 per the table above. **The downgrade is safe at the API level and risky at the type level** — see *Migration surface*. **Acceptance:** `tsc --noEmit` clean, then a simulator build succeeds (command in Q1). | ENG | `regroup/mobile/package.json`; Open Question Q1 | everything | unknown until P0 |
| R3 | **No in-app account deletion — Guideline 5.1.1(v).** **Acceptance:** a user deletes their account in-app; the auth record is gone and their data is purged or anonymised. Near-certain rejection. The app supports account creation (`src/screens/NewAccount/NewAccount.tsx`, `src/screens/SignUp/SignUpForm.tsx:160,220,240`) but no self-service delete exists: no delete-account callable in `regroup/functions/src/index.ts:7-50`, no auth-delete trigger or purge routine anywhere in `regroup/functions/src` (grep: zero hits), and the settings menu at `src/screens/Personal/Personal.tsx` ends at `LOG OUT` (`:431-432`). `useDeleteGuest` (`src/screens/Profile/UserInfo.tsx:90,134`) is an **admin** deleting a resident, which does not satisfy 5.1.1(v). | ENG | as cited | review approval | days |
| R4 | **Privacy manifest declares no data collection — on a substance-use treatment app.** `NSPrivacyCollectedDataTypes` is an empty array and `NSPrivacyTracking` is false, while the app stores drug-test results (`src/entities/DrugTest.ts:3-25` — result, testType, substancesDetected, observedBy, notes), medications (`src/entities/Guest.tsx:16,22`; `src/entities/Phase.tsx:43`), and required sobriety dates (`src/entities/Guest.tsx:42,96`; `src/entities/User.tsx:101`), plus location, photos, chat and staff clinical notes (`src/services/staffNotes.ts`). Expect rejection plus an App Privacy correction demand. | ENG | `regroup/mobile/ios/rats/PrivacyInfo.xcprivacy` (manifest is wired in — 4 pbxproj references) | review approval; disclosure accuracy | hours + care |
| R5 | **Release APNs entitlement is `development`.** **Acceptance:** a TestFlight build receives a push from the production APNs environment. Push is broken in the store build — a 2.1 completeness issue. Note the inversion: uncommitted WIP fixed this on Homegroups (never shipped) and left it broken on Regroup (actually ships). | ENG | `regroup/mobile/ios/rats/rats.entitlements` → `aps-environment = development`, used by the Release config | production push | small |
| R6 | **Stripe publishable key fails silently.** **Acceptance:** a build with the var unset fails loudly at startup rather than shipping. `process.env.STRIPE_PUBLISHABLE_KEY ?? 'pk_test_placeholder'` — no live branch, no fail-loud. Rent is Regroup's in-app money path, so a release build with the var unset ships an app where paying rent quietly fails. | ENG | `regroup/mobile/App.tsx:11`, consumed `:124` | in-app rent payments | hours |
| R7 | **Deploy the two `documents` indexes.** **Acceptance:** `listDocuments` returns successfully against production for a house with documents. `listDocuments` throws `FAILED_PRECONDITION` on first production use — 100% failure. Commit first (S5). | OPS | query `src/services/documents.ts:154-163`; verified not live | resident documents | minutes + deploy |
| R8 | **Confirm the live store records.** iOS `MARKETING_VERSION 1.53` / build 40; Android `versionCode 39` / `versionName 0.55`. Streams have diverged and the repo cannot say what is published. | OPS | pbxproj; `android/app/build.gradle` | update-vs-new-submission | minutes in console |
| R9 | **Android release signing + target SDK.** Verify a usable keystore config and check `targetSdkVersion` against Play's current minimum. | OPS/ENG | not settled this run | Play submission | unknown |

### Do NOT "fix" the bundle identifier

`PRODUCT_BUNDLE_IDENTIFIER = com.rats.dev` on **both Debug and Release**
(evidence: `regroup/mobile/ios/rats.xcodeproj/project.pbxproj`), while Android uses
`applicationId 'com.regroup.app'`. A `.dev` suffix in production looks like a bug, but a bundle
identifier is immutable once shipped. At build 40, `com.rats.dev` is almost certainly the
existing App Store record. Changing it creates a *new* app — new listing, lost reviews, existing
users stop receiving updates. Leave it; treat the iOS/Android mismatch as cosmetic. Confirm via
R8 before anyone cleans this up.

---

## Track 2 — Homegroups critical path

Start only after Regroup ships, per the chosen sequence. H1 should be answered early anyway,
because its answer may change the product.

| # | Item | ENG/OPS | Evidence | Blocks | Effort |
|---|---|---|---|---|---|
| H1 | **Resolve 3.1.1 vs 3.1.3(e). START THIS NOW — do not wait for Regroup to ship.** Apple's 3.1.1 requires IAP to "unlock features or functionality within your app"; 3.1.3(e) requires that purchases of "services consumed outside of the app" use **non-IAP** methods. Homegroups sells a group-admin subscription via an embedded Stripe WebView plus a native card form, so the determining question is factual, not legal: **does the $12/yr unlock admin functionality inside the app, or pay for a real-world service (running a physical 12-step group, directory presence)?** Answer that from the entitlement code, then decide: adopt IAP, move the purchase genuinely out-of-app, or document the 3.1.3(e) position for review notes. Treating this as settled either way is the single largest scope risk in this plan. | PRODUCT | native card `homegroups/mobile/src/screens/homegroup/CreateGroupScreen.tsx:38,147,513`; WebView `src/components/payments/SubscriptionWebView.tsx:39`; callers `GroupOverviewScreen.tsx:21,162`, `SubscriptionUpgradeScreen.tsx:16,232`; `IntergroupDashboardScreen.tsx:47`; guidelines 3.1.1 and 3.1.3(e) | the entire iOS submission | decision now; weeks only if IAP is required |
| H2 | **No Android release signing key exists.** `signingConfigs.release` only populates from `MYAPP_RELEASE_*` properties that are deliberately absent; only `debug.keystore` is tracked. `local.properties`/`keystore.properties` are gitignored but **nothing loads them**, so only `ORG_GRADLE_PROJECT_*` env vars work today. | ENG/OPS | `homegroups/mobile/android/app/build.gradle:94-99,118-120`; `android/gradle.properties` trailing comment | any Play submission | days incl. Play App Signing |
| H3 | **No app-level `PrivacyInfo.xcprivacy`.** Absent from the iOS project. Unlike Regroup, its *SDK* manifests are fine (Firebase 11.11.0 ships them), so this is the app's own manifest only — and unlike Regroup's, it must be written truthfully from the start. | ENG | no match under `homegroups/mobile/ios/`; `homegroups/mobile/ios/Podfile.lock` → `FirebaseCore (11.11.0)` | iOS submission | hours |
| H4 | **`targetSdkVersion 34`** is likely below Play's current minimum for new apps and updates. Exact threshold is a console fact. | ENG | `homegroups/mobile/android/build.gradle:9-10`; `app/build.gradle:76,82` | Play submission | days |
| H5 | **Stripe key is test-only by construction**, and keys are inlined at build time, so a release build from a clean checkout ships an empty key and a reviewer exercising purchase hits a dead flow — a 2.1 completeness risk on top of H1. | ENG | `homegroups/mobile/App.tsx:472,474-481,485-486`; `babel.config.js:4`; `.env` untracked | review completeness | hours |
| H6 | **Commit the pending WIP** — the Release entitlement fix (`aps-environment` now `production`) and the cross-branding fixes on the four web pages. | ENG | `git diff` | losing the work | minutes |

---

## Already done — stop treating these as blockers

| Claimed | Reality | Evidence |
|---|---|---|
| regroup: "no webhook-driven status changes" | **False.** Handled. | `regroup/functions/src/webhooks/stripeWebhook.ts:1111-1121` |
| regroup: failed-payment recovery absent / "starts 30 days late" | **Dunning exists.** `invoice.payment_failed` handler with escalation `attemptCount >= 3 ? "unpaid" : "past_due"` and customer notification. Fires late, not absent. | `stripeWebhook.ts:677,707,725-726` |
| regroup web `pk_live_` "LAUNCH BLOCKER (C2)" | **Stale comment.** Real live key committed. | `regroup/web/src/environments/environment.prod.ts:7` |
| regroup: Stripe API version unset | **False.** Pinned. | enforced by `regroup/scripts/preflight-billing.js:132` |
| regroup: no `functions/.env.example` | **False.** Exists. | `regroup/functions/.env.example` |
| regroup iOS bundle-id mismatch is a blocker | **Reframed.** `com.rats.dev` is on Debug *and* Release and is almost certainly the shipped identifier. Changing it is the risk. | `regroup/mobile/ios/rats.xcodeproj/project.pbxproj` |
| homegroups Release APNs entitlement is `development` | **Fixed in WIP** (now `production`) — but uncommitted. Regroup's is still broken. | `homegroups/.../RecoveryConnectRelease.entitlements` |
| The `intergroups` / `documents` indexes are "minutes + deploy" and nearly done | **Written, not deployed.** Being in the file is not being live. | verified live: absent from both projects |
| Homegroups lacks in-app account deletion | **Present and real.** Cancels the Stripe subscription, then deletes the auth user. | `homegroups/mobile/src/screens/profile/ProfileManagementScreen.tsx:419` → `deleteUserAccount`, exported `homegroups/functions/src/index.ts:75`; Stripe cancel `:264`; `auth.deleteUser` `:299` |
| Homegroups may need Sign in with Apple (4.8) | **Satisfied.** Google + Facebook + Apple, entitlement present. Regroup is email/password only, so 4.8 does not apply there. | auth provider config in both apps |
| Homegroups support pages are cross-branded | **Fixed in WIP** — 5 lines, `admin@regroup-app.com` → `admin@homegroups-app.com`; zero cross-brand references remain in Homegroups source. Still uncommitted (H6). | `git diff` on the four `homegroups/web/src/pages/*.js` |
| A reviewer cannot get into Regroup without a house | **False.** Regroup ships a one-tap demo login. | `regroup/mobile/src/screens/Landing/InitialLandingForm.tsx:76` |

Docs still asserting otherwise: `docs/go-to-market/project-management.md`,
`regroup/functions/CLAUDE.md`, `regroup/docs/technical/gap-analysis-production-readiness.md`
(Dec-2025, stale wholesale), and `plan-recovery-platform-2026-09-04.md` on the entitlement and
index items.

---

## The 30-day trial — recommendation

`trial_period_days: 30` is hardcoded at two sites with no per-tier configuration
(evidence: `regroup/functions/src/api/stripe.ts:101` and `:127`). `payment_method_collection` is
never set, so Stripe's default requires a card at signup, but nothing proves that card is
chargeable until the first invoice 30 days later.

**Recommendation: keep the trial, and take it off the launch path entirely.** Two reasons.
First, Regroup's operator subscription is purchased on the web, never in the app
(zero call sites for `createOperatorSubscription`/`createTierSubscription` in `regroup/mobile/src`;
checkout lives at `regroup/web/src/app/components/billing/billing-info/billing-info.component.ts`),
so the trial has no bearing whatsoever on store approval. Second, the gap is narrower than the
previous plan claimed: dunning already exists, so what is missing is not *recovery* but *early
detection*. The proportionate fix is to validate the payment method at signup — a `$0`
authorization or explicit setup-intent confirmation — so a declined card surfaces on day one
instead of day 31. That is a revenue-quality improvement to schedule after the store work, not
a launch blocker.

**The pricing question itself remains unanswerable here.** The repo contains no pricing
validation, no funnel data and no retention data. Whether $49–$249/month is right is not a
question this analysis can address.

---

## Risks

| Risk | Severity | Concrete failure |
|---|---|---|
| Interim Regroup storage rule has no per-owner scoping | High | Any authenticated Regroup user can read any resident's documents. Closed the public hole; the tenancy hole is open until S2. |
| Homegroups 3.1.1 | High | iOS submission rejected; remedy may be IAP, costing weeks plus a permanent revenue share. |
| Regroup iOS build unverified | High | If it does not compile, the entire Regroup track is blocked and the sequence should be reconsidered. |
| Rules/index drift recurs | High | S1 unfixed means the next person re-introduces exactly this class of bug. It already hid a 2020 ruleset for six years. |
| Homegroups group backups in an over-permissive bucket | Medium | Any authenticated user can read every group's members and transactions. |
| **Regroup ships a one-tap demo login in production** | Medium–High | `InitialLandingForm.tsx:76` exposes a shared demo account (`demo_user@appdemo.net`) to every installed copy of the app. It helps App Review, but it is a standing shared credential in a production app holding recovery data — and the interim storage rule now grants any authenticated user read access to every resident's files (S2 pending). Confirm the account's scope and data, and consider gating it to non-production builds after review. |
| No backend error visibility | Medium | A webhook throws and nobody learns until a user complains. |
| Rate limiting near-absent | Medium | In a vulnerable-user product this is a harassment vector, not only a cost one. |

---

## Deferred — real work, not store-blocking

- **~258 files over 300 lines** (222 in the two mobile apps). Documented, deliberately ratcheted.
- **`regroup/web` test runner.** `angular.json` points at a `karma.conf.js` that has never existed. Genuinely broken; gates no store submission.
- **`createReferral` has zero call sites.** The platform's whole integration thesis is unused. Strategically significant, not a store blocker.
- **Analytics instrumentation.** Near-zero in both apps. Matters the day *after* launch, for telling a funnel problem from a demand problem.
- **Unbounded fan-out** in `scheduledInstanceGenerator.ts`. Fix before growth, not before submission.

---

## Open questions

1. **Does `regroup/mobile` iOS compile — before and after the R1/R2 version bump?** Still the largest unknown, and **not answerable on this machine** (see P0 — no full Xcode, no Pods). After P0, settle with a simulator build, which tests compilation without provisioning:
   `cd regroup/mobile && npx pod-install && xcodebuild -workspace ios/rats.xcworkspace -scheme rats -sdk iphonesimulator -configuration Debug CODE_SIGNING_ALLOWED=NO build`
   The Release/device variant, for archiving, is:
   `cd regroup/mobile && npm ci --ignore-scripts && cd ios && pod install && xcodebuild -workspace rats.xcworkspace -scheme rats -configuration Release -sdk iphoneos -allowProvisioningUpdates build`
2. **What is the exact Firebase iOS version floor for privacy manifests** — 10.22.0 or 10.24.0? Sources disagree; Firebase's release notes are authoritative. Does not change R1's necessity, only its target.
3. **Does the Homegroups subscription unlock in-app functionality (3.1.1) or pay for a real-world service (3.1.3(e))?** Answerable from the entitlement code plus a product decision. Drives whether H1 is hours or weeks.
4. **Is `com.rats.dev` the live App Store record, and what version is actually published?** Decides whether Regroup is an update or a new submission — and confirms the identifier must not change.
5. **Does `homegroups-app.com` actually serve `/privacy` and `/terms`?** Store listings require working URLs, and the newly corrected pages point there. Console/browser check.
6. **Does `demo_user@appdemo.net` still exist in the `phoenix-cleanhouse` Auth project, and what can it see?** Decides whether Regroup's shipped demo login is a working review aid, a dead end that fails review, or an exposure.
7. **Is `STRIPE_SECRET_KEY` live-mode in each project's Secret Manager?** Not readable from the repo, and must not be.
8. **Which regroup price-ID set is deployed** — `regroup/scripts/stripe-prices.env:15-20` (labelled live) or `stripe-product-values.md` §1 (labelled TEST), same env-var names?
9. **What is Play's current minimum target API?** Decides H4's and R6's urgency.
10. **Does Homegroups qualify for any 3.1.1 exception?** A policy judgment, possibly needing Apple or counsel.
11. **What should any of this cost?** No pricing validation exists in the repo. Unanswerable here.

---

## How this was verified

Five parallel scans: Regroup build health, Homegroups build health, store-review compliance,
money path, operational readiness. Beyond static analysis, live state was measured directly:
Firebase rules releases and ruleset sources for both projects via the firebaserules REST API
(the `mcp__firebase__*` server is pinned to `recovery-platform` and 403s on the others), live
Firestore index inventories, and a direct parse of both `project.pbxproj` files for
per-configuration bundle identifiers and entitlements.

**Externally verified 2026-09-27** (web sources, not the repo): ITMS-91061 is enforced from
2025-02-12 and names `FirebaseCore.framework`; the manifest-bearing Firebase floor is reported as
10.22.0 in one source against this plan's earlier 10.24.0, so it is recorded as a range pending
Firebase's release notes. Apple's guideline text for 3.1.1 and 3.1.3(e) was read directly from
`developer.apple.com/app-store/review/guidelines/`.

**Not checked:** App Store Connect and Play Console listing state, Stripe Dashboard, Secret
Manager values, and whether either mobile app compiles. The Regroup iOS build is the most
consequential gap and is Open Question 1.

**Revised after the store-compliance scan returned**, which overturned this document's first
draft: Regroup went from "hygiene only" to carrying the upload-blocking Firebase SDK issue (R1),
the missing account deletion (R3) and the false privacy declaration (R4). Firebase and RN
versions in both apps were then verified directly from `Podfile.lock` and `package.json`.

The store-compliance scan completed fully on its third request; only Homegroups' `LAUNCH_BLOCKERS` checklist could not be located at the path three live sources reference (the sole copy is `homegroups/_legacy/RecoveryConnect/docs/LAUNCH_BLOCKERS.md`).

**The Regroup build-health scan never returned** across 2h and three requests and was stopped.
Its assigned question — whether `regroup/mobile` iOS compiles — was then found to be
**unanswerable on this machine**: no full Xcode is installed (P0). That is recorded as a
prerequisite rather than assumed either way, and it is the likely reason that scan made no
progress.
