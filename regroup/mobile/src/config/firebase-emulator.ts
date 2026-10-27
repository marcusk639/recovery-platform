/**
 * Firebase emulator wiring for the 'emulator' e2e build variant.
 *
 * Fail-closed by design. Only firebase-setup.ts calls connectToEmulators, and
 * only when the bundle was built with E2E_VARIANT=emulator (src/config/env.ts),
 * so no other build ever reaches useEmulator. In an emulator build, a port that
 * does not answer rejects with E2EEmulatorUnreachable. Nothing catches it and
 * nothing falls back to a real project: index.js turns it into a fatal error.
 */
import { Platform } from 'react-native';
import auth from '@react-native-firebase/auth';
import firestore from '@react-native-firebase/firestore';
import storage from '@react-native-firebase/storage';
import functions from '@react-native-firebase/functions';
import type { LaunchArguments as LaunchArgumentsApi } from 'react-native-launch-arguments';
import { E2E_PROJECT_IDS, E2EVariant } from './env';

export type EmulatorPorts = {
  auth: number;
  firestore: number;
  storage: number;
  functions: number;
};

export type EmulatorOptions = { host: string; ports: EmulatorPorts };

/** How long each port has to answer the startup health probe. */
export const PROBE_TIMEOUT_MS = 5000;

/** The Firebase CLI default emulator ports, used when no launch argument overrides one. */
const DEFAULT_PORTS: EmulatorPorts = {
  auth: 9099,
  firestore: 8080,
  storage: 9199,
  functions: 5001,
};

const PORT_ARGUMENTS: Record<keyof EmulatorPorts, string> = {
  auth: 'e2eAuthPort',
  firestore: 'e2eFirestorePort',
  storage: 'e2eStoragePort',
  functions: 'e2eFunctionsPort',
};

export class E2EEmulatorUnreachable extends Error {
  readonly unreachable: string[];

  constructor(unreachable: string[]) {
    super(
      `E2E emulator build cannot reach the Firebase emulators: ${unreachable.join(', ')}. ` +
        'Start them (firebase emulators:start in regroup/) before launching the app. ' +
        'This build never falls back to a real Firebase project.',
    );
    this.name = 'E2EEmulatorUnreachable';
    this.unreachable = unreachable;
    // Keeps instanceof working when the class is transpiled to ES5.
    Object.setPrototypeOf(this, E2EEmulatorUnreachable.prototype);
  }
}

export class E2EProjectMismatch extends Error {
  constructor(variant: E2EVariant, projectId: string | undefined) {
    super(
      `E2E ${variant} build is configured for Firebase project "${projectId}", ` +
        `expected "${E2E_PROJECT_IDS[variant]}". Refusing to start: a bundled ` +
        'E2E_VARIANT must never run against another project. E2E_VARIANT comes from ' +
        'the build (the Gradle build type or the Xcode configuration) or the shell ' +
        'that started Metro; check those.',
    );
    this.name = 'E2EProjectMismatch';
    Object.setPrototypeOf(this, E2EProjectMismatch.prototype);
  }
}

/** Throws E2EProjectMismatch unless the native project is the variant's own. */
export const assertE2EProject = (variant: E2EVariant, projectId: string | undefined): void => {
  if (projectId !== E2E_PROJECT_IDS[variant]) {
    throw new E2EProjectMismatch(variant, projectId);
  }
};

/**
 * The host machine as seen from the simulator or emulator. RNFirebase would
 * remap 127.0.0.1 on Android itself, but the health probe uses fetch, which
 * does not.
 */
export const emulatorHost = (): string => (Platform.OS === 'android' ? '10.0.2.2' : '127.0.0.1');

const parsePort = (name: string, raw: unknown): number => {
  const port = typeof raw === 'string' && raw.trim() !== '' ? Number(raw) : raw;
  if (typeof port !== 'number' || !Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error(`Launch argument ${name} must be a TCP port, got ${JSON.stringify(raw)}`);
  }
  return port;
};

/** Emulator ports from launch arguments, each defaulting to the CLI default. */
export const emulatorPorts = (): EmulatorPorts => {
  // Loaded here, not at the top: the native module runs startup code when first
  // loaded (on Android it can wait ~20 s for an Activity), so only the emulator
  // variant may touch it. A literal require() is still bundled by Metro.
  const {
    LaunchArguments,
  }: { LaunchArguments: typeof LaunchArgumentsApi } = require('react-native-launch-arguments');
  const args = LaunchArguments.value<Record<string, unknown>>();
  const ports = { ...DEFAULT_PORTS };
  (Object.keys(PORT_ARGUMENTS) as (keyof EmulatorPorts)[]).forEach((service) => {
    const name = PORT_ARGUMENTS[service];
    if (args[name] !== undefined) {
      ports[service] = parsePort(name, args[name]);
    }
  });
  return ports;
};

/**
 * Resolves when the port answers any HTTP response within PROBE_TIMEOUT_MS.
 * A 404 still proves an emulator is listening; only a refused connection or
 * silence counts as unreachable.
 */
const probe = (url: string): Promise<boolean> =>
  new Promise((resolve) => {
    const timer = setTimeout(() => resolve(false), PROBE_TIMEOUT_MS);
    fetch(url).then(
      () => {
        clearTimeout(timer);
        resolve(true);
      },
      () => {
        clearTimeout(timer);
        resolve(false);
      },
    );
  });

/**
 * Points Auth, Firestore, Storage and Functions at the emulators, then checks
 * every port answers.
 *
 * The SDKs are wired synchronously, before the first await, so nothing the app
 * does while the probes run can reach a real project. If a probe fails the SDKs
 * stay pointed at the dead emulators and the returned promise rejects.
 */
export const connectToEmulators = async ({ host, ports }: EmulatorOptions): Promise<void> => {
  auth().useEmulator(`http://${host}:${ports.auth}`);
  firestore().useEmulator(host, ports.firestore);
  storage().useEmulator(host, ports.storage);
  functions().useEmulator(host, ports.functions);

  const services = Object.keys(ports) as (keyof EmulatorPorts)[];
  const results = await Promise.all(
    services.map((service) => probe(`http://${host}:${ports[service]}/`)),
  );
  const unreachable = services
    .filter((_, i) => !results[i])
    .map((service) => `${service} (${host}:${ports[service]})`);
  if (unreachable.length > 0) {
    throw new E2EEmulatorUnreachable(unreachable);
  }
};
