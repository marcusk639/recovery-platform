export interface AddressDetails {
  street: string;
  city: string;
  state: string;
  zip: string;
  country: string;
  lat: string | number;
  lng: string | number;
}

export const AddressKeys: (keyof AddressDetails)[] = [
  'street',
  'city',
  'state',
  'zip',
  'lat',
  'lng',
];

export interface GooglePlaceComponent {
  types: string[];
  long_name: string;
  short_name: string;
}

export interface GooglePlaceDetail {
  address_components?: GooglePlaceComponent[];
  geometry: {
    location: {
      lat: string | number;
      lng: string | number;
    };
  };
}

/**
 * Converts a Google Places API detail object into an AddressDetails object
 * @param detail - Google Places detail object
 * @returns AddressDetails object with parsed address components
 */
export const getPlaceAsAddress = (detail: GooglePlaceDetail): AddressDetails => {
  const addressComponents = {
    city: '',
    state: '',
    zip: '',
    country: '',
    street: '',
  };
  if (detail.address_components) {
    let floor = detail.address_components.find((component: GooglePlaceComponent) =>
      component.types.includes('floor'),
    );
    let floorValue = '';
    if (floor) {
      floorValue = floor.short_name;
    }
    let streetNumber = detail.address_components.find((component: GooglePlaceComponent) =>
      component.types.includes('street_number'),
    );
    let streetNumberValue = '';
    if (streetNumber) {
      streetNumberValue = streetNumber.long_name;
    }
    let street = detail.address_components.find((component: GooglePlaceComponent) =>
      component.types.includes('route'),
    );
    let streetValue = '';
    if (street) {
      if (floorValue && streetNumberValue && street.long_name) {
        streetValue = floorValue + ' ' + streetNumberValue + ' ' + street.long_name;
      } else if (streetNumberValue && street.long_name) {
        streetValue = streetNumberValue + ' ' + street.long_name;
      } else {
        streetValue = street.long_name;
      }
    }
    let city = detail.address_components.find((component: GooglePlaceComponent) =>
      component.types.includes('locality'),
    );
    let cityValue = '';
    if (city) {
      cityValue = city.long_name;
    }
    let state = detail.address_components.find((component: GooglePlaceComponent) =>
      component.types.includes('administrative_area_level_1'),
    );
    let stateValue = '';
    if (state) {
      stateValue = state.short_name;
    }
    let zip = detail.address_components.find((component: GooglePlaceComponent) =>
      component.types.includes('postal_code'),
    );
    let zipValue = '';
    if (zip) {
      zipValue = zip.long_name;
    }
    let country = detail.address_components.find((component: GooglePlaceComponent) =>
      component.types.includes('country'),
    );
    let countryValue = '';
    if (country) {
      countryValue = country.long_name;
    }
    addressComponents.city = cityValue;
    addressComponents.state = stateValue;
    addressComponents.zip = zipValue;
    addressComponents.country = countryValue;
    addressComponents.street = streetValue;
  }
  const lat = detail.geometry.location.lat;
  const lng = detail.geometry.location.lng;
  return {
    ...addressComponents,
    lat,
    lng,
  };
};

/**
 * Formats address components into a single address string
 * @param street - Street address
 * @param city - City name
 * @param zip - ZIP code
 * @param state - State abbreviation
 * @returns Formatted address string
 */
export const toAddress = (
  street: string,
  city: string,
  zip: string,
  state: string,
): string => {
  return street + ', ' + city + ', ' + state + ' ' + zip;
};

/**
 * Formats address components into a display string with optional components
 * @param street - Street address
 * @param city - Optional city name
 * @param state - Optional state abbreviation
 * @param zip - Optional ZIP code
 * @returns Formatted address display string
 */
export const getAddressDisplay = (
  street: string,
  city?: string,
  state?: string,
  zip?: string,
): string => {
  // <RatsText translate={false} text={selectedJob.street} style={{ fontSize: fontSize.medium }} />
  // <RatsText translate={false} text={`${selectedJob.city}, ${selectedJob.state} ${selectedJob.zip}`} style={{ fontSize: fontSize.medium }} />
  let address = '';
  if (street) {
    address += street;
  }
  if (city) {
    address += street ? ', ' + city : city;
  }
  if (state) {
    address += city ? ', ' + state : state;
  }
  if (zip) {
    address += state ? ' ' + zip : zip;
  }
  return address;
};
