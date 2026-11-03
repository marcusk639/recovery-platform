/**
 * Where the e2e seed may write: the local Firebase emulators, under a demo-
 * project, and nowhere else.
 *
 * demo- project ids are emulator-only by Firebase's design: the Admin SDK never
 * reaches a real project for them. The hosts must also be loopback, so a typo
 * in an env var cannot point the seed at another machine.
 */
const DEFAULT_PROJECT_ID = 'demo-regroup-e2e';
const LOOPBACK_HOST = /^(127\.0\.0\.1|localhost|\[::1\]):\d+$/;

/**
 * Resolve and validate the seed target from the environment.
 * Throws, naming the problem, when any part is unsafe or missing.
 */
function seedTarget(env) {
  const projectId = env.GCLOUD_PROJECT || DEFAULT_PROJECT_ID;
  if (!projectId.startsWith('demo-')) {
    throw new Error(
      `Refusing to seed project "${projectId}": only demo- (emulator-only) projects are allowed.`,
    );
  }
  const firestoreHost = env.FIRESTORE_EMULATOR_HOST || '127.0.0.1:8080';
  const authHost = env.FIREBASE_AUTH_EMULATOR_HOST || '127.0.0.1:9099';
  for (const [name, host] of [
    ['FIRESTORE_EMULATOR_HOST', firestoreHost],
    ['FIREBASE_AUTH_EMULATOR_HOST', authHost],
  ]) {
    if (!LOOPBACK_HOST.test(host)) {
      throw new Error(`Refusing to seed: ${name} must be a loopback host:port, got "${host}".`);
    }
  }
  const password = env.E2E_TEST_PASSWORD;
  if (!password) {
    throw new Error(
      'E2E_TEST_PASSWORD is not set (the shared e2e account password; see e2e/SECURITY-test-credentials.md).',
    );
  }
  return { projectId, firestoreHost, authHost, password };
}

module.exports = { seedTarget, DEFAULT_PROJECT_ID };
