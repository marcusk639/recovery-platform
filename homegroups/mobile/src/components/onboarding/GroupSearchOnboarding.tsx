import React, {useState, useMemo, useEffect, useCallback} from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  ActivityIndicator,
  Dimensions,
  Platform,
  PermissionsAndroid,
} from 'react-native';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import Geolocation from '@react-native-community/geolocation';
import {PERMISSIONS, request, RESULTS} from 'react-native-permissions';
import {HomeGroup} from '../../types';
import {
  useGroupSearch,
  SearchInput,
  LocationPickerModal,
  formatGroupLocation,
  filterGroupsByQuery,
} from '../groups/search';

const {width} = Dimensions.get('window');

interface GroupSearchOnboardingProps {
  onSelectGroup: (group: HomeGroup) => void;
  onNotFound: () => void;
  mode: 'admin' | 'member';
  title?: string;
  subtitle?: string;
}

const GroupSearchOnboarding: React.FC<GroupSearchOnboardingProps> = ({
  onSelectGroup,
  onNotFound,
  mode,
  title = 'Find Your Group',
  subtitle = 'Search by group name or location',
}) => {
  const [showLocationPicker, setShowLocationPicker] = useState(false);
  const [locationPermissionDenied, setLocationPermissionDenied] =
    useState(false);
  const [fetchingLocation, setFetchingLocation] = useState(true);

  const {
    searchQuery,
    setSearchQuery,
    hasSearched,
    customLocation,
    isLoading,
    nearbyGroups,
    searchResults,
    handleLocationSelect,
    clearCustomLocation,
    searchByLocation,
  } = useGroupSearch({
    enableTextSearch: true, // Also enable text search for name-based queries
    initialRadius: 25,
    limit: 50, // Fetch more results to allow local filtering
  });

  // Request location permission and get current position on mount
  const requestLocationPermission = useCallback(async (): Promise<boolean> => {
    if (Platform.OS === 'ios') {
      const result = await request(PERMISSIONS.IOS.LOCATION_WHEN_IN_USE);
      return result === RESULTS.GRANTED;
    } else {
      try {
        const granted = await PermissionsAndroid.request(
          PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION,
          {
            title: 'Find Groups Near You',
            message:
              'Allow location access to automatically find recovery groups in your area.',
            buttonPositive: 'Allow',
            buttonNegative: 'Not Now',
          },
        );
        return granted === PermissionsAndroid.RESULTS.GRANTED;
      } catch (err) {
        console.warn('Location permission error:', err);
        return false;
      }
    }
  }, []);

  const getCurrentLocation = useCallback(() => {
    Geolocation.getCurrentPosition(
      position => {
        const {latitude, longitude} = position.coords;
        // Trigger search with user's location
        searchByLocation(latitude, longitude, 25);
        setFetchingLocation(false);
      },
      error => {
        console.error('Geolocation error:', error);
        setFetchingLocation(false);
        // If location fails, show the manual location picker prompt
        if (error.code === 1) {
          setLocationPermissionDenied(true);
        }
      },
      {enableHighAccuracy: false, timeout: 15000, maximumAge: 1000 * 60 * 5},
    );
  }, [searchByLocation]);

  // Auto-fetch location on component mount
  useEffect(() => {
    const initLocation = async () => {
      const hasPermission = await requestLocationPermission();
      if (hasPermission) {
        getCurrentLocation();
      } else {
        setLocationPermissionDenied(true);
        setFetchingLocation(false);
      }
    };

    initLocation();
  }, [requestLocationPermission, getCurrentLocation]);

  // Combine and filter results - prioritize location-based results if available
  const displayResults = useMemo(() => {
    let results: HomeGroup[] = [];

    // Prioritize nearby groups (from GPS or manual location selection)
    if (nearbyGroups.length > 0) {
      results = nearbyGroups;
    } else if (searchResults.length > 0) {
      // Fall back to text search results
      results = searchResults;
    }

    // Apply local text filter only if user has typed something
    if (searchQuery.trim()) {
      results = filterGroupsByQuery(results, searchQuery);
    }

    return results;
  }, [nearbyGroups, searchResults, searchQuery]);

  const onLocationSelected = (location: {
    address: string;
    latitude: number;
    longitude: number;
    placeName?: string;
  }) => {
    handleLocationSelect(location);
    setShowLocationPicker(false);
    // Trigger location-based search immediately
    searchByLocation(location.latitude, location.longitude, 25);
  };

  const renderGroupItem = ({item}: {item: HomeGroup}) => {
    const isClaimed = item.admins && item.admins.length > 0;
    const locationText = formatGroupLocation(item);

    return (
      <TouchableOpacity
        style={styles.groupItem}
        onPress={() => onSelectGroup(item)}
        testID={`group-search-item-${item.id}`}>
        <View style={styles.groupIcon}>
          <Icon name="account-group" size={24} color="#2196F3" />
        </View>
        <View style={styles.groupInfo}>
          <View style={styles.groupNameRow}>
            <Text style={styles.groupName} numberOfLines={1}>
              {item.name}
            </Text>
            {isClaimed && mode === 'admin' && (
              <View style={styles.claimedBadge}>
                <Icon name="check-circle" size={12} color="#4CAF50" />
                <Text style={styles.claimedText}>Managed</Text>
              </View>
            )}
          </View>
          {locationText ? (
            <View style={styles.locationRow}>
              <Icon name="map-marker" size={14} color="#757575" />
              <Text style={styles.locationText}>{locationText}</Text>
            </View>
          ) : null}
          <Text style={styles.memberCount}>
            {item.memberCount || 0} members
          </Text>
        </View>
        <Icon name="chevron-right" size={24} color="#BDBDBD" />
      </TouchableOpacity>
    );
  };

  const renderEmptyState = () => {
    // Initial loading state - fetching user's location
    if (fetchingLocation) {
      return (
        <View style={styles.emptyState}>
          <ActivityIndicator size="large" color="#2196F3" />
          <Text style={styles.emptyTitle}>Finding groups near you...</Text>
          <Text style={styles.emptyText}>
            We're getting your location to show nearby recovery groups.
          </Text>
        </View>
      );
    }

    // Searching for groups after location obtained
    if (isLoading) {
      return (
        <View style={styles.emptyState}>
          <ActivityIndicator size="large" color="#2196F3" />
          <Text style={styles.emptyText}>Searching...</Text>
        </View>
      );
    }

    // Location permission denied - prompt for manual search
    if (locationPermissionDenied && !hasSearched && !customLocation) {
      return (
        <View style={styles.emptyState}>
          <View style={styles.locationPromptIcon}>
            <Icon name="map-marker-radius" size={56} color="#2196F3" />
          </View>
          <Text style={styles.emptyTitle}>Find groups near you</Text>
          <Text style={styles.emptyText}>
            We couldn't get your location automatically. Search by location or
            group name to find groups in your area.
          </Text>
          <TouchableOpacity
            style={styles.primaryLocationButton}
            onPress={() => setShowLocationPicker(true)}
            testID="location-prompt-button">
            <Icon name="crosshairs-gps" size={20} color="#FFFFFF" />
            <Text style={styles.primaryLocationButtonText}>
              Search by Location
            </Text>
          </TouchableOpacity>
          <Text style={styles.orText}>or search by name above</Text>
        </View>
      );
    }

    // No results found
    if (hasSearched && displayResults.length === 0) {
      return (
        <View style={styles.emptyState}>
          <Icon name="emoticon-sad-outline" size={48} color="#BDBDBD" />
          <Text style={styles.emptyTitle}>No groups found</Text>
          <Text style={styles.emptyText}>
            {customLocation || nearbyGroups.length === 0
              ? 'No groups found near this location. Try expanding your search or searching by name.'
              : "We couldn't find a group matching your search. Try a different name or search by location."}
          </Text>
          <TouchableOpacity
            style={styles.secondaryLocationButton}
            onPress={() => setShowLocationPicker(true)}>
            <Icon name="map-marker" size={18} color="#2196F3" />
            <Text style={styles.secondaryLocationButtonText}>
              Try Different Location
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.notFoundButton}
            onPress={onNotFound}
            testID="group-not-found-button">
            <Text style={styles.notFoundButtonText}>
              Can't find your group?
            </Text>
          </TouchableOpacity>
        </View>
      );
    }

    return null;
  };

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>{title}</Text>
        <Text style={styles.subtitle}>{subtitle}</Text>
      </View>

      {/* Search Inputs */}
      <View style={styles.searchContainer}>
        {/* Show selected location banner if custom location is set */}
        {customLocation && (
          <View style={styles.locationBanner}>
            <Icon name="map-marker" size={18} color="#4CAF50" />
            <Text style={styles.locationBannerText} numberOfLines={1}>
              Searching near {customLocation.address.split(',')[0]}
            </Text>
            <TouchableOpacity
              onPress={clearCustomLocation}
              hitSlop={{top: 10, bottom: 10, left: 10, right: 10}}>
              <Icon name="close-circle" size={18} color="#757575" />
            </TouchableOpacity>
          </View>
        )}

        <SearchInput
          value={searchQuery}
          onChangeText={setSearchQuery}
          iconName="magnify"
          placeholder="Search by group name"
          testID="group-search-name-input"
        />

        {/* Location Search Button */}
        <TouchableOpacity
          style={styles.locationSearchButton}
          onPress={() => setShowLocationPicker(true)}
          testID="location-search-button">
          <Icon name="crosshairs-gps" size={18} color="#2196F3" />
          <Text style={styles.locationSearchButtonText}>
            {customLocation ? 'Change Location' : 'Search by Location'}
          </Text>
        </TouchableOpacity>
      </View>

      {/* Results */}
      <FlatList
        data={displayResults}
        renderItem={renderGroupItem}
        keyExtractor={item => item.id}
        contentContainerStyle={styles.listContent}
        ListEmptyComponent={renderEmptyState}
        keyboardShouldPersistTaps="handled"
        testID="group-search-results-list"
      />

      {/* Can't find link - always visible when there are results */}
      {hasSearched && displayResults.length > 0 && (
        <TouchableOpacity
          style={styles.bottomLink}
          onPress={onNotFound}
          testID="group-not-found-link">
          <Text style={styles.bottomLinkText}>
            Can't find your group? Create it or get help
          </Text>
          <Icon name="chevron-right" size={18} color="#2196F3" />
        </TouchableOpacity>
      )}

      {/* Location Picker Modal */}
      <LocationPickerModal
        visible={showLocationPicker}
        onClose={() => setShowLocationPicker(false)}
        onLocationSelect={onLocationSelected}
        title="Search by Location"
        label="Find groups near..."
        initialAddress={customLocation?.address}
      />
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    width,
    flex: 1,
    backgroundColor: '#FFFFFF',
  },
  header: {
    paddingHorizontal: 24,
    paddingTop: 20,
    paddingBottom: 16,
  },
  title: {
    fontSize: 24,
    fontWeight: '700',
    color: '#1A1A1A',
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 15,
    color: '#666666',
    lineHeight: 20,
  },
  searchContainer: {
    paddingHorizontal: 24,
    gap: 12,
    marginBottom: 16,
  },
  locationBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#E8F5E9',
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    gap: 8,
  },
  locationBannerText: {
    flex: 1,
    fontSize: 14,
    color: '#2E7D32',
    fontWeight: '500',
  },
  locationSearchButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#E3F2FD',
    borderRadius: 10,
    paddingVertical: 12,
    gap: 8,
  },
  locationSearchButtonText: {
    fontSize: 15,
    fontWeight: '600',
    color: '#2196F3',
  },
  listContent: {
    flexGrow: 1,
    paddingHorizontal: 24,
  },
  groupItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: '#F0F0F0',
  },
  groupIcon: {
    width: 48,
    height: 48,
    borderRadius: 12,
    backgroundColor: '#E3F2FD',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  groupInfo: {
    flex: 1,
  },
  groupNameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  groupName: {
    fontSize: 16,
    fontWeight: '600',
    color: '#1A1A1A',
    flex: 1,
  },
  claimedBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#E8F5E9',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 10,
    gap: 4,
  },
  claimedText: {
    fontSize: 11,
    fontWeight: '600',
    color: '#4CAF50',
  },
  locationRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 2,
    gap: 4,
  },
  locationText: {
    fontSize: 13,
    color: '#757575',
  },
  memberCount: {
    fontSize: 12,
    color: '#9E9E9E',
    marginTop: 2,
  },
  emptyState: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: 48,
    paddingHorizontal: 32,
  },
  locationPromptIcon: {
    width: 100,
    height: 100,
    borderRadius: 50,
    backgroundColor: '#E3F2FD',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 8,
  },
  emptyTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: '#1A1A1A',
    marginTop: 16,
    marginBottom: 12,
    textAlign: 'center',
  },
  emptyText: {
    fontSize: 15,
    color: '#666666',
    textAlign: 'center',
    lineHeight: 22,
    marginBottom: 8,
  },
  primaryLocationButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#2196F3',
    paddingVertical: 14,
    paddingHorizontal: 28,
    borderRadius: 12,
    marginTop: 20,
    gap: 10,
    shadowColor: '#2196F3',
    shadowOffset: {width: 0, height: 4},
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 4,
  },
  primaryLocationButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#FFFFFF',
  },
  orText: {
    fontSize: 13,
    color: '#9E9E9E',
    marginTop: 16,
  },
  secondaryLocationButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 12,
    paddingHorizontal: 20,
    marginTop: 16,
    gap: 6,
  },
  secondaryLocationButtonText: {
    fontSize: 14,
    fontWeight: '500',
    color: '#2196F3',
  },
  notFoundButton: {
    marginTop: 20,
    paddingVertical: 12,
    paddingHorizontal: 24,
    backgroundColor: '#F5F5F5',
    borderRadius: 24,
  },
  notFoundButtonText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#757575',
  },
  bottomLink: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 16,
    borderTopWidth: 1,
    borderTopColor: '#F0F0F0',
    backgroundColor: '#FAFAFA',
    gap: 4,
  },
  bottomLinkText: {
    fontSize: 14,
    color: '#2196F3',
    fontWeight: '500',
  },
});

export default GroupSearchOnboarding;
