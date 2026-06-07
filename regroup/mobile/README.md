# Regroup — Sober Living House Management

React Native mobile application for managing sober living houses. Supports two operating models:

- **Traditional**: Manager-operated houses with compliance tracking, disputes, and rent collection
- **Oxford House**: Democratically self-governed with officers, voting, EES (Equal Expense Share), and business meetings

## Tech Stack

- React Native 0.72 (TypeScript)
- Firebase / Firestore for data and auth
- Redux Toolkit (client state) + React Query (server state)
- Stripe Connect Express for rent payments
- React Navigation 6

## Quick Start

### Prerequisites

- Node 18+
- Xcode 15+ (iOS) or Android Studio (Android)
- CocoaPods (`gem install cocoapods`)
- Firebase CLI (`npm install -g firebase-tools`)

### Setup

```bash
# Install dependencies (node_modules is a symlink — see note below)
npm install

# iOS: install pods
cd ios && pod install && cd ..

# Run iOS simulator
npm run ios

# Run Android emulator
npm run android
```

### Xcode 26+ Build Fix

React Native 0.72 requires a Podfile post_install hook for Xcode 26+. This is already applied in `ios/Podfile`. If you encounter VFS overlay errors, run `cd ios && pod install`.

### node_modules Symlink

`node_modules` in this repo is a symlink to `../rats/node_modules`. If you clone fresh, run `npm install` from this directory — it will create the symlink target.

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
  navigation/    # React Navigation setup + deep linking
  util/          # Utilities (compliance, formatting, permissions)
e2e/             # Detox E2E tests
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

# Integration tests (requires Firebase emulator)
firebase emulators:start --only firestore,auth
npm run test:integration

# E2E tests (requires staging Firebase project)
E2E_FIREBASE_PROJECT=rats-dev npm run test:e2e:ios
```

## Related Repos

- **functions** (`../functions/`) — Firebase Cloud Functions (payment processing, webhooks)
- **web** (`../web/`) — Angular web portal

## Payment Amount Convention

All payment amounts in the `payments` Firestore collection and service functions use **US cents** (integer). Example: `50000` = $500.00. Convert at the UI boundary with `Math.round(dollars * 100)`.
