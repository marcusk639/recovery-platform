// Maestro runScript (host side): gives the app's current anonymous session a
// pending application to HOUSE_ID, as ApplyScreen would have written it
// (id `${houseId}_${uid}`), so a flow can test getting back to it without
// going through house search. Emulator only.
// The session is the newest anonymous account in the auth emulator (the seed
// wipes auth, and the flow's own launch just signed in).
// env: HOUSE_ID, APPLICANT_NAME. Sets output.applicationId and output.uid.
const AUTH = 'http://127.0.0.1:9099/identitytoolkit.googleapis.com/v1/projects/demo-regroup-e2e';
const FS = 'http://127.0.0.1:8080/v1/projects/demo-regroup-e2e/databases/(default)/documents';
const headers = { Authorization: 'Bearer owner', 'Content-Type': 'application/json' };

const users =
  (json(http.post(AUTH + '/accounts:query', { headers: headers, body: '{}' }).body) || {})
    .userInfo || [];
const anon = users
  .filter(function (u) {
    return !u.email && !(u.providerUserInfo && u.providerUserInfo.length);
  })
  .sort(function (a, b) {
    return Number(b.createdAt) - Number(a.createdAt);
  })[0];
if (!anon) throw new Error('no anonymous session in the auth emulator');

const id = HOUSE_ID + '_' + anon.localId;
const now = new Date().toISOString();
const str = function (v) {
  return { stringValue: v };
};
const res = http.post(FS + '/houses/' + HOUSE_ID + '/applications?documentId=' + id, {
  headers: headers,
  body: JSON.stringify({
    fields: {
      id: str(id),
      houseId: str(HOUSE_ID),
      applicantUid: str(anon.localId),
      applicantName: str(APPLICANT_NAME),
      applicantEmail: str('e2e-returning-applicant@rats-e2e.com'),
      applicantPhone: str(''),
      sobrietyDate: str(''),
      programType: str('AA'),
      currentSituation: str(''),
      references: str(''),
      status: str('pending'),
      createdAt: str(now),
      updatedAt: str(now),
    },
  }),
});
if (res.status >= 300) throw new Error('application write failed: ' + res.status);
output.applicationId = id;
output.uid = anon.localId;
