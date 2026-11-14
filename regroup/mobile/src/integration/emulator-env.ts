/**
 * Where the integration suite may connect, checked before any SDK starts.
 *
 * Both the client harness (rnfb-to-web.ts) and the Admin seeding handle
 * (firebase-admin-setup.ts) call these, so neither can reach a real project:
 * the project must be a `demo-` project (the emulators accept any id, and a
 * `demo-` id has no real backend), and every emulator must be on 127.0.0.1.
 * `firebase emulators:exec --project demo-test` sets GCLOUD_PROJECT and the
 * *_EMULATOR_HOST variables.
 */
export const EMULATOR_HOST = '127.0.0.1';

export function integrationProjectId(): string {
  const projectId = process.env.GCLOUD_PROJECT ?? '';
  if (!projectId.startsWith('demo-')) {
    throw new Error(
      `Integration tests run only against a demo- project, got "${projectId}". ` +
        'Run them through `firebase emulators:exec --project demo-test`.',
    );
  }
  return projectId;
}

/**
 * The port of an emulator from its *_EMULATOR_HOST variable, which must name
 * 127.0.0.1. Firestore and Auth are required; the others fall back to the
 * firebase.json ports when that emulator was not started.
 */
export function emulatorPort(variable: string, fallback?: number): number {
  const value = process.env[variable];
  if (!value) {
    if (fallback === undefined) {
      throw new Error(`${variable} is not set: start the emulators with firebase emulators:exec.`);
    }
    return fallback;
  }
  const [host, port] = value.split(':');
  if (host !== EMULATOR_HOST || !port) {
    throw new Error(`${variable} must be ${EMULATOR_HOST}:<port>, got "${value}".`);
  }
  return Number(port);
}
