/**
 * run-flows.sh's default simulator (#176). It used to default to a hardcoded
 * UDID ("E2E-iPhone") that no longer exists; it now uses the simulator named
 * regroup-e2e, which regroup/e2e/scripts/provision-simulators.sh creates.
 * xcrun, curl and maestro are stubs on PATH, so nothing boots or runs.
 */
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

const SCRIPT = path.join(__dirname, '..', 'run-flows.sh');
const E2E_UDID = '8118AC9B-17FD-477A-AB3C-98A1A4759D12';

function runWithSimulators(listing, extraEnv = {}) {
  const bin = fs.mkdtempSync(path.join(os.tmpdir(), 'run-flows-'));
  const calls = path.join(bin, 'xcrun-calls.log');
  const stub = (name, body) => {
    fs.writeFileSync(path.join(bin, name), `#!/bin/sh\n${body}\n`);
    fs.chmodSync(path.join(bin, name), 0o755);
  };
  fs.writeFileSync(path.join(bin, 'listing.txt'), listing);
  // Every device counts as booted; listapps lists nothing, so the script stops at
  // "not installed" after naming the simulator it chose.
  stub(
    'xcrun',
    `echo "$@" >> "${calls}"\n` +
      `if [ "$1 $2 $3" = "simctl list devices" ]; then cat "${bin}/listing.txt"; fi\nexit 0`,
  );
  stub('curl', 'exit 0');
  stub('maestro', 'exit 0');
  const result = spawnSync('bash', [SCRIPT, 'smoke', '--no-seed', '--no-reboot'], {
    encoding: 'utf8',
    env: {
      ...process.env,
      PATH: `${bin}:${process.env.PATH}`,
      E2E_TEST_PASSWORD: 'x',
      ...extraEnv,
    },
  });
  const log = fs.existsSync(calls) ? fs.readFileSync(calls, 'utf8') : '';
  fs.rmSync(bin, { recursive: true, force: true });
  return { output: result.stdout + result.stderr, status: result.status, xcrunCalls: log };
}

const listing = [
  '== Devices ==',
  '-- iOS 18.5 --',
  `    regroup-e2e-sweep (AC9BBDC3-EEF9-4C60-9C14-B847E2403920) (Shutdown) `,
  `    regroup-e2e (${E2E_UDID}) (Shutdown) `,
  `    regroup-e2e-debug (551FA766-C3D8-496D-A5DF-93267245038F) (Shutdown) `,
  '',
].join('\n');

describe('run-flows.sh simulator', () => {
  it('defaults to the simulator named regroup-e2e, not one with a longer name', () => {
    const { xcrunCalls } = runWithSimulators(listing, { SIM_UDID: '' });
    expect(xcrunCalls).toContain(`simctl listapps ${E2E_UDID}`);
    expect(xcrunCalls).not.toContain('809BD7B9-D9D5-45D2-AEA8-12F885F54407');
  });

  it('says how to create the simulator when it is missing', () => {
    const { output, status } = runWithSimulators(
      '    other-sim (11111111-1111-1111-1111-111111111111) (Shutdown) \n',
      {
        SIM_UDID: '',
      },
    );
    expect(status).toBe(1);
    expect(output).toContain('No simulator named regroup-e2e');
    expect(output).toContain('provision-simulators.sh');
  });

  it('uses SIM_UDID when it is set', () => {
    const other = 'AAAAAAAA-0000-0000-0000-000000000000';
    const chosen = runWithSimulators(`${listing}    mine (${other}) (Booted) \n`, { SIM_UDID: other });
    expect(chosen.xcrunCalls).toContain(`simctl listapps ${other}`);
    expect(chosen.xcrunCalls).not.toContain(`simctl listapps ${E2E_UDID}`);
  });
});
