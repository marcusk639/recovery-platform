import { HouseSearchFilter, houseSearchTypes } from '../HouseSearch';
import type { HouseSearch, GenderFilter } from '../HouseSearch';

function makeHouseSearch(overrides: Partial<HouseSearch> = {}): HouseSearch {
  return {
    latitude: 34.0522,
    longitude: -118.2437,
    street: '123 Main St',
    city: 'Los Angeles',
    zipCode: '90001',
    state: 'CA',
    distance: 10,
    ...overrides,
  };
}

describe('HouseSearch interface structural conformance', () => {
  it('constructs a valid HouseSearch object without errors', () => {
    expect(() => makeHouseSearch()).not.toThrow();
  });

  it('all fields are optional', () => {
    const search: HouseSearch = {};
    expect(search).toBeDefined();
  });

  it('latitude and longitude are optional numbers', () => {
    const search = makeHouseSearch({ latitude: 40.7128, longitude: -74.006 });
    expect(search.latitude).toBe(40.7128);
    expect(search.longitude).toBe(-74.006);
  });

  it('city, state, street, zipCode are optional strings', () => {
    const search = makeHouseSearch({ city: 'NYC', state: 'NY', street: '5th Ave', zipCode: '10001' });
    expect(search.city).toBe('NYC');
    expect(search.state).toBe('NY');
    expect(search.street).toBe('5th Ave');
    expect(search.zipCode).toBe('10001');
  });

  it('distance is an optional number', () => {
    const search = makeHouseSearch({ distance: 25 });
    expect(search.distance).toBe(25);
  });

  it('houseName is an optional string', () => {
    const search = makeHouseSearch({ houseName: 'Serenity House' });
    expect(search.houseName).toBe('Serenity House');
  });

  it('filters is optional', () => {
    const search = makeHouseSearch();
    expect(search.filters).toBeUndefined();
  });

  it('filters can be a HouseSearchFilter instance', () => {
    const filter = new HouseSearchFilter();
    const search = makeHouseSearch({ filters: filter });
    expect(search.filters).toBeInstanceOf(HouseSearchFilter);
  });
});

describe('HouseSearchFilter class defaults', () => {
  it('can be instantiated with no arguments', () => {
    const filter = new HouseSearchFilter();
    expect(filter).toBeInstanceOf(HouseSearchFilter);
  });

  it('gender defaults to empty string', () => {
    const filter = new HouseSearchFilter();
    expect(filter.gender).toBe('');
  });

  it('type defaults to "Any"', () => {
    const filter = new HouseSearchFilter();
    expect(filter.type).toBe('Any');
  });

  it('location defaults with all undefined fields', () => {
    const filter = new HouseSearchFilter();
    expect(filter.location.lat).toBeUndefined();
    expect(filter.location.lng).toBeUndefined();
    expect(filter.location.street).toBeUndefined();
    expect(filter.location.city).toBeUndefined();
    expect(filter.location.zip).toBeUndefined();
    expect(filter.location.state).toBeUndefined();
  });

  it('gender can be set to "male"', () => {
    const filter = new HouseSearchFilter();
    filter.gender = 'male';
    expect(filter.gender).toBe('male');
  });

  it('gender can be set to "female"', () => {
    const filter = new HouseSearchFilter();
    filter.gender = 'female';
    expect(filter.gender).toBe('female');
  });

  it('gender can be set to "all"', () => {
    const filter = new HouseSearchFilter();
    filter.gender = 'all';
    expect(filter.gender).toBe('all');
  });

  it('gender can be set to "non-binary"', () => {
    const filter = new HouseSearchFilter();
    filter.gender = 'non-binary';
    expect(filter.gender).toBe('non-binary');
  });

  it('type can be set to "12 Step"', () => {
    const filter = new HouseSearchFilter();
    filter.type = '12 Step';
    expect(filter.type).toBe('12 Step');
  });

  it('type can be set to "Faith Based"', () => {
    const filter = new HouseSearchFilter();
    filter.type = 'Faith Based';
    expect(filter.type).toBe('Faith Based');
  });

  it('two HouseSearchFilter instances are independent', () => {
    const f1 = new HouseSearchFilter();
    const f2 = new HouseSearchFilter();
    f1.gender = 'male';
    f2.gender = 'female';
    expect(f1.gender).not.toBe(f2.gender);
  });
});

describe('houseSearchTypes constant', () => {
  it('is defined', () => {
    expect(houseSearchTypes).toBeDefined();
  });

  it('has "12 Step" key mapping to "12 Step"', () => {
    expect(houseSearchTypes['12 Step']).toBe('12 Step');
  });

  it('has "Faith Based" key mapping to "Faith Based"', () => {
    expect(houseSearchTypes['Faith Based']).toBe('Faith Based');
  });

  it('has "Any" key mapping to "any" (lowercase)', () => {
    expect(houseSearchTypes['Any']).toBe('any');
  });

  it('has exactly 3 keys', () => {
    expect(Object.keys(houseSearchTypes)).toHaveLength(3);
  });
});
