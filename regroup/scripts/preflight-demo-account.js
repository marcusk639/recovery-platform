#!/usr/bin/env node
/**
 * Demo-account preflight (S5): refuses a functions or rules deploy until the
 * shared App Review demo account carries its server-set `demo: true` claim in
 * the target project. The callables and both rulesets identify the demo
 * account by that claim only, so deploying them before it is set would leave
 * the demo login (its password ships in the app) unrestricted.
 *
 * Wired as a predeploy hook in regroup/firebase.json (functions) and
 * regroup/mobile/firebase/firebase.json (firestore, storage); the Firebase CLI
 * passes the target project as GCLOUD_PROJECT. Run by hand:
 *   GCLOUD_PROJECT=phoenix-cleanhouse node scripts/preflight-demo-account.js
 *
 * Passes only when config/demoAccount names an account whose live custom
 * claims hold demo: true (what `npm run demo:mark-account -- --apply` writes).
 * Fails closed on anything else: no project, no credentials, a failed read, a
 * missing doc, account or claim. Reads with the deployer's own credentials
 * (application-default credentials, or functions/service-key.json as the
 * migration scripts use). Logs the uid only.
 *
 * A project with no demo account at all (a staging project) can skip the gate
 * by naming itself: DEMO_ACCOUNT_GATE_SKIP_PROJECT=<that project id>. The
 * production project can never skip it.
 */
const path = require('path');

const PRODUCTION_PROJECT = 'phoenix-cleanhouse';
const MARK_COMMAND =
  'cd regroup/functions && npm run demo:mark-account (dry run: check the uid), then -- --apply';
const FUNCTIONS_DIR = path.join(__dirname, '..', 'functions');

/** The decision, given the target and two readers; never throws. */
async function checkDemoAccount({ projectId, skipProject, readConfig, getUser }) {
  if (!projectId) return { ok: false, reason: 'no target project (GCLOUD_PROJECT is unset)' };
  if (projectId.startsWith('demo-')) return { ok: true, reason: 'emulator-only project' };
  if (skipProject && skipProject === projectId) {
    if (projectId === PRODUCTION_PROJECT) {
      return { ok: false, reason: `${PRODUCTION_PROJECT} cannot skip the demo-account gate` };
    }
    return { ok: true, reason: `skipped for ${projectId} (DEMO_ACCOUNT_GATE_SKIP_PROJECT)` };
  }
  let config;
  try {
    config = await readConfig();
  } catch (error) {
    return {
      ok: false,
      reason: `could not read config/demoAccount (${error && error.code ? error.code : 'error'})`,
    };
  }
  const uid = config && typeof config.uid === 'string' ? config.uid : '';
  if (!uid)
    return {
      ok: false,
      reason: 'config/demoAccount is missing: the demo account was never marked',
    };
  let user;
  try {
    user = await getUser(uid);
  } catch (error) {
    return {
      ok: false,
      reason: `the marked demo account ${uid} could not be read (${error && error.code ? error.code : 'error'})`,
    };
  }
  if (!user || !user.customClaims || user.customClaims.demo !== true) {
    return { ok: false, reason: `the marked demo account ${uid} has no demo claim` };
  }
  return { ok: true, reason: `demo account ${uid} carries the demo claim` };
}

function adminFor(projectId) {
  // firebase-admin is a dependency of regroup/functions, not of this folder.
  const admin = require(require.resolve('firebase-admin', { paths: [FUNCTIONS_DIR] }));
  let credential;
  try {
    const keys = require(path.join(FUNCTIONS_DIR, 'service-key.json'));
    if (keys && keys[projectId]) credential = admin.credential.cert(keys[projectId]);
  } catch {
    // No key file: application-default credentials.
  }
  const app = admin.initializeApp(
    { projectId, ...(credential ? { credential } : {}) },
    'preflight-demo',
  );
  return {
    readConfig: async () => (await app.firestore().doc('config/demoAccount').get()).data(),
    getUser: (uid) => app.auth().getUser(uid),
  };
}

async function main() {
  const projectId = process.env.GCLOUD_PROJECT || '';
  let readers = { readConfig: async () => undefined, getUser: async () => undefined };
  if (projectId && !projectId.startsWith('demo-')) {
    // A shell left over from an emulator run would point the Admin SDK at the
    // emulator, where a marked account would pass the gate for the real project.
    delete process.env.FIRESTORE_EMULATOR_HOST;
    delete process.env.FIREBASE_AUTH_EMULATOR_HOST;
    try {
      readers = adminFor(projectId);
    } catch (error) {
      console.error(
        `[preflight-demo-account] ✗ cannot reach ${projectId}: ${error.message}. Deploy blocked.`,
      );
      process.exit(1);
    }
  }
  const result = await checkDemoAccount({
    projectId,
    skipProject: process.env.DEMO_ACCOUNT_GATE_SKIP_PROJECT,
    ...readers,
  });
  if (!result.ok) {
    console.error(`[preflight-demo-account] ✗ ${result.reason}. Deploy blocked.`);
    console.error(`  Mark the demo account first: ${MARK_COMMAND} (with --project's credentials).`);
    process.exit(1);
  }
  console.log(`[preflight-demo-account] ✓ ${result.reason}`);
  process.exit(0);
}

if (require.main === module) {
  main().catch((error) => {
    console.error(`[preflight-demo-account] ✗ ${error && error.message}. Deploy blocked.`);
    process.exit(1);
  });
}

module.exports = { checkDemoAccount, PRODUCTION_PROJECT };
