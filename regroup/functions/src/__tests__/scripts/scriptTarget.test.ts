// Which project a standalone script talks to. A script run against the wrong
// project is expensive to undo, so anything ambiguous is refused.

import {
  PROD_PROJECT,
  STAGING_PROJECT,
  resolveScriptTarget,
  stagingKeyFileProblem,
} from '../../scripts/scriptTarget';

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

  it.each(['phoenix-cleanhouse', 'regroup', 'demo-regroup-e2e', 'Regroup-E2E'])(
    'refuses REGROUP_SCRIPT_TARGET=%s',
    (value) => {
      expect(() => resolveScriptTarget({ REGROUP_SCRIPT_TARGET: value })).toThrow(
        /REGROUP_SCRIPT_TARGET/,
      );
    },
  );

  it('refuses an empty REGROUP_SCRIPT_TARGET instead of falling through to production', () => {
    expect(() => resolveScriptTarget({ REGROUP_SCRIPT_TARGET: '' })).toThrow(
      /REGROUP_SCRIPT_TARGET/,
    );
    expect(() => resolveScriptTarget({ REGROUP_SCRIPT_TARGET: '  ' })).toThrow(
      /REGROUP_SCRIPT_TARGET/,
    );
  });

  it('refuses a staging target together with an emulator host', () => {
    expect(() =>
      resolveScriptTarget({
        REGROUP_SCRIPT_TARGET: 'regroup-e2e',
        FIRESTORE_EMULATOR_HOST: '127.0.0.1:8080',
      }),
    ).toThrow(/FIRESTORE_EMULATOR_HOST/);
  });
});

describe('stagingKeyFileProblem', () => {
  it('accepts a regroup-e2e service account and user credentials', () => {
    expect(
      stagingKeyFileProblem({ type: 'service_account', project_id: 'regroup-e2e' }),
    ).toBeNull();
    expect(stagingKeyFileProblem({ type: 'authorized_user', client_id: 'x' })).toBeNull();
  });

  it("refuses another project's service account", () => {
    expect(
      stagingKeyFileProblem({ type: 'service_account', project_id: 'phoenix-cleanhouse' }),
    ).toMatch(/phoenix-cleanhouse/);
    expect(stagingKeyFileProblem({ type: 'service_account' })).toMatch(/project_id/);
  });

  it('refuses something that is not a credential object', () => {
    expect(stagingKeyFileProblem(null)).not.toBeNull();
    expect(stagingKeyFileProblem('regroup-e2e')).not.toBeNull();
  });
});
