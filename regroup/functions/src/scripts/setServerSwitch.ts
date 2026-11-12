/**
 * Reads or flips a server switch, without a deploy:
 *
 *   paywall — paywall/config.enabled. false lets every house in (the paywall's
 *             kill switch, for undoing a paywall mistake); true restores it.
 *   sales   — config/sales.open. Whether new tier subscriptions can start.
 *
 *   npm run switch:set -- --switch=paywall|sales --value=true|false [--apply]
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

const USAGE = 'usage: setServerSwitch --switch=paywall|sales --value=true|false [--apply]';

const arg = (argv: string[], name: string): string | undefined =>
  argv.find((a) => a.startsWith(`--${name}=`))?.slice(name.length + 3);

export function parseSwitchArgs(argv: string[]): {
  path: string;
  field: string;
  value: boolean;
  apply: boolean;
} {
  const target = SWITCHES[arg(argv, 'switch') ?? ''];
  const raw = arg(argv, 'value');
  if (!target || (raw !== 'true' && raw !== 'false')) throw new Error(USAGE);
  return { ...target, value: raw === 'true', apply: argv.includes('--apply') };
}

export async function main(argv: string[] = process.argv.slice(2)): Promise<void> {
  const { path, field, value, apply } = parseSwitchArgs(argv);
  const ref = admin.firestore().doc(path);
  const current = (await ref.get()).data()?.[field];
  console.log(`${path}.${field}: now ${JSON.stringify(current)}, intended ${value}`);
  if (!apply) {
    console.log('Dry run: nothing written. Re-run with --apply to write it.');
    return;
  }
  await ref.set({ [field]: value }, { merge: true });
  const after = (await ref.get()).data()?.[field];
  console.log(`${path}.${field} is now ${JSON.stringify(after)}`);
}

if (require.main === module) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
