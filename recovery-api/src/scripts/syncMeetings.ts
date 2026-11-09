/**
 * Syncs AA meetings from Meeting Guide into `directoryMeetings`. Run it by hand: nothing
 * schedules it. Each run is a complete, self-contained sweep.
 *
 * Dry run by default: it still calls the API and reads the AA directory rows, but
 * writes nothing. Credentials are Application Default Credentials.
 *
 *   MEETING_GUIDE_API_KEY=... npm run sync:meetings
 *   MEETING_GUIDE_API_KEY=... npm run sync:meetings -- --apply
 *
 * The key goes in exactly as the API expects it in a URL. Don't decode or re-encode it.
 * See lib/meetings/meetingSweep.ts for the API limits this is built around.
 */
import { applicationDefault, initializeApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { sweepMeetingGuide, type SweepProgress } from '../lib/meetings/meetingSweep';
import {
  MeetingGuideAccessError,
  runMeetingSync,
  type MeetingSyncResult,
} from '../lib/meetings/meetingSync';
import { usBaseCells } from '../lib/meetings/usLandCells';

const DEST_PROJECT = 'recovery-platform-e6cb3';
const PROGRESS_EVERY_CELLS = 500;
/** Separate from the general failure code, so a wrapper can tell a key problem apart. */
export const ACCESS_EXIT_CODE = 2;

export function parseSyncArgs(argv: readonly string[]): { apply: boolean } {
  const unknown = argv.filter((arg) => arg !== '--apply');
  if (unknown.length > 0) throw new Error(`Unknown argument: ${unknown.join(' ')}`);
  return { apply: argv.includes('--apply') };
}

export function readApiKey(env: Record<string, string | undefined>): string {
  const key = env.MEETING_GUIDE_API_KEY;
  if (!key) {
    throw new MeetingGuideAccessError('MEETING_GUIDE_API_KEY is not set. Set it and run again.');
  }
  return key;
}

/** Prints the failure and returns the exit code. The key itself is never printed. */
export function reportFatal(err: unknown, print: (...args: unknown[]) => void): number {
  if (!(err instanceof MeetingGuideAccessError)) {
    print('syncMeetings: fatal', err);
    return 1;
  }
  const rule = '='.repeat(72);
  print(
    [
      '',
      rule,
      'MEETING GUIDE SYNC FAILED: ACTION NEEDED',
      '',
      err.message,
      '',
      'Nothing was written.',
      rule,
      '',
    ].join('\n'),
  );
  return ACCESS_EXIT_CODE;
}

export function progressLine(p: SweepProgress): string {
  const percent = Math.round((p.baseCellsDone / p.baseCells) * 100);
  return (
    `syncMeetings: ${percent}% (${p.baseCellsDone}/${p.baseCells} cells), ` +
    `${p.requests} requests, ${p.meetings} meetings`
  );
}

export function describeResult(result: MeetingSyncResult): string[] {
  const { sweep, reconcile, prune, coverage } = result;
  const lines = [
    `syncMeetings: complete ${JSON.stringify({ sweep, reconcile, prune })}`,
    `syncMeetings: meetings by state ${JSON.stringify(coverage.byState)}`,
  ];
  for (const { name, count } of coverage.places) {
    lines.push(
      count > 0
        ? `syncMeetings: near ${name}: ${count}`
        : `syncMeetings: WARNING no meetings found near ${name}; check whether that is right`,
    );
  }
  if (sweep.unresolvedSpots.length > 0) {
    lines.push(
      `syncMeetings: WARNING ${sweep.unresolvedSpots.length} spots hold more meetings than one response ` +
        'returns, so some meetings there may be missing',
    );
  }
  if (sweep.failedBaseCells > 0) {
    lines.push(
      `syncMeetings: WARNING ${sweep.failedBaseCells} of ${sweep.baseCells} base cells failed; ` +
        'meetings there were not refreshed',
    );
  }
  if (sweep.rateLimited > 0) {
    lines.push(`syncMeetings: WARNING rate limited ${sweep.rateLimited} times; lower concurrency`);
  }
  if (prune && prune.blocked.length > 0) {
    lines.push(
      `syncMeetings: WARNING the prune was blocked for ${prune.blocked.join(', ')}: more than 10% ` +
        'of its rows look stale. Nothing was deleted. Find out why before the next run',
    );
  }
  if (!prune) {
    lines.push(
      'syncMeetings: no prune this run. It needs --apply and a healthy sweep that follows ' +
        'an earlier healthy --apply run',
    );
  }
  return lines;
}

async function main(): Promise<void> {
  const { apply } = parseSyncArgs(process.argv.slice(2));
  const key = readApiKey(process.env);
  const db = getFirestore(
    initializeApp({ credential: applicationDefault(), projectId: DEST_PROJECT }),
  );
  console.log(`syncMeetings: ${apply ? 'APPLY' : 'dry run'} to ${DEST_PROJECT}/directoryMeetings`);

  const result = await runMeetingSync({
    db,
    now: () => new Date(),
    apply,
    sweep: () =>
      sweepMeetingGuide({
        key,
        baseCells: usBaseCells(),
        onProgress: (p) => {
          if (p.baseCellsDone % PROGRESS_EVERY_CELLS === 0) console.log(progressLine(p));
        },
      }),
  });
  for (const line of describeResult(result)) console.log(line);
}

if (require.main === module) {
  main()
    .then(() => process.exit(0))
    .catch((err) => process.exit(reportFatal(err, console.error)));
}
