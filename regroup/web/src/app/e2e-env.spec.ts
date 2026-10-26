import { APP_INITIALIZER, Provider } from '@angular/core';
import { SETTINGS as FIRESTORE_SETTINGS } from '@angular/fire/firestore';
import { ORIGIN as FUNCTIONS_ORIGIN } from '@angular/fire/functions';
import { environment as defaultEnvironment } from '../environments/environment';
import { environment as productionEnvironment } from '../environments/environment.prod';
import { environment as emulatorEnvironment } from '../environments/environment.e2e-emulator';
import {
  EmulatorConfig,
  emulatorProviders,
  UNWIRED_EMULATORS,
  verifyEmulators,
} from './emulator-providers';

type ProviderObject = {
  provide: unknown;
  useValue?: unknown;
  useFactory?: unknown;
  multi?: boolean;
};

function findProvider(providers: Provider[], token: unknown): ProviderObject | undefined {
  return (providers as ProviderObject[]).find((p) => p && p.provide === token);
}

const reachable = () => Promise.resolve();
const unreachable = (url: string) => Promise.reject(new Error(`connect ECONNREFUSED ${url}`));

describe('e2e environments', () => {
  describe('default and production environments', () => {
    it('the default environment provides no emulator tokens', () => {
      expect(emulatorProviders(defaultEnvironment)).toEqual([]);
    });

    it('the production environment provides no emulator tokens', () => {
      expect(emulatorProviders(productionEnvironment)).toEqual([]);
    });

    it('the production environment still targets the production project', () => {
      expect(productionEnvironment.production).toBe(true);
      expect(productionEnvironment.firebaseConfig.projectId).toBe('phoenix-cleanhouse');
    });
  });

  describe('e2e-emulator environment', () => {
    it('targets the demo project with emulators on 127.0.0.1', () => {
      expect(emulatorEnvironment.firebaseConfig.projectId).toBe('demo-regroup-e2e');
      expect(emulatorEnvironment.useEmulators).toBe(true);
      expect(emulatorEnvironment.emulators).toEqual({
        host: '127.0.0.1',
        ports: { auth: 9099, firestore: 8080, storage: 9199, functions: 5001 },
      });
    });

    it('requests all four emulators: auth, firestore, storage and functions', () => {
      expect(Object.keys(emulatorEnvironment.emulators.ports).sort()).toEqual([
        'auth',
        'firestore',
        'functions',
        'storage',
      ]);
    });

    it('points Firestore at the emulator through the AngularFire SETTINGS token', () => {
      const p = findProvider(emulatorProviders(emulatorEnvironment), FIRESTORE_SETTINGS);
      expect(p && p.useValue).toEqual({ host: '127.0.0.1:8080', ssl: false });
    });

    it('points Functions at the emulator through the AngularFire ORIGIN token', () => {
      const p = findProvider(emulatorProviders(emulatorEnvironment), FUNCTIONS_ORIGIN);
      expect(p && p.useValue).toBe('http://127.0.0.1:5001');
    });

    it('registers a startup guard as an APP_INITIALIZER', () => {
      const p = findProvider(emulatorProviders(emulatorEnvironment), APP_INITIALIZER);
      expect(p).toBeDefined();
      expect(p.multi).toBe(true);
      expect(typeof p.useFactory).toBe('function');
    });

    // AngularFire 6.0.0 / firebase 7.14.2 have no way to point Auth or Storage
    // at an emulator, so a build that asks for them must not start at all
    // rather than silently sending sign-ups to the real Google endpoints.
    it('refuses to start while auth or storage emulators cannot be wired', async () => {
      expect(UNWIRED_EMULATORS).toEqual(['auth', 'storage']);
      await expectAsync(
        verifyEmulators(
          emulatorEnvironment.firebaseConfig.projectId,
          emulatorEnvironment.emulators,
          reachable,
        ),
      ).toBeRejectedWithError(/auth, storage/);
    });
  });

  describe('verifyEmulators', () => {
    const wiredOnly: EmulatorConfig = {
      host: '127.0.0.1',
      ports: { firestore: 8080, functions: 5001 },
    };

    it('resolves when every requested emulator is wired and answers the probe', async () => {
      const probed: string[] = [];
      await verifyEmulators('demo-regroup-e2e', wiredOnly, (url) => {
        probed.push(url);
        return Promise.resolve();
      });
      expect(probed.sort()).toEqual(['http://127.0.0.1:5001/', 'http://127.0.0.1:8080/']);
    });

    it('rejects when the health probe fails', async () => {
      await expectAsync(
        verifyEmulators('demo-regroup-e2e', wiredOnly, unreachable),
      ).toBeRejectedWithError(/firestore.*127\.0\.0\.1:8080/);
    });

    it('rejects when a probe does not answer in time', async () => {
      const hang = () => new Promise<void>(() => undefined);
      await expectAsync(
        verifyEmulators('demo-regroup-e2e', wiredOnly, hang, 10),
      ).toBeRejectedWithError(/timed out/);
    });

    it('rejects a project that is not a demo- project, even if every emulator answers', async () => {
      await expectAsync(
        verifyEmulators('phoenix-cleanhouse', wiredOnly, reachable),
      ).toBeRejectedWithError(/demo-/);
    });

    it('the APP_INITIALIZER factory runs the guard', async () => {
      const env = {
        useEmulators: true,
        emulators: wiredOnly,
        firebaseConfig: { projectId: 'demo-regroup-e2e' },
      };
      const p = findProvider(emulatorProviders(env, unreachable), APP_INITIALIZER);
      const init = (p.useFactory as () => () => Promise<void>)();
      await expectAsync(init()).toBeRejected();
    });
  });
});
