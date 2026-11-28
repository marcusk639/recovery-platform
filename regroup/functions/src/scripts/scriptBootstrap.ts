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
 *   credentials only: GOOGLE_APPLICATION_CREDENTIALS, or else gcloud's
 *   application_default_credentials.json. The file is read first and must be
 *   gcloud user credentials or a regroup-e2e service account (or an impersonation
 *   of one). service-key.json, the production key, is never read.
 *
 *   PRODUCTION — the default, with neither set. Requires service-key.json next to
 *   package.json, or application-default credentials. Note the key's shape: it
 *   is a MAP KEYED BY PROJECT NAME, not a bare service-account JSON. A key
 *   downloaded straight from the Firebase console is the bare form and must be
 *   wrapped, otherwise the credential resolves to undefined and initializeApp
 *   fails somewhere less obvious. A GOOGLE_APPLICATION_CREDENTIALS service
 *   account for another project is refused: it means the run was meant for that
 *   project (e.g. a misspelt REGROUP_SCRIPT_TARGET).
 *
 * Whichever mode is chosen, the target is logged, because a migration run
 * against the wrong one is expensive to undo.
 */
import dotenv from 'dotenv';
import * as fs from 'fs';
import * as path from 'path';
import * as admin from 'firebase-admin';
import {
  PROD_PROJECT,
  type ScriptTarget,
  credentialIdentity,
  productionKeyFileProblem,
  resolveScriptTarget,
  stagingKeyFileProblem,
} from './scriptTarget';

dotenv.config({ path: '../../.env' });

/** GOOGLE_APPLICATION_CREDENTIALS as google-auth-library reads it. */
function explicitCredentialPath(): string | undefined {
  return process.env.GOOGLE_APPLICATION_CREDENTIALS || process.env.google_application_credentials;
}

/** gcloud's application-default credentials file (`gcloud auth application-default login`). */
function gcloudCredentialPath(): string | undefined {
  if (process.env.CLOUDSDK_CONFIG) {
    return path.join(process.env.CLOUDSDK_CONFIG, 'application_default_credentials.json');
  }
  const home = process.env.HOME ?? process.env.USERPROFILE;
  return home
    ? path.join(home, '.config', 'gcloud', 'application_default_credentials.json')
    : undefined;
}

/**
 * Whether application-default credentials are actually present. Checked eagerly
 * because admin.credential.applicationDefault() defers resolution to the first
 * request, turning a missing credential into a grpc stack trace mid-run.
 */
function hasApplicationDefaultCredentials(): boolean {
  if (explicitCredentialPath()) return true;
  const file = gcloudCredentialPath();
  return file !== undefined && fs.existsSync(file);
}

/**
 * Reads a credential file. A read failure and a parse failure get separate
 * messages; neither includes the parser's message, which quotes the file
 * (key material).
 */
function readCredentialFile(file: string, label: string): unknown {
  let text: string;
  try {
    text = fs.readFileSync(file, 'utf8');
  } catch (err) {
    const code = (err as NodeJS.ErrnoException).code ?? 'read error';
    const tilde = file.startsWith('~') ? ' "~" is not expanded here; use $HOME.' : '';
    throw new Error(`${label} (${file}) can't be read (${code}).${tilde}`);
  }
  try {
    return JSON.parse(text);
  } catch {
    throw new Error(`${label} (${file}) is not valid JSON.`);
  }
}

function initializeStaging(projectId: string): void {
  const explicit = explicitCredentialPath();
  const gcloud = gcloudCredentialPath();
  const file = explicit ?? (gcloud && fs.existsSync(gcloud) ? gcloud : undefined);
  if (!file) {
    throw new Error(
      `No credentials for ${projectId}. Set GOOGLE_APPLICATION_CREDENTIALS to a ${projectId} ` +
        'service-account key, or run `gcloud auth application-default login` (plain ' +
        '`gcloud auth login` is NOT enough; grant the cloud-platform scope).',
    );
  }
  const keyFile = readCredentialFile(
    file,
    explicit ? 'GOOGLE_APPLICATION_CREDENTIALS' : 'gcloud application-default credentials',
  );
  const problem = stagingKeyFileProblem(keyFile);
  if (problem) throw new Error(`${problem} (${file})`);

  admin.initializeApp({
    credential: admin.credential.applicationDefault(),
    projectId,
    databaseURL: `https://${projectId}.firebaseio.com`,
  });
  console.warn(`[scriptBootstrap] STAGING (${projectId}) as ${credentialIdentity(keyFile)}.`);
}

/** service-key.json, or undefined only when there is none. A broken one is refused. */
function loadServiceKey(): admin.ServiceAccount | undefined {
  let serviceAccountMap: Record<string, admin.ServiceAccount>;
  try {
    serviceAccountMap = require('../../service-key.json');
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'MODULE_NOT_FOUND') return undefined;
    // Not the error's message: Node's JSON loader quotes the file.
    throw new Error(
      "service-key.json exists but can't be loaded (not valid JSON, or unreadable). " +
        'Fix or remove it; it is never skipped silently.',
    );
  }
  if (!serviceAccountMap[PROD_PROJECT]) {
    throw new Error(
      `service-key.json has no "${PROD_PROJECT}" entry. It must be a map keyed by project ` +
        'name, not a bare service-account JSON — wrap the downloaded key as ' +
        `{ "${PROD_PROJECT}": { ... } }.`,
    );
  }
  return serviceAccountMap[PROD_PROJECT];
}

function initializeProduction(): void {
  const explicit = explicitCredentialPath();
  if (explicit) {
    const problem = productionKeyFileProblem(
      readCredentialFile(explicit, 'GOOGLE_APPLICATION_CREDENTIALS'),
    );
    if (problem) throw new Error(problem);
  }

  const serviceAccount = loadServiceKey();

  // Fall back to application-default credentials so a read-only dry run can be
  // done with an operator's own gcloud identity, without a long-lived service
  // key on disk. applicationDefault() resolves LAZILY (a missing credential
  // would surface as a grpc stack on the first query), so check for it first.
  if (!serviceAccount && !hasApplicationDefaultCredentials()) {
    throw new Error(
      `No credentials for ${PROD_PROJECT}. Pick one:\n` +
        '  - rehearse instead: FIRESTORE_EMULATOR_HOST=127.0.0.1:8080 (no credentials needed)\n' +
        '  - staging instead: REGROUP_SCRIPT_TARGET=regroup-e2e, with regroup-e2e credentials\n' +
        '  - gcloud auth application-default login  (note: plain `gcloud auth login`\n' +
        '    is NOT enough, and the consent screen must grant the cloud-platform scope)\n' +
        `  - place service-key.json next to package.json as { "${PROD_PROJECT}": { ... } }`,
    );
  }

  admin.initializeApp({
    credential: serviceAccount
      ? admin.credential.cert(serviceAccount)
      : admin.credential.applicationDefault(),
    projectId: PROD_PROJECT,
    databaseURL: `https://${PROD_PROJECT}.firebaseio.com`,
  });
  console.warn(
    `[scriptBootstrap] PRODUCTION (${PROD_PROJECT}) via ${serviceAccount ? 'service key' : 'application-default credentials'} — writes affect real customers.`,
  );
}

function initialize(target: ScriptTarget): void {
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

// Resolved before the guard, so a bad REGROUP_SCRIPT_TARGET is refused even
// when something already initialized Admin; an existing app for another
// project is refused rather than used.
const target = resolveScriptTarget(process.env);
if (!admin.apps.length) {
  initialize(target);
} else {
  const existing = admin.app().options.projectId;
  if (existing && existing !== target.projectId) {
    throw new Error(
      `[scriptBootstrap] Firebase Admin is already initialized for ${existing}, ` +
        `but the target is ${target.projectId}.`,
    );
  }
}
