// e2e-staging: the web app against the deployed `regroup-e2e` Firebase project.
//   ng serve --configuration e2e-staging   /   ng build --configuration e2e-staging
//
// The web config is NOT committed. It is generated, gitignored, by the
// regroup/e2e package into ./e2e-staging.generated.ts. If that file is missing,
// the build fails with "Cannot find module './e2e-staging.generated'": generate
// it first. The shape is in ./e2e-staging.generated.example.ts.
import { e2eStaging } from './e2e-staging.generated';

const EXPECTED_PROJECT_ID = 'regroup-e2e';

// Fail closed if the generated file points anywhere but the e2e project
// (in particular, never the production project) or carries a live Stripe key.
if (e2eStaging.firebaseConfig.projectId !== EXPECTED_PROJECT_ID) {
  throw new Error(
    `e2e-staging.generated.ts must target "${EXPECTED_PROJECT_ID}", ` +
      `got "${e2eStaging.firebaseConfig.projectId}". Refusing to start.`,
  );
}
if (!/^pk_test_/.test(e2eStaging.stripePublishableKey)) {
  throw new Error(
    'e2e-staging.generated.ts must use a Stripe test-mode (pk_test_) key. Refusing to start.',
  );
}

export const environment = {
  production: false,
  appName: 'App Name',
  stripePublishableKey: e2eStaging.stripePublishableKey,
  firebaseConfig: e2eStaging.firebaseConfig,
  useEmulators: false,
};
