// Which project a standalone script talks to, and whether a credential file
// fits it. A script run against the wrong project is expensive to undo, so
// anything ambiguous is refused.

import {
  PROD_PROJECT,
  STAGING_PROJECT,
  credentialIdentity,
  productionKeyFileProblem,
  resolveScriptTarget,
  stagingKeyFileProblem,
} from '../../scripts/scriptTarget';

const impersonating = (account: string) => ({
  type: 'impersonated_service_account',
  service_account_impersonation_url: `https://iamcredentials.googleapis.com/v1/projects/-/serviceAccounts/${account}:generateAccessToken`,
});

describe('resolveScriptTarget', () => {
  it('is production with nothing set (unchanged default)', () => {
    expect(resolveScriptTarget({})).toEqual({ mode: 'production', projectId: PROD_PROJECT });
  });

  it('is the emulator when FIRESTORE_EMULATOR_HOST is set', () => {
    expect(
      resolveScriptTarget({ FIRESTORE_EMULATOR_HOST: '127.0.0.1:8080', GCLOUD_PROJECT: 'demo-x' }),
    ).toEqual({ mode: 'emulator', projectId: 'demo-x', emulatorHost: '127.0.0.1:8080' });
    expect(resolveScriptTarget({ FIRESTORE_EMULATOR_HOST: '127.0.0.1:8080' })).toEqual({
      mode: 'emulator',
      projectId: 'demo-test',
      emulatorHost: '127.0.0.1:8080',
    });
  });

  it('is staging when REGROUP_SCRIPT_TARGET=regroup-e2e', () => {
    expect(resolveScriptTarget({ REGROUP_SCRIPT_TARGET: 'regroup-e2e' })).toEqual({
      mode: 'staging',
      projectId: STAGING_PROJECT,
    });
    expect(resolveScriptTarget({ REGROUP_SCRIPT_TARGET: ' regroup-e2e ' }).mode).toBe('staging');
  });

  it.each(['phoenix-cleanhouse', 'regroup', 'demo-regroup-e2e', 'Regroup-E2E', '', '  '])(
    'refuses REGROUP_SCRIPT_TARGET=%j instead of falling through to production',
    (value) => {
      expect(() => resolveScriptTarget({ REGROUP_SCRIPT_TARGET: value })).toThrow(
        /REGROUP_SCRIPT_TARGET must be "regroup-e2e"/,
      );
    },
  );

  it.each([
    'REGROUP_SCRIPTS_TARGET',
    'REGROUP_TARGET',
    'regroup_script_target',
    'SCRIPT_TARGET',
    'SCRIPTS_TARGET',
  ])('refuses the near-miss variable %s, alone or beside the real one', (name) => {
    expect(() => resolveScriptTarget({ [name]: 'regroup-e2e' })).toThrow(
      new RegExp(`${name} is set, but the variable is REGROUP_SCRIPT_TARGET`),
    );
    expect(() =>
      resolveScriptTarget({ [name]: 'regroup-e2e', REGROUP_SCRIPT_TARGET: 'regroup-e2e' }),
    ).toThrow(/but the variable is REGROUP_SCRIPT_TARGET/);
  });

  it('ignores unrelated variables', () => {
    expect(
      resolveScriptTarget({ npm_lifecycle_script: 'node lib/x.js', TARGET: 'x', REGROUP_ENV: 'y' }),
    ).toEqual({ mode: 'production', projectId: PROD_PROJECT });
  });

  it('refuses a staging target together with an emulator host', () => {
    expect(() =>
      resolveScriptTarget({
        REGROUP_SCRIPT_TARGET: 'regroup-e2e',
        FIRESTORE_EMULATOR_HOST: '127.0.0.1:8080',
      }),
    ).toThrow(/and FIRESTORE_EMULATOR_HOST are both set/);
  });
});

describe('stagingKeyFileProblem (an allowlist)', () => {
  it('accepts gcloud user credentials, a regroup-e2e service account, or an impersonation of one', () => {
    expect(stagingKeyFileProblem({ type: 'authorized_user', client_id: 'x' })).toBeNull();
    expect(
      stagingKeyFileProblem({ type: 'service_account', project_id: 'regroup-e2e' }),
    ).toBeNull();
    expect(
      stagingKeyFileProblem(impersonating('ops@regroup-e2e.iam.gserviceaccount.com')),
    ).toBeNull();
  });

  it("refuses another project's service account", () => {
    expect(
      stagingKeyFileProblem({ type: 'service_account', project_id: 'phoenix-cleanhouse' }),
    ).toMatch(/service account for phoenix-cleanhouse, not regroup-e2e/);
    expect(stagingKeyFileProblem({ type: 'service_account' })).toMatch(/no project_id/);
  });

  it('refuses an impersonation of a production or unknown account', () => {
    expect(
      stagingKeyFileProblem(impersonating('ops@phoenix-cleanhouse.iam.gserviceaccount.com')),
    ).toMatch(/impersonates ops@phoenix-cleanhouse/);
    expect(
      stagingKeyFileProblem(impersonating('ops@regroup-e2e.iam.gserviceaccount.com.evil.com')),
    ).not.toBeNull();
    expect(stagingKeyFileProblem({ type: 'impersonated_service_account' })).toMatch(
      /an unknown account/,
    );
  });

  it.each([
    [{}],
    [{ type: 'external_account' }],
    [{ 'phoenix-cleanhouse': { type: 'service_account' } }],
  ])('refuses %j (not an allowed credential type)', (file) => {
    expect(stagingKeyFileProblem(file)).toMatch(/staging accepts/);
  });

  it('refuses something that is not a credential object', () => {
    expect(stagingKeyFileProblem(null)).toMatch(/not a JSON object/);
    expect(stagingKeyFileProblem([])).toMatch(/not a JSON object/);
    expect(stagingKeyFileProblem('regroup-e2e')).toMatch(/not a JSON object/);
  });
});

describe('productionKeyFileProblem', () => {
  it('refuses a service account for another project', () => {
    expect(
      productionKeyFileProblem({ type: 'service_account', project_id: 'regroup-e2e' }),
    ).toMatch(/service account for regroup-e2e, but the target is production/);
  });

  it('accepts a production service account and credentials that carry no project', () => {
    expect(
      productionKeyFileProblem({ type: 'service_account', project_id: 'phoenix-cleanhouse' }),
    ).toBeNull();
    expect(productionKeyFileProblem({ type: 'authorized_user' })).toBeNull();
    expect(
      productionKeyFileProblem(impersonating('ops@phoenix-cleanhouse.iam.gserviceaccount.com')),
    ).toBeNull();
  });
});

describe('credentialIdentity', () => {
  it('names who the credential acts as, without secrets', () => {
    expect(credentialIdentity({ type: 'authorized_user', refresh_token: 'secret' })).toBe(
      'gcloud user credentials',
    );
    expect(
      credentialIdentity({
        type: 'service_account',
        client_email: 'sa@regroup-e2e.iam.gserviceaccount.com',
        private_key: 'secret',
      }),
    ).toBe('sa@regroup-e2e.iam.gserviceaccount.com');
    expect(credentialIdentity(impersonating('ops@regroup-e2e.iam.gserviceaccount.com'))).toBe(
      'impersonating ops@regroup-e2e.iam.gserviceaccount.com',
    );
    expect(credentialIdentity({})).toBe('application-default credentials');
  });
});
