// Maestro runScript (host side): reads one activity's timestamp from the local
// Firestore emulator and formats it the way util/display.tsx getDateAndTime
// does ('EEEE, MMMM do yyyy hh:mm a'), in the host's zone. Emulator only.
// env: ACTIVITY_ID. Sets output.expectedTime ('' when the timestamp is missing).
const url =
  'http://127.0.0.1:8080/v1/projects/demo-regroup-e2e/databases/(default)/documents/activities/' +
  ACTIVITY_ID;
const res = http.get(url, { headers: { Authorization: 'Bearer owner' } });
const fields = (json(res.body) || {}).fields || {};
const iso = fields.timestamp ? fields.timestamp.timestampValue : '';
const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August',
  'September', 'October', 'November', 'December'];
function ordinal(n) {
  if (n % 100 >= 11 && n % 100 <= 13) return n + 'th';
  return n + ({ 1: 'st', 2: 'nd', 3: 'rd' }[n % 10] || 'th');
}
function pad(n) {
  return (n < 10 ? '0' : '') + n;
}
if (iso) {
  const d = new Date(iso);
  const h = d.getHours();
  output.expectedTime =
    DAYS[d.getDay()] + ', ' + MONTHS[d.getMonth()] + ' ' + ordinal(d.getDate()) + ' ' +
    d.getFullYear() + ' ' + pad(h % 12 || 12) + ':' + pad(d.getMinutes()) + ' ' +
    (h >= 12 ? 'PM' : 'AM');
} else {
  output.expectedTime = '';
}
