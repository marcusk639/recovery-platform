#!/usr/bin/env node
/**
 * Sends real FCM pushes to an e2e test account on staging (regroup-e2e), for
 * push.sh (device pass #160, row 3). The message shapes copy the server's:
 *
 *   resident  sendNotification (functions/src/util/notifications.ts): data only,
 *             a notifee JSON string the app shows itself in the foreground;
 *   admin     sendFcmToHouseAdmins: a notification block on channel `default`;
 *   data      a data-only probe with no title or body.
 *
 *   node maestro/scripts/push-fcm.js wait-token <email> [timeoutSeconds]
 *   node maestro/scripts/push-fcm.js send <email> <resident|admin|data> <marker>
 *
 * Credentials: ~/.config/regroup-e2e/service-account.json, or the path in
 * REGROUP_E2E_SERVICE_ACCOUNT. Refuses any project other than regroup-e2e and
 * any account outside @rats-e2e.com. Tokens are never printed.
 */
const fs = require('fs');
const os = require('os');
const path = require('path');

const PROJECT = 'regroup-e2e';
const BODY = 'Device pass push check';

function buildMessage(kind, token, marker) {
  switch (kind) {
    case 'resident':
      return {
        token,
        data: {
          notifee: JSON.stringify({
            body: BODY,
            title: marker,
            data: {},
            android: { channelId: 'default' },
          }),
        },
      };
    case 'admin':
      return {
        token,
        notification: { title: marker, body: BODY },
        android: { notification: { channelId: 'default' } },
      };
    case 'data':
      return { token, data: { e2eProbe: marker } };
    default:
      throw new Error(`unknown kind "${kind}": use resident, admin or data`);
  }
}

function assertStagingProject(serviceAccount) {
  if (!serviceAccount || serviceAccount.project_id !== PROJECT) {
    throw new Error(`refusing: the service account is not for ${PROJECT}`);
  }
}

function assertTestEmail(email) {
  if (!/^[^@\s]+@rats-e2e\.com$/.test(String(email))) {
    throw new Error(`refusing: ${email} is not an @rats-e2e.com test account`);
  }
}

function adminApp() {
  const file =
    process.env.REGROUP_E2E_SERVICE_ACCOUNT ||
    path.join(os.homedir(), '.config/regroup-e2e/service-account.json');
  const serviceAccount = JSON.parse(fs.readFileSync(file, 'utf8'));
  assertStagingProject(serviceAccount);
  const { initializeApp, cert } = require('firebase-admin/app');
  return initializeApp({ credential: cert(serviceAccount), projectId: PROJECT }, 'push-fcm');
}

async function tokensFor(app, email) {
  const { getAuth } = require('firebase-admin/auth');
  const { getFirestore } = require('firebase-admin/firestore');
  const { uid } = await getAuth(app).getUserByEmail(email);
  const snap = await getFirestore(app).doc(`users/${uid}`).get();
  const tokens = (snap.exists && snap.get('messagingToken')) || [];
  return Array.isArray(tokens) ? tokens.filter(Boolean) : [tokens].filter(Boolean);
}

async function main([cmd, email, ...rest]) {
  assertTestEmail(email);
  const app = adminApp();
  if (cmd === 'wait-token') {
    const deadline = Date.now() + Number(rest[0] || 60) * 1000;
    for (;;) {
      const tokens = await tokensFor(app, email);
      if (tokens.length) return console.log(`tokens: ${tokens.length}`);
      if (Date.now() > deadline) throw new Error('no messagingToken on the user doc');
      await new Promise((r) => setTimeout(r, 3000));
    }
  }
  if (cmd === 'send') {
    const [kind, marker] = rest;
    if (!marker) throw new Error('send needs a kind and a marker');
    const tokens = await tokensFor(app, email);
    if (!tokens.length) throw new Error('no messagingToken on the user doc');
    const { getMessaging } = require('firebase-admin/messaging');
    // The newest token is the installed app's; older ones may be stale.
    await getMessaging(app).send(buildMessage(kind, tokens[tokens.length - 1], marker));
    return console.log(`sent ${kind}`);
  }
  throw new Error('usage: push-fcm.js wait-token <email> [s] | send <email> <kind> <marker>');
}

module.exports = { buildMessage, assertStagingProject, assertTestEmail };

if (require.main === module) {
  main(process.argv.slice(2))
    .then(() => process.exit(0))
    .catch((e) => {
      console.error(`✗ ${e.message}`);
      process.exit(1);
    });
}
