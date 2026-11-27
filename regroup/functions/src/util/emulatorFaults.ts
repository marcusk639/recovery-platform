import * as admin from 'firebase-admin';
import { logger } from 'firebase-functions';

/** The only project the e2e builds and the Maestro seed use (regroup/firebase.e2e.json). */
export const E2E_EMULATOR_PROJECT = 'demo-regroup-e2e';

/** Failures an e2e flow can switch on, as fields of the e2e/faults doc. */
export type EmulatorFault = 'tierCatalogUnavailable';

type Env = Record<string, string | undefined>;

/**
 * True only inside the Functions emulator running demo-regroup-e2e. The
 * emulator sets FUNCTIONS_EMULATOR=true and GCLOUD_PROJECT to the project it
 * serves; deployed functions have neither, and a demo- project can't be
 * deployed. Both must hold.
 */
export const isE2EEmulator = (env: Env = process.env): boolean =>
  env.FUNCTIONS_EMULATOR === 'true' && env.GCLOUD_PROJECT === E2E_EMULATOR_PROJECT;

/**
 * Whether an e2e flow has switched a fault on (Maestro sets e2e/faults in the
 * emulator; launch P5 Task 12, BILL-008). Outside the e2e emulator it returns
 * false without reading Firestore, so production can never be made to fail
 * this way and pays nothing for the check. Missing, not exactly true or
 * unreadable means off.
 */
export async function isEmulatorFaultOn(
  fault: EmulatorFault,
  env: Env = process.env,
): Promise<boolean> {
  if (!isE2EEmulator(env)) return false;
  try {
    const snap = await admin.firestore().collection('e2e').doc('faults').get();
    return snap.exists ? snap.data()?.[fault] === true : false;
  } catch (err) {
    logger.warn('emulatorFaults.read_failed', { fault, error: (err as Error)?.message });
    return false;
  }
}
