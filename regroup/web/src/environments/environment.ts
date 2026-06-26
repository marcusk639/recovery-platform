// This file can be replaced during build by using the `fileReplacements` array.
// `ng build --prod` replaces `environment.ts` with `environment.prod.ts`.
// The list of file replacements can be found in `angular.json`.

export const environment = {
  production: false,
  appName: "App Name",
  // Stripe publishable key (safe to ship to the browser). Dev uses the test key;
  // environment.prod.ts must supply the live `pk_live_...` key for production.
  stripePublishableKey: "pk_test_PHY9XItnPuSWxhpixEkULA0o00DfMn6uns",
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

/*
 * For easier debugging in development mode, you can import the following file
 * to ignore zone related error stack frames such as `zone.run`, `zoneDelegate.invokeTask`.
 *
 * This import should be commented out in production mode because it will have a negative impact
 * on performance if an error is thrown.
 */
// import 'zone.js/dist/zone-error';  // Included with Angular CLI.
