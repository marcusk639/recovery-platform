/**
 * Which project a standalone script (scriptBootstrap.ts) talks to. Pure, so it
 * can be tested without initializing Firebase Admin.
 *
 *   production — the default, nothing set (unchanged).
 *   emulator   — FIRESTORE_EMULATOR_HOST set.
 *   staging    — REGROUP_SCRIPT_TARGET=regroup-e2e. The only value it accepts:
 *                production stays the unset default, so a typo or an empty value
 *                is refused instead of falling through to production.
 */
export const PROD_PROJECT = 'phoenix-cleanhouse';
export const STAGING_PROJECT = 'regroup-e2e';
export const TARGET_ENV = 'REGROUP_SCRIPT_TARGET';

export type ScriptTarget =
  | { mode: 'production'; projectId: typeof PROD_PROJECT }
  | { mode: 'staging'; projectId: typeof STAGING_PROJECT }
  | { mode: 'emulator'; projectId: string; emulatorHost: string };

export function resolveScriptTarget(env: NodeJS.ProcessEnv): ScriptTarget {
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

/**
 * Why a GOOGLE_APPLICATION_CREDENTIALS file can't be used for staging, or null.
 * A service account must belong to regroup-e2e; user credentials
 * (`gcloud auth application-default login`) carry no project and are allowed,
 * since the project is set explicitly.
 */
export function stagingKeyFileProblem(keyFile: unknown): string | null {
  if (typeof keyFile !== 'object' || keyFile === null) {
    return 'GOOGLE_APPLICATION_CREDENTIALS is not a credential JSON object.';
  }
  const { type, project_id: projectId } = keyFile as { type?: unknown; project_id?: unknown };
  if (type !== 'service_account') return null;
  if (projectId !== STAGING_PROJECT) {
    return (
      `GOOGLE_APPLICATION_CREDENTIALS is a service account for ` +
      `${typeof projectId === 'string' ? projectId : 'no project_id'}, not ${STAGING_PROJECT}.`
    );
  }
  return null;
}
