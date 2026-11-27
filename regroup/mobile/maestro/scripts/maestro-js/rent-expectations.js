// Maestro runScript (host side) for operator-rent-setup.yaml: what the weekly
// $175.00 rent rule must charge today in the seeded house (America/Chicago),
// computed here with the same formula as functions src/rent/chargeRule.ts
// (rate x days covered / days in the week, Monday to Sunday, rounded to the
// cent), and the intake resident's record from the local Firestore emulator.
// Emulator only: the demo- project never reaches a real one.
// env: EMAIL (the intake resident), RATE_CENTS (default 17500), NOW_MS (tests).
// Sets output.nextMonday ("Mon, Nov 30"), output.expectedCents and
// output.expectedDollars ("125.00"), and, when the record exists,
// output.guestId, output.rentOwed, output.customRentCents and
// output.customRentFrequency ('' when absent).
var DAY = 86400000;
var DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
var MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

// US Central time: CDT (UTC-5) from 2:00 on the second Sunday of March to 2:00
// on the first Sunday of November, CST (UTC-6) otherwise. Maestro's JS engine
// has no Intl time zones, so the rule is written out.
function nthSunday(year, month, n) {
  var first = new Date(Date.UTC(year, month, 1)).getUTCDay();
  return 1 + ((7 - first) % 7) + (n - 1) * 7;
}
function chicagoOffsetHours(ms) {
  var y = new Date(ms).getUTCFullYear();
  var start = Date.UTC(y, 2, nthSunday(y, 2, 2), 8); // 2:00 CST = 08:00 UTC
  var end = Date.UTC(y, 10, nthSunday(y, 10, 1), 7); // 2:00 CDT = 07:00 UTC
  return ms >= start && ms < end ? -5 : -6;
}
function chicagoDay(ms) {
  var local = new Date(ms + chicagoOffsetHours(ms) * 3600000);
  return {
    y: local.getUTCFullYear(),
    m: local.getUTCMonth(),
    d: local.getUTCDate(),
    dow: local.getUTCDay(),
  };
}

var nowMs = typeof NOW_MS !== 'undefined' && NOW_MS ? Number(NOW_MS) : Date.now();
var rate = typeof RATE_CENTS !== 'undefined' && RATE_CENTS ? Number(RATE_CENTS) : 17500;
var today = chicagoDay(nowMs);
// Days from today through Sunday, inclusive (the move-in day counts).
var daysCovered = today.dow === 0 ? 1 : 8 - today.dow;
var cents = Math.round((rate * daysCovered) / 7);
var mondayMs = Date.UTC(today.y, today.m, today.d) + (today.dow === 0 ? 1 : 8 - today.dow) * DAY;
var monday = new Date(mondayMs);
output.nextMonday =
  DAYS[monday.getUTCDay()] + ', ' + MONTHS[monday.getUTCMonth()] + ' ' + monday.getUTCDate();
output.expectedCents = cents;
output.expectedDollars = (cents / 100).toFixed(2);
output.daysCovered = daysCovered;

output.guestId = '';
output.rentOwed = -1;
output.customRentCents = -1;
output.customRentFrequency = '';
if (typeof EMAIL !== 'undefined' && EMAIL) {
  var res = http.post(
    'http://127.0.0.1:8080/v1/projects/demo-regroup-e2e/databases/(default)/documents:runQuery',
    {
      headers: { Authorization: 'Bearer owner', 'Content-Type': 'application/json' },
      body: JSON.stringify({
        structuredQuery: {
          from: [{ collectionId: 'guests' }],
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
  var rows = (json(res.body) || []).filter(function (r) {
    return r.document;
  });
  if (rows.length > 0) {
    var doc = rows[0].document;
    var f = doc.fields || {};
    output.guestId = doc.name.split('/').pop();
    var owed = f.rentOwed || {};
    output.rentOwed = Number(
      owed.integerValue !== undefined ? owed.integerValue : owed.doubleValue,
    );
    var custom = (f.customRent && f.customRent.mapValue && f.customRent.mapValue.fields) || null;
    if (custom) {
      output.customRentCents = Number(custom.amountCents.integerValue);
      output.customRentFrequency = custom.frequency.stringValue;
    }
  }
}
