/**
 * restoreDemoAccount (every 10 minutes): Firebase Auth cannot refuse an email
 * or password change for one account, so this undoes them for the shared demo
 * account (util/demoAccountState.ts). Does nothing until the owner has run
 * `npm run demo:mark-account -- --apply`. Logs ids and booleans only.
 */
import { onSchedule } from 'firebase-functions/v2/scheduler';
import { logger } from 'firebase-functions';
import * as admin from 'firebase-admin';
import { restoreDemoAccount as restore } from '../util/demoAccountState';

export async function runRestoreDemoAccount(): Promise<void> {
  const result = await restore(admin.firestore(), admin.auth());
  if (result.outcome === 'restored') {
    logger.warn('demo_account.restored', result);
  } else if (result.outcome === 'intact' && result.claimAdded) {
    logger.warn('demo_account.claim_restored', { uid: result.uid });
  }
}

export const restoreDemoAccount = onSchedule({ schedule: 'every 10 minutes' }, async () => {
  await runRestoreDemoAccount();
});
