#!/usr/bin/env node
/**
 * Billing preflight — fails a functions deploy loudly if the Stripe billing
 * config Firebase will actually ship is incomplete, instead of shipping a
 * subscribe/webhook flow that 500s in production (RG-P0-1).
 *
 * Wired into firebase.json functions.predeploy. Run manually:
 *   node scripts/preflight-billing.js            # from regroup/
 *   node scripts/preflight-billing.js --strict    # also fail on warnings
 *
 * TWO DISTINCT MECHANISMS (see functions/src/config.ts + functions/.env.example):
 *
 *   [CONFIG] — non-secret deploy config in functions/.env and
 *             functions/.env.<projectId>. These files ARE bundled into the
 *             deploy. .env.local is EMULATOR-ONLY and is NOT deployed, so it is
 *             deliberately excluded here. The deploying shell's process.env is
 *             also NOT shipped, so it is NOT consulted. Missing CONFIG → hard
 *             fail ONCE billing is live; warn-only before then (see ENFORCEMENT).
 *
 *   [SECRET] — Stripe secret/webhook keys defined via defineSecret() and bound
 *             with { secrets: [...] }. These live in Firebase Secret Manager,
 *             set via `firebase functions:secrets:set NAME`, NOT in any .env
 *             file. Verified via a Secret Manager existence check whose value
 *             output is discarded. Best-effort: WARN (not fail) if it can't be
 *             confirmed, so a CLI/auth quirk never false-fails a healthy deploy
 *             (use --strict to make unconfirmed secrets fatal).
 *
 * ENFORCEMENT — the CONFIG gate is fail-closed only when billing is actually on:
 *   - TIER_BILLING_ENABLED=true in the deployed config → missing CONFIG is FATAL
 *     (exit 1). This is the go-live state; shipping it incomplete is RG-P0-1.
 *   - flag absent/false (pre-launch) → missing CONFIG is a loud WARNING, exit 0,
 *     so an unrelated functions deploy is not blocked before billing is wired.
 *   - --strict → enforce regardless (a go-live readiness check; also makes
 *     unconfirmed secrets fatal).
 *
 * The wired predeploy (firebase.json) passes NO --strict, and deliberately so.
 * Under --strict every warning is fatal, and two warnings fire on healthy
 * deploys: the informational "TIER_BILLING_ENABLED is not true" line on any
 * pre-go-live deploy, and any [SECRET] that `firebase functions:secrets:access`
 * cannot confirm — which needs secretmanager.versions.access, an IAM permission
 * a deployer does not otherwise require. Wiring --strict into the predeploy
 * would therefore block legitimate deploys on a permission the deploy itself
 * does not need. Run it by hand as a readiness check instead. Nothing in this
 * script should claim a gate blocks unless it blocks without --strict.
 *
 * The CONFIG price-ID var names mirror priceEnvVar/annualPriceEnvVar in
 * functions/src/config.ts (SUBSCRIPTION_TIERS). Keep the two in sync.
 */
'use strict';

const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const REGROUP_DIR = path.join(__dirname, '..');
const FUNCTIONS_DIR = path.join(REGROUP_DIR, 'functions');

// GCP project-id grammar. Also rejects anything with path separators / `..`,
// since projectId is interpolated into a filename below (defense-in-depth —
// the sources are operator-controlled, but a malformed value should degrade to
// "unresolved", not read an arbitrary file).
function validProjectId(id) {
  return typeof id === 'string' && /^[a-z][a-z0-9-]{4,29}$/.test(id);
}

function resolveProjectId() {
  const candidate =
    process.env.GCLOUD_PROJECT ||
    process.env.FIREBASE_PROJECT ||
    (() => {
      try {
        const rc = JSON.parse(fs.readFileSync(path.join(REGROUP_DIR, '.firebaserc'), 'utf8'));
        return rc.projects && rc.projects.default;
      } catch {
        return undefined;
      }
    })();
  return validProjectId(candidate) ? candidate : undefined;
}

// Parse a .env file the way firebase's dotenv loader does: tolerate an optional
// `export ` prefix, surrounding quotes, and a trailing `# comment` on unquoted
// values. Quoted values are taken verbatim (a `#` inside quotes is literal).
function parseEnvFile(file) {
  const out = {};
  if (!fs.existsSync(file)) return out;
  const text = fs.readFileSync(file, 'utf8').replace(/\r\n?/g, '\n');
  for (const raw of text.split('\n')) {
    const line = raw.trim();
    if (!line || line.startsWith('#')) continue;
    const m = line.match(/^(?:export\s+)?([\w.-]+)\s*=\s*(.*)$/);
    if (!m) continue;
    const key = m[1];
    let val = m[2].trim();
    if (val[0] === '"' || val[0] === "'") {
      // Quoted: take content up to the matching close quote; ignore any trailing
      // ` # comment`. A `#` inside the quotes stays literal.
      const end = val.indexOf(val[0], 1);
      val = end === -1 ? val.slice(1) : val.slice(1, end);
    } else {
      // Unquoted: strip a trailing ` # comment`.
      const hash = val.indexOf(' #');
      if (hash !== -1) val = val.slice(0, hash).trim();
    }
    out[key] = val;
  }
  return out;
}

// Load ONLY what firebase deploys: functions/.env first, then the
// project-specific functions/.env.<projectId> overriding it. Deterministic
// order (not directory-listing order). Excludes .env.local (emulator-only) and
// .env.example (template). Does NOT overlay process.env — the deploying shell's
// environment is not shipped and must not satisfy a deploy-config check.
function loadDeployConfig(projectId) {
  const candidates = ['.env'];
  if (projectId) candidates.push(`.env.${projectId}`);
  const env = {};
  const files = [];
  for (const name of candidates) {
    const p = path.join(FUNCTIONS_DIR, name);
    if (fs.existsSync(p)) {
      Object.assign(env, parseEnvFile(p));
      files.push(name);
    }
  }
  return { env, files };
}

const TIER_PRICE_VARS = [
  'STRIPE_PRICE_TRAD_STARTER',
  'STRIPE_PRICE_TRAD_PROFESSIONAL',
  'STRIPE_PRICE_TRAD_ENTERPRISE',
  'STRIPE_PRICE_OXFORD_STANDARD',
  'STRIPE_PRICE_OXFORD_PLUS',
  'STRIPE_PRICE_OXFORD_NETWORK',
];
const ANNUAL_PRICE_VARS = TIER_PRICE_VARS.map((v) => `${v}_ANNUAL`);

// [CONFIG] — must be present in the deployed .env files. Hard fail if missing.
const CONFIG_REQUIRED = [
  'STRIPE_API_VERSION',
  // Legacy price IDs removed 2026-09-29: Regroup launches on the six-tier model
  // only. The tier path resolves prices via resolveTierPriceId() and never reads
  // these (verified: createTierSubscription -> api/stripe.ts:123; planId writes at
  // callable/subscriptions.ts:264,325 take that resolved price). The earlier note
  // here claiming the tier path seeded planId from them was inaccurate.
  //
  // The legacy FUNCTIONS in api/stripe.ts still reference process.env for these
  // and will now resolve undefined: createSubscription:84, createItemsFromMetadata:137,
  // reactivateSubscription:197-199, initializeSubscription:334/347. They are
  // unreachable while TIER_BILLING_ENABLED=true, EXCEPT reactivateSubscription,
  // which is exposed via the reactivateOperatorSubscription callable — audit that
  // before relying on this removal.
  ...TIER_PRICE_VARS,
  ...ANNUAL_PRICE_VARS,
];

// [SECRET] — defineSecret() vars in Firebase Secret Manager, NOT .env files.
const SECRET_NAMES = [
  'STRIPE_SECRET_KEY',
  'STRIPE_CLIENT_ID',
  'STRIPE_WEBHOOK_SECRET',
  'STRIPE_CONNECT_WEBHOOK_SECRET',
  // Test-mode signing secrets. One each, NOT both on both functions:
  // STRIPE_TEST_WEBHOOK_SECRET is bound only on stripeWebhook and
  // STRIPE_CONNECT_TEST_WEBHOOK_SECRET only on handleStripeConnectWebhook
  // (functions/src/webhooks/stripeWebhook.ts). That asymmetry is correct —
  // webhookSecretCandidates('platform') reads only the platform pair and
  // ('connect') only the Connect pair, so a cross-binding would be dead weight.
  // Asserted by the `secrets:` tests in
  // functions/src/__tests__/webhooks/stripeWebhook.test.ts.
  //
  // A missing one does NOT fail this preflight: every [SECRET] finding below is a
  // warning unless --strict is passed, and the wired predeploy passes no --strict
  // (firebase.json). It degrades at runtime instead — the function falls back to
  // the one remaining candidate, which still verifies its own mode's events, so
  // the loss is diagnostic rather than functional. Run
  // `node scripts/preflight-billing.js --strict` as a go-live readiness check to
  // make it fatal.
  //
  // Separately, do not assume `firebase deploy` itself hard-fails on a missing
  // BOUND secret: newer firebase-tools may prompt interactively for a value
  // instead, which in a non-interactive CI run is its own failure mode. UNVERIFIED
  // here — not tested against the pinned CLI — so treat it as a reason not to rely
  // on the deploy as a backstop, rather than as a documented behaviour.
  'STRIPE_TEST_WEBHOOK_SECRET',
  'STRIPE_CONNECT_TEST_WEBHOOK_SECRET',
];

// The API version this service is written against, read out of the source of
// truth rather than copied. functions/src/util/stripeApiVersion.ts lets a
// deployed STRIPE_API_VERSION override the pin, and that override now applies to
// every Stripe client, so a present-but-divergent value changes the shape of the
// objects Stripe returns to every OUTBOUND call service-wide, while passing a
// mere presence check. It does NOT change inbound webhook payload shapes — those
// come from the API version set on the endpoint in the Stripe Dashboard, as
// functions/src/util/stripeApiVersion.ts explains.
//
// Parsed textually because this is a plain Node script with no TS build step.
// A parse failure is reported, never swallowed: returning null silently and
// skipping the comparison meant renaming PINNED_API_VERSION, or switching it to
// a template literal, disabled this gate with no signal at all.
function readPinnedApiVersion() {
  const pinFile = path.join(__dirname, '..', 'functions', 'src', 'util', 'stripeApiVersion.ts');
  let src;
  try {
    src = fs.readFileSync(pinFile, 'utf8');
  } catch (err) {
    return {
      version: null,
      problem:
        `could not read ${path.relative(path.join(__dirname, '..'), pinFile)} ` +
        `(${err.code || err.message})`,
    };
  }
  const m = src.match(/PINNED_API_VERSION\s*=\s*["']([^"']+)["']/);
  if (!m) {
    return {
      version: null,
      problem:
        `no PINNED_API_VERSION = '<version>' assignment found in ` +
        `${path.relative(path.join(__dirname, '..'), pinFile)} — it was probably ` +
        `renamed or changed to a template literal. Until this parses, the ` +
        `STRIPE_API_VERSION divergence gate below cannot run at all.`,
    };
  }
  return { version: m[1], problem: null };
}
const { version: EXPECTED_API_VERSION, problem: API_VERSION_PIN_PROBLEM } = readPinnedApiVersion();

// Existence check via `firebase functions:secrets:access` with all output
// discarded (the value never reaches a log). Returns 'ok' | 'missing' |
// 'unavailable' (CLI absent / not authed / no project — treated as a warning).
function checkSecret(name, projectId) {
  if (!projectId) return 'unavailable';
  // No shell — args are passed directly, so a projectId/name can't inject.
  // Bounded timeout so a hung/slow CLI can't stall the deploy (a timeout sets
  // r.error → 'unavailable' → warn, never a hard block).
  const r = spawnSync(
    'firebase',
    ['functions:secrets:access', `${name}@latest`, '--project', projectId],
    { stdio: 'ignore', timeout: 20000 },
  );
  if (r.error) return 'unavailable'; // firebase not on PATH, or timed out
  return r.status === 0 ? 'ok' : 'missing';
}

function main() {
  const strict = process.argv.includes('--strict');
  const projectId = resolveProjectId();
  const { env, files } = loadDeployConfig(projectId);
  const warnings = [];
  // Declared. The API-version gate below pushed onto an undeclared `errors`,
  // which under 'use strict' threw ReferenceError: errors is not defined — so the
  // enforced path crashed with a stack trace instead of printing its message. It
  // did block the deploy, by crashing, which is not the same as reporting.
  const errors = [];

  console.log(
    `[preflight-billing] project: ${projectId || '(unresolved)'} | ` +
      `config source: ${files.length ? `functions/{${files.join(', ')}}` : 'NONE — no functions/.env or functions/.env.' + (projectId || '<project>') + ' found; all CONFIG vars will be UNSET in the deploy'}`,
  );

  // Enforcement flips automatically at go-live. Setting TIER_BILLING_ENABLED=true
  // in the deployed config is the exact moment (runbook RG-P0-1 step 2) an operator
  // asserts tier billing is ON — from then on, incomplete billing CONFIG is a hard
  // deploy blocker. BEFORE that (flag absent/false) billing is not live, so missing
  // CONFIG is a loud WARNING only and does NOT block an unrelated functions deploy
  // (e.g. a meetings/invite hotfix shipped before ops has filled the billing .env).
  // `--strict` forces enforcement early — use it as a go-live readiness check.
  const billingEnabled = env.TIER_BILLING_ENABLED === 'true';
  const enforce = billingEnabled || strict;

  // --- [CONFIG] gate --------------------------------------------------------
  const missingConfig = CONFIG_REQUIRED.filter((k) => !env[k] || env[k].trim() === '');
  if (!billingEnabled) {
    warnings.push(
      'TIER_BILLING_ENABLED is not "true" in the deployed config — tier billing is NOT ' +
        'live: every NEW checkout falls through to the legacy per-house+per-guest model, ' +
        'and any missing billing CONFIG below is a warning, not a deploy blocker (pass ' +
        '--strict, or set TIER_BILLING_ENABLED=true, to enforce).',
    );
  }
  // STRIPE_API_VERSION: presence alone is not enough. The override reaches every
  // Stripe client, so a present-but-divergent value silently changes the shape of
  // the objects Stripe returns to every outbound call service-wide — the same
  // class of bug as the four-way split this replaced, just uniform instead of
  // inconsistent. Treated as an error under enforcement rather than a warning,
  // because nothing downstream validates the cast to Stripe.LatestApiVersion at
  // runtime.
  //
  // The pin must parse before any of that can be checked, so a parse failure is
  // reported at the same severity rather than silently skipping the comparison.
  if (API_VERSION_PIN_PROBLEM) {
    const message =
      `cannot read the pinned Stripe API version: ${API_VERSION_PIN_PROBLEM} ` +
      `STRIPE_API_VERSION in the deployed config is therefore UNCHECKED.`;
    (enforce ? errors : warnings).push(message);
  }

  const deployedApiVersion = (env.STRIPE_API_VERSION || '').trim();
  if (EXPECTED_API_VERSION && deployedApiVersion && deployedApiVersion !== EXPECTED_API_VERSION) {
    const message =
      `STRIPE_API_VERSION is "${deployedApiVersion}" but this service is written ` +
      `against "${EXPECTED_API_VERSION}" (PINNED_API_VERSION in ` +
      `functions/src/util/stripeApiVersion.ts). The deployed value overrides the ` +
      `pin for every Stripe client, changing the shape of the objects Stripe ` +
      `returns to outbound calls. (It does NOT change inbound webhook payload ` +
      `shapes — those follow the API version set on the endpoint in the Stripe ` +
      `Dashboard, which is a separate manual check.) Align them, or bump the pin ` +
      `deliberately with its own verification.`;
    (enforce ? errors : warnings).push(message);
  }

  // --- [SECRET] best-effort check (warn-only unless --strict) ---------------
  const secretIssues = [];
  for (const name of SECRET_NAMES) {
    const status = checkSecret(name, projectId);
    if (status === 'missing') {
      // Non-zero exit ≠ definitely absent: could be missing, or a login/IAM
      // access issue. Don't over-assert.
      secretIssues.push(
        `${name} not found or not accessible (verify it's set + you have access: firebase login / secretmanager IAM)`,
      );
    } else if (status === 'unavailable') {
      secretIssues.push(`${name} could not be confirmed (firebase CLI not available/authed here)`);
    }
  }
  if (secretIssues.length) {
    warnings.push(
      'Secret Manager not confirmed for:\n      - ' +
        secretIssues.join('\n      - ') +
        '\n    Set each with: firebase functions:secrets:set <NAME>  (NEVER put these in any .env file).',
    );
  }

  for (const w of warnings) console.warn(`[preflight-billing] ⚠ ${w}`);

  // Hard errors block before the CONFIG report, which can `return` early and
  // would otherwise swallow them.
  if (errors.length) {
    for (const e of errors) console.error(`[preflight-billing] ✗ ${e}`);
    console.error(
      `[preflight-billing] ✗ ${errors.length} blocking issue(s) above — deploy blocked.`,
    );
    process.exit(1);
  }

  if (missingConfig.length) {
    console.error(
      `[preflight-billing] ${enforce ? '✗' : '⚠'} ${missingConfig.length} required [CONFIG] var(s) missing from the deployed .env:`,
    );
    for (const k of missingConfig) console.error(`    - ${k}`);
    console.error(
      '\n  Put these (price IDs, API version, TIER_BILLING_ENABLED) in functions/.env or ' +
        `functions/.env.${projectId || '<projectId>'} — reference values are in ` +
        'regroup/scripts/stripe-prices.env. Do NOT use functions/.env.local (emulator-only, not deployed). ' +
        'Do NOT put Stripe SECRET/webhook keys here — those go in Secret Manager.',
    );
    if (enforce) {
      console.error(
        `[preflight-billing] ✗ ${billingEnabled ? 'TIER_BILLING_ENABLED=true but billing CONFIG is incomplete' : '--strict'} — deploy blocked.`,
      );
      process.exit(1);
    }
    console.warn(
      '[preflight-billing] ⚠ tier billing is not live (TIER_BILLING_ENABLED≠true) — allowing ' +
        'this deploy, but any tier checkout WILL 500 until the vars above are set + billing enabled.',
    );
    return;
  }

  if (strict && warnings.length) {
    console.error('[preflight-billing] ✗ --strict: warnings above are fatal. Deploy blocked.');
    process.exit(1);
  }

  console.log(
    `[preflight-billing] ✓ all ${CONFIG_REQUIRED.length} required [CONFIG] vars present` +
      (warnings.length
        ? ` (${warnings.length} warning(s) above — not fatal without --strict)`
        : ''),
  );
}

main();
