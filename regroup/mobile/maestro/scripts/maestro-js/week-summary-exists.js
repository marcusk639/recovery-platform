// Maestro runScript (host side): whether the functions emulator has written
// GUEST_ID's current-week summary yet (week-summaries/{guestId}_{weekStart},
// weekStart = this week's Monday in America/Chicago, the seeded house's zone).
// The seed's activities trigger it a few seconds after seeding. Emulator only.
// env: GUEST_ID. Sets output.weekSummaryExists.
const res = http.post(
  'http://127.0.0.1:8080/v1/projects/demo-regroup-e2e/databases/(default)/documents:runQuery',
  {
    headers: { Authorization: 'Bearer owner', 'Content-Type': 'application/json' },
    body: JSON.stringify({
      structuredQuery: {
        from: [{ collectionId: 'week-summaries' }],
        where: {
          fieldFilter: {
            field: { fieldPath: 'guestId' },
            op: 'EQUAL',
            value: { stringValue: GUEST_ID },
          },
        },
      },
    }),
  },
);
const rows = json(res.body) || [];
output.weekSummaryExists = rows.some(function (r) {
  return !!r.document;
});
