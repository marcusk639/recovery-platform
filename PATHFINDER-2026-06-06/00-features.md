# Pathfinder — Feature Inventory

**Date:** 2026-06-06
**Scope:** Whole platform (recovery-api, homegroups, regroup, detox-recovery, shared)
**Method:** Single Feature Discovery agent walked all five source trees; orchestrator reviewed and approved boundaries below.

> `shared/` is confirmed **empty** (0 files) despite being reserved for shared types/utilities. It contributes nothing to flowcharting but is itself evidence for the "duplicated entities/types" cross-cutting concern (§H).

---

## recovery-api — cross-app service (Firebase Functions v2)

| Feature                     | Entry point                                                     | Purpose                                                   |
| --------------------------- | --------------------------------------------------------------- | --------------------------------------------------------- |
| Cross-app Referral API      | `src/callable/referrals.ts:72` (`createReferral`), `:80`, `:88` | Create/list/fetch cross-app referrals, ownership-enforced |
| User Profile API            | `src/callable/users.ts:38` (`getUserProfile`), `:46`            | Fetch/update cross-app profiles keyed `{appId}:{uid}`     |
| Service Auth Middleware     | `src/middleware/auth.ts:22` (`requireServiceAuth`)              | Phase-1 `X-Service-Key`/`X-App-Id`/`X-User-Uid` gate      |
| Health / Liveness           | `src/http/health.ts:9`                                          | `GET /health` probe                                       |
| ~~Identity Reconciliation~~ | `src/callable/identity.ts` (commented out)                      | **Excluded — inactive Phase-2 scaffold**                  |

## homegroups / Homegroups (RN mobile + Functions + thin web)

| Feature                              | Entry point                                      | Purpose                                                         |
| ------------------------------------ | ------------------------------------------------ | --------------------------------------------------------------- |
| Authentication & Onboarding          | `mobile/src/navigation/AuthNavigator.tsx:24`     | Email/password auth, claims sync, first-run onboarding          |
| Group Management & Governance        | `mobile/src/navigation/MainTabNavigator.tsx:365` | Create/join groups, roster, elections, conscience votes, bylaws |
| Meetings & Attendance / QR Check-in  | `MainTabNavigator.tsx:399`                       | Find/schedule meetings, QR attendance, geo discovery            |
| Treasury & Group Finance             | `screens/homegroup/GroupTreasuryScreen.tsx`      | Ledger, recurring txns, reports, treasurer handoff              |
| Stripe Subscriptions & Billing       | `functions/src/http/stripeWebhook.ts:30`, `:46`  | $12/yr group subs + Stripe Connect, webhooks, reconciliation    |
| Intergroup / Facility                | `AppNavigator.tsx:155`                           | Multi-group/treatment-center umbrella, SSO, compliance          |
| Messaging & Announcements            | `MainTabNavigator.tsx:417`                       | DMs, group/sponsor chat, announcements w/ push                  |
| Recovery Tracking                    | `MainTabNavigator.tsx:431`                       | Sobriety/step/streak tracking, reflections, sponsorship         |
| Moderation & Admin                   | `MainTabNavigator.tsx:443`                       | Report queue, bans, admin-removal voting, super-admin           |
| Referrals (consumer of recovery-api) | `screens/homegroup/ReferralDashboardScreen.tsx`  | In-app referral codes/dashboard                                 |

## regroup / Regroup (RN 0.72 mobile + Functions v1 + Angular web)

| Feature                                      | Entry point                                                   | Purpose                                                    |
| -------------------------------------------- | ------------------------------------------------------------- | ---------------------------------------------------------- |
| Authentication & Account Setup               | `mobile/src/navigation/navigators.tsx:154`                    | Operator/staff/guest auth, claims, setup wizards           |
| House & Bed Management                       | `navigators.tsx:244`                                          | Houses, rooms, bed inventory, config/settings              |
| Guest / Resident Management                  | `navigators.tsx:249`                                          | Roster, intake, bulk import, phase advancement             |
| Applications & Invitations                   | `navigators.tsx:76`, `:78`                                    | Prospective-resident apps, invite-code redemption          |
| Payments & Rent (Stripe Connect)             | `functions/src/callable/payments.ts:92`                       | Rent via Stripe Connect, methods, receipts, scheduled rent |
| Operator Subscriptions / Billing             | `functions/src/callable/subscriptions.ts:156`                 | Per-house/per-guest billing, bundle discounts, webhooks    |
| Meetings (AA/NA attendance)                  | `functions/src/callable/meetings.ts:79`, `:147`               | Locate AA/NA/Oxford meetings, verify attendance            |
| Chore / Work / Drug-Test Tracking            | `screens/DrugTesting/DrugTestingScreen` (`navigators.tsx:72`) | Chore rotations, work logging, drug-test records           |
| Messaging & Notifications                    | `screens/{DirectChat,HouseChat}/`                             | Direct + house chat, push/in-app notifications             |
| Complaints / Disputes / Issues / Staff Notes | `screens/{Complaints,Disputes,Issues,StaffNotes}/`            | Incident tracking, staff notes, admin export               |
| Treasury (house finances)                    | `screens/{Treasury,BalanceDashboard}/`                        | House balance/ledger, cents-based reporting                |
| Documents                                    | `navigators.tsx:90`                                           | House & resident document upload/management                |
| Web Marketing/Pricing Portal (Angular)       | `web/src/app/`                                                | Marketing/landing, pricing, deep-link redirect, SSR        |

## detox-recovery / NextStep Recovery (Next.js 15)

| Feature                              | Entry point                                | Purpose                                                                                    |
| ------------------------------------ | ------------------------------------------ | ------------------------------------------------------------------------------------------ |
| Marketing Pages / Service Ladder     | `app/page.tsx`, `app/services/page.tsx`    | Home + service-tier marketing, scope-of-practice copy                                      |
| Contact / Lead Capture               | `app/api/contact/route.ts:49`              | Contact form → Resend; honeypot/origin/rate-limit; (disabled recovery-api referral firing) |
| Newsletter / Subscribe (MailerLite)  | `app/api/subscribe/route.ts:29`            | Email-list + lead-magnet signups                                                           |
| Resources / Products (Lemon Squeezy) | `app/resources/page.tsx`                   | Downloadable digital products / lead magnets                                               |
| B2B Consulting                       | `app/consulting/page.tsx`                  | Consulting offers + B2B lead magnet                                                        |
| Referral Safety Triggers             | `components/services/ReferralTriggers.tsx` | Clinical-safety guardrail routing to emergency/medical care                                |
| Abuse-Protection / Security Pipeline | `lib/abuse-protection.ts`                  | Origin allow-list + per-IP rate limit + honeypot for every POST                            |

---

## Cross-cutting candidates (seeds for Phase 2 duplication hunt)

- **A. Firebase init / Admin SDK singleton** — `recovery-api/src/lib/firebase.ts`, `homegroups/functions/src/utils/firebase.ts`, `regroup/functions/src/init.ts`
- **B. Auth / claims gate** — three independent role/claim systems: `recovery-api/src/middleware/auth.ts:22`, `homegroups/functions/src/utils/claims.ts`, `regroup/functions/src/util/{authGuard,claims,houseAuth}.ts`
- **C. Stripe billing + webhook** — `homegroups/functions/src/http/stripeWebhook.ts:30` vs `regroup/functions/src/webhooks/stripeWebhook.ts:933`; parallel `utils/stripe.ts` vs `util/stripe.ts`
- **D. Push notifications / FCM** — `homegroups/functions/src/utils/fcm.ts` vs `regroup/functions/src/util/notifications.ts`
- **E. Cross-app Referral logic** — `recovery-api/.../referrals.ts:72` (source of truth) vs homegroups in-app codes vs detox-recovery disabled firing; **regroup has NO referral client (gap)**
- **F. Meeting finder / location (AA/NA + geo)** — `homegroups/functions/src/callable/findMeetings.ts` vs `regroup/functions/src/callable/meetings.ts:79`; near-identical geo utils
- **G. PII-safe logging / error handling** — mandated platform-wide; no shared implementation, each product reimplements
- **H. Duplicated entities/types** — per-product models/entities, plus regroup defines entities in BOTH functions and mobile; `shared/` empty

## Known gaps carried forward

- regroup→recovery-api referral client not found in function exports — confirm in mobile services during flowcharting.
- homegroups `screens/homegroup/` (70 files) grouped by filename, not per-file reads — flowchart pass should verify call edges.
- regroup `web/` (Angular) mapped at directory level only.
- callable→screen wiring inferred from naming; flowchart agents must verify call edges by reading screen + slice/service files.
