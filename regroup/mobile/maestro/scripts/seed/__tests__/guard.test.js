/**
 * The e2e seed resets and rewrites a whole Firebase project, so it must only
 * ever reach the local emulators under a demo- project.
 */
const { seedTarget } = require('../guard');

const OK = { E2E_TEST_PASSWORD: 'pw' };

describe('seedTarget', () => {
  it('defaults to the demo-regroup-e2e project on the local emulator ports', () => {
    expect(seedTarget(OK)).toEqual({
      projectId: 'demo-regroup-e2e',
      firestoreHost: '127.0.0.1:8080',
      authHost: '127.0.0.1:9099',
      password: 'pw',
    });
  });

  it('accepts another demo- project and loopback hosts', () => {
    const target = seedTarget({
      ...OK,
      GCLOUD_PROJECT: 'demo-other',
      FIRESTORE_EMULATOR_HOST: 'localhost:18080',
      FIREBASE_AUTH_EMULATOR_HOST: '[::1]:19099',
    });
    expect(target.projectId).toBe('demo-other');
  });

  it.each(['phoenix-cleanhouse', 'regroup-e2e', 'demo'])('refuses the real project %s', (id) => {
    expect(() => seedTarget({ ...OK, GCLOUD_PROJECT: id })).toThrow(/only demo-/);
  });

  it.each([
    ['FIRESTORE_EMULATOR_HOST', '10.0.0.5:8080'],
    ['FIRESTORE_EMULATOR_HOST', 'firestore.googleapis.com:443'],
    ['FIREBASE_AUTH_EMULATOR_HOST', 'example.com:9099'],
  ])('refuses a non-loopback %s (%s)', (name, host) => {
    expect(() => seedTarget({ ...OK, [name]: host })).toThrow(/loopback/);
  });

  it.each([
    ['FIRESTORE_EMULATOR_HOST', '127.0.0.1.attacker.example:8080'],
    ['FIREBASE_AUTH_EMULATOR_HOST', 'localhost.attacker.example:9099'],
  ])('refuses a %s that only starts with a loopback name (%s)', (name, host) => {
    expect(() => seedTarget({ ...OK, [name]: host })).toThrow(new RegExp(`${name}.*loopback`));
  });

  it('refuses to run without the shared test password', () => {
    expect(() => seedTarget({})).toThrow(/E2E_TEST_PASSWORD/);
  });
});
