#!/usr/bin/env node
/**
 * Refuses to let Maestro drive anything but an e2e build.
 *
 * Every launch or logout of a store/Debug build (com.rats.dev, com.regroup.app)
 * signs in anonymously against production phoenix-cleanhouse, so a test run on
 * one writes accounts to production (launch design §3.4). Two checks:
 *   - the app id ends in exactly .e2e.emu or .e2e.stg;
 *   - the installed JS bundle carries exactly one E2E marker
 *     ("regroup-e2e-variant=<variant>", inlined by babel.config.js) matching it.
 *
 *   node maestro/scripts/e2e-build-guard.js --platform ios|android --app-id <id> [--device <udid|serial>]
 *
 * Exit 0 = safe to run; exit 1 = refused (reason on stderr).
 */
const { execFileSync } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

const E2E_SUFFIXES = { '.e2e.emu': 'emulator', '.e2e.stg': 'staging' };
const MARKER = /regroup-e2e-variant=[a-z]+/g;

function checkAppId(appId) {
  if (typeof appId === 'string') {
    for (const [suffix, variant] of Object.entries(E2E_SUFFIXES)) {
      // A suffix match alone would accept "e2e.emu"; require a real id before it.
      if (appId.endsWith(suffix) && appId.length > suffix.length) {
        return { ok: true, variant };
      }
    }
  }
  return {
    ok: false,
    reason: `${JSON.stringify(appId)} is not an e2e app id (must end in ${Object.keys(E2E_SUFFIXES).join(' or ')})`,
  };
}

function checkBundleMarkers(bundleText, expectedVariant) {
  const found = [...new Set(String(bundleText).match(MARKER) || [])];
  const expected = `regroup-e2e-variant=${expectedVariant}`;
  if (found.length === 0) {
    return { ok: false, reason: 'the bundle has no e2e marker (not an e2e build)' };
  }
  if (found.length > 1) {
    return { ok: false, reason: `the bundle has several e2e markers: ${found.join(', ')}` };
  }
  if (found[0] !== expected) {
    return { ok: false, reason: `the bundle says ${found[0]}, expected ${expected}` };
  }
  return { ok: true };
}

// A production build on the same device can be opened by a deep link: both
// register regroup-app:// and com.rats.dev://, so the OS may pick it (iOS) or
// offer it (Android), and its launch signs in to production.
const PRODUCTION_APP_IDS = ['com.rats.dev', 'com.regroup.app'];

function parseIosApps(listappsText) {
  return [...String(listappsText).matchAll(/CFBundleIdentifier = "?([^";\s]+)"?;/g)].map(
    (m) => m[1],
  );
}

function parseAndroidPackages(text) {
  return String(text)
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l.startsWith('package:'))
    .map((l) => l.slice('package:'.length));
}

function checkNoProductionApps(installedIds) {
  const found = PRODUCTION_APP_IDS.filter((id) => installedIds.includes(id));
  if (found.length) {
    return {
      ok: false,
      reason: `${found.join(', ')} is installed on the device; a deep link could open it and sign in to production. Uninstall it from the test device`,
    };
  }
  return { ok: true };
}

function listInstalled(platform, device) {
  if (platform === 'ios') {
    return parseIosApps(
      execFileSync('xcrun', ['simctl', 'listapps', device || 'booted'], { encoding: 'utf8' }),
    );
  }
  const args = [...(device ? ['-s', device] : []), 'shell', 'pm', 'list', 'packages'];
  return parseAndroidPackages(execFileSync('adb', args, { encoding: 'utf8' }));
}

function readIosBundle(appId, device) {
  const container = execFileSync(
    'xcrun',
    ['simctl', 'get_app_container', device || 'booted', appId, 'app'],
    { encoding: 'utf8' },
  ).trim();
  return fs.readFileSync(path.join(container, 'main.jsbundle'), 'latin1');
}

function readAndroidBundle(appId, device) {
  const adb = (args) =>
    execFileSync('adb', [...(device ? ['-s', device] : []), ...args], { encoding: 'utf8' });
  const apkPath = adb(['shell', 'pm', 'path', appId])
    .split('\n')
    .map((l) => l.trim())
    .find((l) => l.startsWith('package:') && l.endsWith('base.apk'));
  if (!apkPath) {
    throw new Error(`${appId} is not installed on the device`);
  }
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'e2e-build-guard-'));
  try {
    const local = path.join(dir, 'base.apk');
    adb(['pull', apkPath.slice('package:'.length), local]);
    return execFileSync('unzip', ['-p', local, 'assets/index.android.bundle'], {
      encoding: 'latin1',
      maxBuffer: 256 * 1024 * 1024,
    });
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

function parseArgs(argv) {
  const args = {};
  for (let i = 0; i < argv.length; i += 2) {
    args[argv[i].replace(/^--/, '')] = argv[i + 1];
  }
  return args;
}

function main(argv) {
  const { platform, 'app-id': appId, device } = parseArgs(argv);
  const refuse = (reason) => {
    process.stderr.write(`e2e-build-guard: REFUSED ${reason}\n`);
    return 1;
  };
  if (platform !== 'ios' && platform !== 'android') {
    return refuse('--platform must be ios or android');
  }
  const id = checkAppId(appId);
  if (!id.ok) {
    return refuse(id.reason);
  }
  let bundle;
  try {
    const prod = checkNoProductionApps(listInstalled(platform, device));
    if (!prod.ok) {
      return refuse(prod.reason);
    }
    bundle = platform === 'ios' ? readIosBundle(appId, device) : readAndroidBundle(appId, device);
  } catch (err) {
    return refuse(`could not read the installed bundle of ${appId}: ${err.message}`);
  }
  const marker = checkBundleMarkers(bundle, id.variant);
  if (!marker.ok) {
    return refuse(`${appId}: ${marker.reason}`);
  }
  process.stdout.write(`e2e-build-guard: OK ${appId} (${id.variant})\n`);
  return 0;
}

if (require.main === module) {
  process.exit(main(process.argv.slice(2)));
}

module.exports = {
  E2E_SUFFIXES,
  PRODUCTION_APP_IDS,
  checkAppId,
  checkBundleMarkers,
  checkNoProductionApps,
  parseAndroidPackages,
  parseIosApps,
};
