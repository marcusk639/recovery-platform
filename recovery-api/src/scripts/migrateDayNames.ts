import { initializeApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { migrateDayNames } from '../lib/meetings/dayNameMigration';

/**
 * Rewrites stored directory days from integers to names. Run by hand, once, after
 * both products are deployed with code that reads day names:
 *
 *   npm run migrate:day-names              report what would change
 *   npm run migrate:day-names -- --apply   make the changes
 */

export const DEST_PROJECT = 'recovery-platform-e6cb3';

export function parseMigrateDayNamesArgs(argv: string[]): { apply: boolean } {
  let apply = false;
  for (const arg of argv) {
    if (arg === '--apply') apply = true;
    else throw new Error(`Unknown argument ${arg}. Usage: [--apply]`);
  }
  return { apply };
}

async function main(): Promise<void> {
  const { apply } = parseMigrateDayNamesArgs(process.argv.slice(2));
  const db = getFirestore(initializeApp({ projectId: DEST_PROJECT }));
  console.log(
    `migrateDayNames: ${apply ? 'APPLY' : 'dry run'} on ${DEST_PROJECT}/directoryMeetings`,
  );
  if (apply) {
    console.log(
      'migrateDayNames: both products must already be deployed with day-name support, ' +
        'or their apps show these meetings with no day',
    );
  }
  const result = await migrateDayNames({ db, apply });
  console.log(`migrateDayNames: complete ${JSON.stringify(result)}`);
}

if (require.main === module) {
  main()
    .then(() => process.exit(0))
    .catch((err) => {
      console.error('migrateDayNames: fatal', err);
      process.exit(1);
    });
}
