# Regroup — Sober Living House Management

React Native mobile application for managing sober living houses. Supports two operating models:

- **Traditional**: Manager-operated houses with compliance tracking, disputes, and rent collection
- **Oxford House**: Democratically self-governed with officers, voting, EES (Equal Expense Share), and business meetings

## Tech Stack

- React Native 0.88.1 (TypeScript, New Architecture, Hermes)
- Firebase / Firestore for data and auth
- Redux Toolkit (client state) + React Query (server state)
- Stripe Connect Express for rent payments
- React Navigation 7

## Quick Start

### Prerequisites

- Node 22.13+ (`engines` in `package.json`)
- Xcode (iOS; deployment target 15.1) or Android Studio (Android)
- CocoaPods (`gem install cocoapods`)
- Firebase CLI (`npm install -g firebase-tools`)

### Setup

```bash
# Install dependencies
npm install

# iOS: install pods
cd ios && pod install && cd ..

# Run iOS simulator
npm run ios

# Run Android emulator
npm run android
```

### Podfile build fixes

`ios/Podfile`'s `post_install` hook runs `react_native_post_install`, sets every pod's deployment target to 15.1, and carries per-pod workarounds, including BoringSSL-GRPC compiler flags and header search paths for `react-native-html-to-pdf` and `react-native-date-picker` under RN 0.88's prebuilt core. The comments in the hook explain each one. After changing the Podfile, run `cd ios && pod install`.

### node_modules

`node_modules` is an ordinary directory created by `npm install` here; it is not a symlink.

## Project Structure

```
src/
  components/    # 60+ reusable UI components
  screens/       # 30+ screen modules (Activity, Oxford, Payments, etc.)
  services/      # Firebase/Firestore operations
  state/
    slices/      # Redux Toolkit slices (client state)
    queries/     # React Query hooks (server state)
  entities/      # Data models (Guest, House, Officer, Vote, etc.)
  hooks/         # Custom React hooks
  context/       # React contexts (Auth, Data, Modal, Notification)
  navigation/    # React Navigation setup + allowlisted deep linking (linking.ts)
  util/          # Utilities (compliance, formatting, permissions)
e2e/             # E2E seed fixtures (e2e/setup/) and test-credential notes
maestro/         # Maestro flows, subflows and seed/run scripts
firebase/        # Firestore security rules
```

## Testing

```bash
# Unit tests
npm test

# Unit tests (watch mode)
npm run test:watch

# Coverage report
npm run test:coverage

# Integration tests (Firestore + Auth emulators, started by emulators:exec;
# see "Emulator-backed suites" in CLAUDE.md)
cd firebase && firebase emulators:exec --only firestore,auth --project demo-test \
  "cd .. && npx jest --config jest.config.integration.js --no-coverage --forceExit"

# E2E tests (Maestro; needs E2E_TEST_PASSWORD, see e2e/SECURITY-test-credentials.md)
npm run maestro:smoke:ios
```

## Related Repos

- **functions** (`../functions/`) — Firebase Cloud Functions (payment processing, webhooks)
- **web** (`../web/`) — Angular web portal

## Payment Amount Convention

All payment amounts in the `payments` Firestore collection and service functions use **US cents** (integer). Example: `50000` = $500.00. Convert at the UI boundary with `Math.round(dollars * 100)`.
