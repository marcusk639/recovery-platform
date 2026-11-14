// Maestro runScript (runs on the host, in Maestro's JS engine): reads the users
// doc for EMAIL from the local Firestore emulator, so signup can prove the
// profile was written (#182). Emulator only: the demo- project never reaches a
// real one.
// env: EMAIL. Sets output.userDocCount, output.userFirstName and
// output.userTermsOfService.
const res = http.post(
  'http://127.0.0.1:8080/v1/projects/demo-regroup-e2e/databases/(default)/documents:runQuery',
  {
    headers: { Authorization: 'Bearer owner', 'Content-Type': 'application/json' },
    body: JSON.stringify({
      structuredQuery: {
        from: [{ collectionId: 'users' }],
        where: {
          fieldFilter: {
            field: { fieldPath: 'email' },
            op: 'EQUAL',
            value: { stringValue: EMAIL },
          },
        },
      },
    }),
  },
);
const docs = (json(res.body) || []).filter(function (r) {
  return r.document;
});
const fields = docs.length ? docs[0].document.fields || {} : {};
output.userDocCount = docs.length;
output.userFirstName = fields.firstName ? fields.firstName.stringValue : '';
output.userTermsOfService = fields.termsOfService
  ? fields.termsOfService.booleanValue === true
  : false;
