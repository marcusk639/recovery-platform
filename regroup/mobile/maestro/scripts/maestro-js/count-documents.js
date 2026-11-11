// Maestro runScript (host side): counts the documents in the local Firestore
// emulator whose fileName is FILE_NAME (documents collection, written by
// services/documents.ts uploadDocument). Emulator only.
// env: FILE_NAME. Sets output.documentCount.
const res = http.post(
  'http://127.0.0.1:8080/v1/projects/demo-regroup-e2e/databases/(default)/documents:runQuery',
  {
    headers: { Authorization: 'Bearer owner', 'Content-Type': 'application/json' },
    body: JSON.stringify({
      structuredQuery: {
        from: [{ collectionId: 'documents' }],
        where: {
          fieldFilter: {
            field: { fieldPath: 'fileName' },
            op: 'EQUAL',
            value: { stringValue: FILE_NAME },
          },
        },
      },
    }),
  },
);
const rows = json(res.body) || [];
output.documentCount = rows.filter(function (r) {
  return r.document;
}).length;
