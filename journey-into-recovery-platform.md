# Journey Into recovery-platform

_A technical-historian narrative reconstructed from claude-mem's persistent memory._
_Generated 2026-06-07. Window analyzed: 2026-06-06 22:37 → 2026-06-07 10:56 CDT (~12 hours). 156 observations across 11 sessions._

---

## ⏭️ Next Session — START HERE: Chunk 2 `detox-recovery` (code pass)

> **Recap (from the user):** "We audited claude-mem to plan resuming the codebase-learning chain; chunks 0–1 are done and the verified resume schedule is now saved in the plan file. Next action: start chunk 2 (detox-recovery code pass) when you say how many chunks to run." _(User also noted: disable recaps in `/config`.)_

When the codebase-learning chain resumes, **chunk 2 is `detox-recovery` — the code pass, not the docs pass.** Docs/naming were already done (#255–258, #381–385); the ~55 remaining source files were never read in full. Before reading, recall this hard-won context so the pass connects to it:

1. **The referral flow is the live integration seam — and it is currently broken/deferred.** detox's `fireReferral` and recovery-api's `createReferral` have **five independent contract mismatches** (#325, S106): transport (REST vs callable), envelope format, auth headers, app-naming (display vs app-id form), and anonymous-user handling. `RECOVERY_API_URL` is intentionally left commented (#326, ⚖️ decision).
2. **Three-namespace naming model** (#374–376, `docs/ecosystem/referral-enablement.md`): display names (frontend wire values) → Firebase project IDs → canonical app-ids (backend storage). Firebase project IDs carry suffixes when the bare name is taken: **`nextsteprecovery-1d5c2`** is the real project ID; **`nextstep-recovery`** is only an alias (now reflected in root CLAUDE.md, #376/#381).
3. **A regression to watch for:** `generateReferralCode` was broken by a misplaced display-name→project-id map that failed validation against real Firestore doc IDs (#375); fixed in #379. `KNOWN_INTERESTS` was missing an option (#380). Verify these stayed fixed.
4. **Four open decisions block full referral E2E** (OPEN-1/2/3/4): canonical app-ids for regroup, detox, NSR registration, and anonymous-uid policy. The detox read pass should note anywhere these surface in code.
5. **Entry file:** `detox-recovery/app/api/contact/route.ts` is the referral producer — read it closely; it's where display-names-without-headers currently originate (#374).

The verified resume schedule lives in `.claude/prompts/learn-codebase-plan.md` (§ "Resume status"). **Skip chunks 0–1**, run chunk 2 next, then 3 → 11 in order, then the chunk-12 synthesis pass. Ask the user how many chunks to run before dispatching.

---

## A Note On Scope

This is the anatomy of one sustained marathon. The entire claude-mem record for `recovery-platform` is **156 observations across 11 sessions**, every one recorded between `2026-06-06T22:37Z` and `2026-06-07T10:56Z` — roughly twelve hours of wall-clock work (about 5:37 PM June 6 to 5:57 AM June 7 Central). There is little cross-month history to recall; the memory's value here is **compression and intra-burst continuity** — **727,458 tokens of live work distilled into ~56K of durable record (a ~92% saving)** — plus the handoff scaffolding that lets a fresh session resume exactly where this one stopped at the cost ceiling.

The arc has four movements: a stubborn iOS **dependency battle** that forced an architectural upgrade; a **productization** pass (launch-readiness docs, version bumps, a 49k-line merge); a **rebrand + documentation** sweep (RecoveryConnect→Homegroups, RATS→Regroup); and a closing **integration** investigation that exposed the referral bus as aspirational and ended in a disciplined defer.

## 1. Project Genesis

recovery-platform is not greenfield — it is a **flat monorepo consolidating four pre-existing recovery products** (homegroups, regroup, detox-recovery) plus a shared `recovery-api` service, and the timeline opens mid-consolidation. The earliest observation (#31, 5:37 PM) is not a feature; it is a symptom: _"boringssl submodule clone appears stalled during pod install."_ The recorded history begins in **build infrastructure**, not vision.

The founding constraint underneath everything: the goal was **launch readiness** for two React Native apps, and step zero — a clean iOS dependency install — was failing on the network layer before any product work could begin. A second, quieter genesis thread ran in parallel: the install tooling itself wasn't portable. `clean-install.sh` was missing its execute bit (#48) and carried a hardcoded `/Users/marcuspersonal/...` path; it was rewritten for dynamic path resolution and `set -euo pipefail` fail-fast (#49–50). A telling early signal — fix the harness before chasing the bug it will run against dozens of times.

## 2. Architectural Evolution

Three architectural threads evolve across the window.

**Thread A — Firebase / React-Native dependency baseline.** The first half is one campaign: upgrading **@react-native-firebase v18 → v21.13.x** and **Firebase SDK → v11** to resolve a `nanopb` conflict (#55: _"RNFBFirestore v18.9.0 hardcodes nanopb < 2.30910.0, fundamentally incompatible with Firebase SDK 11.6.0"_). The decisive pivot is #80 (⚖️). It cascaded into TypeScript type-safety work on Cloud Function callables (#126–129) and Android BOM alignment (#85, #91).

**Thread B — recovery-api's true shape.** A correction at #249–254 (3:28 AM): the mental model of recovery-api as a **Hono.js / Cloud Run REST API was wrong** — it is **Firebase Functions v2 callables**. A documentation-and-memory refactor (#252, 🔄) realigned four memory blocks and the CLAUDE.md set. The architecture didn't change; the _understanding_ of it did.

**Thread C — the referral integration bus.** The final, most consequential thread (#325 onward). Wiring detox → recovery-api referrals exposed the bus as **aspirational, not implemented**: the `apps.ts` registry mapping display names → project IDs → app-ids _does not exist yet_ (#368), and the two sides disagree on five axes (S106). The pragmatic call (#326) was to **defer**.

## 3. Key Breakthroughs

- **#80 — the upgrade decision.** After a dozen observations cataloguing the same nanopb conflict (#53, #61, #70, #79, #88, #96, #105), the tone flips from investigation to resolution: commit to v21.
- **#89 — _"RNFB dependencies successfully resolved to v21.14.0."_** The dependency matrix finally coheres.
- **#144 (🟣) — _"React Native Firebase v21 upgrade completes Firebase 11 migration."_** The campaign's capstone.
- **#252 — the Hono→Functions-v2 correction.** A breakthrough of _understanding_.
- **#379 — `generateReferralCode` type-mismatch fix.** The hardest live bug of the window, rooted in naming-namespace confusion.

## 4. Work Patterns

The rhythm is a **single sustained burst** — 19 observations June 6, then **137 on June 7** (87% of activity), 9 sessions in one day. Distinct phases:

- **Debugging cycle (≈5:37–10:00 PM Jun 6):** dense CocoaPods/nanopb/BoringSSL discovery cluster — many 🔵, few ✅ ("same wall, different angle").
- **Feature/upgrade sprint (8:00–11:00 PM):** rapid ✅ changes as v21 lands and is committed (#82–92, #126–131).
- **Tooling/meta detour (10:44–10:50 PM):** pruning the Claude Code agent/plugin registry mid-flight (#132–140) to cut context cost.
- **Exploration (11:47 PM–12:19 AM):** the expensive flowchart-documentation pass mapping all products' flows (#174–185).
- **Rebrand/refactor (12:53–2:03 AM):** RecoveryConnect→Homegroups, RATS→Regroup across skills, docs, in-app strings.
- **Integration (3:28–5:57 AM):** recovery-api naming standardization and the referral-flow investigation, halted at the cost ceiling.

## 5. Technical Debt

**Paid down:** the RNFB v18 freeze (v21 upgrade); cross-machine Podfile.lock churn (#76, untracked from git); redundant Claude Code plugins (#132–135, disabled); stale recovery-api docs (#249–254).

**Newly catalogued:** the **cross-product isolation violation and systematic duplication** (#193–194, #199) — a meeting-geo logic fork, an empty `shared/` package, duplicated `EMAIL_RE` regex (#191), repetitive homegroups admin-check pattern. The referral integration's **five contract mismatches** and **four open decisions** (OPEN-1/2/3/4) are debt deliberately documented and deferred rather than rushed.

The healthiest signal: debt is _written down in memory_ (#193, #200, referral-enablement.md) instead of silently re-discovered.

## 6. Challenges and Debugging Sagas

The **CocoaPods/nanopb saga** is the marquee struggle — 8+ sessions (S7, S11, S19, S21, S24, S25, S29, S36), 5:37 PM to ~10 PM. Two intertwined failures: a hard version incompatibility (Crashlytics' Firebase SDK 11 wants nanopb major 3; Firestore's podspec pins major 2), and a _process/network_ failure where killing a `git clone` didn't cancel the parent pod-install (#33, S10), with BoringSSL-GRPC clones stalling on slow networks (#106). Resolution required both the v21 upgrade _and_ git-transport hardening — extended buffer + low-speed timeout (#34). The two failure modes kept masking each other: fix the network, hit nanopb; resolve nanopb, the next install stalls on BoringSSL.

The second saga is quieter but deeper: the **referral contract mismatch** (S99→S106). What looked like a config bug (_"RECOVERY_API_URL doesn't fix the referral feature"_) unfolded into a five-layer architectural incompatibility plus a missing registry — a dead-end that correctly ended in a _defer_ decision (#326).

## 7. Memory and Continuity

This project cleanly demonstrates claude-mem's value because **the work includes meta-work on memory**. Sessions explicitly handed off state (#258, S96, referral-enablement.md's "resume next session" block), and the codebase-learning chain (S80, S82, S96, #267) is _built on_ persistent memory as shared state. The Hono→Functions-v2 correction (#249–254) shows that a wrong model can live in memory and must be actively rewritten — memory is only as good as its maintenance. The resume audit (#267, ⚖️) — confirming chunks 0–1 done and scheduling 2–12 — is itself a continuity artifact: future sessions start informed instead of re-deriving.

## 8. Token Economics & Memory ROI

| Metric                            | Value                             |
| --------------------------------- | --------------------------------- |
| Observations                      | 156                               |
| Sessions                          | 11                                |
| Total discovery work captured     | **727,458 tokens**                |
| Stored/read footprint (chars ÷ 4) | ~56,130 tokens                    |
| Avg discovery per obs             | 4,663 tokens                      |
| Avg read cost per obs             | 360 tokens                        |
| **Compression ratio**             | **≈13 : 1**                       |
| Date range                        | Jun 6 22:37 → Jun 7 10:56 (~12 h) |

**Type breakdown:** discovery 84 · change 58 · decision 4 · bugfix 4 · refactor 3 · feature 3.

**Daily activity:** Jun 6 — 19 obs / 35,579 discovery-t / 4 sessions · Jun 7 — 137 obs / 691,879 discovery-t / 9 sessions.

**Top 5 highest-value memories** (most expensive to re-derive — the ones memory most protects):

| ID   | Discovery tokens | Title                                                        |
| ---- | ---------------- | ------------------------------------------------------------ |
| #178 | 31,301           | Scheduled Rent Collection (Stripe Payment Intents + Connect) |
| #179 | 31,301           | Subscription Metadata for Multi-House Multi-Guest Billing    |
| #180 | 31,301           | RecoveryConnect (Homegroups) core feature flows + flowcharts |
| #181 | 31,301           | Regroup Web Angular structure + theme-based templating       |
| #182 | 30,408           | Regroup Web deep-link redirect (multi-method app launch)     |

These are the flowchart/architecture passes — the artifacts most painful to reconstruct, and the strongest argument for persistence.

**ROI estimate (model, not measurement):**

- Sessions with context available: 10 (all but the first).
- Passive recall savings ≈ 10 sessions × (50-obs window × 4,663 avg) × 30% relevance ≈ **699K tokens** of re-work avoided (upper-bound; high-value memories re-surface across sessions, so cumulative savings can exceed one-time discovery cost).
- Explicit recall events: ~1 detected; ≈10K tokens.
- Read investment to gain all this: ~56K tokens.
- **Net ROI ≈ (699K + 10K) / 56K ≈ 12.6×.**

The timeline's own banner: **92% savings** — 727K tokens of work retrievable for ~56K of stored memory.

## 9. Timeline Statistics

- **First → last observation:** 2026-06-06 22:37:25 → 2026-06-07 10:56:58 (UTC).
- **Total:** 156 observations, 11 sessions, 50+ session-task records (S-IDs).
- **By type:** 54% discovery, 37% change, the rest decisions/bugfixes/refactors/features.
- **Most active window:** Jun 7 — 137 observations, 9 sessions in a single day.
- **Longest sagas:** CocoaPods/nanopb (8+ sessions); referral contract (S99→S106).

## 10. Lessons and Meta-Observations

1. **On an inherited monorepo, discovery _is_ the work.** 54% of observations are discoveries; the biggest breakthrough (#252) was correcting a wrong mental model, not shipping code.
2. **Dependency conflicts compound — fix the version _and_ the transport.** nanopb needed the v21 upgrade; the install also needed git-transport hardening. Treating only one leaves the wall standing.
3. **Defer with documentation beats forcing with hope.** The referral flow's five mismatches were written down (referral-enablement.md, OPEN-1/2/3/4) and deferred (#326) — the disciplined choice.
4. **Naming is architecture.** A single misplaced display-name→project-id map broke referral code (#375); a three-namespace model (display / project-id / app-id) had to be made explicit before integration could proceed.
5. **Memory hygiene matters as much as memory capture.** The stale Hono model proves unmaintained memory misleads; the resume audit (#267) proves maintained memory compounds.

A new developer reading this timeline would learn: recovery-platform is four independent products mid-consolidation, its hardest problems are at the seams (build toolchain, then cross-product integration), `recovery-api` is the intended-but-unbuilt bus, and the working style is intense bursts punctuated by deliberate memory handoffs.

---

_Next concrete step is the callout at the top: resume the codebase-learning chain at **chunk 2 `detox-recovery` (code pass)**, carrying the referral-flow context forward._
