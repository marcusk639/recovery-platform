// P1 runs only on loopback emulators, so there is no production config to pick up.
export const EMULATOR_PROJECT = 'demo-regroup-e2e';
export const EMULATOR_HOST = '127.0.0.1';
export const EMULATOR_PORTS = { auth: 19099, firestore: 18080, storage: 19199, functions: 15001 };

export function assertEmulatorProject(projectId: string): void {
  if (projectId !== EMULATOR_PROJECT) {
    throw new Error(`The portal may only use ${EMULATOR_PROJECT}, not "${projectId}".`);
  }
}
