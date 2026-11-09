import { fetchAAMeetings, mapMeetingGuideMeeting } from './meetingGuide';
import { directoryMeetingId } from '../identity';

describe('mapMeetingGuideMeeting', () => {
  it('keeps the timezone, which day and time mean nothing without', () => {
    const mapped = mapMeetingGuideMeeting({
      id: 1,
      name: 'Sunrise Group',
      day: 2,
      time: '07:00:00',
      latitude: '30.2',
      longitude: '-97.7',
      timezone: 'America/Chicago',
    });
    expect(mapped?.timezone).toBe('America/Chicago');
  });

  const base = {
    id: 1,
    name: 'Sunrise Group',
    day: 2,
    time: '07:00:00',
    latitude: '30.2',
    longitude: '-97.7',
  };

  it('drops an online suffix from a name, so both listings hash to one document', () => {
    const mapped = mapMeetingGuideMeeting({ ...base, name: 'Sunrise Group - Online' });
    expect(mapped?.name).toBe('Sunrise Group');
    expect(mapped?.id).toBe(mapMeetingGuideMeeting(base)?.id);
  });

  it.each(['Virtual', 'zoom', 'HYBRID', 'Online Meeting'])('drops the suffix " - %s"', (suffix) => {
    const mapped = mapMeetingGuideMeeting({ ...base, name: `Sunrise Group - ${suffix}` });
    expect(mapped?.name).toBe('Sunrise Group');
  });

  it('keeps a suffix that tells two meetings apart', () => {
    const men = mapMeetingGuideMeeting({ ...base, name: "Sunrise Group - Men's" });
    const women = mapMeetingGuideMeeting({ ...base, name: "Sunrise Group - Women's" });
    expect(men?.name).toBe("Sunrise Group - Men's");
    expect(men?.id).not.toBe(women?.id);
  });

  it('leaves a hyphenated name alone', () => {
    const mapped = mapMeetingGuideMeeting({ ...base, name: 'Step-by-Step' });
    expect(mapped?.name).toBe('Step-by-Step');
  });

  it('fills format, which is the field Homegroups shows', () => {
    const mapped = mapMeetingGuideMeeting({ ...base, types: 'Open,Discussion' });
    expect(mapped?.format).toBe('Open,Discussion');
  });

  it('treats a dial-in meeting with no link as online and keeps its notes', () => {
    const mapped = mapMeetingGuideMeeting({
      ...base,
      conference_phone: '+1 555 0100',
      conference_phone_notes: 'Passcode 1234',
    });
    expect(mapped?.online).toBe(true);
    expect(mapped?.onlineNotes).toBe('Dial-in: +1 555 0100 (Passcode 1234)');
  });

  it('keeps a dial-in number that has no notes', () => {
    const mapped = mapMeetingGuideMeeting({ ...base, conference_phone: '+1 555 0100' });
    expect(mapped?.onlineNotes).toBe('Dial-in: +1 555 0100');
  });

  it('lists a dial-in number after the link notes', () => {
    const mapped = mapMeetingGuideMeeting({
      ...base,
      conference_url_notes: 'Link notes',
      conference_phone: '+1 555 0100',
      conference_phone_notes: 'Passcode 1234',
    });
    expect(mapped?.onlineNotes).toBe('Link notes\nDial-in: +1 555 0100 (Passcode 1234)');
  });

  it('prefers the link notes when a meeting has both', () => {
    const mapped = mapMeetingGuideMeeting({
      ...base,
      conference_url_notes: 'Link notes',
      conference_phone_notes: 'Phone notes',
    });
    expect(mapped?.onlineNotes).toBe('Link notes');
  });

  it('never copies contact or payment fields into the directory', () => {
    const mapped = mapMeetingGuideMeeting({
      id: 1,
      name: 'Sunrise Group',
      day: 2,
      time: '07:00:00',
      latitude: '30.2',
      longitude: '-97.7',
      contacts: [{ email: 'person@example.com' }],
      venmo: '@someone',
      entity: { email: 'group@example.com' },
      notes: 'Call Pat',
    } as never);
    expect(JSON.stringify(mapped)).not.toMatch(/example\.com|@someone|Call Pat/);
  });
});

// Hand-built Meeting Guide payload — mirrors the AAMeetingResponse shape from
// homegroups api.ts (day = integer 0–6, time = "HH:mm:ss", lat/lng strings).
const sampleMeeting = {
  id: 12345,
  name: 'Sunrise Group',
  day: 2, // Tuesday
  time: '07:00:00',
  types: 'O,D',
  latitude: '30.267153',
  longitude: '-97.743057',
  formatted_address: '123 Main St, Austin, TX 78701, USA',
  address: '123 Main St',
  city: 'Austin',
  state: 'TX',
  postal_code: '78701',
  conference_url: '',
  conference_url_notes: '',
};

// fetchFn mock that asserts ZERO real network: it returns a canned Response and
// records the URL it was asked to fetch.
const makeFetch = (body: unknown) =>
  jest.fn().mockResolvedValue({
    ok: true,
    json: jest.fn().mockResolvedValue(body),
  } as any);

describe('fetchAAMeetings', () => {
  it('maps a Meeting Guide record to a DirectoryMeeting (external/AA)', async () => {
    const fetchFn = makeFetch({ meetings: [sampleMeeting] });
    const result = await fetchAAMeetings(30.27, -97.74, { fetchFn });

    expect(result).toHaveLength(1);
    const m = result[0];
    expect(m.source).toBe('external');
    expect(m.provider).toBe('AA');
    expect(m.name).toBe('Sunrise Group');
    expect(m.externalId).toBe('12345');
  });

  it('produces a canonical integer day 0–6 and "HH:mm" time', async () => {
    const fetchFn = makeFetch({ meetings: [sampleMeeting] });
    const [m] = await fetchAAMeetings(0, 0, { fetchFn });

    expect(m.day).toBe(2);
    expect(Number.isInteger(m.day)).toBe(true);
    expect(m.time).toBe('07:00');
  });

  it('derives a deterministic id via the frozen identity helper', async () => {
    const fetchFn = makeFetch({ meetings: [sampleMeeting] });
    const [m] = await fetchAAMeetings(0, 0, { fetchFn });

    const expectedId = directoryMeetingId({
      name: 'Sunrise Group',
      day: 2,
      time: '07:00',
      link: '',
      formattedAddress: '123 Main St, Austin, TX 78701, USA',
    });
    expect(m.id).toBe(expectedId);
  });

  it('populates location with a non-empty geohash and parsed lat/lng', async () => {
    const fetchFn = makeFetch({ meetings: [sampleMeeting] });
    const [m] = await fetchAAMeetings(0, 0, { fetchFn });

    expect(m.location.lat).toBeCloseTo(30.267153);
    expect(m.location.lng).toBeCloseTo(-97.743057);
    expect(typeof m.location.geohash).toBe('string');
    expect(m.location.geohash.length).toBeGreaterThan(0);
    expect(m.location.city).toBe('Austin');
    expect(m.location.state).toBe('TX');
    expect(m.location.zip).toBe('78701');
  });

  it('marks a meeting online when conference_url is present', async () => {
    const online = { ...sampleMeeting, conference_url: 'https://zoom.us/j/1' };
    const fetchFn = makeFetch({ meetings: [online] });
    const [m] = await fetchAAMeetings(0, 0, { fetchFn });

    expect(m.online).toBe(true);
    expect(m.link).toBe('https://zoom.us/j/1');
  });

  it('skips malformed records instead of throwing', async () => {
    const bad = { ...sampleMeeting, time: 'not-a-time' };
    const fetchFn = makeFetch({ meetings: [bad, sampleMeeting] });
    const result = await fetchAAMeetings(0, 0, { fetchFn });

    expect(result).toHaveLength(1);
  });

  it('calls the keyless Meeting Guide endpoint with lat/lng (no real network)', async () => {
    const fetchFn = makeFetch({ meetings: [] });
    await fetchAAMeetings(30.27, -97.74, { fetchFn });

    expect(fetchFn).toHaveBeenCalledTimes(1);
    const url = fetchFn.mock.calls[0][0] as string;
    expect(url).toContain('https://api.meetingguide.org/app/v2/request');
    expect(url).toContain('latitude=30.27');
    expect(url).toContain('longitude=-97.74');
  });
});
