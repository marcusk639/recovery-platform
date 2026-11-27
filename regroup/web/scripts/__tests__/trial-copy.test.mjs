/**
 * Run: node --test scripts/__tests__/trial-copy.test.mjs
 *
 * Launch P5 Task 12 (M12): the trial length is the server's TRIAL_PERIOD_DAYS,
 * which the pages read from the getTierCatalog response (`trialDays`). A
 * template that types its own number of days disagrees with the server the
 * day either changes. Karma can't render the static marketing components
 * (an <img> crashes the karma server), so this reads the templates instead.
 */
import { test } from 'node:test';
import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const APP = path.resolve(HERE, '../../src/app');

const templates = (dir) =>
  fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) return templates(full);
    return entry.name.endsWith('.html') ? [full] : [];
  });

test('work.component.html names no number of days', () => {
  const html = fs.readFileSync(path.join(APP, 'components/work/work.component.html'), 'utf8');
  assert.match(html, /free trial/);
  assert.doesNotMatch(html, /\d\s*-\s*day/i);
  assert.doesNotMatch(html, /\d+\s+days?\b/i);
});

test('no template types a trial length (a digit before "-day")', () => {
  const offenders = templates(APP).filter((file) =>
    /\d\s*-\s*day/i.test(fs.readFileSync(file, 'utf8')),
  );
  assert.deepStrictEqual(
    offenders.map((file) => path.relative(APP, file)),
    [],
  );
});
