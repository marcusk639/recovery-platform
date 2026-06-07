# Cross-Product Launch Roadmap (Homegroups + Regroup)

**Date:** 2026-06-06
**Scope:** Sequenced, LLM-executable plan covering the full spec backlogs of both
[homegroups-launch-readiness.md](./homegroups-launch-readiness.md) (HG-SPEC-01–10) and
[regroup-launch-readiness.md](./regroup-launch-readiness.md) (RG-SPEC-01–12).
**Execution model:** Each phase is self-contained and meant to be run in its own chat context.
Read the phase's "Documentation references" first, do the work, then run the "Verification checklist"
before moving on.

> **How to use this file:** Phases are dependency-ordered. Do not start a phase until the prior
> phase's verification checklist passes. Decision gates in Phase 0 unblock everything downstream —
> resolve them first. Every code anchor below was verified against the working tree on 2026-06-06;
> `path:line` references are real as of that date — re-confirm with `get_symbols_overview` /
> `find_symbol` before editing, since line numbers drift.

---

## Phase 0 — Verified Re-Baseline & Decision Gates (blocks everything)

**Goal:** Correct the source-doc inaccuracies discovered during verification and resolve the
business decisions that gate all downstream code and ops work. This phase is cheap (mostly
decisions + small edits) but unblocks Phases 1–8.

### 0.0 Decisions resolved (2026-06-06)

- **D-1:** Homegroups group price = **$24/year**. Intergroup A/B = $99/$249; treatment-center A/B = $199/$499.
- **D-5:** Regroup rent platform fee = **keep 2%** (no code change; `payments.ts:152` unchanged — documented as intentional).
- **D-6:** Error tracking = **keep Sentry**; remove Crashlytics from Regroup mobile in Phase 6 (native build change — needs `pod install` + Android build to validate).
- **Stripe creation = dry-run first:** build + validate in TEST mode (Phase 1a) before any live objects.
- **DONE:** `homegroups/mobile/package.json` and `regroup/mobile/package.json` versions bumped `0.0.1 → 1.0.0`.
- **Still open:** D-2 (separate TC product or reuse intergroup?), D-3 (confirm RG prices), D-4 (secret vs env), D-7 (domain), D-8 (Angular), D-9 (migration).

### 0.1 Re-baseline corrections (apply to the source readiness docs as you learn more)

These claims in the readiness docs were **disproven** by code verification. Treat the corrected
reality as ground truth:

| Source claim                                                     | Reality (verified)                                                                                                                                                                  | Affects    |
| ---------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------- |
| Regroup: "platform fee not implemented" / "2.5%"                 | `application_fee_amount` **already set at 2%** — `regroup/functions/src/callable/payments.ts:152,164` (`Math.round(amount * 0.02)`)                                                 | RG-SPEC-05 |
| Regroup: "bundle discount criteria undefined"                    | Criteria **defined** — `regroup/functions/src/api/stripe.ts:38-42` (`getBundleCoupon`: 3+ → `bundle3`, 5+ → `bundle5`)                                                              | RG-SPEC-11 |
| Homegroups: "only `App.test.tsx` in mobile"                      | **11 mobile test files** exist incl. `GroupTreasuryScreen.test.tsx`, `GroupOverviewScreen.test.tsx`, `groupsSlice.test.ts`, `transactionsSlice.test.ts`                             | HG-SPEC-03 |
| Homegroups: HG-SPEC-09 assumed Remote Config available           | `@react-native-firebase/remote-config` **not installed** in `homegroups/mobile/package.json`                                                                                        | HG-SPEC-09 |
| Regroup: "iOS bundle `com.rats.dev`, Android needs verification" | Android `applicationId` is already production: `com.regroup.app` — `regroup/mobile/android/app/build.gradle:100`. Only **iOS** (`com.rats.dev`, `project.pbxproj:732`) needs change | RG-SPEC-03 |

### 0.2 Decision gates (resolve before Phase 1)

Each decision has a recommended default. Record the chosen value inline in this file.

| Gate | Decision                                                     | Recommended default                                                                                              | Unblocks               |
| ---- | ------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------- | ---------------------- |
| D-1  | Homegroups group price: $12 vs $24 vs $36 /year              | **$24/year** (2× current, still trivial)                                                                         | HG-SPEC-01, HG-SPEC-05 |
| D-2  | Homegroups intergroup A / B / treatment-center prices        | A=$99, B=$249, TC-A=$199, TC-B=$499 /year                                                                        | HG-SPEC-01             |
| D-3  | Regroup: confirm 6 tier prices match code config             | 69/129/249 (Trad), 49/89/299 (Oxford) — matches `config.ts:37-78`                                                | RG-SPEC-01             |
| D-4  | Regroup price IDs: `process.env` vs `defineSecret()`         | **`defineSecret()`** for consistency with the other 7 secrets (`config.ts:19-35`)                                | RG-SPEC-01             |
| D-5  | Regroup rent platform fee rate: keep 2% or move to 2.5%      | **Keep 2%** (already shipped to 5 live houses; changing it is a customer-facing repricing)                       | RG-SPEC-05             |
| D-6  | Regroup error tracking: Sentry vs Crashlytics                | **Sentry** (richer; Crashlytics is the redundant one to remove)                                                  | RG-SPEC-10             |
| D-7  | Homegroups custom domain `homegroups-app.com` before launch? | **Defer** — `ALLOWED_REDIRECT_ORIGINS` already lists it (`createIntergroup.ts:90-97`); launch on Firebase domain | HG-SPEC-04             |
| D-8  | Regroup Angular 9 web: keep for launch vs replace            | **Keep for launch**, schedule rewrite post-revenue (most operators are mobile)                                   | RG-SPEC-06             |
| D-9  | Regroup existing-5-house migration approach                  | **Grandfather 6 months**, then migrate; personal outreach                                                        | RG-SPEC-04             |

### Verification checklist (Phase 0)

- [ ] All 9 decision gates have a recorded value in this file.
- [ ] Section 0.1 corrections acknowledged by anyone executing later phases.
- [ ] No code changed in this phase except optional doc edits.

### Anti-pattern guards

- Do **not** "implement the platform fee" — it exists. Only revisit the rate per D-5.
- Do **not** treat HG mobile tests as greenfield — extend the existing 11 files.

---

## Phase 1 — Stripe Revenue Activation (P0, both products)

**Goal:** Create the Stripe products/prices that are referenced by code but missing in the
Dashboard, wire the IDs into config, and bump release versions. This is the single highest-leverage
phase — both products currently fail checkout silently when these prices are unset.

**Spec items:** HG-SPEC-01 (price half), HG-SPEC-10, RG-SPEC-01.

### Phase 1a — TEST-mode dry run (do FIRST, per decision; gate before any live object)

Goal: prove price resolution + checkout work against Stripe **TEST** objects before touching live money.

1. In each product's Stripe account, switch to **Test mode** (two separate accounts: homegroups → `recovery-connect-cad4b`, regroup → `phoenix-cleanhouse`).
2. Create test products + prices:
   - **Homegroups:** group **$24/yr annual**, intergroup **A $99/yr**, **B $249/yr** — set each product's **default price**.
   - **Regroup:** 6 monthly tier prices matching `config.ts:37-78` (69/129/249 Traditional; 49/89/299 Oxford).
3. Wire the TEST IDs: Homegroups already supports test mode via `isTestMode` / `STRIPE_TEST_PRODUCT_ID_*` (`functions/src/utils/stripe.ts:17-34`). For Regroup, set the 6 `STRIPE_PRICE_*` as test env values for the emulator run.
4. Run `firebase emulators:start` and invoke the checkout callables with Stripe test card `4242 4242 4242 4242`:
   - HG: `createGroupSubscription` / `createGroupWithSubscription`, then `createIntergroup` (Tier A) + `upgradeIntergroupTier` (A→B).
   - RG: `createOperatorSubscription` (one Traditional + one Oxford), then a rent `createPaymentIntent` (assert 2% `application_fee_amount`).
5. Verify each: `getDefaultPriceForProduct()` returns a price (no `"has no default price set"` throw), a Checkout Session/PaymentIntent is created, and the webhook updates Firestore.

**Gate before live (Phase 1b):**

- [ ] Every checkout path succeeds in TEST mode.
- [ ] No `getDefaultPriceForProduct()` throw in logs.
- [ ] Webhook → Firestore state confirmed for success + failure.

Only after this gate passes: replicate the same products/prices in **Live mode**, set default prices, upload live IDs to Secret Manager, do the D-4 `defineSecret` wiring for Regroup, and deploy. Then proceed to Phase 2 with a real card.

### Documentation references (verified anchors)

- Homegroups runtime price resolution: `homegroups/functions/src/utils/stripe.ts:157-181`
  — `getDefaultPriceForProduct()` throws `"Product ${productId} has no default price set"` (`:168`)
  when a product has no default price. This is the silent-failure root cause.
- Homegroups product env vars: `homegroups/functions/src/utils/stripe.ts:14,17-34`
  (`STRIPE_PRODUCT_ID_GROUP`, `STRIPE_PRODUCT_ID_INTERGROUP_A`, `STRIPE_PRODUCT_ID_INTERGROUP_B`).
- Homegroups version/name: `homegroups/mobile/package.json:2-3` (`"RecoveryConnect"`, `"0.0.1"`).
- Regroup tier config: `regroup/functions/src/config.ts:37-78` — 6 tiers, each with `priceEnvVar`.
- Regroup price lookup at checkout: `regroup/functions/src/callable/subscriptions.ts:194`
  (`process.env[tierConfig.priceEnvVar]`).
- Regroup secrets pattern to copy for D-4: `regroup/functions/src/config.ts:19-35` (`defineSecret(...)`).

### What to do

**Homegroups**

1. In the Stripe Dashboard (live mode), for each of `productIdGroup`, `productIdIntergroupA`,
   `productIdIntergroupB` (and treatment-center if a separate product): create an **annual** price
   at the D-1/D-2 values and **set it as the product's default price**. (Default-price requirement is
   enforced by `getDefaultPriceForProduct()` — see anchor above.)
2. Confirm the product IDs in Secret Manager / env match `STRIPE_PRODUCT_ID_*`.
3. HG-SPEC-10: bump `homegroups/mobile/package.json` `version` `0.0.1` → `1.0.0`.

**Regroup** 4. Create 6 Stripe **Products** with monthly **Prices** at the D-3 values. 5. Per D-4: add `defineSecret()` entries for the 6 `STRIPE_PRICE_*` names in `config.ts` (copy the
pattern at `config.ts:19-35`), and attach them to the subscription callable's `secrets: [...]`
array. Upload the 6 Price IDs to Secret Manager. 6. Bump `regroup/mobile/package.json` `version` `0.0.1` → `1.0.0`. 7. Deploy functions for both products (`/deploy-functions` skill in homegroups).

### Verification checklist (Phase 1)

- [ ] Each Homegroups product has a default price (Stripe Dashboard → Product → "Default price" set).
- [ ] `getDefaultPriceForProduct()` succeeds for every product (no throw in function logs).
- [ ] All 6 Regroup `STRIPE_PRICE_*` resolve to non-empty Price IDs at runtime.
- [ ] `firebase functions:secrets:access` (or equivalent) shows all 6 Regroup price secrets present.
- [ ] Both `package.json` versions read `1.0.0`.
- [ ] Functions deployed without error in both projects.

### Anti-pattern guards

- Never hardcode Stripe **price** IDs in source — they are resolved at runtime by design.
- Do not conflate product IDs (`prod_…`) with price IDs (`price_…`); Homegroups stores both
  distinctly (`stripeProductIdGroup` vs `stripePriceIdGroup`).
- Homegroups group price **must be annual** — `assertGroupPriceIsAnnual()` rejects non-yearly.

---

## Phase 2 — End-to-End Payment Validation (P0, both products)

**Goal:** Prove a real card flows through every checkout path. No revenue path ships unvalidated.

**Spec items:** HG-SPEC-01 (validation half), RG-SPEC-02; plus infra items I-1, I-5 (HG).

### Documentation references

- Homegroups callables: `createIntergroup` (`homegroups/functions/src/callable/createIntergroup.ts:47`),
  `upgradeIntergroupTier` (`.../upgradeIntergroupTier.ts:100`), redirect allow-list
  (`createIntergroup.ts:90-97`).
- Regroup callables: `createOperatorSubscription` (`regroup/functions/src/callable/subscriptions.ts:156`),
  rent `createPaymentIntent` (`regroup/functions/src/callable/payments.ts:92-174`),
  billing portal (`subscriptions.ts:589`), webhook (`regroup/functions/src/webhooks/stripeWebhook.ts`).

### What to do

1. **HG I-5:** verify the deployed publishable key is `pk_live_` (DevTools/network), not `pk_test_`.
2. **HG I-1:** incognito, real card — run group claim-and-pay end to end; then intergroup Tier A
   checkout and an A→B `upgradeIntergroupTier`. Confirm Firestore + webhook state.
3. **RG:** run `createOperatorSubscription` for at least one Traditional and one Oxford tier with a
   real card; complete Stripe Connect onboarding; then a resident rent `createPaymentIntent` →
   confirm the 2% `application_fee_amount` lands and webhook updates Firestore.
4. Exercise failure + dispute webhooks (Stripe test triggers acceptable for these branches).
5. Document every friction point; fix the top 3 before Phase 3.

### Verification checklist (Phase 2)

- [ ] Homegroups: group + intergroup A + A→B upgrade all complete with a live card.
- [ ] Regroup: 2 subscription tiers + 1 rent payment complete; payout reaches the Connect account.
- [ ] `application_fee_amount` observed on the rent payment intent (2%).
- [ ] `payment_failed` and `dispute.created` webhook branches observed updating Firestore.
- [ ] Friction log written; top 3 fixes landed.

### Anti-pattern guards

- Do not validate against the emulator only — this phase requires **live** Stripe.
- Do not skip the upgrade path; tier upgrade cancels the old subscription and is error-prone.

---

## Phase 3 — Build Config, Branding & App Store Submission (P0)

**Goal:** Get both apps submittable and submitted. Apple review is the long pole (1–7 days).

**Spec items:** HG-SPEC-02, HG-SPEC-10 (finalize), RG-SPEC-03.

### Documentation references

- Homegroups brand: `homegroups/mobile/package.json:2` (`name: "RecoveryConnect"` — outdated),
  App Store placeholder `homegroups/web/src/lib/deepLinks.js:9` (`id0000000000`, has `// TODO: real ID`).
- Regroup iOS bundle: `regroup/mobile/ios/rats.xcodeproj/project.pbxproj:732` (`com.rats.dev`).
- Regroup Android (already production, no change): `regroup/mobile/android/app/build.gradle:100`
  (`com.regroup.app`).

### What to do

1. **RG-SPEC-03:** change iOS bundle ID from `com.rats.dev` to production (e.g. `com.regroup.app`
   to match Android, or `com.recoveryconnect.rats`); regenerate the provisioning profile. iOS-only —
   Android is already correct.
2. **HG-SPEC-02:** assemble App Store + Play metadata, screenshots, privacy nutrition labels;
   prepare health/recovery-category review answers (peer support, not medical treatment).
3. Submit Homegroups iOS + Android; submit Regroup iOS + Android.
4. **A-3 / deepLinks:** after Homegroups iOS approval, replace `id0000000000` in `deepLinks.js:9`
   with the real App Store ID.
5. Optional brand cleanup: `homegroups/mobile/package.json` `name` → `Homegroups` (verify no native
   build scripts depend on `RecoveryConnect` before changing).

### Verification checklist (Phase 3)

- [ ] iOS builds archive with the new Regroup bundle ID + valid provisioning profile.
- [ ] Both apps submitted to App Store Connect and Play Console (status: In Review).
- [ ] `deepLinks.js:9` real ID task tracked (resolves post-approval).

### Anti-pattern guards

- Changing the iOS bundle ID invalidates the old provisioning profile — regenerate, don't force-build.
- Do not rename `package.json:name` without checking iOS/Android native references first.

---

## Phase 4 — Revenue Completeness & Customer Migration (P1)

**Goal:** Reconcile already-shipped revenue code with strategy, and migrate the 5 live Regroup houses.

**Spec items:** RG-SPEC-05 (now a reconcile, not a build), RG-SPEC-11 (now a verify), RG-SPEC-04,
HG-SPEC-04 (per D-7), HG-SPEC-05 (finalize per D-1/D-2).

### Documentation references

- Regroup fee (exists): `regroup/functions/src/callable/payments.ts:152,164` — `amount * 0.02`.
- Regroup bundle coupons (exist): `regroup/functions/src/api/stripe.ts:38-42` (`getBundleCoupon`),
  applied via `applyBundleDiscountToSubscription` (`api/stripe.ts:239-251`).
- Homegroups domain allow-list (already includes target): `createIntergroup.ts:90-97`; 9-file domain
  list in `homegroups/docs/LAUNCH_BLOCKERS.md` #5.

### What to do

1. **RG-SPEC-05:** confirm the live fee rate against D-5. If keeping 2%, only document it. If moving
   to 2.5%, change the multiplier at `payments.ts:152` and treat as a customer-facing repricing.
2. **RG-SPEC-11:** verify the `bundle3` / `bundle5` coupon IDs in `api/stripe.ts` actually exist in
   the Stripe Dashboard; document the criteria (no code needed unless a coupon is missing).
3. **RG-SPEC-04:** build the 5-house migration per D-9 — grandfather window, a migration callable
   or manual Stripe update, and the operator email. Personal outreach to each of the 5.
4. **HG-SPEC-04 (D-7 = defer):** record the 9-file domain-switch checklist as a post-launch task;
   confirm no domain change is needed to launch.
5. **HG-SPEC-05:** finalize the price values from D-1/D-2 (already created in Phase 1); write the
   one-page pricing decision rationale.

### Verification checklist (Phase 4)

- [ ] Fee rate decision (D-5) reflected in code+docs; logs show the chosen rate on a live payment.
- [ ] `bundle3`/`bundle5` coupons confirmed present in Stripe (or created).
- [ ] Migration mechanism tested on one grandfathered test customer.
- [ ] Each of the 5 houses contacted; migration timeline recorded.

### Anti-pattern guards

- Do not re-implement the fee or the bundle logic — both exist; this phase verifies/adjusts only.
- Do not silently reprice the 5 live houses — communication precedes any Stripe change.

---

## Phase 5 — Test Coverage Hardening (P1)

**Goal:** Raise automated coverage on the highest-risk flows, extending what already exists.

**Spec items:** HG-SPEC-03 (re-baselined), RG-SPEC-02 (automation layer).

### Documentation references

- Homegroups existing mobile tests (extend, don't recreate): `homegroups/mobile/src/__tests__/`
  (`GroupTreasuryScreen.test.tsx`, `GroupOverviewScreen.test.tsx`, `GroupAnnouncementsScreen.test.tsx`),
  `src/store/slices/__tests__/` (`groupsSlice`, `membersSlice`, `transactionsSlice`),
  `src/models/__tests__/` (`MemberModel`, `DirectMessageModel`). Firebase mocked in `jest.setup.js`.
- Regroup integration tests to extend: the 5 existing integration suites noted in the readiness doc.

### What to do

1. **HG-SPEC-03:** the 5 target flows — Treasury CRUD already has a screen test; **gaps** are: group
   admin onboarding→checkout→claim, invite share-sheet deep-link generation, sobriety milestone
   recording, election/voting. Write tests for the 4 uncovered flows; extend Treasury.
2. **RG-SPEC-02:** convert the Phase-2 manual payment walkthrough into automated integration tests
   (subscription create, rent intent with fee assertion, webhook handler branches).

### Verification checklist (Phase 5)

- [ ] 4 new Homegroups mobile flow tests added and green; Treasury extended.
- [ ] Regroup payment/webhook integration tests added and green.
- [ ] CI (`ci.yml`) runs the new tests as a blocking gate.

### Anti-pattern guards

- Extend the existing 11 HG test files / 5 RG integration suites — do not start a parallel structure.
- Mock Firebase via the existing `jest.setup.js`; do not introduce a second mock strategy.

---

## Phase 6 — Cross-Product Consistency & Tech Debt (P2–P3)

**Goal:** Reduce divergence and close small hardening gaps now that revenue paths are live.

**Spec items:** RG-SPEC-12, RG-SPEC-10, RG-SPEC-11 (doc), HG-SPEC-09, HG-SPEC-06.

### Documentation references

- API version drift: HG `homegroups/functions/src/utils/stripe.ts:132` (`2025-12-15.clover`) vs
  RG `regroup/functions/src/util/stripe.ts:11` (`2026-01-28.clover`).
- Stripe client patterns (intentionally different): HG Proxy (`utils/stripe.ts:138-142`) vs RG factory
  (`util/stripe.ts:9-12`).
- HG Remote Config prerequisite: `@react-native-firebase/remote-config` **absent** from
  `homegroups/mobile/package.json` — must be added before HG-SPEC-09.
- RG dual error tracking: `@react-native-firebase/crashlytics ^17.3.1` + `@sentry/react-native ^7.12.0`.

### What to do

1. **RG-SPEC-12:** align Stripe API versions. Pick one (newer `2026-01-28.clover` is reasonable),
   update the other, and re-test webhook payload handling on the changed side.
2. **RG-SPEC-10 (D-6 = Sentry):** remove Crashlytics from Regroup mobile; keep Sentry. Verify no
   remaining Crashlytics calls.
3. **HG-SPEC-09:** add `@react-native-firebase/remote-config` (the missing prereq), then move the
   V4.4 hardcoded flags to Remote Config with safe defaults (`false`).
4. **HG-SPEC-06:** App Check 5-step rollout per `homegroups/docs/LAUNCH_BLOCKERS.md` (post-launch).
5. **RG-SPEC-11:** finalize bundle-discount documentation (criteria already verified in Phase 4).

### Verification checklist (Phase 6)

- [ ] Both products use the same Stripe API version; webhooks still pass tests.
- [ ] Regroup builds with only Sentry; no Crashlytics imports remain.
- [ ] `remote-config` installed in Homegroups; flags read from Remote Config with `false` defaults.
- [ ] App Check rollout plan tracked (enforcement staged, not flipped blindly).

### Anti-pattern guards

- Do **not** unify the Proxy vs factory Stripe client patterns — both are correct and intentional;
  only the API version needs alignment.
- Do not enable App Check enforcement on Stripe callables without the staged rollout (locks out users).

---

## Phase 7 — Modernization (P2, large efforts — schedule post-launch)

**Goal:** Pay down framework debt once revenue is flowing. These are large; sequence after launch.

**Spec items:** RG-SPEC-06, RG-SPEC-08, HG-SPEC-07, HG-SPEC-08.

### Documentation references

- RG Angular: `regroup/web/package.json` `@angular/core: ~9.1.0` (EOL).
- RG React Native: `regroup/mobile/package.json` RN `^0.72.0`.
- HG web is CRA (client-rendered) — OG tags unrenderable without SSR/prerender; 62K scraped group
  pages need a sitemap generator (Cloud Function).

### What to do

1. **RG-SPEC-06 (D-8 = keep then replace):** scope a minimal Next.js/React replacement for the
   billing portal + marketing pages; keep Angular 9 running until the replacement ships.
2. **RG-SPEC-08:** plan RN 0.72 → 0.74+ upgrade (Fabric/Hermes); execute on a branch with full E2E.
3. **HG-SPEC-07:** add SSR or a prerender proxy for OG/social previews on shared group links.
4. **HG-SPEC-08:** Cloud Function sitemap generator for the 62K group pages; flip `noindex` when ready.

### Verification checklist (Phase 7)

- [ ] Angular replacement scoped with an explicit cutover plan (no big-bang).
- [ ] RN upgrade branch passes E2E on iOS + Android before merge.
- [ ] OG previews render for a shared group link (validator screenshot).
- [ ] Sitemap served; search console accepts it.

### Anti-pattern guards

- No big-bang Angular cutover — run old + new in parallel until verified.
- Do not flip `noindex` on group pages until SSR/OG + sitemap are live.

---

## Phase 8 — Go-to-Market Enablement (P1–P2)

**Goal:** Equip the Oxford-House niche and compliance-driven buyers.

**Spec items:** RG-SPEC-07, RG-SPEC-09.

### What to do

1. **RG-SPEC-07:** Oxford House market-entry playbook — messaging on EES/voting/officer-terms
   (the verified defensible niche), 30-day Standard-tier trial offer, local outreach list.
2. **RG-SPEC-09:** compliance report export for drug-court programs, built on the already-captured
   activity + drug-testing data.

### Verification checklist (Phase 8)

- [ ] Playbook reviewed; first outreach batch sent.
- [ ] Compliance export produces a court-acceptable artifact from real house data.

### Anti-pattern guards

- Do not launch the Oxford **Network** tier until a regional chapter is signed (per readiness §5.5).

---

## Phase 9 — Final Verification

**Goal:** Prove the whole roadmap landed and nothing regressed.

### What to do

1. Re-run the Phase-1 and Phase-2 checklists on production: every checkout resolves a default price;
   a live card completes each path.
2. Grep guards:
   - No `pk_test_` in deployed Homegroups bundle.
   - No hardcoded Stripe `price_` IDs in source (both products).
   - No Crashlytics imports remaining in Regroup mobile.
   - No `id0000000000` placeholder remaining in `homegroups/web/src/lib/deepLinks.js` (post-approval).
3. Confirm both `package.json` versions are `1.0.0`+ and both apps are live in the stores.
4. Confirm Stripe API versions match across products.

### Final verification checklist

- [ ] All P0 items (HG-SPEC-01,02,10; RG-SPEC-01,02,03,04) complete and verified live.
- [ ] All decision gates (D-1…D-9) resolved and reflected in code/docs.
- [ ] Grep guards return clean.
- [ ] Both apps approved and downloadable; first real customer transacted on each.

---

## Appendix — Spec item → phase index

| Spec       | Title                                 | Phase   | Status note                                |
| ---------- | ------------------------------------- | ------- | ------------------------------------------ |
| HG-SPEC-01 | Stripe price activation + e2e payment | 1 + 2   |                                            |
| HG-SPEC-02 | App Store submission                  | 3       |                                            |
| HG-SPEC-03 | Mobile test coverage                  | 5       | Re-baselined: 11 tests already exist       |
| HG-SPEC-04 | Custom domain migration               | 4       | Deferred per D-7; allow-list already ready |
| HG-SPEC-05 | Pricing decision                      | 0 + 4   | D-1/D-2                                    |
| HG-SPEC-06 | App Check rollout                     | 6       | Post-launch                                |
| HG-SPEC-07 | OG meta / social preview              | 7       |                                            |
| HG-SPEC-08 | Sitemap generator                     | 7       |                                            |
| HG-SPEC-09 | Remote Config flags                   | 6       | Needs dep install first                    |
| HG-SPEC-10 | Version bump                          | 1 + 3   |                                            |
| RG-SPEC-01 | 6-tier Stripe price creation          | 1       | D-4 secret approach                        |
| RG-SPEC-02 | E2E payment test plan                 | 2 + 5   |                                            |
| RG-SPEC-03 | iOS bundle ID                         | 3       | iOS-only; Android already prod             |
| RG-SPEC-04 | Existing customer migration           | 4       | D-9                                        |
| RG-SPEC-05 | Platform fee                          | 0 + 4   | Already 2%; reconcile only                 |
| RG-SPEC-06 | Angular replacement                   | 7       | D-8                                        |
| RG-SPEC-07 | Oxford House playbook                 | 8       |                                            |
| RG-SPEC-08 | RN upgrade                            | 7       |                                            |
| RG-SPEC-09 | Compliance export                     | 8       |                                            |
| RG-SPEC-10 | Error tracking consolidation          | 6       | D-6 = Sentry                               |
| RG-SPEC-11 | Bundle discount criteria              | 0 + 4/6 | Already defined; verify only               |
| RG-SPEC-12 | Stripe API version alignment          | 6       |                                            |
