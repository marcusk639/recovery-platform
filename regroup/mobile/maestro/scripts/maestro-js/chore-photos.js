// Maestro runScript (host side): lists the chore photos in the local Storage
// emulator under houses/HOUSE_ID/chore-evidence/USER_ID/ (storage.rules, S5),
// and reads whether USER_ID's newest chore activity carries a photoUrl that
// points there. Emulator only.
// env: HOUSE_ID, USER_ID. Sets output.photoCount and output.activityHasPhoto.
const prefix = 'houses/' + HOUSE_ID + '/chore-evidence/' + USER_ID + '/';
const list = http.get(
  'http://127.0.0.1:9199/v0/b/demo-regroup-e2e.appspot.com/o?prefix=' + encodeURIComponent(prefix),
  { headers: { Authorization: 'Bearer owner' } },
);
output.photoCount = ((json(list.body) || {}).items || []).length;

const res = http.post(
  'http://127.0.0.1:8080/v1/projects/demo-regroup-e2e/databases/(default)/documents:runQuery',
  {
    headers: { Authorization: 'Bearer owner', 'Content-Type': 'application/json' },
    body: JSON.stringify({
      structuredQuery: {
        from: [{ collectionId: 'activities' }],
        where: {
          compositeFilter: {
            op: 'AND',
            filters: [
              {
                fieldFilter: {
                  field: { fieldPath: 'loggedBy' },
                  op: 'EQUAL',
                  value: { stringValue: USER_ID },
                },
              },
              {
                fieldFilter: {
                  field: { fieldPath: 'type' },
                  op: 'EQUAL',
                  value: { stringValue: 'chore' },
                },
              },
            ],
          },
        },
      },
    }),
  },
);
const docs = (json(res.body) || []).filter(function (r) {
  return r.document;
});
output.activityHasPhoto = docs.some(function (r) {
  const data = ((r.document.fields || {}).data || {}).mapValue || {};
  const url = ((data.fields || {}).photoUrl || {}).stringValue || '';
  return url.indexOf(encodeURIComponent(prefix)) >= 0;
});
