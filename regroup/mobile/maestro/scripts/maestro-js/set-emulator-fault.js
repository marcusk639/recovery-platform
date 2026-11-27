// Maestro runScript (host side): switches an e2e fault on or off in the local
// Firestore emulator (e2e/faults.<FAULT>), for billing-catalog-unavailable.yaml.
// The functions honour it only in the Functions emulator running
// demo-regroup-e2e (regroup/functions/src/util/emulatorFaults.ts); deployed
// functions never read it. Emulator only: loopback host, demo- project.
// env: FAULT (e.g. tierCatalogUnavailable), ON ('true'|'false'). Sets output.faultSet.
// No computed object keys: keep to the ES5 the other maestro-js scripts use.
const fields = {};
fields[FAULT] = { booleanValue: ON === 'true' };
const res = http.request(
  'http://127.0.0.1:8080/v1/projects/demo-regroup-e2e/databases/(default)/documents/e2e/faults' +
    '?updateMask.fieldPaths=' +
    FAULT,
  {
    method: 'PATCH',
    headers: { Authorization: 'Bearer owner', 'Content-Type': 'application/json' },
    body: JSON.stringify({ fields: fields }),
  },
);
output.faultSet = res.ok ? FAULT + '=' + ON : 'failed ' + res.status;
