import { Location } from './GeocodeResponse';

export interface HouseSearch {
  latitude: number;
  longitude: number;
  street: string;
  city: string;
  zipCode: string;
  state: string;
  distance: number;
  filters: HouseSearchFilter;
  place: unknown;
  houseName: string;
}

export class HouseSearchFilter {
  gender: 'male' | 'female' | 'non-binary' | 'all' | '' = '';
  type: '12 Step' | 'Faith Based' | 'Any' = 'Any';
  location: Location = { lat: 0, lng: 0 };
}
