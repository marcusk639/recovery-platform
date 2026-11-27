// Maestro runScript (host side): signs in to the local Auth emulator as the
// seeded demo account (its password is in the app) and checks what the server
// refuses it (S5): a costly callable (createInvitation) and a Storage upload.
// Emulator only: demo-regroup-e2e on 127.0.0.1.
// Sets output.signedIn, output.inviteStatus, output.inviteMessage,
// output.uploadStatus.
const signIn = http.post(
  'http://127.0.0.1:9099/identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=e2e',
  {
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      email: 'demo_user@appdemo.net',
      password: 'DemoUser1',
      returnSecureToken: true,
    }),
  },
);
const idToken = (json(signIn.body) || {}).idToken || '';
output.signedIn = idToken.length > 0;

const invite = http.post('http://127.0.0.1:5001/demo-regroup-e2e/us-central1/createInvitation', {
  headers: { Authorization: 'Bearer ' + idToken, 'Content-Type': 'application/json' },
  body: JSON.stringify({
    data: { houseId: 'test-house-demo', role: 'guest', email: 'e2e-demo-invitee@rats-e2e.com' },
  }),
});
const inviteError = (json(invite.body) || {}).error || {};
output.inviteStatus = inviteError.status || String(invite.status);
output.inviteMessage = inviteError.message || '';

const upload = http.post(
  'http://127.0.0.1:9199/v0/b/demo-regroup-e2e.appspot.com/o?name=' +
    encodeURIComponent('users/e2e-demo-user/avatar'),
  {
    headers: { Authorization: 'Firebase ' + idToken, 'Content-Type': 'image/png' },
    body: 'not-really-a-png',
  },
);
output.uploadStatus = String(upload.status);
