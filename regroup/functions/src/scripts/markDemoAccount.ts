/**
 * Owner-run, once per project: mark the shared App Review demo account with
 * the `demo: true` claim the guards read, and record it in `config/demoAccount`
 * so the scheduled `restoreDemoAccount` watches it (util/demoAccountState.ts).
 * Dry run is the DEFAULT; writing requires --apply. Ids only in the output.
 *
 *   npm run demo:mark-account                 # dry run, finds the demo email
 *   npm run demo:mark-account -- --apply
 *   npm run demo:mark-account -- --uid U --apply   # if its email was changed
 */
import './scriptBootstrap';
import * as admin from 'firebase-admin';
import { emulatorEnvError } from './findGhostGuests';
import { markDemoAccount } from '../util/demoAccountState';

export function parseArgs(argv: string[]): { uid?: string; apply: boolean } {
  const i = argv.indexOf('--uid');
  const uid = i >= 0 && argv[i + 1] && !argv[i + 1].startsWith('--') ? argv[i + 1] : undefined;
  return { uid, apply: argv.includes('--apply') };
}

if (require.main === module) {
  const envError = emulatorEnvError(process.env);
  if (envError) {
    console.error(envError);
    process.exit(1);
  }
  markDemoAccount(admin.firestore(), admin.auth(), parseArgs(process.argv.slice(2)))
    .then((r) => {
      console.log(JSON.stringify(r));
      if (r.outcome === 'would-mark') console.log('Nothing was written. Re-run with --apply.');
      if (r.outcome === 'refused') process.exit(1);
    })
    .catch((error) => {
      console.error(error);
      process.exit(1);
    });
}
