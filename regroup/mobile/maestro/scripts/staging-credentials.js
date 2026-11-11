#!/usr/bin/env node
/**
 * Reads the sign-in email and password from `npm run e2e:staging-operator`'s
 * output (regroup/e2e formatRunResult), for staging-operator-signin.sh.
 *
 *   node maestro/scripts/staging-credentials.js email|password < output.txt
 *
 * Refuses output without both lines, or an email outside the e2e test domain,
 * so a change to the command's output fails here rather than typing a blank.
 */
function line(text, label) {
  const m = String(text).match(new RegExp(`^\\s*${label}:\\s+(\\S+)\\s*$`, 'm'));
  if (!m) {
    throw new Error(`no ${label}: line in the staging operator output`);
  }
  return m[1];
}

function parseOperatorCredentials(text) {
  const email = line(text, 'Email');
  const password = line(text, 'Password');
  if (!email.endsWith('@rats-e2e.com')) {
    throw new Error(`${email} is not an @rats-e2e.com test account`);
  }
  return { email, password };
}

module.exports = { parseOperatorCredentials };

if (require.main === module) {
  const field = process.argv[2];
  if (field !== 'email' && field !== 'password') {
    console.error('usage: staging-credentials.js email|password < output');
    process.exit(2);
  }
  try {
    const creds = parseOperatorCredentials(require('fs').readFileSync(0, 'utf8'));
    process.stdout.write(creds[field]);
  } catch (err) {
    console.error(`staging-credentials: ${err.message}`);
    process.exit(1);
  }
}
