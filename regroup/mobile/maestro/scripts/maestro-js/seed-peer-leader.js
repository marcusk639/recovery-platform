// Maestro runScript (host side): adds a peer leader to HOUSE_ID, the way the
// app's records leave one (admin claim on the house, a peerLeader house-roles
// record, users and admins docs), so a flow can check what a peer leader may
// not do. The seed has no peer leader; re-seeding removes this one. Emulator
// only. Logs nothing.
// env: HOUSE_ID, EMAIL, PASSWORD. Sets output.uid.
const PROJECT = 'demo-regroup-e2e';
const AUTH = 'http://127.0.0.1:9099/identitytoolkit.googleapis.com/v1/projects/' + PROJECT;
const FS = 'http://127.0.0.1:8080/v1/projects/' + PROJECT + '/databases/(default)/documents';
const headers = { Authorization: 'Bearer owner', 'Content-Type': 'application/json' };
const UID = 'e2e-peer-leader';

const claims = { admin: {} };
claims.admin[HOUSE_ID] = true;
const created = http.post(AUTH + '/accounts', {
  headers: headers,
  body: JSON.stringify({
    localId: UID,
    email: EMAIL,
    password: PASSWORD,
    emailVerified: true,
    customAttributes: JSON.stringify(claims),
  }),
});
// A second run before a re-seed finds the account already there.
if (created.status !== 200 && String(created.body).indexOf('DUPLICATE') < 0) {
  throw new Error('peer leader account not created: ' + created.status);
}

const str = function (v) {
  return { stringValue: v };
};
const bool = function (v) {
  return { booleanValue: v };
};
function put(path, fields) {
  const res = http.request(FS + '/' + path, {
    method: 'PATCH',
    headers: headers,
    body: JSON.stringify({ fields: fields }),
  });
  if (res.status !== 200) throw new Error('write failed for ' + path + ': ' + res.status);
}

put('users/' + UID, {
  id: str(UID),
  uid: str(UID),
  email: str(EMAIL),
  firstName: str('Pat'),
  lastName: str('PeerLeader'),
  isAdmin: bool(true),
  isSuperAdmin: bool(false),
  isGuest: bool(false),
  isAnonymous: bool(false),
  adminId: str(UID),
  houseId: str(HOUSE_ID),
  orgSetupCompleted: bool(true),
  infoEntered: bool(true),
  potentialSuperAdmin: bool(false),
});
put('admins/' + UID, {
  id: str(UID),
  userId: str(UID),
  email: str(EMAIL),
  firstName: str('Pat'),
  lastName: str('PeerLeader'),
  houseIds: { arrayValue: { values: [str(HOUSE_ID)] } },
});
put('house-roles/' + HOUSE_ID + '_' + UID, {
  houseId: str(HOUSE_ID),
  tier: str('peerLeader'),
  grantedBy: str('e2e-manager'),
  grantedAt: str(new Date().toISOString()),
  via: str('e2e-seed'),
});
output.uid = UID;
