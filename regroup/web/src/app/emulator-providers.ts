import { APP_INITIALIZER, Provider } from '@angular/core';
import { SETTINGS as FIRESTORE_SETTINGS } from '@angular/fire/firestore';
import { ORIGIN as FUNCTIONS_ORIGIN } from '@angular/fire/functions';

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
 * Emulators the installed SDKs cannot be pointed at. AngularFire 6.0.0 has no
 * USE_EMULATOR tokens (they arrived in 6.1.0), and firebase 7.14.2 has no
 * auth().useEmulator() or storage().useEmulator() (both arrived in 8.x).
 * Firestore (SETTINGS host) and Functions (ORIGIN) can be redirected.
 */
export const UNWIRED_EMULATORS: EmulatorService[] = ['auth', 'storage'];

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

/**
 * Fail-closed startup check for emulator builds. Rejects (so Angular aborts
 * bootstrap) unless the project is a `demo-` project, every requested
 * emulator can actually be wired, and every requested emulator answers.
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
  const requested = Object.keys(emulators.ports) as EmulatorService[];
  const unwired = requested.filter((s) => UNWIRED_EMULATORS.indexOf(s) !== -1);
  if (unwired.length > 0) {
    throw new Error(
      `Cannot point ${unwired.join(', ')} at the emulator with the installed ` +
        'AngularFire 6.0.0 / firebase 7.14.2. Refusing to start rather than talk to real Firebase.',
    );
  }
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
 * APP_INITIALIZER that aborts startup if they are not healthy. Returns no
 * providers at all unless the environment sets `useEmulators: true`.
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
  const providers: Provider[] = [];
  if (emulators.ports.firestore) {
    providers.push({
      provide: FIRESTORE_SETTINGS,
      useValue: { host: `${emulators.host}:${emulators.ports.firestore}`, ssl: false },
    });
  }
  if (emulators.ports.functions) {
    providers.push({
      provide: FUNCTIONS_ORIGIN,
      useValue: `http://${emulators.host}:${emulators.ports.functions}`,
    });
  }
  providers.push({
    provide: APP_INITIALIZER,
    multi: true,
    useFactory: () => () => verifyEmulators(env.firebaseConfig.projectId, emulators, probe),
  });
  return providers;
}
