/**
 * Reads or flips a server switch, without a deploy:
 *
 *   paywall    — paywall/config.enabled. false lets every house in (the paywall's
 *                kill switch, for undoing a paywall mistake); true restores it.
 *   sales      — config/sales.open. Whether new tier subscriptions can start.
 *   minVersion — config/app.minVersion.<platform>. The oldest app version let in
 *                on that platform (getAppConfig; the app's minimum-version gate).
 *                none removes the minimum. Set it only once that version is
 *                downloadable in the store, or nobody can get in.
 *
 *   npm run switch:set -- --switch=paywall|sales --value=true|false [--apply]
 *   npm run switch:set -- --switch=minVersion --platform=ios|android --value=<x.y[.z]|none> [--apply]
 *
 * Without --apply it prints the current and intended value and writes nothing.
 * scriptBootstrap logs which project it targets; check it before --apply.
 */
import './scriptBootstrap';
import * as admin from 'firebase-admin';

const SWITCHES: Record<string, { path: string; field: string }> = {
  paywall: { path: 'paywall/config', field: 'enabled' },
  sales: { path: 'config/sales', field: 'open' },
};

const PLATFORMS = ['ios', 'android'];
const VERSION = /^\d+\.\d+(\.\d+)?$/;

const USAGE =
  'usage: setServerSwitch --switch=paywall|sales --value=true|false [--apply]\n' +
  '       setServerSwitch --switch=minVersion --platform=ios|android --value=<x.y[.z]|none> [--apply]';

type SwitchValue = boolean | string | null;

const arg = (argv: string[], name: string): string | undefined =>
  argv.find((a) => a.startsWith(`--${name}=`))?.slice(name.length + 3);

function parseMinVersion(argv: string[]): { path: string; field: string; value: SwitchValue } {
  const platform = arg(argv, 'platform') ?? '';
  const raw = arg(argv, 'value') ?? '';
  if (!PLATFORMS.includes(platform) || (raw !== 'none' && !VERSION.test(raw))) {
    throw new Error(USAGE);
  }
  return {
    path: 'config/app',
    field: `minVersion.${platform}`,
    value: raw === 'none' ? null : raw,
  };
}

export function parseSwitchArgs(argv: string[]): {
  path: string;
  field: string;
  value: SwitchValue;
  apply: boolean;
} {
  const apply = argv.includes('--apply');
  const name = arg(argv, 'switch') ?? '';
  if (name === 'minVersion') return { ...parseMinVersion(argv), apply };
  const target = SWITCHES[name];
  const raw = arg(argv, 'value');
  if (!target || (raw !== 'true' && raw !== 'false')) throw new Error(USAGE);
  return { ...target, value: raw === 'true', apply };
}

/** `a.b` → `{ a: { b: value } }`, so a merge write leaves the map's other keys. */
export function nestedValue(field: string, value: SwitchValue): Record<string, unknown> {
  return field.split('.').reduceRight<unknown>((inner, key) => ({ [key]: inner }), value) as Record<
    string,
    unknown
  >;
}

export async function main(argv: string[] = process.argv.slice(2)): Promise<void> {
  const { path, field, value, apply } = parseSwitchArgs(argv);
  const ref = admin.firestore().doc(path);
  const current = (await ref.get()).get(field);
  console.log(
    `${path}.${field}: now ${JSON.stringify(current)}, intended ${JSON.stringify(value)}`,
  );
  if (!apply) {
    console.log('Dry run: nothing written. Re-run with --apply to write it.');
    return;
  }
  if (path === 'config/app' && value !== null) {
    console.log(
      'Check first: this version is downloadable in that store. An older build is blocked until it updates.',
    );
  }
  await ref.set(nestedValue(field, value), { merge: true });
  const after = (await ref.get()).get(field);
  console.log(`${path}.${field} is now ${JSON.stringify(after)}`);
}

if (require.main === module) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
