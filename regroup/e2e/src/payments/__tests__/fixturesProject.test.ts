// adminApp is what every fixture and callable goes through, so it decides which emulator
// projects the harness can talk to: the payment suite's, and the manual-testing emulators'
// for the new-house journey (npm run e2e:new-house). Never a deployed project.
const EMULATORS = { FIRESTORE_EMULATOR_HOST: '127.0.0.1:8080', FIREBASE_AUTH_EMULATOR_HOST: '127.0.0.1:9099' };

/** Loads fixtures fresh with this project and calls adminApp, as a run with that env would. */
function adminAppOn(project: string): () => unknown {
  return () => {
    const saved = process.env;
    process.env = { ...saved, ...EMULATORS, GCLOUD_PROJECT: project };
    try {
      let result: unknown;
      jest.isolateModules(() => {
        result = require('../harness/fixtures').adminApp();
      });
      return result;
    } finally {
      process.env = saved;
    }
  };
}

describe('adminApp', () => {
  it.each(['demo-regroup-payments', 'demo-regroup-e2e'])('works on the %s emulators', (project) => {
    expect(adminAppOn(project)).not.toThrow();
  });

  it('refuses a deployed project', () => {
    expect(adminAppOn('phoenix-cleanhouse')).toThrow(/Refusing/);
  });
});
