"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const geocode_1 = require("./geocode");
// fetchFn mock — returns canned Google Maps JSON, asserts ZERO real network.
// apiKey is injected (never read from process.env) so tests need no secret.
const makeFetch = (body, ok = true) => jest.fn().mockResolvedValue({
    ok,
    json: jest.fn().mockResolvedValue(body),
});
const deps = (fetchFn) => ({ apiKey: 'TEST_KEY', fetchFn });
describe('geocode', () => {
    it('returns the first result location with geometry', async () => {
        const fetchFn = makeFetch({
            status: 'OK',
            results: [
                { formatted_address: '1 Main St', geometry: { location: { lat: 30.1, lng: -97.2 } } },
            ],
        });
        const loc = await (0, geocode_1.geocode)({ street: '1 Main St', city: 'Austin', state: 'TX' }, deps(fetchFn));
        expect(loc).toEqual({ lat: 30.1, lng: -97.2 });
    });
    it('returns null when no result has geometry', async () => {
        const fetchFn = makeFetch({ status: 'ZERO_RESULTS', results: [] });
        const loc = await (0, geocode_1.geocode)({ street: 'x', city: 'y', state: 'z' }, deps(fetchFn));
        expect(loc).toBeNull();
    });
    it('calls the Google geocode endpoint with the injected key (no real network)', async () => {
        const fetchFn = makeFetch({ status: 'OK', results: [] });
        await (0, geocode_1.geocode)({ street: '1 Main St', city: 'Austin', state: 'TX' }, deps(fetchFn));
        const url = fetchFn.mock.calls[0][0];
        expect(url).toContain('https://maps.googleapis.com/maps/api/geocode/json?address=');
        expect(url).toContain('key=TEST_KEY');
    });
    it('percent-encodes address components so `&`/spaces cannot corrupt the URL or key param', async () => {
        const fetchFn = makeFetch({ status: 'OK', results: [] });
        await (0, geocode_1.geocode)({ street: 'Foo & Bar St', city: 'New York', state: 'NY' }, deps(fetchFn));
        const url = fetchFn.mock.calls[0][0];
        // The literal "&" from the street is encoded (not a raw `&` that would split params).
        expect(url).toContain('Foo%20%26%20Bar%20St');
        expect(url).not.toContain('Foo & Bar St');
        // Spaces in the city are encoded too.
        expect(url).toContain('New%20York');
        // The key remains the final, intact param.
        expect(url.endsWith('key=TEST_KEY')).toBe(true);
    });
});
describe('reverseGeocode', () => {
    it('returns the first formatted_address', async () => {
        const fetchFn = makeFetch({
            status: 'OK',
            results: [
                { formatted_address: '1 Main St, Austin, TX', geometry: { location: { lat: 0, lng: 0 } } },
            ],
        });
        const addr = await (0, geocode_1.reverseGeocode)(30.1, -97.2, deps(fetchFn));
        expect(addr).toBe('1 Main St, Austin, TX');
        const url = fetchFn.mock.calls[0][0];
        expect(url).toContain('https://maps.googleapis.com/maps/api/geocode/json?latlng=30.1,-97.2');
        expect(url).toContain('key=TEST_KEY');
    });
    it('returns null when there are no results', async () => {
        const fetchFn = makeFetch({ status: 'ZERO_RESULTS', results: [] });
        expect(await (0, geocode_1.reverseGeocode)(0, 0, deps(fetchFn))).toBeNull();
    });
});
describe('getTimezone', () => {
    it('returns the timeZoneId from the timezone endpoint', async () => {
        const fetchFn = makeFetch({ status: 'OK', timeZoneId: 'America/Chicago' });
        const tz = await (0, geocode_1.getTimezone)(30.1, -97.2, deps(fetchFn), 1700000000);
        expect(tz).toBe('America/Chicago');
        const url = fetchFn.mock.calls[0][0];
        expect(url).toContain('https://maps.googleapis.com/maps/api/timezone/json?location=30.1,-97.2');
        expect(url).toContain('timestamp=1700000000');
        expect(url).toContain('key=TEST_KEY');
    });
    it('returns "unknown" on a non-ok response', async () => {
        const fetchFn = makeFetch({}, false);
        expect(await (0, geocode_1.getTimezone)(0, 0, deps(fetchFn))).toBe('unknown');
    });
});
