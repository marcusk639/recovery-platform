/**
 * Ensures Firebase Admin is initialized before api/firestore is imported.
 * Standalone scripts (node lib/scripts/...) do not load src/init.ts.
 *
 * Two modes:
 *
 *   EMULATOR — set FIRESTORE_EMULATOR_HOST (e.g. 127.0.0.1:8080). No credentials
 *   are needed or used. This exists so a data migration can be rehearsed against
 *   seeded data before it is pointed at real customers; previously every script
 *   using this bootstrap was production-only, because the service-key require sat
 *   at module scope and threw before anything else could run.
 *
 *   PRODUCTION — requires service-key.json next to package.json. Note the shape:
 *   it is a MAP KEYED BY PROJECT NAME, not a bare service-account JSON. A key
 *   downloaded straight from the Firebase console is the bare form and must be
 *   wrapped, otherwise the credential resolves to undefined and initializeApp
 *   fails somewhere less obvious.
 *
 * Either way the chosen target is logged, because a migration run against the
 * wrong one is expensive to undo.
 */
import dotenv from 'dotenv';
import * as admin from 'firebase-admin';

dotenv.config({ path: '../../.env' });

const PROD_PROJECT = 'phoenix-cleanhouse';
const emulatorHost = process.env.FIRESTORE_EMULATOR_HOST;

if (!admin.apps.length) {
  if (emulatorHost) {
    const projectId = process.env.GCLOUD_PROJECT ?? process.env.FIREBASE_PROJECT_ID ?? 'demo-test';
    admin.initializeApp({ projectId });
    console.warn(
      `[scriptBootstrap] EMULATOR at ${emulatorHost} (project ${projectId}) — not production.`,
    );
  } else {
    let serviceAccountMap: Record<string, admin.ServiceAccount> | undefined;
    try {
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      serviceAccountMap = require('../../service-key.json');
    } catch {
      throw new Error(
        'No credentials. Either set FIRESTORE_EMULATOR_HOST to rehearse against ' +
          'the emulator, or place service-key.json next to package.json — a map ' +
          `keyed by project name, e.g. { "${PROD_PROJECT}": { ...service account... } }.`,
      );
    }

    const serviceAccount = serviceAccountMap?.[PROD_PROJECT];
    if (!serviceAccount) {
      throw new Error(
        `service-key.json has no "${PROD_PROJECT}" entry. It must be a map keyed ` +
          'by project name, not a bare service-account JSON — wrap the downloaded ' +
          `key as { "${PROD_PROJECT}": { ... } }.`,
      );
    }

    admin.initializeApp({
      credential: admin.credential.cert(serviceAccount),
      databaseURL: `https://${PROD_PROJECT}.firebaseio.com`,
    });
    console.warn(`[scriptBootstrap] PRODUCTION (${PROD_PROJECT}) — writes affect real customers.`);
  }
}
