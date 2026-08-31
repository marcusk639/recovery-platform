#!/usr/bin/env node
/**
 * Delete accumulated group_conscience_votes for e2e-admin-group in the homegroups-e2e project.
 * The conscience-vote E2E flow creates a vote each run (not idempotent); run this between runs.
 *
 * Auth: mints an owner access token from the firebase-tools stored refresh token
 * (~/.config/configstore/firebase-tools.json) — the same account used by `firebase login`.
 *
 * Usage:  node homegroups/scripts/clean-e2e-votes.js
 */
const https = require('https');
const fs = require('fs');
const os = require('os');

const PROJECT = 'homegroups-e2e';
const GROUP_ID = 'e2e-admin-group';
// firebase-tools public OAuth client (open-source; not a real secret).
const CLIENT_ID = '563584335869-fgrhgmd47bqnekij5i8b5pr03ho849e6.apps.googleusercontent.com';
const CLIENT_SECRET = 'j9iVZfS8kkCEFUPaAeJV0sAi';

function request(host, path, method, body, headers) {
  return new Promise((resolve, reject) => {
    const data = body ? (typeof body === 'string' ? body : JSON.stringify(body)) : null;
    const req = https.request(
      {
        host,
        path,
        method,
        headers: {
          ...(data
            ? {
                'Content-Type': 'application/json',
                'Content-Length': Buffer.byteLength(data),
              }
            : {}),
          ...(headers || {}),
        },
      },
      (res) => {
        let out = '';
        res.on('data', (c) => (out += c));
        res.on('end', () => resolve({ status: res.statusCode, body: out }));
      },
    );
    req.on('error', reject);
    if (data) req.write(data);
    req.end();
  });
}

async function accessToken() {
  const cfg = JSON.parse(
    fs.readFileSync(os.homedir() + '/.config/configstore/firebase-tools.json', 'utf8'),
  );
  const form =
    `client_id=${encodeURIComponent(CLIENT_ID)}` +
    `&client_secret=${encodeURIComponent(CLIENT_SECRET)}` +
    `&refresh_token=${encodeURIComponent(cfg.tokens.refresh_token)}` +
    `&grant_type=refresh_token`;
  const r = await request('oauth2.googleapis.com', '/token', 'POST', form, {
    'Content-Type': 'application/x-www-form-urlencoded',
  });
  const j = JSON.parse(r.body);
  if (!j.access_token) throw new Error('token mint failed: ' + r.body);
  return j.access_token;
}

(async () => {
  const token = await accessToken();
  const H = { Authorization: 'Bearer ' + token };
  const base = `/v1/projects/${PROJECT}/databases/(default)/documents`;
  const q = await request(
    'firestore.googleapis.com',
    `${base}:runQuery`,
    'POST',
    {
      structuredQuery: {
        from: [{ collectionId: 'group_conscience_votes' }],
        where: {
          fieldFilter: {
            field: { fieldPath: 'groupId' },
            op: 'EQUAL',
            value: { stringValue: GROUP_ID },
          },
        },
      },
    },
    H,
  );
  const rows = JSON.parse(q.body).filter((x) => x.document);
  let deleted = 0;
  for (const r of rows) {
    const name = r.document.name;
    const del = await request(
      'firestore.googleapis.com',
      '/v1/' + name.substring(name.indexOf('projects/')),
      'DELETE',
      null,
      H,
    );
    if (del.status === 200) deleted++;
  }
  console.log(`Deleted ${deleted} group_conscience_votes for ${GROUP_ID}`);
})().catch((e) => {
  console.error(e.message);
  process.exit(1);
});
