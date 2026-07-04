# Regroup Manual QA Test Plan

**Date:** 2026-07-04
**Purpose:** A step-by-step checklist you can run through yourself (simulator/device + web browser) to validate regroup end-to-end before launch. Each step has an expected result — mark pass/fail as you go. Steps are cross-referenced to specific findings from `regroup-launch-blockers-2026-07-04.md` and `dead-code-audit-2026-07-04.md` where a known issue predicts what you should watch for.
**Suggested setup:** Run against the Firebase emulator suite where possible (`firebase emulators:start` from `regroup/`) to avoid touching production data; note where a check specifically requires production (e.g., the credential-rotation verification) and treat those as read-only/observational rather than data-mutating.

**How to use this:** Each section is a user role or flow. Check off ✅/❌ next to each step. Where a step references a known issue (e.g., "**Known issue #31**"), that's telling you what a _failure_ looks like if the bug is still present — a pass there specifically confirms a fix, not just "nothing broke."

---

## 0. Before you start — environment sanity check

- [ ] `firebase emulators:start` from `regroup/` starts cleanly (Firestore :8080, Functions :5001, Auth :9099, UI at :4000)
- [ ] `regroup/mobile`: `npm run ios` (or `android`) builds and launches to the login/landing screen without a crash
- [ ] `regroup/web`: the Angular app serves and loads the landing page without console errors

---

## 1. Operator onboarding & house setup

1. [ ] Sign up as a new operator through `OrgSetup` (or the equivalent onboarding flow). **Known issue #38**: if house creation actually fails server-side, does the UI still say it succeeded and let you into the main app? If so, that's the bug — try creating a house with an intentionally-invalid input (e.g. disconnect network mid-submit, or check Firestore directly after submit) to confirm whether a failure is actually surfaced.
2. [ ] Create a house with a full address, confirm geolocation/timezone populate correctly.
3. [ ] As part of setup, walk through `OperatorSetupWizard` end to end — confirm no step is blocked by a broken/dead child component.
4. [ ] Confirm the subscription/tier selection step shows the correct 6 tiers (Traditional 69/129/249, Oxford 49/89/299) and that the price shown matches what Stripe actually charges (don't trust a hardcoded UI number — **known issue #58** flags multiple screens with hardcoded pricing that may drift from the real tier config).
5. [ ] Complete checkout with a Stripe test card. Confirm the operator's subscription status updates (`OperatorSubscription` reflects `active`/`trialing`) and you land in the main app with the correct tier's features unlocked.
6. [ ] **Known issue #65**: try triggering a payment failure mid-signup (Stripe test card for decline). Confirm the app does _not_ leave you with a usable operator account with no subscription — if it does, that's the orphaned-user-doc bug.

## 2. Guest / resident creation — priority check

This section directly targets **the most severe bug found in the whole platform review (#31)** — treat this as the highest-priority manual check in this entire document.

1. [ ] Create House A and House B under the same operator account (or two different operator accounts if multi-house isn't available under one account).
2. [ ] From House A, add a new guest/resident through `CreateGuestForm`.
3. [ ] **Check in Firestore (emulator UI at :4000, or Firebase Console if against a staging project) that the new guest document's `houseId` field actually equals House A's real ID** — not a fixed literal value. **Known issue #31**: prior to today's audit, this form hardcoded every new guest onto one specific house ID regardless of which house was selected. If you see the same `houseId` value appear on guests created under _different_ houses, the bug is still present and this is a stop-ship issue.
4. [ ] Repeat guest creation from House B and confirm its guests land on House B's ID, not House A's.
5. [ ] Confirm the new guest can log in (or accept their invite) and see themselves correctly associated with the right house in the app.

## 3. Guest/resident day-to-day flows

1. [ ] Log in as a resident. Confirm the dashboard shows the correct house, phase, and any assigned chores.
2. [ ] Complete a chore. Confirm it's marked complete and reflects for the operator's view.
3. [ ] Submit a drug test result (if applicable to your test house's Oxford/compliance configuration). Confirm `EESTracker` and any compliance summary reflect the update. **Known issue #46**: check whether the displayed EES summary total matches the actual persisted record count — if `house.currentCapacity` and `guestList.length` diverge (e.g., a resident was recently added/removed), the displayed total may not match reality.
4. [ ] As a resident, attempt to update your own profile fields (name, phone). Confirm you **cannot** edit privileged fields like `rentOwed`, `phase`, `isAdmin`, `roles`, or `status` directly — the security rules should reject this (this is a "confirmed good" item per the original review, #33 — a pass here is expected, not a known bug).
5. [ ] If your house is Oxford-enabled, cast a vote in a house business meeting. **Known issue #30**: log in as a _different_ house member and check whether you can see who voted which way on an "anonymous" vote (check Firestore directly for the `votes` subcollection's `individualVotes` field, or check via a second account with read access). If any member can see other members' individual votes, the anonymity claim is not actually enforced at the data layer — this is a trust issue for a self-governance feature, worth flagging even if it's not a hard "fix before launch" blocker for you.
6. [ ] Test the auto-pay toggle on `RentPaymentScreen`. **Known issue #47**: after toggling, force a screen refresh/remount and confirm the change actually persisted and the UI isn't showing stale cached data.

## 4. Admin / manager actions

1. [ ] As an operator/admin, promote a guest to admin and confirm claims propagate (they gain admin capabilities without needing to log out/in, or after one re-login if that's the expected pattern).
2. [ ] As an operator/admin, attempt to remove admin privileges from a guest (the flow that goes through `removeAdminPrivilegesForGuests` client-side / `removePrivilegesForGuests` on the backend). **This exercises today's fix (Tier 1 item 5 in the launch-blockers doc)** — confirm the action actually succeeds end-to-end (no "function not found" error) and the guest's admin claim is actually revoked afterward, not just that the UI shows a success toast.
3. [ ] Attempt to reassign a resident's phase via `PhaseConfigForm` after renaming a phase. **Known issue #41**: if multiple residents were on the renamed phase, confirm _all_ of them show the new phase name, not just the first one alphabetically/by list order.
4. [ ] As a manager, attempt to reject a financial record on both iOS and Android if you have access to both. **Known issue #44**: the reject-reason flow uses an iOS-only API (`Alert.prompt`) — confirm whether Android managers have any way to reject a record at all, or whether this is silently broken there.
5. [ ] Attempt to delete a house as an admin through the UI (not the Admin SDK/Firebase Console). **Known issue #34**: the Firestore rule for house deletion is dead code that can never evaluate true — confirm whether the UI even exposes a "delete house" action, and if so, whether it fails. This may be an intentionally Admin-SDK-only operation; if so, no UI path should promise it works.

## 5. Auth & security-relevant flows

1. [ ] Log in with an intentionally wrong password 6+ times in a row for the same account. **Known issue #7 (Tier 1)**: confirm whether the app actually rate-limits/locks after repeated failures. As of today's audit, the hardened `EnhancedAuthService` (which does implement this) is not wired into the live login path — if you can attempt unlimited password guesses with no lockout or backoff, that confirms the gap is still open.
2. [ ] Log out. **Known issue #52**: confirm you're actually returned to a logged-out state, not silently dropped into a new anonymous Firebase session. A good check: after "logging out," try to access a screen that should require real authentication and confirm it's actually blocked.
3. [ ] If you have access to a second device/browser profile, open the sign-up WebView flow (`SignUpWebView`) and check the network/webview console for what messages it accepts. **Known issue #28**: there's currently no origin validation on this WebView's message handler — this is more of a code-review item than something you can easily click-test, but if you have the ability to load a different URL into that WebView context (e.g. via a debug build pointed at a non-production sign-up URL), confirm whether it still processes login messages from an unexpected origin.
4. [ ] Open the subscription/upgrade flow that loads `SubscriptionHandler`'s WebView. **Known issue #29**: if you have web debugging access to the WebView content (Safari Web Inspector / Chrome remote debugging), check `window.user` in that context and confirm how much of the user object is actually exposed — today it's the full serialized object with no field limiting.

## 6. Deep links & push notifications

1. [ ] Test a deep link using the `regroup://` scheme and a deep link using `regroup-app://` scheme (if you can generate both — check invite emails / share flows for which one they actually mint). **Known issue #48**: confirm whether both actually open the app to the right screen, or whether one of the two schemes is silently ignored.
2. [ ] Confirm push notifications are received on a real device after opting in. **Known issue #69**: check whether the push token is actually being saved/refreshed server-side (may require checking the user's document in Firestore for a token field) — if the save logic is still commented out, notifications may work once but silently stop being deliverable after a token refresh.

## 7. Web app (Angular) spot checks

1. [ ] Visit the marketing site and confirm the support/contact email shown is consistent across pages. **Known issue #64**: check the privacy page, terms page, marketing pages, and contact/my-account pages — confirm they don't show 3-4 different domains/emails for the same company, and confirm there's no leftover placeholder map (e.g. a London address) on a page for a Louisiana-based business.
2. [ ] As an operator, log into the web portal and confirm core account/subscription management works the same as it does from mobile — spot-check that a change made in one (e.g. updating a house detail) shows up correctly in the other after a refresh.

## 8. Cross-product touchpoint: recovery-api meeting directory

Regroup's only current integration with `recovery-api` is the meeting directory search consolidation (`regroup/functions/src/api/recoveryApi.ts` → `fetchDirectoryMeetings`) — **not** the referral endpoints (`createReferral`/`getReferrals`/`getReferral`) described in the platform-level `CLAUDE.md`. Those referral callables exist in `recovery-api` but are not called by any code in `regroup` or `homegroups` today (confirmed via full-repo grep) — there is nothing to manually test on the referral path yet, since no product has wired it in. If you expected a referral flow to exist (e.g. "refer a resident from regroup to a treatment center"), that's a feature gap, not a bug to reproduce.

1. [ ] From a screen that surfaces meeting search/discovery, trigger a directory meeting search. Confirm results return and that regroup is calling out to `recovery-api` for this (not a stale local cache) — check network activity or logs for the outbound call.
2. [ ] Confirm meeting search behaves reasonably when `recovery-api` is unreachable (e.g., point at a bad URL temporarily in a local/emulator config) — does the app show a sensible empty state / error, or does it hang or crash? This isn't tied to a specific documented finding, but it's the one place regroup depends on another service being up, so it's worth confirming there's a graceful degradation path.

---

## After you're done

- Any ❌ on a "Known issue" step in sections 2, 3, or 5 confirms that item is still an open launch blocker per `regroup-launch-blockers-2026-07-04.md` — no further investigation needed, just prioritize the fix.
- Any ❌ on a step _not_ tied to a known issue is a new finding — worth a quick note of repro steps so it can be triaged alongside the rest of this list.
- Section 2 (guest creation / house ID) is the one section where a single ❌ should probably stop the launch conversation until it's confirmed fixed — everything else on this list is real but more contained.
