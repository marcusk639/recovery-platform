import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const reviewDir = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const repoRoot = join(reviewDir, '..', '..');

const MAPS = ['contract-map-homegroups.md', 'contract-map-regroup.md', 'contract-map-cross-product.md'];
const FILES = [...MAPS, 'checklist.md', 'conventions.md', 'false-positives.md'];
const PATH_RE = /^[\w.-]+\/[\w./ -]+\.\w+(:\d+(-\d+)?)?$/;

const read = (name) => {
  const p = join(reviewDir, name);
  assert.ok(existsSync(p), `missing knowledge file ${name}`);
  return readFileSync(p, 'utf8');
};

test('knowledge paths exist', () => {
  const missing = [];
  for (const name of FILES) {
    const text = read(name);
    for (const m of text.matchAll(/`([^`\n]+)`/g)) {
      const token = m[1].trim();
      if (!PATH_RE.test(token)) continue;
      const path = token.replace(/:\d+(-\d+)?$/, '');
      if (!existsSync(join(repoRoot, path))) missing.push(`${name}: ${path}`);
    }
  }
  assert.deepEqual(missing, []);
});

const table = JSON.parse(readFileSync(join(reviewDir, 'routing.json'), 'utf8'));
const linkTypes = new Set(table.map((e) => e.linkType));
// Single-token kebab-case `## heading` lines; multi-word intro headings are ignored.
const mapHeadings = (name) => [...read(name).matchAll(/^## ([a-z0-9]+(?:-[a-z0-9]+)*)\s*$/gm)].map((m) => m[1]);

test('routing.json is not empty', () => {
  assert.ok(Array.isArray(table) && table.length > 0, 'routing.json has no link types');
});

test('every routing linkType has a heading in exactly one contract map', () => {
  const headings = MAPS.map((name) => new Set(mapHeadings(name)));
  for (const linkType of linkTypes) {
    const count = headings.filter((s) => s.has(linkType)).length;
    assert.equal(count, 1, `${linkType} appears in ${count} contract maps`);
  }
});

test('contract maps have no duplicate or unknown link-type headings', () => {
  for (const name of MAPS) {
    const seen = new Set();
    for (const h of mapHeadings(name)) {
      assert.ok(!seen.has(h), `${name}: duplicate heading ## ${h}`);
      seen.add(h);
      assert.ok(linkTypes.has(h), `${name}: ## ${h} is not a routing.json linkType`);
    }
  }
});

test('checklist covers the 14 classes', () => {
  const text = read('checklist.md');
  for (let c = 1; c <= 14; c++) assert.match(text, new RegExp(`^## ${c}\\. `, 'm'), `class ${c}`);
});
