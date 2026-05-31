import React, {useState, useEffect, useCallback, useMemo} from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  TextInput,
  SafeAreaView,
  ActivityIndicator,
  Alert,
  Modal,
  ScrollView,
  RefreshControl,
  Platform,
  Linking,
  PermissionsAndroid,
  Pressable,
} from 'react-native';
import Geolocation from '@react-native-community/geolocation';
import {useNavigation} from '@react-navigation/native';
import {StackNavigationProp} from '@react-navigation/stack';
import Slider from '@react-native-community/slider';
import {useAppDispatch, useAppSelector} from '../../store';
import {
  setUserLocation as setReduxUserLocation,
  fetchMeetings,
  filterMeetings,
  toggleFavoriteMeeting,
  selectFilteredMeetings,
  selectMeetingsStatus,
  selectMeetingsError,
  selectUserLocation as selectReduxUserLocation,
  selectFavoriteMeetingsCount,
} from '../../store/slices/meetingsSlice';
import {fetchGroupById, selectGroupById} from '../../store/slices/groupsSlice';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import LocationPicker from '../../components/groups/LocationPicker';
import moment from 'moment';
import OfflineBanner from '../../components/common/OfflineBanner';

// Types for meetings data
import {
  Meeting,
  MeetingType,
  Location,
  DaysAndTimes,
  MeetingFilters,
} from '../../types';

const MeetingsScreen: React.FC = () => {
  const navigation = useNavigation<StackNavigationProp<any>>();
  const dispatch = useAppDispatch();

  // Get meetings from Redux
  const filteredMeetings = useAppSelector(selectFilteredMeetings);
  const status = useAppSelector(selectMeetingsStatus);
  const error = useAppSelector(selectMeetingsError);
  const reduxUserLocation = useAppSelector(selectReduxUserLocation);
  const favoritesCount = useAppSelector(selectFavoriteMeetingsCount);
  const hasMeetings = useAppSelector(
    state => state.meetings.filteredIds.length > 0,
  );

  // UI State
  const [refreshing, setRefreshing] = useState(false);
  const [selectedMeeting, setSelectedMeeting] = useState<Meeting | null>(null);
  const [meetingDetailsVisible, setMeetingDetailsVisible] = useState(false);
  const [showLocationPicker, setShowLocationPicker] = useState(false);
  const [showFilterModal, setShowFilterModal] = useState(false);
  const [selectedGroup, setSelectedGroup] = useState<any>(null);

  // Search State
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedTypeFilter, setSelectedTypeFilter] = useState<
    MeetingType | 'All'
  >('All');
  const [showOnline, setShowOnline] = useState(true);
  const [showInPerson, setShowInPerson] = useState(true);
  const [selectedDayFilter, setSelectedDayFilter] = useState<
    keyof DaysAndTimes | null
  >(null);
  const [selectedTimeFilter, setSelectedTimeFilter] = useState<string | null>(
    null,
  );
  const [showFavoritesOnly, setShowFavoritesOnly] = useState<boolean>(false);

  // Location State
  const [locationError, setLocationError] = useState<string | null>(null);
  const [currentUserLocation, setCurrentUserLocation] =
    useState<Location | null>(reduxUserLocation);
  const [customLocation, setCustomLocation] = useState<Location | null>(null);
  const [customLocationAddress, setCustomLocationAddress] = useState<
    string | null
  >(null);
  const [usingCustomLocation, setUsingCustomLocation] = useState(false);

  // Constants
  const meetingTypes: (MeetingType | 'All')[] = [
    'All',
    'AA',
    'NA',
    'Celebrate Recovery',
    'Custom',
  ];

  const daysOfWeek = [
    'All',
    'Sunday',
    'Monday',
    'Tuesday',
    'Wednesday',
    'Thursday',
    'Friday',
    'Saturday',
  ];

  const timeOfDayOptions = ['All', 'Morning', 'Afternoon', 'Evening'];

  // Loading states
  const isLoading = status === 'loading';
  const isSearching = status === 'loading' && hasMeetings; // Show searching state if we're loading and already have meetings

  // Initial data fetch
  useEffect(() => {
    if (!hasMeetings && !locationError) {
      if (!usingCustomLocation) {
        getUserLocation();
      } else if (customLocation) {
        fetchMeetingsWithLocation(customLocation);
      }
    }
  }, []);

  // Handle location changes
  useEffect(() => {
    if (usingCustomLocation && customLocation) {
      fetchMeetingsWithLocation(customLocation);
    }
  }, [customLocation?.lat, customLocation?.lng, usingCustomLocation]);

  // Handle filter changes
  useEffect(() => {
    if (hasMeetings) {
      dispatch(
        filterMeetings({
          searchQuery,
          showOnline,
          showInPerson,
          meetingType: selectedTypeFilter === 'All' ? null : selectedTypeFilter,
          day: selectedDayFilter,
          showFavoritesOnly,
        }),
      );
    }
  }, [
    searchQuery,
    showOnline,
    showInPerson,
    selectedTypeFilter,
    selectedDayFilter,
    showFavoritesOnly,
  ]);

  // Fetch group data when meeting details modal opens
  useEffect(() => {
    const fetchGroupData = async () => {
      if (selectedMeeting?.groupId && meetingDetailsVisible) {
        try {
          await dispatch(fetchGroupById(selectedMeeting.groupId)).unwrap();
        } catch (error: any) {
          // Ignore ConditionError - it means the data is already fresh or loading
          if (error?.name !== 'ConditionError') {
            console.error('Error fetching group data:', error);
          }
        }
      }
    };

    fetchGroupData();
  }, [selectedMeeting?.groupId, meetingDetailsVisible, dispatch]);

  const fetchMeetingsWithLocation = (location: Location) => {
    dispatch(
      fetchMeetings({
        location,
        filters: {
          day: selectedDayFilter || undefined,
          type: selectedTypeFilter === 'All' ? undefined : selectedTypeFilter,
        },
      }),
    );
  };

  const getUserLocation = useCallback(async () => {
    setLocationError(null);
    const hasPermission = await requestLocationPermission();
    if (!hasPermission) {
      setLocationError(
        'Location permission denied. Search for a location manually.',
      );
      return;
    }

    try {
      Geolocation.getCurrentPosition(
        position => {
          const location: Location = {
            lat: position.coords.latitude,
            lng: position.coords.longitude,
          };
          setCurrentUserLocation(location);
          dispatch(setReduxUserLocation(location));
          fetchMeetingsWithLocation(location);
        },
        error => {
          console.error('Error getting location:', error);
          setLocationError(
            'Unable to get your location. Check permissions or search manually.',
          );
        },
        {enableHighAccuracy: true, timeout: 15000, maximumAge: 10000},
      );
    } catch (error) {
      console.error('Error in getUserLocation:', error);
      setLocationError('Error accessing location services');
    }
  }, [dispatch]);

  const requestLocationPermission = async () => {
    try {
      if (Platform.OS === 'android') {
        const granted = await PermissionsAndroid.request(
          PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION,
          {
            title: 'Location Permission',
            message:
              'Homegroups needs access to your location to find meetings near you.',
            buttonPositive: 'OK',
          },
        );
        return granted === PermissionsAndroid.RESULTS.GRANTED;
      }
      return true;
    } catch (err) {
      console.error('Error requesting location permission:', err);
      return false;
    }
  };

  const handleSearch = useCallback((query: string) => {
    setSearchQuery(query);
  }, []);

  const resetFilters = () => {
    setSearchQuery('');
    setSelectedTypeFilter('All');
    setShowOnline(true);
    setShowInPerson(true);
    setSelectedDayFilter(null);
    setSelectedTimeFilter(null);
    setShowFavoritesOnly(false);
    setUsingCustomLocation(false);
    setCustomLocation(null);
    setCustomLocationAddress(null);
    if (currentUserLocation) {
      fetchMeetingsWithLocation(currentUserLocation);
    }
  };

  const onRefresh = async () => {
    setRefreshing(true);
    const locationToUse = usingCustomLocation
      ? customLocation
      : currentUserLocation;
    if (locationToUse) {
      await fetchMeetingsWithLocation(locationToUse);
    }
    setRefreshing(false);
  };

  const showMeetingDetails = (meeting: Meeting) => {
    setSelectedMeeting(meeting);
    setMeetingDetailsVisible(true);
  };

  const onFilterModalClose = () => {
    setShowFilterModal(false);
    const locationToFetch = usingCustomLocation
      ? customLocation
      : currentUserLocation;
    if (locationToFetch) {
      fetchMeetingsWithLocation(locationToFetch);
    }
  };

  const handleToggleFavorite = (meetingId: string) => {
    dispatch(toggleFavoriteMeeting(meetingId));
  };

  // Helper to format time string (HH:MM) to AM/PM
  const formatMeetingTime = (timeString?: string): string => {
    if (!timeString) {
      return 'Time TBD';
    }

    // Try different formats
    const formats = [
      'HH:mm:ss', // Military time with seconds
      'HH:mm', // Military time
      'hh:mm:ss A', // 12-hour with seconds and AM/PM
      'hh:mm A', // 12-hour with AM/PM
    ];

    for (const format of formats) {
      const momentTime = moment(timeString, format);
      if (momentTime.isValid()) {
        return momentTime.format('h:mm A');
      }
    }

    return 'Time TBD';
  };

  const formatDayAndTime = (meeting: Meeting): string => {
    if (meeting.day) {
      let meetingDay = meeting.day;
      if (typeof meetingDay === 'number') {
        meetingDay = daysOfWeek[meetingDay - 1];
      }
      const day = meetingDay.charAt(0).toUpperCase() + meetingDay.slice(1);
      const formattedTime = formatMeetingTime(meeting.time); // Use the new formatter
      return `${day} at ${formattedTime}`;
    }
    return 'Schedule TBD'; // Fallback if day is missing
  };

  const formatAddress = (meeting: Meeting): string => {
    if (meeting.online) {
      return 'Online Meeting';
    }

    const streetLine = meeting.address || meeting.street || '';
    const cityStateZipLine = [meeting.city, meeting.state, meeting.zip]
      .filter(Boolean)
      .join(', ');

    if (!streetLine && !cityStateZipLine) {
      return 'Address not specified';
    }

    return `${streetLine}\n${cityStateZipLine}`;
  };

  const calculateDistance = (meeting: Meeting): string => {
    if (!currentUserLocation || !meeting.lat || !meeting.lng) {
      return '';
    }

    const R = 3958.8;
    const dLat = ((meeting.lat - currentUserLocation.lat) * Math.PI) / 180;
    const dLon = ((meeting.lng - currentUserLocation.lng) * Math.PI) / 180;
    const a =
      Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos((currentUserLocation.lat * Math.PI) / 180) *
        Math.cos((meeting.lat * Math.PI) / 180) *
        Math.sin(dLon / 2) *
        Math.sin(dLon / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    const distance = R * c;

    return distance.toFixed(1) + ' mi';
  };

  const renderMeetingItem = ({item}: {item: Meeting}) => {
    const distanceText = calculateDistance(item);
    const formattedAddress = formatAddress(item);

    return (
      <TouchableOpacity
        style={styles.meetingCard}
        onPress={() => showMeetingDetails(item)}
        testID={`meeting-card-${item.id || item.name}`}>
        <View style={styles.meetingHeader}>
          <View style={styles.meetingTimeContainer}>
            <Text style={styles.meetingDay}>{formatDayAndTime(item)}</Text>
            {distanceText && (
              <Text style={styles.meetingDistance}>{distanceText}</Text>
            )}
          </View>
        </View>

        <View style={styles.meetingContent}>
          <Text style={styles.meetingName}>{item.name}</Text>
          <Text style={styles.meetingLocation}>{formattedAddress}</Text>
          <View style={styles.meetingTags}>
            <View style={styles.formatTag}>
              <Text style={styles.formatTagText}>{item.type}</Text>
            </View>
            {item.online && (
              <View style={[styles.formatTag, styles.onlineTag]}>
                <Text style={styles.formatTagText}>Online</Text>
              </View>
            )}
          </View>
        </View>
      </TouchableOpacity>
    );
  };

  const renderFilterModal = () => (
    <Modal
      visible={showFilterModal}
      animationType="slide"
      transparent={true}
      onRequestClose={() => setShowFilterModal(false)}
      testID="meetings-filter-modal">
      <Pressable style={styles.modalOverlay}>
        <View style={styles.filterModalContainer}>
          <View style={styles.pullIndicator} />
          <View style={styles.locationModalHeader}>
            <Text style={styles.locationModalTitle}>Filters</Text>
            <TouchableOpacity
              onPress={() => setShowFilterModal(false)}
              style={styles.closeButton}
              testID="meetings-filter-close-button">
              <Icon name="close" size={24} color="#757575" />
            </TouchableOpacity>
          </View>

          <ScrollView>
            {/* Format Filters */}
            <Text style={styles.filterSectionTitle}>Format</Text>
            <View style={styles.typeFilterContainer}>
              <TouchableOpacity
                style={[
                  styles.typeFilterButton,
                  showInPerson && styles.typeFilterActive,
                  !showOnline && !showInPerson && styles.typeFilterInactive,
                ]}
                onPress={() => setShowInPerson(!showInPerson)}
                testID="filter-inperson-button">
                <Text
                  style={[
                    styles.typeFilterText,
                    showInPerson && styles.typeFilterActiveText,
                  ]}>
                  In-Person
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[
                  styles.typeFilterButton,
                  showOnline && styles.typeFilterActive,
                  !showOnline && !showInPerson && styles.typeFilterInactive,
                ]}
                onPress={() => setShowOnline(!showOnline)}
                testID="filter-online-button">
                <Text
                  style={[
                    styles.typeFilterText,
                    showOnline && styles.typeFilterActiveText,
                  ]}>
                  Online
                </Text>
              </TouchableOpacity>
            </View>

            {/* Program Type Filters */}
            <Text style={styles.filterSectionTitle}>Program Type</Text>
            <View style={styles.chipContainer}>
              {meetingTypes.map((type: MeetingType | 'All') => (
                <TouchableOpacity
                  key={type}
                  style={[
                    styles.chipButton,
                    selectedTypeFilter === type && styles.chipButtonActive,
                  ]}
                  onPress={() =>
                    setSelectedTypeFilter(
                      selectedTypeFilter === type ? 'All' : type,
                    )
                  }
                  testID={`filter-type-${type}-chip`}>
                  <Text
                    style={[
                      styles.chipText,
                      selectedTypeFilter === type && styles.chipTextActive,
                    ]}>
                    {type}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            {/* Day of Week Filter */}
            <Text style={styles.filterSectionTitle}>Day of Week</Text>
            <View style={styles.chipContainer}>
              {daysOfWeek.map((day: string) => (
                <TouchableOpacity
                  key={day}
                  style={[
                    styles.chipButton,
                    selectedDayFilter ===
                      (day.toLowerCase() === 'all'
                        ? null
                        : day.toLowerCase()) && styles.chipButtonActive,
                  ]}
                  onPress={() =>
                    setSelectedDayFilter(
                      day === 'All'
                        ? null
                        : (day.toLowerCase() as keyof DaysAndTimes),
                    )
                  }
                  testID={`filter-day-${day}-chip`}>
                  <Text
                    style={[
                      styles.chipText,
                      selectedDayFilter ===
                        (day.toLowerCase() === 'all'
                          ? null
                          : day.toLowerCase()) && styles.chipTextActive,
                    ]}>
                    {day}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            {/* Time of Day Filter */}
            <Text style={styles.filterSectionTitle}>Time of Day</Text>
            <View style={styles.chipContainer}>
              {timeOfDayOptions.map((timeOption: string) => (
                <TouchableOpacity
                  key={timeOption}
                  style={[
                    styles.chipButton,
                    selectedTimeFilter ===
                      (timeOption === 'All'
                        ? null
                        : timeOption.toLowerCase()) && styles.chipButtonActive,
                  ]}
                  onPress={() =>
                    setSelectedTimeFilter(
                      timeOption === 'All' ? null : timeOption.toLowerCase(),
                    )
                  }
                  testID={`filter-time-${timeOption}-chip`}>
                  <Text
                    style={[
                      styles.chipText,
                      selectedTimeFilter ===
                        (timeOption === 'All'
                          ? null
                          : timeOption.toLowerCase()) && styles.chipTextActive,
                    ]}>
                    {timeOption}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          </ScrollView>

          <TouchableOpacity
            style={styles.applyFilterButton}
            onPress={onFilterModalClose}
            testID="meetings-filter-apply-button">
            <Text style={styles.applyFilterButtonText}>Apply Filters</Text>
          </TouchableOpacity>
        </View>
      </Pressable>
    </Modal>
  );

  const renderLocationPickerModal = () => (
    <Modal
      visible={showLocationPicker}
      animationType="slide"
      onRequestClose={() => setShowLocationPicker(false)}
      testID="meetings-location-picker-modal">
      <SafeAreaView style={styles.locationModalContainer}>
        <View style={styles.locationModalHeader}>
          <Text style={styles.locationModalTitle}>Search Location</Text>
          <TouchableOpacity
            onPress={() => setShowLocationPicker(false)}
            style={styles.closeButton}
            testID="location-picker-close-button">
            <Icon name="close" size={24} color="#757575" />
          </TouchableOpacity>
        </View>
        <View style={styles.locationModalContent}>
          <LocationPicker
            onLocationSelect={locationData => {
              const newLocation: Location = {
                lat: locationData.latitude,
                lng: locationData.longitude,
                city: locationData.city,
                state: locationData.state,
                zip: locationData.zip,
              };
              setCustomLocation(newLocation);
              setCustomLocationAddress(locationData.address);
              setUsingCustomLocation(true);
              setShowLocationPicker(false);
            }}
            initialAddress={customLocationAddress || ''}
            label="Search for meetings near..."
          />
          <TouchableOpacity
            style={styles.useMyLocationButton}
            onPress={() => {
              setShowLocationPicker(false);
            }}
            testID="location-picker-done-button">
            <Text style={styles.useMyLocationText}>Done</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    </Modal>
  );

  // Get group information at component level
  const group = useAppSelector(state =>
    selectedMeeting?.groupId
      ? selectGroupById(state, selectedMeeting.groupId!)
      : null,
  );

  const renderMeetingDetailsModal = () => {
    return (
      <Modal
        visible={meetingDetailsVisible}
        animationType="slide"
        transparent={true}
        onRequestClose={() => setMeetingDetailsVisible(false)}
        testID={`meeting-details-modal-${selectedMeeting?.id}`}>
        {selectedMeeting && (
          <View style={styles.modalOverlay}>
            <View
              style={styles.detailsModalContent}
              testID={`meeting-details-modal-${selectedMeeting.id}`}>
              <View style={styles.modalHeader}>
                <Text style={styles.modalTitle}>Meeting Details</Text>
                <TouchableOpacity
                  onPress={() => setMeetingDetailsVisible(false)}
                  style={styles.modalCloseButton}
                  testID="meeting-details-close-button">
                  <Text style={styles.closeButtonText}>✕</Text>
                </TouchableOpacity>
              </View>

              <ScrollView
                contentContainerStyle={{
                  flexGrow: 1,
                  justifyContent: 'flex-start',
                  width: '100%',
                }}
                style={styles.meetingDetailContent}>
                <Text style={styles.detailsName}>{selectedMeeting.name}</Text>

                {/* Group Name Section */}
                {group && (
                  <View style={styles.detailsSection}>
                    <Text style={styles.detailsLabel}>Group:</Text>
                    <Text style={styles.detailsText}>{group.name}</Text>
                  </View>
                )}

                <View style={styles.detailsSection}>
                  <Text style={styles.detailsLabel}>Time:</Text>
                  <Text style={styles.detailsText}>
                    {formatDayAndTime(selectedMeeting)}
                  </Text>
                </View>

                <View style={styles.detailsSection}>
                  <Text style={styles.detailsLabel}>Location:</Text>
                  <Text style={styles.detailsText}>
                    {selectedMeeting.online
                      ? 'Online Meeting'
                      : selectedMeeting.location ||
                        selectedMeeting.name ||
                        'Location name not specified'}
                  </Text>
                  {!selectedMeeting.online && (
                    <Text style={styles.detailsSubtext}>
                      {formatAddress(selectedMeeting)}
                    </Text>
                  )}
                  {selectedMeeting.online && selectedMeeting.link && (
                    <TouchableOpacity
                      style={styles.linkButton}
                      onPress={() => {
                        Linking.openURL(selectedMeeting.link || '#');
                      }}
                      testID="meeting-details-join-link-button">
                      <Text style={styles.linkButtonText}>Join Meeting</Text>
                    </TouchableOpacity>
                  )}
                  {selectedMeeting.online && selectedMeeting.onlineNotes && (
                    <Text style={styles.detailsNotes}>
                      {selectedMeeting.onlineNotes}
                    </Text>
                  )}
                </View>

                <View style={styles.detailsSection}>
                  <Text style={styles.detailsLabel}>Type:</Text>
                  <Text style={styles.detailsText}>{selectedMeeting.type}</Text>
                </View>

                {currentUserLocation &&
                  selectedMeeting.lat &&
                  selectedMeeting.lng && (
                    <View style={styles.detailsSection}>
                      <Text style={styles.detailsLabel}>Distance:</Text>
                      <Text style={styles.detailsText}>
                        {calculateDistance(selectedMeeting)} from your location
                      </Text>
                    </View>
                  )}

                {!selectedMeeting.groupId && (
                  <View style={styles.detailsSection}>
                    <TouchableOpacity
                      style={styles.createGroupButton}
                      onPress={() => {
                        navigation.navigate('Home', {
                          screen: 'CreateGroup',
                          params: {
                            meeting: selectedMeeting,
                          },
                        });
                        setMeetingDetailsVisible(false);
                      }}
                      testID="meeting-details-create-group-button">
                      <Text style={styles.createGroupButtonText}>
                        Create Group
                      </Text>
                    </TouchableOpacity>
                  </View>
                )}

                {!selectedMeeting.online &&
                  selectedMeeting.lat &&
                  selectedMeeting.lng && (
                    <View style={styles.detailsSection}>
                      <TouchableOpacity
                        style={styles.directionsButton}
                        onPress={() => {
                          const scheme = Platform.select({
                            ios: 'maps:0,0?q=',
                            android: 'geo:0,0?q=',
                          });
                          const latLng = `${selectedMeeting.lat},${selectedMeeting.lng}`;
                          const label = selectedMeeting.name;
                          const url = Platform.select({
                            ios: `${scheme}${label}@${latLng}`,
                            android: `${scheme}${latLng}(${label})`,
                          });
                          if (url) Linking.openURL(url);
                        }}>
                        <Text style={styles.directionsButtonText}>
                          Get Directions
                        </Text>
                      </TouchableOpacity>
                    </View>
                  )}
              </ScrollView>

              <View style={styles.detailsFooter}></View>
            </View>
          </View>
        )}
      </Modal>
    );
  };

  const getLocationChipText = () => {
    if (usingCustomLocation && customLocationAddress) {
      const addressPart = customLocationAddress.split(',')[0].trim();
      if (addressPart.length > 15) {
        return `${addressPart.substring(0, 15)}...`;
      }
      return addressPart;
    } else if (usingCustomLocation) {
      return 'Custom Location';
    }
    return 'Near Me';
  };

  return (
    <SafeAreaView style={styles.container} testID="meetings-screen">
      <OfflineBanner />
      <View style={styles.headerContainer}>
        <Text style={styles.headerTitle}>Find Meetings</Text>
        <Text style={styles.headerSubtitle}>
          {usingCustomLocation && customLocationAddress
            ? `Near ${
                customLocationAddress.split(',')[0] || 'selected location'
              }`
            : currentUserLocation
            ? `Near your location`
            : 'Search for recovery meetings'}
        </Text>
      </View>

      <View style={styles.searchControlsContainer}>
        <View style={styles.searchInputContainer}>
          <Icon
            name="magnify"
            size={20}
            color="#757575"
            style={styles.searchIcon}
          />
          <TextInput
            style={styles.searchInput}
            placeholder="Search by name..."
            value={searchQuery}
            onChangeText={handleSearch}
            returnKeyType="search"
            testID="meetings-search-input"
          />
          {isSearching && (
            <ActivityIndicator
              size="small"
              color="#2196F3"
              style={styles.searchLoadingIndicator}
            />
          )}
        </View>

        <View style={styles.filterButtonsRow}>
          <TouchableOpacity
            style={[
              styles.filterChipButton,
              showFavoritesOnly && styles.filterChipButtonActive,
            ]}
            onPress={() => setShowFavoritesOnly(!showFavoritesOnly)}
            testID="meetings-favorites-button">
            <Icon
              name={showFavoritesOnly ? 'heart' : 'heart-outline'}
              size={18}
              color={showFavoritesOnly ? '#FFFFFF' : '#1976D2'}
            />
            <Text
              style={[
                styles.filterChipButtonText,
                showFavoritesOnly && styles.filterChipButtonTextActive,
              ]}>
              {favoritesCount > 0 ? `Favorites (${favoritesCount})` : 'Favorites'}
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.filterChipButton}
            onPress={() => setShowFilterModal(true)}
            testID="meetings-filter-button">
            <Icon name="filter-variant" size={18} color="#1976D2" />
            <Text style={styles.filterChipButtonText}>
              {selectedTypeFilter === 'All' ? 'Filters' : selectedTypeFilter}
            </Text>
            <Icon name="chevron-down" size={18} color="#1976D2" />
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.filterChipButton}
            onPress={() => setShowLocationPicker(true)}
            testID="meetings-location-button">
            <Icon name="map-marker-outline" size={18} color="#1976D2" />
            <Text
              style={styles.filterChipButtonText}
              numberOfLines={1}
              ellipsizeMode="tail">
              {getLocationChipText()}
            </Text>
            <Icon name="chevron-down" size={18} color="#1976D2" />
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.filterChipButton, styles.resetChipButton]}
            onPress={resetFilters}
            testID="meetings-reset-filters-button">
            <Icon name="filter-variant-remove" size={18} color="#757575" />
          </TouchableOpacity>
        </View>

        {/* {activeLocation && (
          <View style={styles.radiusContainer}>
            <Text style={styles.radiusLabel}>
              Search radius: {searchRadius} miles
            </Text>
            <Slider
              style={styles.radiusSlider}
              minimumValue={1}
              maximumValue={100}
              step={1}
              value={searchRadius}
              onValueChange={setSearchRadius}
              onSlidingComplete={value =>
                fetchMeetingsWithCriteria(activeLocation)
              }
              minimumTrackTintColor="#2196F3"
              maximumTrackTintColor="#E0E0E0"
              thumbTintColor="#2196F3"
            />
          </View>
        )} */}
      </View>

      {locationError && !currentUserLocation && (
        <View style={styles.errorContainer}>
          <Text style={styles.errorText}>{locationError}</Text>
          <TouchableOpacity
            style={styles.retryButton}
            onPress={() => setShowLocationPicker(true)}>
            <Text style={styles.retryButtonText}>Search Location</Text>
          </TouchableOpacity>
        </View>
      )}

      {isLoading && !hasMeetings ? (
        <View style={styles.loaderContainer} testID="meetings-loader">
          <ActivityIndicator size="large" color="#2196F3" />
          <Text style={styles.loadingText}>Finding meetings...</Text>
          <Text style={styles.loadingSubtext}>
            {usingCustomLocation && customLocationAddress
              ? `Searching near ${customLocationAddress.split(',')[0]}`
              : 'Searching near your location'}
          </Text>
        </View>
      ) : (
        <FlatList
          data={filteredMeetings}
          renderItem={renderMeetingItem}
          keyExtractor={(item, index) =>
            item.id ? `${item.id}-${index}` : `no-id-${index}`
          }
          contentContainerStyle={styles.meetingsList}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
          }
          ListEmptyComponent={
            <View style={styles.emptyContainer}>
              <Icon
                name="calendar-search"
                size={64}
                color="#BDBDBD"
                style={{marginBottom: 16}}
              />
              <Text style={styles.emptyText}>No Meetings Found</Text>
              <Text style={styles.emptySubtext}>
                {error
                  ? 'There was an error loading meetings.'
                  : isSearching
                  ? 'Searching for meetings...'
                  : 'Try adjusting your search location or filters.'}
              </Text>
              {!isSearching && (
                <TouchableOpacity
                  style={styles.resetEmptyButton}
                  onPress={resetFilters}>
                  <Text style={styles.resetEmptyButtonText}>Reset Search</Text>
                </TouchableOpacity>
              )}
            </View>
          }
          testID="meetings-list"
        />
      )}

      {renderFilterModal()}
      {renderLocationPickerModal()}
      {renderMeetingDetailsModal()}
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F5F5F5',
  },
  headerContainer: {
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 8,
    backgroundColor: '#2196F3',
  },
  headerTitle: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#FFFFFF',
    marginBottom: 4,
  },
  headerSubtitle: {
    fontSize: 15,
    color: 'rgba(255, 255, 255, 0.85)',
  },
  searchControlsContainer: {
    padding: 16,
    backgroundColor: '#FFFFFF',
    borderBottomWidth: 1,
    borderBottomColor: '#EEEEEE',
  },
  searchInputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F0F0F0',
    borderRadius: 8,
    paddingHorizontal: 12,
    marginBottom: 12,
  },
  searchIcon: {
    marginRight: 8,
  },
  searchInput: {
    flex: 1,
    height: 44,
    fontSize: 16,
    color: '#212121',
  },
  filterButtonsRow: {
    flexDirection: 'row',
    justifyContent: 'flex-start',
    marginBottom: 8,
    gap: 8,
  },
  filterChipButton: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 8,
    backgroundColor: '#E3F2FD',
    borderRadius: 16,
  },
  filterChipButtonActive: {
    backgroundColor: '#1976D2',
  },
  filterChipButtonText: {
    color: '#1976D2',
    fontWeight: '600',
    fontSize: 14,
    marginLeft: 4,
    marginRight: 2,
    maxWidth: 100,
  },
  filterChipButtonTextActive: {
    color: '#FFFFFF',
  },
  resetChipButton: {
    backgroundColor: '#F5F5F5',
    paddingHorizontal: 10,
  },
  radiusContainer: {
    marginTop: 8,
  },
  radiusLabel: {
    fontSize: 14,
    color: '#616161',
    marginBottom: 8,
    textAlign: 'center',
  },
  radiusSlider: {
    width: '100%',
    height: 40,
  },
  loaderContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 32,
  },
  loadingText: {
    marginTop: 12,
    fontSize: 16,
    fontWeight: '600',
    color: '#2196F3',
  },
  loadingSubtext: {
    marginTop: 8,
    fontSize: 14,
    color: '#757575',
    textAlign: 'center',
  },
  errorContainer: {
    backgroundColor: '#FFEBEE',
    padding: 12,
    marginHorizontal: 16,
    marginTop: 8,
    borderRadius: 8,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  errorText: {
    color: '#D32F2F',
    flex: 1,
    marginRight: 8,
    fontSize: 14,
  },
  retryButton: {
    backgroundColor: '#FFCDD2',
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: 16,
    minHeight: 44,
    justifyContent: 'center',
    alignItems: 'center',
  },
  retryButtonText: {
    color: '#D32F2F',
    fontWeight: '600',
    fontSize: 14,
  },
  meetingsList: {
    padding: 16,
    paddingTop: 8,
  },
  meetingCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    marginBottom: 12,
    shadowColor: '#000',
    shadowOffset: {width: 0, height: 1},
    shadowOpacity: 0.1,
    shadowRadius: 2,
    elevation: 2,
    overflow: 'hidden',
  },
  meetingHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    borderBottomWidth: 1,
    borderBottomColor: '#F0F0F0',
    paddingVertical: 12,
    paddingHorizontal: 16,
  },
  meetingTimeContainer: {
    flexShrink: 1,
    marginRight: 8,
  },
  meetingDay: {
    fontSize: 14,
    color: '#616161',
    marginBottom: 2,
    fontWeight: '500',
  },
  meetingDistance: {
    fontSize: 13,
    fontWeight: '600',
    color: '#1976D2',
  },
  meetingContent: {
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 16,
  },
  meetingName: {
    fontSize: 17,
    fontWeight: '600',
    color: '#212121',
    marginBottom: 6,
  },
  meetingLocation: {
    fontSize: 14,
    color: '#757575',
    marginBottom: 10,
  },
  meetingTags: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  formatTag: {
    backgroundColor: '#E0E0E0',
    borderRadius: 4,
    paddingHorizontal: 8,
    paddingVertical: 3,
    marginRight: 6,
  },
  onlineTag: {
    backgroundColor: '#E3F2FD',
  },
  formatTagText: {
    fontSize: 12,
    color: '#616161',
    fontWeight: '500',
  },
  emptyContainer: {
    flexGrow: 1,
    padding: 48,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 40,
  },
  emptyText: {
    fontSize: 18,
    fontWeight: '600',
    color: '#757575',
    marginBottom: 8,
    textAlign: 'center',
  },
  emptySubtext: {
    fontSize: 14,
    color: '#9E9E9E',
    textAlign: 'center',
    marginBottom: 24,
  },
  resetEmptyButton: {
    backgroundColor: '#E3F2FD',
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 8,
  },
  resetEmptyButtonText: {
    color: '#1976D2',
    fontWeight: '600',
    fontSize: 15,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'flex-end',
  },
  locationModalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 16,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#EEEEEE',
  },
  locationModalTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#212121',
  },
  closeButton: {
    padding: 8,
  },
  closeButtonText: {
    fontSize: 24,
    color: '#757575',
    lineHeight: 24,
  },
  filterSectionTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#424242',
    marginBottom: 12,
    marginTop: 8,
  },
  typeFilterContainer: {
    flexDirection: 'row',
    marginBottom: 16,
    gap: 12,
  },
  typeFilterButton: {
    flex: 1,
    paddingVertical: 12,
    borderWidth: 1.5,
    borderColor: '#BDBDBD',
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  typeFilterActive: {
    backgroundColor: '#E3F2FD',
    borderColor: '#2196F3',
  },
  typeFilterText: {
    fontSize: 14,
    color: '#616161',
    fontWeight: '500',
  },
  typeFilterActiveText: {
    color: '#1E88E5',
    fontWeight: '600',
  },
  typeFilterInactive: {
    borderColor: '#E57373',
  },
  chipContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginBottom: 16,
    gap: 8, // Add gap between chips
  },
  chipButton: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 16,
    backgroundColor: '#F0F0F0',
    borderWidth: 1,
    borderColor: '#E0E0E0',
  },
  chipButtonActive: {
    backgroundColor: '#E3F2FD',
    borderColor: '#2196F3',
  },
  chipText: {
    fontSize: 14,
    color: '#616161',
  },
  chipTextActive: {
    color: '#1E88E5',
    fontWeight: '600',
  },
  filterModalContainer: {
    backgroundColor: '#FFFFFF',
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    padding: 16,
    paddingBottom: Platform.OS === 'ios' ? 34 : 20,
    maxHeight: '80%',
    width: '100%',
  },
  pullIndicator: {
    width: 40,
    height: 5,
    backgroundColor: '#E0E0E0',
    borderRadius: 2.5,
    marginBottom: 16,
  },
  applyFilterButton: {
    marginTop: 16,
    backgroundColor: '#2196F3',
    paddingVertical: 14,
    borderRadius: 8,
    alignItems: 'center',
  },
  applyFilterButtonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '600',
  },
  filterWarningText: {
    fontSize: 12,
    color: '#D32F2F',
    textAlign: 'center',
    marginTop: -8,
    marginBottom: 8,
  },
  detailsModalContent: {
    backgroundColor: '#FFFFFF',
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    padding: 24,
    paddingTop: 16,
    maxHeight: '85%',
  },
  meetingDetailContent: {
    paddingBottom: 16,
  },
  detailsName: {
    fontSize: 22,
    fontWeight: 'bold',
    color: '#212121',
    marginBottom: 20,
  },
  detailsSection: {
    marginBottom: 18,
  },
  detailsLabel: {
    fontSize: 14,
    color: '#757575',
    marginBottom: 4,
    fontWeight: '500',
  },
  detailsText: {
    fontSize: 16,
    color: '#212121',
    marginBottom: 4,
    lineHeight: 22,
  },
  detailsSubtext: {
    fontSize: 14,
    color: '#757575',
    lineHeight: 20,
  },
  detailsNotes: {
    fontSize: 14,
    color: '#616161',
    fontStyle: 'italic',
    marginTop: 8,
    lineHeight: 20,
  },
  linkButton: {
    backgroundColor: '#2196F3',
    borderRadius: 8,
    paddingVertical: 12,
    paddingHorizontal: 20,
    alignSelf: 'flex-start',
    marginTop: 12,
    minHeight: 44,
    justifyContent: 'center',
  },
  linkButtonText: {
    color: '#FFFFFF',
    fontWeight: '600',
    fontSize: 15,
  },
  directionsButton: {
    backgroundColor: '#E3F2FD',
    borderRadius: 8,
    paddingVertical: 12,
    paddingHorizontal: 20,
    alignSelf: 'flex-start',
    marginTop: 8,
    minHeight: 44,
    justifyContent: 'center',
  },
  directionsButtonText: {
    color: '#1E88E5',
    fontWeight: '600',
    fontSize: 15,
  },
  disabledButtonText: {
    color: '#BDBDBD',
  },
  detailsFooter: {
    borderTopWidth: 1,
    borderTopColor: '#EEEEEE',
    paddingTop: 16,
    marginTop: 16,
  },
  createGroupButton: {
    backgroundColor: '#4CAF50',
    borderRadius: 8,
    paddingVertical: 12,
    paddingHorizontal: 20,
    alignSelf: 'flex-start',
    marginTop: 8,
    minHeight: 44,
    justifyContent: 'center',
  },
  createGroupButtonText: {
    color: '#FFFFFF',
    fontWeight: '600',
    fontSize: 15,
  },
  locationModalContainer: {
    flex: 1,
    backgroundColor: '#FFFFFF',
  },
  locationModalContent: {
    flex: 1,
    padding: 16,
  },
  useMyLocationButton: {
    marginTop: 16,
    padding: 16,
    backgroundColor: '#2196F3',
    borderRadius: 8,
    alignItems: 'center',
    position: 'absolute',
    bottom: 16,
    left: 16,
    right: 16,
  },
  useMyLocationText: {
    color: '#FFFFFF',
    fontWeight: '600',
    fontSize: 16,
  },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#EEEEEE',
    marginBottom: 16,
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#212121',
    flex: 1,
  },
  modalCloseButton: {
    padding: 8,
    marginLeft: 16,
  },
  searchLoadingIndicator: {
    marginLeft: 8,
  },
});

export default MeetingsScreen;
