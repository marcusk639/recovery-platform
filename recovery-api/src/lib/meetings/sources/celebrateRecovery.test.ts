import { fetchCelebrateRecoveryMeetings } from './celebrateRecovery';
import { directoryMeetingId } from '../identity';

// Hand-built CR XML payload — mirrors the crgroups.info raw map response shape
// consumed by regroup/homegroups (markers > marker[], each field an array;
// custom2 holds "Friday 5:00 PM"; address "street, city,  STATE ZIP COUNTRY").
const sampleXml = `<?xml version="1.0" encoding="UTF-8"?>
<markers>
  <marker>
    <name>Grace Celebrate Recovery</name>
    <address>456 Hope Ave, Dallas,  TX 75201 USA</address>
    <lat>32.7767</lat>
    <lng>-96.7970</lng>
    <url>https://example.org/grace</url>
    <custom2 name="Schedule">Friday 5:00 PM</custom2>
  </marker>
</markers>`;

// fetchFn mock — returns canned XML text, asserts ZERO real network.
const makeFetch = (xml: string) =>
  jest.fn().mockResolvedValue({
    ok: true,
    text: jest.fn().mockResolvedValue(xml),
  } as any);

describe('fetchCelebrateRecoveryMeetings', () => {
  it('parses XML and maps a marker to a DirectoryMeeting (external/CR)', async () => {
    const fetchFn = makeFetch(sampleXml);
    const result = await fetchCelebrateRecoveryMeetings(32.78, -96.8, { fetchFn });

    expect(result).toHaveLength(1);
    const m = result[0];
    expect(m.source).toBe('external');
    expect(m.provider).toBe('CELEBRATE_RECOVERY');
    expect(m.name).toBe('Grace Celebrate Recovery');
  });

  it('canonicalizes day to integer 0–6 and time to 24-hour "HH:mm"', async () => {
    const fetchFn = makeFetch(sampleXml);
    const [m] = await fetchCelebrateRecoveryMeetings(0, 0, { fetchFn });

    expect(m.day).toBe(5); // Friday
    expect(Number.isInteger(m.day)).toBe(true);
    expect(m.time).toBe('17:00'); // 5:00 PM → 17:00
  });

  it('derives a deterministic id via the frozen identity helper', async () => {
    const fetchFn = makeFetch(sampleXml);
    const [m] = await fetchCelebrateRecoveryMeetings(0, 0, { fetchFn });

    const expectedId = directoryMeetingId({
      name: 'Grace Celebrate Recovery',
      day: 5,
      time: '17:00',
      link: 'https://example.org/grace',
      formattedAddress: '456 Hope Ave, Dallas,  TX 75201 USA',
    });
    expect(m.id).toBe(expectedId);
  });

  it('parses lat/lng and a non-empty geohash plus the address parts', async () => {
    const fetchFn = makeFetch(sampleXml);
    const [m] = await fetchCelebrateRecoveryMeetings(0, 0, { fetchFn });

    expect(m.location.lat).toBeCloseTo(32.7767);
    expect(m.location.lng).toBeCloseTo(-96.797);
    expect(typeof m.location.geohash).toBe('string');
    expect(m.location.geohash.length).toBeGreaterThan(0);
    expect(m.location.address).toBe('456 Hope Ave');
    expect(m.location.city).toBe('Dallas');
    expect(m.location.state).toBe('TX');
    expect(m.location.zip).toBe('75201');
  });

  it('returns an empty array when there are no markers', async () => {
    const fetchFn = makeFetch('<?xml version="1.0"?><markers></markers>');
    const result = await fetchCelebrateRecoveryMeetings(0, 0, { fetchFn });
    expect(result).toEqual([]);
  });

  it('calls the crgroups.info endpoint with lat/lng (no real network)', async () => {
    const fetchFn = makeFetch('<?xml version="1.0"?><markers></markers>');
    await fetchCelebrateRecoveryMeetings(32.78, -96.8, { fetchFn });

    expect(fetchFn).toHaveBeenCalledTimes(1);
    const url = fetchFn.mock.calls[0][0] as string;
    expect(url).toContain('https://locator.crgroups.info/index.php');
    expect(url).toContain('lat=32.78');
    expect(url).toContain('lng=-96.8');
  });
});
