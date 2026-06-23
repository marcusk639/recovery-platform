export const environment = {
  production: true,
  appName: "App Name",
  // LAUNCH BLOCKER (C2): replace with the live Stripe publishable key
  // (`pk_live_...`) before production deploy. Publishable keys are safe to ship
  // to the browser. Until this is set, the web billing path cannot charge cards.
  stripePublishableKey: "pk_live_7aliRHmckYVQEJh7HseJ4PTa00GasKVZ81",
  firebaseConfig: {
    apiKey: "AIzaSyDTUKZ8_WPfdHrohySL2vycMkUyrbM1xJQ",
    authDomain: "phoenix-cleanhouse.firebaseapp.com",
    databaseURL: "https://phoenix-cleanhouse.firebaseio.com",
    projectId: "phoenix-cleanhouse",
    storageBucket: "phoenix-cleanhouse.appspot.com",
    messagingSenderId: "155667333239",
    appId: "1:155667333239:web:ab3c29130202482a1a0672",
    measurementId: "G-2BMBBMD7Y5",
  },
};
