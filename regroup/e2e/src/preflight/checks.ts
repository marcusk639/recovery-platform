import * as path from 'path';

/** Design §6 phase 1. Each check probes one prerequisite and never changes the machine. */
export type CheckResult = { ok: boolean; detail: string };
export type Check = { name: string; run(): Promise<CheckResult> };
export type NamedResult = CheckResult & { name: string };
export type Report = { ok: boolean; results: NamedResult[] };

export type ExecResult = { code: number; stdout: string; stderr: string };
/** Runs a command without a shell. Never throws: code 127 means the command was not found. */
export type Exec = (cmd: string, args: readonly string[]) => Promise<ExecResult>;

export const pass = (detail: string): CheckResult => ({ ok: true, detail });
export const fail = (detail: string): CheckResult => ({ ok: false, detail });

// Stripe secret and restricted keys and webhook signing secrets. A check that handles a
// specific secret also redacts that value itself; this is the net under every check.
const SECRET_SHAPES = /\b(?:sk|rk)_(?:live|test)_[A-Za-z0-9]+|\bwhsec_[A-Za-z0-9]+/g;

export function redact(text: string, secrets: readonly string[] = []): string {
  let out = text;
  for (const secret of secrets) {
    if (secret) out = out.split(secret).join('[redacted]');
  }
  return out.replace(SECRET_SHAPES, '[redacted]');
}

export const firstLine = (text: string): string =>
  text
    .split('\n')
    .map((l) => l.trim())
    .find(Boolean) ?? '';

/** Runs every check in order; a throwing check counts as failed and the rest still run. */
export async function runChecks(checks: readonly Check[]): Promise<Report> {
  const results: NamedResult[] = [];
  for (const check of checks) {
    let result: CheckResult;
    try {
      result = await check.run();
    } catch (err) {
      result = fail(`check threw: ${(err as Error)?.message ?? String(err)}`);
    }
    results.push({
      name: check.name,
      ok: result.ok === true,
      detail: redact(result.detail || '(no detail)'),
    });
  }
  return { ok: results.length > 0 && results.every((r) => r.ok), results };
}

export function formatReport(report: Report): string {
  const failed = report.results.filter((r) => !r.ok).length;
  const width = Math.max(...report.results.map((r) => r.name.length), 0);
  const verdict = report.ok
    ? `preflight OK: all ${report.results.length} checks passed`
    : `preflight FAILED: ${failed} of ${report.results.length} checks failed`;
  const lines = report.results.map(
    (r) => `${r.ok ? 'PASS' : 'FAIL'}  ${r.name.padEnd(width)}  ${r.detail}`,
  );
  return [verdict, ...lines].join('\n');
}

export type ToolSpec = { name: string; cmd: string; args: string[]; install: string };

export const TOOLS: readonly ToolSpec[] = [
  {
    name: 'maestro',
    cmd: 'maestro',
    args: ['--version'],
    install: 'brew install mobile-dev-inc/tap/maestro',
  },
  {
    name: 'xcode',
    cmd: 'xcodebuild',
    args: ['-version'],
    install: 'install Xcode and select it (xcode-select -s, or DEVELOPER_DIR)',
  },
  {
    name: 'firebase-cli',
    cmd: 'firebase',
    args: ['--version'],
    install: 'npm i -g firebase-tools',
  },
  {
    name: 'stripe-cli',
    cmd: 'stripe',
    args: ['--version'],
    install: 'brew install stripe/stripe-cli/stripe',
  },
];

async function versionOf(exec: Exec, cmd: string, args: string[]): Promise<CheckResult> {
  const r = await exec(cmd, args);
  if (r.code === 127) return fail(`${cmd} not found`);
  if (r.code !== 0) {
    return fail(
      `\`${[cmd, ...args].join(' ')}\` exited ${r.code}: ${firstLine(r.stderr || r.stdout)}`,
    );
  }
  const version = firstLine(r.stdout) || firstLine(r.stderr);
  return version ? pass(version) : fail(`\`${[cmd, ...args].join(' ')}\` printed no version`);
}

export function toolCheck(exec: Exec, spec: ToolSpec): Check {
  return {
    name: `tool:${spec.name}`,
    async run() {
      const r = await versionOf(exec, spec.cmd, spec.args);
      return r.ok || !/not found$/.test(r.detail)
        ? r
        : fail(`${r.detail}. Install: ${spec.install}`);
    },
  };
}

/** Playwright is whichever copy the web e2e will use: regroup/e2e's, else regroup/web's. */
export function playwrightCheck(
  exec: Exec,
  exists: (p: string) => boolean,
  packageDirs: readonly string[],
): Check {
  return {
    name: 'tool:playwright',
    async run() {
      for (const dir of packageDirs) {
        const bin = path.join(dir, 'node_modules', '.bin', 'playwright');
        if (!exists(bin)) continue;
        const r = await versionOf(exec, bin, ['--version']);
        return r.ok ? pass(`${r.detail} (${dir})`) : r;
      }
      return fail(
        `Playwright is not installed in ${packageDirs.join(' or ')}. Install: ` +
          'npm i -D @playwright/test in regroup/e2e, then npx playwright install chromium',
      );
    },
  };
}

export const DEFAULT_ANDROID_SDK = '/opt/homebrew/share/android-commandlinetools';
const SDK_TOOLS = [
  'cmdline-tools/latest/bin/sdkmanager',
  'cmdline-tools/latest/bin/avdmanager',
  'platform-tools/adb',
  'emulator/emulator',
];

export function resolveAndroidSdk(env: NodeJS.ProcessEnv, fallback = DEFAULT_ANDROID_SDK): string {
  return env.ANDROID_HOME || env.ANDROID_SDK_ROOT || fallback;
}

export function androidSdkCheck(
  exec: Exec,
  exists: (p: string) => boolean,
  env: NodeJS.ProcessEnv,
  fallback = DEFAULT_ANDROID_SDK,
): Check {
  return {
    name: 'tool:android-sdk',
    async run() {
      const root = resolveAndroidSdk(env, fallback);
      if (!exists(root)) {
        return fail(
          `no Android SDK at ${root}. Install: brew install --cask android-commandlinetools`,
        );
      }
      const missing = SDK_TOOLS.filter((t) => !exists(path.join(root, t)));
      if (missing.length) {
        return fail(
          `Android SDK at ${root} lacks ${missing.join(', ')} (sdkmanager --install them)`,
        );
      }
      const r = await versionOf(exec, path.join(root, SDK_TOOLS[0]), ['--version']);
      if (!r.ok) return r;
      const note = env.ANDROID_HOME
        ? ''
        : `; note: ANDROID_HOME is not exported (Gradle and the runner need it: export ANDROID_HOME=${root})`;
      return pass(`sdkmanager ${r.detail} at ${root}${note}`);
    },
  };
}

/** Major version from `java -version` output: "21.0.12.1" -> 21, "1.8.0_392" -> 8. */
export function javaMajor(output: string): number | undefined {
  const m = /version "(\d+)(?:\.(\d+))?/.exec(output);
  if (!m) return undefined;
  const major = Number(m[1]);
  return major === 1 && m[2] ? Number(m[2]) : major;
}

/** C5: firebase-tools 15+ needs Java 21 for the emulators; it runs the `java` on PATH. */
export function javaVersionCheck(exec: Exec, min = 21): Check {
  return {
    name: `javaVersionAtLeast${min}`,
    async run() {
      const r = await exec('java', ['-version']);
      if (r.code === 127)
        return fail(`java not found; the Firebase emulators need Java ${min} or newer`);
      const major = javaMajor(`${r.stderr}\n${r.stdout}`);
      if (r.code !== 0 || major === undefined) {
        return fail(`could not read the Java version (\`java -version\` exited ${r.code})`);
      }
      const line = firstLine(r.stderr) || firstLine(r.stdout);
      return major >= min
        ? pass(line)
        : fail(
            `java on PATH is ${major} (${line}); need ${min} or newer for the Firebase emulators`,
          );
    },
  };
}

/** Android Gradle (AGP for RN 0.72) builds with JDK 17, separate from the emulators' Java. */
export function jdk17Check(exec: Exec): Check {
  return {
    name: 'jdk17ForAndroidGradle',
    async run() {
      const hint = 'no JDK 17 found for the Android Gradle build (brew install --cask zulu@17)';
      const home = await exec('/usr/libexec/java_home', ['-v', '17']);
      const dir = firstLine(home.stdout);
      if (home.code !== 0 || !dir) return fail(hint);
      const r = await exec(path.join(dir, 'bin', 'java'), ['-version']);
      const out = `${r.stderr}\n${r.stdout}`;
      if (r.code !== 0 || javaMajor(out) !== 17)
        return fail(`${hint}; java_home -v 17 gave ${dir}`);
      const version = /version "([^"]+)"/.exec(out)?.[1] ?? '17';
      return pass(`JDK ${version} at ${dir}`);
    },
  };
}
