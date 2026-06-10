# Pre-Launch Checklist

**Last updated:** 2026-05-28  
**Owner:** Marcus  
**Status key:** ✅ Done · 🔲 Not started · ⚠️ Blocked · 🔁 In progress

See [`docs/LAUNCH_BLOCKERS.md`](./LAUNCH_BLOCKERS.md) for full detail on every manual item below.

---

## 1. Code — Must Ship Before Any Marketing

| #    | Item                                                                                              | Status | Detail                                                                                                          |
| ---- | ------------------------------------------------------------------------------------------------- | ------ | --------------------------------------------------------------------------------------------------------------- |
| C-1  | Stripe key guard (`SubscribePage.js` throws on missing/placeholder key)                           | ✅     | commit `eba048a`                                                                                                |
| C-2  | Mobile `PAYMENT_BASE_URL` points to deployed Firebase origin                                      | ✅     | `SubscriptionWebView.tsx:37` — commit `eba048a`                                                                 |
| C-3  | Forgot-password mobile nav wired to `ForgotPasswordScreen`                                        | ✅     | `LoginScreen.tsx` — commit `eba048a`                                                                            |
| C-4  | `console.log` Stripe PM ID wrapped in `__DEV__` (D-23)                                            | ✅     | `CreateGroupScreen.tsx:537` — commit `2ee0cfa`                                                                  |
| C-5  | `onMeetingUpdate` batch commits tracked via `Promise.allSettled` (D-26)                           | ✅     | `onMeetingUpdate.ts` — commit `2ee0cfa`                                                                         |
| C-6  | Fictional founder bios removed from `/about` (D-11)                                               | ✅     | `AboutPage.js` + 4 tests                                                                                        |
| C-7  | Privacy/Terms pages: real address + date (D-12)                                                   | ✅     | `PrivacyPage.js`, `TermsPage.js` + 6 tests                                                                      |
| C-8  | V4.4 feature flags documented as `false` (D-1)                                                    | ✅     | `ROADMAP.md`, `02-recoveryconnect-homegroups.md`                                                                |
| C-9  | `onServicePositionWrite` uses `context.timestamp` in `arrayUnion` — idempotent on retry (D-25)    | ✅     | `onServicePositionWrite.ts:58` — 2026-05-27                                                                     |
| C-10 | Election winner assignment uses atomic `WriteBatch` (D-22)                                        | ✅     | `ElectionDetailScreen.tsx` — 2026-05-27                                                                         |
| C-11 | `onGroupAdminUpdate` disabled with explanatory comment (D-24)                                     | ✅     | `functions/src/index.ts:144` — 2026-05-27                                                                       |
| C-12 | Treatment center pricing fan-in documented (D-29)                                                 | ✅     | `BILLING_AND_PAYMENTS.md` — 2026-05-27                                                                          |
| C-13 | All 16 mobile TypeScript production errors resolved                                               | ✅     | `tsc --noEmit` exits 0 — 2026-05-27                                                                             |
| C-14 | Test files excluded from `mobile/tsconfig.json` `tsc` check                                       | ✅     | `mobile/tsconfig.json` — 2026-05-27                                                                             |
| C-15 | Re-enable mobile `tsc --noEmit` as blocking CI gate                                               | ✅     | `continue-on-error: true` removed from `.github/workflows/ci.yml` — 2026-05-27                                  |
| C-16 | Facility export: `format: 'pdf'` → `'csv'` (callable only supports CSV — export was 100% broken)  | ✅     | `FacilityDashboardScreen.tsx:70` — 2026-05-28                                                                   |
| C-17 | Treatment center checkout: add `recovery-connect-cad4b.web.app` to `ALLOWED_REDIRECT_ORIGINS`     | ✅     | `createIntergroup.ts` — 2026-05-28                                                                              |
| C-18 | Enable `SHOW_V4_CONTENT_DAILY_REFLECTION` feature flag (push fired daily but nav target hidden)   | ✅     | `featureFlags.ts` — 2026-05-28                                                                                  |
| C-19 | RegisterScreen ToS/Privacy links: replace Alert stubs with `Linking.openURL` to live pages        | ✅     | `RegisterScreen.tsx` — 2026-05-28                                                                               |
| C-20 | LandingScreen footer: wire Privacy/Terms/About links; fix © 2024 → 2026                           | ✅     | `LandingScreen.tsx` — 2026-05-28                                                                                |
| C-21 | Brand rename: "Homegroups" → "Homegroups" in all user-facing share text                      | ✅     | `InviteShareSheet.tsx`, `ReferralDashboardScreen.tsx`, `SobrietyCalculatorScreen.tsx` — 2026-05-28              |
| C-22 | Remove auth-token `console.log` from `SubscribePage.js`                                           | ✅     | `SubscribePage.js` — 2026-05-28                                                                                 |
| C-23 | Stale FCM token cleanup after every multicast send                                                | ✅     | `functions/src/utils/fcm.ts` (new) + `onAnnouncementCreate.ts` + `sendAnnouncementNotification.ts` — 2026-05-28 |
| C-24 | Dedup guard: `sendAnnouncementNotification` callable skips if trigger already sent                | ✅     | `sendAnnouncementNotification.ts` — 2026-05-28                                                                  |
| C-25 | `IntergroupGroupsScreen`: replace hard 50-group cap with cursor-based pagination                  | ✅     | `IntergroupGroupsScreen.tsx` — 2026-05-28                                                                       |
| C-26 | Create `/join/:code` web landing page for invite links                                            | ✅     | `web/src/pages/JoinGroupPage.js` — 2026-05-28                                                                   |
| C-27 | Fix `JOIN_BASE_URL` in `InviteShareSheet.tsx` to live Firebase domain                             | ✅     | `InviteShareSheet.tsx:34` — 2026-05-28                                                                          |
| C-28 | Add `robots.txt` to web public dir                                                                | ✅     | `web/public/robots.txt` — 2026-05-28                                                                            |
| C-29 | iOS entitlements: add `recovery-connect-cad4b.web.app` to Associated Domains                      | ✅     | `RecoveryConnectDebug.entitlements` + `RecoveryConnectRelease.entitlements` — 2026-05-28                        |
| C-30 | Android App Links: add intent-filter for `recovery-connect-cad4b.web.app` `/join/*` + `/groups/*` | ✅     | `AndroidManifest.xml` — 2026-05-28                                                                              |

---

## 2. Infrastructure — Required Before First Real User

| #   | Item                                                                                  | Status | Detail                              |
| --- | ------------------------------------------------------------------------------------- | ------ | ----------------------------------- |
| I-1 | Run full claim-and-pay funnel as real first customer                                  | 🔲     | See `LAUNCH_BLOCKERS.md` §P0-1      |
| I-2 | Firebase Auth → Authorized Domains includes `recovery-connect-cad4b.web.app`          | 🔲     | See `LAUNCH_BLOCKERS.md` §P0-3      |
| I-3 | Email sender configured (avoid spam folder for verification emails)                   | 🔲     | See `LAUNCH_BLOCKERS.md` §P0-4      |
| I-4 | `RATS_API_KEY` uploaded to Cloud Secret Manager + uncommented in `index.ts`           | 🔲     | See `LAUNCH_BLOCKERS.md` §P0-5      |
| I-5 | Verify production Stripe publishable key is `pk_live_…` (not test key)                | 🔲     | See `LAUNCH_BLOCKERS.md` §P1-6      |
| I-6 | Firebase Hosting deployed (`firebase deploy --only hosting`)                          | 🔲     | Build committed; run from repo root |
| I-7 | `privacy@recoveryconnect.app` and `info@recoveryconnect.app` inboxes confirmed active | 🔲     | Listed in Privacy/Terms pages       |

---

## 3. App Store — Critical Path (days to weeks of lead time)

| #   | Item                                                                   | Status | Detail                         |
| --- | ---------------------------------------------------------------------- | ------ | ------------------------------ |
| A-1 | iOS submitted to App Store Connect                                     | 🔲     | See `LAUNCH_BLOCKERS.md` §P0-2 |
| A-2 | Android submitted to Google Play Console                               | 🔲     | See `LAUNCH_BLOCKERS.md` §P0-2 |
| A-3 | Real App Store ID replaces placeholder in `web/src/lib/deepLinks.js:9` | 🔲     | Fill in once approved          |

---

## 4. Revenue — Required Before Scaling Beyond 10 Groups

| #   | Item                                                                   | Status | Detail                                                  |
| --- | ---------------------------------------------------------------------- | ------ | ------------------------------------------------------- |
| R-1 | Default price set on `productIdIntergroupA` in Stripe Dashboard        | 🔲     | Required for V4.4 intergroup checkout                   |
| R-2 | Default price set on `productIdIntergroupB` in Stripe Dashboard        | 🔲     | Required for V4.4 tier-B upgrade                        |
| R-3 | Custom domain decision made (`homegroups-app.com` vs Firebase default) | 🔲     | See `LAUNCH_BLOCKERS.md` §P1-5 for the 9-file flip list |

---

## 5. Validation — Before Any Marketing Spend

| #   | Item                                                             | Status | Detail                         |
| --- | ---------------------------------------------------------------- | ------ | ------------------------------ |
| V-1 | Attend 3 intergroup meetings, demo treasury handoff to real GSRs | 🔲     | See `LAUNCH_BLOCKERS.md` §P1-7 |
| V-2 | 30-group pilot outreach started                                  | 🔲     | See `LAUNCH_BLOCKERS.md` §P1-8 |

---

## 6. Post-Launch (Nice to Have by 100 Groups)

| #   | Item                                                                                    | Status | Detail                                                                                                                                                 |
| --- | --------------------------------------------------------------------------------------- | ------ | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| P-1 | App Check rollout (monitor → enforce on Stripe callables)                               | 🔲     | See `LAUNCH_BLOCKERS.md` §P2-13 — full 5-step process                                                                                                  |
| P-2 | Rate limiting on `getPublicGroupProfile`                                                | 🔲     | See `LAUNCH_BLOCKERS.md` §P2-10                                                                                                                        |
| P-3 | Flip `noindex` → `index` on unclaimed group pages (~100–200 claimed)                    | 🔲     | 1-line change in `GroupPageHead.js`                                                                                                                    |
| P-4 | OG meta / social preview for group pages (CRA is CSR — crawlers can't read Helmet tags) | 🔲     | Requires SSR or a prerender proxy (Rendertron/Prerender.io + Firebase Hosting rewrite). Low priority at launch; implement when share virality matters. |
| P-5 | Sitemap.xml for 62K group pages                                                         | 🔲     | Generate via Cloud Function writing to Firebase Storage; link from `robots.txt` once `noindex` is flipped (P-3)                                        |

---

## Minimum Viable Launch Sequence

The shortest path to a real paying customer:

```
C-15  →  I-1  →  I-2  →  I-3  →  I-5  →  I-6  →  A-1/A-2
```

Everything else can follow while App Store review is in progress.
