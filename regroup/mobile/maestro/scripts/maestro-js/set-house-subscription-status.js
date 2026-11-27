// Maestro runScript (host side): sets houses/<HOUSE_ID>.subscriptionStatus in
// the local Firestore emulator, standing in for the Stripe webhook after a web
// checkout (billing-hand-back.yaml). Emulator only: loopback host, demo- project.
// env: HOUSE_ID, STATUS. Sets output.statusSet.
const res = http.request(
  'http://127.0.0.1:8080/v1/projects/demo-regroup-e2e/databases/(default)/documents/houses/' +
    HOUSE_ID +
    '?updateMask.fieldPaths=subscriptionStatus',
  {
    method: 'PATCH',
    headers: { Authorization: 'Bearer owner', 'Content-Type': 'application/json' },
    body: JSON.stringify({ fields: { subscriptionStatus: { stringValue: STATUS } } }),
  },
);
output.statusSet = res.ok ? STATUS : 'failed ' + res.status;
