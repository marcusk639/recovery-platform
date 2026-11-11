import { migrateDayNames } from './dayNameMigration';
import { makeNaSyncDb } from './testing/naSyncTestDb';

const key = (id: string) => `directoryMeetings/${id}`;

function seeded() {
  return makeNaSyncDb({
    [key('cr')]: { provider: 'CELEBRATE_RECOVERY', day: 5, name: 'Friday group', updatedAt: 'T0' },
    [key('na')]: { provider: 'NA', day: 0, name: 'Sunday group', updatedAt: 'T0' },
    [key('done')]: { provider: 'NA', day: 'tuesday', name: 'Already named' },
    [key('text')]: { provider: 'AA', day: 'Wed', name: 'Abbreviated' },
    [key('bad')]: { provider: 'AA', day: 9, name: 'Out of range' },
    [key('none')]: { provider: 'AA', name: 'No day' },
    'refreshState/naSync': { day: 3 },
  });
}

test('rewrites a numeric or abbreviated day as its name', async () => {
  const { db, store } = seeded();
  const result = await migrateDayNames({ db, apply: true });

  expect(result).toEqual({ scanned: 6, converted: 3, alreadyNamed: 1, unrecognized: 2 });
  expect(store.get(key('cr'))!.day).toBe('friday');
  expect(store.get(key('na'))!.day).toBe('sunday');
  expect(store.get(key('text'))!.day).toBe('wednesday');
});

test('changes nothing but the day', async () => {
  const { db, store } = seeded();
  await migrateDayNames({ db, apply: true });
  expect(store.get(key('cr'))).toEqual({
    provider: 'CELEBRATE_RECOVERY',
    day: 'friday',
    name: 'Friday group',
    updatedAt: 'T0',
  });
});

test('leaves a row it cannot read alone', async () => {
  const { db, store } = seeded();
  await migrateDayNames({ db, apply: true });
  expect(store.get(key('bad'))!.day).toBe(9);
  expect(store.get(key('none'))).not.toHaveProperty('day');
});

test('touches only the directory', async () => {
  const { db, store } = seeded();
  await migrateDayNames({ db, apply: true });
  expect(store.get('refreshState/naSync')).toEqual({ day: 3 });
});

test('a dry run reports the same counts and writes nothing', async () => {
  const applied = seeded();
  const dry = seeded();
  const appliedResult = await migrateDayNames({ db: applied.db, apply: true });
  const dryResult = await migrateDayNames({ db: dry.db, apply: false });

  expect(dryResult).toEqual(appliedResult);
  expect(dry.commits.count).toBe(0);
  expect(dry.store.get(key('cr'))!.day).toBe(5);
});

test('a second run finds nothing to convert', async () => {
  const { db, commits } = seeded();
  await migrateDayNames({ db, apply: true });
  const before = commits.count;

  const second = await migrateDayNames({ db, apply: true });

  expect(second).toMatchObject({ converted: 0, alreadyNamed: 4 });
  expect(commits.count).toBe(before);
});

test('pages through more rows than one batch holds', async () => {
  const seed = Object.fromEntries(
    Array.from({ length: 1203 }, (_v, i) => [
      key(`m${String(i).padStart(5, '0')}`),
      { day: i % 7 },
    ]),
  );
  const { db, store } = makeNaSyncDb(seed);
  const result = await migrateDayNames({ db, apply: true });

  expect(result.converted).toBe(1203);
  expect([...store.values()].every((doc) => typeof doc.day === 'string')).toBe(true);
});
