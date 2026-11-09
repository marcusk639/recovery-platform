import { readdirSync, readFileSync, statSync } from 'fs';
import { join, relative } from 'path';

/**
 * Owner decision, 2026-11-08: meeting sync runs manually through scripts, and no
 * scheduled job updates meeting data, until further notice. This keeps a scheduled
 * meeting refresh from coming back unnoticed. Lift it deliberately if that changes.
 *
 * Scheduled jobs in general are allowed. Only one that touches meeting data fails.
 */

const SCHEDULER_IMPORT = /firebase-functions\/(v2\/)?scheduler|pubsub\s*\.\s*schedule/;

/** Anything that reads, refreshes or prunes the meeting directory. */
const MEETING_DATA =
  /refreshDirectory|refreshSlice|pruneStale|snapshotImport|directoryMeetings|lib\/meetings|\/sources\//;

export function isScheduledMeetingRefresh(source: string): boolean {
  return SCHEDULER_IMPORT.test(source) && MEETING_DATA.test(source);
}

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return sourceFiles(path);
    return path.endsWith('.ts') && !path.endsWith('.test.ts') ? [path] : [];
  });
}

describe('recovery-api scheduled meeting refresh', () => {
  it('declares no scheduled function that refreshes meeting data', () => {
    const offenders = sourceFiles(__dirname)
      .filter((path) => isScheduledMeetingRefresh(readFileSync(path, 'utf8')))
      .map((path) => relative(__dirname, path));

    expect(offenders).toEqual([]);
  });

  it('does not deploy the old refreshDirectory trigger', () => {
    const index = readFileSync(join(__dirname, 'index.ts'), 'utf8');

    expect(index).not.toMatch(/triggers\/refreshDirectory/);
  });

  it('flags a scheduled meeting refresh but allows other scheduled jobs', () => {
    const scheduler = `import { onSchedule } from 'firebase-functions/v2/scheduler';\n`;

    expect(
      isScheduledMeetingRefresh(`${scheduler}import { refreshSlice } from './refreshDirectory';`),
    ).toBe(true);
    expect(
      isScheduledMeetingRefresh(`${scheduler}await db.collection('directoryMeetings').get();`),
    ).toBe(true);
    expect(
      isScheduledMeetingRefresh(
        `${scheduler}export const expireInvites = onSchedule('every day', async () => {});`,
      ),
    ).toBe(false);
    expect(isScheduledMeetingRefresh(`import { refreshSlice } from './refreshDirectory';`)).toBe(
      false,
    );
  });

  it('builds before every functions deploy, so the stale tracked lib/ cannot ship', () => {
    const config = JSON.parse(readFileSync(join(__dirname, '..', 'firebase.json'), 'utf8'));
    const predeploy: string[] = config.functions[0].predeploy ?? [];
    expect(predeploy.join(' ')).toMatch(/run build/);
  });
});
