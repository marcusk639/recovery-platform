import {useState, useCallback, useEffect} from 'react';
import {Keyboard} from 'react-native';
import {useAppDispatch, useAppSelector} from '../../../store';
import {
  searchGroups,
  searchGroupsByLocation,
  selectSearchResults,
  selectNearbyGroups,
  selectGroupsStatus,
  clearSearchResults,
} from '../../../store/slices/groupsSlice';
import debounce from 'lodash/debounce';
import {
  CustomLocation,
  LocationPickerResult,
  GroupSearchOptions,
  UseGroupSearchReturn,
} from './types';

const DEFAULT_OPTIONS: GroupSearchOptions = {
  initialRadius: 25,
  limit: 20,
  enableTextSearch: true,
  debounceMs: 400,
};

/**
 * Custom hook for group search functionality
 * Handles both text-based search and location-based search
 */
export function useGroupSearch(
  options: GroupSearchOptions = {},
): UseGroupSearchReturn {
  const {initialRadius, limit, enableTextSearch, debounceMs} = {
    ...DEFAULT_OPTIONS,
    ...options,
  };

  const dispatch = useAppDispatch();
  const searchResults = useAppSelector(selectSearchResults);
  const nearbyGroups = useAppSelector(selectNearbyGroups);
  const status = useAppSelector(selectGroupsStatus);

  // Search state
  const [searchQuery, setSearchQuery] = useState('');
  const [locationQuery, setLocationQuery] = useState('');
  const [hasSearched, setHasSearched] = useState(false);
  const [customLocation, setCustomLocation] = useState<CustomLocation | null>(
    null,
  );

  // Determine which results to display
  const displayResults = customLocation ? nearbyGroups : searchResults;
  const isLoading = status === 'loading';

  // Debounced text search function
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const debouncedSearch = useCallback(
    debounce((name: string, location: string) => {
      if (
        enableTextSearch &&
        !customLocation &&
        (name.trim().length >= 2 || location.trim().length >= 2)
      ) {
        dispatch(
          searchGroups({
            name: name.trim(),
            location: location.trim(),
            limit: limit!,
          }),
        );
        setHasSearched(true);
      }
    }, debounceMs),
    [dispatch, customLocation, enableTextSearch, limit, debounceMs],
  );

  // Effect for debounced text search
  useEffect(() => {
    if (!customLocation && enableTextSearch) {
      debouncedSearch(searchQuery, locationQuery);
    }
    return () => debouncedSearch.cancel();
  }, [
    searchQuery,
    locationQuery,
    debouncedSearch,
    customLocation,
    enableTextSearch,
  ]);

  // Clear results on unmount
  useEffect(() => {
    return () => {
      dispatch(clearSearchResults());
    };
  }, [dispatch]);

  // Handle manual search trigger
  const handleSearch = useCallback(() => {
    Keyboard.dismiss();
    if (customLocation) {
      dispatch(
        searchGroupsByLocation({
          latitude: customLocation.latitude,
          longitude: customLocation.longitude,
          radius: initialRadius!,
        }),
      );
      setHasSearched(true);
    } else if (
      searchQuery.trim().length >= 2 ||
      locationQuery.trim().length >= 2
    ) {
      dispatch(
        searchGroups({
          name: searchQuery.trim(),
          location: locationQuery.trim(),
          limit: limit!,
        }),
      );
      setHasSearched(true);
    }
  }, [
    customLocation,
    searchQuery,
    locationQuery,
    dispatch,
    initialRadius,
    limit,
  ]);

  // Handle location selection from LocationPicker
  const handleLocationSelect = useCallback(
    (location: LocationPickerResult) => {
      setCustomLocation({
        latitude: location.latitude,
        longitude: location.longitude,
        address: location.address,
      });
      setHasSearched(true);

      dispatch(
        searchGroupsByLocation({
          latitude: location.latitude,
          longitude: location.longitude,
          radius: initialRadius!,
        }),
      );
    },
    [dispatch, initialRadius],
  );

  // Clear custom location and reset to text search
  const clearCustomLocation = useCallback(() => {
    setCustomLocation(null);
    setHasSearched(false);
  }, []);

  // Search by coordinates
  const searchByLocation = useCallback(
    (latitude: number, longitude: number, radius: number = initialRadius!) => {
      dispatch(
        searchGroupsByLocation({
          latitude,
          longitude,
          radius,
        }),
      );
      setHasSearched(true);
    },
    [dispatch, initialRadius],
  );

  return {
    // State
    searchQuery,
    locationQuery,
    hasSearched,
    customLocation,
    isLoading,
    searchResults,
    nearbyGroups,
    displayResults,

    // Actions
    setSearchQuery,
    setLocationQuery,
    handleSearch,
    handleLocationSelect,
    clearCustomLocation,
    searchByLocation,
  };
}

export default useGroupSearch;
