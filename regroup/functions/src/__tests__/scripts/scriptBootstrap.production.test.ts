// The bootstrap's default (production) and emulator modes. With
// REGROUP_SCRIPT_TARGET unset they behave as before, except that a broken
// service-key.json and a GOOGLE_APPLICATION_CREDENTIALS service account for
// another project are refused instead of silently changing credentials.

import {
  STAGING_SA,
  expectRefused,
  homeWithGcloud,
  keyFile,
  loadBootstrap,
  serviceKeyWasRead,
  useBootstrapHarness,
} from '../helpers/scriptBootstrapHarness';

useBootstrapHarness();

describe('scriptBootstrap in production mode (the default)', () => {
  it('initializes phoenix-cleanhouse with the service key', () => {
    const admin = loadBootstrap({}, { serviceKey: 'present' });
    expect(admin.initializeApp).toHaveBeenCalledWith({
      credential: 'cert',
      projectId: 'phoenix-cleanhouse',
      databaseURL: 'https://phoenix-cleanhouse.firebaseio.com',
    });
    expect(admin.credential.cert).toHaveBeenCalledWith({ projectId: 'phoenix-cleanhouse' });
  });

  it('falls back to gcloud credentials without a service key', () => {
    const admin = loadBootstrap({ HOME: homeWithGcloud({ type: 'authorized_user' }) });
    expect(admin.initializeApp).toHaveBeenCalledWith({
      credential: 'adc',
      projectId: 'phoenix-cleanhouse',
      databaseURL: 'https://phoenix-cleanhouse.firebaseio.com',
    });
  });

  it('refuses with no credentials', () => {
    expectRefused({}, /No credentials for phoenix-cleanhouse/);
  });

  it('refuses a malformed service-key.json instead of falling back to other credentials', () => {
    expectRefused(
      { HOME: homeWithGcloud({ type: 'authorized_user' }) },
      /service-key\.json exists but can't be loaded/,
      'malformed',
    );
  });

  it('refuses a GOOGLE_APPLICATION_CREDENTIALS service account for staging', () => {
    expectRefused(
      { GOOGLE_APPLICATION_CREDENTIALS: keyFile(STAGING_SA) },
      /service account for regroup-e2e, but the target is production/,
      'present',
    );
  });

  it('accepts a GOOGLE_APPLICATION_CREDENTIALS file of user credentials', () => {
    const admin = loadBootstrap(
      { GOOGLE_APPLICATION_CREDENTIALS: keyFile({ type: 'authorized_user' }) },
      { serviceKey: 'present' },
    );
    expect(admin.initializeApp).toHaveBeenCalledWith(
      expect.objectContaining({ projectId: 'phoenix-cleanhouse' }),
    );
  });
});

describe('scriptBootstrap in emulator mode', () => {
  it('initializes the emulator project with no credentials and no key read', () => {
    const admin = loadBootstrap(
      { FIRESTORE_EMULATOR_HOST: '127.0.0.1:8080' },
      { serviceKey: 'present' },
    );
    expect(admin.initializeApp).toHaveBeenCalledWith({ projectId: 'demo-test' });
    expect(serviceKeyWasRead()).toBe(false);
    expect(admin.credential.cert).not.toHaveBeenCalled();
    expect(admin.credential.applicationDefault).not.toHaveBeenCalled();
  });
});
