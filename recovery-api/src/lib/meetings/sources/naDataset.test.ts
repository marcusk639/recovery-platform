import { mapNaMeeting, type NaDatasetDoc } from './naDataset';
import { directoryMeetingId } from '../identity';

// Hand-built `na-meetings` source doc — mirrors the persisted homegroups
// "serialized meeting" shape the pre-seeded collection conforms to: `day` is a
// weekday STRING, `time` is "HH:mm", lat/lng are numbers, `id` is the NA World
// Services id. Zero network / Firestore — this is a pure mapper.
const sampleDoc: NaDatasetDoc = {
  id: 'na-worldid-998877',
  name: 'Clean & Serene',
  day: 'tuesday',
  time: '19:30',
  lat: 30.267153,
  lng: -97.743057,
  geohash: 'stale-source-geohash',
  address: '500 Recovery Rd',
  city: 'Austin',
  state: 'TX',
  zip: '78701',
  formattedAddress: '500 Recovery Rd, Austin, TX 78701',
  format: 'Open, Discussion',
  type: 'NA',
  online: false,
  link: '',
  onlineNotes: '',
};

describe('mapNaMeeting', () => {
  it('maps a source na-meetings doc to a DirectoryMeeting (external/NA)', () => {
    const m = mapNaMeeting(sampleDoc);

    expect(m).not.toBeNull();
    expect(m!.provider).toBe('NA');
    expect(m!.source).toBe('external');
    expect(m!.name).toBe('Clean & Serene');
    expect(m!.externalId).toBe('na-worldid-998877');
    expect(m!.type).toBe('NA');
    expect(m!.format).toBe('Open, Discussion');
  });

  it('canonicalizes the weekday string to an integer day 0–6', () => {
    const m = mapNaMeeting(sampleDoc);

    expect(m!.day).toBe(2); // tuesday
    expect(Number.isInteger(m!.day)).toBe(true);
    expect(m!.day).toBeGreaterThanOrEqual(0);
    expect(m!.day).toBeLessThanOrEqual(6);
  });

  it('canonicalizes time to "HH:mm"', () => {
    const m = mapNaMeeting({ ...sampleDoc, time: '7:30 PM' });
    expect(m!.time).toBe('19:30');
  });

  it('derives a deterministic id via the frozen identity helper', () => {
    const m = mapNaMeeting(sampleDoc);

    const expectedId = directoryMeetingId({
      name: 'Clean & Serene',
      day: 2,
      time: '19:30',
      link: '',
      formattedAddress: '500 Recovery Rd, Austin, TX 78701',
    });
    expect(m!.id).toBe(expectedId);
  });

  it('re-derives a non-empty geohash from lat/lng (ignores stale source geohash)', () => {
    const m = mapNaMeeting(sampleDoc);

    expect(m!.location.lat).toBeCloseTo(30.267153);
    expect(m!.location.lng).toBeCloseTo(-97.743057);
    expect(typeof m!.location.geohash).toBe('string');
    expect(m!.location.geohash.length).toBeGreaterThan(0);
    expect(m!.location.geohash).not.toBe('stale-source-geohash');
    expect(m!.location.city).toBe('Austin');
    expect(m!.location.state).toBe('TX');
    expect(m!.location.zip).toBe('78701');
  });

  it('is idempotent: same input → same id', () => {
    const a = mapNaMeeting(sampleDoc);
    const b = mapNaMeeting({ ...sampleDoc });
    expect(a!.id).toBe(b!.id);
  });

  it('collapses equivalent day/time representations to the same id', () => {
    const a = mapNaMeeting(sampleDoc); // "tuesday" / "19:30"
    const b = mapNaMeeting({ ...sampleDoc, day: 2, time: '7:30 PM' });
    expect(a!.id).toBe(b!.id);
  });

  it('marks a meeting online and carries the link when online', () => {
    const m = mapNaMeeting({
      ...sampleDoc,
      online: true,
      link: 'https://zoom.us/j/123',
      onlineNotes: 'pwd: recovery',
    });

    expect(m!.online).toBe(true);
    expect(m!.link).toBe('https://zoom.us/j/123');
    expect(m!.onlineNotes).toBe('pwd: recovery');
  });

  it('falls back to address when formattedAddress is absent (id reflects it)', () => {
    const { formattedAddress: _omit, ...noFormatted } = sampleDoc;
    const m = mapNaMeeting(noFormatted);

    const expectedId = directoryMeetingId({
      name: 'Clean & Serene',
      day: 2,
      time: '19:30',
      link: '',
      formattedAddress: '500 Recovery Rd',
    });
    expect(m!.id).toBe(expectedId);
  });

  it('returns null for an unmappable row (missing name)', () => {
    const { name: _n, ...noName } = sampleDoc;
    expect(mapNaMeeting(noName as NaDatasetDoc)).toBeNull();
  });

  it('returns null for a bad day', () => {
    expect(mapNaMeeting({ ...sampleDoc, day: 'someday' })).toBeNull();
  });

  it('returns null for a bad time', () => {
    expect(mapNaMeeting({ ...sampleDoc, time: 'noon' })).toBeNull();
  });

  it('returns null for non-finite lat/lng', () => {
    expect(mapNaMeeting({ ...sampleDoc, lat: undefined })).toBeNull();
    expect(mapNaMeeting({ ...sampleDoc, lng: Number.NaN })).toBeNull();
  });
});
