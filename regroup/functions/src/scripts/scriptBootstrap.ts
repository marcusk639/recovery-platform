/**
 * Ensures Firebase Admin is initialized before api/firestore is imported.
 * Standalone scripts (node lib/scripts/...) do not load src/init.ts.
 *
 * Three modes (scriptTarget.ts picks one):
 *
 *   EMULATOR — set FIRESTORE_EMULATOR_HOST (e.g. 127.0.0.1:8080). No credentials
 *   are needed or used. This exists so a data migration can be rehearsed against
 *   seeded data before it is pointed at real customers; previously every script
 *   using this bootstrap was production-only, because the service-key require sat
 *   at module scope and threw before anything else could run.
 *
 *   STAGING — set REGROUP_SCRIPT_TARGET=regroup-e2e. Application-default
 *   credentials only (a regroup-e2e service account in
 *   GOOGLE_APPLICATION_CREDENTIALS, or `gcloud auth application-default login`);
 *   service-key.json, the production key, is never read. A service-account file
 *   for another project is refused.
 *
 *   PRODUCTION — the default, with neither set. Requires service-key.json next to
 *   package.json, or application-default credentials. Note the key's shape: it
 *   is a MAP KEYED BY PROJECT NAME, not a bare service-account JSON. A key
 *   downloaded straight from the Firebase console is the bare form and must be
 *   wrapped, otherwise the credential resolves to undefined and initializeApp
 *   fails somewhere less obvious.
 *
 * Either way the chosen target is logged, because a migration run against the
 * wrong one is expensive to undo.
 */
import dotenv from 'dotenv';
import * as fs from 'fs';
import * as path from 'path';
import * as admin from 'firebase-admin';
import { PROD_PROJECT, resolveScriptTarget, stagingKeyFileProblem } from './scriptTarget';

dotenv.config({ path: '../../.env' });

/**
 * Whether application-default credentials are actually present. Checked eagerly
 * because admin.credential.applicationDefault() defers resolution to the first
 * request, turning a missing credential into a grpc stack trace mid-run.
 */
function hasApplicationDefaultCredentials(): boolean {
  if (process.env.GOOGLE_APPLICATION_CREDENTIALS) return true;
  const home = process.env.HOME ?? process.env.USERPROFILE;
  if (!home) return false;
  return fs.existsSync(
    path.join(home, '.config', 'gcloud', 'application_default_credentials.json'),
  );
}

/** Refuses a GOOGLE_APPLICATION_CREDENTIALS file that isn't usable for staging. */
function assertStagingKeyFile(): void {
  const file = process.env.GOOGLE_APPLICATION_CREDENTIALS;
  if (!file) return;
  let parsed: unknown;
  try {
    parsed = JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch {
    throw new Error(`GOOGLE_APPLICATION_CREDENTIALS (${file}) can't be read as JSON.`);
  }
  const problem = stagingKeyFileProblem(parsed);
  if (problem) throw new Error(problem);
}

function initializeStaging(projectId: string): void {
  assertStagingKeyFile();
  if (!hasApplicationDefaultCredentials()) {
    throw new Error(
      `No credentials for ${projectId}. Set GOOGLE_APPLICATION_CREDENTIALS to a ${projectId} ` +
        'service-account key, or run `gcloud auth application-default login`.',
    );
  }
  admin.initializeApp({
    credential: admin.credential.applicationDefault(),
    projectId,
    databaseURL: `https://${projectId}.firebaseio.com`,
  });
  console.warn(`[scriptBootstrap] STAGING (${projectId}) via application-default credentials.`);
}

function initializeProduction(): void {
  let serviceAccountMap: Record<string, admin.ServiceAccount> | undefined;
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    serviceAccountMap = require('../../service-key.json');
  } catch {
    serviceAccountMap = undefined;
  }

  if (serviceAccountMap && !serviceAccountMap[PROD_PROJECT]) {
    throw new Error(
      `service-key.json has no "${PROD_PROJECT}" entry. It must be a map keyed by project ` +
        'name, not a bare service-account JSON — wrap the downloaded key as ' +
        `{ "${PROD_PROJECT}": { ... } }.`,
    );
  }

  const serviceAccount = serviceAccountMap?.[PROD_PROJECT];

  // Fall back to application-default credentials so a read-only dry run can be
  // done with an operator's own gcloud identity, without a long-lived service
  // key on disk. `gcloud auth login` is NOT enough — ADC is separate and needs
  // `gcloud auth application-default login`.
  let credential: admin.credential.Credential;
  if (serviceAccount) {
    credential = admin.credential.cert(serviceAccount);
  } else {
    // applicationDefault() resolves LAZILY — it does not throw here when ADC is
    // absent, it throws on the first query with "Could not load the default
    // credentials" and a grpc stack. So check for the credential up front and
    // fail with something actionable instead.
    if (!hasApplicationDefaultCredentials()) {
      throw new Error(
        `No credentials for ${PROD_PROJECT}. Pick one:\n` +
          '  - rehearse instead: FIRESTORE_EMULATOR_HOST=127.0.0.1:8080 (no credentials needed)\n' +
          '  - staging instead: REGROUP_SCRIPT_TARGET=regroup-e2e\n' +
          '  - gcloud auth application-default login  (note: plain `gcloud auth login`\n' +
          '    is NOT enough, and the consent screen must grant the cloud-platform scope)\n' +
          `  - place service-key.json next to package.json as { "${PROD_PROJECT}": { ... } }`,
      );
    }
    credential = admin.credential.applicationDefault();
  }

  admin.initializeApp({
    credential,
    projectId: PROD_PROJECT,
    databaseURL: `https://${PROD_PROJECT}.firebaseio.com`,
  });
  console.warn(
    `[scriptBootstrap] PRODUCTION (${PROD_PROJECT}) via ${serviceAccount ? 'service key' : 'application-default credentials'} — writes affect real customers.`,
  );
}

if (!admin.apps.length) {
  const target = resolveScriptTarget(process.env);
  if (target.mode === 'emulator') {
    admin.initializeApp({ projectId: target.projectId });
    console.warn(
      `[scriptBootstrap] EMULATOR at ${target.emulatorHost} (project ${target.projectId}) — not production.`,
    );
  } else if (target.mode === 'staging') {
    initializeStaging(target.projectId);
  } else {
    initializeProduction();
  }
}
