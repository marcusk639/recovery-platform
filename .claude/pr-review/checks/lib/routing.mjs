import { readFileSync } from 'node:fs';
import { matches } from './glob.mjs';

const TABLE = JSON.parse(readFileSync(new URL('../../routing.json', import.meta.url), 'utf8'));

// Longest prefix first so regroup/functions wins over a bare product dir.
const PACKAGES = [
  'homegroups/functions',
  'homegroups/mobile',
  'homegroups/web',
  'regroup/functions',
  'regroup/mobile',
  'regroup/web',
  'regroup/e2e',
  'recovery-api',
  'detox-recovery',
];

const ALWAYS_CLASSES = [13, 14];

export function packageOf(file) {
  return PACKAGES.find((p) => file === p || file.startsWith(`${p}/`)) ?? 'repo';
}

export function route(files) {
  const packages = new Set();
  const linkTypes = new Set();
  const classes = new Set(ALWAYS_CLASSES);
  for (const file of files) {
    packages.add(packageOf(file));
    for (const entry of TABLE) {
      if (entry.paths.some((p) => matches(file, p))) {
        linkTypes.add(entry.linkType);
        for (const c of entry.classes) classes.add(c);
      }
    }
  }
  return {
    packages: [...packages].sort(),
    linkTypes: [...linkTypes],
    classes: [...classes].sort((a, b) => a - b),
  };
}
