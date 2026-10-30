# regroup/mobile core

RN bare CLI app, codename `rats` (`app.json` name, iOS target/scheme `rats`, Android namespace `com.rats.dev`, applicationId `com.regroup.app`, iOS bundle `com.rats.dev`). Don't rename `rats` identifiers.

## Layout
- Entry: `index.js` (imports `./firebase-setup` first — e2e emulator wiring), `App.tsx` (provider tree), `firebase-setup.ts` (exports `auth`, `firestore`, `functions`, `messaging`, `storage` singletons + `callHttpsFunction`).
- `src/services/` Firestore/Functions wrappers; `src/state/{slices,queries}` Redux Toolkit + React Query; `src/navigation/` React Navigation 7 native-stack + bottom-tabs.
- Native: `android/` (Java MainApplication/MainActivity in `com/rats/dev`, Gradle with heavily commented pins), `ios/` (ObjC++ `AppDelegate.mm` with custom UIScene `SceneDelegate` — iOS 27 SDK requires UIScene).
- `patches/` (patch-package, load-bearing), `react-native.config.js` (launch-arguments linked only in iOS E2E configs), `babel.config.js` (BUNDLED_ENV inlining + E2E_VARIANT guards — do not simplify), `scripts/` (release-guard, bundled-env, typecheck-ratchet).
- Build variants: Android `e2eEmulator`/`e2eStaging` build types; iOS `E2EEmulator`/`E2EStaging` configs. Release guard requires `phoenix-cleanhouse` config + `pk_live_` key.

## Invariants
- Stripe native SDK version is pinned against the wrapper version (`android/build.gradle` `stripeVersion`); wrapper/RN/native are a coupled triple — see `docs/build/stripe-rn-version-decision.md`.
- Payments surface: `StripeProvider` (App.tsx), `usePaymentSheet` init/present in `ResidentPayment.tsx` and `RentPaymentScreen.tsx` (lazy `require` fallback when native module missing).
- Notifications: `react-native-push-notification` (Android local/scheduled + channels; iOS via `@react-native-community/push-notification-ios` hooks in AppDelegate.mm), `@notifee/react-native` only in `Splash.tsx`, FCM via RNFirebase messaging.
- Jest: `jest.setup.js` mocks all native modules; `firebase-setup` aliased to `__mocks__/firebase-setup.ts`; TZ forced to America/Chicago for snapshots.
- Unit suite baseline (2026-10-29, RN 0.72): 328 suites / 5264 tests; typecheck ratchet 137.
