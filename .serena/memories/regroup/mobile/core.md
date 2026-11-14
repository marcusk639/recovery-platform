# regroup/mobile core

RN 0.88.1 bare CLI app (React 19.3, New Architecture, Hermes), codename `rats` (`app.json` name, iOS target/scheme `rats`, Android namespace `com.rats.dev`, applicationId `com.regroup.app`, iOS bundle `com.rats.dev`). Don't rename `rats` identifiers.

## Layout
- Entry: `index.js` (imports `./firebase-setup` first — e2e emulator wiring), `App.tsx` (provider tree), `firebase-setup.ts` (exports modular `auth`, `firestore`, `functions`, `messaging`, `storage` instances + `callHttpsFunction`; RNFirebase 26, modular API only).
- `src/services/` Firestore/Functions wrappers; `src/state/{slices,queries}` Redux Toolkit + React Query; `src/navigation/` React Navigation 7 native-stack + bottom-tabs.
- Native: `android/` (Kotlin `MainApplication.kt`/`MainActivity.kt` in `com/rats/dev`, AGP 9.2.1, Gradle 9.4.1, no Flipper), `ios/` (ObjC++ `AppDelegate.mm` on `RCTReactNativeFactory` with a UIScene `SceneDelegate`, iOS 15.1, static frameworks).
- `patches/` (patch-package, load-bearing), `react-native.config.js` (launch-arguments linked only in iOS E2E configs), `babel.config.js` (BUNDLED_ENV inlining + E2E_VARIANT guards — do not simplify), `scripts/` (release-guard, bundled-env, typecheck-ratchet).
- Build variants: Android `e2eEmulator`/`e2eStaging` build types; iOS `E2EEmulator`/`E2EStaging` configs. Release guard requires `phoenix-cleanhouse` config + `pk_live_` key.

## Invariants
- Stripe: `@stripe/stripe-react-native` 0.83.0, which brings its own native SDKs (Android 23.24.0; no `stripeVersion` pin any more). Not 0.84: its iOS SDK is SPM-only and needs dynamic frameworks, which RNFirebase's static linkage rules out (`docs/build/react-native-0.88-upgrade.md`, Task 13).
- Payments surface: `StripeProvider` (App.tsx), `usePaymentSheet` init/present in `ResidentPayment.tsx` and `RentPaymentScreen.tsx` (lazy `require` fallback when native module missing).
- Notifications: `react-native-notify-kit` (channels `default` / `default-channel-id`, trigger-based rent reminder in `src/services/notifications/`), FCM via RNFirebase messaging; iOS foreground presentation in `firebase.json`.
- Keyboard: `react-native-keyboard-controller` (`src/components/rats-keyboard/`); modals render their own `RatsKeyboardToolbar`.
- Jest: preset `@react-native/jest-preset`; `jest.setup.js` mocks native modules; `firebase-setup` aliased to `__mocks__/firebase-setup.ts`; Firebase op-log mock in `__mocks__/firebase-modular/` (`*.oplog.test.ts`); TZ forced to America/Chicago in `jest.config.js`.
- Unit suite baseline (2026-11-03, RN 0.88.1 branch): 402 suites / 5,998 tests; typecheck ratchet 121. (RN 0.72, 2026-10-29: 328 / 5,264; ratchet 137.)
