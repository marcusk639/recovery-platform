# Stripe React Native version decision (B8)

Date: 2026-10-21. Scope: `@stripe/stripe-react-native` in `regroup/mobile`, React Native 0.72.17.

## Decision

**Use `@stripe/stripe-react-native` exactly `0.44.0`** on both platforms. Fallback: `0.43.0`.

The `package.json` range `^0.44.0` already resolves to 0.44.0 (it is the only 0.44.x release), and
`package-lock.json` pins it. The mismatch is on the iOS side: `ios/Podfile.lock` was generated with
0.67.0 (native Stripe iOS 25.17.0). The fix is to regenerate the iOS pods against 0.44.0 (done in the same PR),
not to raise the JS package.

## Why only 0.44.0 fits

Every version from 0.45.0 through 0.69.0 has `StripeSdkPackage : BaseReactPackage()` in its Android
Kotlin source. `BaseReactPackage` does not exist in React Native 0.72.17 (0 matches in the 0.72.17
tarball; present in 0.74.0). Android compile fails with `Unresolved reference 'BaseReactPackage'`.
`peerDependencies` does not catch this: every candidate declares `react-native: "*"`.

## Facts

Source: published npm tarballs (`npm pack`), inspected directly.

| Version | RN peer | Android package base class | Native Android SDK | Native iOS SDK | iOS min | Android compile/min (wrapper) | Fits RN 0.72.17 |
| ------- | ------- | -------------------------- | ------------------ | -------------- | ------- | ----------------------------- | --------------- |
| 0.43.0  | `*`     | `ReactPackage`             | 21.6.+             | 24.7.0         | 13.0    | 30 / 21                       | yes             |
| 0.44.0  | `*`     | `ReactPackage`             | 21.10.+            | 24.11.0        | 13.0    | 30 / 21                       | **yes**         |
| 0.45.0  | `*`     | `BaseReactPackage`         | 21.12.+            | 24.12.0        | 13.0    | 30 / 21                       | no              |
| 0.46.0  | `*`     | `BaseReactPackage`         | 21.12.+            | 24.12.0        | 13.0    | 30 / 21                       | no              |
| 0.50.3  | `*`     | `BaseReactPackage`         | 21.22.+            | 24.19.0        | 13.0    | 30 / 21                       | no              |
| 0.55.0  | `*`     | `BaseReactPackage`         | 21.26.+            | 24.24.0        | 13.0    | 30 / 21                       | no              |
| 0.67.0  | `*`     | `BaseReactPackage`         | 23.10.+            | 25.17.0        | 13.0    | 36 / 23                       | no              |

0.45.0 is the first release that switches to `BaseReactPackage`; 0.50.x to 0.69.x were sampled at
0.50.3, 0.55.0 and 0.67.0, all affected. 0.67.0 additionally needs Kotlin 2.2.21 and compileSdk 36.

## App-side constraints (unchanged by this decision)

- `ios/Podfile`: `platform :ios, '15.0'`, above 0.44.0's iOS 13.0 minimum. It was 13.0; the same PR raised it because Xcode 27.1 cannot build for older targets.
- `android/build.gradle`: `minSdkVersion 23`, `compileSdkVersion 34`, AGP 8.1.1, Kotlin 2.1.20.
  The root `stripeVersion = "21.14.0"` override takes precedence over the wrapper's `21.10.+`
  default. The comments there record why higher native versions break 0.44.0's Kotlin.
- The Android pin and the iOS pods are independent: iOS pulls Stripe iOS `~> 24.11.0` from the
  wrapper's podspec. The same PR regenerates `Podfile.lock` and verifies an iOS build.

## History: PR #63

Commit `35fefa1` (included in #63, `3cae409`) downgraded the wrapper to 0.44.0 because 0.55.0 failed
`:stripe_stripe-react-native:compileDebugKotlin` with `Unresolved reference 'BaseReactPackage'` plus
three "overrides nothing" errors. This analysis reproduces the cause across all later versions.
Moving the JS package up to match the 0.67.0 pods would bring that Android failure back; the
iOS lockfile is what must change. No version above 0.44.0 is safe until React Native is upgraded to
0.74 or later.

## Fallback

0.43.0 (next lower version with plain `ReactPackage`): native Android 21.6.+, iOS 24.7.0. Use it only
if iOS 24.11.0 fails to build. It would need the Android `stripeVersion` pin rechecked.

## Evidence

- `npm pack @stripe/stripe-react-native@<v>`: `android/src/main/java/com/reactnativestripesdk/StripeSdkPackage.kt`,
  `android/gradle.properties`, `stripe-react-native.podspec`.
- `npm view @stripe/stripe-react-native@<v> peerDependencies`.
- `npm pack react-native@0.72.17` vs `react-native@0.74.0`: `ReactAndroid/.../BaseReactPackage.java`
  present only in 0.74.0.
- `git show 35fefa1` and `git show 3cae409`.
- Repo files: `regroup/mobile/ios/Podfile`, `ios/Podfile.lock`, `android/build.gradle`, `package.json`.
