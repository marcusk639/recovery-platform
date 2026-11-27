// Maestro runScript (host side): sets or clears the minimum app version that
// getAppConfig serves, in the local Firestore emulator only (the demo- project
// never reaches a real one). The functions emulator doesn't cache it, so the
// next launch sees the change. Production is set with
// `npm run switch:set -- --switch=minVersion` (regroup/functions).
// env: ACTION (set | clear), VALUE (with set: the version for both platforms).
var DOC = 'projects/demo-regroup-e2e/databases/(default)/documents/config/app';
var COMMIT =
  'http://127.0.0.1:8080/v1/projects/demo-regroup-e2e/databases/(default)/documents:commit';

function write(w) {
  var res = http.post(COMMIT, {
    headers: { Authorization: 'Bearer owner', 'Content-Type': 'application/json' },
    body: JSON.stringify({ writes: [w] }),
  });
  if (!res.ok) {
    throw new Error('Firestore emulator commit failed: ' + res.status + ' ' + res.body);
  }
}

if (ACTION === 'set') {
  if (!/^\d+\.\d+(\.\d+)?$/.test(VALUE)) {
    throw new Error('VALUE must be x.y or x.y.z, got ' + VALUE);
  }
  write({
    update: {
      name: DOC,
      fields: {
        minVersion: {
          mapValue: {
            fields: { ios: { stringValue: VALUE }, android: { stringValue: VALUE } },
          },
        },
      },
    },
  });
} else if (ACTION === 'clear') {
  write({ delete: DOC });
} else {
  throw new Error('ACTION must be set or clear, got ' + ACTION);
}
