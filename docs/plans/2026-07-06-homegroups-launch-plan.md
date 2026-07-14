# Homegroups Launch Plan

**Date:** 2026-07-06
**Product:** Homegroups (`recovery-platform/homegroups/`)
**Firebase Project:** `recovery-connect-cad4b`
**Purpose:** Actionable, phased plan from "code-complete" to "live + monetized," built by re-verifying a month-old launch-readiness assessment against current code, git history, and CI health.

---

## Phase 0 — Documentation Discovery (consolidated findings)

### Canonical source of truth

`homegroups/docs/go-to-market/project-management.md` (last_verified 2026-06-10) supersedes both `homegroups/docs/operations/launch-blockers.md` and `pre-launch-checklist.md`. It carries the authoritative ID scheme — **use these IDs, don't invent new ones**:

- **P0 (blocks first paying customer):** HG-P0-1 … HG-P0-11
- **P1 (unblocks revenue beyond first 10 groups):** HG-P1-1 … HG-P1-4
- **P2 (hygiene before 100 groups):** HG-P2-1, HG-P2-2

Code track: **30/30 pre-launch code items (C-1…C-30) done.** What remains is entirely infra, App Store, revenue-activation, and manual validation — no further feature building is required to launch the V1-V4.3 scope.

### What changed since the 2026-06-06 `docs/launch-readiness/homegroups-launch-readiness.md` assessment (verified against current code, 2026-07-06)

| Item                                | 2026-06-06 doc claimed             | Current verified state                                                                                                                                                                                                                                                                                                                                                                                                 |
| ----------------------------------- | ---------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `useSelector` in `renderItem` crash | CRITICAL, unverified               | **FIXED** — shipped in commit `e044fc5` (2026-06-26). `GroupLiteratureBookmarksScreen.tsx` now extracts a `BookmarkRow` component; hook no longer called inside `renderItem`. Confirmed no other instances across 43 files using `renderItem`.                                                                                                                                                                         |
| `mobile/package.json` version       | `0.0.1`                            | **FIXED** — now `1.0.0`.                                                                                                                                                                                                                                                                                                                                                                                               |
| `mobile/package.json` name          | Outdated branding                  | **STILL TRUE** — still `RecoveryConnect`, not renamed to match "Homegroups" branding (cosmetic, non-blocking).                                                                                                                                                                                                                                                                                                         |
| Mobile test coverage                | "only 1 test file"                 | **IMPROVED** — 11 test files now exist (slices, models, 3 screen tests). Still thin on subscription-checkout and election/voting flows.                                                                                                                                                                                                                                                                                |
| App Store ID placeholder            | `id0000000000` in `deepLinks.js:9` | **STILL OPEN** — confirmed unchanged (HG-P0-10).                                                                                                                                                                                                                                                                                                                                                                       |
| App Check enforcement               | Not enforced                       | **STILL OPEN** — zero `appCheck`/`AppCheck` references anywhere in functions or mobile (HG-P2-1, correctly low priority).                                                                                                                                                                                                                                                                                              |
| `notSpamming()`                     | No-op returning `true`             | **STILL OPEN** — unchanged since 2026-05-31, `firestore.rules:98-100` (HG-P2-1).                                                                                                                                                                                                                                                                                                                                       |
| "2 public unauth callables"         | Framed as attack-surface gap       | **DOWNGRADED, not a code fix needed** — a 2026-06-20 investigation (`b1-hardening-handoff.md`) confirmed `getPublicGroupProfile` and `submitPartnershipLead` are _intentionally_ public and already input-hardened (honeypot, regex, truncation). Only residual work is rate limiting (HG-P2-2) and App Check — both deliberately deferred, not urgent.                                                                |
| Stripe default-price gate (R-1/R-2) | Missing Dashboard default price    | **ROOT CAUSE REFINED** — `speed-to-market-plan.md` (2026-06-20) found the actual blocker may be upstream: `STRIPE_PRODUCT_ID_INTERGROUP_A/B` env vars may not even be bound (throws `"Intergroup product not configured"` before the default-price check ever runs). No `.env`/`.env.example` has ever existed in `homegroups/functions` — this can only be confirmed against the live Firebase project, not the repo. |
| Pricing decision                    | Open question ($12 vs $24-36/yr)   | **RESOLVED** — Decision D-1: group price set to $24/year (see `monetization.md`). Does not block shipping; the $12 vs $24-36 debate in the old doc is stale.                                                                                                                                                                                                                                                           |

### New risks found (not in any prior doc)

1. **No confirmed-green CI run exists for `homegroups-functions`.** The root `.github/workflows/ci.yml` (added 2026-06-28) has a blocking typecheck+test job for `homegroups/functions`, but across 20 recorded runs, **zero have succeeded**. Most failed at the workflow-parse level (a bug now fixed by PR #44). The one run that got past parsing (2026-07-04) failed at `npm ci` with `ECONNRESET` — ambiguous whether this is a transient network flake or a real problem, since no successful baseline exists to compare against.
2. **Homegroups has been dormant for 8+ days.** Last commit 2026-06-28, while regroup (1 commit) and detox-recovery (4 commits) absorbed all recent dev attention. The "code track: done" status is a month old and was never re-verified against a green CI run.
3. **No App Store/Play submission tooling exists in-repo** — no `eas.json`, no `fastlane/`. Native version numbers are still at factory defaults: iOS `MARKETING_VERSION 1.0` / build `1`, Android `versionName 1.0` / `versionCode 1`. Submission is a fully manual process — plan time accordingly.

### Sources consulted

- `homegroups/docs/go-to-market/project-management.md` (canonical checklist, IDs)
- `docs/launch-readiness/homegroups-launch-readiness.md` (2026-06-06, market/pricing analysis — still useful, code claims stale)
- `docs/launch-readiness/03-launch-roadmap.md`, `cross-product-launch-roadmap.md`, `speed-to-market-plan.md` (2026-06-20), `b1-hardening-handoff.md` (2026-06-20)
- `docs/STRIPE_CONNECT_GUIDE.md`
- `docs/launch-readiness/TODO.md`
- Direct code reads: `mobile/src/screens/homegroup/GroupLiteratureBookmarksScreen.tsx`, `functions/src/callable/getPublicGroupProfile.ts`, `submitPartnershipLead.ts`, `firestore.rules`, `functions/src/utils/stripe.ts`, `mobile/package.json`, `web/src/lib/deepLinks.js`
- `git log`, `gh run list` for CI/commit history since 2026-06-06

---

## Phase 1 — Re-baseline code health (verification only, ~half day)

Treat "code track: done" as **unconfirmed**, not false, until this closes. Cheap insurance before spending ops time downstream on a codebase that hasn't had a green CI run since its CI existed.

1. Re-run (or re-trigger) the `homegroups-functions` CI job to rule out `ECONNRESET` as a one-off flake.
2. If it fails again on `npm ci`, inspect `homegroups/functions/package-lock.json` for drift — it was touched by a 122-line diff in commit `e044fc5` (2026-06-26).
3. Locally: `cd homegroups/functions && npm ci && npx tsc --noEmit && npm test`.
4. Locally: `cd homegroups/mobile && npx tsc --noEmit`.
5. `npm run test:rules` from `homegroups/` (Firestore rules tests).

**Verification checklist**

- [ ] `homegroups-functions` CI job green on a fresh run
- [ ] Local `tsc --noEmit` clean in both `functions/` and `mobile/`
- [ ] Local test suite green
- [ ] Firestore rules tests green

**Anti-pattern guard:** Don't proceed to Phase 2+ while treating the CI failure as "probably fine." There's no successful run to compare against, and the last real code changes (pricing revision, premium-feature v1s) are exactly the kind of change that could introduce a regression this check would catch.

---

## Phase 2 — Revenue activation (ops, no code) — HG-P0-1, HG-P0-2, HG-P1-1

1. **HG-P0-1 / HG-P0-2:** In the Stripe Dashboard (live mode, homegroups' account), set a default price on both intergroup products (`STRIPE_PRODUCT_ID_INTERGROUP_A` / `_B`, referenced in `functions/src/utils/stripe.ts:17-18`). Confirm target prices against `homegroups/docs/go-to-market/_shared/pricing.md` (may have shifted since the original $99/$249 recommendation).
2. Before or alongside step 1, **verify the product-ID env vars are actually bound** in the deployed Functions environment (`firebase functions:secrets:access` / `functions:config:get` against `recovery-connect-cad4b`) — this can't be confirmed from the repo since no `.env`/`.env.example` has ever existed for `homegroups/functions`.
3. **HG-P1-1:** Open the deployed `/subscribe` page in DevTools → Network and confirm the Stripe publishable key is `pk_live_...`, not `pk_test_...`.

**Verification checklist**

- [ ] `getDefaultPriceForProduct()` resolves without throwing for both intergroup products (test via a live-mode Tier A checkout attempt and an A→B upgrade)
- [ ] `pk_live_` confirmed in the deployed bundle

**Anti-pattern guard:** Don't set only the Dashboard default price and declare this done — there are two independent failure modes (missing env var vs. missing default price) that throw different errors. Check both.

---

## Phase 3 — Infra activation (ops, no code) — HG-P0-5, HG-P0-7, HG-P0-8, HG-P0-9, HG-P0-11

1. **HG-P0-9:** `firebase deploy --only hosting` from `homegroups/`; confirm live pages render.
2. **HG-P0-7:** Firebase Console → Authentication → Settings → Authorized domains — add the deployed hosting domain(s); confirm Google OAuth popup succeeds afterward.
3. **HG-P0-8:** Configure SPF/DKIM for the sending domain, set "From" name to Homegroups; send a test verification email to a real Gmail inbox and confirm it lands outside Spam.
4. **HG-P0-5:** Upload `RATS_API_KEY` to Cloud Secret Manager for `recovery-connect-cad4b`, uncomment its reference in `functions/src/index.ts` `setGlobalOptions`, redeploy. Confirm `getMeetingAttendance` returns 200, not 401. **Before doing this**, check `docs/launch-readiness/recovery-api-meetings-discovery-plan.md` — this callable is the same regroup↔homegroups seam flagged as a cross-product isolation violation (roadmap #15), and an architecture change may be superseding it (routing meeting discovery through recovery-api instead). Confirm this work is still needed before spending time on it.
5. **HG-P0-11:** Send test mail to `privacy@` and `info@` (used on Privacy/Terms pages); confirm delivery.

**Verification checklist**

- [ ] Hosting live, pages render
- [ ] Google OAuth succeeds on deployed domain
- [ ] Test verification email lands in inbox, not spam
- [ ] `getMeetingAttendance` returns 200 (or confirmed obsolete per the recovery-api meetings plan)
- [ ] Both support inboxes receive test mail

---

## Phase 4 — Manual claim-and-pay E2E validation — HG-P0-6

Run only after Phases 2–3 close — this funnel exercises live Stripe keys, auth domains, and email together.

1. Incognito browser, real card: full group-admin claim flow (signup → claim group → Stripe checkout → confirm `isClaimed: true` in Firestore → confirm mobile admin access).
2. Repeat for intergroup Tier A checkout, then the A→B `upgradeIntergroupTier` path.
3. Log every friction point; fix the top 3 before moving to Phase 5.

**Verification checklist**

- [ ] Group claim-and-pay completes with a live card
- [ ] Intergroup Tier A checkout completes
- [ ] Tier A→B upgrade completes; old subscription correctly canceled
- [ ] Friction log written, top 3 items fixed

---

## Phase 5 — App Store submission — HG-P0-3, HG-P0-4, HG-P0-10

**Long pole — start in parallel with Phases 2–4, not after.** Apple review is 1–7 days; rejection resets the clock.

1. Bump native version numbers off factory defaults: iOS `MARKETING_VERSION` / `CURRENT_PROJECT_VERSION` (currently `1.0` / `1`) and Android `versionName` / `versionCode` (currently `1.0` / `1`).
2. Prepare App Store Connect + Google Play Console metadata, screenshots, privacy nutrition labels. Prepare answers for likely health/recovery-category review questions ("facilitates peer support, not medical treatment").
3. Submit iOS build to App Store Connect; submit Android build to Play Console.
4. After iOS approval, replace `id0000000000` in `web/src/lib/deepLinks.js:9` with the real numeric App Store ID (HG-P0-10).
5. There is no `eas.json`/`fastlane` in this repo — confirm the actual build/archive process (Xcode Organizer / Android Studio manual) rather than assuming a scripted pipeline exists.

**Verification checklist**

- [ ] iOS build submitted, in review
- [ ] Android build submitted, in review
- [ ] Version numbers bumped from factory defaults
- [ ] `id0000000000` replaced post-approval

---

## Phase 6 — Pilot validation — HG-P1-3, HG-P1-4

1. Attend 3 intergroup meetings within 2 weeks with a laptop; demo the treasury handoff feature to real GSRs; get at least 1 to walk the claim flow on their own phone.
2. Start 30-group pilot outreach; populate an outreach tracker.

---

## Phase 7 — P2 hygiene (post-launch, not blocking) — HG-P2-1, HG-P2-2

1. **App Check rollout:** install client+server, run monitor-only for ~1 week watching for false positives on legitimate traffic, then flip `enforceAppCheck: true` on Stripe callables only.
2. **Rate limiting** on `getPublicGroupProfile` (e.g. `firebase-functions-rate-limiter`). Note: this callable and `submitPartnershipLead` were confirmed (2026-06-20) to be intentionally public and already input-hardened — this is defense-in-depth, not an urgent gap.
3. Optional cosmetic: rename `mobile/package.json` `name` from `RecoveryConnect` to match current branding (verify no native build scripts key off this name first).
4. **HG-P1-2 custom domain decision** — not launch-blocking; Firebase default hosting works today. If adopted later, coordinate all 9 origin files in one PR (`deepLinks.js` `WEB_ORIGIN`, `createIntergroup.ts` `ALLOWED_REDIRECT_ORIGINS`, `createStripeAccountLink.ts` redirect URLs, etc.).

---

## Final Phase — Verification

1. Confirm every P0 item in `homegroups/docs/go-to-market/project-management.md` moved from `not_started`/`blocked` to a passing `acceptance_check`.
2. Update that file's `last_verified` date and status column as items close — it's the canonical tracker; don't fork a parallel status doc.
3. Re-run the full test suite + rules tests one final time before considering homegroups launched.
4. Confirm resolution of roadmap #15 (cross-product isolation) against `docs/launch-readiness/recovery-api-meetings-discovery-plan.md` — the architecture change there may make the direct regroup→homegroups callable moot, which affects whether HG-P0-5 is still needed as originally scoped.

---

## Anti-patterns to avoid across this plan

- Don't re-derive checklist IDs — `homegroups/docs/go-to-market/project-management.md` is canonical; reference its `HG-P0-*`/`HG-P1-*`/`HG-P2-*` IDs.
- Don't trust `docs/launch-readiness/homegroups-launch-readiness.md` (2026-06-06) at face value for code-state claims — several are now stale (useSelector crash, package.json version, test file count). It's still useful for market/pricing analysis and checklist structure.
- Don't skip Phase 1 — a month-old "done" claim plus zero confirmed-green CI runs plus over a week of dev silence is a specific, checkable risk.
- Don't set Stripe default prices without also verifying the product-ID env vars are bound — two different failure modes, same downstream symptom (checkout throws).
