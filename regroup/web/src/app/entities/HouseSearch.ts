import { Location } from './Meeting';

export interface HouseSearch {
  latitude?: number;
  longitude?: number;
  street?: string;
  city?: string;
  zipCode?: string;
  state?: string;
  distance?: number;
  filters?: HouseSearchFilter;
  place?: any
  houseName?: string;
}

export class HouseSearchFilter {
  gender: GenderFilter = '';
  type: '12 Step' | 'Faith Based' | 'Any';
  location: Location = { lat: null, lng: null, street: null, city: null, zip: null, state: null };
}

export const houseSearchTypes = {
  '12 Step': '12 Step',
  'Faith Based': 'Faith Based',
  Any: 'any'
};
export type GenderFilter = 'male' | 'female' | 'all' | 'non-binary' | '';
