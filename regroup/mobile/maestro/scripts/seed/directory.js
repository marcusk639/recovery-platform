#!/usr/bin/env node
/**
 * Seeds fake meetings into the local recovery-api emulator, so the meeting finder
 * has a directory to search without touching the real one. Near both places a
 * simulator usually is: Austin (the seed's houses) and Cupertino (the iOS default).
 * Run by test-prep.sh and reset-and-seed.sh when the emulator is up.
 */
const hash = require('ngeohash');

const CENTERS = [
  { name: 'Austin', city: 'Austin', state: 'TX', zip: '78701', lat: 30.2672, lng: -97.7431 },
  { name: 'Cupertino', city: 'Cupertino', state: 'CA', zip: '95014', lat: 37.3349, lng: -122.009 },
];
const PROVIDERS = ['AA', 'NA', 'CELEBRATE_RECOVERY'];
const TIMES = ['07:00', '12:00', '19:00'];

// A fixed emulator, never an env-derived host: this script can't reach anything else.
const directoryTarget = { host: '127.0.0.1:8082', projectId: 'demo-recovery-api' };

const directoryDocPath = (id) =>
  `http://${directoryTarget.host}/v1/projects/${directoryTarget.projectId}/databases/(default)/documents/directoryMeetings/${id}`;

function directoryMeetings() {
  const meetings = [];
  CENTERS.forEach((center, c) => {
    PROVIDERS.forEach((provider, p) => {
      for (let day = 0; day < 7; day++) {
        const lat = center.lat + 0.002 * (p + 1);
        const lng = center.lng + 0.002 * (day + 1);
        meetings.push({
          id: `e2e-${center.name.toLowerCase()}-${provider.toLowerCase()}-${day}`,
          source: 'external',
          provider,
          name: `E2E ${provider} ${center.name} Group`,
          day,
          time: TIMES[(c + p + day) % TIMES.length],
          format: 'in-person',
          online: false,
          timezone: center.name === 'Austin' ? 'America/Chicago' : 'America/Los_Angeles',
          location: {
            address: `${100 + p} Test St`,
            city: center.city,
            state: center.state,
            zip: center.zip,
            lat,
            lng,
            geohash: hash.encode(lat, lng, 10),
          },
        });
      }
    });
  });
  return meetings;
}

function toFirestoreValue(value) {
  if (typeof value === 'string') return { stringValue: value };
  if (typeof value === 'boolean') return { booleanValue: value };
  if (Number.isInteger(value)) return { integerValue: String(value) };
  if (typeof value === 'number') return { doubleValue: value };
  return { mapValue: { fields: toFirestoreFields(value) } };
}

function toFirestoreFields(object) {
  return Object.fromEntries(Object.entries(object).map(([k, v]) => [k, toFirestoreValue(v)]));
}

async function seedDirectory() {
  const meetings = directoryMeetings();
  for (const meeting of meetings) {
    const res = await fetch(directoryDocPath(meeting.id), {
      method: 'PATCH',
      headers: { 'content-type': 'application/json', authorization: 'Bearer owner' },
      body: JSON.stringify({ fields: toFirestoreFields(meeting) }),
    });
    if (!res.ok) throw new Error(`seeding ${meeting.id} failed: ${res.status}`);
  }
  return meetings.length;
}

if (require.main === module) {
  seedDirectory()
    .then((count) => console.log(`Seeded ${count} meetings into the local directory.`))
    .catch((err) => {
      console.error(err.message);
      process.exit(1);
    });
}

module.exports = { CENTERS, directoryDocPath, directoryMeetings, directoryTarget, seedDirectory };
