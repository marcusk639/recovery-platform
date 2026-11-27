/**
 * Which project a standalone script (scriptBootstrap.ts) talks to, and whether
 * a credential file fits it. Pure, so it can be tested without Firebase Admin.
 *
 *   production — the default, nothing set (unchanged).
 *   emulator   — FIRESTORE_EMULATOR_HOST set.
 *   staging    — REGROUP_SCRIPT_TARGET=regroup-e2e. The only value it accepts:
 *                production stays the unset default, so a typo in the value, an
 *                empty value, or a near-miss variable name is refused instead of
 *                falling through to production.
 */
export const PROD_PROJECT = 'phoenix-cleanhouse';
export const STAGING_PROJECT = 'regroup-e2e';
export const TARGET_ENV = 'REGROUP_SCRIPT_TARGET';

export type ScriptTarget =
  | { mode: 'production'; projectId: typeof PROD_PROJECT }
  | { mode: 'staging'; projectId: typeof STAGING_PROJECT }
  | { mode: 'emulator'; projectId: string; emulatorHost: string };

// REGROUP_SCRIPTS_TARGET, SCRIPT_TARGET, regroup_script_target, …
const NEAR_MISS_NAME = /REGROUP.*TARGET|SCRIPTS?_?TARGET/i;

export function resolveScriptTarget(env: NodeJS.ProcessEnv): ScriptTarget {
  const nearMiss = Object.keys(env).filter((k) => k !== TARGET_ENV && NEAR_MISS_NAME.test(k));
  if (nearMiss.length > 0) {
    throw new Error(
      `${nearMiss.join(', ')} is set, but the variable is ${TARGET_ENV}. ` +
        'Fix the name, or unset it to run against production.',
    );
  }

  const target = env[TARGET_ENV];
  const emulatorHost = env.FIRESTORE_EMULATOR_HOST;

  if (target !== undefined) {
    if (target.trim() !== STAGING_PROJECT) {
      throw new Error(
        `${TARGET_ENV} must be "${STAGING_PROJECT}" (got ${JSON.stringify(target)}). ` +
          `Leave it unset for production (${PROD_PROJECT}).`,
      );
    }
    if (emulatorHost) {
      throw new Error(
        `${TARGET_ENV}=${STAGING_PROJECT} and FIRESTORE_EMULATOR_HOST are both set; unset one.`,
      );
    }
    return { mode: 'staging', projectId: STAGING_PROJECT };
  }

  if (emulatorHost) {
    return {
      mode: 'emulator',
      projectId: env.GCLOUD_PROJECT ?? env.FIREBASE_PROJECT_ID ?? 'demo-test',
      emulatorHost,
    };
  }
  return { mode: 'production', projectId: PROD_PROJECT };
}

type CredentialFile = {
  type?: unknown;
  project_id?: unknown;
  client_email?: unknown;
  service_account_impersonation_url?: unknown;
};

function asCredentialFile(value: unknown): CredentialFile | null {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? value
    : null;
}

/** The service account an impersonated credential acts as, from its URL. */
function impersonatedAccount(file: CredentialFile): string | null {
  const url = file.service_account_impersonation_url;
  const match = typeof url === 'string' ? /serviceAccounts\/([^/:]+)/.exec(url) : null;
  return match ? decodeURIComponent(match[1]) : null;
}

/**
 * Why a credential file can't be used for staging, or null. An allowlist:
 * gcloud user credentials (they carry no project; the project is set
 * explicitly), a regroup-e2e service account, or an impersonation of one.
 * Anything else, a missing type included, is refused.
 */
export function stagingKeyFileProblem(keyFile: unknown): string | null {
  const file = asCredentialFile(keyFile);
  if (!file) return 'The credential file is not a JSON object.';
  if (file.type === 'authorized_user') return null;
  if (file.type === 'service_account') {
    return file.project_id === STAGING_PROJECT
      ? null
      : `The credential file is a service account for ${
          typeof file.project_id === 'string' ? file.project_id : 'no project_id'
        }, not ${STAGING_PROJECT}.`;
  }
  if (file.type === 'impersonated_service_account') {
    const account = impersonatedAccount(file);
    return account?.endsWith(`@${STAGING_PROJECT}.iam.gserviceaccount.com`)
      ? null
      : `The credential file impersonates ${account ?? 'an unknown account'}, ` +
          `not a ${STAGING_PROJECT} service account.`;
  }
  return (
    `The credential file's type is ${JSON.stringify(file.type ?? null)}; staging accepts ` +
    `gcloud user credentials or a ${STAGING_PROJECT} service account.`
  );
}

/**
 * Why a GOOGLE_APPLICATION_CREDENTIALS file contradicts a production run, or
 * null. Only a service account names its project; one for another project
 * means the operator meant that project (e.g. a misspelt REGROUP_SCRIPT_TARGET).
 */
export function productionKeyFileProblem(keyFile: unknown): string | null {
  const file = asCredentialFile(keyFile);
  if (!file || file.type !== 'service_account' || file.project_id === PROD_PROJECT) return null;
  const project = typeof file.project_id === 'string' ? file.project_id : 'no project_id';
  return (
    `GOOGLE_APPLICATION_CREDENTIALS is a service account for ${project}, but the target is ` +
    `production (${PROD_PROJECT}). For staging set ${TARGET_ENV}=${STAGING_PROJECT}; ` +
    'otherwise unset GOOGLE_APPLICATION_CREDENTIALS.'
  );
}

/** Who a credential file authenticates as, for the log. No secrets. */
export function credentialIdentity(keyFile: unknown): string {
  const file = asCredentialFile(keyFile);
  if (file?.type === 'authorized_user') return 'gcloud user credentials';
  if (file?.type === 'service_account' && typeof file.client_email === 'string') {
    return file.client_email;
  }
  if (file?.type === 'impersonated_service_account') {
    return `impersonating ${impersonatedAccount(file) ?? 'an unknown account'}`;
  }
  return 'application-default credentials';
}
