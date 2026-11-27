// The bootstrap initializes Firebase Admin when a script is imported. Staging
// mode must point at regroup-e2e with a regroup-e2e (or gcloud user) credential
// and never touch the production key; anything ambiguous is refused before
// Firebase is initialized. Production and emulator: scriptBootstrap.production.test.ts.

import {
  PROD_SA,
  STAGING_SA,
  expectRefused,
  homeWithGcloud,
  keyFile,
  loadBootstrap,
  makeAdmin,
  serviceKeyWasRead,
  useBootstrapHarness,
} from '../helpers/scriptBootstrapHarness';

useBootstrapHarness();

const STAGING_INIT = {
  credential: 'adc',
  projectId: 'regroup-e2e',
  databaseURL: 'https://regroup-e2e.firebaseio.com',
};

describe('scriptBootstrap in staging mode', () => {
  it('initializes regroup-e2e with a regroup-e2e key file and never reads the production key', () => {
    const admin = loadBootstrap(
      { REGROUP_SCRIPT_TARGET: 'regroup-e2e', GOOGLE_APPLICATION_CREDENTIALS: keyFile(STAGING_SA) },
      { serviceKey: 'present' },
    );
    expect(admin.initializeApp).toHaveBeenCalledTimes(1);
    expect(admin.initializeApp).toHaveBeenCalledWith(STAGING_INIT);
    expect(serviceKeyWasRead()).toBe(false);
    expect(admin.credential.cert).not.toHaveBeenCalled();
    expect(console.warn).toHaveBeenCalledWith(
      '[scriptBootstrap] STAGING (regroup-e2e) as sa@regroup-e2e.iam.gserviceaccount.com.',
    );
  });

  it("uses gcloud's user credentials when GOOGLE_APPLICATION_CREDENTIALS is unset", () => {
    const home = homeWithGcloud({ type: 'authorized_user', client_id: 'x' });
    const admin = loadBootstrap({ REGROUP_SCRIPT_TARGET: 'regroup-e2e', HOME: home });
    expect(admin.initializeApp).toHaveBeenCalledWith(STAGING_INIT);
    expect(console.warn).toHaveBeenCalledWith(expect.stringContaining('gcloud user credentials'));
  });

  it('refuses a gcloud default file that impersonates a production service account', () => {
    const home = homeWithGcloud({
      type: 'impersonated_service_account',
      service_account_impersonation_url:
        'https://iamcredentials.googleapis.com/v1/projects/-/serviceAccounts/ops@phoenix-cleanhouse.iam.gserviceaccount.com:generateAccessToken',
    });
    expectRefused({ REGROUP_SCRIPT_TARGET: 'regroup-e2e', HOME: home }, /ops@phoenix-cleanhouse/);
  });

  it('refuses with no credentials at all', () => {
    expectRefused({ REGROUP_SCRIPT_TARGET: 'regroup-e2e' }, /No credentials for regroup-e2e/);
  });

  it('refuses a key file for another project', () => {
    expectRefused(
      { REGROUP_SCRIPT_TARGET: 'regroup-e2e', GOOGLE_APPLICATION_CREDENTIALS: keyFile(PROD_SA) },
      /service account for phoenix-cleanhouse/,
    );
  });

  it('checks the lowercase google_application_credentials too', () => {
    expectRefused(
      { REGROUP_SCRIPT_TARGET: 'regroup-e2e', google_application_credentials: keyFile(PROD_SA) },
      /service account for phoenix-cleanhouse/,
    );
  });

  it('says a missing key file is unreadable, with a hint for an unexpanded ~', () => {
    expectRefused(
      {
        REGROUP_SCRIPT_TARGET: 'regroup-e2e',
        GOOGLE_APPLICATION_CREDENTIALS: '~/.config/regroup-e2e/service-account.json',
      },
      /can't be read \(ENOENT\)\. "~" is not expanded/,
    );
  });

  it('says a malformed key file is not valid JSON, without quoting it', () => {
    const admin = makeAdmin();
    const env = {
      REGROUP_SCRIPT_TARGET: 'regroup-e2e',
      GOOGLE_APPLICATION_CREDENTIALS: keyFile('{"private_key": "SECRET-MATERIAL",'),
    };
    let message = '';
    try {
      loadBootstrap(env, { admin });
    } catch (err) {
      message = (err as Error).message;
    }
    expect(message).toMatch(/is not valid JSON\.$/);
    expect(message).not.toContain('SECRET-MATERIAL');
    expect(admin.initializeApp).not.toHaveBeenCalled();
  });
});

describe('scriptBootstrap target refusals', () => {
  it('refuses any other REGROUP_SCRIPT_TARGET, whatever credentials exist', () => {
    expectRefused(
      {
        REGROUP_SCRIPT_TARGET: 'phoenix-cleanhouse',
        HOME: homeWithGcloud({ type: 'authorized_user' }),
      },
      /REGROUP_SCRIPT_TARGET must be "regroup-e2e"/,
      'present',
    );
  });

  it('refuses a misspelt variable instead of running production', () => {
    expectRefused(
      {
        REGROUP_SCRIPTS_TARGET: 'regroup-e2e',
        GOOGLE_APPLICATION_CREDENTIALS: keyFile(STAGING_SA),
      },
      /REGROUP_SCRIPTS_TARGET is set, but the variable is REGROUP_SCRIPT_TARGET/,
      'present',
    );
  });

  it('refuses when Admin is already initialized for another project', () => {
    const admin = makeAdmin('phoenix-cleanhouse');
    expect(() => loadBootstrap({ REGROUP_SCRIPT_TARGET: 'regroup-e2e' }, { admin })).toThrow(
      /already initialized for phoenix-cleanhouse, but the target is regroup-e2e/,
    );
    expect(admin.initializeApp).not.toHaveBeenCalled();
  });

  it('leaves an existing app for the same project alone', () => {
    const admin = makeAdmin('phoenix-cleanhouse');
    loadBootstrap({}, { admin, serviceKey: 'present' });
    expect(admin.initializeApp).not.toHaveBeenCalled();
  });
});
