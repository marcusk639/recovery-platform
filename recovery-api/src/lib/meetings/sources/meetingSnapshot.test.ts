import { mapHomegroupsAaMeeting, mapSnapshotMeeting } from './meetingSnapshot';
import { directoryMeetingId } from '../identity';
import { mapNaMeeting } from './naDataset';

const AA_DOC = {
  addedBy: 'system',
  apiId: '2356688',
  type: 'AA',
  name: 'Sunrise Group',
  day: 'monday',
  time: '12:00',
  format: 'Open,English',
  types: 'Open,English',
  lat: 37.6328558,
  lng: -84.7732203,
  // Real Homegroups docs hold the full formatted address here, and the street in `street`.
  address: '1 Main St, Danville, KY 40422, USA',
  street: '1 Main St',
  city: 'Danville',
  state: 'KY',
  zip: '40422',
  formattedAddress: '1 Main St, Danville, KY 40422, USA',
  timezone: 'America/New_York',
  online: false,
  groupId: 'group-1',
  verified: true,
};

describe('mapHomegroupsAaMeeting', () => {
  it('maps a scraped Homegroups meeting to an external AA directory row', () => {
    const m = mapHomegroupsAaMeeting(AA_DOC);

    expect(m).toMatchObject({
      source: 'external',
      provider: 'AA',
      externalId: '2356688',
      name: 'Sunrise Group',
      day: 1,
      time: '12:00',
      format: 'Open,English',
      timezone: 'America/New_York',
      online: false,
    });
    expect(m!.location).toMatchObject({
      address: '1 Main St',
      city: 'Danville',
      state: 'KY',
      zip: '40422',
      lat: 37.6328558,
      lng: -84.7732203,
    });
  });

  it('stores the meeting types in type, as live rows do, so day and type filters agree', () => {
    expect(mapHomegroupsAaMeeting(AA_DOC)?.type).toBe('Open,English');
  });

  it('uses the address when a doc has no street', () => {
    const m = mapHomegroupsAaMeeting({ ...AA_DOC, street: undefined, address: '2 Oak Ave' });
    expect(m?.location.address).toBe('2 Oak Ave');
  });

  it('still hashes the full formatted address, so an imported row keeps its live id', () => {
    const m = mapHomegroupsAaMeeting(AA_DOC);
    expect(m?.id).toBe(
      directoryMeetingId({
        name: 'Sunrise Group',
        day: 1,
        time: '12:00',
        link: '',
        formattedAddress: '1 Main St, Danville, KY 40422, USA',
      }),
    );
  });

  it('leaves out product-private fields', () => {
    const m = mapHomegroupsAaMeeting(AA_DOC) as unknown as Record<string, unknown>;

    expect(m.groupId).toBeUndefined();
    expect(m.verified).toBeUndefined();
    expect(m.addedBy).toBeUndefined();
  });

  it('refuses a meeting a Homegroups member added', () => {
    expect(mapHomegroupsAaMeeting({ ...AA_DOC, addedBy: 'some-user-uid' })).toBeNull();
  });

  it('refuses a meeting with no addedBy', () => {
    const { addedBy: _addedBy, ...rest } = AA_DOC;

    expect(mapHomegroupsAaMeeting(rest)).toBeNull();
  });

  it('refuses a non-AA meeting', () => {
    expect(mapHomegroupsAaMeeting({ ...AA_DOC, type: 'Custom' })).toBeNull();
  });
});

describe('mapSnapshotMeeting', () => {
  it.each([
    ['Yes', true],
    ['yes', true],
    ['TRUE', true],
    [true, true],
    ['', false],
    ['No', false],
    [false, false],
  ])('reads online %j as %j', (online, expected) => {
    const m = mapSnapshotMeeting({ ...AA_DOC, online }, 'AA');

    expect(m!.online).toBe(expected);
  });

  it('leaves online unset when the source has no value', () => {
    const { online: _online, ...rest } = AA_DOC;

    expect(mapSnapshotMeeting(rest, 'AA')!.online).toBeUndefined();
  });

  it.each([
    ['19.3:30', '19:30'],
    ['08.3:30', '08:30'],
    ['10.15:15', '10:15'],
    ['17.45:45', '17:45'],
  ])('reads the na-meetings time %s as %s', (time, expected) => {
    expect(mapSnapshotMeeting({ ...AA_DOC, time }, 'AA')!.time).toBe(expected);
  });

  it.each([['19.3:75'], ['25.3:30'], ['19.3.3:30'], ['19.:30']])(
    'refuses the malformed time %s',
    (time) => {
      expect(mapSnapshotMeeting({ ...AA_DOC, time }, 'AA')).toBeNull();
    },
  );

  it('builds the same id as the live mapper when formattedAddress is empty', () => {
    const m = mapSnapshotMeeting({ ...AA_DOC, formattedAddress: '' }, 'AA');

    expect(m!.id).toBe(
      directoryMeetingId({ name: AA_DOC.name, day: 1, time: '12:00', link: '', formattedAddress: '' }),
    );
  });

  it('refuses a row at the (0,0) placeholder coordinates', () => {
    expect(mapSnapshotMeeting({ ...AA_DOC, lat: 0, lng: 0 }, 'AA')).toBeNull();
  });

  it('keeps a real coordinate on the equator', () => {
    expect(mapSnapshotMeeting({ ...AA_DOC, lat: 0, lng: -78.5 }, 'AA')).not.toBeNull();
  });
});

describe('mapNaMeeting on the real na-meetings shape', () => {
  const NA_DOC = {
    id: 'na-1',
    name: 'Serenity Now',
    day: 'saturday',
    time: '12:00',
    lat: 40.7,
    lng: -74,
    address: '2 Elm St',
    online: '',
    password: 'hunter2',
  };

  it('does not treat the empty-string online value as a meeting link', () => {
    expect(mapNaMeeting(NA_DOC)!.online).toBe(false);
  });

  it('reads "Yes" as an online meeting', () => {
    expect(mapNaMeeting({ ...NA_DOC, online: 'Yes' })!.online).toBe(true);
  });

  it('does not copy a meeting password', () => {
    const m = mapNaMeeting(NA_DOC) as unknown as Record<string, unknown>;

    expect(JSON.stringify(m)).not.toContain('hunter2');
  });

  it('refuses the (0,0) placeholder rows', () => {
    expect(mapNaMeeting({ ...NA_DOC, lat: 0, lng: 0 })).toBeNull();
  });
});
