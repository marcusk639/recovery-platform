/**
 * Google Maps geocoding / reverse-geocoding / timezone helpers for the meeting
 * directory ingestors.
 *
 * Endpoint URLs copied verbatim from regroup `functions/src/api/api.ts`:
 *   GEOCODE         (line 28): https://maps.googleapis.com/maps/api/geocode/json?address=${street},+${city},+${state}&key=${KEY}
 *   REVERSE_GEOCODE (line 26): https://maps.googleapis.com/maps/api/geocode/json?latlng=${lat},${lng}+&key=${KEY}
 *   timezoneUrl     (line 24): https://maps.googleapis.com/maps/api/timezone/json?location=${lat},${lng}&timestamp=${time}&key=${KEY}
 *
 * The API key is INJECTED via deps (never read from process.env inside these
 * pure functions) so tests need neither network nor secrets.
 */

export interface GeoLocation {
  lat: number;
  lng: number;
}

interface GeocodeResult {
  formatted_address: string;
  geometry: { location: GeoLocation };
}

interface GeocodeResponse {
  results: GeocodeResult[];
  status: string;
}

interface TimezoneResponse {
  timeZoneId?: string;
}

export interface GeocodeDeps {
  /** Resolved Google Maps API key, injected (e.g. GOOGLE_MAPS_API_KEY.value()). */
  apiKey: string;
  /** Injected fetch so tests need zero network. Defaults to global fetch (Node 18+). */
  fetchFn?: typeof fetch;
}

const GEOCODE = (street: string, city: string, state: string, key: string): string =>
  `https://maps.googleapis.com/maps/api/geocode/json?address=${street},+${city},+${state}&key=${key}`;

const REVERSE_GEOCODE = (lat: number, lng: number, key: string): string =>
  `https://maps.googleapis.com/maps/api/geocode/json?latlng=${lat},${lng}+&key=${key}`;

const TIMEZONE = (lat: number, lng: number, timestamp: number, key: string): string =>
  `https://maps.googleapis.com/maps/api/timezone/json?location=${lat},${lng}&timestamp=${timestamp}&key=${key}`;

/**
 * Geocode a street/city/state address to a lat/lng, or null when no result has
 * geometry. Mirrors regroup `geocode` (api.ts:61) reading
 * `results[].geometry.location`.
 */
export async function geocode(
  address: { street: string; city: string; state: string },
  deps: GeocodeDeps,
): Promise<GeoLocation | null> {
  const fetchFn = deps.fetchFn ?? fetch;
  const url = GEOCODE(address.street, address.city, address.state, deps.apiKey);
  const res = await fetchFn(url);
  if (!res.ok) {
    throw new Error(`Geocode request failed: ${res.status}`);
  }
  const body = (await res.json()) as GeocodeResponse;
  const result = body?.results?.find((r) => r.geometry?.location);
  return result ? result.geometry.location : null;
}

/**
 * Reverse-geocode a lat/lng to a formatted address, or null when none found.
 * Mirrors regroup `reverseGeocode` (api.ts:53).
 */
export async function reverseGeocode(
  lat: number,
  lng: number,
  deps: GeocodeDeps,
): Promise<string | null> {
  const fetchFn = deps.fetchFn ?? fetch;
  const res = await fetchFn(REVERSE_GEOCODE(lat, lng, deps.apiKey));
  if (!res.ok) {
    throw new Error(`Reverse geocode request failed: ${res.status}`);
  }
  const body = (await res.json()) as GeocodeResponse;
  return body?.results?.[0]?.formatted_address ?? null;
}

/**
 * Look up the IANA timezone id for a lat/lng. Returns "unknown" on failure,
 * matching regroup `getTimezone` (api.ts:85).
 */
export async function getTimezone(
  lat: number,
  lng: number,
  deps: GeocodeDeps,
  timestamp: number = Math.floor(Date.now() / 1000),
): Promise<string> {
  const fetchFn = deps.fetchFn ?? fetch;
  try {
    const res = await fetchFn(TIMEZONE(lat, lng, timestamp, deps.apiKey));
    if (!res.ok) return 'unknown';
    const body = (await res.json()) as TimezoneResponse;
    return body?.timeZoneId ?? 'unknown';
  } catch {
    return 'unknown';
  }
}
