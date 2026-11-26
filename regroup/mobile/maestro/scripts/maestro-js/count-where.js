// Maestro runScript (host side): counts the documents in the local Firestore
// emulator's COLLECTION whose FIELD equals the string VALUE. With PARENT
// (e.g. houses/test-house-123) it searches that document's subcollection.
// Emulator only. env: COLLECTION, FIELD, VALUE, optional PARENT.
// Sets output.count.
const parent = typeof PARENT === 'undefined' || !PARENT ? '' : '/' + PARENT;
const res = http.post(
  'http://127.0.0.1:8080/v1/projects/demo-regroup-e2e/databases/(default)/documents' +
    parent +
    ':runQuery',
  {
    headers: { Authorization: 'Bearer owner', 'Content-Type': 'application/json' },
    body: JSON.stringify({
      structuredQuery: {
        from: [{ collectionId: COLLECTION }],
        where: {
          fieldFilter: {
            field: { fieldPath: FIELD },
            op: 'EQUAL',
            value: { stringValue: VALUE },
          },
        },
      },
    }),
  },
);
const rows = json(res.body) || [];
output.count = rows.filter(function (r) {
  return r.document;
}).length;
