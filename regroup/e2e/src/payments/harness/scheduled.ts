/**
 * firebase.payments.json has no pubsub emulator, so schedules don't fire. These
 * call the exported job in the Jest process, against the same emulators.
 */
export const runScheduled = {
  rentCollection: async (): Promise<unknown> => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const job = require('../../../../functions/lib/scheduled/scheduledRentCollection');
    return job.runRentCollection();
  },
};
