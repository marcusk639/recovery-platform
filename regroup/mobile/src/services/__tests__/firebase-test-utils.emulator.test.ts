/**
 * clearEmulatorData runs after every test in activity.emulator.test.ts while
 * the other integration files run in parallel workers against the same
 * emulator. It must remove only that file's guest, or it deletes the
 * activities and week summaries other suites are in the middle of using.
 */
import { clearEmulatorData } from './firebase-test-utils';
import { adminDb } from '../../integration/firebase-admin-setup';

const exists = async (path: string) => (await adminDb.doc(path).get()).exists;

describe('clearEmulatorData', () => {
  const OWN = 'clear-own-guest';
  const OTHER = 'clear-other-guest';

  beforeEach(async () => {
    await Promise.all([
      adminDb.doc('activities/clear-own-activity').set({ guestId: OWN, houseId: 'clear-house' }),
      adminDb.doc(`week-summaries/${OWN}_2024-01-15`).set({ guestId: OWN }),
      adminDb
        .doc('activities/clear-other-activity')
        .set({ guestId: OTHER, houseId: 'clear-house' }),
      adminDb.doc(`week-summaries/${OTHER}_2024-01-15`).set({ guestId: OTHER }),
    ]);
  });

  afterAll(async () => {
    await Promise.all(
      [
        'activities/clear-own-activity',
        `week-summaries/${OWN}_2024-01-15`,
        'activities/clear-other-activity',
        `week-summaries/${OTHER}_2024-01-15`,
      ].map((path) => adminDb.doc(path).delete()),
    );
  });

  it("removes the guest's activities and week summaries", async () => {
    await clearEmulatorData(OWN);

    expect(await exists('activities/clear-own-activity')).toBe(false);
    expect(await exists(`week-summaries/${OWN}_2024-01-15`)).toBe(false);
  });

  it("leaves another guest's activities and week summaries alone", async () => {
    await clearEmulatorData(OWN);

    expect(await exists('activities/clear-other-activity')).toBe(true);
    expect(await exists(`week-summaries/${OTHER}_2024-01-15`)).toBe(true);
  });
});
