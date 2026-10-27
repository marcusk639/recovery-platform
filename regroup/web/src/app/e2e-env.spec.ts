import { APP_INITIALIZER, Provider } from '@angular/core';
import { USE_EMULATOR as AUTH_EMULATOR } from '@angular/fire/auth';
import { USE_EMULATOR as FIRESTORE_EMULATOR } from '@angular/fire/firestore';
import { USE_EMULATOR as FUNCTIONS_EMULATOR } from '@angular/fire/functions';
import { environment as defaultEnvironment } from '../environments/environment';
import { environment as productionEnvironment } from '../environments/environment.prod';
import { environment as emulatorEnvironment } from '../environments/environment.e2e-emulator';
import {
  EmulatableStorage,
  EmulatorConfig,
  emulatorProviders,
  REQUIRED_EMULATORS,
  STORAGE_EMULATOR,
  verifyEmulators,
  wireStorageEmulator,
} from './emulator-providers';

type ProviderObject = {
  provide: unknown;
  useValue?: unknown;
  useFactory?: unknown;
  deps?: unknown[];
  multi?: boolean;
};

type InitializerFactory = (storage: { storage: EmulatableStorage }) => () => Promise<void>;

const EMULATOR_TOKENS = [AUTH_EMULATOR, FIRESTORE_EMULATOR, FUNCTIONS_EMULATOR, STORAGE_EMULATOR];

function findProvider(providers: Provider[], token: unknown): ProviderObject | undefined {
  return (providers as ProviderObject[]).find((p) => p && p.provide === token);
}

function initializerOf(providers: Provider[]): InitializerFactory {
  return findProvider(providers, APP_INITIALIZER).useFactory as InitializerFactory;
}

function fakeStorage() {
  const calls: [string, number][] = [];
  return {
    calls,
    afStorage: {
      storage: { useEmulator: (host: string, port: number) => calls.push([host, port]) },
    },
  };
}

const reachable = () => Promise.resolve();
const unreachable = (url: string) => Promise.reject(new Error(`connect ECONNREFUSED ${url}`));

const allFour: EmulatorConfig = {
  host: '127.0.0.1',
  ports: { auth: 9099, firestore: 8080, storage: 9199, functions: 5001 },
};

describe('e2e environments', () => {
  describe('default and production environments', () => {
    it('the default environment provides no emulator tokens', () => {
      expect(emulatorProviders(defaultEnvironment)).toEqual([]);
    });

    it('the production environment provides no emulator tokens', () => {
      const providers = emulatorProviders(productionEnvironment);
      expect(providers).toEqual([]);
      EMULATOR_TOKENS.forEach((token) => expect(findProvider(providers, token)).toBeUndefined());
    });

    it('the production environment still targets the production project', () => {
      expect(productionEnvironment.production).toBe(true);
      expect(productionEnvironment.firebaseConfig.projectId).toBe('phoenix-cleanhouse');
    });
  });

  describe('e2e-emulator environment', () => {
    const providers = emulatorProviders(emulatorEnvironment);

    it('targets the demo project with emulators on 127.0.0.1', () => {
      expect(emulatorEnvironment.firebaseConfig.projectId).toBe('demo-regroup-e2e');
      expect(emulatorEnvironment.useEmulators).toBe(true);
      expect(emulatorEnvironment.emulators).toEqual({
        host: '127.0.0.1',
        ports: { auth: 9099, firestore: 8080, storage: 9199, functions: 5001 },
      });
    });

    it('requests all four emulators: auth, firestore, storage and functions', () => {
      expect(Object.keys(emulatorEnvironment.emulators.ports).sort()).toEqual(
        REQUIRED_EMULATORS.slice().sort(),
      );
    });

    it('points Auth at the emulator through the AngularFire auth USE_EMULATOR token', () => {
      expect(findProvider(providers, AUTH_EMULATOR).useValue).toEqual(['127.0.0.1', 9099]);
    });

    it('points Firestore at the emulator through the AngularFire firestore USE_EMULATOR token', () => {
      expect(findProvider(providers, FIRESTORE_EMULATOR).useValue).toEqual(['127.0.0.1', 8080]);
    });

    it('points Functions at the emulator through the AngularFire functions USE_EMULATOR token', () => {
      expect(findProvider(providers, FUNCTIONS_EMULATOR).useValue).toEqual(['127.0.0.1', 5001]);
    });

    it('provides the Storage emulator host and port', () => {
      expect(findProvider(providers, STORAGE_EMULATOR).useValue).toEqual(['127.0.0.1', 9199]);
    });

    it('registers a startup guard as an APP_INITIALIZER that depends on storage', () => {
      const p = findProvider(providers, APP_INITIALIZER);
      expect(p).toBeDefined();
      expect(p.multi).toBe(true);
      expect(typeof p.useFactory).toBe('function');
      expect(p.deps.length).toBe(1);
    });

    it('starts when every emulator is wired and answers', async () => {
      await expectAsync(
        verifyEmulators(
          emulatorEnvironment.firebaseConfig.projectId,
          emulatorEnvironment.emulators,
          reachable,
        ),
      ).toBeResolved();
    });
  });

  describe('verifyEmulators', () => {
    it('resolves when every emulator is configured and answers the probe', async () => {
      const probed: string[] = [];
      await verifyEmulators('demo-regroup-e2e', allFour, (url) => {
        probed.push(url);
        return Promise.resolve();
      });
      expect(probed.sort()).toEqual([
        'http://127.0.0.1:5001/',
        'http://127.0.0.1:8080/',
        'http://127.0.0.1:9099/',
        'http://127.0.0.1:9199/',
      ]);
    });

    it('refuses to start when an SDK the app uses has no emulator configured', async () => {
      const noAuthOrStorage: EmulatorConfig = {
        host: '127.0.0.1',
        ports: { firestore: 8080, functions: 5001 },
      };
      await expectAsync(
        verifyEmulators('demo-regroup-e2e', noAuthOrStorage, reachable),
      ).toBeRejectedWithError(/auth, storage/);
    });

    it('rejects when the health probe fails', async () => {
      const authDown = (url: string) =>
        url.indexOf(':9099') !== -1 ? unreachable(url) : reachable();
      await expectAsync(
        verifyEmulators('demo-regroup-e2e', allFour, authDown),
      ).toBeRejectedWithError(/auth.*127\.0\.0\.1:9099/);
    });

    it('rejects when a probe does not answer in time', async () => {
      const hang = () => new Promise<void>(() => undefined);
      await expectAsync(
        verifyEmulators('demo-regroup-e2e', allFour, hang, 10),
      ).toBeRejectedWithError(/timed out/);
    });

    it('rejects a project that is not a demo- project, even if every emulator answers', async () => {
      await expectAsync(
        verifyEmulators('phoenix-cleanhouse', allFour, reachable),
      ).toBeRejectedWithError(/demo-/);
    });
  });

  describe('storage wiring', () => {
    it('wireStorageEmulator calls storage.useEmulator(host, port)', () => {
      const { calls, afStorage } = fakeStorage();
      wireStorageEmulator(afStorage.storage, '127.0.0.1', 9199);
      expect(calls).toEqual([['127.0.0.1', 9199]]);
    });

    it('wireStorageEmulator throws when the SDK cannot be redirected', () => {
      expect(() => wireStorageEmulator({}, '127.0.0.1', 9199)).toThrowError(/useEmulator/);
    });
  });

  describe('the APP_INITIALIZER', () => {
    const env = {
      useEmulators: true,
      emulators: allFour,
      firebaseConfig: { projectId: 'demo-regroup-e2e' },
    };

    it('wires storage to the emulator and resolves when every emulator answers', async () => {
      const { calls, afStorage } = fakeStorage();
      await initializerOf(emulatorProviders(env, reachable))(afStorage)();
      expect(calls).toEqual([['127.0.0.1', 9199]]);
    });

    it('runs the health guard', async () => {
      const { afStorage } = fakeStorage();
      const init = initializerOf(emulatorProviders(env, unreachable))(afStorage);
      await expectAsync(init()).toBeRejected();
    });

    it('rejects when storage cannot be pointed at the emulator', async () => {
      const init = initializerOf(emulatorProviders(env, reachable))({ storage: {} });
      await expectAsync(init()).toBeRejectedWithError(/storage/);
    });
  });
});
