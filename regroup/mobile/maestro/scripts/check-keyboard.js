#!/usr/bin/env node
/**
 * Keyboard check (device pass row 5, decision record §5.3): with the keyboard
 * open, the field being typed in must sit fully above it (and above the iOS
 * Prev/Next/Done toolbar), so the user sees what they type.
 *
 *   node maestro/scripts/check-keyboard.js --platform android|ios --device <id>
 *        [--target-id <testID> | --target-text <regex>] [--label name]
 *
 * The field: the node with the given testID (resource-id), or whose text or
 * value matches --target-text; without either, the focused node (Android only:
 * the iOS hierarchy never reports focus).
 * The keyboard's top: Android, the visible `ime` InsetsSource in `dumpsys
 * window`; iOS, the keyboard toolbar (keyboard.toolbar.*) in `maestro
 * hierarchy`, else the highest keyboard key.
 * Exit 0: the field is clear. Exit 1: covered. Exit 2: no keyboard or no field
 * (the flow didn't open it), or the screen couldn't be read.
 */
const { execFileSync } = require('child_process');
const { parseBounds } = require('./check-insets');

const KEY_IDS = new Set(['space', 'delete', 'shift', 'Return']);
const LETTER = /^[a-z]$/;

function imeTop(dumpsys) {
  // API 30 names it ITYPE_IME; API 36 adds visibleFrame= before visible=.
  const m =
    /InsetsSource [^\n]*?type=(?:ime|ITYPE_IME) frame=(\[[^\]]+\]\[[^\]]+\])[^\n]*? visible=true/.exec(
      String(dumpsys),
    );
  const b = m && parseBounds(m[1]);
  return b && b.y2 > b.y1 ? b.y1 : null;
}

function walkNodes(tree, fn) {
  const go = (n) => {
    fn((n && n.attributes) || {});
    for (const c of (n && n.children) || []) go(c);
  };
  go(tree);
}

/** iOS: the keyboard's top, its toolbar when there is one, else its keys. */
function iosKeyboardTop(tree) {
  let toolbarTop = null;
  let keysTop = null;
  walkNodes(tree, (a) => {
    const rid = a['resource-id'] || '';
    const label = (a.accessibilityText || a.text || '').trim();
    const b = parseBounds(a.bounds);
    if (!b) return;
    if (rid.startsWith('keyboard.toolbar.')) {
      toolbarTop = toolbarTop === null ? b.y1 : Math.min(toolbarTop, b.y1);
    } else if (KEY_IDS.has(rid) || LETTER.test(label)) {
      keysTop = keysTop === null ? b.y1 : Math.min(keysTop, b.y1);
    }
  });
  // A stray one-letter label can sit high on the screen; only keys count when
  // the toolbar (always directly above the keys) gives the real top.
  return toolbarTop !== null ? toolbarTop : keysTop;
}

/** The target field's bounds (see the header), or null. */
function targetBounds(tree, { id, text } = {}) {
  let found = null;
  const re = text ? new RegExp(`^(?:${text})$`) : null;
  walkNodes(tree, (a) => {
    const b = parseBounds(a.bounds);
    if (!b || b.y2 <= b.y1) return;
    const hit = id
      ? a['resource-id'] === id
      : re
        ? [a.text, a.value, a.accessibilityText].some(
            (v) => typeof v === 'string' && re.test(v.trim()),
          )
        : a.focused === 'true' || a.focused === true;
    if (hit) found = b; // the innermost match wins
  });
  return found;
}

/** null when clear; otherwise how many px of the field the keyboard covers. */
function coveredBy(field, keyboardTop, slack = 2) {
  const px = field.y2 - keyboardTop;
  return px > slack ? px : null;
}

function arg(name, def) {
  const i = process.argv.indexOf(`--${name}`);
  return i > 0 ? process.argv[i + 1] : def;
}

function main() {
  const platform = arg('platform');
  const device = arg('device');
  const label = arg('label', 'field');
  const target = { id: arg('target-id'), text: arg('target-text') };
  if (!device || !['ios', 'android'].includes(platform)) {
    console.error(
      'usage: check-keyboard.js --platform android|ios --device <id> [--target-id x | --target-text re] [--label name]',
    );
    process.exit(2);
  }
  let tree;
  let top;
  try {
    tree = JSON.parse(
      execFileSync('maestro', ['--device', device, 'hierarchy'], {
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'ignore'],
        maxBuffer: 64 * 1024 * 1024,
      }),
    );
    top =
      platform === 'android'
        ? imeTop(
            execFileSync('adb', ['-s', device, 'shell', 'dumpsys', 'window'], {
              encoding: 'utf8',
              maxBuffer: 64 * 1024 * 1024,
            }),
          )
        : iosKeyboardTop(tree);
  } catch (e) {
    console.error(`check-keyboard [${label}]: could not read the screen: ${e.message}`);
    process.exit(2);
  }
  const field = targetBounds(tree, target);
  if (top === null || !field) {
    console.error(
      `check-keyboard [${label}]: ${top === null ? 'no keyboard open' : 'field not found'}`,
    );
    process.exit(2);
  }
  const px = coveredBy(field, top);
  if (px === null) {
    console.log(
      `check-keyboard [${label}]: OK (field ends at ${field.y2}, keyboard starts at ${top})`,
    );
    return;
  }
  console.log(
    `check-keyboard [${label}]: the keyboard covers ${px}px of the field (field ends at ${field.y2}, keyboard starts at ${top})`,
  );
  process.exit(1);
}

if (require.main === module) main();

module.exports = { imeTop, iosKeyboardTop, targetBounds, coveredBy };
