import * as admin from 'firebase-admin';
import { logger } from 'firebase-functions';

/**
 * Whether new tier subscriptions may start: `config/sales.open` (owner
 * decision, spec §4.1 item 8). Web checkout stays closed until the new app is
 * in the stores, so it is closed when the production backend deploys and
 * opened at launch, without a deploy. Missing, malformed or unreadable means
 * closed. Read on every checkout, so closing it stops new subscriptions at once.
 */
export async function isSalesOpen(): Promise<boolean> {
  try {
    const snap = await admin.firestore().collection('config').doc('sales').get();
    const open = snap.exists ? (snap.data() as { open?: unknown } | undefined)?.open : undefined;
    return open === true;
  } catch (err) {
    logger.error('salesSwitch.read_failed', { error: (err as Error)?.message });
    return false;
  }
}
