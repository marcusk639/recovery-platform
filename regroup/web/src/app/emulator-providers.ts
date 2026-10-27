import { APP_INITIALIZER, InjectionToken, Provider } from '@angular/core';
import { USE_EMULATOR as AUTH_EMULATOR } from '@angular/fire/auth';
import { USE_EMULATOR as FIRESTORE_EMULATOR } from '@angular/fire/firestore';
import { USE_EMULATOR as FUNCTIONS_EMULATOR } from '@angular/fire/functions';
import { AngularFireStorage } from '@angular/fire/storage';

export type EmulatorService = 'auth' | 'firestore' | 'storage' | 'functions';

export interface EmulatorConfig {
  host: string;
  ports: Partial<Record<EmulatorService, number>>;
}

/** The subset of an environment file this module reads. */
export interface EmulatorAwareEnvironment {
  useEmulators?: boolean;
  emulators?: EmulatorConfig;
  firebaseConfig: { projectId: string };
}

/** Resolves when `url` answers at all; rejects on a network error. */
export type EmulatorProbe = (url: string) => Promise<void>;

/**
 * Every emulated SDK the app uses. An emulator build must point all of them at
 * the emulator suite; one left out would talk to real Google endpoints.
 * Analytics has no emulator: the e2e builds do not load it at all and provide a
 * no-op AngularFireAnalytics instead (see analytics-providers.ts).
 */
export const REQUIRED_EMULATORS: EmulatorService[] = ['auth', 'firestore', 'storage', 'functions'];

/**
 * AngularFire 6.1 has USE_EMULATOR tokens for auth, firestore and functions
 * but not storage, so storage gets this app-level token and is wired by the
 * APP_INITIALIZER through firebase 8's storage().useEmulator(host, port).
 */
export const STORAGE_EMULATOR = new InjectionToken<[string, number]>('regroup.storage-emulator');

/** The part of firebase.storage.Storage this module calls. */
export interface EmulatableStorage {
  useEmulator?: (host: string, port: number) => void;
}

const DEFAULT_PROBE_TIMEOUT_MS = 5000;

/**
 * Reachability probe. `no-cors` resolves with an opaque response whenever
 * something answers on the port and rejects when nothing is listening, which
 * is the health signal we need without depending on emulator CORS headers.
 */
export const fetchProbe: EmulatorProbe = (url) => {
  if (typeof fetch !== 'function') {
    return Promise.reject(new Error('fetch is unavailable, so emulators cannot be probed'));
  }
  return fetch(url, { mode: 'no-cors', cache: 'no-store' }).then(() => undefined);
};

function withTimeout(p: Promise<void>, ms: number, what: string): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`${what} timed out after ${ms}ms`)), ms);
    p.then(
      () => {
        clearTimeout(timer);
        resolve();
      },
      (err) => {
        clearTimeout(timer);
        reject(err);
      },
    );
  });
}

/** Points the storage SDK at the emulator, or throws if it cannot be. */
export function wireStorageEmulator(storage: EmulatableStorage, host: string, port: number): void {
  if (!storage || typeof storage.useEmulator !== 'function') {
    throw new Error(
      'The storage SDK has no useEmulator(); cannot point storage at the emulator. Refusing to start.',
    );
  }
  storage.useEmulator(host, port);
}

/**
 * Fail-closed startup check for emulator builds. Rejects (so Angular aborts
 * bootstrap) unless the project is a `demo-` project, every SDK the app uses
 * has an emulator configured, and every configured emulator answers.
 */
export async function verifyEmulators(
  projectId: string,
  emulators: EmulatorConfig,
  probe: EmulatorProbe = fetchProbe,
  timeoutMs = DEFAULT_PROBE_TIMEOUT_MS,
): Promise<void> {
  if (!/^demo-/.test(projectId)) {
    throw new Error(
      `Emulator builds must use a demo- project id; got "${projectId}". Refusing to start.`,
    );
  }
  const missing = REQUIRED_EMULATORS.filter((s) => !emulators.ports[s]);
  if (missing.length > 0) {
    throw new Error(
      `No emulator port configured for ${missing.join(', ')}. Refusing to start rather than ` +
        'let those SDKs talk to real Firebase.',
    );
  }
  const requested = Object.keys(emulators.ports) as EmulatorService[];
  await Promise.all(
    requested.map((service) => {
      const url = `http://${emulators.host}:${emulators.ports[service]}/`;
      return withTimeout(probe(url), timeoutMs, `${service} emulator probe at ${url}`).catch(
        (err) => {
          throw new Error(
            `${service} emulator is not reachable at ${url} (${err && err.message ? err.message : err}). Refusing to start.`,
          );
        },
      );
    }),
  );
}

/**
 * AngularFire providers that redirect the SDKs to the local emulators, plus an
 * APP_INITIALIZER that wires storage and aborts startup if the emulators are
 * not healthy. Returns no providers at all unless the environment sets
 * `useEmulators: true`.
 */
export function emulatorProviders(
  env: EmulatorAwareEnvironment,
  probe: EmulatorProbe = fetchProbe,
): Provider[] {
  if (env.useEmulators !== true) {
    return [];
  }
  const emulators = env.emulators;
  if (!emulators) {
    throw new Error('useEmulators is true but the environment has no emulators config');
  }
  const { host, ports } = emulators;
  const providers: Provider[] = [];
  if (ports.auth) {
    providers.push({ provide: AUTH_EMULATOR, useValue: [host, ports.auth] });
  }
  if (ports.firestore) {
    providers.push({ provide: FIRESTORE_EMULATOR, useValue: [host, ports.firestore] });
  }
  if (ports.functions) {
    providers.push({ provide: FUNCTIONS_EMULATOR, useValue: [host, ports.functions] });
  }
  if (ports.storage) {
    providers.push({ provide: STORAGE_EMULATOR, useValue: [host, ports.storage] });
  }
  providers.push({
    provide: APP_INITIALIZER,
    multi: true,
    deps: [AngularFireStorage],
    // Storage is wired first so that no storage call can run before it is
    // redirected; a wiring failure rejects like a failed probe.
    useFactory: (afStorage: AngularFireStorage) => async () => {
      if (ports.storage) {
        wireStorageEmulator(afStorage && afStorage.storage, host, ports.storage);
      }
      await verifyEmulators(env.firebaseConfig.projectId, emulators, probe);
    },
  });
  return providers;
}
