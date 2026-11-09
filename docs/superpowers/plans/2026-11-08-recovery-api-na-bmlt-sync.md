# NA Meeting Sync from BMLT Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give the owner a manually run command that updates NA meetings in `directoryMeetings` from the BMLT aggregator.

**Architecture:** `npm run sync:na` fetches every BMLT region, maps the rows, and compares the result with the existing NA rows. It is a dry run unless given `--apply`. Every confirmed row carries the date of its region's latest import in `dataAsOf`, which the apps show as "Listing data from Nov 2026". A row is written only if its content or that date changed. A missing row is deleted only when its region passed its health checks. The sync runs only on the machine of the person who invokes it. Nothing runs on a schedule, and no function is added or deployed to GCP.

**Tech Stack:** Node 22 script, Firestore Admin, TypeScript, Jest 29, global `fetch`.

**Spec:** No separate spec. The requirements are the owner's: a per-region sweep **in a manually invoked script, not a daily job**, health guards, listings that show their age in the apps, private contact fields excluded. The measurements below were taken from the live API on 2026-11-08.

## Prerequisites

- **This branch is separate from PR #199, by owner decision.** It is cut from `origin/main` and imports nothing from #199. See "After #199 lands" below for what the two need from each other.
- **Work in a new worktree off `origin/main`:** `git worktree add ../rp-na-sync -b feat/recovery-api-na-bmlt origin/main`, then `npm ci` in `recovery-api/`. Start the session in that worktree, because Serena indexes the directory the session started in, and it ignores `lib/` either way, so use Grep and Read under `src/lib/meetings/`.
- **Don't touch `/Users/marcusklein/dev/rp-meeting-sync`.** Another session has uncommitted AA work there (`meetingSync.ts`, `meetingSweep.ts`). This plan deliberately imports nothing from it.

## Measured BMLT behaviour

| Fact             | Value                                                                                                                                                                                                                                                               |
| ---------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Region list      | `GET https://aggregator.bmltenabled.org/main_server/api/v1/rootservers` returned 44 regions with `id`, `sourceId`, `name`, `statistics.meetings.numTotal`, `lastSuccessfulImport`                                                                                   |
| Rows             | `GET .../main_server/client_interface/json/?switcher=GetSearchResults&root_server_ids=<id>&data_field_key=<fields>`                                                                                                                                                 |
| No filter        | Returns `{"meetings":[],"formats":[]}` with HTTP 200, so an empty answer is not an error                                                                                                                                                                            |
| Size             | 35,780 rows; every region's row count equalled its `numTotal`; 200 seconds sequentially with 8 fields; largest region with all fields took 32 seconds and 7.6 MB                                                                                                    |
| Weekday          | `weekday_tinyint` is **1=Sunday to 7=Saturday**; the directory uses 0=Sunday                                                                                                                                                                                        |
| Venue            | `venue_type` 1=in-person, 2=virtual, 3=hybrid; about 1% are blank                                                                                                                                                                                                   |
| Service meetings | In four large regions, 179 of 12,218 rows carry format `ASM`. The 13 with no obvious service word in the name were still service work (print shop, merchandise, helpline, admin). 60 of the 179 also carry recovery format codes, so those codes don't clear a row. |

## Global Constraints

- Identity goes through `lib/meetings/identity.ts` only. Do not add a second hash or geohash helper.
- Request only the `BMLT_FIELDS` allowlist. Never request or store `contact_*`, `email_contact`, `comments`, `admin_notes` or `virtual_meeting_additional_info`.
- Never print meeting names, addresses, links or phone numbers. Print region ids, region names and counts only.
- Never write or delete a `source: 'app'` document.
- **The sync is a script run by hand.** No `onSchedule`, no callable or HTTP function, no new export in `src/index.ts`, no deploy. Nothing in this plan runs in GCP. `naSync.ts` must not import `firebase-functions`.
- `npm run sync:na` runs the build, which rewrites the 38 tracked files in `recovery-api/lib/`. Never commit them. Stage files by name.
- New source files stay under 300 lines. Coverage floors in `jest.config.cjs` stay where they are or rise.
- Commit scope is `recovery-api`, for example `feat(recovery-api): ...`.
- Tests use injected `fetchFn` and `db`, with no real network or Firestore.

## Review Focus

- **Weekday off by one:** a BMLT Sunday (`1`) must store as `day: 0`. Passing the raw value to `normalizeDay` would silently make it Monday. Pinned in Task 1.
- **Unsafe links:** `javascript:` and junk like `virtually` must never reach `link`, because apps open it. Pinned in Task 1.
- **A region that answers badly:** an empty or short answer, a failed request or a stale import must delete nothing in that region, even with `--allow-deletes`. Pinned in Tasks 2 and 3.
- **Mass removal upstream or a changed filter:** a large drop must block that region's deletes until a person names the region. Pinned in Task 3.
- **The same meeting listed in two regions:** one document results, and it isn't deleted while either region still lists it. Pinned in Task 3.

## Decisions

- **Manual only, by owner decision.** Data is as current as the last run. `refreshState/naSync` records that run so its age can be checked.
- **All regions are stored, not just the US.** The cost is about 13,000 extra reads per run, and it avoids guessing at `location_nation`, which was blank on 12,823 rows.
- **The aggregator is the source, not the 44 regional servers.** BMLT's guide permits it for cross-region work, and it means one host to depend on.
- **Deletion happens on the next healthy run, with no waiting period.** An accidental removal returns on the next run.
- **Every listing shows its age, by owner decision.** With manual runs, a listing could otherwise be months old and look current. This means a full run usually rewrites all of about 35,000 rows.
- **`dataAsOf` is the region's `lastSuccessfulImport` date in UTC, not the date of the run.** That is when the source was last confirmed. If a regional server stops updating, its listings keep showing the older date, which is the case the label exists for. If the import date can't be parsed, use the run date.
- **A row whose region returned it gets that date, even if the region failed a health check.** A row the region did not return keeps its old date.
- **The dial-in number goes in `onlineNotes`. `virtual_meeting_additional_info` stays out.** It often holds passcodes, and the snapshot mapper already leaves passwords behind. Some Zoom links may not work without a passcode, so the owner may want to revisit this.
- **Non-goals:**
  - Merging case-variant duplicates (about 0.7% in the sample).
  - Filtering past one-off events such as dated conventions.
  - Keeping a stable id when a meeting is edited. That is a property of the frozen identity recipe.
  - Guarding against a hash collision with an AA or Celebrate Recovery row. The id hashes name, day, time, link and address but not provider, so a collision needs all five identical. Accepted as negligible.
  - Showing venue names.
  - Rewording the comments in the two mobile `formatDataAsOf` helpers, which still mention old snapshots. They need a product-scoped commit, and behaviour doesn't change.
  - Sharing code with the AA sync. Consolidate `readAll` and `contentOf` after both land.

## After #199 lands

Neither branch needs the other to build, but these need doing once both are on `main`:

- **The label needs #199.** The apps show "Listing data from Nov 2026" only with its app changes. Until then the date is stored and not shown.
- **Refuse NA in `import:snapshot`.** #199 adds that command, and it overwrites any row with `dataAsOf` set, so an NA import would replace current rows with 2023 data. Add the refusal in whichever PR lands second.
- **Correct two comments:** `SOURCE_PROVIDERS` in `sweepHealth.ts` and the `dataAsOf` wording it adds to `DirectoryMeeting.ts`. Merging will also conflict on that entity's fields, which is trivial to resolve.

---

### Task 1: BMLT row mapper

**Files:**

- Create: `recovery-api/src/lib/meetings/sources/bmlt.ts`
- Test: `recovery-api/src/lib/meetings/sources/bmlt.test.ts`
- Modify: `recovery-api/src/entities/DirectoryMeeting.ts` (add the field below)

**Interfaces:**

- Produces:
  - `DirectoryMeeting.sourceRegion?: string`, documented as "BMLT region `sourceId` that listed this row; decides whether the row may be deleted"
  - `DirectoryMeeting.dataAsOf?: string | null`, documented as "`YYYY-MM-DD` the source last confirmed this row; clients show it so a person can tell how old a listing is"
  - `interface BmltRegion { id: number; sourceId: number; name: string; expectedMeetings: number; lastSuccessfulImport: string | null }`
  - `type BmltRow = Record<string, unknown>`
  - `const BMLT_FIELDS: readonly string[]`, exactly: `source_id, root_server_id, meeting_name, weekday_tinyint, start_time, venue_type, formats, latitude, longitude, virtual_meeting_link, phone_meeting_number, location_street, location_municipality, location_province, location_postal_code_1, time_zone, published`
  - `isServiceMeeting(row: BmltRow): boolean`
  - `mapBmltMeeting(row: BmltRow, region: BmltRegion): DirectoryMeeting | null`

- [ ] **Step 1: Write the failing tests**

```ts
const REGION = {
  id: 1,
  sourceId: 100,
  name: 'Texas',
  expectedMeetings: 1,
  lastSuccessfulImport: null,
};
const row = (over = {}) => ({
  source_id: 12257,
  meeting_name: 'Sunday Solutions',
  weekday_tinyint: '1',
  start_time: '19:30:00',
  venue_type: '1',
  formats: 'O,WC',
  latitude: '33.04',
  longitude: '-96.99',
  virtual_meeting_link: '',
  phone_meeting_number: '',
  location_street: '1 Main St',
  location_municipality: 'Dallas',
  location_province: 'TX',
  location_postal_code_1: '75001',
  time_zone: 'America/Chicago',
  published: '1',
  ...over,
});

test('maps BMLT weekday 1-7 to directory day 0-6', () => {
  expect(mapBmltMeeting(row({ weekday_tinyint: '1' }), REGION)!.day).toBe(0);
  expect(mapBmltMeeting(row({ weekday_tinyint: '2' }), REGION)!.day).toBe(1);
  expect(mapBmltMeeting(row({ weekday_tinyint: '7' }), REGION)!.day).toBe(6);
  expect(mapBmltMeeting(row({ weekday_tinyint: '0' }), REGION)).toBeNull();
  expect(mapBmltMeeting(row({ weekday_tinyint: '8' }), REGION)).toBeNull();
});

test('maps a full in-person row', () => {
  expect(mapBmltMeeting(row(), REGION)).toMatchObject({
    source: 'external',
    provider: 'NA',
    type: 'NA',
    name: 'Sunday Solutions',
    time: '19:30',
    format: 'O,WC',
    timezone: 'America/Chicago',
    online: false,
    externalId: '100:12257',
    sourceRegion: '100',
    location: {
      address: '1 Main St',
      city: 'Dallas',
      state: 'TX',
      zip: '75001',
      lat: 33.04,
      lng: -96.99,
    },
  });
});

test('id matches the frozen recipe', () => {
  expect(mapBmltMeeting(row(), REGION)!.id).toBe(
    directoryMeetingId({
      name: 'Sunday Solutions',
      day: 0,
      time: '19:30',
      link: '',
      formattedAddress: '1 Main St, Dallas, TX, 75001',
    }),
  );
});

test.each([
  ['blank name', { meeting_name: '  ' }],
  ['bad time', { start_time: 'noon' }],
  ['missing coords', { latitude: '' }],
  ['0,0 coords', { latitude: '0', longitude: '0' }],
  ['out-of-range coords', { latitude: '999' }],
  ['unpublished', { published: '0' }],
  ['virtual with no way to join', { venue_type: '2' }],
  ['closed facility with no way to join', { venue_type: '', formats: 'W,TC' }],
])('skips %s', (_label, over) => {
  expect(mapBmltMeeting(row(over), REGION)).toBeNull();
});

test('excludes service meetings but keeps recovery meetings', () => {
  expect(mapBmltMeeting(row({ formats: 'HY,ASM' }), REGION)).toBeNull();
  expect(mapBmltMeeting(row({ formats: 'O,D,ASM' }), REGION)).toBeNull();
  expect(
    mapBmltMeeting(row({ meeting_name: 'Public Relations Subcommittee Meeting' }), REGION),
  ).toBeNull();
  expect(
    mapBmltMeeting(row({ meeting_name: 'Activities Sub Committee Meeting' }), REGION),
  ).toBeNull();
  expect(
    mapBmltMeeting(row({ meeting_name: 'LDA Public Information Committee Monthly' }), REGION),
  ).toBeNull();
  expect(mapBmltMeeting(row({ meeting_name: 'Area Service Meeting' }), REGION)).toBeNull();
  expect(mapBmltMeeting(row({ meeting_name: 'Newcomers Workshop' }), REGION)).not.toBeNull();
  expect(mapBmltMeeting(row({ meeting_name: 'Spirit & Service' }), REGION)).not.toBeNull();
});

test('online reflects venue type', () => {
  const link = 'https://zoom.us/j/1';
  expect(mapBmltMeeting(row({ venue_type: '2', virtual_meeting_link: link }), REGION)!.online).toBe(
    true,
  );
  expect(mapBmltMeeting(row({ venue_type: '3', virtual_meeting_link: link }), REGION)!.online).toBe(
    true,
  );
  expect(mapBmltMeeting(row({ venue_type: '' }), REGION)!.online).toBe(false);
  expect(mapBmltMeeting(row({ venue_type: '', virtual_meeting_link: link }), REGION)!.online).toBe(
    true,
  );
});

test('keeps only http(s) links and turns a phone number into notes', () => {
  expect(
    mapBmltMeeting(row({ virtual_meeting_link: 'javascript:alert(1)' }), REGION)!.link,
  ).toBeUndefined();
  expect(mapBmltMeeting(row({ virtual_meeting_link: 'virtually' }), REGION)!.link).toBeUndefined();
  expect(mapBmltMeeting(row({ virtual_meeting_link: 'http://x.org/m' }), REGION)!.link).toBe(
    'http://x.org/m',
  );
  const dial = mapBmltMeeting(
    row({ venue_type: '2', phone_meeting_number: '+15551230000' }),
    REGION,
  )!;
  expect(dial.onlineNotes).toBe('Dial-in: +15551230000');
});

test('private fields never appear in the output', () => {
  const m = mapBmltMeeting(
    row({ contact_name_1: 'A', contact_email_1: 'a@b.c', comments: 'x', admin_notes: 'y' }),
    REGION,
  );
  const json = JSON.stringify(m);
  ['a@b.c', 'contact', 'comments', 'admin_notes'].forEach((s) => expect(json).not.toContain(s));
  ['contact', 'comments', 'admin_notes', 'email', 'additional_info'].forEach((s) =>
    expect(BMLT_FIELDS.join()).not.toContain(s),
  );
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx jest src/lib/meetings/sources/bmlt.test.ts`
Expected: FAIL with "Cannot find module './bmlt'"

- [ ] **Step 3: Implement `sources/bmlt.ts` and add both entity fields**

Rules the tests don't fully determine:

- Convert the weekday to an integer and subtract 1 before calling `directoryMeetingId`.
- `formattedAddress` is the non-empty parts of street, city, state and zip, joined with `', '`.
- `isServiceMeeting` is true when the trimmed `formats` list includes `ASM`, or the name matches `/\b(sub-?committee|committee|area service)\b/i`.
- Validate links with `new URL()` and a protocol check.
- "Can join" means a kept link or a phone number. Return null if the venue is `2` and the row can't be joined, or if formats include `TC` and it can't be joined.
- Omit empty optional fields, because Firestore rejects `undefined`.
- Wrap the mapping in `try/catch` and return null, as the other sources do. `directoryGeohash` throws on out-of-range coordinates.

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx jest src/lib/meetings/sources/bmlt.test.ts && npm run typecheck`
Expected: PASS, no type errors

- [ ] **Step 5: Commit**

```bash
git add recovery-api/src/lib/meetings/sources/bmlt.ts recovery-api/src/lib/meetings/sources/bmlt.test.ts recovery-api/src/entities/DirectoryMeeting.ts
git commit -m "feat(recovery-api): map BMLT rows to directory meetings"
```

---

### Task 2: Region sweep and health checks

**Files:**

- Create: `recovery-api/src/lib/meetings/naSweep.ts`
- Test: `recovery-api/src/lib/meetings/naSweep.test.ts`

**Interfaces:**

- Consumes: `BmltRegion`, `BmltRow`, `BMLT_FIELDS` from Task 1
- Produces:
  - `type RegionProblem = 'fetch_failed' | 'count_mismatch' | 'stale_import'`
  - `interface RegionSweep { region: BmltRegion; rows: BmltRow[]; problem?: RegionProblem }`
  - `interface NaSweepDeps { fetchFn?: typeof fetch; now?: () => Date; sleep?: (ms: number) => Promise<void>; onlyRegion?: number }`, where `onlyRegion` is a region `sourceId`
  - `fetchBmltRegions(deps: NaSweepDeps): Promise<BmltRegion[]>`
  - `sweepBmlt(deps: NaSweepDeps): Promise<RegionSweep[]>`
  - Constants: `AGGREGATOR_BASE = 'https://aggregator.bmltenabled.org/main_server'`, `MIN_EXPECTED_REGIONS = 30`, `STALE_IMPORT_HOURS = 48`, `SWEEP_CONCURRENCY = 3`, `REQUEST_TIMEOUT_MS = 120_000`, `MAX_ATTEMPTS = 2`

- [ ] **Step 1: Write the failing tests**

Build `fetchFn` from a map of URL matcher to response, with `now` fixed at `2026-11-09T02:00:00Z`.

```ts
test('every row request is filtered by region and asks only for allowlisted fields', async () => {
  // Assert the rows URL contains root_server_ids=1 and data_field_key=<BMLT_FIELDS joined by ,>
  // and does not contain "contact" or "comments".
});
test('a region whose count matches and whose import is recent has no problem', async () => {
  // expectedMeetings 2, two rows, lastSuccessfulImport '2026-11-08 23:44:02'
  // expect(result[0].problem).toBeUndefined(); expect(result[0].rows).toHaveLength(2);
});
test('accepts both response shapes', async () => {
  // { meetings: [...] } and a bare array both give the same rows
});
test('an empty 200 is a count mismatch, not an empty region', async () => {
  // { meetings: [], formats: [] } with expectedMeetings 2 → problem 'count_mismatch', rows []
});
test('a short answer keeps its rows but is flagged', async () => {
  // one row with expectedMeetings 2 → problem 'count_mismatch', rows length 1
});
test('an import older than 48 hours is stale', async () => {
  // '2026-11-06 01:00:00' → problem 'stale_import'; null → 'stale_import'; 'not a date' → 'stale_import'
});
test('a request that fails twice is flagged without failing the other regions', async () => {
  // region 1 returns 500 twice, region 2 is fine:
  // region 1 problem 'fetch_failed' and rows []; region 2 no problem; fetchFn called twice for region 1
});
test('a non-JSON 200 counts as a failed request', async () => {
  // HTML body → problem 'fetch_failed'
});
test('a bad region list throws so nothing changes', async () => {
  // HTTP 500, a non-array, and fewer than 30 regions each reject with /region list/
});
test('onlyRegion sweeps just that region', async () => {
  // onlyRegion 101 → one RegionSweep with sourceId 101, and no rows request for other regions
});
test('onlyRegion rejects an unknown region', async () => {
  // onlyRegion 999 → rejects with /999/
});
```

Replace each comment with the arrange and assert it describes.

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx jest src/lib/meetings/naSweep.test.ts`
Expected: FAIL with "Cannot find module './naSweep'"

- [ ] **Step 3: Implement `naSweep.ts`**

- Parse `lastSuccessfulImport` as UTC: `new Date(value.replace(' ', 'T') + 'Z')`.
- Set a descriptive `User-Agent` of `RecoveryPlatformDirectorySync/1.0`.
- Use `AbortSignal.timeout(REQUEST_TIMEOUT_MS)` on each request.
- Run regions through `SWEEP_CONCURRENCY` workers, and wait 400 ms between a worker's requests through the injected `sleep`.
- Check problems in the order fetch, count, import.

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx jest src/lib/meetings/naSweep.test.ts && npm run typecheck`
Expected: PASS, no type errors

- [ ] **Step 5: Commit**

```bash
git add recovery-api/src/lib/meetings/naSweep.ts recovery-api/src/lib/meetings/naSweep.test.ts
git commit -m "feat(recovery-api): sweep BMLT regions with per-region health checks"
```

---

### Task 3: Compare, write, undo

**Files:**

- Create: `recovery-api/src/lib/meetings/naSync.ts`
- Test: `recovery-api/src/lib/meetings/naSync.test.ts`, `recovery-api/src/lib/meetings/naSync.deletes.test.ts`
- Create: `recovery-api/src/lib/meetings/testing/naSyncTestDb.ts` (in-memory Firestore for these tests)

**Interfaces:**

- Consumes: `RegionSweep`, `RegionProblem`, `sweepBmlt`, `NaSweepDeps` from Task 2; `mapBmltMeeting`, `isServiceMeeting` from Task 1; `BATCH_SIZE` from `./ingest`
- Produces:
  - `interface NaReconcileDeps { db: FirebaseFirestore.Firestore; apply: boolean; now: () => Date; allowDeletes?: readonly string[] }`, where `allowDeletes` holds region `sourceId`s
  - `interface NaReconcileResult { created: number; updated: number; redated: number; deleted: number; unchanged: number; unmappable: number; excludedService: number; collapsedDuplicates: number; skippedAppOwned: number; keptUnhealthy: number; legacyRows: number; blockedRegions: string[] }`
  - `reconcileNaMeetings(sweeps: RegionSweep[], deps: NaReconcileDeps): Promise<NaReconcileResult>`
  - `runNaSync(deps: NaReconcileDeps & NaSweepDeps): Promise<{ regions: number; unhealthy: Array<{ sourceId: number; problem: RegionProblem }>; result: NaReconcileResult }>`
  - `purgeNaMeetings(deps: NaReconcileDeps): Promise<{ deleted: number }>`
  - Constants: `MAX_REGION_DELETE_FRACTION = 0.1`, `MIN_REGION_DELETE_ALLOWANCE = 5`, `NA_SYNC_STATE_DOC_ID = 'naSync'`

- [ ] **Step 1: Write the failing tests**

Seed `makeNaSyncDb` with NA rows that have `source: 'external'`, `provider: 'NA'` and `sourceRegion`. It supports `where`, `limit`, `startAfter`, `get`, `doc().set` and batches, and records batch operations and commits for the write and order tests. Split the tests across the two files to stay under the 300-line limit, with the delete rules in `naSync.deletes.test.ts`.

```ts
test('creates new rows with all timestamps and the import date', async () => {
  // lastSuccessfulImport '2026-11-08 23:44:02', now 2026-11-09 → created 1;
  // stored doc has createdAt, updatedAt, lastSeenAt, lastRefreshedAt and dataAsOf '2026-11-08'
});
test('falls back to the run date when the import date cannot be parsed', async () => {
  // lastSuccessfulImport null, now 2026-11-09 → dataAsOf '2026-11-09'
});
test('a second run with the same data and import date writes nothing', async () => {
  // run twice; second run: unchanged 1, created 0, updated 0, redated 0, deleted 0, and no batch commit
});
test('a newer import redates an unchanged row without touching updatedAt', async () => {
  // same content, import date moves to '2026-12-01' → redated 1, updated 0;
  // dataAsOf, lastSeenAt and lastRefreshedAt change; updatedAt and createdAt do not
});
test('a row the region did not return keeps its old date', async () => {
  // region has problem 'count_mismatch' and omits the row → keptUnhealthy 1, dataAsOf unchanged
});
test('a row an unhealthy region did return gets the new date', async () => {
  // region has problem 'count_mismatch' but returns the row → redated 1
});
test('a changed field updates the row, keeps createdAt and drops a removed field', async () => {
  // existing doc has format 'O' and onlineNotes; source now has format 'C' and no phone
  // → updated 1, createdAt preserved, onlineNotes absent
});
test('deletes a row missing from a healthy region', async () => {
  // 20 rows in region 100, source lists 19 → deleted 1
});
test.each(['fetch_failed', 'count_mismatch', 'stale_import'])(
  'keeps missing rows when the region has %s',
  async (problem) => {
    // → deleted 0, keptUnhealthy 1
  },
);
test('keeps rows whose region was not swept', async () => {
  // existing sourceRegion '999' → deleted 0, keptUnhealthy 1
});
test('blocks a region that would lose more than the allowance', async () => {
  // 100 rows, source lists 89 → 11 > max(5, 10) → deleted 0, blockedRegions ['100'];
  // console.error called with 'syncNa: region delete blocked' and no meeting names
});
test('a small region may lose up to five rows', async () => {
  // 10 rows, source lists 5 → deleted 5; 10 rows, source lists 4 → blocked
});
test('allowDeletes lifts the cap for a named healthy region only', async () => {
  // 100 rows, source lists 50, allowDeletes ['100'] → deleted 50
  // same with allowDeletes ['101'] → deleted 0, blockedRegions ['100']
});
test('allowDeletes removes rows of a named region no longer in the list', async () => {
  // existing sourceRegion '999', allowDeletes ['999'] → deleted 1
});
test('allowDeletes never overrides an unhealthy region', async () => {
  // region 100 has problem 'fetch_failed', allowDeletes ['100'] → deleted 0, keptUnhealthy > 0
});
test('never touches an app-owned document with the same id', async () => {
  // → skippedAppOwned 1 and the doc is unchanged
});
test('leaves legacy NA rows without sourceRegion and counts them', async () => {
  // → deleted 0, legacyRows 1
});
test('the same meeting in two regions becomes one document and survives losing one listing', async () => {
  // both regions list it → created 1, collapsedDuplicates 1
  // next run: region 100 no longer lists it, region 101 does → deleted 0
});
test('counts service and unmappable rows separately', async () => {
  // → excludedService 1, unmappable 1
});
test('a dry run reports the same counts and writes nothing', async () => {
  // apply false → counts match the apply run; store unchanged, including refreshState
});
test('deletes run after writes', async () => {
  // no delete operation precedes a set
});
test('runNaSync records the run when applying', async () => {
  // refreshState/naSync has lastRunAt (ISO string from now), scope 'all' or the onlyRegion id,
  // regions, unhealthy and the result counts
});
test('runNaSync throws when every region returned no rows', async () => {
  // rejects with /not changed/ and writes nothing
});
test('purge removes only rows this sync created', async () => {
  // seed: NA with sourceRegion, NA legacy without it, AA external, NA app-owned
  // apply true → only the first is gone, deleted 1
  // apply false → deleted 1 reported, store unchanged
});
```

Replace each comment with the arrange and assert it describes.

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx jest src/lib/meetings/naSync.test.ts`
Expected: FAIL with "Cannot find module './naSync'"

- [ ] **Step 3: Implement `naSync.ts`**

The delete decision is the part the tests alone leave open. For each region with missing rows:

```ts
const named = allowDeletes.includes(regionId);
if (sweep?.problem)
  keep(); // unhealthy: never overridden
else if (!sweep && !named)
  keep(); // not swept and not named
else if (named)
  remove(); // a person named this region
else if (
  missing > Math.max(MIN_REGION_DELETE_ALLOWANCE, Math.floor(existing * MAX_REGION_DELETE_FRACTION))
)
  block();
else remove();
```

- Process regions by ascending `sourceId` and rows by ascending `source_id`, so the row that wins a duplicate doesn't change with response order.
- Read existing rows in `BATCH_SIZE` pages with `source == 'external'` and `provider == 'NA'`, and app-owned ids with `source == 'app'`.
- Compare content with timestamp fields and `dataAsOf` removed and keys sorted.
- Write a changed row with a full `set`, not a merge, so a field the source dropped doesn't linger.
- Update a row with the same content but a different date with a merge of `dataAsOf`, `lastSeenAt` and `lastRefreshedAt` only, so `updatedAt` still means the listing itself changed.
- When a meeting is in two regions, the date comes from the region that wins the duplicate.
- A run killed partway is safe to repeat, because the comparison skips what was already written and deletes come last.

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx jest src/lib/meetings/naSync.test.ts && npm run typecheck`
Expected: PASS, no type errors

- [ ] **Step 5: Commit**

```bash
git add recovery-api/src/lib/meetings/naSync.ts recovery-api/src/lib/meetings/naSync.test.ts recovery-api/src/lib/meetings/naSync.deletes.test.ts recovery-api/src/lib/meetings/testing/naSyncTestDb.ts
git commit -m "feat(recovery-api): reconcile NA meetings by region with guarded deletes"
```

---

### Task 4: The command

**Files:**
- Create: `recovery-api/src/scripts/syncNa.ts`
- Test: `recovery-api/src/scripts/syncNa.test.ts`
- Modify:
  - `recovery-api/package.json` (add the script)
  - `recovery-api/CLAUDE.md`
  - `docs/launch-readiness/directory-seed-runbook.md`

**Interfaces:**
- Consumes: `runNaSync`, `purgeNaMeetings` from Task 3
- Produces:
  - `parseSyncNaArgs(argv: string[]): { apply: boolean; purge: boolean; region?: number; allowDeletes: string[] }`
  - npm script `"sync:na": "npm run build && node lib/scripts/syncNa.js"`

- [ ] **Step 1: Write the failing tests**

```ts
test('defaults to a dry run', () =>
  expect(parseSyncNaArgs([])).toEqual({ apply: false, purge: false, allowDeletes: [] }));
test('--apply turns writes on', () => expect(parseSyncNaArgs(['--apply']).apply).toBe(true));
test('--region takes a numeric region', () => {
  expect(parseSyncNaArgs(['--region', '105']).region).toBe(105);
  expect(() => parseSyncNaArgs(['--region', 'utah'])).toThrow(/--region/);
  expect(() => parseSyncNaArgs(['--region'])).toThrow(/--region/);
});
test('--allow-deletes takes a comma-separated list', () =>
  expect(parseSyncNaArgs(['--allow-deletes', '100,101']).allowDeletes).toEqual(['100', '101']));
test('--allow-deletes must match --region when both are given', () => {
  expect(() => parseSyncNaArgs(['--region', '100', '--allow-deletes', '101'])).toThrow(/--allow-deletes/);
  expect(parseSyncNaArgs(['--region', '100', '--allow-deletes', '100']).region).toBe(100);
});
test('--purge cannot be combined with sync options', () => {
  expect(parseSyncNaArgs(['--purge']).purge).toBe(true);
  expect(() => parseSyncNaArgs(['--purge', '--region', '100'])).toThrow(/--purge/);
  expect(() => parseSyncNaArgs(['--purge', '--allow-deletes', '100'])).toThrow(/--purge/);
});
test('rejects unknown arguments', () => expect(() => parseSyncNaArgs(['--aply'])).toThrow(/--aply/));
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx jest src/scripts/syncNa.test.ts`
Expected: FAIL with "Cannot find module './syncNa'"

- [ ] **Step 3: Implement**

- `syncNa.ts` follows `seedDirectory.ts`: a `require.main` guard, `getFirestore(initializeApp({ projectId: 'recovery-platform-e6cb3' }))`, and application default credentials from the person running it. It must not import `lib/firebase`.
- It prints the mode (`dry run` or `APPLY`), each region's name, `sourceId` and row count, the JSON result, each unhealthy region, and each blocked region with a reminder of `--allow-deletes`.
- It exits non-zero on a thrown error.
- In `CLAUDE.md`, add the `sync:na` command and its flags, and say it runs by hand and not in GCP.
- In the runbook, add a section saying NA now comes from `npm run sync:na`, that `migrate:na` must not be run because its rows would sit beside the synced ones, how to read `refreshState/naSync`, when to use `--allow-deletes`, and how to roll back with `--purge`.

- [ ] **Step 4: Run the full package checks**

Run: `npm run typecheck && npm run lint && npm test -- --coverage`
Expected: all pass, coverage at or above 80/75/78/80

- [ ] **Step 5: Commit**

```bash
git add recovery-api/src/scripts/syncNa.ts recovery-api/src/scripts/syncNa.test.ts recovery-api/package.json recovery-api/CLAUDE.md docs/launch-readiness/directory-seed-runbook.md
git commit -m "feat(recovery-api): add a manual command to sync NA meetings from BMLT"
```

---

### Task 5: First run (owner approval needed at each marked step)

No code. Each marked step changes production or contacts someone, so get the owner's explicit approval first. Run from `recovery-api/`, signed in with `gcloud auth application-default login`.

- [ ] **Step 1: Confirm the existing prune can't reach NA rows. Stop if it can.**

This is about your existing `refreshDirectory`, not this sync. Its `pruneStale` on `main` deletes every external row with `lastSeenAt` over 30 days old, whatever its provider, when a sweep cycle closes. NA rows are stamped only when someone runs this command, so 30 days without a run could delete them all, with no error. This branch doesn't change that function.

Check the latest `directory refresh slice complete` log line and `refreshState/directory`.
Expected, either of:
- The cursor is still stuck near 853, because the deployed version times out before a cycle can close. That is safe only while nobody deploys a version that finishes without the guard.
- The log line has a `sweep` field, meaning #199's guard is live and NA is never pruned.

Stop and ask the owner if neither is true. Until #199 is deployed, also tell the owner that deploying any other fix to `refreshDirectory`'s timeout puts these rows at risk.

- [ ] **Step 2 (optional, owner): Email the BMLT project** about occasional full reads of all regions, and ask about usage terms. None were found in their docs. Manual runs add little load, so this doesn't block the rest.

- [ ] **Step 3: Dry run everything**

Run: `npm run sync:na`
Expected: about 35,000 `created`, 0 `deleted`, `excludedService` under about 2% of rows, few or no unhealthy regions. Stop and report if `legacyRows` is above 0, because that means an NA snapshot was imported and its rows will sit beside the new ones.

- [ ] **Step 4 (owner approves): Pilot one small US region**

Run: `npm run sync:na -- --region <sourceId> --apply`, using NA Utah's `sourceId` from the Step 3 output (about 107 rows).
Expected: only `created`, nothing else changes. Then call `findMeetings` near Salt Lake City with `type: 'NA'`, and check that results appear, that a meeting named for Sunday has `day: 0`, and that the Homegroups or Regroup app shows it correctly, including "Listing data from <month year>". The label needs an app build that includes #199, and older builds simply don't show it. Roll back with `--purge --apply` if anything is wrong.

- [ ] **Step 5 (owner approves): Seed everything**

Run: `npm run sync:na -- --apply`
Expected: about 35,000 writes. If it stops partway, run it again and it continues.

- [ ] **Step 6: Verify a repeat run changes nothing**

Run: `npm run sync:na`
Expected: `created` and `updated` near 0. `unchanged` should be near 35,000, or `redated` for any region the aggregator re-imported in between, which is normal and may be most of them. A large `updated` means the comparison is unstable, so fix that before relying on the command.

- [ ] **Step 7: Check dense areas**

Call `findMeetings` for central Los Angeles and New York at maximum radius with `type: 'NA'`, then look at `truncated` in the response and search the logs for `findMeetings: a geohash bound hit the read limit`. `PER_BOUND_READ_LIMIT` is 500 and filtering happens after the read, so more NA rows, and the AA sync, could hide results. If it trips, report it as a follow-up. Don't raise the limit here.
