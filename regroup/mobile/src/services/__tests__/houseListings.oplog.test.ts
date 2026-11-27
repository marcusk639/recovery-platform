/**
 * houseListings.ts against the Firebase operation log: signed-out house search
 * and the house summary read house-listings, never houses (EMU-009).
 */
jest.mock('../../../firebase-setup', () => require('../../../__mocks__/firebase-modular/setup'));
jest.mock('@react-native-firebase/firestore', () =>
  require('../../../__mocks__/firebase-modular/firestore'),
);
jest.mock('../../util/logging', () => ({ logException: jest.fn() }));

import { failNext, getOpLog, resetOpLog, seedDoc } from '../../../__mocks__/firebase-modular/log';
import { getHouseListing, searchHouseListings } from '../houseListings';
import { HouseSearch } from '../../entities/HouseSearch';
import { geohash, getGeohashRange } from '../../util/geolocation';

const cell = (lat: number, lng: number) => geohash(lat, lng).slice(0, 6);

beforeEach(() => resetOpLog());

describe('searchHouseListings', () => {
  const range = getGeohashRange(30, -90, 25);

  beforeEach(() => {
    seedDoc('house-listings/h1', { id: 'h1', geohash: cell(30, -90), gender: 'female' });
    seedDoc('house-listings/h2', { id: 'h2', geohash: cell(30.01, -90.01), gender: 'male' });
    seedDoc('house-listings/far', { id: 'far', geohash: cell(45, 10), gender: 'female' });
    seedDoc('houses/h1', { id: 'h1', geohash: geohash(30, -90) });
  });

  const search = (extra: Record<string, unknown> = {}) =>
    ({ filters: { location: { lat: 30, lng: -90 }, ...extra } }) as unknown as HouseSearch;

  it('queries the listings 25 miles around, in whole cells, and never houses', async () => {
    const result = await searchHouseListings(search());

    expect(result.map((l) => l.id).sort()).toEqual(['h1', 'h2']);
    expect(getOpLog()).toEqual([
      {
        op: 'getDocs',
        path: 'house-listings',
        constraints: [
          ['where', 'geohash', '>=', range.lower.slice(0, 6)],
          ['where', 'geohash', '<=', range.upper],
        ],
      },
    ]);
  });

  it('finds a listing in the lower bound cell', async () => {
    resetOpLog();
    seedDoc('house-listings/edge', { id: 'edge', geohash: range.lower.slice(0, 6) });
    const result = await searchHouseListings(search());
    expect(result.map((l) => l.id)).toContain('edge');
  });

  it('filters by gender', async () => {
    expect((await searchHouseListings(search({ gender: 'female' }))).map((l) => l.id)).toEqual([
      'h1',
    ]);
  });

  it('asks nothing without a location', async () => {
    expect(
      await searchHouseListings({ filters: { location: {} } } as unknown as HouseSearch),
    ).toEqual([]);
    expect(getOpLog()).toEqual([]);
  });

  it('replaces a read failure with a generic message', async () => {
    failNext('getDocs', new Error('denied'), 'house-listings');
    await expect(searchHouseListings(search())).rejects.toThrow(
      'Could not search houses. Please try again.',
    );
  });
});

describe('getHouseListing', () => {
  it('reads house-listings/{id}', async () => {
    seedDoc('house-listings/h1', { id: 'h1', name: 'Hope House' });
    expect(await getHouseListing('h1')).toEqual({ id: 'h1', name: 'Hope House' });
    expect(getOpLog()).toEqual([{ op: 'get', path: 'house-listings/h1' }]);
  });

  it('is null for a house that is not listed', async () => {
    expect(await getHouseListing('nope')).toBeNull();
  });
});
