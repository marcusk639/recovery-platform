import { fetchAAMeetings } from './meetingGuide';
import { directoryMeetingId } from '../identity';

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
