// Guard for the generated e2e-staging config (see environment.e2e-staging.ts).
// Pure: it throws on a bad config and has no other effect, so it is unit-tested
// in e2e-staging-guard.spec.ts. It fails closed on anything that could point
// an e2e run at production: the wrong project, production identifiers anywhere
// in the config, production-only fields, or a live Stripe key.
import { environment as production } from './environment.prod';

export const E2E_STAGING_PROJECT_ID = 'regroup-e2e';

/** The project's default bucket, in either of the two forms Firebase issues. */
export const E2E_STAGING_BUCKETS = ['regroup-e2e.appspot.com', 'regroup-e2e.firebasestorage.app'];

export interface E2eStagingConfig {
  stripePublishableKey: string;
  firebaseConfig: {
    apiKey: string;
    authDomain: string;
    projectId: string;
    storageBucket: string;
    messagingSenderId: string;
    appId: string;
    databaseURL?: string;
    measurementId?: string;
  };
}

/**
 * Substrings that must not appear in any config value: the production project
 * id, its project number, and its web API key (read from environment.prod.ts so
 * the guard follows a key rotation).
 */
export function productionMarkers(): string[] {
  return ['phoenix-cleanhouse', '155667333239', production.firebaseConfig.apiKey].filter(
    (m) => typeof m === 'string' && m.length > 0,
  );
}

function fail(reason: string): never {
  throw new Error(`e2e-staging.generated.ts ${reason}. Refusing to start.`);
}

/** Throws unless `cfg` is a regroup-e2e test config with nothing from production in it. */
export function assertE2eStagingConfig(cfg: E2eStagingConfig): void {
  const fb = cfg && cfg.firebaseConfig;
  if (!fb) {
    fail('has no firebaseConfig');
  }

  // Deny-list first, so a production value is reported as such whatever field it is in.
  const markers = productionMarkers();
  const values: [string, unknown][] = [
    ['stripePublishableKey', cfg.stripePublishableKey],
    ...Object.keys(fb).map((k): [string, unknown] => [
      `firebaseConfig.${k}`,
      (fb as Record<string, unknown>)[k],
    ]),
  ];
  for (const [field, value] of values) {
    if (typeof value === 'string' && markers.some((m) => value.indexOf(m) !== -1)) {
      fail(`has a production value in ${field}`);
    }
  }

  if (fb.projectId !== E2E_STAGING_PROJECT_ID) {
    fail(`must target projectId "${E2E_STAGING_PROJECT_ID}", got "${fb.projectId}"`);
  }
  if (fb.authDomain !== `${E2E_STAGING_PROJECT_ID}.firebaseapp.com`) {
    fail(`must use authDomain "${E2E_STAGING_PROJECT_ID}.firebaseapp.com"`);
  }
  if (E2E_STAGING_BUCKETS.indexOf(fb.storageBucket) === -1) {
    fail(`must use storage bucket ${E2E_STAGING_BUCKETS.join(' or ')}`);
  }
  if (fb.databaseURL !== undefined) {
    fail('must not set databaseURL (the web app does not use Realtime Database)');
  }
  if (fb.measurementId !== undefined) {
    fail('must not set measurementId (e2e builds stub Analytics out and never load it)');
  }
  if (typeof cfg.stripePublishableKey !== 'string' || !/^pk_test_/.test(cfg.stripePublishableKey)) {
    fail('must use a Stripe test-mode (pk_test_) key');
  }
}
