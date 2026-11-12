// Maestro runScript (host side), device pass (#160) row 8: a DST boundary
// under Hermes Intl. Finds the host zone's last two DST changes and, with
// ACTION=add, writes four complaints to the seeded house dated 90 minutes
// before and after each one, through the local Firestore emulator (emulator
// only: the demo- project never reaches a real one). ACTION=remove deletes them.
// The Complaints screen formats createdAt with util/display.tsx getDateAndTime
// ('EEEE, MMMM do yyyy hh:mm a' in the device's zone); the simulator and the
// emulator use the host's zone, as does this script, so each output.expectedN
// is the exact text the device must show. A device that applies one UTC offset
// all year shows a time an hour off for one of each pair.
// env: ACTION (add | remove), NOW_MS (tests only). Sets output.dstFound and
// output.expected1..4 (most recent change first, before then after).
var HOUSE = 'test-house-123';
var DOCS = 'projects/demo-regroup-e2e/databases/(default)/documents';
var COMMIT = 'http://127.0.0.1:8080/v1/' + DOCS + ':commit';
var KEYS = ['e2eDst1', 'e2eDst2', 'e2eDst3', 'e2eDst4'];
var HOUR = 3600000;
var DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
var MONTHS = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
];

function offsetAt(ms) {
  return new Date(ms).getTimezoneOffset();
}

// The last `count` instants before `now` at which the host zone's offset changed.
function lastChanges(now, count) {
  var found = [];
  var t = Math.floor(now / HOUR) * HOUR;
  for (var i = 0; i < 24 * 400 && found.length < count; i++, t -= HOUR) {
    if (offsetAt(t) === offsetAt(t - HOUR)) continue;
    var lo = t - HOUR;
    var hi = t;
    while (hi - lo > 1000) {
      var mid = Math.floor((lo + hi) / 2);
      if (offsetAt(mid) === offsetAt(lo)) lo = mid;
      else hi = mid;
    }
    found.push(hi);
  }
  return found;
}

function ordinal(n) {
  if (n % 100 >= 11 && n % 100 <= 13) return n + 'th';
  return n + ({ 1: 'st', 2: 'nd', 3: 'rd' }[n % 10] || 'th');
}

function pad(n) {
  return (n < 10 ? '0' : '') + n;
}

function display(ms) {
  var d = new Date(ms);
  var h = d.getHours();
  return (
    DAYS[d.getDay()] +
    ', ' +
    MONTHS[d.getMonth()] +
    ' ' +
    ordinal(d.getDate()) +
    ' ' +
    d.getFullYear() +
    ' ' +
    pad(h % 12 || 12) +
    ':' +
    pad(d.getMinutes()) +
    ' ' +
    (h >= 12 ? 'PM' : 'AM')
  );
}

function str(v) {
  return { stringValue: v };
}

function commit(fields) {
  var res = http.post(COMMIT, {
    headers: { Authorization: 'Bearer owner', 'Content-Type': 'application/json' },
    body: JSON.stringify({
      writes: [
        {
          update: { name: DOCS + '/houses/' + HOUSE, fields: fields },
          updateMask: {
            fieldPaths: KEYS.map(function (k) {
              return 'complaints.' + k;
            }),
          },
          currentDocument: fields.complaints ? { exists: true } : undefined,
        },
      ],
    }),
  });
  if (!res.ok) {
    throw new Error('Firestore emulator commit failed: ' + res.status + ' ' + res.body);
  }
}

function main() {
  var now = typeof NOW_MS !== 'undefined' && NOW_MS ? Number(NOW_MS) : Date.now();
  if (ACTION === 'remove') {
    commit({});
    return;
  }
  var changes = lastChanges(now, 2);
  output.dstFound = changes.length === 2;
  if (!output.dstFound) return;

  var instants = [];
  changes.forEach(function (c) {
    instants.push(c - 1.5 * HOUR, c + 1.5 * HOUR);
  });
  var complaints = {};
  instants.forEach(function (ms, i) {
    output['expected' + (i + 1)] = display(ms);
    complaints[KEYS[i]] = {
      mapValue: {
        fields: {
          id: str(KEYS[i]),
          description: str('DST check ' + (i + 1)),
          plaintiff: str(''),
          plaintiffType: str('anonymous'),
          reply: str(''),
          houseId: str(HOUSE),
          createdAt: str(new Date(ms).toISOString()),
        },
      },
    };
  });
  commit({ complaints: { mapValue: { fields: complaints } } });
}

main();
