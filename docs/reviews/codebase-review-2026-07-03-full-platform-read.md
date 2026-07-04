# Full-Platform Codebase Read — Findings Report

**Date:** 2026-07-03
**Scope:** Entire `recovery-platform` monorepo — `recovery-api`, `detox-recovery`, `homegroups` (functions, web, mobile core, mobile UI, mobile tests), `regroup` (functions, web, mobile core, mobile UI, mobile tests, Firestore/Storage security rules, Maestro/e2e flows).
**Method:** Full-file reads, not sampling or grep-based scanning. The codebase was read source-file-by-source-file across ~13 sequential chunks, each chunk fanned out to multiple parallel subagents (roughly 60 agent batches total across the session), with files bin-packed into ~5–6K-line batches per agent to keep coverage complete and even. Each agent read its assigned files in full and reported concrete findings — bug fixes visible in tests, architectural patterns, PII/security concerns, and cross-references against patterns already established earlier in the read. The orchestrating session synthesized and cross-checked findings as each chunk completed, catching some duplicate/contradictory reports along the way (see "Methodology notes" below).
**Not done:** unlike the `codebase-review-2026-06-21-mobile-functions.md` review in this same directory, findings below were **not** independently re-verified against source by a second pass (no ✅ VERIFIED tagging). They are first-pass reads by single agents each. Treat CRITICAL/HIGH items as "very likely real, confirm before acting" rather than "confirmed."

---

## Executive Summary

The platform is architecturally mature in the places that matter most for money and access control: both products' Stripe integrations use idempotency keys and webhook signature verification, both have moved (or are actively moving) toward claims-based authorization, and regroup's Firestore/Storage security rules — read in full at the end of this effort — turned out to enforce most of the protections that the mobile client code merely _assumed_ (guest self-elevation prevention, Cloud-Function-only payment writes, Oxford subscription gating). That is a materially better outcome than the client-side code alone suggested.

Against that, this read surfaced a real cluster of concrete, fixable problems: a hardcoded house ID in a live guest-creation form (regroup), a WebView message-injection gap with no origin validation (regroup), a live production credential committed to the repo awaiting manual rotation (regroup), a cross-product content leak in a legal document (homegroups), and a non-anonymous "anonymous voting" feature (regroup). None of these require deep architectural rework — they're each a scoped fix — but several are worth acting on before any further launch push.

**Total scope read:** ~400K+ lines across recovery-api (~2.4K), detox-recovery (~3.2K), homegroups (~145K across functions/web/mobile), and regroup (~185K across functions/web/mobile), plus recovery-api and detox-recovery as smaller supporting chunks.

---

## How to use this document

Findings are grouped by product, then by rough severity:

- **Security / PII** — things with a plausible path to data exposure, credential leakage, or auth bypass.
- **Data-integrity bugs** — code that writes wrong data, silently fails, or crashes under real conditions.
- **Architecture / drift-risk** — client-side duplication of server-owned rules, inconsistent patterns, migration-in-progress seams. Not bugs today, but likely to become bugs when one side changes without the other.
- **Minor / cleanup** — dead code, style inconsistencies, stale docs.

File paths are relative to the product root unless otherwise noted.

---

## HOMEGROUPS

### Security / PII

1. **Cross-product content leak in a legal document.** `homegroups/web`'s `PrivacyPage.js`, `TermsPage.js`, `ContactPage.js`, and `TreatmentCenterSuccessPage.js` all list the support contact as `admin@regroup-app.com` — the _Regroup_ product's email domain, not Homegroups'. Appears in multiple files, so it's systemic, not a typo. (`homegroups/web/src/pages/*`)
2. **`PhoneListReportService.ts` (mobile) renders real member names and phone numbers into an unencrypted PDF** handed to the OS share sheet, leaving app control entirely. The screen that triggers it (`GroupPhoneListScreen`) has **no admin gate and no on-screen confidentiality warning** — the warning exists only in the PDF footer. Any member who navigates to the screen can export and share the full list. (`homegroups/mobile/src/services/notifications/... PhoneListReportService.ts`, `homegroups/mobile/src/screens/homegroup/GroupPhoneListScreen.tsx`)
3. **`GroupPhoneListScreen` reads from a different Firestore collection (`group_members`) than the rest of the app (`members`)** — worth confirming which is canonical; could be reading stale data in addition to the exposure above.
4. **`AdminPanelScreen`** is a super-admin tool that grants admin rights by typing a raw group ID + user ID directly into `GroupModel.assignAdmin`, bypassing the normal request flow — flagged for a security review of that path and the underlying Firestore rules.
5. **`ElectionDetailScreen.handleAssignWinner`** performs a **direct client-side Firestore batch write** to assign an election winner and update service positions, bypassing the `closeElection` callable entirely — two divergent code paths (one server-validated, one client-trusted) for the same state change.
6. Scattered `console.log`/`console.warn` calls across `MeetingModel`, `auth.ts`, notification services, `GroupModel`/`UserModel` sometimes include UIDs, group IDs, or addresses — a cleanup pass is worth doing against the platform's explicit no-PII-logging rule.

### Data-integrity bugs

7. **`membersSlice.updateGroupMember`** looks up a member by bare `userId` when every other member operation in the codebase keys by the composite `${groupId}_${userId}` — this thunk silently fails to find the member it's updating. (`homegroups/mobile/src/store/slices/membersSlice.ts`)
8. **`GroupModel.admins[]` vs `adminUids[]` divergence** — the two arrays are only kept in sync on the "instant admin claim" path. Normal admin-approval flows write only `admins[]`, but backend callables treat `adminUids[]` as canonical. Plausible root cause for a "user is admin in the app but gets `permission-denied` from a Cloud Function" class of bug. (`homegroups/mobile/src/models/GroupModel.ts`)
9. **Two parallel treasury balance systems**: the canonical `treasury_overviews`/`transactions` system (server-trigger-owned) and a legacy embedded `group.treasury` blob that `GroupModel.completeDonation` still writes to directly. Any UI reading the wrong one shows a stale balance.
10. **`ProfileManagementScreen`'s `useInitialOnly` privacy toggle is a no-op** — the UI lets a user enable "show initial only" but the save function ignores it and sends the full display name anyway, silently defeating an anonymity feature.
11. **`GroupDonationScreen` dispatches `completeDonation` without awaiting it** after a successful Stripe charge — a failed server-side write still shows success to the user, and the group's treasury could silently miss a real donation.
12. **`AnnouncementsScreen` and `AnnouncementDetail.tsx` are both non-functional stubs** — admin update/delete handlers literally comment "we'll just simulate it" and never touch Firestore; `checkAdminStatus` hardcodes `isAdmin=true` with a "for testing purposes" comment. The entire admin announcement-management UI appears to be placeholder code. **None of this is caught by the test suite** — the Detox e2e spec for phone-list PII and the unit tests for announcements only assert on navigation/banner behavior with an empty list, never real CRUD.
13. **`MeetingDetailScreen`'s favorite state is local-only** and desyncs from the user's actual favorites on remount.
14. **`TreasurerHandoffScreen` leaks a Firestore listener** — an `onSnapshot` unsubscribe function is built but never wired to the `useEffect` cleanup.
15. **`ReportDetailScreen`'s ban flow is two non-atomic sequential dispatches** (`banUser` then `reviewReport`) — a failure between them leaves a report stuck inconsistent.
16. **`GroupSearchScreen` displays `distanceInKm` values labeled "miles"** — either the backend returns miles under a mismatched field name, or the label is wrong.

### Architecture / drift-risk

17. **Over 20 mobile screens bypass the documented "screens → slices → models → Firestore" architecture**, reading Firestore or calling models directly instead of going through Redux slices. This correlates with recency: core flows (auth, groups, meetings) mostly respect the layering; newer V4.x features (governance, SSO, analytics, literature) increasingly bypass it. Affected screens include (non-exhaustive): `GroupChatScreen`, `ChatMediaPickerScreen`, `PendingAdminRequestsSection`, `ProfileScreen`, `EditMeetingMinutesScreen`, `YearEndSummaryScreen`, `TreasurerHandoffScreen`, `TreasuryTrendsScreen`, `GroupBylawsScreen`, `SponsorChatScreen`, `IntergroupReportScreen`, `EditBylawsScreen`, `MySponsorshipsScreen`, `GroupElectionsScreen`, `TermsDashboardScreen`, `MyRecoveryJourneyScreen`, `MinutesArchiveScreen` (with an N+1 read pattern), `IntergroupGroupsScreen`, `MeetingTopicsScreen`, `GroupAnnouncementDetailsScreen`, `AssignChairpersonScreen`.
18. **Pricing/business-rule drift, a recurring pattern**: `CreateGroupScreen` hardcodes an "$8/year multi-group discount" and a "90-day trial" with zero backend linkage — worth confirming the backend actually implements this before it ships, since a wrong claim here is a false-advertising risk. Multiple screens (`AdminValuePropScreen`, `AdminValuePropModal`, `SubscriptionUpgradeScreen`) independently hardcode "$12/year." The homepage `PricingSection.js` (web) says "$1/month" for the same product other pages call "$12/year" — two different numbers for one plan.
19. **Admin-inactivity escalation thresholds (30-day/60-day/7-day auto-approve) are duplicated as UI copy in at least three components** (`ActivityStatusBadge`, `AdminRequestCard`, `PendingAdminRequestsSection`) — any backend timing change would silently desync all three.
20. **Type duplication is severe in `homegroups/mobile/src/types`**: `User` is defined at least 4 separate times across `index.ts`, `user.ts`, and `schema.ts` with no enforced sync; `GroupMemberDocument` 3×; `MeetingFormat` 3×.
21. **Sobriety-time math is independently reimplemented at least 4 times** with slightly different rounding across the mobile app.
22. Domain/URL sprawl across both web and mobile: `homegroups-app.com`, `recoveryconnect.app`, `recovery-connect-cad4b.web.app`, plus a `recoveryconnect://` vs `homegroups-app://` deep-link scheme split — compounds the documented domain-cutover risk (LAUNCH_BLOCKERS #5). `WEB_ORIGIN` (in `lib/deepLinks.js`) and `SITE_ORIGIN` (in `components/GroupPageHead.js`) both independently hardcode the same soon-to-change domain — a domain cutover has to remember to change both.

### Minor / cleanup

23. `NewsletterSignup.js` (web) doesn't actually submit anywhere — `handleSubmit` only `console.log`s the email.
24. Several `Footer.js` links and a `PricingSection.js` "/demo" link point to nonexistent routes (404).
25. `homegroups/web/CLAUDE.md` claims "no automated test suite" — stale; Jest + RTL content-integrity tests exist under `pages/__tests__/`.
26. Legacy-name leaks ("RecoveryConnect App" button label, "harm Recovery Connect" copy) — launch-prep cleanup candidates.

---

## REGROUP

### Security / PII — highest priority

27. **Live production credential exposure, currently unresolved.** `regroup/mobile/e2e/SECURITY-test-credentials.md` documents that a real password (`TestPassword123!`) used to provision actual test accounts in the **production** `phoenix-cleanhouse` Firebase project — via an untracked script, `scripts/create-e2e-auth-users.js`, using `service-key.json` — is committed in plaintext across **18 tracked files** (fixtures, README, every Maestro flow). One of the affected accounts (`test-manager`) carries an `admin` claim. The document is a responsible self-audit that correctly rejects the "just gitignore one file" false fix and prescribes account rotation plus an env-var-gated password with no committed default — but it explicitly says remediation is **"awaiting a manual Firebase Console rotation."** This should be confirmed/actioned directly, not left to a stale audit doc.
28. **`SignUpWebView.tsx`'s `onMessage` handler has no origin validation and no try/catch**, and will dispatch a `login()` Redux action directly from whatever `{email, password}` payload the loaded web page sends via `postMessage`. Combined with a hardcoded dev URL (`rats-dev.web.app`) that may be present in release builds, this is a plausible credential-injection vector. The URL-allowlist hardening that protects the sibling `PaymentWebView` component (validated against `checkout.stripe.com`/`hooks.stripe.com`, fails closed, rejects homograph/subdomain-takeover attempts) was never applied here. (`regroup/mobile/src/screens/SignUp/SignUpWebView.tsx`)
29. **`SubscriptionHandler.tsx` injects the entire serialized `User` object into a WebView** via `window.user = JSON.stringify(user)` on load, with no field allowlisting, exposing it to the third-party web origin (`regroup-app.com`) and any content/scripts running there. Confirmed independently by two separate reviewing agents. (`regroup/mobile/src/screens/SubscriptionHandler/SubscriptionHandler.tsx`)
30. **Oxford House "anonymous" votes are not anonymous at the data layer.** Confirmed directly against the Firestore security rules: `houses/{houseId}/votes/{voteId}` is readable by any house member (`isGuestOrAdmin`), and there is no rule scoping the `individualVotes` field. The client writes per-voter ballots into that same document regardless of the anonymous flag — "anonymity" is a UI display convention only, not a data protection. For a democratic self-governance feature inside a recovery-support product, this is worth taking seriously.
31. **`CreateGuestForm.tsx` hardcodes a literal house ID** (`'oReUMPURqJqBAn3sNOjP'`) into every new guest record, regardless of which house is actually selected — every resident created through this form is silently assigned to one specific house. The same house ID also appears in `Invites.tsx`, though that file is fully commented-out dead code — its presence there suggests the ID was a real house used during development that leaked into two places. **This is the most severe data-integrity bug found in the entire review; confirm whether this code path is still reachable in production before anything else.**
32. `TwoFactorSetup.tsx` implements phone-based 2FA enrollment, but **nothing in the app actually enforces or gates on it** — currently cosmetic, not functional, security.

### Security / rules — confirmed good (worth knowing, not fixing)

33. Firestore/Storage security rules (`regroup/mobile/firebase/firestore.rules`, `storage.rules`) are mature and well-tested (2,600+ lines of emulator tests). Confirmed directly from rule source:
    - Custom claims are enforced as **maps** (`houseId → true`), matching what the mobile code assumes; arrays would break every rule check.
    - **Guest self-elevation is genuinely prevented by rules**, not just client discipline — a guest can only update an allowlisted set of personal fields on their own record (`hasOnly([...])`); privileged fields (`rentOwed`, `phase`, `isAdmin`, `roles`, `status`) are admin-only, and the allowlist is all-or-nothing so hiding a privileged change inside an innocuous edit is also denied.
    - **Payments/financial records are genuinely Cloud-Function-only** — `payments/{id}` allows admin `create` (manual recording) but `update, delete: if false`, with an explicit comment that only Cloud Functions may modify payment status.
    - Oxford officer/business-meeting/vote subcollections require both the documented subcollection path structure **and** an active/trialing subscription status via a `get()`-based gate.
    - Disputes/complaints/issues have real rule-level validation (identity pinning, houseId immutability) — this was previously assumed to be "purely client-side" by several UI-layer reviewing agents, and that assumption was wrong.

### Security / rules — issues found

34. **The `houses` delete rule is dead code that fails closed.** It references `request.resource.data.id`, which is always `null` on a delete operation, so the condition can never evaluate true — client-initiated house deletion always fails silently. Not a security hole, but a functional bug; house deletion currently requires the Admin SDK.
35. **Guest avatar photos are readable by any authenticated user across houses** (Storage rules) — a mild cross-house PII exposure via filename/face, in contrast to chore-evidence photos and reports, which are correctly house-scoped.
36. A handful of collections (`meetings`, `activities`, `week-summaries`) have weaker anti-re-parenting guards (keyed off the new value rather than the existing document) than the more hardened `disputes`/`complaints`/`issues` — an inconsistent hardening pass rather than an active vulnerability.

### Data-integrity bugs

37. **`AssignGuest.tsx` fires a "Bed Assigned" success notification without awaiting the actual assign/reassign call** — a rejected assignment still displays as successful, and the computed error state is never rendered.
38. **`OrgSetup.tsx`'s house-creation submit swallows errors with an empty `catch { // continue }` block** and still navigates the user into the main app as if house creation succeeded — during operator onboarding, a failure looks identical to success.
39. **`AddManager.tsx`'s email validation checks the stale `email` state variable instead of the newly-typed value** — validation always lags one keystroke behind.
40. **`Disputes.tsx` violates the Rules of Hooks** — an early `return null` guard sits before two `useCallback` calls, contradicted by a code comment that claims otherwise. Will misbehave/throw whenever `house`/`user` transition from null to defined post-mount.
41. **`PhaseConfigForm`'s rename logic only remaps the first matching guest** (via `lodash.find`) when a phase is renamed, leaving every other resident on that phase with a dangling reference to the old name.
42. **`IntroHouseSummary.tsx` displays a randomly-decided "Certified"/"Not Certified" badge** via `Math.round(Math.random())` — placeholder logic shipped to production. Its "Apply" button is also permanently stubbed to return `null`.
43. **`NewMeeting.tsx`'s meeting-Type picker is dead UI** — `handleSubmit` hardcodes `type = 'Custom'` after the form renders, silently overwriting whatever the user selected.
44. **`FinancialRecordDetail`'s reject-reason flow uses `Alert.prompt`**, which is iOS-only — Android operators cannot reject a financial record through this UI; it's a silent no-op on that platform.
45. **`Voting.tsx` ignores the per-vote `threshold` field it persists on the vote entity**, hardcoding an 80% threshold for every vote's pass/fail calculation regardless of what was configured at creation.
46. **`EESTracker.tsx` shows a summary total computed from `house.currentCapacity` while the actual record-creation path uses `guestList.length`** — the displayed amount can diverge from the persisted amount.
47. **`RentPaymentScreen`'s auto-pay toggle writes directly via `firestore().collection('guests').doc().update()`**, bypassing the service layer and React Query cache — leaves stale cached data after the write.
48. **Deep-link scheme mismatch**: `navigation/linking.ts` uses the `regroup://` prefix while the rest of the app (native deep links, custom-scheme handling) uses `regroup-app://` — links minted one way likely aren't caught by the other. The `linking.ts` config may also never be wired into the actual `NavigationContainer` (header comment: "Phase 6.4: Configuration ready for implementation").
49. **`InitialLandingForm`'s demo-login link is broken** — the underlying `showDemo()` function is dead code, and the visible link instead routes to plain Login. Uncaught because the corresponding test only checks that the link renders, not that it functions.
50. **`HouseSearchScreen`'s `renderHouseHealth` always renders the same "sad" health icon for every house**, regardless of actual data — a placeholder left in production.

### Architecture / drift-risk

51. **Two parallel auth stacks exist**, and the hardened one is very likely not wired into the live login flow. `EnhancedAuthService` (rate-limited: 5 sign-in / 3 password-reset attempts per email, input validation, sanitization) exists alongside the older `services/users.tsx` + `userSlice` thunks. Confirmed directly: **no screen or test in the UI-layer batches ever references `EnhancedAuthService`** — the live Redux `login`/`autoLogin` flow calls the older, unhardened path. If accurate, real users are not receiving the rate-limiting or validation protection that exists elsewhere in the codebase. Compounding this, `authSlice.ts` and `userSlice.ts` are two overlapping Redux auth slices with no clear single canonical source.
52. **`logout()` never fully logs a user out** — it always drops back into an anonymous Firebase session via a `setTimeout`-based navigation hack, rather than clearing auth state entirely.
53. **Two divergent EES (Equal Expense Share) data models write to the same `ees-records` Firestore collection** — `oxford/index.ts` writes an `EESTransaction` shape while `oxford/ees.ts` writes a different `EESRecord` shape, flagged independently by two reviewing agents.
54. **Week-start anchor is inconsistent across the codebase**: Monday in `activityHelpers`/`compliance.ts`, Sunday in `choreRotation.ts` — a real off-by-one-week risk between chore rotation and weekly compliance tracking.
55. **`PhaseRule` field-name vocabulary diverges between `compliance.ts` (`meetings/work/chore/medications/supporter`) and `useStatSummary`/other consumers (`meeting/hoursWorked/choreCompleted/medication/metPrimarySupporter`)** — worth confirming which is canonical before either silently reads the wrong field.
56. **A systematic pattern of commented-out client-side validation on PII-collecting forms**: `NewAccountForm`, `GuestUpdateForm`, and `HouseConfigForm` all have their Yup `validationSchema` disabled, meaning SSN-adjacent fields, date of birth, and ethnicity are collected with zero client-side validation. Several of these forms also silently swallow submit errors (error `Alert` calls are commented out alongside the validation).
57. **Three different "get the current house" access patterns coexist**: the RQ-based `useSelectedHouse` hook (most screens), `context/DataContext`'s `useData().currentHouse` (`DrugTestForm`, `DrugTestingScreen`, `BalanceDashboard`, `GuestImportScreen`, `ResidentIntakeFormScreen`), and legacy Redux `connect()` (`nav-bar`, `title-bar-right-button`). This is a real inconsistency, not just a migration-in-progress artifact, since it's spread across both old and newer screens.
58. **Client-side duplication of backend-owned business rules is pervasive** and flagged repeatedly across the mobile review: Oxford officer term length (180 days) and expiry warning window, meeting quorum (`ceil(attendees × 0.51)`), stale-pending-payment window (24h), Oxford onboarding EES validation, phase-advancement thresholds, and pricing display ("$49/month" hardcoded in `OxfordDashboard` vs. the backend's actual `49/89/299` tier config). None of these are fetched — all are hardcoded in UI code, so any backend policy change requires hunting down and updating every client copy.
59. **The Detox e2e suite referenced by `regroup/mobile/e2e/README.md` and its shell runners is vestigial** — the test files those scripts point to (`dispute-system.test.js`, `activity-verification.test.js`, `authorization-rbac.test.js`, `helpers/`) no longer exist in the tree, superseded by the actively-maintained Maestro flow suite. `SETUP_REQUIRED.md` is similarly stale, claiming "NOT READY TO RUN" against a codebase with extensive testID coverage.
60. Two operator-facing Maestro flows (`operator-setup-wizard`, `oxford-onboarding`) are documented in-file as non-runnable against the current default test-data seed without manual changes.

### Minor / cleanup

61. `withPopover.tsx`, `withNotifier.tsx`, `withLoadingModal.tsx`, and 2 other HOCs are `@deprecated` no-op stubs still exported and, in some cases, still tested — candidates for removal now that screens have migrated to hook/context equivalents.
62. `video-player/index.tsx` is a stub that renders an empty `<View/>` and ignores all props.
63. `HouseInfo/HouseInfo.tsx` has `// @ts-nocheck` at the top of a data-heavy screen — type safety is fully off there.
64. `regroup/web`: two inconsistent support-contact domains — `admin@regroup-app.com` (marketing pages) vs. `regroup.app` (legal pages: `privacy@`, `support@`, `security@`) — four email variants for one company across different pages. Also a leftover vendor-demo Google Maps embed showing a London address on the contact and my-account pages (the real business is in Louisiana).
65. `regroup/web`'s `subscribeOperator()` creates the Firebase user document **before** calling the Stripe subscription callable, with no rollback on failure — a payment failure during signup can leave an orphaned super-admin user document with no subscription.
66. `regroup/web`'s `RedirectComponent` (a security-hardened native-app deep-link launcher with a real open-redirect allowlist) is never wired into `app.module.ts` or the router — dead code despite the security work invested in it.
67. `regroup/web`'s live Stripe **publishable** key (safe, client-facing by design) is committed in `environment.prod.ts` — not a secret leak, but worth being deliberate about.
68. Doc/code drift on a live discount: the `regroup-bundle-5` coupon is described as 20% off in an `api/stripe.ts` code comment but 15% off in regroup's own CLAUDE.md — worth confirming which is actually configured in Stripe.
69. Push-notification tokens are fetched in `Splash.tsx` but never persisted — the token-refresh/save logic is commented out pending restored Redux actions, meaning push targeting is a live functional gap, not just a TODO.

---

## Methodology notes

- One background review agent (`mobile-ui-12` during the homegroups mobile UI chunk) went out of scope mid-task, re-reading files already covered by other parallel batches despite being redirected twice; it was forcibly stopped. Its early, correctly-scoped output is included above; nothing after the stop point is included.
- A batch of 8 parallel agents hit a transient provider-side rate limit early in the homegroups mobile UI chunk when launched simultaneously; retries were staggered in two waves to avoid recreating the same limit. All 12 batches in that chunk eventually completed.
- Several findings were independently corroborated by two or more separate agents who had no visibility into each other's work (e.g., the `SubscriptionHandler` WebView PII injection, the EES dual-schema conflict, the "guests are React Query SSOT" migration pattern) — these are flagged in the text above and can be weighted with higher confidence than single-agent findings.

---

## Suggested priority order for follow-up

1. Confirm/rotate the live production credential (#27) — this is the only item with an active, ongoing exposure window.
2. Confirm whether `CreateGuestForm`'s hardcoded house ID (#31) is reachable in the current production build.
3. Review `SignUpWebView`'s message-injection gap (#28) and `SubscriptionHandler`'s WebView PII injection (#29) — both are scoped fixes (apply the existing `PaymentWebView` allowlist pattern; stop serializing the full `User` object).
4. Decide on a remediation for Oxford anonymous voting (#30) — likely needs either a rules change (subcollection-per-voter with admin-only read) or an honest UI change (drop the anonymity claim).
5. Fix the homegroups cross-product email leak (#1) and the `GroupPhoneListScreen` exposure (#2–3) — both are small, contained fixes with outsized trust impact.
6. Everything else in this document is real but lower urgency — the drift-risk items in particular are worth a dedicated pass once the above are resolved, since several (pricing hardcoding, admin escalation thresholds, EES dual schema) will keep generating confusing bugs until the client stops duplicating server-owned values.
