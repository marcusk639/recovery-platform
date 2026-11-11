#!/usr/bin/env node
/**
 * Android edge-to-edge check (device pass row 6). Reads the screen on a device
 * or emulator (`maestro hierarchy`) and the system bars' frames (`adb shell
 * dumpsys window`, InsetsSource statusBars / navigationBars), and fails when any
 * of the app's text or tappable views overlaps a bar: under edge-to-edge
 * (targetSdk 35+) the app draws behind the bars, so content there is hidden or
 * untappable. Full-bleed backgrounds have no text and are not flagged.
 *
 *   node maestro/scripts/check-insets.js --device emulator-5554 --app-id com.regroup.app.e2e.emu [--label home]
 *
 * Exit 0: clean. Exit 1: overlaps, printed one per line. Exit 2: could not read.
 * Pure helpers are exported for the unit test.
 */
const { execFileSync } = require('child_process');

function parseBounds(s) {
  const m = /^\[(-?\d+),(-?\d+)\]\[(-?\d+),(-?\d+)\]$/.exec(String(s || '').trim());
  return m ? { x1: +m[1], y1: +m[2], x2: +m[3], y2: +m[4] } : null;
}

// Android 12+ names the sources statusBars / navigationBars / ime; Android 11
// (API 30) names them ITYPE_STATUS_BAR / ITYPE_NAVIGATION_BAR / ITYPE_IME.
const SOURCE_TYPES = {
  statusBars: 'statusBars',
  navigationBars: 'navigationBars',
  ITYPE_STATUS_BAR: 'statusBars',
  ITYPE_NAVIGATION_BAR: 'navigationBars',
};

/** The visible status and navigation bar frames from `dumpsys window`. */
function parseBars(dumpsys) {
  const bars = [];
  const re =
    /InsetsSource [^\n]*?type=(statusBars|navigationBars|ITYPE_STATUS_BAR|ITYPE_NAVIGATION_BAR) frame=(\[[^\]]+\]\[[^\]]+\]) visible=true/g;
  const seen = new Set();
  for (const m of String(dumpsys).matchAll(re)) {
    const type = SOURCE_TYPES[m[1]];
    const b = parseBounds(m[2]);
    const key = `${type}${m[2]}`;
    if (b && b.y2 > b.y1 && b.x2 > b.x1 && !seen.has(key)) {
      seen.add(key);
      bars.push({ type, ...b });
    }
  }
  return bars;
}

function overlap(a, b) {
  const w = Math.min(a.x2, b.x2) - Math.max(a.x1, b.x1);
  const h = Math.min(a.y2, b.y2) - Math.max(a.y1, b.y1);
  return w > 0 && h > 0 ? h : 0;
}

/**
 * App views with text, or tappable, that overlap a bar by more than `slack` px.
 * Everything under a System UI view (the bars and their icons) is skipped; the
 * hierarchy carries no package name, so the subtree marks it.
 */
function findOverlaps(hierarchy, bars, slack = 4) {
  const out = [];
  const walk = (n, inSystem) => {
    const a = (n && n.attributes) || {};
    const rid = a['resource-id'] || '';
    const system = inSystem || rid.startsWith('com.android.systemui');
    const text = (a.text || a.accessibilityText || '').trim();
    const tappable = a.clickable === 'true' || a.clickable === true;
    const b = parseBounds(a.bounds);
    if (!system && b && (text || tappable)) {
      for (const bar of bars) {
        const h = overlap(b, bar);
        if (h > slack) {
          out.push({ bar: bar.type, text: text || `(${rid || 'tappable'})`, bounds: a.bounds, px: h });
        }
      }
    }
    for (const c of (n && n.children) || []) walk(c, system);
  };
  walk(hierarchy, false);
  return out;
}

function arg(name, def) {
  const i = process.argv.indexOf(`--${name}`);
  return i > 0 ? process.argv[i + 1] : def;
}

function main() {
  const device = arg('device');
  const appId = arg('app-id', 'com.regroup.app.e2e.emu');
  const label = arg('label', 'screen');
  if (!device || !/\.e2e\.(emu|stg)$/.test(appId)) {
    console.error('usage: check-insets.js --device <serial> --app-id <e2e app id> [--label name]');
    process.exit(2);
  }
  let hierarchy;
  let bars;
  try {
    hierarchy = JSON.parse(
      execFileSync('maestro', ['--device', device, 'hierarchy'], {
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'ignore'],
        maxBuffer: 64 * 1024 * 1024,
      }),
    );
    bars = parseBars(
      execFileSync('adb', ['-s', device, 'shell', 'dumpsys', 'window'], {
        encoding: 'utf8',
        maxBuffer: 64 * 1024 * 1024,
      }),
    );
  } catch (e) {
    console.error(`check-insets [${label}]: could not read the screen: ${e.message}`);
    process.exit(2);
  }
  if (!bars.length) {
    console.error(`check-insets [${label}]: no visible system bars found`);
    process.exit(2);
  }
  const hits = findOverlaps(hierarchy, bars);
  if (!hits.length) {
    console.log(`check-insets [${label}]: OK (${bars.map((b) => b.type).join(', ')})`);
    return;
  }
  for (const h of hits) {
    console.log(`check-insets [${label}]: "${h.text}" ${h.bounds} overlaps ${h.bar} by ${h.px}px`);
  }
  process.exit(1);
}

if (require.main === module) main();

module.exports = { parseBounds, parseBars, findOverlaps };
