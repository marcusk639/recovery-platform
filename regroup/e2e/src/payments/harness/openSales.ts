import { adminDb } from './fixtures';

/**
 * Jest globalSetup for the payment suite: opens sales on the emulator so the
 * checkout tests can subscribe. A missing config/sales means closed
 * (regroup/functions/src/util/salesSwitch.ts). adminDb() refuses anything but
 * an emulator project.
 */
export default async function openSales(): Promise<void> {
  await adminDb().doc('config/sales').set({ open: true });
}
