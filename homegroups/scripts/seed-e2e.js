#!/usr/bin/env node
/**
 * Seed homegroups-e2e with the 4 E2E personas + group/meeting/role/invite state. Idempotent.
 * (1) create-or-signin the Auth users (Email/Password must be enabled) to get UIDs;
 * (2) write 16 Firestore docs via REST commit with an OWNER token minted from the firebase-tools
 * refresh token (bypasses rules). Requires `firebase login`. Usage: node homegroups/scripts/seed-e2e.js
 * Personas (pw TestPassword123!): test-admin@, test-unclaimed-member@, test-treasurer@, test-filler@.
 * Doc shapes live in seed-e2e-data.js.
 */
const https = require('https');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { EMAILS, buildWrites } = require('./seed-e2e-data');

const PROJECT = 'homegroups-e2e';
const PASSWORD = 'TestPassword123!';
// firebase-tools public OAuth client (open-source; not a real secret).
const CLIENT_ID = '563584335869-fgrhgmd47bqnekij5i8b5pr03ho849e6.apps.googleusercontent.com';
const CLIENT_SECRET = 'j9iVZfS8kkCEFUPaAeJV0sAi';

// Read the Firebase Web API key from the committed e2e plist rather than hardcoding it.
function apiKey() {
  const plist = fs.readFileSync(
    path.join(__dirname, '..', 'mobile', 'ios', 'GoogleService-Info-E2E.plist'),
    'utf8',
  );
  const m = plist.match(/<key>API_KEY<\/key>\s*<string>([^<]+)<\/string>/);
  if (!m) throw new Error('API_KEY not found in GoogleService-Info-E2E.plist');
  return m[1];
}

function req(host, reqPath, method, body, headers) {
  const data = body ? (typeof body === 'string' ? body : JSON.stringify(body)) : null;
  const ct = data
    ? { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(data) }
    : {};
  return new Promise((resolve, reject) => {
    const r = https.request(
      { host, path: reqPath, method, headers: { ...ct, ...(headers || {}) } },
      (res) => {
        let out = '';
        res.on('data', (c) => (out += c));
        res.on('end', () => resolve({ status: res.statusCode, body: out }));
      },
    );
    r.on('error', reject);
    if (data) r.write(data);
    r.end();
  });
}

async function uidFor(email, key) {
  const signUp = await req(
    'identitytoolkit.googleapis.com',
    `/v1/accounts:signUp?key=${key}`,
    'POST',
    { email, password: PASSWORD, returnSecureToken: true },
  );
  const su = JSON.parse(signUp.body);
  if (su.localId) return su.localId;
  const signIn = await req(
    'identitytoolkit.googleapis.com',
    `/v1/accounts:signInWithPassword?key=${key}`,
    'POST',
    { email, password: PASSWORD, returnSecureToken: true },
  );
  const si = JSON.parse(signIn.body);
  if (si.localId) return si.localId;
  throw new Error(`could not create/sign-in ${email}: ${su.error?.message || si.error?.message}`);
}

async function ownerToken() {
  const cfg = JSON.parse(
    fs.readFileSync(os.homedir() + '/.config/configstore/firebase-tools.json', 'utf8'),
  );
  const form =
    `client_id=${encodeURIComponent(CLIENT_ID)}` +
    `&client_secret=${encodeURIComponent(CLIENT_SECRET)}` +
    `&refresh_token=${encodeURIComponent(cfg.tokens.refresh_token)}&grant_type=refresh_token`;
  const r = await req('oauth2.googleapis.com', '/token', 'POST', form, {
    'Content-Type': 'application/x-www-form-urlencoded',
  });
  const j = JSON.parse(r.body);
  if (!j.access_token) throw new Error('token mint failed: ' + r.body);
  return j.access_token;
}

(async () => {
  const key = apiKey();
  const uids = {};
  for (const [k, email] of Object.entries(EMAILS)) uids[k] = await uidFor(email, key);

  const base = `projects/${PROJECT}/databases/(default)/documents`;
  const writes = buildWrites(uids, base);
  const token = await ownerToken();
  const r = await req(
    'firestore.googleapis.com',
    `/v1/${base}:commit`,
    'POST',
    { writes },
    { Authorization: 'Bearer ' + token },
  );
  if (r.status !== 200) {
    console.error('COMMIT FAILED', r.status, r.body);
    process.exit(1);
  }
  console.log(`Seeded ${JSON.parse(r.body).writeResults.length} documents.`);
  console.log('Personas:', Object.values(EMAILS).join(', '));
})().catch((e) => {
  console.error(e.message || e);
  process.exit(1);
});
