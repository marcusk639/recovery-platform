// Maestro runScript (runs on the host, in Maestro's JS engine): reads one
// activity from the local Firestore emulator so a flow can assert what it
// wrote. Emulator only: the demo- project never reaches a real one.
// env: ACTIVITY_ID. Sets output.activityStatus and output.activityReason.
const url =
  'http://127.0.0.1:8080/v1/projects/demo-regroup-e2e/databases/(default)/documents/activities/' +
  ACTIVITY_ID;
const res = http.get(url, { headers: { Authorization: 'Bearer owner' } });
const fields = (json(res.body) || {}).fields || {};
output.activityStatus = fields.status ? fields.status.stringValue : 'missing';
output.activityReason = fields.disputeReason ? fields.disputeReason.stringValue : '';
