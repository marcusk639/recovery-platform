/**
 * Places API (New) returns Place Details as { location, addressComponents,
 * formattedAddress, displayName }. The app's callers (rats-text-input,
 * rats-search-bar via util/address getPlaceAsAddress) read the legacy
 * { geometry.location, address_components } shape: picking a suggestion
 * crashed the house search filter and did nothing in meeting search.
 */
import { getPlaceAsAddress } from '../../../util/address';
import { toLegacyPlaceDetail } from '../placeDetail';

const austinNewApi = {
  id: 'place-austin',
  displayName: { text: 'Austin', languageCode: 'en' },
  formattedAddress: 'Austin, TX, USA',
  location: { latitude: 30.267153, longitude: -97.7430608 },
  addressComponents: [
    { longText: 'Austin', shortText: 'Austin', types: ['locality', 'political'] },
    {
      longText: 'Texas',
      shortText: 'TX',
      types: ['administrative_area_level_1', 'political'],
    },
    { longText: 'United States', shortText: 'US', types: ['country', 'political'] },
  ],
  types: ['locality', 'political'],
};

describe('toLegacyPlaceDetail', () => {
  it('maps a Places API (New) detail to the legacy shape the app reads', () => {
    const legacy = toLegacyPlaceDetail(austinNewApi);

    expect(legacy.geometry).toEqual({ location: { lat: 30.267153, lng: -97.7430608 } });
    expect(legacy.place_id).toBe('place-austin');
    expect(legacy.name).toBe('Austin');
    expect(legacy.formatted_address).toBe('Austin, TX, USA');
    expect(legacy.address_components).toEqual([
      { long_name: 'Austin', short_name: 'Austin', types: ['locality', 'political'] },
      {
        long_name: 'Texas',
        short_name: 'TX',
        types: ['administrative_area_level_1', 'political'],
      },
      { long_name: 'United States', short_name: 'US', types: ['country', 'political'] },
    ]);
  });

  it('gives getPlaceAsAddress what it needs (no crash, city and state filled)', () => {
    const address = getPlaceAsAddress(toLegacyPlaceDetail(austinNewApi));

    expect(address).toMatchObject({
      city: 'Austin',
      state: 'TX',
      country: 'United States',
      lat: 30.267153,
      lng: -97.7430608,
    });
  });

  it('leaves a detail already in the legacy shape alone (Current Location)', () => {
    const legacy = { description: 'Current Location', geometry: { location: { lat: 1, lng: 2 } } };

    expect(toLegacyPlaceDetail(legacy)).toBe(legacy);
  });

  it('passes a missing detail through', () => {
    expect(toLegacyPlaceDetail(null)).toBeNull();
  });
});
