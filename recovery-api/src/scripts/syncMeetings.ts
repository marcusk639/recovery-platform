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
 * The key can also come from ~/.config/recovery-platform/meeting-sync.env (syncEnvFile), never
 * from recovery-api/.env. Set it as issued or already URL-encoded: readApiKey accepts either.
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
import dotenv from 'dotenv';
import os from 'os';
import path from 'path';

const DEST_PROJECT = 'recovery-platform-e6cb3';
const PROGRESS_EVERY_CELLS = 500;
/** Separate from the general failure code, so a wrapper can tell a key problem apart. */
export const ACCESS_EXIT_CODE = 2;
/** The run stopped before it finished, so its result is unknown. */
export const UNFINISHED_EXIT_CODE = 3;

/**
 * Where the key lives when the shell doesn't set MEETING_GUIDE_API_KEY. It must stay outside
 * recovery-api/: a deploy sets every entry of an env file there on every function, and
 * uploads the folder with it.
 */
export function syncEnvFile(home: string = os.homedir()): string {
  return path.join(home, '.config', 'recovery-platform', 'meeting-sync.env');
}

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
  // The issued key contains a literal "%3f" and must reach the URL encoded once (%253f).
  // "%25" means it is already URL-ready and must not be encoded again.
  return key.includes('%25') ? key : encodeURIComponent(key);
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

interface ExitHooks {
  once(event: 'beforeExit', listener: () => void): unknown;
  exitCode?: number;
}

/**
 * Node exits with code 0 once nothing is left to wait on, even if the run never finished. A run
 * cut off while a Mac slept ended that way, with no summary. This turns that exit into a loud
 * failure. Call the returned function when the run has finished.
 */
export function failIfUnfinished(
  proc: ExitHooks,
  print: (...args: unknown[]) => void,
  apply: boolean,
): () => void {
  let finished = false;
  proc.once('beforeExit', () => {
    if (finished) return;
    const rule = '='.repeat(72);
    print(
      [
        '',
        rule,
        'MEETING GUIDE SYNC DID NOT FINISH',
        '',
        'The run stopped before it finished, so there is no result. This has happened when the',
        'computer slept during a run.',
        '',
        apply
          ? 'It may have written some of its changes. Run it again: a rerun finishes the job.'
          : 'Nothing was written.',
        rule,
        '',
      ].join('\n'),
    );
    proc.exitCode = UNFINISHED_EXIT_CODE;
  });
  return () => {
    finished = true;
  };
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
  dotenv.config({ path: syncEnvFile(), quiet: true });
  const { apply } = parseSyncArgs(process.argv.slice(2));
  const finished = failIfUnfinished(process, console.error, apply);
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
  finished();
}

if (require.main === module) {
  main()
    .then(() => process.exit(0))
    .catch((err) => process.exit(reportFatal(err, console.error)));
}
