import React, {useState, useEffect} from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
  SafeAreaView,
  PermissionsAndroid,
  Platform,
  Modal,
} from 'react-native';
import {useNavigation} from '@react-navigation/native';
import {StackNavigationProp} from '@react-navigation/stack';
import auth from '@react-native-firebase/auth';
import {HomeGroup, MeetingType} from '../../types';
import Geolocation from '@react-native-community/geolocation';
import {useAppDispatch, useAppSelector} from '../../store';
import {selectUserData, fetchUserData} from '../../store/slices/authSlice';
import {selectGroupsError, joinGroup} from '../../store/slices/groupsSlice';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import {
  PERMISSIONS,
  request,
  RESULTS,
  openSettings,
} from 'react-native-permissions';

// Import shared components
import {
  useGroupSearch,
  SearchInput,
  LocationPickerModal,
  formatGroupLocation,
  filterGroupsByQuery,
  truncateAddress,
  CustomLocation,
} from '../../components/groups/search';
import AuthModal from '../../components/onboarding/AuthModal';

// Define a more specific type for the Home tab navigation
type HomeTabParams = {
  screen: 'GroupOverview';
  params: {
    groupId: string;
    groupName: string;
  };
};

// Define a composite type for nested navigation
type CompositeParamList = {
  Home: HomeTabParams;
  Meetings: undefined;
  Treasury: undefined;
  Profile: undefined;
  GroupSearch: undefined;
};

type GroupSearchScreenNavigationProp = StackNavigationProp<
  CompositeParamList,
  'GroupSearch'
>;

const GroupSearchScreen: React.FC = () => {
  const navigation = useNavigation<GroupSearchScreenNavigationProp>();
  const dispatch = useAppDispatch();

  // Use shared search hook
  const {
    searchQuery,
    setSearchQuery,
    hasSearched,
    customLocation,
    isLoading,
    nearbyGroups,
    handleLocationSelect,
    clearCustomLocation,
    searchByLocation,
  } = useGroupSearch({
    enableTextSearch: false, // We'll filter locally instead
    initialRadius: 25,
  });

  // Local state for UI and filtering
  const [joining, setJoining] = useState<string | null>(null);
  const [userLocation, setUserLocation] = useState<{
    latitude: number;
    longitude: number;
  } | null>(null);
  const [locationError, setLocationError] = useState<string | null>(null);
  const [selectedTypeFilter, setSelectedTypeFilter] = useState<
    MeetingType | 'All'
  >('All');
  const [searchRadius, setSearchRadius] = useState<number>(25);
  const [usingCustomLocation, setUsingCustomLocation] = useState(false);

  // Modal state
  const [showLocationPicker, setShowLocationPicker] = useState(false);
  const [showTypeFilterModal, setShowTypeFilterModal] = useState(false);
  const [showRadiusFilterModal, setShowRadiusFilterModal] = useState(false);
  const [showAuthModal, setShowAuthModal] = useState(false);
  const [pendingJoinGroup, setPendingJoinGroup] = useState<HomeGroup | null>(
    null,
  );

  // Get user data from Redux
  const userData = useAppSelector(selectUserData);
  const userJoinedGroups = userData?.homeGroups || [];
  const groupsError = useAppSelector(selectGroupsError);

  // Filter groups locally
  const filteredGroups = React.useMemo(() => {
    let result = [...nearbyGroups];

    // Apply type filter
    if (selectedTypeFilter !== 'All') {
      result = result.filter(group => group.type === selectedTypeFilter);
    }

    // Apply text search filter
    if (searchQuery.trim()) {
      result = filterGroupsByQuery(result, searchQuery);
    }

    return result;
  }, [nearbyGroups, selectedTypeFilter, searchQuery]);

  // Define Meeting Types for filter
  const meetingTypes: (MeetingType | 'All')[] = [
    'All',
    'AA',
    'NA',
    'Celebrate Recovery',
    'Custom',
  ];

  // Fetch Location on Mount
  useEffect(() => {
    if (!usingCustomLocation) {
      requestLocationPermission();
    }
  }, [usingCustomLocation]);

  // Load groups once location is available
  useEffect(() => {
    if (userLocation && !usingCustomLocation) {
      searchByLocation(
        userLocation.latitude,
        userLocation.longitude,
        searchRadius,
      );
    } else if (customLocation && usingCustomLocation) {
      searchByLocation(
        customLocation.latitude,
        customLocation.longitude,
        searchRadius,
      );
    } else if (locationError && !usingCustomLocation) {
      Alert.alert(
        'Location Error',
        'Could not get your location. Please use the location search to find groups.',
      );
    }
  }, [
    userLocation,
    customLocation,
    locationError,
    usingCustomLocation,
    searchRadius,
    searchByLocation,
  ]);

  // Handle Redux errors
  useEffect(() => {
    if (groupsError) {
      Alert.alert(
        'Error',
        'Failed to load nearby groups. Please try again later.',
      );
    }
  }, [groupsError]);

  const requestLocationPermission = async () => {
    if (Platform.OS === 'ios') {
      try {
        const result = await request(PERMISSIONS.IOS.LOCATION_WHEN_IN_USE);
        if (result === RESULTS.GRANTED) {
          getOneTimeLocation();
          return true;
        } else if (result === RESULTS.BLOCKED) {
          Alert.alert(
            'Location Permission Required',
            'Please enable location access in Settings to find groups near you.',
            [
              {
                text: 'Open Settings',
                onPress: () => openSettings(),
              },
              {
                text: 'Search Manually',
                onPress: () => {
                  setShowLocationPicker(true);
                },
                style: 'cancel',
              },
            ],
          );
          setLocationError(
            'Location access is blocked. Please enable it in Settings.',
          );
          return false;
        } else {
          setLocationError(
            'Location access denied. Please search for a location manually.',
          );
          setShowLocationPicker(true);
          return false;
        }
      } catch (err) {
        console.warn(err);
        setLocationError('Error requesting location permission');
        return false;
      }
    } else {
      try {
        const granted = await PermissionsAndroid.request(
          PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION,
          {
            title: 'Location Access Required',
            message:
              'This app needs to access your location to find nearby groups.',
            buttonPositive: 'OK',
            buttonNegative: 'Not Now',
          },
        );
        if (granted === PermissionsAndroid.RESULTS.GRANTED) {
          getOneTimeLocation();
          return true;
        } else {
          setLocationError(
            'Location access denied. Please search for a location manually.',
          );
          setShowLocationPicker(true);
          return false;
        }
      } catch (err) {
        console.warn(err);
        setLocationError('Error requesting location permission');
        return false;
      }
    }
  };

  const getOneTimeLocation = () => {
    setLocationError(null);
    Geolocation.getCurrentPosition(
      position => {
        setUserLocation({
          latitude: position.coords.latitude,
          longitude: position.coords.longitude,
        });
      },
      error => {
        console.error('Geolocation Error:', error);
        if (error.code === 1) {
          setLocationError(
            'Location access denied. Please search for a location manually.',
          );
          setShowLocationPicker(true);
        } else {
          setLocationError(
            'Unable to get your location. Please search manually.',
          );
        }
      },
      {enableHighAccuracy: false, timeout: 30000, maximumAge: 1000 * 60 * 5},
    );
  };

  const handleJoinGroup = async (group: HomeGroup) => {
    if (!group.id) return;

    const currentUser = auth().currentUser;
    if (!currentUser) {
      // Store the group and show auth modal
      setPendingJoinGroup(group);
      setShowAuthModal(true);
      return;
    }

    await completeJoinGroup(group);
  };

  const completeJoinGroup = async (group: HomeGroup) => {
    if (!group.id) return;
    try {
      setJoining(group.id);

      const currentUser = auth().currentUser;
      if (!currentUser) {
        return;
      }

      await dispatch(joinGroup(group.id)).unwrap();
      await dispatch(fetchUserData(currentUser.uid)).unwrap();

      Alert.alert('Success', `You've joined ${group.name}!`, [
        {
          text: 'View Group',
          onPress: () =>
            navigation.navigate('Home', {
              screen: 'GroupOverview',
              params: {
                groupId: group.id!,
                groupName: group.name,
              },
            }),
        },
        {
          text: 'Stay Here',
          style: 'cancel',
        },
      ]);
    } catch (error: any) {
      console.error('Error joining group:', error);
      Alert.alert(
        'Error',
        error.message || 'Failed to join group. Please try again.',
      );
    } finally {
      setJoining(null);
    }
  };

  const handleAuthSuccess = () => {
    setShowAuthModal(false);
    if (pendingJoinGroup) {
      completeJoinGroup(pendingJoinGroup);
      setPendingJoinGroup(null);
    }
  };

  const isUserJoinedGroup = (groupId?: string) => {
    if (!groupId) return false;
    return userJoinedGroups.includes(groupId);
  };

  const onLocationSelected = (location: {
    address: string;
    latitude: number;
    longitude: number;
    placeName?: string;
  }) => {
    handleLocationSelect(location);
    setUsingCustomLocation(true);
    setShowLocationPicker(false);
  };

  const handleViewDetails = (group: HomeGroup) => {
    navigation.navigate('Home', {
      screen: 'GroupOverview',
      params: {
        groupId: group.id!,
        groupName: group.name,
      },
    });
  };

  const handleClearCustomLocation = () => {
    clearCustomLocation();
    setUsingCustomLocation(false);
  };

  const getLocationChipText = () => {
    if (customLocation && usingCustomLocation) {
      return truncateAddress(customLocation.address, 15);
    }
    return 'Search Location';
  };

  const renderGroupItem = ({item}: {item: HomeGroup}) => {
    const locationText = formatGroupLocation(item);

    return (
      <View style={styles.groupCard}>
        <View style={styles.groupHeader}>
          <Text style={styles.groupName}>{item.name}</Text>
          {isUserJoinedGroup(item.id) ? (
            <View style={styles.joinedBadge}>
              <Text style={styles.joinedBadgeText}>Joined</Text>
            </View>
          ) : (
            <TouchableOpacity
              style={styles.joinButton}
              onPress={() => handleJoinGroup(item)}
              disabled={joining === item.id}>
              {joining === item.id ? (
                <ActivityIndicator size="small" color="#FFFFFF" />
              ) : (
                <Text style={styles.joinButtonText}>Join</Text>
              )}
            </TouchableOpacity>
          )}
        </View>

        {locationText && (
          <View style={styles.groupLocation}>
            <Icon name="map-marker" size={14} color="#757575" />
            <Text style={styles.groupLocationText}>{locationText}</Text>
          </View>
        )}

        <Text style={styles.groupDescription}>{item.description}</Text>

        <View style={styles.groupDetails}>
          <Text style={styles.groupDetailText}>
            <Text style={styles.groupDetailLabel}>Type: </Text>
            {item.type}
          </Text>
          <Text style={styles.groupDetailText}>
            <Text style={styles.groupDetailLabel}>Members: </Text>
            {item.memberCount}
          </Text>
          {item.distanceInKm !== undefined && (
            <Text style={styles.groupDetailText}>
              <Text style={styles.groupDetailLabel}>Distance: </Text>
              {item.distanceInKm.toFixed(1)} miles
            </Text>
          )}
        </View>

        <TouchableOpacity
          style={styles.viewButton}
          onPress={() => handleViewDetails(item)}>
          <Text style={styles.viewButtonText}>View Details</Text>
        </TouchableOpacity>
      </View>
    );
  };

  const renderRadiusFilter = () => (
    <TouchableOpacity
      style={styles.filterButton}
      onPress={() => setShowRadiusFilterModal(true)}>
      <Icon name="map-marker-radius" size={18} color="#2196F3" />
      <Text style={styles.filterButtonText}>{searchRadius} miles</Text>
    </TouchableOpacity>
  );

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.headerContainer}>
        <Text style={styles.headerTitle}>Find Groups</Text>
        <Text style={styles.headerSubtitle}>
          {customLocation && usingCustomLocation
            ? `Showing groups near ${truncateAddress(
                customLocation.address,
                20,
              )}`
            : userLocation
            ? `Showing groups within ${searchRadius} miles of your location`
            : 'Search for recovery groups'}
        </Text>
      </View>

      {locationError && !userLocation && (
        <View style={styles.errorContainer}>
          <Text style={styles.errorText}>{locationError}</Text>
          <TouchableOpacity
            style={styles.retryButton}
            onPress={() => setShowLocationPicker(true)}>
            <Text style={styles.retryButtonText}>Search Location</Text>
          </TouchableOpacity>
        </View>
      )}

      <View style={styles.searchContainer}>
        {/* Search by name/description using shared SearchInput */}
        <SearchInput
          value={searchQuery}
          onChangeText={setSearchQuery}
          iconName="magnify"
          placeholder="Search by name or description"
          containerStyle={styles.searchInputContainer}
          testID="group-search-input"
        />

        {/* Filter and Location Search Buttons */}
        <View style={styles.filterButtonsRow}>
          {/* Filter by Type */}
          <TouchableOpacity
            style={styles.filterButton}
            onPress={() => setShowTypeFilterModal(true)}>
            <Icon name="filter-variant" size={18} color="#2196F3" />
            <Text style={styles.filterButtonText}>
              {selectedTypeFilter === 'All' ? 'All Types' : selectedTypeFilter}
            </Text>
          </TouchableOpacity>

          {/* Radius Filter */}
          {(userLocation || (customLocation && usingCustomLocation)) &&
            renderRadiusFilter()}

          {/* Location Search */}
          <TouchableOpacity
            style={styles.locationButton}
            onPress={() => setShowLocationPicker(true)}>
            <Icon name="map-marker" size={18} color="#2196F3" />
            <Text style={styles.locationButtonText} numberOfLines={1}>
              {getLocationChipText()}
            </Text>
          </TouchableOpacity>
        </View>

        {/* Clear custom location button */}
        {customLocation && usingCustomLocation && (
          <TouchableOpacity
            style={styles.clearLocationButton}
            onPress={handleClearCustomLocation}>
            <Icon name="close-circle" size={16} color="#757575" />
            <Text style={styles.clearLocationText}>Use my location</Text>
          </TouchableOpacity>
        )}
      </View>

      {isLoading ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#2196F3" />
        </View>
      ) : (
        <FlatList
          data={filteredGroups}
          renderItem={renderGroupItem}
          keyExtractor={item => item.id!}
          contentContainerStyle={styles.groupList}
          ListEmptyComponent={
            <View style={styles.emptyContainer}>
              <Text style={styles.emptyText}>
                {!userLocation && !customLocation
                  ? 'Search for a location to find groups'
                  : groupsError
                  ? 'Error loading groups. Please try again later.'
                  : nearbyGroups.length === 0
                  ? `No groups found within ${searchRadius} miles`
                  : 'No groups match your current filters'}
              </Text>
              {groupsError && (
                <TouchableOpacity
                  style={styles.retryButton}
                  onPress={() => {
                    if (usingCustomLocation && customLocation) {
                      searchByLocation(
                        customLocation.latitude,
                        customLocation.longitude,
                        searchRadius,
                      );
                    } else if (userLocation) {
                      searchByLocation(
                        userLocation.latitude,
                        userLocation.longitude,
                        searchRadius,
                      );
                    }
                  }}>
                  <Text style={styles.retryButtonText}>Retry</Text>
                </TouchableOpacity>
              )}
            </View>
          }
        />
      )}

      {/* Location Picker Modal - using shared component */}
      <LocationPickerModal
        visible={showLocationPicker}
        onClose={() => setShowLocationPicker(false)}
        onLocationSelect={onLocationSelected}
        title="Search Location"
        label="Search for groups near..."
        initialAddress={customLocation?.address}
      />

      {/* Type Filter Modal */}
      <Modal
        visible={showTypeFilterModal}
        animationType="slide"
        transparent={true}
        onRequestClose={() => setShowTypeFilterModal(false)}>
        <TouchableOpacity
          style={styles.modalOverlay}
          activeOpacity={1}
          onPress={() => setShowTypeFilterModal(false)}>
          <View style={styles.filterModalContainer}>
            <View style={styles.pullIndicator} />
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Group Type</Text>
              <TouchableOpacity
                onPress={() => setShowTypeFilterModal(false)}
                style={styles.closeButton}>
                <Icon name="close" size={24} color="#2196F3" />
              </TouchableOpacity>
            </View>

            <FlatList
              data={meetingTypes}
              keyExtractor={item => item}
              renderItem={({item: type}) => (
                <TouchableOpacity
                  key={type}
                  style={[
                    styles.typeFilterButton,
                    selectedTypeFilter === type &&
                      styles.typeFilterButtonActive,
                  ]}
                  onPress={() => {
                    setSelectedTypeFilter(type);
                    setShowTypeFilterModal(false);
                  }}>
                  <View style={styles.typeFilterButtonContent}>
                    <View style={styles.typeIconContainer}>
                      {type === 'AA' && (
                        <Icon
                          name="alpha-a"
                          size={24}
                          color={
                            selectedTypeFilter === type ? '#FFFFFF' : '#2196F3'
                          }
                        />
                      )}
                      {type === 'NA' && (
                        <Icon
                          name="alpha-n"
                          size={24}
                          color={
                            selectedTypeFilter === type ? '#FFFFFF' : '#2196F3'
                          }
                        />
                      )}
                      {type === 'Celebrate Recovery' && (
                        <Icon
                          name="party-popper"
                          size={24}
                          color={
                            selectedTypeFilter === type ? '#FFFFFF' : '#2196F3'
                          }
                        />
                      )}
                      {type === 'Custom' && (
                        <Icon
                          name="cog"
                          size={24}
                          color={
                            selectedTypeFilter === type ? '#FFFFFF' : '#2196F3'
                          }
                        />
                      )}
                      {type === 'All' && (
                        <Icon
                          name="filter-variant-remove"
                          size={24}
                          color={
                            selectedTypeFilter === type ? '#FFFFFF' : '#2196F3'
                          }
                        />
                      )}
                    </View>
                    <Text
                      style={[
                        styles.typeFilterButtonText,
                        selectedTypeFilter === type &&
                          styles.typeFilterButtonTextActive,
                      ]}>
                      {type}
                    </Text>
                  </View>
                  {selectedTypeFilter === type && (
                    <Icon
                      name="check"
                      size={24}
                      color="#FFFFFF"
                      style={styles.typeFilterCheckIcon}
                    />
                  )}
                </TouchableOpacity>
              )}
            />
          </View>
        </TouchableOpacity>
      </Modal>

      {/* Radius Filter Modal */}
      <Modal
        visible={showRadiusFilterModal}
        animationType="slide"
        transparent={true}
        onRequestClose={() => setShowRadiusFilterModal(false)}>
        <TouchableOpacity
          style={styles.modalOverlay}
          activeOpacity={1}
          onPress={() => setShowRadiusFilterModal(false)}>
          <View style={styles.filterModalContainer}>
            <View style={styles.pullIndicator} />
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Search Radius</Text>
              <TouchableOpacity
                onPress={() => setShowRadiusFilterModal(false)}
                style={styles.closeButton}>
                <Icon name="close" size={24} color="#2196F3" />
              </TouchableOpacity>
            </View>

            <FlatList
              data={[5, 10, 25, 50, 100]}
              keyExtractor={item => item.toString()}
              renderItem={({item: radius}) => (
                <TouchableOpacity
                  style={[
                    styles.typeFilterButton,
                    searchRadius === radius && styles.typeFilterButtonActive,
                  ]}
                  onPress={() => {
                    setSearchRadius(radius);
                    if (usingCustomLocation && customLocation) {
                      searchByLocation(
                        customLocation.latitude,
                        customLocation.longitude,
                        radius,
                      );
                    } else if (userLocation) {
                      searchByLocation(
                        userLocation.latitude,
                        userLocation.longitude,
                        radius,
                      );
                    }
                    setShowRadiusFilterModal(false);
                  }}>
                  <View style={styles.typeFilterButtonContent}>
                    <Icon
                      name="map-marker-radius"
                      size={24}
                      color={searchRadius === radius ? '#FFFFFF' : '#2196F3'}
                    />
                    <Text
                      style={[
                        styles.typeFilterButtonText,
                        searchRadius === radius &&
                          styles.typeFilterButtonTextActive,
                      ]}>
                      {radius} miles
                    </Text>
                  </View>
                  {searchRadius === radius && (
                    <Icon
                      name="check"
                      size={24}
                      color="#FFFFFF"
                      style={styles.typeFilterCheckIcon}
                    />
                  )}
                </TouchableOpacity>
              )}
            />
          </View>
        </TouchableOpacity>
      </Modal>

      {/* Auth Modal for unauthenticated users */}
      <AuthModal
        visible={showAuthModal}
        onClose={() => {
          setShowAuthModal(false);
          setPendingJoinGroup(null);
        }}
        onAuthSuccess={handleAuthSuccess}
        title="Create Account to Join"
        subtitle={
          pendingJoinGroup
            ? `Sign up to join ${pendingJoinGroup.name}`
            : 'Sign up to join this group'
        }
      />
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F5F5F5',
  },
  headerContainer: {
    padding: 16,
    backgroundColor: '#2196F3',
  },
  headerTitle: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#FFFFFF',
    marginBottom: 4,
  },
  headerSubtitle: {
    fontSize: 16,
    color: 'rgba(255, 255, 255, 0.8)',
  },
  searchContainer: {
    padding: 16,
    paddingBottom: 8,
    backgroundColor: '#FFFFFF',
    borderBottomWidth: 1,
    borderBottomColor: '#EEEEEE',
  },
  searchInputContainer: {
    marginBottom: 12,
  },
  filterButtonsRow: {
    flexDirection: 'row',
    justifyContent: 'flex-start',
    marginBottom: 12,
    gap: 8,
  },
  filterButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#E3F2FD',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 16,
  },
  filterButtonText: {
    color: '#2196F3',
    fontWeight: '600',
    fontSize: 14,
    marginLeft: 4,
  },
  locationButton: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 8,
    backgroundColor: '#E3F2FD',
    borderRadius: 16,
    maxWidth: 150,
  },
  locationButtonText: {
    color: '#2196F3',
    fontWeight: '600',
    fontSize: 14,
    marginLeft: 4,
    flexShrink: 1,
  },
  clearLocationButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 8,
    gap: 4,
  },
  clearLocationText: {
    fontSize: 13,
    color: '#757575',
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  groupList: {
    padding: 16,
  },
  groupCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
    shadowColor: '#000',
    shadowOffset: {width: 0, height: 1},
    shadowOpacity: 0.1,
    shadowRadius: 2,
    elevation: 2,
  },
  groupHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  groupName: {
    fontSize: 18,
    fontWeight: '600',
    color: '#212121',
    flex: 1,
    marginRight: 8,
  },
  joinButton: {
    backgroundColor: '#2196F3',
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 16,
    minWidth: 80,
    minHeight: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  joinButtonText: {
    color: '#FFFFFF',
    fontWeight: '600',
    fontSize: 14,
  },
  joinedBadge: {
    backgroundColor: '#E8F5E9',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
  },
  joinedBadgeText: {
    color: '#4CAF50',
    fontWeight: '600',
    fontSize: 14,
  },
  groupLocation: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
  },
  groupLocationText: {
    fontSize: 13,
    color: '#757575',
    marginLeft: 4,
  },
  groupDescription: {
    fontSize: 14,
    color: '#424242',
    marginBottom: 12,
    lineHeight: 20,
  },
  groupDetails: {
    backgroundColor: '#F5F5F5',
    borderRadius: 8,
    padding: 12,
    marginBottom: 12,
  },
  groupDetailText: {
    fontSize: 14,
    color: '#616161',
    marginBottom: 4,
  },
  groupDetailLabel: {
    fontWeight: '600',
    color: '#424242',
  },
  viewButton: {
    padding: 12,
    borderWidth: 1,
    borderColor: '#2196F3',
    borderRadius: 8,
    alignItems: 'center',
  },
  viewButtonText: {
    color: '#2196F3',
    fontWeight: '600',
    fontSize: 14,
  },
  emptyContainer: {
    padding: 32,
    alignItems: 'center',
  },
  emptyText: {
    fontSize: 16,
    color: '#9E9E9E',
    textAlign: 'center',
  },
  retryButton: {
    marginTop: 16,
    paddingHorizontal: 20,
    paddingVertical: 12,
    backgroundColor: '#2196F3',
    borderRadius: 8,
    minHeight: 44,
    justifyContent: 'center',
    alignItems: 'center',
  },
  retryButtonText: {
    color: '#FFFFFF',
    fontWeight: '600',
    fontSize: 14,
  },
  errorContainer: {
    padding: 16,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#FF0000',
    borderRadius: 8,
    marginBottom: 16,
    marginHorizontal: 16,
  },
  errorText: {
    color: '#FF0000',
    fontSize: 16,
    marginBottom: 16,
  },
  // Modal styles
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'flex-end',
  },
  filterModalContainer: {
    backgroundColor: '#FFFFFF',
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    padding: 16,
    paddingBottom: 34,
    maxHeight: '70%',
  },
  pullIndicator: {
    width: 40,
    height: 5,
    backgroundColor: '#E0E0E0',
    borderRadius: 2.5,
    marginBottom: 16,
    alignSelf: 'center',
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#212121',
  },
  closeButton: {
    padding: 8,
  },
  typeFilterButton: {
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#EEEEEE',
    backgroundColor: '#FFFFFF',
    marginBottom: 8,
    borderRadius: 8,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  typeFilterButtonActive: {
    backgroundColor: '#2196F3',
  },
  typeFilterButtonContent: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  typeIconContainer: {
    marginRight: 12,
    width: 24,
    alignItems: 'center',
    justifyContent: 'center',
  },
  typeFilterButtonText: {
    fontSize: 16,
    fontWeight: '500',
    color: '#212121',
    textAlign: 'center',
  },
  typeFilterButtonTextActive: {
    color: '#FFFFFF',
  },
  typeFilterCheckIcon: {
    position: 'absolute',
    right: 16,
    top: 16,
  },
});

export default GroupSearchScreen;
