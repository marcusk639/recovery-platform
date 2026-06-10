# Homegroups Roadmap

**Last updated:** May 2026
**Status:** V4 complete — launch phase. Revenue infrastructure shipped. Focus is manual launch execution + B2B build-out.

---

## Revenue Model

| Metric                          | Target                   |
| ------------------------------- | ------------------------ |
| Price                           | $12/year per group       |
| Trial                           | 7 days free              |
| Break-even                      | ~500 groups ($6K ARR)    |
| Sustainable                     | 2,000+ groups ($24K ARR) |
| Revenue ceiling (consumer only) | ~5,000 groups ($60K ARR) |

Revenue drivers in order: **Conversion** (admins claim and subscribe) → **Retention** (admins renew) → **Expansion** (intergroup, treatment center, Regroup integration).

---

## Feature Status

| Version                        | Theme                        | Status                           |
| ------------------------------ | ---------------------------- | -------------------------------- |
| MVP (v0)                       | Launch ready                 | ✅ Complete                      |
| V1                             | Admin value                  | ✅ Complete                      |
| V2                             | Retention                    | ✅ Complete                      |
| V3                             | Growth                       | ✅ Complete                      |
| V4                             | Platform & scale             | ✅ Complete (commit 34c993d)     |
| V4.1–V4.4 mobile UI            | Feature flags (all `false`)  | 🚩 Hidden — flip flags to enable |
| Revenue gates                  | Subscription enforcement     | ✅ Complete (May 2026)           |
| Trial & renewal notifications  | FCM conversion triggers      | ✅ Complete (May 2026)           |
| Treatment center checkout      | B2B pricing + Stripe         | ✅ Complete (May 2026)           |
| Intergroup upgrade flow        | Tier A → B Stripe checkout   | ✅ Complete (May 2026)           |
| 7th Tradition donation callout | Admin dashboard              | ✅ Complete (May 2026)           |
| Treasury report gate           | Subscription check on export | ✅ Complete (May 2026)           |
| Year-end summary trigger       | November FCM conversion      | ✅ Complete (May 2026)           |
| QR check-in (real code)        | react-native-qrcode-svg      | ✅ Complete (May 2026)           |

---

## Current Launch Phase

### P0 — Do This Week (Manual Actions)

These block real user acquisition. None require code changes.

| Action                                           | Why It Matters                                                                                                                                                                                                                                                                                                                                      |
| ------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Run the claim-and-pay flow end-to-end**        | Nobody has completed the funnel as a real first-time customer. Every friction point you find would have cost a real admin. Open the web app in incognito, pick an unclaimed group, sign in via Google AND email/password, complete Stripe checkout with a real card, verify `isClaimed: true` in Firestore, confirm admin access in the mobile app. |
| **Verify Stripe production key on deployed web** | Open DevTools → Network → filter Stripe. Confirm `pk_live_` not `pk_test_`. If test key is in prod, real payments fail silently.                                                                                                                                                                                                                    |
| **Configure Firebase Auth authorized domains**   | Console → Auth → Authorized Domains. Add `recovery-connect-cad4b.web.app` and `.firebaseapp.com`. Without this, Google OAuth popup closes silently and users can't sign in.                                                                                                                                                                         |
| **Fix Firebase email sender spam issue**         | Console → Auth → Templates → Email verification. Customize the "From" name to "Homegroups". Send a test to Gmail. If it lands in Spam, configure custom sender domain. Verification email in Spam = lost activation.                                                                                                                                |
| **Submit to App Store and Google Play**          | Until submitted, every "Download the app" CTA links to a 404. Placeholder `id0000000000` in `web/src/lib/deepLinks.js:9` must be replaced with the real App Store ID once live. Apple review: 1–7 days.                                                                                                                                             |

### P1 — Next Sprint

#### Code

**Treatment Center Facility Dashboard** — the B2B unlock

The treatment center checkout and pricing tiers are wired to Stripe. What's missing is the facility view that closes the sale: a dashboard showing anonymized alumni engagement (meetings attended, sobriety milestones, sponsorship links formed) for groups affiliated with a treatment center.

Without this dashboard, the sales pitch is theoretical. With it, a case manager can see whether their alumni are showing up at meetings and living stably — the metric every treatment center board cares about.

Files to create/modify:

- New: `web/src/pages/FacilityDashboardPage.js`
- New: Cloud Function to aggregate per-facility engagement signals into `facilities/{facilityId}/alumniEngagement`
- Wire: `affiliateGroupToIntergroup` to populate the facility view
- Auth gate: only users with `facilityId` JWT claim can access

Acceptance criteria:

- Facility admin can see counts of: meetings attended (this week / month), milestone events (30/60/90/180-day), sponsorship links formed — all anonymized
- No individual member data exposed (no names, no chat content)
- Works end-to-end with existing `createIntergroup` + `type: "treatment_center"` checkout flow

Effort: M–L (3–7 days)

**Verify `getMeetingAttendance` is Regroup-callable**

The `getMeetingAttendance` HTTP endpoint exists (`functions/src/http/getMeetingAttendance.ts`) and queries `meetingInstances` by `groupId` + `userId` with bearer-token auth via `RATS_API_KEY`. A composite Firestore index was recently fixed (commit 0b0e88a). Verify it's deployed and confirm with Regroup that it's callable from their environment. If confirmed: this is the data bridge that makes the treatment center integration story credible — Regroup can show per-resident meeting attendance without the full Homegroups UI.

Effort: S (<1 day, verification only)

#### Manual

| Action                                               | Why It Matters                                                                                                                                                                                                                                                                                 |
| ---------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Set Stripe prices for intergroup tier A + tier B** | `productIdIntergroupA` and `productIdIntergroupB` env vars exist; checkout is wired. Without a default price set on each Stripe product, `getDefaultPriceForProduct()` throws at runtime and silently breaks all intergroup checkouts. Suggested: Tier A $99–$149/year, Tier B $199–$249/year. |
| **Attend 3 intergroup meetings in your metro**       | Treasury handoff demo at an in-person intergroup meeting is the highest-leverage distribution action available. Each meeting = 3–5 candidate admin leads.                                                                                                                                      |
| **Run 30-group pilot outreach**                      | Direct outreach to admins you meet at intergroup. Personal email with their group's public page URL. Call every admin who activates in their first week.                                                                                                                                       |

### P2 — Next 60 Days

| Item                                             | Trigger                 | Action                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| ------------------------------------------------ | ----------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Flip `noindex` → `index` on unclaimed groups** | ~100 claimed groups     | One-line change in `web/src/components/GroupPageHead.js`. Unlocks SEO value on 62K+ pre-seeded group pages that are currently invisible to search engines.                                                                                                                                                                                                                                                                             |
| **Custom domain setup (`homegroups-app.com`)**   | Before scaling outreach | Multiple constants must flip together in one PR: `web/src/lib/deepLinks.js` (`WEB_ORIGIN`), `web/src/components/GroupPageHead.js` (`SITE_ORIGIN`), `functions/src/callable/createIntergroup.ts` (`ALLOWED_REDIRECT_ORIGINS`), Firebase Auth authorized domains, iOS associated domains entitlement, Android `assetlinks.json`. See `docs/LAUNCH_BLOCKERS.md` #5 for the complete list.                                                 |
| **Rate limit `getPublicGroupProfile`**           | Meaningful traffic      | Unauthenticated callable; add `firebase-functions-rate-limiter`. Low risk now, medium risk at scale.                                                                                                                                                                                                                                                                                                                                   |
| **App-wide rate limiting (D-34)**                | Pre-launch hygiene      | `firestore.rules` has a `notSpamming()` helper that currently returns `true` — a no-op placeholder. There is **no client-side throttling, no server-side rate limiting on any callable, and no idempotency keys** anywhere in the codebase. Mention this in the public Privacy Policy update (LAUNCH_BLOCKERS D-12 / Privacy refresh). Real rate limiting will need Cloud Functions middleware + per-user keys when traffic justifies. |
| **Evaluate trial-to-paid conversion rate**       | After 30 groups         | If > 30%: scale outreach. If < 30%: fix trial experience before adding features or spending on acquisition.                                                                                                                                                                                                                                                                                                                            |

### P3 — Backlog

- **SEO-friendly group URL slugs** — replace SHA hash URLs with `city-group-name` format. Valuable at 1,000+ groups.
- **iOS App Store Review optimization** — monitor for rejection patterns; first rejection resets the clock.
- **`getPublicGroupProfile` caching** — reduce Firestore reads for high-traffic public pages.

### What NOT to Build During Launch

Per strategic consensus across all docs:

- Intergroup governance/analytics features — no customer to use them yet (V4 features hidden behind flags by design)
- Elections, bylaws ratification, group health dashboards — deferred post-launch
- Analytics features — no historical data to analyze yet
- Paid acquisition — only after organic trial-to-paid conversion is validated > 30%

---

## 90-Day Success Criteria

| Week | Goal                                                                                                   |
| ---- | ------------------------------------------------------------------------------------------------------ |
| 1–2  | Complete all P0 manual actions. Run claim-and-pay flow. Stripe key verified. App Store submitted.      |
| 2–4  | Attend 3 intergroup meetings. Set intergroup Stripe prices. Build treatment center facility dashboard. |
| 4–8  | 30 groups in trial. Call every activating admin in week 1 of their trial.                              |
| 8–12 | Evaluate conversion rate. > 30%: scale outreach. < 30%: fix trial experience before adding features.   |

---

## Recovery Ecosystem Roadmap (12-Month)

Homegroups is Product 1 in a three-product recovery ecosystem. The consumer subscription ($12/year) is the wedge. B2B treatment center revenue ($300–$1K/month per facility) is the business. The ecosystem plan sequences work across products to maximize revenue while building toward the flywheel.

```
Homegroups (now)
  ├─ P0: Manual launch blockers
  ├─ P1: Treatment center facility dashboard  ──────────────────────┐
  └─ P1: Verify getMeetingAttendance callable  ────────────────────┤
                                                                   │
                                         Enables B2B sales pitch:
                                         integration IS the demo
                                                                   ↓
rats-v2 / Regroup (Months 2–5)
  ├─ Sprint 1: Resident intake, billing automation, drug testing
  ├─ Sprint 2: Phase tracking, accountability scoring, multi-house analytics
  └─ Sprint 3: Oxford House complete, public directory, treatment center referral portal
                                                                   ↓
Oxford Pilot (Month 6)
  └─ Free tier for individual Oxford Houses; chapter premium ($200–500/month)
                                                                   ↓
Aftercare Management System (Month 8)
  ├─ New product: Next.js, GCP Cloud Run, PostgreSQL (HIPAA BAA)
  ├─ Treatment center onboarding → sober living referral → meeting assignment
  └─ Reads from: Homegroups meetingInstances, rats-v2 directory API
                                                                   ↓
Enterprise Sales Push (Month 10)
  └─ 3–5 paying treatment centers at $800–$3K/month
     ← Requires: facility dashboard + getMeetingAttendance + rats-v2 Sprint 1
```

### Integration Bridges Already Built (Homegroups Side)

| Bridge                                             | Status               | Enables                                                         |
| -------------------------------------------------- | -------------------- | --------------------------------------------------------------- |
| `getMeetingAttendance` HTTP endpoint               | Likely done — verify | Regroup meeting compliance tracking; treatment center outcome data |
| `createIntergroup` with `type: "treatment_center"` | ✅ Done              | Treatment center checkout and onboarding                        |
| `checkInToMeeting` callable                        | ✅ Done              | Meeting attendance data that Regroup can mirror                    |
| `affiliateGroupToIntergroup`                       | ✅ Done              | Groups appear in treatment center facility view                 |
| Intergroup upgrade flow (Tier A → B)               | ✅ Done              | Oxford chapter billing                                          |
| `configureSSO` callable                            | ✅ Done              | Enterprise SSO for treatment center accounts                    |

### Revenue Timeline

| Month | Source          | Event                                            | Est. MRR               |
| ----- | --------------- | ------------------------------------------------ | ---------------------- |
| 1–2   | Homegroups | First $12/year groups (beta)                     | ~$10–50                |
| 1–2   | rats-v2         | Existing operators                               | ~$100–200              |
| 3     | rats-v2         | Price increase for new operators                 | ~$200–500              |
| 4–6   | rats-v2         | 10–20 paying operators                           | ~$1,000–2,500          |
| 6+    | Oxford          | Free drives adoption; chapters at $200–500/month | ~$500–1,500            |
| 10    | Aftercare       | First treatment centers ($800–3K/month)          | ~$2,000–5,000          |
| 12    | Combined        | Target                                           | **~$5,000–10,000 MRR** |

---

## Risk Factors

| Risk                                | Mitigation                                                                                                                              |
| ----------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| Slow admin acquisition              | GSR network outreach; treasury handoff demo at intergroup meetings                                                                      |
| High churn after trial              | Improve trial education; Day 5 push notification (live), 7-day renewal reminder (live)                                                  |
| Revenue ceiling at $12/group        | Treatment center tier ($300–$1K/month) — highest ARPU path; activated by facility dashboard                                             |
| App Store rejection                 | Maintain strict content policies; WebView Stripe checkout requires legal review                                                         |
| Competition emerges                 | Move fast on B2B; community data moat from treasury ledger                                                                              |
| Intergroup checkout silently broken | Stripe prices not set on intergroup products — manual action required before any intergroup marketing                                   |
| HIPAA complexity (Aftercare)        | Scoped to Aftercare only; 12-step and sober living don't handle PHI; budget $15–30K for HIPAA audit before Aftercare goes to production |

---

## Code Health

> Initial audit: 2026-05-25. Re-verified: 2026-05-26 after 20+ PRs merged. Full findings: `.audit/doc-code-discrepancies.md` · `.audit/layer-mobile-components.md` (components) · `.audit/layer-mobile-homegroup-screens.md` (homegroup screens)
>
> **24 of 35 audit discrepancies resolved as of 2026-05-26.** 11 remain open.

### Open Audit Issues — Critical (Launch-Blocking)

| ID   | Issue                                                             | File / Path                                  | Action Required                                                                                              |
| ---- | ----------------------------------------------------------------- | -------------------------------------------- | ------------------------------------------------------------------------------------------------------------ |
| D-11 | About page ships fictional founder bios (James Wilson, etc.)      | `web/src/pages/AboutPage.js:379–393`         | Replace with real content or remove team section. FTC risk. Blocks any public marketing.                     |
| D-12 | Privacy + Terms pages dated Jan 2023, placeholder address         | `PrivacyPage.js`, `TermsPage.js`             | Rewrite to reflect actual data flows (Stripe, FCM, DMs, intergroup). Add to `LAUNCH_BLOCKERS.md`.            |
| D-1  | V4.4 Enterprise mobile UI is feature-flagged off and undocumented | `featureFlags.ts:25`, `AppNavigator.tsx:153` | Add explicit "V4.4 mobile is disabled" note to docs so stakeholders don't overestimate enterprise readiness. |

### Open Audit Issues — Significant (Pre-Scale)

| ID   | Issue                                                     | File / Path      | Notes                                                            |
| ---- | --------------------------------------------------------- | ---------------- | ---------------------------------------------------------------- |
| D-13 | Subscription gating: only 4 of 67 homegroup screens gated | Multiple screens | Product decision — document intended gating perimeter explicitly |
| D-13 | Subscription gating: only 4 of 67 homegroup screens gated | Multiple screens | Product decision — document intended gating perimeter explicitly |

### ✅ Resolved Audit Issues (2026-05-26)

| ID         | What was fixed                                                                   | How                                                                                                                     |
| ---------- | -------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------- |
| D-2        | `sendAnnouncementNotification` had no auth check                                 | Auth + admin-membership check added                                                                                     |
| D-3        | `getAnonymizedName` leaked last character, not initial                           | Rewrote to return `"First L."` correctly                                                                                |
| D-4        | Contact form submitted nowhere, logged PII                                       | Replaced with `mailto:` link                                                                                            |
| D-5        | `onTransactionWrite` non-idempotent on retry                                     | Idempotency record added                                                                                                |
| D-6        | `onMilestoneWrite` double-counted on retry                                       | Idempotency key + try/catch added                                                                                       |
| D-7        | TreasurerHandoff collectionGroup index misconfigured                             | Firestore index corrected                                                                                               |
| D-8        | `exportUserData` queried wrong DM collection                                     | Fixed to `direct_message_threads`                                                                                       |
| D-9        | `generateTreasuryReport` allowed any member to download                          | Admin/treasurer check added to callable                                                                                 |
| D-10       | Two invite callables ignored `region` config (v1 bug)                            | All 90 callables migrated to v2                                                                                         |
| D-18       | Treatment center `name` field wrote user email                                   | Field now requires user-provided facility name                                                                          |
| D-27       | HttpsError leaked internal error details to clients                              | v2 migration sweep dropped 3-arg `HttpsError`                                                                           |
| D-14, DC-2 | Counts in CLAUDE.md/ARCHITECTURE.md wrong                                        | Corrected with code-derived counts                                                                                      |
| D-15–17    | `.full-review` stale findings (Regroup index, treatment center 404, SDK mismatch)   | Annotated + all callables migrated to v2                                                                                |
| D-19, D-20 | Stripe key + domain constants underdocumented                                    | `LAUNCH_BLOCKERS.md` updated                                                                                            |
| D-28       | `RATS_API_KEY` missing from env table                                            | `BILLING_AND_PAYMENTS.md` env table updated                                                                             |
| D-30       | Forgot-password scope incorrect in LAUNCH_BLOCKERS                               | Corrected to mobile modal only                                                                                          |
| D-31, DC-3 | PR review prompts contradicted on sobriety privacy                               | Both files updated to `=== true` opt-in                                                                                 |
| D-32, DC-5 | CONTRIBUTING.md claimed non-existent CI                                          | Updated to describe actual CI workflows                                                                                 |
| D-33       | Money-back guarantee badge removal not marked DONE                               | `plans/README.md` updated                                                                                               |
| D-34       | `notSpamming()` no-op not noted in ROADMAP                                       | ROADMAP + LAUNCH_BLOCKERS updated                                                                                       |
| D-35       | App Check gap undocumented                                                       | `CLAUDE.md` + `LAUNCH_BLOCKERS.md` updated                                                                              |
| DC-1       | Deep-link scheme inventory missing                                               | `docs/deep-linking.md` updated                                                                                          |
| DC-4       | `prudentReserve` canonical location unclear                                      | `CLAUDE.md` + `PR_REVIEW_CONTEXT.md` updated                                                                            |
| U-1–U-9    | 9 undocumented features had no doc coverage                                      | All documented in `BILLING_AND_PAYMENTS.md`, `SECURITY_RULES.md`, `ARCHITECTURE.md`, `CLAUDE.md`                        |
| D-22       | `handleAssignWinner` two non-atomic Firestore writes                             | Replaced two sequential `await` writes with a single `WriteBatch` in `ElectionDetailScreen.tsx`                         |
| D-23       | Stripe PM ID logged in production                                                | Wrapped `console.log` in `__DEV__` guard in `CreateGroupScreen.tsx`                                                     |
| D-24       | `onGroupAdminUpdate` trigger purpose unclear                                     | Intentionally disabled; block comment in `index.ts` explains why (dangerous auto-subscription + duplicate isAdmin sync) |
| D-25       | `onServicePositionWrite` used `Timestamp.now()` in `arrayUnion` (non-idempotent) | Replaced with `Timestamp.fromDate(new Date(context.timestamp))` — deterministic on retry                                |
| D-26       | `onMeetingUpdate` fire-and-forget batch commits                                  | Tracked via `Promise.allSettled`; failures now logged                                                                   |
| D-29       | Treatment center pricing fan-in undocumented                                     | "Pricing-to-product mapping" section added to `BILLING_AND_PAYMENTS.md`                                                 |

---

### Launch-Blocking Code Issues (still open)

Two issues in `mobile/src/components/` block real revenue and must be resolved before scaling user acquisition:

| Issue                                              | File                                  | Action Required                                                                                                       |
| -------------------------------------------------- | ------------------------------------- | --------------------------------------------------------------------------------------------------------------------- |
| `PAYMENT_BASE_URL` is a TODO placeholder           | `payments/SubscriptionWebView.tsx:37` | Replace with the live Stripe checkout URL. If unset, no user can complete a subscription purchase.                    |
| `JOIN_BASE_URL` hardcoded to `homegroups.app/join` | `invites/InviteShareSheet.tsx:34`     | Replace with reference to `WEB_ORIGIN` from `web/src/lib/deepLinks.js`. Breaks on domain change (LAUNCH_BLOCKERS #5). |

### High-Priority Code Bugs (still open)

| Issue                                                 | File                                           | Notes                                                          |
| ----------------------------------------------------- | ---------------------------------------------- | -------------------------------------------------------------- |
| Stale closure: GPS location passes empty place name   | `groups/LocationPicker.tsx:168`                | `placeName` state read before flush after async `setPlaceName` |
| Double network request on location select             | `onboarding/GroupSearchOnboarding.tsx:151,154` | `searchByLocation` called twice                                |
| Trial banner upgrade button invisible on urgent state | `subscription/TrialStatusBanner.tsx:81,86`     | Text is `#2196F3` on red background — contrast failure         |

### Design System Debt

Two theme systems coexist. Consolidation target: migrate all components to `theme/theme.ts`.

- Currently on old theme: `LoadingIndicator`, `SocialSignInButton`
- Hardcoding colors (not on any theme): `LoadingOverlay`, `ReportContentModal`, `TrialStatusBanner`, `AnniversaryCard`, `AdminValuePropSlide`

### Duplication to Resolve

- REACTIONS array: `chat/MessageBubble.tsx:24` + `chat/ReactionPicker.tsx:5` + `screens/homegroup/GroupChatScreen.tsx:70` — extract to `chat/constants.ts` (3 definitions, all must be kept in sync)
- Admin features list: `onboarding/AdminValuePropSlide.tsx:24` + `payments/AdminValuePropModal.tsx:42` — extract to `payments/adminFeatures.ts`
- `chat/UnreadBadge` (boolean dot) vs `common/UnreadBadge` (numeric count) — rename to `UnreadDot` and `UnreadCountBadge`

### Component Placement Issues

- `chat/ChatMediaPickerScreen.tsx` — a full navigation screen living in `components/`; move to `screens/`
- `onboarding/GroupSearchOnboarding.tsx` — ~580 lines; split search logic from onboarding shell

### Web App Backlog

Deferred enhancements surfaced by the 2026-05-25 audit, ordered by impact:

| Item                                     | Source             | Action                                                                                                                                                                                                                                                                                                     | Notes                                                                                                                                                                                           |
| ---------------------------------------- | ------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Wire `ContactPage.js` to a real callable | Audit D-4 Option A | Add `submitContactRequest` Cloud Function callable that writes to a `contactRequests` Firestore collection. Update `web/src/pages/ContactPage.js` to call it from a real form. Add admin-only Firestore rule for `contactRequests`. Consider mobile parity (a `ContactSupportScreen` or in-app help link). | Currently a `mailto:` CTA (shipped 2026-05-25). Upgrade when inbound volume justifies CRM ergonomics — server-side capture enables routing, deduping, and reply-tracking that `mailto:` cannot. |

---

### Homegroup Screens Issues

> Full audit: `.audit/layer-mobile-homegroup-screens.md` — 67 screens (~40,500 lines)

| Severity | Issue                                                                  | File                                                      |
| -------- | ---------------------------------------------------------------------- | --------------------------------------------------------- |
| CRITICAL | `useSelector` inside `renderItem` — illegal hook call, runtime crash   | `screens/homegroup/GroupLiteratureBookmarksScreen.tsx:49` |
| HIGH     | Direct Firestore write with no Redux update — treasury list goes stale | `screens/homegroup/AddTransactionScreen.tsx`              |
| HIGH     | Notifications toggle is a stub (no Firebase write)                     | `screens/homegroup/GroupChatInfoScreen.tsx`               |
| HIGH     | Fake pull-to-refresh (setTimeout, no data fetch)                       | `screens/homegroup/SecretaryToolkitScreen.tsx`            |
| HIGH     | Dead Stripe imports (`CardForm`, `useStripe`)                          | `screens/homegroup/CreateGroupScreen.tsx:38-39`           |
| HIGH     | `handleAssignWinner` — two non-atomic Firestore writes                 | `screens/homegroup/ElectionDetailScreen.tsx:185-199`      |

**Patterns to resolve across 67 homegroup screens:**

- 14 screens do direct Firestore reads instead of using Redux slices
- 4 screens use `isAdmin` local-state anti-pattern
- 8 screens use `console.error` in catch blocks (use `logError` instead)
- 3 screens call `Dimensions.get('window').width` at module level (won't update on rotation)
- `moment.js` used in 3 screens (standardize on `date-fns`)
- `GroupOverviewScreen.tsx` is 2,522 lines — God Screen requiring decomposition

---

## Key Docs

| Document                                                    | Purpose                                                                       |
| ----------------------------------------------------------- | ----------------------------------------------------------------------------- |
| `docs/REVENUE_OPPORTUNITIES.md`                             | Actionable revenue backlog with completion status                             |
| `docs/LAUNCH_BLOCKERS.md`                                   | Manual actions blocking growth — with exact steps                             |
| `docs/BUSINESS_MODEL.md`                                    | Pricing, projections, break-even                                              |
| `docs/MARKET_INTELLIGENCE.md`                               | Market size, competitive landscape, 3-year projections                        |
| `docs/03-integration-treatment-centers.md`                  | B2B sales narrative, pricing, objection handling                              |
| `docs/plans/2026-04-13-recovery-ecosystem-12-month-plan.md` | Full 12-month cross-product implementation plan                               |
| `docs/BILLING_AND_PAYMENTS.md`                              | Stripe integration — technical detail                                         |
| `.audit/layer-mobile-components.md`                         | Components audit — bugs, duplication, design system gaps (2026-05-25)         |
| `.audit/layer-mobile-homegroup-screens.md`                  | Homegroup screens audit — 67 files, bugs, patterns, code quality (2026-05-25) |
