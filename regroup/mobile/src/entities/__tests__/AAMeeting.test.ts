import type { AAMeeting } from '../AAMeeting';

function makeAAMeeting(overrides: Partial<AAMeeting> = {}): AAMeeting {
  return {
    id: 1,
    area: 'Downtown Area',
    name: 'Sunday Serenity Group',
    notes: null,
    day: 0,
    time: '09:00',
    url: 'https://aa.org/meeting/1',
    types: 'O,BB',
    updated_at: '2026-01-01T00:00:00Z',
    group: null,
    group_notes: null,
    location_name: 'Community Center',
    location_notes: 'Enter through the back door',
    latitude: '34.0522',
    longitude: '-118.2437',
    formatted_address: '123 Main St, Los Angeles, CA 90001',
    address: '123 Main St',
    city: 'Los Angeles',
    state: 'CA',
    postal_code: '90001',
    country: 'US',
    region: 'Southern California',
    distance: 2.5,
    ...overrides,
  };
}

describe('AAMeeting interface structural conformance', () => {
  it('constructs a valid AAMeeting object without errors', () => {
    expect(() => makeAAMeeting()).not.toThrow();
  });

  it('id is a number', () => {
    const meeting = makeAAMeeting({ id: 42 });
    expect(meeting.id).toBe(42);
    expect(typeof meeting.id).toBe('number');
  });

  it('area is a string', () => {
    const meeting = makeAAMeeting({ area: 'Eastside' });
    expect(meeting.area).toBe('Eastside');
  });

  it('name is a string', () => {
    const meeting = makeAAMeeting({ name: 'Monday Morning Group' });
    expect(meeting.name).toBe('Monday Morning Group');
  });

  it('notes field defaults to null', () => {
    const meeting = makeAAMeeting();
    expect(meeting.notes).toBeNull();
  });

  it('group field defaults to null', () => {
    const meeting = makeAAMeeting();
    expect(meeting.group).toBeNull();
  });

  it('group_notes field defaults to null', () => {
    const meeting = makeAAMeeting();
    expect(meeting.group_notes).toBeNull();
  });

  it('day is a number representing day of week (0=Sunday)', () => {
    const meeting = makeAAMeeting({ day: 0 });
    expect(meeting.day).toBe(0);
    expect(typeof meeting.day).toBe('number');
  });

  it('day can represent any day (0-6)', () => {
    [0, 1, 2, 3, 4, 5, 6].forEach(d => {
      const meeting = makeAAMeeting({ day: d });
      expect(meeting.day).toBe(d);
    });
  });

  it('time is a string', () => {
    const meeting = makeAAMeeting({ time: '18:30' });
    expect(meeting.time).toBe('18:30');
  });

  it('url is a string', () => {
    const meeting = makeAAMeeting({ url: 'https://aa.org/meeting/99' });
    expect(meeting.url).toBe('https://aa.org/meeting/99');
  });

  it('types is a string (comma-separated type codes)', () => {
    const meeting = makeAAMeeting({ types: 'O,BB,SP' });
    expect(meeting.types).toBe('O,BB,SP');
  });

  it('updated_at is a string timestamp', () => {
    const ts = '2026-02-22T10:00:00Z';
    const meeting = makeAAMeeting({ updated_at: ts });
    expect(meeting.updated_at).toBe(ts);
  });

  it('location_name is a string', () => {
    const meeting = makeAAMeeting({ location_name: 'St. Mary Church' });
    expect(meeting.location_name).toBe('St. Mary Church');
  });

  it('location_notes is a string', () => {
    const meeting = makeAAMeeting({ location_notes: 'Side entrance' });
    expect(meeting.location_notes).toBe('Side entrance');
  });

  it('latitude and longitude are strings', () => {
    const meeting = makeAAMeeting({ latitude: '40.7128', longitude: '-74.0060' });
    expect(meeting.latitude).toBe('40.7128');
    expect(meeting.longitude).toBe('-74.0060');
    expect(typeof meeting.latitude).toBe('string');
    expect(typeof meeting.longitude).toBe('string');
  });

  it('formatted_address is a string', () => {
    const meeting = makeAAMeeting({ formatted_address: '456 Oak Ave, Anytown, TX' });
    expect(meeting.formatted_address).toBe('456 Oak Ave, Anytown, TX');
  });

  it('address, city, state, postal_code, country, region are all strings', () => {
    const meeting = makeAAMeeting({
      address: '789 Pine Rd',
      city: 'Austin',
      state: 'TX',
      postal_code: '73301',
      country: 'US',
      region: 'Southwest',
    });
    expect(meeting.address).toBe('789 Pine Rd');
    expect(meeting.city).toBe('Austin');
    expect(meeting.state).toBe('TX');
    expect(meeting.postal_code).toBe('73301');
    expect(meeting.country).toBe('US');
    expect(meeting.region).toBe('Southwest');
  });

  it('distance is a number', () => {
    const meeting = makeAAMeeting({ distance: 5.75 });
    expect(meeting.distance).toBe(5.75);
    expect(typeof meeting.distance).toBe('number');
  });

  it('distance of 0 is valid', () => {
    const meeting = makeAAMeeting({ distance: 0 });
    expect(meeting.distance).toBe(0);
  });
});
