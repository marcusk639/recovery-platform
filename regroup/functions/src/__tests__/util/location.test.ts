// src/__tests__/util/location.test.ts
import {
  locationIsInArea,
  getXYvalues,
  getAreaPolygon,
  getDistance,
  getMilesAsMeters,
  getGeohashRange,
  getAddressFromGeocode,
} from '../../util/location';

describe('getXYvalues', () => {
  it('returns [lng, lat] order', () => {
    expect(getXYvalues({ lat: 30.267, lng: -97.743 })).toEqual([-97.743, 30.267]);
  });
});

describe('getAreaPolygon', () => {
  it('converts an array of LatLng to [lng, lat] pairs', () => {
    const points = [
      { lat: 30.0, lng: -97.0 },
      { lat: 31.0, lng: -98.0 },
    ];
    expect(getAreaPolygon(points)).toEqual([[-97.0, 30.0], [-98.0, 31.0]]);
  });
});

describe('locationIsInArea', () => {
  const square: number[][] = [
    [0, 0], [1, 0], [1, 1], [0, 1], [0, 0],
  ];
  it('returns true for a point inside the polygon', () => {
    expect(locationIsInArea(square, [0.5, 0.5])).toBe(true);
  });
  it('returns false for a point outside the polygon', () => {
    expect(locationIsInArea(square, [2, 2])).toBe(false);
  });
});

describe('getDistance', () => {
  it('returns ~0 for identical coordinates', () => {
    const loc = { lat: 30.267, lng: -97.743 };
    expect(getDistance(loc, loc)).toBe(0);
  });
  it('returns a positive number for different coordinates', () => {
    const a = { lat: 30.267153, lng: -97.743057 };
    const b = { lat: 30.268, lng: -97.744 };
    expect(getDistance(a, b)).toBeGreaterThan(0);
  });
  it('Austin to Houston is roughly 240 km', () => {
    const austin = { lat: 30.267, lng: -97.743 };
    const houston = { lat: 29.760, lng: -95.370 };
    const dist = getDistance(austin, houston);
    expect(dist).toBeGreaterThan(200_000);
    expect(dist).toBeLessThan(300_000);
  });
});

describe('getMilesAsMeters', () => {
  it('converts 1 mile to ~1609 meters', () => {
    expect(getMilesAsMeters(1)).toBeCloseTo(1609.34, 0);
  });
  it('converts 0 miles to 0 meters', () => {
    expect(getMilesAsMeters(0)).toBe(0);
  });
});

describe('getGeohashRange', () => {
  it('returns lower and upper geohash strings', () => {
    const { lower, upper } = getGeohashRange(30.267, -97.743, 10);
    expect(typeof lower).toBe('string');
    expect(typeof upper).toBe('string');
    expect(lower.length).toBeGreaterThan(0);
    expect(upper.length).toBeGreaterThan(0);
  });
  it('lower geohash is lexicographically less than upper', () => {
    const { lower, upper } = getGeohashRange(30.267, -97.743, 10);
    expect(lower < upper).toBe(true);
  });
});

describe('getAddressFromGeocode', () => {
  const makeGeocode = (components: { types: string[]; long_name: string; short_name: string }[]) => ({
    results: [
      { address_components: [], formatted_address: '', geometry: { location: { lat: 0, lng: 0 } }, types: [] },
      { address_components: components, formatted_address: '', geometry: { location: { lat: 0, lng: 0 } }, types: [] },
    ],
    status: 'OK',
  } as any);

  it('extracts city, state, and zip from geocode response', () => {
    // street_number and route must appear before city/state/zip are all set,
    // because the implementation uses .some() and exits early once all three
    // of city, state, and zipCode are populated.
    const geocode = makeGeocode([
      { types: ['street_number'], long_name: '123', short_name: '123' },
      { types: ['route'], long_name: 'Congress Ave', short_name: 'Congress Ave' },
      { types: ['locality'], long_name: 'Austin', short_name: 'Austin' },
      { types: ['administrative_area_level_1'], long_name: 'Texas', short_name: 'TX' },
      { types: ['postal_code'], long_name: '78701', short_name: '78701' },
    ]);
    const address = getAddressFromGeocode(geocode);
    expect(address.city).toBe('Austin');
    expect(address.state).toBe('TX');
    expect(address.zipCode).toBe('78701');
    expect(address.streetNumber).toBe('123');
    expect(address.streetName).toBe('Congress Ave');
  });

  it('returns empty strings when components are missing', () => {
    const geocode = makeGeocode([]);
    const address = getAddressFromGeocode(geocode);
    expect(address.city).toBe('');
    expect(address.state).toBe('');
  });
});
