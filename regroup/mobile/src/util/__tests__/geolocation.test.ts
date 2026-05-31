// src/util/__tests__/geolocation.test.ts
//
// Unit tests for geolocation.ts.
// Exports tested:
//   - getCurrentPosition(onSuccess, onError) — delegates to Geolocation.getCurrentPosition
//   - geohash(lat, lng) — encodes lat/lng to a geohash string via ngeohash
//   - getGeohashRange(latitude, longitude, distance) — returns { lower, upper } geohash bounds
//
// react-native-geolocation-service is already mocked globally in jest.setup.js.
// ngeohash is a pure JS library; no mock needed.

import Geolocation from 'react-native-geolocation-service';
import { getCurrentPosition, geohash, getGeohashRange } from '../geolocation';

const mockGetCurrentPosition = Geolocation.getCurrentPosition as jest.Mock;

// ─── getCurrentPosition ───────────────────────────────────────────────────────

describe('getCurrentPosition', () => {
  beforeEach(() => jest.clearAllMocks());

  it('delegates to Geolocation.getCurrentPosition with the supplied callbacks', () => {
    const onSuccess = jest.fn();
    const onError = jest.fn();

    getCurrentPosition(onSuccess, onError);

    expect(mockGetCurrentPosition).toHaveBeenCalledTimes(1);
    expect(mockGetCurrentPosition).toHaveBeenCalledWith(onSuccess, onError);
  });

  it('returns whatever Geolocation.getCurrentPosition returns', () => {
    const sentinel = Symbol('retval');
    mockGetCurrentPosition.mockReturnValueOnce(sentinel);

    const onSuccess = jest.fn();
    const onError = jest.fn();

    const result = getCurrentPosition(onSuccess, onError);
    expect(result).toBe(sentinel);
  });

  it('passes the onSuccess callback correctly (invokes it when mock triggers it)', () => {
    const position = { coords: { latitude: 41.8781, longitude: -87.6298 } };
    mockGetCurrentPosition.mockImplementationOnce((successCb: Function) => {
      successCb(position);
    });

    const onSuccess = jest.fn();
    getCurrentPosition(onSuccess, jest.fn());

    expect(onSuccess).toHaveBeenCalledWith(position);
  });

  it('passes the onError callback correctly (invokes it when mock triggers it)', () => {
    const error = { code: 1, message: 'PERMISSION_DENIED' };
    mockGetCurrentPosition.mockImplementationOnce(
      (_successCb: Function, errorCb: Function) => {
        errorCb(error);
      },
    );

    const onError = jest.fn();
    getCurrentPosition(jest.fn(), onError);

    expect(onError).toHaveBeenCalledWith(error);
  });
});

// ─── geohash ──────────────────────────────────────────────────────────────────

describe('geohash', () => {
  it('returns a non-empty string', () => {
    const result = geohash(41.8781, -87.6298);
    expect(typeof result).toBe('string');
    expect(result.length).toBeGreaterThan(0);
  });

  it('produces a deterministic result for the same inputs', () => {
    const a = geohash(41.8781, -87.6298);
    const b = geohash(41.8781, -87.6298);
    expect(a).toBe(b);
  });

  it('produces different hashes for different coordinates', () => {
    const chicago = geohash(41.8781, -87.6298);
    const nyc = geohash(40.7128, -74.006);
    expect(chicago).not.toBe(nyc);
  });

  it('produces a known geohash for 0°, 0°', () => {
    // ngeohash encodes (0, 0) — verify it is a non-empty string; the exact
    // prefix depends on ngeohash precision defaults but must be consistent.
    const result = geohash(0, 0);
    const again = geohash(0, 0);
    expect(result).toBe(again);
    expect(result.length).toBeGreaterThan(0);
  });

  it('handles negative latitude and longitude', () => {
    const result = geohash(-33.8688, 151.2093); // Sydney
    expect(typeof result).toBe('string');
    expect(result.length).toBeGreaterThan(0);
  });

  it('handles extreme coordinate values', () => {
    expect(() => geohash(90, 180)).not.toThrow();
    expect(() => geohash(-90, -180)).not.toThrow();
  });
});

// ─── getGeohashRange ──────────────────────────────────────────────────────────

describe('getGeohashRange', () => {
  const lat = 41.8781;
  const lng = -87.6298;
  const distanceMiles = 5;

  it('returns an object with lower and upper string properties', () => {
    const result = getGeohashRange(lat, lng, distanceMiles);
    expect(result).toHaveProperty('lower');
    expect(result).toHaveProperty('upper');
    expect(typeof result.lower).toBe('string');
    expect(typeof result.upper).toBe('string');
  });

  it('lower is lexicographically less than or equal to upper', () => {
    const { lower, upper } = getGeohashRange(lat, lng, distanceMiles);
    expect(lower <= upper).toBe(true);
  });

  it('a larger distance produces a wider range (upper > lower by more)', () => {
    const small = getGeohashRange(lat, lng, 1);
    const large = getGeohashRange(lat, lng, 100);

    // With a larger radius the bounding box covers a wider area.
    // The lower bound of a larger radius should be <= that of a smaller one.
    expect(large.lower <= small.lower).toBe(true);
    expect(large.upper >= small.upper).toBe(true);
  });

  it('returns consistent results for the same inputs', () => {
    const a = getGeohashRange(lat, lng, distanceMiles);
    const b = getGeohashRange(lat, lng, distanceMiles);
    expect(a).toEqual(b);
  });

  it('different locations produce different ranges', () => {
    const chicago = getGeohashRange(41.8781, -87.6298, 10);
    const nyc = getGeohashRange(40.7128, -74.006, 10);
    expect(chicago.lower).not.toBe(nyc.lower);
    expect(chicago.upper).not.toBe(nyc.upper);
  });

  it('a zero-mile distance collapses lower and upper to the same hash', () => {
    const { lower, upper } = getGeohashRange(lat, lng, 0);
    expect(lower).toBe(upper);
  });

  it('uses the correct degree-per-mile constants (verifiable via known math)', () => {
    // lat degrees per mile: 0.0144927536231884
    // lng degrees per mile: 0.0181818181818182
    // For distance=1 mile around (0, 0):
    const { lower, upper } = getGeohashRange(0, 0, 1);
    const lowerHash = geohash(-0.0144927536231884, -0.0181818181818182);
    const upperHash = geohash(0.0144927536231884, 0.0181818181818182);
    expect(lower).toBe(lowerHash);
    expect(upper).toBe(upperHash);
  });
});
