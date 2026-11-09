import { initializeApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { purgeNaMeetings, runNaSync } from '../lib/meetings/naSync';

/**
 * Updates NA meetings in `directoryMeetings` from BMLT. Run by hand from a terminal;
 * nothing here runs in GCP. Credentials are the runner's application default ones.
 *
 *   npm run sync:na                              report what would change
 *   npm run sync:na -- --apply                   make the changes
 *   npm run sync:na -- --region 105 --apply      one region only
 *   npm run sync:na -- --allow-deletes 105 --apply
 *                                                allow a large removal a run blocked
 *   npm run sync:na -- --purge --apply           remove every row this sync created
 */

export const DEST_PROJECT = 'recovery-platform-e6cb3';

const USAGE =
  'Usage: [--apply] [--region <sourceId>] [--allow-deletes <sourceId,...>] | --purge [--apply]';

export interface SyncNaArgs {
  apply: boolean;
  purge: boolean;
  region?: number;
  allowDeletes: string[];
}

export function parseSyncNaArgs(argv: string[]): SyncNaArgs {
  const args: SyncNaArgs = { apply: false, purge: false, allowDeletes: [] };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--apply') {
      args.apply = true;
    } else if (arg === '--purge') {
      args.purge = true;
    } else if (arg === '--region') {
      const value = argv[++i] ?? '';
      if (!/^\d+$/.test(value)) throw new Error(`--region needs a numeric sourceId. ${USAGE}`);
      args.region = Number(value);
    } else if (arg === '--allow-deletes') {
      const value = argv[++i] ?? '';
      if (!/^\d+(,\d+)*$/.test(value)) {
        throw new Error(`--allow-deletes needs numeric sourceIds. ${USAGE}`);
      }
      args.allowDeletes = value.split(',');
    } else {
      throw new Error(`Unknown argument ${arg}. ${USAGE}`);
    }
  }

  if (args.purge && (args.region !== undefined || args.allowDeletes.length > 0)) {
    throw new Error(`--purge can only be combined with --apply. ${USAGE}`);
  }
  if (args.region !== undefined && args.allowDeletes.some((id) => id !== String(args.region))) {
    throw new Error(`--allow-deletes must name the same region as --region. ${USAGE}`);
  }
  return args;
}

async function main(): Promise<void> {
  const args = parseSyncNaArgs(process.argv.slice(2));
  const db = getFirestore(initializeApp({ projectId: DEST_PROJECT }));
  const now = () => new Date();
  const mode = args.apply ? 'APPLY' : 'dry run';

  if (args.purge) {
    console.log(`syncNa: ${mode} purge of synced NA rows in ${DEST_PROJECT}`);
    const { deleted } = await purgeNaMeetings({ db, apply: args.apply, now });
    console.log(`syncNa: ${args.apply ? 'deleted' : 'would delete'} ${deleted} rows`);
    return;
  }

  console.log(`syncNa: ${mode} from BMLT to ${DEST_PROJECT}/directoryMeetings`);
  const { regions, perRegion, unhealthy, result } = await runNaSync({
    db,
    apply: args.apply,
    now,
    allowDeletes: args.allowDeletes,
    ...(args.region === undefined ? {} : { onlyRegion: args.region }),
  });

  for (const { name, sourceId, rows } of perRegion) {
    console.log(`syncNa: ${name} (sourceId ${sourceId}): ${rows} rows`);
  }
  console.log(`syncNa: ${regions} regions swept. ${JSON.stringify(result)}`);
  for (const { sourceId, problem } of unhealthy) {
    console.warn(`syncNa: region ${sourceId} had ${problem}, so nothing was deleted from it`);
  }
  for (const region of result.blockedRegions) {
    console.warn(
      `syncNa: region ${region} would lose too many rows. If that's real, rerun with ` +
        `--allow-deletes ${region}`,
    );
  }
}

if (require.main === module) {
  main()
    .then(() => process.exit(0))
    .catch((err) => {
      console.error('syncNa: fatal', err);
      process.exit(1);
    });
}
