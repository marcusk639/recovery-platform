const hash = require('ngeohash');
const { CENTERS, directoryDocPath, directoryMeetings, directoryTarget } = require('../directory');

// recovery-api stores days as lowercase names.
const DAYS = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];

const distanceKm = (a, b) => {
  const toRad = (d) => (d * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 6371 * 2 * Math.asin(Math.sqrt(h));
};

describe('seeded meeting directory', () => {
  const meetings = directoryMeetings();

  it('has every provider on every day, near each simulator location', () => {
    for (const center of CENTERS) {
      for (const provider of ['AA', 'NA', 'CELEBRATE_RECOVERY']) {
        for (let day = 0; day < 7; day++) {
          const found = meetings.filter(
            (m) =>
              m.provider === provider && m.day === DAYS[day] && distanceKm(center, m.location) < 5,
          );
          expect(found.length).toBeGreaterThan(0);
        }
      }
    }
  });

  it('carries a geohash matching its coordinates, which the directory search ranges on', () => {
    for (const m of meetings) {
      expect(m.location.geohash).toBe(hash.encode(m.location.lat, m.location.lng, 10));
    }
  });

  it('has unique ids and is marked as fake data', () => {
    expect(new Set(meetings.map((m) => m.id)).size).toBe(meetings.length);
    for (const m of meetings) {
      expect(m.id).toMatch(/^e2e-/);
      expect(m.name).toMatch(/^E2E /);
    }
  });
});

describe('directoryTarget', () => {
  it('only ever writes to the local demo emulator', () => {
    expect(directoryDocPath('m1')).toBe(
      'http://127.0.0.1:8082/v1/projects/demo-recovery-api/databases/(default)/documents/directoryMeetings/m1',
    );
    expect(directoryTarget.host).toBe('127.0.0.1:8082');
    expect(directoryTarget.projectId).toMatch(/^demo-/);
  });
});
