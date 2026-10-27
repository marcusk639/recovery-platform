import { environment as production } from './environment.prod';
import { assertE2eStagingConfig, E2eStagingConfig, productionMarkers } from './e2e-staging-guard';

function validConfig(): E2eStagingConfig {
  return {
    stripePublishableKey: 'pk_test_e2eStagingPlaceholder',
    firebaseConfig: {
      apiKey: 'e2e-staging-test-api-key',
      authDomain: 'regroup-e2e.firebaseapp.com',
      projectId: 'regroup-e2e',
      storageBucket: 'regroup-e2e.appspot.com',
      messagingSenderId: '000000000001',
      appId: '1:000000000001:web:0000000000000000000001',
    },
  };
}

function withFirebase(overrides: Partial<E2eStagingConfig['firebaseConfig']>): E2eStagingConfig {
  const cfg = validConfig();
  cfg.firebaseConfig = { ...cfg.firebaseConfig, ...overrides };
  return cfg;
}

describe('assertE2eStagingConfig', () => {
  it('accepts a regroup-e2e config with a pk_test_ key', () => {
    expect(() => assertE2eStagingConfig(validConfig())).not.toThrow();
  });

  it('also accepts the firebasestorage.app bucket form', () => {
    const cfg = withFirebase({ storageBucket: 'regroup-e2e.firebasestorage.app' });
    expect(() => assertE2eStagingConfig(cfg)).not.toThrow();
  });

  it('rejects the production config', () => {
    const cfg: E2eStagingConfig = {
      stripePublishableKey: production.stripePublishableKey,
      firebaseConfig: production.firebaseConfig,
    };
    expect(() => assertE2eStagingConfig(cfg)).toThrowError(/production value/);
  });

  it('rejects the production API key, read from environment.prod.ts', () => {
    expect(productionMarkers()).toContain(production.firebaseConfig.apiKey);
    const cfg = withFirebase({ apiKey: production.firebaseConfig.apiKey });
    expect(() => assertE2eStagingConfig(cfg)).toThrowError(/firebaseConfig\.apiKey/);
  });

  it('rejects the production storage bucket', () => {
    const cfg = withFirebase({ storageBucket: production.firebaseConfig.storageBucket });
    expect(() => assertE2eStagingConfig(cfg)).toThrowError(/firebaseConfig\.storageBucket/);
  });

  it('rejects the production authDomain', () => {
    const cfg = withFirebase({ authDomain: production.firebaseConfig.authDomain });
    expect(() => assertE2eStagingConfig(cfg)).toThrowError(/firebaseConfig\.authDomain/);
  });

  it('rejects the production project number anywhere in the config', () => {
    const cfg = withFirebase({ messagingSenderId: '155667333239' });
    expect(() => assertE2eStagingConfig(cfg)).toThrowError(/firebaseConfig\.messagingSenderId/);
  });

  it('rejects a project other than regroup-e2e', () => {
    const cfg = withFirebase({ projectId: 'regroup-e2e-other' });
    expect(() => assertE2eStagingConfig(cfg)).toThrowError(/projectId/);
  });

  it('rejects an authDomain other than regroup-e2e.firebaseapp.com', () => {
    const cfg = withFirebase({ authDomain: 'evil.example.com' });
    expect(() => assertE2eStagingConfig(cfg)).toThrowError(/authDomain/);
  });

  it('rejects a bucket outside regroup-e2e', () => {
    const cfg = withFirebase({ storageBucket: 'regroup-e2e-other.appspot.com' });
    expect(() => assertE2eStagingConfig(cfg)).toThrowError(/storage bucket/);
  });

  it('rejects a config with measurementId', () => {
    const cfg = withFirebase({ measurementId: 'G-E2ETEST00' });
    expect(() => assertE2eStagingConfig(cfg)).toThrowError(/measurementId/);
  });

  it('rejects a config with databaseURL', () => {
    const cfg = withFirebase({ databaseURL: 'https://regroup-e2e.firebaseio.com' });
    expect(() => assertE2eStagingConfig(cfg)).toThrowError(/databaseURL/);
  });

  it('rejects a live Stripe key', () => {
    const cfg = validConfig();
    cfg.stripePublishableKey = 'pk_live_e2eStagingPlaceholder';
    expect(() => assertE2eStagingConfig(cfg)).toThrowError(/pk_test_/);
  });
});
