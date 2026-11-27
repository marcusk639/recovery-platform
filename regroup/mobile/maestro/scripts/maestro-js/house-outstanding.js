// Maestro runScript (host side): what the current residents of HOUSE_ID owe
// now, from the guests in the local Firestore emulator, computed the way the
// Payments and Balances screens define it (util/paymentDisplay.ts): each
// resident not discharged or archived owes max(0, rentOwed + choreFees) cents.
// Emulator only. env: HOUSE_ID. Sets output.outstanding, e.g. "$150.00", and
// output.outstandingPattern, the same as a Maestro text regex ("\\$150\\.00").
const res = http.post(
  'http://127.0.0.1:8080/v1/projects/demo-regroup-e2e/databases/(default)/documents:runQuery',
  {
    headers: { Authorization: 'Bearer owner', 'Content-Type': 'application/json' },
    body: JSON.stringify({
      structuredQuery: {
        from: [{ collectionId: 'guests' }],
        where: {
          fieldFilter: {
            field: { fieldPath: 'houseId' },
            op: 'EQUAL',
            value: { stringValue: HOUSE_ID },
          },
        },
      },
    }),
  },
);
function num(v) {
  if (!v) return 0;
  if (v.integerValue !== undefined) return Number(v.integerValue);
  if (v.doubleValue !== undefined) return Number(v.doubleValue);
  return 0;
}
const rows = json(res.body) || [];
let cents = 0;
rows.forEach(function (r) {
  if (!r.document) return;
  const f = r.document.fields || {};
  const status = f.status && f.status.stringValue;
  if (status === 'discharged' || status === 'archived') return;
  cents += Math.max(0, num(f.rentOwed) + num(f.choreFees));
});
output.outstanding = '$' + (cents / 100).toFixed(2);
output.outstandingPattern = output.outstanding.replace(/[$.]/g, '\\$&');
