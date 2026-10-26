// e2e-emulator: the web app against the local Firebase Emulator Suite.
//   ng serve --configuration e2e-emulator   /   ng build --configuration e2e-emulator
//
// The project id is a `demo-` id, which the Firebase CLI and SDKs treat as
// emulator-only: there is no real project behind it, so nothing here can reach
// production. Ports match regroup/mobile/firebase/firebase.json (auth 9099,
// firestore 8080, storage 9199) plus the default functions port 5001.
//
// Startup is fail-closed: the APP_INITIALIZER from src/app/emulator-providers.ts
// aborts bootstrap unless every emulator below can be wired and answers.
// NOTE: with AngularFire 6.0.0 / firebase 7.14.2, auth and storage cannot be
// pointed at an emulator, so this configuration currently refuses to start.
// It becomes usable once the SDKs are upgraded and those two are wired.

export const environment = {
  production: false,
  appName: 'App Name',
  // Stripe test-mode publishable key (same one environment.ts uses for dev).
  stripePublishableKey: 'pk_test_PHY9XItnPuSWxhpixEkULA0o00DfMn6uns',
  firebaseConfig: {
    apiKey: 'demo-api-key',
    authDomain: 'demo-regroup-e2e.firebaseapp.com',
    projectId: 'demo-regroup-e2e',
    storageBucket: 'demo-regroup-e2e.appspot.com',
    messagingSenderId: '000000000000',
    appId: '1:000000000000:web:0000000000000000000000',
  },
  useEmulators: true,
  emulators: {
    host: '127.0.0.1',
    ports: { auth: 9099, firestore: 8080, storage: 9199, functions: 5001 },
  },
};
