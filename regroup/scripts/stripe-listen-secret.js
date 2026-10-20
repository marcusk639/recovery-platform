#!/usr/bin/env node
/**
 * Put the `stripe listen` signing secret where the local functions emulator
 * looks for it.
 *
 * The webhook verifier (functions/src/util/verifyStripeWebhook.ts) only
 * processes an event whose mode matches both the secret that verified it and
 * the deployment. A test-mode event forwarded by `stripe listen` therefore has
 * to verify against the TEST secrets, and the emulator must run with an
 * sk_test_ key. Putting the listen secret in STRIPE_WEBHOOK_SECRET (the live
 * one) makes every forwarded event fail with a 400.
 *
 * `stripe listen` uses one signing secret for --forward-to and
 * --forward-connect-to, so both test secrets get the same value.
 *
 * Writes regroup/functions/.secret.local (gitignored). Run from
 * regroup/functions:  npm run stripe:listen:secret
 * Then restart the emulator so it reads the new value.
 */
'use strict';

const { execFileSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const SECRET_FILE = path.resolve(process.cwd(), '.secret.local');
const VARS = ['STRIPE_TEST_WEBHOOK_SECRET', 'STRIPE_CONNECT_TEST_WEBHOOK_SECRET'];

function fail(message) {
  console.error(`stripe-listen-secret: ${message}`);
  process.exit(1);
}

let secret;
try {
  secret = execFileSync('stripe', ['listen', '--print-secret'], { encoding: 'utf8' }).trim();
} catch (err) {
  fail(
    `could not run \`stripe listen --print-secret\` (${err.message}). Install the Stripe CLI and run \`stripe login\`.`,
  );
}
if (!/^whsec_/.test(secret)) fail('`stripe listen --print-secret` did not return a whsec_ secret.');

const lines = fs.existsSync(SECRET_FILE) ? fs.readFileSync(SECRET_FILE, 'utf8').split('\n') : [];

const keyLine = lines.find((l) => l.startsWith('STRIPE_SECRET_KEY='));
const key = keyLine ? keyLine.slice('STRIPE_SECRET_KEY='.length).replace(/^"|"$/g, '').trim() : '';
if (!/^(sk|rk)_test_/.test(key)) {
  console.warn(
    'stripe-listen-secret: STRIPE_SECRET_KEY in .secret.local is not a test-mode key. The emulator will ' +
      'count itself as a live deployment and reject every test-mode event.',
  );
}

for (const name of VARS) {
  const line = `${name}=${secret}`;
  const index = lines.findIndex((l) => l.startsWith(`${name}=`));
  if (index === -1) lines.push(line);
  else lines[index] = line;
}
fs.writeFileSync(
  SECRET_FILE,
  lines.filter((l, i) => l !== '' || i < lines.length - 1).join('\n') + '\n',
  {
    mode: 0o600,
  },
);

// Never print the secret itself.
console.log(
  `stripe-listen-secret: set ${VARS.join(' and ')} in ${path.relative(process.cwd(), SECRET_FILE)}.`,
);
console.log('Restart the emulator (npm run serve) so it picks them up.');
