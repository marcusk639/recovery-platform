// src/util/__tests__/address.test.ts
//
// Unit tests for address.ts.
// Exports tested:
//   - toAddress(street, city, zip, state) → string
//   - getAddressDisplay(street, city?, state?, zip?) → string
//   - getPlaceAsAddress(detail) → AddressDetails
//   - AddressKeys (constant array)
// No React Native imports — no mocks required.

import {
  toAddress,
  getAddressDisplay,
  getPlaceAsAddress,
  AddressKeys,
  GooglePlaceDetail,
  GooglePlaceComponent,
} from '../address';

// ─── toAddress ──────────────────────────────────────────────────────────────

describe('toAddress', () => {
  it('assembles a standard US address string', () => {
    expect(toAddress('123 Main St', 'Springfield', '62701', 'IL')).toBe(
      '123 Main St, Springfield, IL 62701',
    );
  });

  it('always includes the comma-space separator between street and city', () => {
    const result = toAddress('1 Elm Ave', 'Shelbyville', '12345', 'OH');
    expect(result).toContain(', ');
  });

  it('places state before zip separated by a space', () => {
    const result = toAddress('42 Oak Rd', 'Portland', '97201', 'OR');
    expect(result).toMatch(/OR 97201$/);
  });

  it('handles empty strings for all components without throwing', () => {
    // street + ', ' + city + ', ' + state + ' ' + zip → ', ,  '
    expect(toAddress('', '', '', '')).toBe(', ,  ');
  });
});

// ─── getAddressDisplay ──────────────────────────────────────────────────────

describe('getAddressDisplay', () => {
  it('returns street only when no other args provided', () => {
    expect(getAddressDisplay('123 Main St')).toBe('123 Main St');
  });

  it('returns street and city separated by ", " when city provided', () => {
    expect(getAddressDisplay('123 Main St', 'Springfield')).toBe(
      '123 Main St, Springfield',
    );
  });

  it('returns street, city, and state correctly', () => {
    expect(getAddressDisplay('123 Main St', 'Springfield', 'IL')).toBe(
      '123 Main St, Springfield, IL',
    );
  });

  it('returns full address with zip appended with a space after state', () => {
    expect(getAddressDisplay('123 Main St', 'Springfield', 'IL', '62701')).toBe(
      '123 Main St, Springfield, IL 62701',
    );
  });

  it('returns empty string when all arguments are absent/undefined', () => {
    expect(getAddressDisplay('')).toBe('');
  });

  it('appends zip directly to state when state is provided but no trailing separator', () => {
    const result = getAddressDisplay('5 Pine Ave', 'Albany', 'NY', '12207');
    expect(result).toMatch(/NY 12207$/);
  });

  it('returns city only when street is empty and city provided', () => {
    expect(getAddressDisplay('', 'Columbus')).toBe('Columbus');
  });

  it('handles state provided without city (unusual path)', () => {
    // city is falsy so address += city ? ', ' + state : state → appended directly
    const result = getAddressDisplay('10 Broad St', undefined, 'TX');
    expect(result).toBe('10 Broad StTX');
  });

  it('handles zip provided without state — zip appended without separator', () => {
    // zip branch: state is falsy so zip is just concatenated
    const result = getAddressDisplay('10 Broad St', 'Austin', undefined, '78701');
    expect(result).toBe('10 Broad St, Austin78701');
  });
});

// ─── getPlaceAsAddress ──────────────────────────────────────────────────────

function makeComponent(type: string, longName: string, shortName: string = longName): GooglePlaceComponent {
  return { types: [type], long_name: longName, short_name: shortName };
}

function makeDetail(components: GooglePlaceComponent[], lat: number = 0, lng: number = 0): GooglePlaceDetail {
  return {
    address_components: components,
    geometry: { location: { lat, lng } },
  };
}

describe('getPlaceAsAddress', () => {
  it('parses a typical Google Places detail into an AddressDetails object', () => {
    const detail = makeDetail([
      makeComponent('street_number', '100'),
      makeComponent('route', 'Market St'),
      makeComponent('locality', 'San Francisco'),
      makeComponent('administrative_area_level_1', 'California', 'CA'),
      makeComponent('postal_code', '94105'),
      makeComponent('country', 'United States', 'US'),
    ], 37.7749, -122.4194);

    const result = getPlaceAsAddress(detail);

    expect(result.street).toBe('100 Market St');
    expect(result.city).toBe('San Francisco');
    expect(result.state).toBe('CA');
    expect(result.zip).toBe('94105');
    expect(result.country).toBe('United States');
    expect(result.lat).toBe(37.7749);
    expect(result.lng).toBe(-122.4194);
  });

  it('prepends floor to street when floor component is present', () => {
    const detail = makeDetail([
      makeComponent('floor', '3F', '3F'),
      makeComponent('street_number', '200'),
      makeComponent('route', 'Broadway'),
    ]);

    const result = getPlaceAsAddress(detail);
    expect(result.street).toBe('3F 200 Broadway');
  });

  it('returns empty street when no route component exists', () => {
    const detail = makeDetail([
      makeComponent('street_number', '50'),
    ]);
    expect(getPlaceAsAddress(detail).street).toBe('');
  });

  it('uses route long_name as street when no street_number exists', () => {
    const detail = makeDetail([
      makeComponent('route', 'Elm Avenue'),
    ]);
    expect(getPlaceAsAddress(detail).street).toBe('Elm Avenue');
  });

  it('returns empty strings for all address parts when address_components is missing', () => {
    const detail: GooglePlaceDetail = {
      geometry: { location: { lat: 10, lng: 20 } },
    };
    const result = getPlaceAsAddress(detail);
    expect(result.street).toBe('');
    expect(result.city).toBe('');
    expect(result.state).toBe('');
    expect(result.zip).toBe('');
    expect(result.country).toBe('');
  });

  it('preserves numeric lat/lng from geometry', () => {
    const detail = makeDetail([], 51.5074, -0.1278);
    const result = getPlaceAsAddress(detail);
    expect(result.lat).toBe(51.5074);
    expect(result.lng).toBe(-0.1278);
  });
});

// ─── AddressKeys ─────────────────────────────────────────────────────────────

describe('AddressKeys', () => {
  it('is an array', () => {
    expect(Array.isArray(AddressKeys)).toBe(true);
  });

  it('contains the required address field keys', () => {
    expect(AddressKeys).toContain('street');
    expect(AddressKeys).toContain('city');
    expect(AddressKeys).toContain('state');
    expect(AddressKeys).toContain('zip');
    expect(AddressKeys).toContain('lat');
    expect(AddressKeys).toContain('lng');
  });

  it('does not contain the country key', () => {
    // country is in AddressDetails interface but excluded from AddressKeys
    expect(AddressKeys).not.toContain('country');
  });
});
