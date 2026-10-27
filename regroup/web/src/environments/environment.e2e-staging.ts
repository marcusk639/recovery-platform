// e2e-staging: the web app against the deployed `regroup-e2e` Firebase project.
//   ng serve --configuration e2e-staging   /   ng build --configuration e2e-staging
//
// The web config is NOT committed. It is generated, gitignored, by the
// regroup/e2e package into ./e2e-staging.generated.ts. If that file is missing,
// the build fails with "Cannot find module './e2e-staging.generated'": generate
// it first. The shape is in ./e2e-staging.generated.example.ts.
import { e2eStaging } from './e2e-staging.generated';
import { assertE2eStagingConfig } from './e2e-staging-guard';

// Fail closed unless the generated file targets the regroup-e2e project, holds
// nothing from production (project id, project number, API key, bucket,
// authDomain, databaseURL, measurementId) and uses a pk_test_ Stripe key.
assertE2eStagingConfig(e2eStaging);

export const environment = {
  production: false,
  appName: 'App Name',
  stripePublishableKey: e2eStaging.stripePublishableKey,
  firebaseConfig: e2eStaging.firebaseConfig,
  useEmulators: false,
};
