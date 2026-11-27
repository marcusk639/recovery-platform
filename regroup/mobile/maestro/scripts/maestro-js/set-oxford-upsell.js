// Maestro runScript (host side): puts the oxford operator in front of the Oxford
// upgrade card, and sets the sales switch the catalog reports, in the local
// Firestore emulator (billing-oxford-trial-from-catalog.yaml). Emulator only:
// loopback host, demo- project.
// env: OXFORD_ENABLED ('true'|'false', users/e2e-oxford-operator
// .subscriptionMetadata.oxfordEnabled), SALES_OPEN ('true'|'false', config/sales.open).
// Sets output.upsellSet to 'ok' or the failing status.
const BASE = 'http://127.0.0.1:8080/v1/projects/demo-regroup-e2e/databases/(default)/documents/';
const patch = (path, mask, fields) =>
  http.request(BASE + path + '?updateMask.fieldPaths=' + mask, {
    method: 'PATCH',
    headers: { Authorization: 'Bearer owner', 'Content-Type': 'application/json' },
    body: JSON.stringify({ fields: fields }),
  });

const user = patch('users/e2e-oxford-operator', 'subscriptionMetadata.oxfordEnabled', {
  subscriptionMetadata: {
    mapValue: { fields: { oxfordEnabled: { booleanValue: OXFORD_ENABLED === 'true' } } },
  },
});
const sales = patch('config/sales', 'open', { open: { booleanValue: SALES_OPEN === 'true' } });
output.upsellSet = user.ok && sales.ok ? 'ok' : 'failed ' + user.status + '/' + sales.status;
