import {HomeGroup} from '../../../types';

/**
 * Represents a custom location selected by the user
 */
export interface CustomLocation {
  latitude: number;
  longitude: number;
  address: string;
}

/**
 * Location data returned from the LocationPicker component
 */
export interface LocationPickerResult {
  address: string;
  latitude: number;
  longitude: number;
  placeName?: string;
}

/**
 * Props for group search functionality
 */
export interface GroupSearchOptions {
  /** Initial search radius in miles */
  initialRadius?: number;
  /** Maximum number of results to return */
  limit?: number;
  /** Whether to enable debounced text search */
  enableTextSearch?: boolean;
  /** Debounce delay in milliseconds */
  debounceMs?: number;
}

/**
 * Return type for the useGroupSearch hook
 */
export interface UseGroupSearchReturn {
  // State
  searchQuery: string;
  locationQuery: string;
  hasSearched: boolean;
  customLocation: CustomLocation | null;
  isLoading: boolean;
  searchResults: HomeGroup[];
  nearbyGroups: HomeGroup[];
  displayResults: HomeGroup[];

  // Actions
  setSearchQuery: (query: string) => void;
  setLocationQuery: (query: string) => void;
  handleSearch: () => void;
  handleLocationSelect: (location: LocationPickerResult) => void;
  clearCustomLocation: () => void;
  searchByLocation: (
    latitude: number,
    longitude: number,
    radius?: number,
  ) => void;
}
