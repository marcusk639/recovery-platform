import * as fs from 'fs';
import * as path from 'path';
import { fail, pass, type Check, type Exec } from './checks';

export const DEMO_PROJECT_ID = 'demo-regroup-e2e';

/** C4. scripts/provision-simulators.sh pins the same values (a test keeps them in step). */
export const IOS_SIM = {
  name: 'regroup-e2e',
  deviceType: 'com.apple.CoreSimulator.SimDeviceType.iPhone-17',
  runtime: 'com.apple.CoreSimulator.SimRuntime.iOS-27-0',
} as const;
export const ANDROID_AVD = {
  name: 'regroup-e2e',
  image: 'system-images;android-34;google_apis;arm64-v8a',
  device: 'pixel_7',
} as const;

const PROVISION_HINT = 'run regroup/e2e/scripts/provision-simulators.sh';

function readIfExists(file: string): string | null {
  try {
    return fs.readFileSync(file, 'utf8');
  } catch {
    return null;
  }
}

const YG_VALUE_H = 'node_modules/react-native/ReactCommon/yoga/yoga/YGValue.h';

/**
 * C2. RN 0.72's YGValue.h spells its literal operators `operator"" _pt`, which newer
 * clang flags as deprecated; Yoga builds with -Werror. The fix is the patch-package
 * patch in regroup/mobile/patches (applied by postinstall), so this checks the
 * installed header is the patched one. #124's Podfile -Wno-deprecated-literal-operator
 * on the Yoga pod is an iOS-only backstop: reported, but not a substitute.
 */
export function yogaPatchCheck(mobileDir: string): Check {
  return {
    name: 'yogaPatchApplied',
    async run() {
      const pkg = readIfExists(path.join(mobileDir, 'node_modules/react-native/package.json'));
      if (pkg === null) {
        return fail(
          'react-native is not installed in regroup/mobile; run npm ci there (postinstall applies patches)',
        );
      }
      const version = (JSON.parse(pkg) as { version?: string }).version ?? '?';
      const patchName = `patches/react-native+${version}.patch`;
      const patch = readIfExists(path.join(mobileDir, patchName));
      if (patch === null || !patch.includes('yoga/yoga/YGValue.h')) {
        return fail(
          `no Yoga patch for the installed react-native ${version}: ${patchName} is missing or does not patch YGValue.h`,
        );
      }
      const header = readIfExists(path.join(mobileDir, YG_VALUE_H));
      if (header === null) return fail(`${YG_VALUE_H} is missing; reinstall regroup/mobile`);
      if (/operator""\s+_/.test(header) || !header.includes('operator""_pt')) {
        return fail(
          `the Yoga patch is not applied to ${YG_VALUE_H}; run npx patch-package in regroup/mobile`,
        );
      }
      const podfile = readIfExists(path.join(mobileDir, 'ios/Podfile')) ?? '';
      const backstop = podfile.includes('-Wno-deprecated-literal-operator') ? 'present' : 'absent';
      return pass(
        `react-native ${version}: YGValue.h patched (${patchName}); Podfile Yoga -Wno-deprecated-literal-operator backstop ${backstop}`,
      );
    },
  };
}

const MOBILE_HINT = 'it comes with the mobile e2e variants change';
const DEMO_CONFIGS: {
  rel: string;
  projectId: (text: string) => string | undefined;
  hint?: string;
}[] = [
  {
    rel: 'web/src/environments/environment.e2e-emulator.ts',
    projectId: (t) => /projectId:\s*'([^']+)'/.exec(t)?.[1],
  },
  {
    rel: 'mobile/android/app/src/e2eEmulator/google-services.json',
    projectId: (t) =>
      (JSON.parse(t) as { project_info?: { project_id?: string } }).project_info?.project_id,
    hint: MOBILE_HINT,
  },
  {
    rel: 'mobile/ios/config/E2EEmulator/GoogleService-Info.plist',
    projectId: (t) => /<key>PROJECT_ID<\/key>\s*<string>([^<]*)<\/string>/.exec(t)?.[1],
    hint: MOBILE_HINT,
  },
];
// The emulator config the gate starts from (regroup/mobile/firebase/firebase.json). With no
// .firebaserc there, the CLI needs an explicit --project; one must not alias a real project.
const EMULATOR_FIREBASERC = 'mobile/firebase/.firebaserc';

/** Every committed e2e-emulator client config targets the demo project, never a real one. */
export function demoProjectIdCheck(regroupDir: string): Check {
  return {
    name: 'demoProjectIdInUse',
    async run() {
      const problems: string[] = [];
      for (const config of DEMO_CONFIGS) {
        const text = readIfExists(path.join(regroupDir, config.rel));
        if (text === null) {
          problems.push(`${config.rel} is missing${config.hint ? ` (${config.hint})` : ''}`);
          continue;
        }
        let id: string | undefined;
        try {
          id = config.projectId(text);
        } catch {
          id = undefined;
        }
        if (id !== DEMO_PROJECT_ID)
          problems.push(`${config.rel} uses project "${id ?? '(none found)'}"`);
      }
      const rc = readIfExists(path.join(regroupDir, EMULATOR_FIREBASERC));
      if (rc !== null) {
        let projects: Record<string, unknown> = {};
        try {
          projects = (JSON.parse(rc) as { projects?: Record<string, unknown> }).projects ?? {};
        } catch {
          problems.push(`${EMULATOR_FIREBASERC} is not valid JSON`);
        }
        for (const [alias, id] of Object.entries(projects)) {
          if (typeof id !== 'string' || !id.startsWith('demo-')) {
            problems.push(
              `${EMULATOR_FIREBASERC} alias ${alias} -> ${String(id)} is not a demo- project`,
            );
          }
        }
      }
      return problems.length
        ? fail(`expected ${DEMO_PROJECT_ID}: ${problems.join('; ')}`)
        : pass(`${DEMO_CONFIGS.length} e2e-emulator configs use ${DEMO_PROJECT_ID}`);
    },
  };
}

type SimDevice = { name?: string; deviceTypeIdentifier?: string; isAvailable?: boolean };

async function iosProblem(exec: Exec): Promise<string | null> {
  const r = await exec('xcrun', ['simctl', 'list', 'devices', '--json']);
  if (r.code !== 0)
    return `\`xcrun simctl list devices\` failed (exit ${r.code}); is Xcode selected?`;
  let devices: Record<string, SimDevice[]>;
  try {
    devices = (JSON.parse(r.stdout) as { devices: Record<string, SimDevice[]> }).devices ?? {};
  } catch {
    return '`xcrun simctl list devices --json` printed invalid JSON';
  }
  const onRuntime = devices[IOS_SIM.runtime];
  if (!onRuntime) return `iOS simulator runtime ${IOS_SIM.runtime} is not installed`;
  const match = onRuntime.find(
    (d) =>
      d.name === IOS_SIM.name &&
      d.deviceTypeIdentifier === IOS_SIM.deviceType &&
      d.isAvailable !== false,
  );
  return match
    ? null
    : `iOS simulator "${IOS_SIM.name}" (${IOS_SIM.deviceType}) on ${IOS_SIM.runtime} not found`;
}

function androidProblem(avdHome: string): string | null {
  const config = readIfExists(path.join(avdHome, `${ANDROID_AVD.name}.avd`, 'config.ini'));
  if (config === null) return `Android AVD "${ANDROID_AVD.name}" not found in ${avdHome}`;
  const sysdir = /^image\.sysdir\.1=(.*)$/m.exec(config)?.[1]?.trim();
  const expected = `${ANDROID_AVD.image.replace(/;/g, '/')}/`;
  return sysdir === expected
    ? null
    : `Android AVD "${ANDROID_AVD.name}" uses ${sysdir ?? '(no image)'}, expected ${expected}`;
}

/** C4: the iOS simulator and Android AVD the gate books exist with the pinned runtimes. */
export function simulatorsCheck(exec: Exec, avdHome: string): Check {
  return {
    name: 'simulatorsProvisioned',
    async run() {
      const problems = [await iosProblem(exec), androidProblem(avdHome)].filter(
        (p): p is string => p !== null,
      );
      return problems.length
        ? fail(`${problems.join('; ')}; ${PROVISION_HINT}`)
        : pass(
            `iOS "${IOS_SIM.name}" (iPhone 17, iOS 27.0) and AVD "${ANDROID_AVD.name}" (${ANDROID_AVD.image})`,
          );
    },
  };
}
