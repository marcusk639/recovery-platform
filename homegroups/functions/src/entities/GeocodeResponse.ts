export interface GeocodeResponse {
  plus_code: PlusCode;
  results: Result[];
  status: string;
}

export interface PlusCode {
  compound_code: string;
  global_code: string;
}

export interface Result {
  address_components: AddressComponent[];
  formatted_address: string;
  geometry: Geometry;
  place_id: string;
  types: string[];
}

export interface AddressComponent {
  long_name: string;
  short_name: string;
  types: string[];
}

export interface Geometry {
  bounds?: Bounds;
  location: Location;
  location_type: string;
  viewport: Bounds;
}

export interface Bounds {
  northeast: Location;
  southwest: Location;
}

export interface Location {
  lat: number;
  lng: number;
}

export interface AreaMeeting {
  value: string;
  formatted_address: string;
  latitude: string;
  longitude: string;
  region: string;
  notes: string;
  tokens: string[];
  type: Type;
  url: string;
}

export enum Type {
  Location = "location"
}
