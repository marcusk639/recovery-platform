import { bmltMeetingId } from '../identity';
import {
  BMLT_FIELDS,
  isServiceMeeting,
  mapBmltMeeting,
  meetingFingerprint,
  type BmltRegion,
} from './bmlt';

const REGION: BmltRegion = {
  id: 1,
  sourceId: 100,
  name: 'Texas',
  expectedMeetings: 1,
  lastSuccessfulImport: null,
};

const row = (over: Record<string, unknown> = {}) => ({
  source_id: 12257,
  meeting_name: 'Sunday Solutions',
  weekday_tinyint: '1',
  start_time: '19:30:00',
  venue_type: '1',
  formats: 'O,WC',
  latitude: '33.04',
  longitude: '-96.99',
  virtual_meeting_link: '',
  phone_meeting_number: '',
  location_street: '1 Main St',
  location_municipality: 'Dallas',
  location_province: 'TX',
  location_postal_code_1: '75001',
  time_zone: 'America/Chicago',
  published: '1',
  ...over,
});

test('maps BMLT weekday 1-7 to directory day 0-6', () => {
  expect(mapBmltMeeting(row({ weekday_tinyint: '1' }), REGION)!.day).toBe('sunday');
  expect(mapBmltMeeting(row({ weekday_tinyint: '2' }), REGION)!.day).toBe('monday');
  expect(mapBmltMeeting(row({ weekday_tinyint: '7' }), REGION)!.day).toBe('saturday');
  expect(mapBmltMeeting(row({ weekday_tinyint: '0' }), REGION)).toBeNull();
  expect(mapBmltMeeting(row({ weekday_tinyint: '8' }), REGION)).toBeNull();
});

test('maps a full in-person row', () => {
  expect(mapBmltMeeting(row(), REGION)).toMatchObject({
    source: 'external',
    provider: 'NA',
    type: 'NA',
    name: 'Sunday Solutions',
    time: '19:30',
    format: 'O,WC',
    timezone: 'America/Chicago',
    online: false,
    externalId: '100:12257',
    sourceRegion: '100',
    location: {
      address: '1 Main St',
      city: 'Dallas',
      state: 'TX',
      zip: '75001',
      lat: 33.04,
      lng: -96.99,
    },
  });
});

test('id comes from the region and its own meeting id', () => {
  expect(mapBmltMeeting(row(), REGION)!.id).toBe(bmltMeetingId(100, 12257));
});

test('editing a meeting keeps its id', () => {
  const id = mapBmltMeeting(row(), REGION)!.id;
  const edited = row({
    meeting_name: 'Renamed Group',
    weekday_tinyint: '4',
    start_time: '08:00:00',
    location_street: '2 Oak Ave',
    virtual_meeting_link: 'https://zoom.us/j/9',
  });
  expect(mapBmltMeeting(edited, REGION)!.id).toBe(id);
});

test('the same source_id in two regions gets two ids', () => {
  const other = { ...REGION, sourceId: 101 };
  expect(mapBmltMeeting(row(), other)!.id).not.toBe(mapBmltMeeting(row(), REGION)!.id);
});

describe('meetingFingerprint', () => {
  const fingerprint = (over: Record<string, unknown>) =>
    meetingFingerprint(mapBmltMeeting(row(over), REGION)!);

  test('ignores case and spacing', () => {
    expect(fingerprint({ meeting_name: 'SUNDAY   solutions', location_street: '1 MAIN ST' })).toBe(
      fingerprint({}),
    );
  });

  test.each([
    ['name', { meeting_name: 'Other Group' }],
    ['day', { weekday_tinyint: '2' }],
    ['time', { start_time: '20:00:00' }],
    ['link', { virtual_meeting_link: 'https://zoom.us/j/1' }],
    ['street', { location_street: '2 Oak Ave' }],
    ['city', { location_municipality: 'Austin' }],
  ])('differs when the %s differs', (_label, over) => {
    expect(fingerprint(over)).not.toBe(fingerprint({}));
  });

  test('uses coordinates when there is no street, since a blank street proves nothing', () => {
    const here = { location_street: '', latitude: '33.040', longitude: '-96.990' };
    const nearby = { location_street: '', latitude: '33.0401', longitude: '-96.9901' };
    const elsewhere = { location_street: '', latitude: '30.27', longitude: '-97.74' };
    expect(fingerprint(nearby)).toBe(fingerprint(here));
    expect(fingerprint(elsewhere)).not.toBe(fingerprint(here));
  });
});

test.each([
  ['blank name', { meeting_name: '  ' }],
  ['no source id', { source_id: undefined }],
  ['blank source id', { source_id: '' }],
  ['bad time', { start_time: 'noon' }],
  ['missing coords', { latitude: '' }],
  ['0,0 coords', { latitude: '0', longitude: '0' }],
  ['out-of-range coords', { latitude: '999' }],
  ['unpublished', { published: '0' }],
  ['virtual with no way to join', { venue_type: '2' }],
  ['closed facility with no way to join', { venue_type: '', formats: 'W,TC' }],
])('skips %s', (_label, over) => {
  expect(mapBmltMeeting(row(over), REGION)).toBeNull();
});

test('excludes service meetings but keeps recovery meetings', () => {
  expect(mapBmltMeeting(row({ formats: 'HY,ASM' }), REGION)).toBeNull();
  expect(mapBmltMeeting(row({ formats: 'O,D,ASM' }), REGION)).toBeNull();
  expect(
    mapBmltMeeting(row({ meeting_name: 'Public Relations Subcommittee Meeting' }), REGION),
  ).toBeNull();
  expect(
    mapBmltMeeting(row({ meeting_name: 'Activities Sub Committee Meeting' }), REGION),
  ).toBeNull();
  expect(
    mapBmltMeeting(row({ meeting_name: 'LDA Public Information Committee Monthly' }), REGION),
  ).toBeNull();
  expect(mapBmltMeeting(row({ meeting_name: 'Area Service Meeting' }), REGION)).toBeNull();
  expect(mapBmltMeeting(row({ meeting_name: 'Newcomers Workshop' }), REGION)).not.toBeNull();
  expect(mapBmltMeeting(row({ meeting_name: 'Spirit & Service' }), REGION)).not.toBeNull();
});

test('isServiceMeeting trims format codes', () => {
  expect(isServiceMeeting(row({ formats: 'O, ASM ' }))).toBe(true);
  expect(isServiceMeeting(row({ formats: 'CASM' }))).toBe(false);
});

test('online reflects venue type', () => {
  const link = 'https://zoom.us/j/1';
  expect(mapBmltMeeting(row({ venue_type: '2', virtual_meeting_link: link }), REGION)!.online).toBe(
    true,
  );
  expect(mapBmltMeeting(row({ venue_type: '3', virtual_meeting_link: link }), REGION)!.online).toBe(
    true,
  );
  expect(mapBmltMeeting(row({ venue_type: '' }), REGION)!.online).toBe(false);
  expect(mapBmltMeeting(row({ venue_type: '', virtual_meeting_link: link }), REGION)!.online).toBe(
    true,
  );
});

test('keeps only http(s) links and turns a phone number into notes', () => {
  expect(
    mapBmltMeeting(row({ virtual_meeting_link: 'javascript:alert(1)' }), REGION)!.link,
  ).toBeUndefined();
  expect(mapBmltMeeting(row({ virtual_meeting_link: 'virtually' }), REGION)!.link).toBeUndefined();
  expect(mapBmltMeeting(row({ virtual_meeting_link: 'http://x.org/m' }), REGION)!.link).toBe(
    'http://x.org/m',
  );
  const dial = mapBmltMeeting(
    row({ venue_type: '2', phone_meeting_number: '+15551230000' }),
    REGION,
  )!;
  expect(dial.onlineNotes).toBe('Dial-in: +15551230000');
});

test('omits empty optional fields, which Firestore would reject as undefined', () => {
  const m = mapBmltMeeting(
    row({ time_zone: '', formats: '', location_street: '', location_postal_code_1: '' }),
    REGION,
  )!;
  expect(Object.values(m)).not.toContain(undefined);
  expect(Object.values(m.location)).not.toContain(undefined);
  expect(m).not.toHaveProperty('timezone');
  expect(m).not.toHaveProperty('format');
  expect(m.location).not.toHaveProperty('address');
  expect(m).not.toHaveProperty('link');
});

test('private fields never appear in the output', () => {
  const m = mapBmltMeeting(
    row({ contact_name_1: 'A', contact_email_1: 'a@b.c', comments: 'x', admin_notes: 'y' }),
    REGION,
  );
  const json = JSON.stringify(m);
  ['a@b.c', 'contact', 'comments', 'admin_notes'].forEach((s) => expect(json).not.toContain(s));
  ['contact', 'comments', 'admin_notes', 'email', 'additional_info'].forEach((s) =>
    expect(BMLT_FIELDS.join()).not.toContain(s),
  );
});
