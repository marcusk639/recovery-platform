import {
  androidSdkCheck,
  formatReport,
  javaVersionCheck,
  jdk17Check,
  playwrightCheck,
  runChecks,
  toolCheck,
  type Check,
} from '../preflight/checks';
import { execFrom, ok } from './helpers/preflightFixtures';

describe('runChecks', () => {
  const pass: Check = { name: 'a', run: async () => ({ ok: true, detail: 'fine' }) };
  const failing: Check = { name: 'b', run: async () => ({ ok: false, detail: 'broken' }) };
  const throwing: Check = {
    name: 'c',
    run: async () => {
      throw new Error('boom sk_test_abc123');
    },
  };

  it('is ok only when every check passes', async () => {
    expect((await runChecks([pass])).ok).toBe(true);
    const result = await runChecks([pass, failing]);
    expect(result.ok).toBe(false);
    expect(result.results.map((r) => [r.name, r.ok])).toEqual([
      ['a', true],
      ['b', false],
    ]);
  });

  it('turns a throwing check into a failure, runs the rest, and redacts key-shaped text', async () => {
    const result = await runChecks([throwing, pass]);
    expect(result.ok).toBe(false);
    expect(result.results[0]).toMatchObject({ name: 'c', ok: false });
    expect(result.results[0].detail).toMatch(/boom/);
    expect(result.results[0].detail).not.toMatch(/sk_test_abc123/);
    expect(result.results[1].ok).toBe(true);
  });

  it('formats a report naming every check and the verdict', async () => {
    const report = formatReport(await runChecks([pass, failing]));
    expect(report).toMatch(/PASS\s+a\s.*fine/);
    expect(report).toMatch(/FAIL\s+b\s.*broken/);
    expect(report).toMatch(/1 of 2 checks failed/);
  });
});

describe('tool checks', () => {
  const spec = {
    name: 'maestro',
    cmd: 'maestro',
    args: ['--version'],
    install: 'brew install maestro',
  };

  it('reports the version when present', async () => {
    const r = await toolCheck(execFrom({ 'maestro --version': ok('2.12.0\n') }), spec).run();
    expect(r).toEqual({ ok: true, detail: '2.12.0' });
  });

  it('fails with the install hint when missing, and with the exit code when broken', async () => {
    const missing = await toolCheck(execFrom({}), spec).run();
    expect(missing.ok).toBe(false);
    expect(missing.detail).toMatch(/maestro not found.*brew install maestro/);
    const broken = await toolCheck(
      execFrom({ maestro: { code: 3, stdout: '', stderr: 'bad jvm' } }),
      spec,
    ).run();
    expect(broken).toMatchObject({ ok: false });
    expect(broken.detail).toMatch(/exited 3.*bad jvm/);
  });

  it('Playwright fails with an install hint when neither regroup/e2e nor regroup/web has it', async () => {
    const r = await playwrightCheck(execFrom({}), () => false, ['/x/e2e', '/x/web']).run();
    expect(r.ok).toBe(false);
    expect(r.detail).toMatch(/@playwright\/test/);
    expect(r.detail).toMatch(/npx playwright install/);
  });

  it('Playwright reports the version of the first package that has it', async () => {
    const bin = '/x/web/node_modules/.bin/playwright';
    const r = await playwrightCheck(
      execFrom({ [`${bin} --version`]: ok('Version 1.56.0\n') }),
      (p) => p === bin,
      ['/x/e2e', '/x/web'],
    ).run();
    expect(r).toEqual({ ok: true, detail: 'Version 1.56.0 (/x/web)' });
  });

  it('Android SDK fails naming each missing tool, and notes an unexported ANDROID_HOME', async () => {
    const root = '/opt/sdk';
    const r = await androidSdkCheck(execFrom({}), (p) => p === root, {}, root).run();
    expect(r.ok).toBe(false);
    expect(r.detail).toMatch(/sdkmanager/);
    expect(r.detail).toMatch(/platform-tools\/adb/);
    expect(r.detail).toMatch(/emulator\/emulator/);

    const all = await androidSdkCheck(
      execFrom({ [`${root}/cmdline-tools/latest/bin/sdkmanager --version`]: ok('19.0\n') }),
      (p) => p.startsWith(root),
      {},
      root,
    ).run();
    expect(all.ok).toBe(true);
    expect(all.detail).toMatch(/sdkmanager 19\.0/);
    expect(all.detail).toMatch(/ANDROID_HOME is not exported/);
  });
});

describe('Java checks', () => {
  it('passes Java 21+ and fails older or missing Java', async () => {
    const java = (v: string) =>
      execFrom({ 'java -version': ok('', `openjdk version "${v}" 2026-08-18\n`) });
    expect((await javaVersionCheck(java('21.0.12.1'), 21).run()).ok).toBe(true);
    const old = await javaVersionCheck(java('17.0.2'), 21).run();
    expect(old.ok).toBe(false);
    expect(old.detail).toMatch(/17.*21 or newer.*Firebase/);
    expect((await javaVersionCheck(java('1.8.0_392'), 21).run()).detail).toMatch(/\b8\b/);
    expect((await javaVersionCheck(execFrom({}), 21).run()).detail).toMatch(/java not found/);
  });

  it('finds JDK 17 through java_home, and fails clearly when there is none', async () => {
    const home = '/jdk17/Contents/Home';
    const found = await jdk17Check(
      execFrom({
        '/usr/libexec/java_home -v 17': ok(`${home}\n`),
        [`${home}/bin/java -version`]: ok('', 'openjdk version "17.0.21" 2026-07-15\n'),
      }),
    ).run();
    expect(found).toEqual({ ok: true, detail: `JDK 17.0.21 at ${home}` });
    const none = await jdk17Check(
      execFrom({ '/usr/libexec/java_home -v 17': { code: 1, stdout: '', stderr: 'none' } }),
    ).run();
    expect(none.ok).toBe(false);
    expect(none.detail).toMatch(/JDK 17.*Android Gradle/);
  });
});
