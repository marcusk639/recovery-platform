import * as fs from 'fs';
import * as path from 'path';
import {
  ANDROID_AVD,
  demoProjectIdCheck,
  IOS_SIM,
  simulatorsCheck,
  yogaPatchCheck,
} from '../preflight/repoChecks';
import { execFrom, ok, put, tmp } from './helpers/preflightFixtures';

describe('yogaPatchCheck', () => {
  const PATCHED = 'inline YGValue operator""_pt(long double value) {';
  const UNPATCHED = 'inline YGValue operator"" _pt(long double value) {';
  const HEADER = 'node_modules/react-native/ReactCommon/yoga/yoga/YGValue.h';
  const setup = (header: string | null, opts: { patch?: boolean; podfile?: boolean } = {}) => {
    const dir = tmp();
    put(dir, 'node_modules/react-native/package.json', '{"version":"0.72.17"}');
    if (opts.patch !== false) {
      put(dir, 'patches/react-native+0.72.17.patch', `--- a/${HEADER}\n+++ b/${HEADER}\n`);
    }
    if (header !== null) put(dir, HEADER, header);
    put(dir, 'ios/Podfile', opts.podfile === false ? '' : "'-Wno-deprecated-literal-operator'");
    return dir;
  };

  it('passes when the patch exists and the header is patched', async () => {
    const r = await yogaPatchCheck(setup(PATCHED)).run();
    expect(r.ok).toBe(true);
    expect(r.detail).toMatch(/0\.72\.17.*patched/);
    expect(r.detail).toMatch(/Podfile.*present/);
  });

  it('fails when the header is unpatched, the patch is missing, or react-native is not installed', async () => {
    const unpatched = await yogaPatchCheck(setup(UNPATCHED)).run();
    expect(unpatched.ok).toBe(false);
    expect(unpatched.detail).toMatch(/not applied.*patch-package/);
    const noPatch = await yogaPatchCheck(setup(PATCHED, { patch: false })).run();
    expect(noPatch.ok).toBe(false);
    expect(noPatch.detail).toMatch(/react-native\+0\.72\.17\.patch/);
    const notInstalled = await yogaPatchCheck(tmp()).run();
    expect(notInstalled.ok).toBe(false);
    expect(notInstalled.detail).toMatch(/npm ci/);
  });

  it('still requires the patch when only the Podfile backstop is present, and reports a missing backstop', async () => {
    expect((await yogaPatchCheck(setup(UNPATCHED)).run()).ok).toBe(false);
    const noBackstop = await yogaPatchCheck(setup(PATCHED, { podfile: false })).run();
    expect(noBackstop.ok).toBe(true);
    expect(noBackstop.detail).toMatch(/Podfile.*absent/);
  });
});

describe('demoProjectIdCheck', () => {
  const WEB = 'web/src/environments/environment.e2e-emulator.ts';
  const ANDROID = 'mobile/android/app/src/e2eEmulator/google-services.json';
  const IOS = 'mobile/ios/config/E2EEmulator/GoogleService-Info.plist';
  const plist = (id: string) => `<dict>\n<key>PROJECT_ID</key>\n\t<string>${id}</string>\n</dict>`;
  const setup = (ids: { web?: string; android?: string; ios?: string }) => {
    const dir = tmp();
    if (ids.web) put(dir, WEB, `firebaseConfig: {\n    projectId: '${ids.web}',\n}`);
    if (ids.android)
      put(dir, ANDROID, JSON.stringify({ project_info: { project_id: ids.android } }));
    if (ids.ios) put(dir, IOS, plist(ids.ios));
    return dir;
  };
  const all = { web: 'demo-regroup-e2e', android: 'demo-regroup-e2e', ios: 'demo-regroup-e2e' };

  it('passes when every emulator config uses demo-regroup-e2e', async () => {
    expect((await demoProjectIdCheck(setup(all)).run()).ok).toBe(true);
  });

  it('fails naming each config that is missing or uses another project', async () => {
    const r = await demoProjectIdCheck(
      setup({ ...all, ios: 'phoenix-cleanhouse', android: undefined }),
    ).run();
    expect(r.ok).toBe(false);
    expect(r.detail).toMatch(/GoogleService-Info\.plist.*phoenix-cleanhouse/);
    expect(r.detail).toMatch(/google-services\.json.*missing/);
  });

  it('fails when the emulator firebase dir has a .firebaserc alias to a real project', async () => {
    const dir = setup(all);
    put(
      dir,
      'mobile/firebase/.firebaserc',
      JSON.stringify({ projects: { default: 'phoenix-cleanhouse' } }),
    );
    const r = await demoProjectIdCheck(dir).run();
    expect(r.ok).toBe(false);
    expect(r.detail).toMatch(/\.firebaserc.*default.*phoenix-cleanhouse/);
  });
});

describe('simulatorsCheck', () => {
  const simctl = (devices: Record<string, unknown[]>) =>
    execFrom({ 'xcrun simctl list devices --json': ok(JSON.stringify({ devices })) });
  const iosDevice = {
    name: IOS_SIM.name,
    deviceTypeIdentifier: IOS_SIM.deviceType,
    isAvailable: true,
  };
  const avdHome = (sysdir: string | null) => {
    const dir = tmp();
    if (sysdir)
      put(
        dir,
        `${ANDROID_AVD.name}.avd/config.ini`,
        `abi.type=arm64-v8a\nimage.sysdir.1=${sysdir}\n`,
      );
    return dir;
  };
  const SYSDIR = `${ANDROID_AVD.image.replace(/;/g, '/')}/`;

  it('passes when the pinned simulator and AVD exist', async () => {
    const r = await simulatorsCheck(
      simctl({ [IOS_SIM.runtime]: [iosDevice] }),
      avdHome(SYSDIR),
    ).run();
    expect(r.ok).toBe(true);
  });

  it('fails, pointing at provision-simulators.sh, when either is missing or mis-pinned', async () => {
    const noSim = await simulatorsCheck(simctl({ [IOS_SIM.runtime]: [] }), avdHome(SYSDIR)).run();
    expect(noSim.ok).toBe(false);
    expect(noSim.detail).toMatch(/iOS simulator "regroup-e2e".*not found/);
    expect(noSim.detail).toMatch(/provision-simulators\.sh/);
    const noRuntime = await simulatorsCheck(simctl({}), avdHome(SYSDIR)).run();
    expect(noRuntime.detail).toMatch(/runtime.*iOS-27-0.*not installed/);
    const noAvd = await simulatorsCheck(
      simctl({ [IOS_SIM.runtime]: [iosDevice] }),
      avdHome(null),
    ).run();
    expect(noAvd.ok).toBe(false);
    expect(noAvd.detail).toMatch(/AVD "regroup-e2e" not found/);
    const wrongImage = await simulatorsCheck(
      simctl({ [IOS_SIM.runtime]: [iosDevice] }),
      avdHome('system-images/android-33/google_apis/arm64-v8a/'),
    ).run();
    expect(wrongImage.detail).toMatch(/android-33.*expected.*android-34/);
    const noXcrun = await simulatorsCheck(execFrom({}), avdHome(SYSDIR)).run();
    expect(noXcrun.detail).toMatch(/xcrun/);
  });

  it('provision-simulators.sh pins the same simulator and AVD as the check', () => {
    const script = fs.readFileSync(
      path.join(__dirname, '..', '..', 'scripts', 'provision-simulators.sh'),
      'utf8',
    );
    for (const value of [
      IOS_SIM.name,
      IOS_SIM.deviceType,
      IOS_SIM.runtime,
      ANDROID_AVD.name,
      ANDROID_AVD.image,
      ANDROID_AVD.device,
    ]) {
      expect(script).toContain(`"${value}"`);
    }
  });
});
