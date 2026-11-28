// Maestro runScript (host side): signs in to the auth emulator as EMAIL and
// tries to read HOUSE_ID's applications through the security rules: the one
// with id APP_ID and the house's list. Emulator only. Logs nothing.
// env: EMAIL, PASSWORD, HOUSE_ID, APP_ID. Sets output.docStatus and
// output.listStatus (HTTP status codes: 200 allowed, 403 refused).
const PROJECT = 'demo-regroup-e2e';
const signIn = http.post(
  'http://127.0.0.1:9099/identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=e2e',
  {
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: EMAIL, password: PASSWORD, returnSecureToken: true }),
  },
);
const token = (json(signIn.body) || {}).idToken;
if (!token) throw new Error('sign-in failed: ' + signIn.status);

const FS = 'http://127.0.0.1:8080/v1/projects/' + PROJECT + '/databases/(default)/documents';
const auth = { headers: { Authorization: 'Bearer ' + token } };
output.docStatus = http.get(FS + '/houses/' + HOUSE_ID + '/applications/' + APP_ID, auth).status;
output.listStatus = http.get(FS + '/houses/' + HOUSE_ID + '/applications', auth).status;
