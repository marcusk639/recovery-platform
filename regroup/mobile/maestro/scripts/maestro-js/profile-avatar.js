// Maestro runScript (host side): whether USER_ID's avatar is in the local
// Storage emulator at users/USER_ID/avatar (storage.rules: the owner's own
// file), and whether the users and guests docs hold a download URL for it
// rather than a path on the phone. Emulator only.
// env: USER_ID, GUEST_ID, RESET (optional). Sets output.fileStored, output.userHasUrl,
// output.guestHasUrl and output.userAvatarIsLocal.
const path = 'users/' + USER_ID + '/avatar';
const objectUrl =
  'http://127.0.0.1:9199/v0/b/demo-regroup-e2e.appspot.com/o/' + encodeURIComponent(path);
// The seed resets Firestore and Auth, not Storage: RESET=true first deletes a
// photo an earlier run left, so the flow starts with none.
if (typeof RESET !== 'undefined' && RESET === 'true') {
  http.delete(objectUrl, { headers: { Authorization: 'Bearer owner' } });
}
const meta = http.get(objectUrl, { headers: { Authorization: 'Bearer owner' } });
output.fileStored = meta.status === 200;

function avatarOf(collection, id) {
  const res = http.get(
    'http://127.0.0.1:8080/v1/projects/demo-regroup-e2e/databases/(default)/documents/' +
      collection +
      '/' +
      id,
    { headers: { Authorization: 'Bearer owner' } },
  );
  const fields = (json(res.body) || {}).fields || {};
  return (fields.avatar || {}).stringValue || '';
}

function isUrlForFile(avatar) {
  return /^https?:\/\//.test(avatar) && avatar.indexOf(encodeURIComponent(path)) >= 0;
}

const userAvatar = avatarOf('users', USER_ID);
output.userHasUrl = isUrlForFile(userAvatar);
output.userAvatarIsLocal = userAvatar !== '' && !/^https?:\/\//.test(userAvatar);
output.guestHasUrl = isUrlForFile(avatarOf('guests', GUEST_ID));
