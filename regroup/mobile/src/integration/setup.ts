// src/integration/setup.ts
// Connect to Firebase emulators BEFORE any Firebase module is imported

process.env.FIRESTORE_EMULATOR_HOST = 'localhost:8080';
process.env.FIREBASE_AUTH_EMULATOR_HOST = 'localhost:9099';

// Mock React Native Firebase modules that require native bridges.
// @react-native-firebase/firestore is mapped to firebase-admin via jest.config.integration.js.
// All other RN Firebase packages are stubbed out here so they don't crash in Node.js.

jest.mock('@react-native-firebase/app', () => ({
  __esModule: true,
  default: { app: jest.fn(() => ({})), apps: [], initializeApp: jest.fn() },
}));

jest.mock('@react-native-firebase/auth', () => {
  const mockAuth = {
    currentUser: null,
    signInWithEmailAndPassword: jest.fn(() => Promise.resolve({ user: {} })),
    signOut: jest.fn(() => Promise.resolve()),
    onAuthStateChanged: jest.fn(() => () => {}),
    createUserWithEmailAndPassword: jest.fn(() =>
      Promise.resolve({ user: {} }),
    ),
  };
  return {
    __esModule: true,
    default: jest.fn(() => mockAuth),
    FirebaseAuthTypes: {},
  };
});

jest.mock('@react-native-firebase/firestore', () => {
  // Provide FieldValue/Timestamp from firebase-admin so service functions that
  // call FirebaseFirestore.FieldValue.serverTimestamp() get real sentinel values.
  const adminFirestore = require('firebase-admin').firestore;
  const firestoreFn: any = jest.fn(() => require('firebase-admin').firestore());
  firestoreFn.FieldValue = adminFirestore.FieldValue;
  firestoreFn.Timestamp = adminFirestore.Timestamp;
  return { __esModule: true, default: firestoreFn, FirebaseFirestoreTypes: {} };
});

jest.mock('@react-native-firebase/storage', () => ({
  __esModule: true,
  default: jest.fn(() => ({
    ref: jest.fn(() => ({
      putFile: jest.fn(),
      getDownloadURL: jest.fn(() => Promise.resolve('mock-url')),
    })),
  })),
}));

jest.mock('@react-native-firebase/messaging', () => ({
  __esModule: true,
  default: jest.fn(() => ({
    getToken: jest.fn(() => Promise.resolve('mock-token')),
    onMessage: jest.fn(() => () => {}),
    requestPermission: jest.fn(() => Promise.resolve(1)),
  })),
}));

jest.mock('@react-native-firebase/functions', () => ({
  __esModule: true,
  default: jest.fn(() => ({
    httpsCallable: jest.fn(() => jest.fn(() => Promise.resolve({ data: {} }))),
  })),
}));

jest.mock('@react-native-firebase/analytics', () => ({
  __esModule: true,
  default: jest.fn(() => ({ logEvent: jest.fn(), setUserId: jest.fn() })),
}));

jest.mock('@react-native-firebase/crashlytics', () => ({
  __esModule: true,
  default: jest.fn(() => ({
    log: jest.fn(),
    recordError: jest.fn(),
    setUserId: jest.fn(),
  })),
}));

jest.mock('react-native-geolocation-service', () => ({
  __esModule: true,
  default: {
    getCurrentPosition: jest.fn(),
    watchPosition: jest.fn(() => 0),
    clearWatch: jest.fn(),
    stopObserving: jest.fn(),
    requestAuthorization: jest.fn(() => Promise.resolve('granted')),
  },
}));

// Wipe the emulator's Firestore data before each test file
beforeAll(async () => {
  const projectId = 'rats-v2-test';
  try {
    const response = await fetch(
      `http://localhost:8080/emulator/v1/projects/${projectId}/databases/(default)/documents`,
      { method: 'DELETE' },
    );
    if (!response.ok && response.status !== 404) {
      console.warn('Could not clear emulator data:', response.status);
    }
  } catch (e) {
    console.warn(
      'Emulator not running — skipping clear. Start with: firebase emulators:start --only firestore',
    );
  }
});
