/**
 * One-off import of a product's existing meetings into recovery-api's shared
 * directory. Not a deployed function: this admin script and migrateNaMeetings are
 * the only places a product's Firestore is read from recovery-api.
 *
 * Dry run by default. Credentials are Application Default Credentials, which must
 * be able to read the source project and write the destination:
 *
 *   npm run import:snapshot -- --provider AA
 *   npm run import:snapshot -- --provider AA --apply
 *
 * The prune guard (lib/meetings/sweepHealth.ts) keeps these rows while their
 * source is down, and NA rows always, so the refresh job does not delete them.
 *
 * Even a dry run reads the whole source collection. It refuses a source project
 * with billing off: a full scan spends that project's free daily read quota, which
 * takes down reads for the live app until the quota resets. That happened to
 * Homegroups on 2026-11-08.
 */
import { applicationDefault, initializeApp } from 'firebase-admin/app';
import { FieldPath, getFirestore } from 'firebase-admin/firestore';
import type { DirectoryMeeting } from '../entities/DirectoryMeeting';
import { runSnapshotImport, type SnapshotDoc } from '../lib/meetings/snapshotImport';
import { mapHomegroupsAaMeeting } from '../lib/meetings/sources/meetingSnapshot';
import { mapNaMeeting } from '../lib/meetings/sources/naDataset';

export const DEST_PROJECT = 'recovery-platform-e6cb3';

type ImportProvider = 'AA' | 'NA';

export const IMPORT_SOURCES: Record<
  ImportProvider,
  {
    project: string;
    collection: string;
    map: (data: Record<string, unknown>) => DirectoryMeeting | null;
  }
> = {
  AA: { project: 'recovery-connect-cad4b', collection: 'meetings', map: mapHomegroupsAaMeeting },
  // Homegroups' own na-meetings is empty; Regroup holds the dataset.
  NA: { project: 'phoenix-cleanhouse', collection: 'na-meetings', map: mapNaMeeting },
};

const PAGE_SIZE = 500;
const USAGE = 'Usage: --provider AA|NA [--apply]';

export function parseImportArgs(argv: string[]): { provider: ImportProvider; apply: boolean } {
  let provider: string | undefined;
  let apply = false;
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--apply') apply = true;
    else if (arg === '--provider') provider = argv[++i];
    else throw new Error(`Unknown argument ${arg}. ${USAGE}`);
  }
  if (provider !== 'AA' && provider !== 'NA') {
    throw new Error(`--provider must be AA or NA. ${USAGE}`);
  }
  return { provider, apply };
}

export async function assertSourceBillingEnabled(
  project: string,
  isBillingEnabled: (project: string) => Promise<boolean>,
): Promise<void> {
  if (!(await isBillingEnabled(project))) {
    throw new Error(
      `Refusing to scan ${project}: billing is off, so a full read would spend its free ` +
        'daily quota and break reads for the live app. Turn billing on first.',
    );
  }
}

async function fetchBillingEnabled(project: string): Promise<boolean> {
  const credential = applicationDefault();
  const { access_token: token } = await credential.getAccessToken();
  const response = await fetch(
    `https://cloudbilling.googleapis.com/v1/projects/${project}/billingInfo`,
    {
      headers: { Authorization: `Bearer ${token}` },
    },
  );
  if (!response.ok) {
    throw new Error(`Could not read billing for ${project}: HTTP ${response.status}`);
  }
  const body = (await response.json()) as { billingEnabled?: boolean };
  return body.billingEnabled === true;
}

type TimestampLike = { toDate: () => Date };

function dataDate(data: Record<string, unknown>, writeTime: TimestampLike): Date {
  const updatedAt = data.updatedAt as Partial<TimestampLike> | undefined;
  return typeof updatedAt?.toDate === 'function' ? updatedAt.toDate() : writeTime.toDate();
}

export async function* readSnapshotPages(
  db: FirebaseFirestore.Firestore,
  collection: string,
  pageSize: number = PAGE_SIZE,
): AsyncGenerator<SnapshotDoc[]> {
  let cursor: FirebaseFirestore.QueryDocumentSnapshot | undefined;
  for (;;) {
    let query = db.collection(collection).orderBy(FieldPath.documentId()).limit(pageSize);
    if (cursor) query = query.startAfter(cursor);
    const { docs } = await query.get();
    if (docs.length > 0) {
      yield docs.map((doc) => {
        const data = doc.data();
        return { data, asOf: dataDate(data, doc.updateTime) };
      });
    }
    if (docs.length < pageSize) return;
    cursor = docs[docs.length - 1];
  }
}

async function* withProgress(pages: AsyncIterable<SnapshotDoc[]>): AsyncGenerator<SnapshotDoc[]> {
  let read = 0;
  let nextLog = 10_000;
  for await (const page of pages) {
    yield page;
    read += page.length;
    if (read >= nextLog) {
      console.log(`importMeetingSnapshot: read ${read}`);
      nextLog += 10_000;
    }
  }
}

async function main(): Promise<void> {
  const { provider, apply } = parseImportArgs(process.argv.slice(2));
  const source = IMPORT_SOURCES[provider];

  await assertSourceBillingEnabled(source.project, fetchBillingEnabled);

  const sourceDb = getFirestore(initializeApp({ projectId: source.project }, 'source'));
  const destDb = getFirestore(initializeApp({ projectId: DEST_PROJECT }, 'dest'));

  console.log(
    `importMeetingSnapshot: ${apply ? 'APPLY' : 'dry run'} ${provider} from ` +
      `${source.project}/${source.collection} to ${DEST_PROJECT}/directoryMeetings`,
  );

  const result = await runSnapshotImport({
    pages: withProgress(readSnapshotPages(sourceDb, source.collection)),
    map: source.map,
    destDb,
    apply,
  });

  console.log(`importMeetingSnapshot: complete ${JSON.stringify(result)}`);
}

if (require.main === module) {
  main()
    .then(() => process.exit(0))
    .catch((err) => {
      console.error('importMeetingSnapshot: fatal', err);
      process.exit(1);
    });
}
