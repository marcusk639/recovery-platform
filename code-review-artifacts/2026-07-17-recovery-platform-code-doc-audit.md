# Code-Doc Audit — recovery-platform (whole monorepo)

**Date:** 2026-07-17
**Mode:** `--report-only` (artifact only; no doc files modified)
**Scope:** All products — `recovery-api/`, `homegroups/functions/`, `homegroups/mobile/`, `regroup/functions/`, `regroup/web/` + `regroup/mobile/`, `detox-recovery/`
**Method:** Code walked as ground truth; docs (CLAUDE.md tree, per-product `docs/`, READMEs, `.claude/rules/`) cross-referenced against behavioral profiles. One audit agent per product surface.
**Direction of audit:** "Do the docs accurately describe what the code does?" (companion to `doc-code-audit`, which asks the reverse.)

---

## Summary

| Product surface      | 🔴 Wrong | 🟡 Stale | 📄 Undocumented | ✅ Accurate |
| -------------------- | :------: | :------: | :-------------: | :---------: |
| recovery-api         |    3     |    0     |        7        |      7      |
| homegroups/functions |    1     |    0     |        2        |     13      |
| homegroups/mobile    |    4     |    2     |        4        |     11      |
| regroup/functions    |    6     |    1     |        5        |      7      |
| regroup/web + mobile |    3     |    2     |        5        |     14      |
| detox-recovery       |    6     |    5     |        1        |      7      |
| **Total**            |  **23**  |  **10**  |     **24**      |   **59**    |

**Headline:** `regroup/functions/CLAUDE.md` and `detox-recovery` docs carry the most material drift (6 Wrong each). `homegroups/functions` is the cleanest (post-#48/#49). Across the monorepo, the dominant failure mode is **directory/path descriptions in CLAUDE.md architecture trees pointing at files that moved or never existed**, plus **stale payment-provider framing in detox-recovery** (docs still say Stripe where code migrated to Lemon Squeezy).

**Action taken on every finding below:** Flagged, no changes made (report-only mode). 🟡 Stale findings are never auto-applied in any mode.

---

## 🔴 Wrong — doc materially misdescribes the code (23)

### recovery-api (3)

1. **`getUserProfile` "by UID" is misleading — takes no UID param.**
   - code: `recovery-api/src/callable/users.ts:14-22,38` — derives `docId = ${context.appId}:${context.uid}` from the authenticated caller; no data param; returns caller's _own_ profile.
   - doc: root `CLAUDE.md:43` — "`getUserProfile` — fetch a user profile by UID".
   - Fix direction: reword to "fetch the calling user's own profile" (no target-UID argument).

2. **`refreshDirectory` scheduled function presented as inactive scaffold.**
   - code: `recovery-api/src/triggers/refreshDirectory.ts:236` — `onSchedule('every day 03:00', …)`, re-exported at `src/index.ts:9`; deployed and active (nightly directory refresh/prune).
   - doc: `recovery-api/CLAUDE.md:39` — "triggers/ onUserWrite (Phase 2 scaffold — inactive)".
   - Fix direction: document the live `refreshDirectory` schedule; `onUserWrite` is correctly noted as commented-out.

3. **Referrals described as HTTP `POST /api/referrals` — no such route.**
   - code: `recovery-api/src/callable/referrals.ts:97-119` — `createReferral`/`getReferrals`/`getReferral` are `onCall` callables; the only `onRequest` is `health` (`src/http/health.ts:9`).
   - doc: root `CLAUDE.md:49,64` — "`POST /api/referrals`". The `:64` Shared-Vocabulary line states it as the _current_ mechanism.
   - Fix direction: describe as callable functions (the Integration Map header already says "callable functions"; the vocabulary line contradicts it).

### homegroups/functions (1)

4. **HTTP-function enumeration omits a deployed public endpoint.**
   - code: `homegroups/functions/src/index.ts:132` exports `googlePlacesProxy` — an `onRequest` v2 HTTP function (`src/http/googlePlacesProxy.ts:47`, Google Maps proxy keyed by `GOOGLE_MAPS_API_KEY`).
   - doc: `homegroups/functions/CLAUDE.md:25-29` and `homegroups/CLAUDE.md` present the `src/http/` set as exhaustive — only `getMeetingAttendance` + `stripeWebhook`/`stripeConnectWebhook`.
   - Fix direction: add `googlePlacesProxy` to the http/ list in both docs.

### homegroups/mobile (4)

5. **Nonexistent navigators named.**
   - code: `homegroups/mobile/src/navigation/` — only AppNavigator, AuthNavigator, GroupStackNavigator, IntergroupNavigator, MainTabNavigator, MessagesNavigator, ProfileNavigator.
   - doc: `homegroups/mobile/CLAUDE.md:34` lists "`GroupNavigator`, `GroupStackNavigator`, `GroupTabNavigator`". `GroupNavigator` and `GroupTabNavigator` do not exist (grep: zero refs).

6. **`AppNavigator → AuthNavigator` branch is dead.**
   - code: `homegroups/mobile/src/navigation/AppNavigator.tsx:12,148-159` — imports `AuthNavigator` but never renders it; screens are `Onboarding`, `Main` (MainTabNavigator), flag-gated `Intergroup`.
   - doc: `homegroups/mobile/CLAUDE.md:34` — "`AppNavigator` → `AuthNavigator` or `MainTabNavigator`". (Matches known "dead AuthNavigator" memory note.)

7. **`DirectMessage.sentAt` rule points at wrong file.**
   - code: number-typed `sentAt` lives in `src/types/index.ts:606` (`interface DirectMessage { sentAt: number }`); in `src/types/schema.ts:8,509` the field is a Firestore `Timestamp` (the opposite).
   - doc: `homegroups/mobile/CLAUDE.md:39-40` — "`sentAt` … is a Unix timestamp (`number`) … Defined in `src/types/schema.ts`". Substance right, file pointer wrong.

8. **FacilityDashboard callable list overstated.**
   - code: `homegroups/mobile/src/screens/intergroup/FacilityDashboardScreen.tsx:39,65` — calls only `getFacilityStats` + `exportFacilityComplianceReport`.
   - doc: `homegroups/mobile/CLAUDE.md:60` — adds `getFacilityEngagementMetrics`, which is not called anywhere in `src/` (grep: zero hits).

### regroup/functions (6)

9. **Stripe webhook file path wrong.**
   - code: `regroup/functions/src/webhooks/stripeWebhook.ts:1002` — `stripeWebhook` (deployed as `stripeEvents`).
   - doc: `regroup/functions/CLAUDE.md:51,126` — claims `http/stripeWebhook.ts`. Both the tree and the Webhook-security section point at a nonexistent path.

10. **`http/index.ts` listed but absent.**
    - code: `regroup/functions/src/http/` contains only `universal.ts` + `stripeConnect.ts`.
    - doc: `regroup/functions/CLAUDE.md:50` — lists `http/index.ts`. No such file.

11. **`universal.ts` — wrong dir and wrong purpose.**
    - code: `regroup/functions/src/http/universal.ts:12` — catch-all `onRequest` health check (`/health`→200 else 404).
    - doc: `regroup/functions/CLAUDE.md:57` — `webhooks/universal.ts — Angular SSR handler (serves the web app)`. Wrong directory and it serves no web app.

12. **`stripeConnect.ts` — wrong dir and wrong kind.**
    - code: `regroup/functions/src/http/stripeConnect.ts:41,108` — `stripeConnectReauth`/`stripeConnectReturn`, `onRequest` OAuth redirect handlers.
    - doc: `regroup/functions/CLAUDE.md:48` — `triggers/stripeConnect.ts — Stripe Connect account event triggers`. It is an HTTP handler, not a trigger, not under `triggers/`.

13. **`.env.example` said not to exist.**
    - code: `regroup/functions/.env.example` exists (4594 bytes; the billing runbook at line 26 also references it).
    - doc: `regroup/functions/CLAUDE.md:136` — "There is no `functions/.env.example`."

14. **`auth.ts` mischaracterized.**
    - code: `regroup/functions/src/callable/auth.ts:51-330` — custom-claims/authorization callables (`addGuestAuthorization`, `addAdminAuthorization`, `deleteAdminAuthorization`, `promoteGuestsToAdmin`, `removePrivilegesForGuests`, `verifyUserEmail`, `givePotentialSuperAdminPrivilege`).
    - doc: `regroup/functions/CLAUDE.md:36` — "Auth callables (login helpers, token refresh)". No login helpers or token-refresh callables exist.

### regroup/web + regroup/mobile (3)

15. **Slice count/names wrong.**
    - code: `regroup/mobile/src/state/slices/` — 10 slices (admin, auth, chat, guests, houses, meetings, notifications, setup, theme, user); `store.ts` registers 10 reducers.
    - doc: `regroup/mobile/.claude/rules/architecture.md:17-19` — claims "12 slices" incl. `uiSlice` + `navigationSlice`, neither of which exists.

16. **Service file misnamed.**
    - code: `regroup/mobile/src/services/invitations.ts`.
    - doc: `regroup/mobile/.claude/rules/architecture.md:80` — names it `invites.ts`.

17. **Maestro flow dir path wrong.**
    - code: `regroup/mobile/maestro/flows/` (package.json `maestro:ios` → `maestro/flows/`).
    - doc: `regroup/mobile/.claude/rules/testing.md:53,59` — points at `.maestro/flows/` (dot-prefixed); no `.maestro/` exists. The example `maestro test .maestro/flows/auth/01-login.yaml` would fail.

### detox-recovery (6)

18. **PDF payment env vars documented as Stripe, code uses Lemon Squeezy.**
    - code: `detox-recovery/lib/products-data.ts:27-68` — CTAs read `NEXT_PUBLIC_LEMONSQUEEZY_*_URL`.
    - doc: `detox-recovery/README.md:86-90` — lists five `NEXT_PUBLIC_STRIPE_*_URL` PDF vars that don't exist in code.

19. **Stack line omits Lemon Squeezy.**
    - code: PDFs sold via Lemon Squeezy (`products-data.ts:27-68`).
    - doc: `detox-recovery/README.md:64` — "Payments: Stripe Payment Links" (only). Omits the actual digital-product processor.

20. **Support-call price stale.**
    - code: `detox-recovery/lib/services-data.ts:33` — `"$75"`.
    - doc: `detox-recovery/README.md:85` — "support call ($50)".

21. **Referral triggers undercount.**
    - code: `detox-recovery/app/api/contact/route.ts:28-33,140` — `INTEREST_TO_APP` fires referrals for three interests incl. `"Withdrawal Coaching Support" → "Next Step Recovery"`.
    - doc: `detox-recovery/docs/technical/api.md:55` & `CLAUDE.md:119` — list only `"Sober Living / Housing"` and `"12-Step / Homegroup Support"`.

22. **Known-interests list incomplete.**
    - code: `detox-recovery/app/api/contact/route.ts:24` — `KNOWN_INTERESTS` includes `"Withdrawal Coaching Support"` (10 values).
    - doc: `detox-recovery/docs/technical/api.md:29-37` — omits it (9 values).

23. **PDF "availability: coming-soon" gating claim false.**
    - code: `detox-recovery/lib/products-data.ts` — no `PRODUCTS` entry sets `availability`; coming-soon gating lives on `SERVICE_TIERS.status` (services-data.ts).
    - doc: `detox-recovery/CLAUDE.md:62` — "The 5 paid PDFs are currently gated this way [availability: coming-soon]". No PDF product is gated.

---

## 🟡 Stale — doc references code/paths that no longer exist (10)

_Never auto-applied in any mode — manual action required._

### regroup/functions (1)

- **`triggers/rtdb/` "Realtime Database triggers"** — `regroup/functions/CLAUDE.md:47`. Directory holds only `.gitkeep`; zero RTDB triggers implemented.

### homegroups/mobile (2)

- **`homegroups/mobile/README.md`** — unmodified React Native community-CLI template; documents none of the actual app. `homegroups/CLAUDE.md` Key-Docs table implies it holds "Feature breakdown, data model, architecture overview" (fits the product-root README, not this one).
- **`homegroups/mobile/maestro/README.md:23-27`** — persona/flow table omits existing flows `registration-signup.yaml` and `smoke-app-boot.yaml`. (CI-CLOUD-SETUP.md does mention registration-signup — the two maestro docs are internally inconsistent.)

### regroup/web + mobile (2)

- **`e2e/tests/` cited as E2E location** — `regroup/mobile/.claude/rules/testing.md:71`. Subdir doesn't exist; artifacts live in `e2e/` and `e2e/setup/`.
- **`npm run test:integration` / `test:rules` presented as working** — `regroup/mobile/.claude/rules/testing.md:34`. Their config files (`jest.config.integration.js`, `jest.config.rules.js`) are absent; `regroup/mobile/CLAUDE.md:15` correctly flags both BROKEN — the rules file is out of sync with its own parent CLAUDE.md.

### detox-recovery (5)

- **`README.md` doc links** (`:56,67,95,141-147`) reference `docs/api.md`, `docs/architecture.md`, `docs/environment.md`, `docs/deployment.md`, `docs/features.md`. Real files live under `docs/technical/` and `docs/operations/`; `environment.md` and `features.md` don't exist. Predates the docs reorg.
- **`CLAUDE.md` internal paths** (`:64,98,122`) — `docs/manual-tasks/…`, `docs/api.md`, `docs/architecture.md`. Real paths are `docs/operations/manual-tasks/…` and `docs/technical/…`.
- **`CLAUDE.md:110-115`** cites `financial-model-master-2026-05-24.md`, `roadmap-2026-05-24.md` in `docs/`. Actual files are under `docs/_archive/` with different names.
- **`docs/technical/pdf-delivery.md:3,9`** — Status "implementation pending"; describes Stripe Payment Links + `NEXT_PUBLIC_STRIPE_*` table. Superseded — Lemon Squeezy is already implemented in `products-data.ts`.
- **`docs/operations/deployment.md:74`** public-vars list omits the now-live `NEXT_PUBLIC_LEMONSQUEEZY_*` URLs.

---

## 📄 Undocumented — public/deployed surface no doc mentions (24)

### recovery-api (7)

- `refreshDirectory` scheduled fn + helpers `refreshSlice`/`pruneStale`/`computeSlice` (see Wrong #2).
- `GOOGLE_MAPS_API_KEY` secret (`src/config.ts:20`) — arch tree lists only `RECOVERY_PLATFORM_API_KEY`.
- `entities/DirectoryMeeting.ts` — `recovery-api/CLAUDE.md:34` lists only `User.ts`, `Referral.ts`.
- Meeting-directory ingestion pipeline (`src/lib/meetings/**`: `fetchAAMeetings`, `fetchCelebrateRecoveryMeetings`, `mapNaMeeting`, `geocode`/`reverseGeocode`/`getTimezone`, `ingestGridCell`/`gridCells`).
- `findMeetings` **side effect**: fire-and-forget audit write to `directoryMeetingRequests` (hashed uid + coarsened lat/lng) — `src/callable/findMeetings.ts:110-138`; docs describe it as a pure read.
- `X-User-Email` header (`src/middleware/auth.ts:54`) — accepted (optional), omitted from root auth-model line (`CLAUDE.md:47`); `recovery-api/CLAUDE.md:46-48` does mention it.
- Migration/seed scripts `runMigration`/`runSeed` + `hashUid` (`src/scripts/*`, `src/lib/hash.ts`).

### homegroups/functions (2)

- `src/http/googlePlacesProxy.ts` — deployed HTTP endpoint (root of Wrong #4).
- `src/migrations/migrateGeohashes.ts` — only `.ts` in `src/migrations/`, yet the co-located `README.md` documents an unrelated migration.

### homegroups/mobile (4)

- `src/store/slices/referralSlice.ts` — cross-product referral state; not in mobile CLAUDE.md architecture.
- `src/services/activityTracker.ts`, `src/services/reports/` — service modules not mentioned.
- `maestro/flows/smoke-app-boot.yaml` — new smoke flow (untracked in git), documented nowhere.
- Feature slices `brandingSlice`, `engagementSlice`, `groupHealthSlice`, `stepWorkSlice`, `reflectionsSlice`, `literatureSlice` — real domains not enumerated (doc gives a count only; low priority).

### regroup/functions (5)

- `scheduled/index.ts` exports `weeklyTransfers`, `updateDisputes`, `warmWebsite` — inline `onSchedule` fns omitted from the `scheduled/` tree.
- `handleStripeConnectWebhook` (`webhooks/stripeWebhook.ts:1198`) — second Connect webhook (secret `STRIPE_CONNECT_WEBHOOK_SECRET`), not in the tree.
- `stripeConnectReauth`/`stripeConnectReturn` HTTP endpoints — no mention anywhere.
- Firestore triggers in `triggers/firestore/index.ts` (`notify`, `notifyNewHouseCreated`, `sendContactEmail`, `sendSubscriptionUpdateEmail`, `reportBug`, `submitFeedback`, `onGuestWrite`, `notifyOperatorOnApplication`) — covered only by a generic label.
- Deployed-name remap `stripeWebhook` → `stripeEvents` documented only in code comments.

### regroup/web + mobile (5)

- `mobile/src/services/debug-deep-links.ts`, `native-deep-links.ts`, `password.ts` — not in architecture.md service table.
- `mobile/src/state/queries/useFlushOfflineQueue.ts` — not in React Query table.
- `mobile/src/services/notifications/handler.ts` + `service.ts` — only `rentReminder.ts` documented.
- `web/src/app/services/beta.service.ts` (`BetaService`) — absent from web/CLAUDE.md "Key Services".

### detox-recovery (1)

- `middleware.ts:9-10,51` — edge Layer-1 rate limiter (contact 5/min, subscribe 10/min); documented in `docs/technical/api.md:126-145` but not in CLAUDE.md's "Security pipeline" section. Minor.

---

## ✅ Accurate — verified doc and code agree (59, spot-checked)

- **recovery-api (7):** `createReferral`, `getReferrals`, `getReferral` ownership check, `updateUserProfile` merge-upsert, `findMeetings` geohash query, `health`, `config/apps.ts` conventions + Phase-1/2 auth model.
- **homegroups/functions (13):** callable count 91, 17 active + 2 commented Firestore triggers, 14 pub/sub crons + 1 legacy + 1 auth trigger, dual Stripe webhook export, Bearer-token `getMeetingAttendance`, Stripe product-id exports, **admin-claim in-transaction write-ordering (post-#48)**, facility-callable `adminUids` gating, `onMemberWrite` claims byte-limit, `createIntergroup` tier limits + redirect allow-list, `upgradeIntergroupTier` server-side adminUids read, unauthenticated `getPublicGroupProfile`/`submitPartnershipLead`.
- **homegroups/mobile (11):** 15 models, 26 slices, RN 0.72.9, React Navigation v6 + screens 3.37 + Stripe RN 0.45, QR deep-link scheme, `meetingInstances`/`checkInToMeeting`, commands, `jest.setup.js`, Detox `e2e/`, CI `homegroups-maestro-smoke`, `config.yaml continueOnFailure`.
- **regroup/functions (7):** cents-in-logic vs dollars-in-`payments`-doc split, unpinned `STRIPE_API_VERSION`, tier-gated `complianceExport`/`rentRoiMetrics`, `multiProperty` gate, invitations callables, webhook signature verification, billing-runbook path refs.
- **regroup/web + mobile (14):** RN 0.72 / RTK 2.8 / React Navigation 7 / React Query / Angular ~9.1 versions, two web Cloud Functions (`universal` SSR + `warmWebsite` per-minute), 6 theme dirs, 8 web callables, 18 React Query files + oxford subdir, Firestore rules location, Crashlytics zero-call-sites.
- **detox-recovery (7):** middleware rate limits, origin allow-list + honeypot silent-drop, contact validation limits, "PDF delivery: Lemon Squeezy (not Stripe)" line in CLAUDE.md, monetization.md provider split (incl. $50→$75 note), API route table, referral env-gated/inactive dispatch.

---

## Recommended remediation order

1. **detox-recovery payment docs (Wrong #18-20, Stale pdf-delivery.md)** — highest external-consequence drift; README + pdf-delivery.md still frame the product as Stripe-based when Lemon Squeezy is live. Contradicts CLAUDE.md, which is already correct.
2. **regroup/functions/CLAUDE.md architecture tree (Wrong #9-14)** — six wrong file paths/kinds in one doc; a developer navigating by it lands on nonexistent files.
3. **recovery-api root-CLAUDE.md referrals + getUserProfile framing (Wrong #1,3)** — cross-product integration doc; the `POST /api/referrals` phrasing could mislead an integrator into building against a nonexistent REST route.
4. **homegroups/mobile navigators + callable list (Wrong #5-8)** — remove ghost navigators and the uncalled `getFacilityEngagementMetrics`.
5. **googlePlacesProxy undocumented HTTP endpoints** (homegroups + regroup) — add to http/ enumerations.
6. **detox-recovery doc-path reorg drift (Stale ×5)** — mechanical path fixes after the `docs/` reorg.

> To apply fixes: re-run `/code-doc-audit --auto-update` (rewrites 🔴 Wrong only; leaves 🟡 Stale for manual action) or `--interactive` to approve each edit. This run made no changes.
