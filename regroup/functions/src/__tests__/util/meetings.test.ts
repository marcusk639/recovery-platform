jest.mock('firebase-functions', () => ({
  logger: { info: jest.fn(), error: jest.fn(), warn: jest.fn() },
}));

const mockGetAAMeetings = jest.fn();
const mockGetNAMeetings = jest.fn();
const mockPartialGeocode = jest.fn();
const mockGetCelebrateRecoveryMeetings = jest.fn();

jest.mock('../../api/api', () => ({
  getAAMeetings: mockGetAAMeetings,
  getNAMeetings: mockGetNAMeetings,
  partialGeocode: mockPartialGeocode,
  getCelebrateRecoveryMeetings: mockGetCelebrateRecoveryMeetings,
}));

const mockGetMeetings = jest.fn();
jest.mock('../../api/firestore', () => ({
  getMeetings: mockGetMeetings,
  ratsFirestore: { collection: jest.fn() },
  app: {},
}));

import {
  mapAAMeeting,
  mapNAMeeting,
  filterCustomMeetings,
  filterMeetingsByCriteria,
  getAlcoholicsAnonymousMeetings,
  getNarcoticsAnoymousMeetings,
  geocodeNAMeeting,
  getAll12StepMeetings,
} from '../../util/meetings';

beforeEach(() => jest.clearAllMocks());

// -----------------------------------------------------------------------
// mapAAMeeting
// -----------------------------------------------------------------------
describe('mapAAMeeting', () => {
  const aaRaw = {
    name: 'Serenity Group',
    address: '123 Main St',
    city: 'Austin',
    state: 'TX',
    postal_code: '78701',
    location_name: 'Community Center',
    types: 'O,BB',
    latitude: '30.267',
    longitude: '-97.743',
    // daysOfWeek is 0-indexed: 0=sunday, 1=monday, …
    day: 1,
    time: '19:30:00',
    conference_url: '',
    conference_url_notes: '',
  };

  it('maps name, city, state', () => {
    const m = mapAAMeeting(aaRaw)!;
    expect(m.name).toBe('Serenity Group');
    expect(m.city).toBe('Austin');
    expect(m.state).toBe('TX');
  });

  it('strips seconds from time string', () => {
    // "19:30:00" → lastIndexOf(":") is at index 5 → substring(0,5) = "19:30"
    expect(mapAAMeeting(aaRaw)!.time).toBe('19:30');
  });

  it('sets type to AA', () => {
    expect(mapAAMeeting(aaRaw)!.type).toBe('AA');
  });

  it('converts day index 1 to monday (0-indexed array)', () => {
    // daysOfWeek = ['sunday','monday','tuesday',…]
    expect(mapAAMeeting(aaRaw)!.day).toBe('monday');
  });

  it('parses lat/lng as floats', () => {
    const m = mapAAMeeting(aaRaw)!;
    expect(m.lat).toBeCloseTo(30.267);
    expect(m.lng).toBeCloseTo(-97.743);
  });

  it('sets online=false when conference_url is empty string', () => {
    expect(mapAAMeeting(aaRaw)!.online).toBe(false);
  });

  it('sets online=true when conference_url is provided', () => {
    const m = mapAAMeeting({ ...aaRaw, conference_url: 'https://zoom.us/j/1' })!;
    expect(m.online).toBe(true);
  });

  it('splits types string into array', () => {
    const m = mapAAMeeting(aaRaw)!;
    expect(m.types).toEqual(['O', 'BB']);
  });

  it('maps street from address field', () => {
    const m = mapAAMeeting(aaRaw)!;
    expect(m.street).toBe('123 Main St');
  });

  it('maps zip from postal_code', () => {
    const m = mapAAMeeting(aaRaw)!;
    expect(m.zip).toBe('78701');
  });

  it('maps locationName from location_name', () => {
    const m = mapAAMeeting(aaRaw)!;
    expect(m.locationName).toBe('Community Center');
  });

  it('day index 0 maps to sunday', () => {
    const m = mapAAMeeting({ ...aaRaw, day: 0 })!;
    expect(m.day).toBe('sunday');
  });

  it('day index 6 maps to saturday', () => {
    const m = mapAAMeeting({ ...aaRaw, day: 6 })!;
    expect(m.day).toBe('saturday');
  });
});

// -----------------------------------------------------------------------
// mapNAMeeting
// -----------------------------------------------------------------------
describe('mapNAMeeting', () => {
  const naRaw = {
    com_name: 'NA Group',
    address: '456 Oak St',
    city: 'Austin',
    state: 'TX',
    zip: '78702',
    directions: 'Near the park',
    // NA uses daysOfWeek[mtg_day - 1], so mtg_day=2 → index 1 → 'monday'
    mtg_day: 2,
    mtg_time: 1930,
    latitude: 30.268,
    longitude: -97.744,
    online: 'No',
    password: '',
    link: '',
  };

  it('maps name from com_name', () => {
    const m = mapNAMeeting(naRaw)!;
    expect(m.name).toBe('NA Group');
  });

  it('sets type to NA', () => {
    const m = mapNAMeeting(naRaw)!;
    expect(m.type).toBe('NA');
  });

  it('converts military time 1930 to "19:30"', () => {
    // getMeetingTime(1930): Math.floor(1930/100)=19, 1930%100=30 → "19:30"
    expect(mapNAMeeting(naRaw)!.time).toBe('19:30');
  });

  it('converts mtg_day=2 to monday (1-indexed offset)', () => {
    // daysOfWeek[mtg_day - 1] = daysOfWeek[1] = 'monday'
    expect(mapNAMeeting(naRaw)!.day).toBe('monday');
  });

  it('converts mtg_day=1 to sunday', () => {
    const m = mapNAMeeting({ ...naRaw, mtg_day: 1 })!;
    expect(m.day).toBe('sunday');
  });

  it('sets online=false when online field is "No"', () => {
    const m = mapNAMeeting(naRaw)!;
    expect(m.online).toBe(false);
  });

  it('sets online=true when online field is "Yes"', () => {
    const m = mapNAMeeting({ ...naRaw, online: 'Yes' })!;
    expect(m.online).toBe(true);
  });

  it('sets lat/lng directly from numeric fields', () => {
    const m = mapNAMeeting(naRaw)!;
    expect(m.lat).toBe(30.268);
    expect(m.lng).toBe(-97.744);
  });

  it('builds Location array with address parts', () => {
    const m = mapNAMeeting(naRaw)!;
    expect(Array.isArray(m.Location)).toBe(true);
    expect(m.Location).toContain('NA Group');
    expect(m.Location).toContain('456 Oak St');
  });

  it('converts military time 800 to "08:00" (zero-padded hours below 10)', () => {
    const m = mapNAMeeting({ ...naRaw, mtg_time: 800 })!;
    expect(m.time).toBe('08:00');
  });

  it('converts military time 1200 to "12:00"', () => {
    const m = mapNAMeeting({ ...naRaw, mtg_time: 1200 })!;
    expect(m.time).toBe('12:00');
  });
});

// -----------------------------------------------------------------------
// mapAAMeeting — returns null on bad data
// -----------------------------------------------------------------------
describe('mapAAMeeting — returns null on bad data', () => {
  it('returns null when meeting data is null', () => {
    expect(mapAAMeeting(null as any)).toBeNull();
  });

  it('returns null when meeting data is undefined', () => {
    expect(mapAAMeeting(undefined as any)).toBeNull();
  });
});

// -----------------------------------------------------------------------
// filterCustomMeetings
// -----------------------------------------------------------------------
describe('filterCustomMeetings', () => {
  const meetings: any[] = [
    { name: 'Serenity Group', city: 'Austin', street: '123 Main St', state: 'TX', lat: 30.267, lng: -97.743 },
    { name: 'Hope Circle',    city: 'Houston', street: '456 Oak Ave', state: 'TX', lat: 29.760, lng: -95.370 },
    { name: 'Freedom Step',   city: 'Dallas',  street: '789 Elm Blvd', state: 'TX', lat: 32.776, lng: -96.796 },
  ];

  it('filters by name (case-insensitive partial match)', () => {
    const result = filterCustomMeetings(meetings, { name: 'serenity' });
    expect(result).toHaveLength(1);
    expect(result[0].name).toBe('Serenity Group');
  });

  it('filters by city (exact case)', () => {
    const result = filterCustomMeetings(meetings, { city: 'Houston' });
    expect(result).toHaveLength(1);
    expect(result[0].city).toBe('Houston');
  });

  it('filters by city (case-insensitive)', () => {
    const result = filterCustomMeetings(meetings, { city: 'dallas' });
    expect(result).toHaveLength(1);
    expect(result[0].name).toBe('Freedom Step');
  });

  it('filters by street (partial match)', () => {
    const result = filterCustomMeetings(meetings, { street: 'Oak' });
    expect(result).toHaveLength(1);
    expect(result[0].name).toBe('Hope Circle');
  });

  it('filters by state', () => {
    const result = filterCustomMeetings(meetings, { state: 'TX' });
    expect(result).toHaveLength(3);
  });

  it('returns all when no criteria provided (empty object)', () => {
    expect(filterCustomMeetings(meetings, {})).toHaveLength(3);
  });

  it('returns empty array when nothing matches', () => {
    const result = filterCustomMeetings(meetings, { name: 'nonexistent' });
    expect(result).toHaveLength(0);
  });

  it('combines multiple criteria (AND logic)', () => {
    const result = filterCustomMeetings(meetings, { city: 'Austin', name: 'Serenity' });
    expect(result).toHaveLength(1);
    expect(result[0].name).toBe('Serenity Group');
  });

  it('returns empty when criteria combination has no match', () => {
    const result = filterCustomMeetings(meetings, { city: 'Austin', name: 'Hope' });
    expect(result).toHaveLength(0);
  });
});

// -----------------------------------------------------------------------
// filterMeetingsByCriteria
// -----------------------------------------------------------------------
describe('filterMeetingsByCriteria', () => {
  const meetings: any[] = [
    { name: 'AA Sunrise', type: 'AA', street: '1 St', city: 'Austin', state: 'TX', time: '07:00', day: 'monday', online: false, onlineNotes: '' },
    { name: 'AA Evening', type: 'AA', street: '2 St', city: 'Austin', state: 'TX', time: '19:00', day: 'tuesday', online: false, onlineNotes: '' },
    { name: 'Hope Group',  type: 'AA', street: '3 St', city: 'Dallas', state: 'TX', time: '12:00', day: 'friday', online: false, onlineNotes: '' },
  ];

  it('returns all meetings when criteria is undefined', () => {
    const result = filterMeetingsByCriteria(meetings, undefined);
    expect(result).toHaveLength(3);
  });

  it('filters AA meetings by name', () => {
    const result = filterMeetingsByCriteria(meetings, { name: 'Sunrise' });
    expect(result).toHaveLength(1);
    expect(result[0].name).toBe('AA Sunrise');
  });

  it('filters AA meetings by name case-insensitively', () => {
    const result = filterMeetingsByCriteria(meetings, { name: 'aa' });
    expect(result).toHaveLength(2);
  });

  it('returns all AA meetings when criteria has no name', () => {
    const result = filterMeetingsByCriteria(meetings, { city: 'Austin' });
    // only name filtering is implemented; city is ignored
    expect(result).toHaveLength(3);
  });

  it('filters NA meetings by name', () => {
    const naMeetings: any[] = [
      { name: 'NA Morning', type: 'NA', street: '1 Ave', city: 'Austin', state: 'TX', time: '08:00', day: 'monday', online: false, onlineNotes: '' },
      { name: 'NA Night',   type: 'NA', street: '2 Ave', city: 'Austin', state: 'TX', time: '20:00', day: 'friday', online: false, onlineNotes: '' },
    ];
    const result = filterMeetingsByCriteria(naMeetings, { name: 'Morning' });
    expect(result).toHaveLength(1);
    expect(result[0].name).toBe('NA Morning');
  });
});

// -----------------------------------------------------------------------
// getAlcoholicsAnonymousMeetings
// -----------------------------------------------------------------------
describe('getAlcoholicsAnonymousMeetings', () => {
  const validRawMeeting = {
    name: 'AA Test Group',
    address: '1 Test St',
    city: 'Austin',
    state: 'TX',
    postal_code: '78701',
    location_name: 'Hall',
    types: 'O',
    latitude: '30.0',
    longitude: '-97.0',
    day: 1,
    time: '18:00:00',
    conference_url: '',
    conference_url_notes: '',
  };

  it('returns mapped AA meetings from API response', async () => {
    mockGetAAMeetings.mockResolvedValue({ meetings: [validRawMeeting] });
    const results = await getAlcoholicsAnonymousMeetings({ lat: 30.0, lng: -97.0 });
    expect(results).toHaveLength(1);
    expect(results[0].name).toBe('AA Test Group');
    expect(results[0].type).toBe('AA');
  });

  it('returns empty array when API returns no meetings', async () => {
    mockGetAAMeetings.mockResolvedValue({ meetings: [] });
    const results = await getAlcoholicsAnonymousMeetings({ lat: 30.0, lng: -97.0 });
    expect(results).toHaveLength(0);
  });

  it('calls getAAMeetings with correct lat/lng', async () => {
    mockGetAAMeetings.mockResolvedValue({ meetings: [] });
    await getAlcoholicsAnonymousMeetings({ lat: 30.0, lng: -97.0 });
    expect(mockGetAAMeetings).toHaveBeenCalledWith(30.0, -97.0);
  });

  it('filters by name when criteria provided', async () => {
    mockGetAAMeetings.mockResolvedValue({
      meetings: [
        validRawMeeting,
        { ...validRawMeeting, name: 'Different Group' },
      ],
    });
    const results = await getAlcoholicsAnonymousMeetings(
      { lat: 30.0, lng: -97.0 },
      { name: 'AA Test' }
    );
    expect(results).toHaveLength(1);
    expect(results[0].name).toBe('AA Test Group');
  });

  it('returns multiple meetings when all match criteria', async () => {
    mockGetAAMeetings.mockResolvedValue({
      meetings: [validRawMeeting, { ...validRawMeeting, name: 'AA Evening' }],
    });
    const results = await getAlcoholicsAnonymousMeetings({ lat: 30.0, lng: -97.0 });
    expect(results).toHaveLength(2);
  });
});

// -----------------------------------------------------------------------
// getNarcoticsAnoymousMeetings
// -----------------------------------------------------------------------
describe('getNarcoticsAnoymousMeetings', () => {
  const validNAMeeting: any = {
    name: 'NA Test',
    type: 'NA',
    street: '1 Ave',
    city: 'Austin',
    state: 'TX',
    time: '19:00',
    day: 'monday',
    online: false,
    onlineNotes: '',
  };

  it('returns meetings from NA API', async () => {
    mockGetNAMeetings.mockResolvedValue([validNAMeeting]);
    const results = await getNarcoticsAnoymousMeetings({ lat: 30.0, lng: -97.0 });
    expect(results).toHaveLength(1);
  });

  it('returns empty array when API returns empty list', async () => {
    mockGetNAMeetings.mockResolvedValue([]);
    const results = await getNarcoticsAnoymousMeetings({ lat: 30.0, lng: -97.0 });
    expect(results).toHaveLength(0);
  });

  it('returns empty array on API error', async () => {
    mockGetNAMeetings.mockRejectedValue(new Error('API down'));
    const results = await getNarcoticsAnoymousMeetings({ lat: 30.0, lng: -97.0 });
    expect(results).toEqual([]);
  });

  it('filters by name criteria', async () => {
    mockGetNAMeetings.mockResolvedValue([
      { ...validNAMeeting, name: 'NA Morning' },
      { ...validNAMeeting, name: 'NA Night' },
    ]);
    const results = await getNarcoticsAnoymousMeetings(
      { lat: 30.0, lng: -97.0 },
      { name: 'Morning' }
    );
    expect(results).toHaveLength(1);
    expect(results[0].name).toBe('NA Morning');
  });
});

// -----------------------------------------------------------------------
// geocodeNAMeeting
// -----------------------------------------------------------------------
describe('geocodeNAMeeting', () => {
  it('returns location from first result with geometry', async () => {
    mockPartialGeocode.mockResolvedValue({
      results: [{ geometry: { location: { lat: 30.267, lng: -97.743 } } }],
    });
    const result = await geocodeNAMeeting('123 Main St Austin TX');
    expect(result).toEqual({ lat: 30.267, lng: -97.743 });
  });

  it('returns undefined when results array is empty', async () => {
    mockPartialGeocode.mockResolvedValue({ results: [] });
    const result = await geocodeNAMeeting('nowhere');
    expect(result).toBeUndefined();
  });

  it('returns undefined when result has no geometry', async () => {
    mockPartialGeocode.mockResolvedValue({
      results: [{ geometry: null }],
    });
    const result = await geocodeNAMeeting('bad address');
    expect(result).toBeUndefined();
  });

  it('calls partialGeocode with the provided query string', async () => {
    mockPartialGeocode.mockResolvedValue({ results: [] });
    await geocodeNAMeeting('456 Oak St Dallas TX');
    expect(mockPartialGeocode).toHaveBeenCalledWith('456 Oak St Dallas TX');
  });

  it('returns the first valid location when multiple results exist', async () => {
    mockPartialGeocode.mockResolvedValue({
      results: [
        { geometry: { location: { lat: 10.0, lng: 20.0 } } },
        { geometry: { location: { lat: 30.0, lng: 40.0 } } },
      ],
    });
    const result = await geocodeNAMeeting('some address');
    expect(result).toEqual({ lat: 10.0, lng: 20.0 });
  });
});
