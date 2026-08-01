# Homegroups iOS E2E — How to Run + Manual Steps

**Updated:** 2026-08-01 · Backend: `homegroups-e2e` (isolated from prod) · Device: iPhone 17 sim (iOS 26.5)

This is the operator guide for running the Maestro E2E suite against the dedicated
`homegroups-e2e` Firebase project, plus every **manual / ops step** that a human must do
(these cannot be scripted into the flows).

---

## 0. One-time environment setup (already done, listed for reproducibility)

These were completed provisioning `homegroups-e2e`. If starting on a fresh machine or a fresh
test project, redo them:

1. **Firebase CLI auth** — `firebase login` (interactive browser; run it yourself, not via a pipe).
2. **Blaze billing** on the test project (Console → Usage & billing → Modify plan → Blaze). Required
   even to create the Firestore DB.
3. **Enable Email/Password auth** — Console → Authentication → Get started → Sign-in method →
   Email/Password → Enable → Save. (Fixes `CONFIGURATION_NOT_FOUND` on signUp.)
4. **Deploy backend to e2e**:
   ```bash
   cd homegroups
   firebase firestore:databases:create "(default)" --location us-central1 --project homegroups-e2e
   firebase deploy --only firestore:rules --project homegroups-e2e
   # indexes: filter out the invalid single-field servicePositions/termEndDate entry first, then:
   firebase deploy --only firestore:indexes --project homegroups-e2e
   firebase deploy --only functions --project homegroups-e2e   # sets 7 placeholder secrets first (below)
   ```
5. **Function secrets** (placeholders are fine — flows stop at the Stripe boundary):
   ```bash
   for s in GOOGLE_MAPS_API_KEY RATS_API_KEY RECOVERY_PLATFORM_API_KEY SENDGRID_API_KEY \
            STRIPE_SECRET_KEY STRIPE_WEBHOOK_SECRET STRIPE_CONNECT_WEBHOOK_SECRET; do
     printf '%s' "e2e-placeholder" | firebase functions:secrets:set "$s" --project homegroups-e2e --data-file -
   done
   ```
6. **Seed personas + data** — `node scripts/seed-e2e.js` (see §4). Creates 4 Auth users + groups/
   members/meeting/servicePosition/invite.

---

## 1. Every-run prerequisites

```bash
# a) Simulator booted
xcrun simctl boot 94BA6684-181A-415C-A21D-7343B14F6BE2 ; open -a Simulator

# b) Metro running (from homegroups/mobile)
npx react-native start           # keep in its own terminal

# c) Debug app built + installed against the e2e plist (Debug config → homegroups-e2e)
npx react-native run-ios --udid 94BA6684-181A-415C-A21D-7343B14F6BE2

# d) Verify the installed app points at e2e (NOT prod):
APP=$(xcrun simctl get_app_container 94BA6684-181A-415C-A21D-7343B14F6BE2 org.recoveryconnect)
/usr/libexec/PlistBuddy -c "Print :PROJECT_ID" "$APP/GoogleService-Info.plist"   # -> homegroups-e2e
```

> **GOTCHA — testID / JS changes need a NATIVE rebuild.** The debug `.app` runs its _embedded_
> JS bundle. Editing a screen's testID (or `index.js`) and only reloading Metro is NOT enough —
> the app keeps the old bundle even after uninstall+reinstall+`--reset-cache`. After any JS change
> the flows depend on, run `npx react-native run-ios ...` again to re-embed.

---

## 2. Running the flows

```bash
cd homegroups/mobile
export MAESTRO_DRIVER_STARTUP_TIMEOUT=120000
D=94BA6684-181A-415C-A21D-7343B14F6BE2

# Smoke (read-only, safe):
maestro --device $D test maestro/flows/smoke-app-boot.yaml

# Green persona flows:
maestro --device $D test maestro/flows/conscience-vote-create-and-cast.yaml
maestro --device $D test maestro/flows/invite-code-join.yaml
maestro --device $D test maestro/flows/qr-meeting-checkin.yaml

# Signup — REQUIRES a unique email per run (see §3.2):
maestro --device $D test -e EMAIL="e2e-signup-$(date +%s)@homegroups-e2e.com" \
  maestro/flows/registration-signup.yaml

# Whole suite (config.yaml has continueOnFailure: true so all report at once):
maestro --device $D test maestro/
```

**Between conscience-vote runs**, delete the votes it creates (not idempotent):

```bash
node scripts/clean-e2e-votes.js   # (see §4) deletes group_conscience_votes for e2e-admin-group
```

---

## 3. MANUAL / OPS STEPS (cannot be automated in the flows)

### 3.1 🔴 GATED PROD DEPLOYS — require human review before running

The branch `e2e-launch-readiness` contains two fixes that are correct but **must be reviewed and
deployed to PROD by a human** because they change production behavior:

- **`firestore.rules` (members read fix).** Current prod runs OLDER rules; deploying the repo's
  _previous_ rules would break every user's group list, and this fix is what makes them safe.
  Step-by-step:

  1. `cd homegroups && npm --prefix functions run build` (no-op sanity) and `cd functions && npm run test:rules` — rules tests must pass.
  2. Review the diff: `git show <commit> -- firestore.rules`.
  3. Deploy: `firebase deploy --only firestore:rules --project recovery-connect-cad4b` (prod alias `default`).
  4. Smoke-check in prod that a real user's group list loads.

- **Region-function move (`joinGroupByInviteCode`, `sendGroupInviteEmail` → us-central1).** These
  were pinned to `us-west1`/`us-east1` but the client calls `us-central1`, so invite-join is 100%
  broken in prod. Moving a function's region requires DELETE + recreate (Firebase won't move it
  in place). Step-by-step (do in a low-traffic window):
  1. Deploy the new us-central1 versions: `firebase deploy --only functions:joinGroupByInviteCode,functions:sendGroupInviteEmail --project recovery-connect-cad4b`.
  2. Delete the stale old-region copies:
     ```bash
     firebase functions:delete joinGroupByInviteCode --region us-west1 --project recovery-connect-cad4b --force
     firebase functions:delete sendGroupInviteEmail  --region us-east1 --project recovery-connect-cad4b --force
     ```
  3. Verify: `firebase functions:list --project recovery-connect-cad4b | grep -E 'joinGroupByInviteCode|sendGroupInviteEmail'` → both `us-central1`.
  4. Manually test invite-code join end-to-end in a prod build.

### 3.2 Signup — unique email per run

`registration-signup.yaml` reads `${EMAIL}`. Firebase rejects a duplicate email, so **always pass a
unique one** (see §2). In CI, inject `EMAIL=e2e-signup-$RUN_ID@homegroups-e2e.com`. To keep the test
project clean, periodically delete accumulated `e2e-signup-*` users (Console → Authentication, or an
Admin script).

### 3.3 group-creation — Google Places address is a live-network boundary

Step 2 of the create-group wizard requires a real address chosen from the Google Places Autocomplete
dropdown (`LocationPicker`), which has no testID and needs live network + a real Maps key. The flow
**stops at this boundary** by design. To exercise steps 3–4 you must either (a) add a debug hook /
testID to set the address without live Places, or (b) run with a real `GOOGLE_MAPS_API_KEY` in `.env`
and accept network flakiness. Manual verification: run the flow, then manually type an address in the
Places field and pick a suggestion.

### 3.4 Payment flows stop at the Stripe boundary (by design)

`group-admin-claim-and-pay` and any subscription path intentionally stop at the Stripe CardForm — the
flows never submit real card details. Full payment E2E needs a real homegroups Stripe **test**
publishable key in `homegroups/mobile/.env` (`STRIPE_TEST_PUBLISHABLE_KEY`) and Stripe **test** secrets
in the e2e functions (currently placeholders). Those are ops-provisioned, not scripted.

### 3.5 `.env` for local builds

`homegroups/mobile/.env` is gitignored and holds `STRIPE_TEST_PUBLISHABLE_KEY` + `GOOGLE_MAPS_API_KEY`.
Placeholders are enough to boot the app and run the non-payment flows; real keys are needed for the
payment/Places boundaries above. (The app now guards a missing key instead of crashing — see the
Stripe fix — but a `.env` is still recommended locally.)

### 3.6 Storage rules NOT deployed to e2e

Firebase Storage needs a one-time Console "Get Started" per project. It's not on any persona-flow path,
so it was skipped. If a future flow needs Storage: Console → Storage → Get Started, then
`firebase deploy --only storage --project homegroups-e2e`.

---

## 4. Helper scripts (in `homegroups/scripts/`, to be committed)

- `seed-e2e.js` — mints an owner token from the firebase-tools refresh token → Firestore REST commit;
  writes the 4 personas + groups/members/meeting/servicePosition/invite. Idempotent.
- `clean-e2e-votes.js` — deletes `group_conscience_votes` for `e2e-admin-group` between runs.

Personas (all password `TestPassword123!`): `test-admin@`, `test-unclaimed-member@`,
`test-treasurer@`, `test-filler@` `homegroups-e2e.com`.

---

## 5. Flow status (2026-08-01)

| Flow                            | Status                                                       |
| ------------------------------- | ------------------------------------------------------------ |
| smoke-app-boot                  | ✅                                                           |
| conscience-vote-create-and-cast | ✅ 37/37                                                     |
| invite-code-join                | ✅ 24/24                                                     |
| qr-meeting-checkin              | ✅ 26/26                                                     |
| registration-signup             | 🔧 in progress (undefined-field write bug fixed; validating) |
| group-creation                  | ⏳ (stops at Places boundary — §3.3)                         |
| group-admin-claim-and-pay       | ⏳ (stops at Stripe boundary — §3.4)                         |
| treasurer-handoff-completion    | ⏳                                                           |
