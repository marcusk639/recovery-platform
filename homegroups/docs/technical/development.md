# Development Setup Guide

**Last updated:** 2026-02-05
**Purpose:** Get your development environment running locally
**Time needed:** 30-45 minutes (first-time setup)

---

## Table of Contents

1. [Prerequisites](#prerequisites)
2. [Project Structure](#project-structure)
3. [Backend Setup](#backend-setup-firebase--cloud-functions)
4. [Mobile App Setup](#mobile-app-setup)
5. [Web App Setup](#web-app-setup)
6. [Running Locally](#running-locally)
7. [Troubleshooting](#troubleshooting)
8. [Common Development Tasks](#common-development-tasks)

---

## Prerequisites

You'll need these tools installed:

- **Node.js 14+** - [Download](https://nodejs.org/)
  - Verify: `node --version` (should be v14+)

- **npm or Yarn** - Usually comes with Node.js
  - Verify: `npm --version` or `yarn --version`

- **Git** - [Download](https://git-scm.com/)
  - Verify: `git --version`

- **Firebase CLI** - For backend and deployment
  ```bash
  npm install -g firebase-tools
  firebase --version
  ```

### For Mobile Development

You'll also need one of the following:

- **For iOS**: Xcode (macOS only)
  - Download from App Store
  - Includes iOS Simulator
  - `xcode-select --install` (command line tools)

- **For Android**: Android Studio or Android SDK
  - [Download Android Studio](https://developer.android.com/studio)
  - Or just Android SDK (if you prefer)

---

## Project Structure

Here's how the Homegroups project is organized:

```
Homegroups/
├── README.md                      # High-level app overview
├── docs/                          # Documentation (you are here)
│   ├── 00-DOCUMENTATION-INDEX.md # Documentation guide (START HERE)
│   ├── DEVELOPMENT.md            # This file
│   ├── PRODUCT_REQUIREMENTS.md   # What we're building
│   ├── ROADMAP.md                # Timeline and priorities
│   ├── SECURITY_RULES_QUICKREF.md # Deployment checklist
│   ├── SECURITY_RULES.md         # Detailed Firestore rules
│   ├── MESSAGING_ENGINEERING.md  # Chat/messaging system
│   └── plans/                    # Sprint plans and analyses
├── mobile/                        # React Native mobile app (iOS + Android)
│   ├── README.md                 # Mobile-specific setup
│   ├── src/
│   │   ├── screens/              # UI screens
│   │   ├── components/           # Reusable UI components
│   │   ├── services/             # Firebase, auth, models
│   │   ├── store/                # Redux state management
│   │   └── App.tsx               # App entry point
│   ├── ios/                      # iOS native code
│   ├── android/                  # Android native code
│   ├── package.json              # Dependencies
│   └── tsconfig.json             # TypeScript config
├── web/                          # React web marketing site
│   ├── README.md                 # Web-specific setup
│   ├── src/
│   │   ├── components/           # React components
│   │   ├── pages/                # Page components
│   │   └── App.tsx               # App entry point
│   ├── public/
│   │   └── .well-known/
│   │       └── apple-app-site-association  # iOS deep linking config
│   ├── package.json              # Dependencies
│   └── tsconfig.json             # TypeScript config
├── functions/                    # Firebase Cloud Functions
│   ├── src/
│   │   ├── callable/             # Functions callable from app
│   │   ├── triggers/             # Event-triggered functions
│   │   ├── services/             # Helper services
│   │   └── index.ts              # Function exports
│   ├── package.json              # Dependencies
│   ├── tsconfig.json             # TypeScript config
│   └── .env.example              # Environment variables template
├── firestore.rules               # Firestore security rules (CRITICAL)
├── firebase.json                 # Firebase configuration
└── .firebaserc                   # Firebase project references

Key directories to know:
- docs/ → Start here for information
- mobile/src/store/ → Redux state management
- mobile/src/services/ → Firebase models and auth
- functions/src/ → Backend logic and triggers
```

---

## Backend Setup (Firebase + Cloud Functions)

### 1. Firebase Authentication

Homegroups uses Firebase for backend. You need a Firebase project.

**Option A: Use Existing Project**
If you have access to the shared Firebase project:

```bash
firebase login
firebase projects:list
firebase use <project-id>
```

**Option B: Create Local Test Project**
For local development/testing:

```bash
firebase init
# Select: Firestore, Functions, Hosting, Emulator Suite
# Choose a new project name
# Use TypeScript for functions
```

### 2. Setup Cloud Functions

```bash
cd functions

# Install dependencies
npm install

# Build TypeScript
npm run build

# Run tests
npm test

# Deploy to Firebase (when ready)
npm run deploy
```

### 3. Start Firebase Emulator Suite

For local development without using live Firebase:

```bash
firebase emulators:start
```

This starts:
- **Firestore Emulator** at `localhost:8080`
- **Firebase Functions** at `localhost:5001`
- **Firebase Hosting** at `localhost:5000`
- **Authentication Emulator** at `localhost:9099`

Emulator UI: Open `http://localhost:4000`

**To connect your app to emulators**, the mobile/web apps need to connect to these local servers (see respective setup sections).

---

## Mobile App Setup

### 1. Install Dependencies

```bash
cd mobile

# Install npm dependencies
npm install

# Install pod dependencies (iOS)
cd ios
pod install
cd ..
```

### 2. Configure Firebase (Mobile)

The mobile app needs to know which Firebase project to use.

**Check configuration:**
```bash
# This file should already be configured
ls -la google-services.json      # Android
ls -la GoogleService-Info.plist  # iOS
```

If files don't exist, download from Firebase Console:
1. Go to Firebase Console → Project Settings
2. Download `google-services.json` (Android)
3. Download `GoogleService-Info.plist` (iOS)
4. Place in correct directories

### 3. Connect to Firebase Emulators (Optional but Recommended for Development)

Edit `mobile/src/services/firebase/config.ts`:

```typescript
// For local development, use emulators
const db = getFirestore(app);

if (__DEV__) {
  connectFirestoreEmulator(db, 'localhost', 8080);
  connectFunctionsEmulator(getFunctions(app), 'localhost', 5001);
}
```

### 4. Run Metro Bundler

Metro is the JavaScript bundler for React Native.

```bash
cd mobile
npm start
```

This starts a development server on `http://localhost:8081`

Keep this running in its own terminal while developing.

### 5. Run on Simulator/Emulator

#### iOS (macOS only)

```bash
# In a new terminal
cd mobile
npm run ios

# Or specify a device
npm run ios -- --simulator="iPhone 14"
```

#### Android

```bash
# Make sure Android emulator is running first
# Option 1: Open Android Studio and start an emulator
# Option 2: From command line:
emulator -avd <emulator_name>

# Then in a new terminal:
cd mobile
npm run android
```

### 6. Mobile App Hot Reload

While the Metro server is running:
- **iOS**: Press `Cmd + R` in Simulator to reload
- **Android**: Press `R` twice in Emulator, or select "Reload" from dev menu

---

## Web App Setup

### 1. Install Dependencies

```bash
cd web
npm install
```

### 2. Start Development Server

```bash
npm start
```

Opens `http://localhost:3000` with hot reload enabled.

### 3. Build for Production

```bash
npm run build
```

Creates optimized build in `web/build/`

### 4. Deploy to Firebase Hosting

```bash
firebase deploy --only hosting
```

---

## Running Locally

### Full Local Development Stack

**Terminal 1 - Firebase Emulators:**
```bash
firebase emulators:start
# Outputs emulator URLs, note them for next step
```

**Terminal 2 - Metro Bundler (Mobile):**
```bash
cd mobile
npm start
```

**Terminal 3 - Mobile App:**
```bash
cd mobile
npm run ios
# OR
npm run android
```

**Terminal 4 (Optional) - Web App:**
```bash
cd web
npm start
# Opens http://localhost:3000
```

Now you have:
- Mobile app on Simulator/Emulator (connected to local Firebase)
- Web app on `http://localhost:3000` (connected to local Firebase)
- Firebase Emulator UI on `http://localhost:4000` (inspect your data)
- Functions running locally on `localhost:5001`

### Testing Against Live Firebase

If you need to test against actual Firebase (not emulators):

1. Make sure `connectFirestoreEmulator()` calls are commented out
2. Make sure `google-services.json` and `GoogleService-Info.plist` point to real project
3. Run: `npm run ios` or `npm run android`

---

## Troubleshooting

### Metro Bundler Issues

**Problem**: Metro won't start, or says port 8081 is in use

**Solution:**
```bash
# Kill process on port 8081
lsof -ti:8081 | xargs kill -9

# Clear cache
cd mobile
npm start -- --reset-cache
```

### Firebase Emulator Issues

**Problem**: Emulator won't start, error about port 8080

**Solution:**
```bash
# Kill process on port 8080
lsof -ti:8080 | xargs kill -9

# Clear emulator state
firebase emulators:start --import=./backup --export-on-exit
```

### iOS Build Issues

**Problem**: Xcode build failures, especially "pod" errors

**Solution:**
```bash
cd mobile/ios
rm -rf Pods
rm Podfile.lock
pod install
cd ..
npm run ios
```

### Android Build Issues

**Problem**: Gradle build failures

**Solution:**
```bash
cd mobile
# Clear Android build cache
./gradlew clean

# Rebuild
npm run android
```

### App Won't Connect to Emulators

**Problem**: App can't reach Firestore emulator at localhost:8080

**Solution:**
- Make sure emulators are actually running: `firebase emulators:start`
- Check `mobile/src/services/firebase/config.ts` has correct emulator addresses
- On Android Emulator (not physical device), localhost might not work:
  ```typescript
  // Use 10.0.2.2 on Android Emulator instead of localhost
  const host = Platform.OS === 'android' ? '10.0.2.2' : 'localhost';
  connectFirestoreEmulator(db, host, 8080);
  ```

### TypeScript Errors

**Problem**: TypeScript compilation errors

**Solution:**
```bash
# Rebuild TypeScript
npm run build

# Type-check only (no build)
npx tsc --noEmit
```

---

## Common Development Tasks

### Adding a New Feature

1. **Create component or screen**
   ```bash
   # In mobile/src/screens or mobile/src/components
   touch NewFeature.tsx
   ```

2. **Add to Redux store** (if needed)
   - Edit `mobile/src/store/slices/mySlice.ts`
   - Add reducer, actions, and thunks

3. **Create Firebase service** (if needed)
   - Add to `mobile/src/services/firebase/models/MyModel.ts`

4. **Add to navigation**
   - Edit `mobile/src/navigation/...` files

5. **Test on simulator/emulator**

### Modifying Firestore Rules

1. Edit `firestore.rules`
2. Deploy locally (already running if using emulators)
3. Test the change
4. When ready: `firebase deploy --only firestore:rules`

See [Security Rules Quick Reference](./SECURITY_RULES_QUICKREF.md) for deployment checklist.

### Adding a Cloud Function

1. Create file in `functions/src/` (callable or trigger)
   ```bash
   touch functions/src/callable/myFunction.ts
   ```

2. Export from `functions/src/index.ts`
   ```typescript
   export { myFunction } from './callable/myFunction';
   ```

3. Build and test
   ```bash
   cd functions
   npm run build
   npm test
   ```

4. Deploy when ready
   ```bash
   firebase deploy --only functions
   ```

### Debugging Firebase Functions

**View logs:**
```bash
firebase functions:log
firebase functions:log --only myFunctionName
```

**Attach debugger:**
```bash
firebase emulators:start --inspect-functions
# Then in Chrome: `chrome://inspect`
```

### Running Tests

**Mobile tests:**
```bash
cd mobile
npm test
```

**Cloud Functions tests:**
```bash
cd functions
npm test
```

---

## Next Steps

1. **Read the overview**: Check [Architecture & Features](../README.md)
2. **Understand the roadmap**: See [Roadmap](./ROADMAP.md)
3. **Check security setup**: Review [Security Rules Quick Reference](./SECURITY_RULES_QUICKREF.md)
4. **Pick a task**: Find an issue or use [Roadmap](./ROADMAP.md) for next feature

---

## Additional Resources

- [Firebase Documentation](https://firebase.google.com/docs)
- [React Native Documentation](https://reactnative.dev/docs/getting-started)
- [React Documentation](https://react.dev)
- [TypeScript Handbook](https://www.typescriptlang.org/docs/)

---

## Getting Help

- Check this file's troubleshooting section
- Review project issues for similar problems
- Check Firebase console logs
- Use Firebase Emulator UI to inspect data state
