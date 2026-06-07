# Journey Into recovery-platform

_A deep-dive into a single, pivotal five-hour working block — the evening of June 6 into the small hours of June 7, 2026 — reconstructed from claude-mem's persistent memory._

## A Note On Scope

This is not a chronicle of months. The entire claude-mem record for `recovery-platform` is 64 observations across 5 memory sessions, every one of them recorded inside one intensive marathon — `2026-06-06T22:37Z` to `2026-06-07T03:49Z`, roughly five hours of wall-clock time (about 5:37p to 10:49p Central). What follows, then, is the anatomy of a single evening: a long, stubborn dependency battle that forced an architectural decision, bookended by productization work (launch-readiness docs, version bumps, a 49k-line merge) and a closing burst of meta-work in which the developer optimized their own Claude Code toolchain mid-flight. The memory's value here is not cross-session recall — there are no prior sessions to recall from — but compression: 234,816 tokens of live work distilled into ~21,235 tokens of durable, re-readable record, a 91% saving.

## 1. Session Genesis — A Pod Install That Wouldn't Finish

The evening opened not with a feature request but with a stuck process. At 5:37p (#31) a BoringSSL submodule clone "appeared stalled" during a CocoaPods `pod install`, and minutes later (#32) the git clone was confirmed hung — 13+ minutes in, minimal CPU activity, no progress. The first reflex, killing the clone, failed in an instructive way: at 5:41p (#33) the pod install process simply persisted despite the kill attempt during a StripePayments clone failure, which spawned an entire mini-investigation (S10) into _why_ killing a child git process doesn't cancel an in-flight CocoaPods install.

The founding constraint of the whole session sits underneath this: the goal was **launch readiness** for the two React Native apps — homegroups (RecoveryConnect) and regroup (RATS) — and step zero, a clean install of iOS dependencies, was failing on the network layer before any product work could begin. The first concrete fix came fast: at 5:41p (#34) the developer hardened the git transport with an extended buffer and a low-speed timeout to recover from fetch-pack disconnects. That treated the symptom — flaky large-repo clones — but, as the evening would prove, not the disease.

A second, smaller genesis thread ran in parallel: the install tooling itself was not portable. At 6:20p the `clean-install.sh` script was found to be missing execute permissions (#48), and in the session's lone refactor (#49) it was rewritten from a brittle inline command chain with a hardcoded `/Users/marcuspersonal/...` path into a proper bash script using parameter expansion for dynamic path resolution plus `set -euo pipefail` for fail-fast robustness. The execute bit was added at 6:21p (#50). This is a quiet but telling early signal: before chasing the hard bug, the developer fixed the harness that would have to run dozens of times while chasing it.

## 2. The nanopb Saga — The Spine Of The Evening

Everything else hangs off one transitive dependency. Beginning at 6:31p (#53) and recurring relentlessly for the next four hours, the central technical thread was a **nanopb version conflict between Firebase Crashlytics and Firestore**.

The root cause was nailed in a high-value discovery at 6:34p (#55): RNFBFirestore v18.9.0's podspec _hardcodes_ a nanopb constraint of `>= 2.30908.0, < 2.30910.0`, locking nanopb to major version 2. Meanwhile Firebase iOS SDK 11.6.0 — pulled in by RNFBCrashlytics v18.9.0 — requires nanopb `~> 3.30910.0`, major version 3. Two core Firebase modules, in the same app, demanding two different _major_ versions of the same shared transitive library. The Podfile's `$FirebaseSDKVersion` override could force the SDK to 11.6.0 but could do nothing about Firestore's hardcoded nanopb pin. As #55 puts it, the conflict "has existed since the initial monorepo commit" — an architectural incompatibility baked into the RNFB 18.9.0 + Firebase SDK 11 combination.

The supporting discoveries filled in the picture and the mess that produced it: at 6:32p (#54) the app was found running mixed RNFirebase module versions in the 18.7.3–18.9.0 range with Firebase SDK pinned to 11.6.0; at 6:35p (#59) the team learned that overriding the Firebase SDK from RNFirebase's default (10.20.0) up to 11.6.0 was itself what introduced the nanopb incompatibility; and at 6:39p (#63) RNFB version inconsistency was confirmed both _within_ the homegroups app and _across_ apps. The picture was of a half-finished Firebase 11 migration left in a broken intermediate state.

What makes this a _saga_ rather than a single diagnosis is how many times the same conflict re-surfaced. The string "CocoaPods nanopb version conflict" appears in observations at 6:38p (#61), 7:09p (#70), 7:49p (#79), 8:14p (#88), 8:27p (#96), 8:42p (#97), 8:58p (#105), 9:53p (#114), and 10:41p (#125). Interleaved with these were repeated _network_ failures of the same shape that opened the night: a Stripe iOS SDK clone failure at 5:55p (#41), BoringSSL completion monitoring at 5:58p (#42), and a textbook recurrence at 9:08p (#106) where BoringSSL-GRPC failed again on a slow network — transfer rate below 1000 bytes/sec for over 60 seconds, fetch-pack disconnect. The nanopb dependency conflict and the BoringSSL clone fragility were two distinct failure modes that kept masking each other: fix the network and you hit nanopb; resolve nanopb and the next install would stall on BoringSSL. The longest continuous debugging stretch — the nanopb thread proper — ran from roughly 5:37p to 10:41p, essentially the whole session.

## 3. The Decisive Pivot — Stop Patching, Upgrade

After two hours of symptom-chasing, the night turned on a single decision. At 7:49p (#79) the conflict was re-confirmed one more time; in the same minute came the session's only `⚖️` decision, #80: **upgrade `@react-native-firebase` from v18 to v21.13.x.**

This was the turning point because it reframed the problem from "make these two incompatible modules coexist" to "stop straddling two Firebase generations." Per #80's narrative, RNFB v21.13 is the first release to adopt Firebase iOS SDK v11 (11.10.0) _and_ nanopb 3.x simultaneously — so the Firestore-vs-Crashlytics nanopb split simply ceases to exist. Critically, the decision noted that both manual pins — the Podfile's `$FirebaseSDKVersion=11.6.0` override and Android's explicit `firebase-bom 33.1.1` — become _redundant_, because RNFB 21.13's own podspecs and `sdkVersions` declare the same tested versions. And because the namespaced Firebase JS API (`firestore()`, `auth()`, etc., across 207 call sites) stays backward-compatible through v21, no application-code rewrites were required. The decision shipped as a detailed 10-task plan covering manifest edits, clean reinstalls, CocoaPods resolution with network-flakiness mitigation, static verification, and manual iOS/Android smoke tests across Auth, Firestore, Functions, Messaging, Storage, and Crashlytics — plus a rollback to baseline if verification failed.

The execution followed quickly and cleanly. A baseline for the upgrade was captured at 8:00p (#82), and the conceptual heart of the fix landed at 8:01p (#84): **Firebase version management delegated to RNFB v21.** The Podfile's hardcoded SDK version was removed entirely, with a comment warning future maintainers not to re-introduce it — the narrative names the failure pattern explicitly as "nanopb drift." This is the single most important idea of the evening: _let the library that owns the Firebase modules own the Firebase SDK version too._ Android's Firebase BOM was bumped to v33 at 8:01p (#85), the RNFB packages were upgraded to v21.13.0 at 8:03p (#86), and the manifest changes were committed and verified at 8:04p (#87).

The proof arrived in the discoveries that followed. At 8:16p (#89) `npm install` resolved cleanly to RNFB v21.14.0 with a single deduplicated `@react-native-firebase/app` base, and at 8:17p (#90) the developer confirmed _why_ it now worked: the RNFBFirestore v21.14.0 podspec uses a **variable reference** (`firebase_sdk_version`) to pin Firebase/Firestore — resolving to iOS SDK 11.11.0 and Android BOM 33.12.0 — rather than hardcoding a constraint, delegating nanopb resolution upstream to the Firebase pod where no module can disagree with another. The Android BOM was re-synced to match (#91, 8:17p) and committed (#92, 8:18p). The architectural smell of #55 had been replaced by the clean pattern of #90. The migration was finally declared complete at 10:59p (#144) — the RNFB v21 upgrade closing out the Firebase 11 transition that had been half-finished since the monorepo's first commit.

## 4. Launch Readiness & Productization

Parallel to the dependency war, the developer did the un-glamorous work that actually constitutes "launch ready." Three threads stand out.

**Assessment docs.** A comprehensive, spec-ready Regroup (RATS) launch-readiness assessment was created at 7:04p (#67) — one of the densest memories of the night at 15,402 tokens — covering features, pricing gaps, Stripe status, competitive analysis, and a 12-item spec backlog. At 7:44p (#77) the dual scoring was formalized: **homegroups 7.5/10, regroup RATS 5/10.** Homegroups was further along but blocked on an unsustainable pricing strategy and unset Stripe intergroup prices; RATS was less mature, its critical blocker being zero Stripe subscription prices despite a fully-built 6-tier product structure, compounded by Angular 9 (EOL) on the web side and an undefined migration path for existing houses. Both assessments benchmarked against market leaders (Sobriety Hub, One Step, Behave Health) to ground pricing decisions.

**Stripe & error tracking.** At 6:54p (#64) the developer mapped the homegroups Stripe Connect webhook implementation — a dedicated `stripeConnectWebhook` handler with its own `connectWebhookSecret`, separate from the standard payment webhook, indicating marketplace/multi-account functionality is already in place. At 6:55p (#66) an error-tracking configuration inconsistency _between_ the two apps was flagged as a readiness gap.

**The big merge and version bumps.** At 7:44p (#76) the iOS `Podfile.lock` was removed from git tracking to reduce cross-machine churn — directly informed by the night's BoringSSL/network pain. Then at 7:45p (#78) came the headline commit: a major merge of the regroup tier-billing Stripe migration, the launch-readiness docs, and archival of legacy codebases — **49k+ insertions** — shipped via PR #6 (workflow S20). Both apps were then formally productized: RecoveryConnect bumped to 1.0.0 at 8:20p (#93) and regroup (rats) to 1.0.0 immediately after (#94).

A late coda tied the Firebase upgrade back into product code. From 10:41p–10:43p (#126–#131) the developer systematically added TypeScript generic types to the `httpsCallable()` Cloud Function invocations across Redux slices, data models, and UI screens — `createGroupWithSubscription`, `requestAdminAccessWithSubscription`, `searchGroupsByLocation`, `createStripePaymentIntent` — until the compiler passed clean (#130) and the fix was committed as part of RNFB 21 compatibility (#131). These four typing observations are, notably, among the most expensive discoveries of the night.

## 5. Tooling Meta-Work — Optimizing The Workshop Mid-Build

The final hour pivoted away from the product entirely and onto the developer's own Claude Code environment — a striking instance of sharpening the axe while still mid-chop. Starting at 9:53p the focus shifted to plugin and agent bloat: orphaned `buildwithclaude` plugins were found occupying ~1.2M of disk cache, holding 18+ folders and 41+ agents no longer reachable through the registry (#115, 9:54p). What followed was a disciplined, batched purge: unused agents/plugins removed at 10:00p (#120), 4 plugins (systems-programming + 3 SEO) uninstalled at 10:01p (#122), then three optimization batches against `settings.json` — 5 redundant `voltagent-*` packs disabled at 10:44p (#133), 7 `claude-code-workflows` packs at 10:46p (#134), and a final batch of 9 (6 workflows toss-ups + 3 agent-alchemy) at 10:47p (#135). Each batch was preceded by a timestamped backup. The cumulative result: enabled plugins cut from 119 to **79** (a 33% reduction, or 46% measured from the initial ~145), preserving full-stack, RAG/data-AI, and business capabilities. The inventory doc was then relocated into the research repo for version control at 10:48p (#140).

The meta-work culminated in a recursive moment. At 10:49p (S50) the developer queried the claude-mem database itself to find which projects warranted timeline reporting — identifying recovery-platform as primary at 64 observations — and then, at 10:53p (S51), made an explicit cost decision: **defer the timeline report to a fresh session.** The session was approaching ~$91+ in cost, and the learned principle recorded for the night was that deferring expensive analysis operations to a cost-efficient fresh session "yields significant cost savings without loss of quality." This very report is the redemption of that deferral. There is something fitting about a developer who, on the same night they delegated Firebase versioning to the right owner, also delegated their own most expensive analysis to the right (cheaper) session.

## 6. Work Patterns — Investigation-Dominant, Punctuated By Decisive Commits

The type breakdown tells the story: 35 discoveries to 27 changes, 1 refactor, 1 decision. That 35:27 discovery-to-change ratio marks this as an **investigation-dominant** evening — more time spent understanding than mutating. The rhythm was long diagnostic cycles (the recurring nanopb and BoringSSL re-discoveries) broken by short, decisive bursts of commits, the clearest being the 8:00p–8:18p window where the v21 upgrade went from baseline (#82) to fully committed and BOM-synced (#92) in eighteen minutes, and the 10:41p–10:43p TypeScript-typing burst. The single `⚖️` decision (#80) sits almost exactly at the hinge of the night, with diagnosis before it and execution after — a clean illustration of "investigate until the decision becomes obvious, then move fast."

## 7. Token Economics & Memory ROI

The headline figures: **234,816 total discovery tokens** of live work, captured as roughly **21,235 read tokens** of durable memory — a **~91% compression saving**. Average cost per observation was ~3,669 tokens. (The raw DB actually carries 65 rows summing to ~236,091 tokens, including one extra `feature`-typed entry, #144; the brief's 64/234,816 figures are used here as the canonical headline, with the discrepancy noted for honesty.)

The five most expensive — and therefore highest-value — memories were:

| Rank | ID   | Tokens | What it captured                                                  |
| ---- | ---- | ------ | ----------------------------------------------------------------- |
| 1    | #128 | 15,998 | TS type safety on `searchGroupsByLocation` callable in GroupModel |
| 2    | #67  | 15,402 | The full RATS launch-readiness assessment + 12-item backlog       |
| 3    | #129 | 13,239 | TS type safety on `createStripePaymentIntent` across the UI layer |
| 4    | #80  | 12,158 | The v18→v21.13.x upgrade decision + 10-task plan                  |
| 5    | #126 | 9,453  | TS type safety on `createGroupWithSubscription` callable          |

It is worth being precise about where the ROI lives. **Explicit cross-session recall events: zero.** This is session 1 of memory for this project — there was no prior memory to draw on, so the passive "the agent remembered something from last week" payoff has not yet been realized. The value captured tonight is entirely _compression_: the ability to re-read an entire five-hour, 234k-token marathon as ~21k tokens, and the seeding of a knowledge base whose recall dividends accrue on future sessions. Tonight the platform paid in; future sessions are where it pays out.

## 8. Timeline Statistics

- **Date range:** 2026-06-06T22:37Z → 2026-06-07T03:49Z (~5h 12m wall-clock; ~5:37p–10:59p Central).
- **Volume:** 64 observations across 5 memory sessions; 234,816 discovery tokens; ~21,235 read tokens; ~91% compression.
- **Type mix:** discovery 35, change 27, refactor 1, decision 1 (raw DB adds 1 feature, #144).
- **Memory sessions by size:** the dominant session (`62ecb300…`) holds 39 of the 64 observations and spans nearly the whole evening; the other four are short bursts of 3–10.
- **Busiest stretch:** the v21 upgrade window, 8:00p–8:20p, packing the baseline, delegation, package upgrade, two commits, BOM sync, and both 1.0.0 version bumps.
- **Longest debugging session:** the nanopb thread, ~5:37p to ~10:41p — effectively the entire night, re-surfacing across nine distinct observations.

## 9. Lessons & Meta-Observations

A developer arriving fresh at this codebase inherits a handful of hard-won, durable lessons:

1. **React Native Firebase version pinning is treacherous.** A half-finished SDK migration (#54, #59, #63) left two core modules demanding incompatible major versions of a single transitive library (nanopb). Straddling two Firebase generations is the trap.
2. **Let RNFB own the Firebase SDK version.** The fix wasn't a cleverer pin — it was _removing_ the pins. Delegating version management to RNFB v21 (#84), whose podspecs use a variable Firebase SDK reference (#90), eliminates "nanopb drift" by construction. Do not re-introduce `$FirebaseSDKVersion`; the comment in the Podfile says so for a reason.
3. **Network-resilient git config matters for CocoaPods.** Hours were lost to BoringSSL/Stripe large-repo clones stalling on a slow link (#31, #41, #106). Hardened git transport (#34) and untracking `Podfile.lock` (#76) are cheap insurance.
4. **Killing a git child doesn't cancel a pod install** (#33) — a sharp operational gotcha worth remembering.
5. **Launch readiness is mostly _not_ code.** The blockers in #77 were pricing strategy, unset Stripe prices, an EOL Angular web stack, and a missing migration plan — docs, billing config, and versioning, not features. The 7.5 vs 5 gap between homegroups and regroup is a billing-and-pricing gap, not an engineering one.
6. **Optimize your toolchain, and your analysis costs, deliberately.** Cutting the plugin registry 119→79 (#135) and deferring this very report to a cheaper session (S51) show the same instinct applied to the meta-layer: spend reasoning where it earns its keep.

---

_Compiled from claude-mem observations #31–#144 and session markers S7–S51. Access the underlying ~235k tokens of work via `get_observations([IDs])` or the mem-search skill._
