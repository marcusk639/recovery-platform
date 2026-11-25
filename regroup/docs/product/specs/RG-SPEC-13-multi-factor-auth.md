# RG-SPEC-13 — Multi-factor authentication (post-launch)

**Status:** not built; planned for after launch (owner decision 2026-11-22, launch item M11). Roadmap row [RG-RM-20](../../go-to-market/roadmap.md).
**Who:** operators and managers first (they hold residents' records and the house's Stripe account); residents optional.
**Tier:** every tier. Account security isn't sold as a tier capability.

---

## Why the old screen was removed

The app had a "Two-Factor Authentication" screen (`mobile/src/screens/Personal/TwoFactorSetup.tsx`, reached from the Personal menu by admins). It sent an SMS code with `signInWithPhoneNumber`, linked the phone credential to the account with `linkWithCredential`, and then said "Your account is now protected with two-factor authentication."

Linking a phone adds another way to sign in. Sign-in never asked for a second factor, so the claim was false. The screen, its route (`Routes.TwoFactorSetup`) and its menu entry were removed before launch. Guard tests in `mobile/src/screens/Personal/__tests__/TwoFactorSetup.oplog.test.tsx` fail if the screen, a two-factor claim, or a phone sign-in call comes back. Delete or rewrite those guards in place in the PR that ships this spec.

The web site makes no MFA claim, and the store listings mustn't make one until this ships.

## What to build

Use Firebase Authentication's own multi-factor support. Don't hand-roll codes.

1. **Project setup (OPS).**
   - Upgrade `phoenix-cleanhouse` to Firebase Authentication with Identity Platform. It's billed per monthly active user above the free tier, and SMS is billed per message; check current pricing before enabling it.
   - Enable the TOTP factor, the SMS factor, or both.
   - Firebase requires a verified email before a user can enroll a second factor. Today the app doesn't require verification at signup (`verifyUserEmail` exists), so enrollment must check it first.
2. **Enrollment (mobile, then portal).**
   - Use `multiFactor(user).getSession()`, then either:
     - **TOTP:** `TotpMultiFactorGenerator.generateSecret`, show the QR code or secret, then `assertionForEnrollment` and `enroll`;
     - **SMS:** `new PhoneAuthProvider(auth).verifyPhoneNumber({ phoneNumber, session })`, then `PhoneMultiFactorGenerator.assertion` and `enroll`.
   - RNFirebase 26 exposes both, modular API (`@react-native-firebase/auth`).
   - Prefer TOTP: SMS costs money per code and can be SIM-swapped.
   - Show enrolled factors and let the user remove one. Removal needs a recent sign-in.
3. **Sign-in, on every client.**
   - A first-factor sign-in rejects with `auth/multi-factor-auth-required`. Each client must catch that, call `getMultiFactorResolver`, prompt for the code, and finish with `resolver.resolveSignIn`.
   - The clients:
     - mobile `EnhancedAuthService` sign-in;
     - the web app's login and signup-then-sign-in paths (`regroup/web`, Angular; check that its Firebase JS SDK version supports MFA);
     - the operator portal (`regroup/portal`).
   - A client that doesn't handle the error locks an enrolled user out. So ship the sign-in handling on every client before enrollment is offered anywhere.
4. **Optional enforcement.**
   - Callables that touch money or residents' records can check the ID token's `firebase.sign_in_second_factor` claim. They'd refuse admin calls without it once an owner turns on "require MFA for my staff".
   - That's a later, separate step. It needs a per-house setting and a recovery path.
5. **Recovery.**
   - A lost phone or authenticator must not mean a lost account.
   - Firebase has no built-in backup codes. Decide between support-assisted recovery (an admin SDK `updateUser` removing the factor after an identity check) and app-generated recovery codes, and write it down before launch of this feature.

## Acceptance

- An enrolled user can't sign in with the password alone, on mobile, web or portal.
- Every MFA claim in the app matches what is enforced.
- Rules and callable tests cover the optional enforcement claim, if it's built.
- New e2e coverage-matrix rows: enrollment, sign-in with the second factor, removal, and recovery. The old rows `OPS-039` and `DEVS-004` (SMS 2FA) are deferred post-launch and point here.

## Out of scope

- SMS-only "verification" that isn't a second factor.
- Passkeys (revisit when Firebase supports them natively).
