// Maestro runScript (host side): makes a seeded resident of HOUSE_ID a peer
// leader there, as promoteGuestsToAdmin does: the admin claim beside the guest
// claim, the users doc's isAdmin, and a peerLeader house-roles record. The seed
// has no peer leader; re-seeding undoes this. Emulator only. Logs nothing.
// env: HOUSE_ID, UID (the resident's uid).
const PROJECT = 'demo-regroup-e2e';
const AUTH = 'http://127.0.0.1:9099/identitytoolkit.googleapis.com/v1/projects/' + PROJECT;
const FS = 'http://127.0.0.1:8080/v1/projects/' + PROJECT + '/databases/(default)/documents';
const headers = { Authorization: 'Bearer owner', 'Content-Type': 'application/json' };

const claims = { guest: {}, admin: {} };
claims.guest[HOUSE_ID] = true;
claims.admin[HOUSE_ID] = true;
const updated = http.post(AUTH + '/accounts:update', {
  headers: headers,
  body: JSON.stringify({ localId: UID, customAttributes: JSON.stringify(claims) }),
});
if (updated.status !== 200) throw new Error('claims not updated: ' + updated.status);

function patch(path, fields, mask) {
  const query = mask
    ? '?' + mask.map((f) => 'updateMask.fieldPaths=' + encodeURIComponent(f)).join('&')
    : '';
  const res = http.request(FS + '/' + path + query, {
    method: 'PATCH',
    headers: headers,
    body: JSON.stringify({ fields: fields }),
  });
  if (res.status !== 200) throw new Error('write failed for ' + path + ': ' + res.status);
}

patch('users/' + UID, { isAdmin: { booleanValue: true } }, ['isAdmin']);
patch('house-roles/' + HOUSE_ID + '_' + UID, {
  houseId: { stringValue: HOUSE_ID },
  tier: { stringValue: 'peerLeader' },
  grantedBy: { stringValue: 'e2e-manager' },
  grantedAt: { stringValue: new Date().toISOString() },
  via: { stringValue: 'e2e-flow' },
});
