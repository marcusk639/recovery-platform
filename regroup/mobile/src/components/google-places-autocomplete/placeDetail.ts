/**
 * Place Details from Places API (New), in the legacy shape the app reads.
 *
 * react-native-google-places-autocomplete maps the new API's suggestions back
 * to the legacy prediction shape, but hands Place Details to onPress as the
 * new API returns them: { location, addressComponents, formattedAddress,
 * displayName }. The callers (rats-text-input and rats-search-bar, through
 * util/address getPlaceAsAddress) read { geometry.location,
 * address_components }, so a pick crashed or did nothing.
 */

interface NewApiAddressComponent {
  longText?: string;
  shortText?: string;
  types?: string[];
}

interface NewApiPlaceDetail {
  id?: string;
  displayName?: { text?: string };
  formattedAddress?: string;
  location: { latitude: number; longitude: number };
  addressComponents?: NewApiAddressComponent[];
  [key: string]: unknown;
}

const isNewApiDetail = (detail: unknown): detail is NewApiPlaceDetail =>
  !!detail &&
  typeof detail === 'object' &&
  !('geometry' in detail) &&
  typeof (detail as NewApiPlaceDetail).location?.latitude === 'number';

/** A detail already in the legacy shape (e.g. Current Location) is returned as is. */
export const toLegacyPlaceDetail = <T>(detail: T): any => {
  if (!isNewApiDetail(detail)) {
    return detail;
  }
  return {
    ...detail,
    place_id: detail.id,
    name: detail.displayName?.text,
    formatted_address: detail.formattedAddress,
    address_components: (detail.addressComponents ?? []).map((component) => ({
      long_name: component.longText ?? '',
      short_name: component.shortText ?? '',
      types: component.types ?? [],
    })),
    geometry: {
      location: {
        lat: detail.location.latitude,
        lng: detail.location.longitude,
      },
    },
  };
};
