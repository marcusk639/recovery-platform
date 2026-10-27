import { spawnSync } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import { ANDROID_AVD, IOS_SIM } from '../preflight/repoChecks';
import { put, tmp } from './helpers/preflightFixtures';

// Runs the real script against stand-in xcrun/avdmanager/sdkmanager that only log their calls.
const SCRIPT = path.join(__dirname, '..', '..', 'scripts', 'provision-simulators.sh');
const SYSDIR = `${ANDROID_AVD.image.replace(/;/g, '/')}/`;
const LOGGER = '#!/usr/bin/env bash\necho "$(basename "$0") $*" >> "$CALLS"\n';

type Setup = { avdSysdir?: string | null; imageInstalled?: boolean; devices?: object };

function setup(opts: Setup = {}) {
  const root = tmp();
  const sdk = path.join(root, 'sdk');
  for (const tool of ['avdmanager', 'sdkmanager']) {
    put(sdk, `cmdline-tools/latest/bin/${tool}`, `${LOGGER}cat >/dev/null\n`);
    fs.chmodSync(path.join(sdk, `cmdline-tools/latest/bin/${tool}`), 0o755);
  }
  if (opts.imageInstalled !== false) fs.mkdirSync(path.join(sdk, SYSDIR), { recursive: true });
  const avdHome = path.join(root, 'avd');
  fs.mkdirSync(avdHome);
  if (opts.avdSysdir !== null) {
    put(
      avdHome,
      `${ANDROID_AVD.name}.avd/config.ini`,
      `image.sysdir.1=${opts.avdSysdir ?? SYSDIR}\n`,
    );
  }
  const devices = opts.devices ?? {
    [IOS_SIM.runtime]: [
      { name: IOS_SIM.name, deviceTypeIdentifier: IOS_SIM.deviceType, udid: 'U1' },
    ],
  };
  put(root, 'devices.json', JSON.stringify({ devices }));
  const xcrun = path.join(root, 'xcrun');
  fs.writeFileSync(
    xcrun,
    `${LOGGER}case "$3" in runtimes) echo "${IOS_SIM.runtime}" ;; devices) cat "${root}/devices.json" ;; esac\n`,
  );
  fs.chmodSync(xcrun, 0o755);
  const calls = path.join(root, 'calls.log');
  const run = (...flags: string[]) => {
    const r = spawnSync('bash', [SCRIPT, ...flags], {
      encoding: 'utf8',
      env: {
        ...process.env,
        ANDROID_HOME: sdk,
        ANDROID_AVD_HOME: avdHome,
        XCRUN: xcrun,
        CALLS: calls,
      },
    });
    const log = fs.existsSync(calls) ? fs.readFileSync(calls, 'utf8') : '';
    // Listing is read-only; only the mutating calls matter here.
    const mutations = log.split('\n').filter((l) => / (create|delete|--install)/.test(l));
    return { code: r.status, out: `${r.stdout}${r.stderr}`, mutations };
  };
  return { run };
}

const WRONG = 'system-images/android-33/google_apis/arm64-v8a/';

describe('provision-simulators.sh', () => {
  it('passes bash -n', () => {
    expect(spawnSync('bash', ['-n', SCRIPT]).status).toBe(0);
  });

  it('leaves matching devices alone', () => {
    const r = setup().run();
    expect(r.code).toBe(0);
    expect(r.out).toMatch(/AVD regroup-e2e exists with/);
    expect(r.mutations).toEqual([]);
  });

  it('fails on an AVD with the wrong image, naming --recreate, and changes nothing', () => {
    const r = setup({ avdSysdir: WRONG }).run();
    expect(r.code).toBe(1);
    expect(r.out).toMatch(/uses system-images\/android-33.*expected.*android-34.*--recreate/);
    expect(r.mutations).toEqual([]);
  });

  it('with --recreate, deletes and recreates a mis-pinned AVD', () => {
    const r = setup({ avdSysdir: WRONG }).run('--recreate');
    expect(r.code).toBe(0);
    expect(r.mutations).toEqual([
      'avdmanager delete avd --name regroup-e2e',
      `avdmanager create avd --name regroup-e2e --package ${ANDROID_AVD.image} --device ${ANDROID_AVD.device}`,
    ]);
  });

  it('with --recreate --dry-run, only prints', () => {
    const r = setup({ avdSysdir: WRONG }).run('--recreate', '--dry-run');
    expect(r.code).toBe(0);
    expect(r.out).toMatch(/would run: .*avdmanager delete avd --name regroup-e2e/);
    expect(r.out).toMatch(/would run: echo no \| .*avdmanager create avd/);
    expect(r.mutations).toEqual([]);
  });

  it('does not delete the AVD when the pinned image is missing and --install is not given', () => {
    const r = setup({ avdSysdir: WRONG, imageInstalled: false }).run('--recreate');
    expect(r.code).toBe(1);
    expect(r.out).toMatch(/not installed; rerun with --install/);
    expect(r.mutations).toEqual([]);
  });

  it('creates a missing iOS simulator, but never a duplicate of a mismatched or repeated name', () => {
    expect(setup({ devices: { [IOS_SIM.runtime]: [] } }).run().mutations).toEqual([
      `xcrun simctl create ${IOS_SIM.name} ${IOS_SIM.deviceType} ${IOS_SIM.runtime}`,
    ]);
    const device = { name: IOS_SIM.name, deviceTypeIdentifier: 'other.type', udid: 'U9' };
    const mismatch = setup({ devices: { [IOS_SIM.runtime]: [device] } }).run();
    expect(mismatch.code).toBe(1);
    expect(mismatch.out).toMatch(/U9 is other\.type .*not creating a duplicate/);
    expect(mismatch.mutations).toEqual([]);
    const dup = setup({
      devices: { [IOS_SIM.runtime]: [device, { ...device, udid: 'U8' }] },
    }).run();
    expect(dup.code).toBe(1);
    expect(dup.out).toMatch(/2 iOS simulators are named regroup-e2e/);
    expect(dup.mutations).toEqual([]);
  });
});
