# Homegroups Launch-Readiness — E2E Execution Plan

**Created:** 2026-08-01 · **Context:** memory `homegroups-e2e-sweep-findings-2026-07.md`
**Backend:** `homegroups-e2e` (fully provisioned, Blaze). **App:** `recovery-platform/homegroups` (RN 0.72.9, iOS).

Execution order (user-specified): **commit → prod bugs → login hardening → remaining flows.**
Each phase is self-contained with exact file:line references and a verification checklist.

---

## Phase 0 — Facts (verified this session)

**Uncommitted changeset** (branch off `main` first; `.env` is gitignored, won't commit):

- Backend fixes: `homegroups/firestore.rules` (members read), `homegroups/firestore.indexes.json` (+group_conscience_votes), `homegroups/.firebaserc` (e2e alias).
- App: `mobile/App.tsx` (LogBox.ignoreAllLogs:31), `mobile/src/navigation/MainTabNavigator.tsx` (tab-profile testID).
- E2E harness: `mobile/maestro/subflows/{login,logout}.yaml`, `mobile/maestro/flows/conscience-vote-create-and-cast.yaml` (+ other flow edits from earlier), `mobile/maestro/flows/smoke-app-boot.yaml`, `mobile/maestro/config.yaml`, `mobile/maestro/CI-CLOUD-SETUP.md`.
- Native/build (PRIOR session, also launch-critical): `mobile/ios/Podfile(.lock)`, `mobile/ios/RecoveryConnect.xcodeproj/project.pbxproj`, `mobile/package.json` + `package-lock.json` (Nav v6 downgrade), `mobile/patches/@stripe+stripe-react-native+0.45.0.patch`, deleted SPM `Package.resolved` files.
- New e2e config: `mobile/ios/GoogleService-Info-E2E.plist` (Firebase client config — pre-commit secret scanner exempts Firebase config files per root CLAUDE.md; if blocked, verify exemption pattern).
- Docs: `mobile/docs/e2e/` (this plan + the bring-up report).

**Anti-patterns / guards:** hooks BLOCK Write/Edit to `.env*` and lockfiles — never edit those with tools (git-add of an already-changed lockfile is fine). Commit only (user has authorized). Do NOT deploy rules/functions to **prod** without explicit user confirmation.

---

## Phase 1 — Commit the work + fixes to a branch

**What to do:**

1. `git checkout -b e2e-launch-readiness` (never commit straight to `main`).
2. Stage everything under `homegroups/` that is part of this body of work (backend fixes, app fixes, maestro harness, native build fixes, e2e plist, docs). Leave unrelated `regroup/` changes out.
3. Commit in logical chunks (or one well-described commit):
   - `fix(homegroups): members firestore rule + group_conscience_votes index (getUserGroups + conscience votes broken on fresh deploy)`
   - `chore(homegroups-mobile): E2E harness — homegroups-e2e plist wiring, seed, maestro flow/subflow fixes, LogBox+tab testID`
4. Do NOT push/PR yet unless asked; do NOT deploy to prod.

**Verification checklist:**

- [ ] `git status` shows a clean tree for the intended files; `.env` absent from the commit (`git show --stat` has no `.env`).
- [ ] `git log --stat` shows `firestore.rules`, `firestore.indexes.json`, `App.tsx`, `MainTabNavigator.tsx`, the maestro files, and `GoogleService-Info-E2E.plist`.
- [ ] Pre-commit hook passed (no secret-scan block; no 300-line-cap block on NEW files).

---

## Phase 2 — Fix confirmed PROD launch-blocker bugs

### 2a. Invite-join region mismatch (invite-join 100% broken in prod)

- **Code fix (chosen direction: align the 2 functions to us-central1 to match the other 90 callables + client default):**
  - `functions/src/callable/joinGroupByInviteCode.ts:20` — remove `region: "us-west1",` (keep the v2 `onCall` for memory/cpu/timeout).
  - `functions/src/callable/sendGroupInviteEmail.ts:24` — remove `region: "us-east1",`.
  - Update `functions/CLAUDE.md` D-10 note (these were cited as the canonical us-west1/us-east1 examples) to reflect the change.
- **Client is already correct** (default us-central1 at `EnterInviteCodeModal.tsx:55`, `App.tsx:318`) — no client change needed once functions move.
- **PROD DEPLOY IS GATED** — moving a function region creates a new function in us-central1 and orphans the us-west1 one; confirm with user before `firebase deploy --only functions:joinGroupByInviteCode,functions:sendGroupInviteEmail` to prod, then delete the old-region functions.

**Verification:** `grep -n "region:" functions/src/callable/joinGroupByInviteCode.ts sendGroupInviteEmail.ts` → no us-west1/us-east1. `npm run build` clean.

### 2b. Stripe key crash guard (App.tsx)

- `mobile/App.tsx:465-472` — `initStripe({ publishableKey: process.env.STRIPE_TEST_PUBLISHABLE_KEY as string })` and `const stripePublishableKey = process.env.STRIPE_TEST_PUBLISHABLE_KEY as string`. On any build without `.env`, this is `undefined` → native `as! String` crash at launch.
- **Fix:** guard — only call `initStripe` when the key is a non-empty string; pass a safe empty-string (not undefined) to `StripeProvider` and skip init when absent. Log a warning, don't crash. Keep `process.env` (it resolves via react-native-dotenv when `.env` is present — verified).

**Verification:** temporarily rename `.env`, rebuild debug, confirm app boots (no SIGTRAP) with Stripe disabled; restore `.env`.

### 2c. members firestore.rules (already fixed in e2e) — prep for reviewed prod deploy

- Already applied in `firestore.rules` (added `resource.data.userId == request.auth.uid ||` to members read). This is why e2e `getUserGroups` works.
- **PROD DEPLOY IS GATED** — current repo rules would break every prod user's group list, so prod is presumably on older rules. Confirm with user, then `firebase deploy --only firestore:rules` to prod after review. Run `npm run test:rules` first.

**Verification:** `npm run test:rules` passes; manual review of the diff with the user before any prod deploy.

---

## Phase 3 — Harden full-login E2E flakiness (iOS "Save Password?" dialog)

- ~50% of full-login runs, iOS pops "Save Password?" after form submit, covering `group-list-screen`. Current mitigation (optional "Not Now" ×2) is timing-flaky.
- **Preferred fix:** set `textContentType="oneTimeCode"` on the AuthModal password fields (`mobile/src/components/onboarding/AuthModal.tsx` login password ~line 327-335 and signup password ~258, confirm-password ~279) — this suppresses the iOS save-password/strong-password prompt. (Verify against RN TextInput docs; `oneTimeCode` is the documented suppression value.)
- **Alternative/complementary:** disable Passwords→AutoFill on the simulator before runs.

**Verification:** run the login subflow 5× on the full-login path (erase sim → login) → 5/5 reach `group-list-screen` with no Save-Password dialog.

---

## Phase 4 — Drive the remaining 6 persona flows

Personas already seeded in `homegroups-e2e`. Run each on iPhone 17 sim (UDID 94BA6684-181A-415C-A21D-7343B14F6BE2), fix live. Reuse the now-hardened login/logout subflows.

Order (easiest→hardest, test-admin first since app stays authed):

1. `registration-signup.yaml` (self-creates account; writes a throwaway prod... **e2e** user — fine).
2. `invite-code-join.yaml` (test-admin joins e2e-invite-target-group via code ABC123; needs 2a fix deployed to **e2e** — already us-central1 there? verify).
3. `qr-meeting-checkin.yaml` (test-admin; meeting seeded; `checkInToMeeting` callable).
4. `group-creation.yaml` (test-admin; resolve the "Add First Meeting" contradiction by observing step-2 live; Google Places address is a known automation boundary).
5. `group-admin-claim-and-pay.yaml` (test-unclaimed-member; stops at Stripe boundary; fix `$12`→`\\$12` selector).
6. `treasurer-handoff-completion.yaml` (test-treasurer; needs logout→login as treasurer persona first).

**Expect:** more uncommitted Firestore composite indexes (failed-precondition) — create in e2e + add to `firestore.indexes.json`. testID/scroll/keyboard fixes like conscience-vote.

**Verification (final):** each flow exits 0; `config.yaml` `continueOnFailure` run reports all flows; commit accumulated fixes + any new indexes.

---

## Final verification

- [ ] All committed; branch clean.
- [ ] Prod bug fixes applied in code (deploys gated on user confirmation).
- [ ] Login path 5/5 stable.
- [ ] Persona flows green (or documented boundaries).
- [ ] `firestore.indexes.json` updated with every index discovered.
- [ ] Memory `homegroups-e2e-sweep-findings-2026-07.md` updated with outcomes.
