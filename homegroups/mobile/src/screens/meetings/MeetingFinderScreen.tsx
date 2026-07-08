// mobile/src/screens/meetings/MeetingFinderScreen.tsx
// V3.2 Task 2.1 — Location-Based Meeting Finder with Map toggle
//
// react-native-maps IS installed (react-native-maps ~1.10.0),
// react-native-qrcode-svg is NOT installed.
//
// This screen replaces the existing MeetingScreen.tsx as the Meetings tab
// content when wired in — it adds:
//   • List | Map toggle
//   • Meeting type filter chips (AA, NA, Al-Anon, CA, All)
//   • Day-of-week filter chips
//   • Favorite star on each card
//   • "Is this your group? Get it on Homegroups" CTA for external meetings
//   • Navigates to MeetingDetailScreen on card press

import React, {useState, useEffect, useCallback, useRef} from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  TextInput,
  ActivityIndicator,
  Platform,
  PermissionsAndroid,
  ScrollView,
  Alert,
  Linking,
} from 'react-native';
import {SafeAreaView} from 'react-native-safe-area-context';
import Geolocation from '@react-native-community/geolocation';
import MapView, {Marker, Region} from 'react-native-maps';
import {useNavigation} from '@react-navigation/native';
import {StackNavigationProp} from '@react-navigation/stack';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import moment from 'moment';

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
  selectFavoriteIds,
} from '../../store/slices/meetingsSlice';
import OfflineBanner from '../../components/common/OfflineBanner';

import {Meeting, Location, DaysAndTimes, MeetingType} from '../../types';
import {GroupStackParamList} from '../../types/navigation';

// Day abbreviation chips
const DAY_CHIPS = ['Today', 'Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const DAY_CHIP_TO_FILTER: Record<string, string | null> = {
  Today: getTodayDayName(),
  Sun: 'sunday',
  Mon: 'monday',
  Tue: 'tuesday',
  Wed: 'wednesday',
  Thu: 'thursday',
  Fri: 'friday',
  Sat: 'saturday',
};

function getTodayDayName(): string {
  return [
    'sunday',
    'monday',
    'tuesday',
    'wednesday',
    'thursday',
    'friday',
    'saturday',
  ][new Date().getDay()];
}

const TYPE_CHIPS: ('All' | MeetingType)[] = [
  'All',
  'AA',
  'NA',
  'Celebrate Recovery',
  'IOP',
  'Religious',
];

type ViewMode = 'list' | 'map';

type NavigationProp = StackNavigationProp<GroupStackParamList>;

const MeetingFinderScreen: React.FC = () => {
  const navigation = useNavigation<NavigationProp>();
  const dispatch = useAppDispatch();

  const filteredMeetings = useAppSelector(selectFilteredMeetings);
  const status = useAppSelector(selectMeetingsStatus);
  const error = useAppSelector(selectMeetingsError);
  const reduxUserLocation = useAppSelector(selectReduxUserLocation);
  const favoritesCount = useAppSelector(selectFavoriteMeetingsCount);
  const favoriteIds = useAppSelector(selectFavoriteIds);
  const hasMeetings = useAppSelector(
    state => state.meetings.filteredIds.length > 0,
  );

  // UI state
  const [viewMode, setViewMode] = useState<ViewMode>('list');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedType, setSelectedType] = useState<'All' | MeetingType>('All');
  const [selectedDay, setSelectedDay] = useState<string | null>(null);
  const [showFavoritesOnly, setShowFavoritesOnly] = useState(false);

  // Location state
  const [currentUserLocation, setCurrentUserLocation] =
    useState<Location | null>(reduxUserLocation);
  const [locationError, setLocationError] = useState<string | null>(null);

  // Map state
  const [mapRegion, setMapRegion] = useState<Region | null>(null);
  const mapRef = useRef<MapView>(null);

  const isLoading = status === 'loading';

  // Request location on mount
  useEffect(() => {
    if (!currentUserLocation) {
      getUserLocation();
    }
  }, []);

  // Apply filters whenever filter state changes
  useEffect(() => {
    if (hasMeetings || status === 'succeeded') {
      dispatch(
        filterMeetings({
          searchQuery,
          showOnline: true,
          showInPerson: true,
          meetingType: selectedType === 'All' ? null : selectedType,
          day: (selectedDay as keyof DaysAndTimes) ?? null,
          showFavoritesOnly,
        }),
      );
    }
  }, [searchQuery, selectedType, selectedDay, showFavoritesOnly, hasMeetings]);

  // Update map region when location or meetings change
  useEffect(() => {
    if (currentUserLocation && viewMode === 'map') {
      setMapRegion({
        latitude: currentUserLocation.lat,
        longitude: currentUserLocation.lng,
        latitudeDelta: 0.1,
        longitudeDelta: 0.1,
      });
    }
  }, [currentUserLocation, viewMode]);

  const fetchMeetingsWithLocation = useCallback(
    (location: Location) => {
      dispatch(
        fetchMeetings({
          location,
          filters: {
            day: (selectedDay as keyof DaysAndTimes) ?? undefined,
            type: selectedType === 'All' ? undefined : selectedType,
          },
        }),
      );
    },
    [dispatch, selectedDay, selectedType],
  );

  const requestLocationPermission = async (): Promise<boolean> => {
    if (Platform.OS === 'android') {
      try {
        const granted = await PermissionsAndroid.request(
          PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION,
          {
            title: 'Location Permission',
            message:
              'Homegroups needs your location to find meetings near you.',
            buttonPositive: 'OK',
          },
        );
        return granted === PermissionsAndroid.RESULTS.GRANTED;
      } catch {
        return false;
      }
    }
    return true;
  };

  const getUserLocation = useCallback(async () => {
    setLocationError(null);
    const hasPermission = await requestLocationPermission();
    if (!hasPermission) {
      setLocationError(
        'Location permission denied. Showing all available meetings.',
      );
      return;
    }

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
      () => {
        setLocationError('Unable to get your location. Showing all meetings.');
      },
      {enableHighAccuracy: true, timeout: 15000, maximumAge: 10000},
    );
  }, [dispatch, fetchMeetingsWithLocation]);

  const handleToggleFavorite = useCallback(
    (meetingId: string) => {
      if (meetingId) {
        dispatch(toggleFavoriteMeeting(meetingId));
      }
    },
    [dispatch],
  );

  const handleMeetingPress = useCallback(
    (meeting: Meeting) => {
      navigation.navigate('MeetingDetail', {
        meetingId: meeting.id ?? '',
        groupId: meeting.groupId,
        source: meeting.groupId ? 'recoveryconnect' : 'external',
      });
    },
    [navigation],
  );

  const formatDayAndTime = (meeting: Meeting): string => {
    const day = meeting.day
      ? meeting.day.charAt(0).toUpperCase() + meeting.day.slice(1)
      : '';
    const time = meeting.time
      ? moment(meeting.time, ['HH:mm', 'HH:mm:ss', 'h:mm A']).format('h:mm A')
      : 'Time TBD';
    return day ? `${day} at ${time}` : time;
  };

  const formatAddress = (meeting: Meeting): string => {
    if (meeting.online) {
      return 'Online';
    }
    const parts = [meeting.city, meeting.state].filter(Boolean);
    return (
      (
        (meeting.address || meeting.street || '') +
        (parts.length ? `\n${parts.join(', ')}` : '')
      ).trim() || 'Address TBD'
    );
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
    return (R * c).toFixed(1) + ' mi';
  };

  // ---- Render helpers ----

  const renderTypeChips = () => (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={styles.chipRow}>
      {TYPE_CHIPS.map(t => (
        <TouchableOpacity
          key={t}
          style={[styles.chip, selectedType === t && styles.chipActive]}
          onPress={() => setSelectedType(t)}
          testID={`type-chip-${t}`}>
          <Text
            style={[
              styles.chipText,
              selectedType === t && styles.chipTextActive,
            ]}>
            {t}
          </Text>
        </TouchableOpacity>
      ))}
    </ScrollView>
  );

  const renderDayChips = () => (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={styles.chipRow}>
      {DAY_CHIPS.map(chip => {
        const filter = DAY_CHIP_TO_FILTER[chip] ?? null;
        const isActive = selectedDay === filter;
        return (
          <TouchableOpacity
            key={chip}
            style={[styles.chip, isActive && styles.chipActive]}
            onPress={() => setSelectedDay(isActive ? null : filter)}
            testID={`day-chip-${chip}`}>
            <Text style={[styles.chipText, isActive && styles.chipTextActive]}>
              {chip}
            </Text>
          </TouchableOpacity>
        );
      })}
    </ScrollView>
  );

  const renderMeetingCard = ({item}: {item: Meeting}) => {
    const isFav = favoriteIds.includes(item.id ?? '');
    const distanceText = calculateDistance(item);
    const isExternal = !item.groupId;

    return (
      <TouchableOpacity
        style={styles.card}
        onPress={() => handleMeetingPress(item)}
        testID={`meeting-card-${item.id ?? item.name}`}>
        {/* Header row */}
        <View style={styles.cardHeader}>
          <View style={styles.typeBadge}>
            <Text style={styles.typeBadgeText}>{item.type || 'AA'}</Text>
          </View>
          <Text style={styles.cardName} numberOfLines={1}>
            {item.name}
          </Text>
          <TouchableOpacity
            onPress={() => handleToggleFavorite(item.id ?? '')}
            hitSlop={{top: 8, bottom: 8, left: 8, right: 8}}
            testID={`favorite-btn-${item.id}`}>
            <Icon
              name={isFav ? 'star' : 'star-outline'}
              size={22}
              color={isFav ? '#FFC107' : '#BDBDBD'}
            />
          </TouchableOpacity>
        </View>

        {/* Day + time */}
        <Text style={styles.cardDayTime}>{formatDayAndTime(item)}</Text>

        {/* Format badge */}
        {item.format ? (
          <Text style={styles.cardFormat}>{item.format}</Text>
        ) : null}

        {/* Address / Online + Distance */}
        <View style={styles.cardFooter}>
          <View style={styles.cardAddressRow}>
            <Icon
              name={item.online ? 'laptop' : 'map-marker-outline'}
              size={14}
              color="#757575"
              style={styles.cardAddressIcon}
            />
            <Text style={styles.cardAddress} numberOfLines={2}>
              {formatAddress(item)}
            </Text>
          </View>
          {distanceText ? (
            <Text style={styles.cardDistance}>{distanceText}</Text>
          ) : null}
          <TouchableOpacity
            onPress={() => handleMeetingPress(item)}
            hitSlop={{top: 8, bottom: 8, left: 8, right: 8}}>
            <Icon name="chevron-right" size={20} color="#9E9E9E" />
          </TouchableOpacity>
        </View>

        {/* External meeting CTA */}
        {isExternal && (
          <TouchableOpacity
            style={styles.externalCta}
            onPress={() =>
              Linking.openURL('https://recoveryconnect.app/get-listed')
            }
            testID={`external-cta-${item.id}`}>
            <Icon name="plus-circle-outline" size={14} color="#2196F3" />
            <Text style={styles.externalCtaText}>
              Is this your group? Get it on Homegroups
            </Text>
            <Icon name="chevron-right" size={14} color="#2196F3" />
          </TouchableOpacity>
        )}
      </TouchableOpacity>
    );
  };

  const renderMapView = () => {
    if (!mapRegion) {
      return (
        <View style={styles.mapPlaceholder}>
          <ActivityIndicator size="large" color="#2196F3" />
          <Text style={styles.mapPlaceholderText}>
            Getting your location...
          </Text>
        </View>
      );
    }

    return (
      <MapView
        ref={mapRef}
        style={styles.map}
        region={mapRegion}
        showsUserLocation
        showsMyLocationButton
        testID="meeting-finder-map">
        {filteredMeetings
          .filter(m => m.lat && m.lng)
          .map(m => (
            <Marker
              key={m.id ?? m.name}
              coordinate={{latitude: m.lat!, longitude: m.lng!}}
              title={m.name}
              description={formatDayAndTime(m)}
              onCalloutPress={() => handleMeetingPress(m)}
            />
          ))}
      </MapView>
    );
  };

  return (
    <SafeAreaView style={styles.container} testID="meeting-finder-screen">
      <OfflineBanner />

      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Find Meetings</Text>
        {locationError ? (
          <Text style={styles.locationError}>{locationError}</Text>
        ) : currentUserLocation ? (
          <Text style={styles.headerSubtitle}>Near your location</Text>
        ) : (
          <Text style={styles.headerSubtitle}>Finding your location...</Text>
        )}
      </View>

      {/* Search bar */}
      <View style={styles.searchRow}>
        <View style={styles.searchInputContainer}>
          <Icon
            name="magnify"
            size={20}
            color="#757575"
            style={styles.searchIcon}
          />
          <TextInput
            style={styles.searchInput}
            placeholder="City, zip, or name..."
            value={searchQuery}
            onChangeText={setSearchQuery}
            returnKeyType="search"
            testID="meeting-finder-search"
          />
        </View>
        <TouchableOpacity
          style={styles.favoritesBtn}
          onPress={() => setShowFavoritesOnly(prev => !prev)}
          testID="meeting-finder-favorites-btn">
          <Icon
            name={showFavoritesOnly ? 'heart' : 'heart-outline'}
            size={22}
            color={showFavoritesOnly ? '#E53935' : '#757575'}
          />
          {favoritesCount > 0 && (
            <View style={styles.favBadge}>
              <Text style={styles.favBadgeText}>{favoritesCount}</Text>
            </View>
          )}
        </TouchableOpacity>
      </View>

      {/* List | Map toggle */}
      <View style={styles.toggleRow}>
        <TouchableOpacity
          style={[
            styles.toggleButton,
            styles.toggleButtonLeft,
            viewMode === 'list' && styles.toggleButtonActive,
          ]}
          onPress={() => setViewMode('list')}
          testID="toggle-list">
          <Icon
            name="format-list-bulleted"
            size={18}
            color={viewMode === 'list' ? '#FFFFFF' : '#757575'}
          />
          <Text
            style={[
              styles.toggleText,
              viewMode === 'list' && styles.toggleTextActive,
            ]}>
            List
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[
            styles.toggleButton,
            styles.toggleButtonRight,
            viewMode === 'map' && styles.toggleButtonActive,
          ]}
          onPress={() => setViewMode('map')}
          testID="toggle-map">
          <Icon
            name="map-outline"
            size={18}
            color={viewMode === 'map' ? '#FFFFFF' : '#757575'}
          />
          <Text
            style={[
              styles.toggleText,
              viewMode === 'map' && styles.toggleTextActive,
            ]}>
            Map
          </Text>
        </TouchableOpacity>
      </View>

      {/* Type filter chips */}
      {renderTypeChips()}

      {/* Day of week chips */}
      {renderDayChips()}

      {/* Content: list or map */}
      {isLoading && !hasMeetings ? (
        <View style={styles.loaderContainer} testID="meeting-finder-loader">
          <ActivityIndicator size="large" color="#2196F3" />
          <Text style={styles.loadingText}>Finding meetings...</Text>
        </View>
      ) : viewMode === 'map' ? (
        renderMapView()
      ) : (
        <FlatList
          data={filteredMeetings}
          renderItem={renderMeetingCard}
          keyExtractor={(item, index) =>
            item.id ? `${item.id}-${index}` : `no-id-${index}`
          }
          contentContainerStyle={styles.listContent}
          ListEmptyComponent={
            <View style={styles.emptyContainer}>
              <Icon name="calendar-search" size={64} color="#BDBDBD" />
              <Text style={styles.emptyTitle}>No Meetings Found</Text>
              <Text style={styles.emptySubtext}>
                {error
                  ? 'Error loading meetings.'
                  : 'Try adjusting your filters or location.'}
              </Text>
            </View>
          }
          testID="meeting-finder-list"
        />
      )}
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F5F5F5',
  },
  header: {
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 8,
    backgroundColor: '#2196F3',
  },
  headerTitle: {
    fontSize: 22,
    fontWeight: 'bold',
    color: '#FFFFFF',
    marginBottom: 2,
  },
  headerSubtitle: {
    fontSize: 13,
    color: 'rgba(255,255,255,0.85)',
  },
  locationError: {
    fontSize: 12,
    color: '#FFCDD2',
  },
  searchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#EEEEEE',
    gap: 8,
  },
  searchInputContainer: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F0F0F0',
    borderRadius: 8,
    paddingHorizontal: 10,
  },
  searchIcon: {
    marginRight: 6,
  },
  searchInput: {
    flex: 1,
    height: 40,
    fontSize: 15,
    color: '#212121',
  },
  favoritesBtn: {
    position: 'relative',
    padding: 4,
  },
  favBadge: {
    position: 'absolute',
    top: -2,
    right: -4,
    backgroundColor: '#E53935',
    borderRadius: 8,
    minWidth: 16,
    height: 16,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 3,
  },
  favBadgeText: {
    color: '#FFFFFF',
    fontSize: 10,
    fontWeight: 'bold',
  },
  toggleRow: {
    flexDirection: 'row',
    marginHorizontal: 16,
    marginVertical: 8,
    borderRadius: 8,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: '#2196F3',
  },
  toggleButton: {
    flex: 1,
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: 8,
    gap: 4,
    backgroundColor: '#FFFFFF',
  },
  toggleButtonLeft: {
    borderRightWidth: 0.5,
    borderRightColor: '#2196F3',
  },
  toggleButtonRight: {
    borderLeftWidth: 0.5,
    borderLeftColor: '#2196F3',
  },
  toggleButtonActive: {
    backgroundColor: '#2196F3',
  },
  toggleText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#757575',
  },
  toggleTextActive: {
    color: '#FFFFFF',
  },
  chipRow: {
    paddingHorizontal: 12,
    paddingVertical: 4,
    gap: 6,
    flexDirection: 'row',
  },
  chip: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
    backgroundColor: '#F0F0F0',
    borderWidth: 1,
    borderColor: '#E0E0E0',
  },
  chipActive: {
    backgroundColor: '#E3F2FD',
    borderColor: '#2196F3',
  },
  chipText: {
    fontSize: 13,
    color: '#616161',
  },
  chipTextActive: {
    color: '#1565C0',
    fontWeight: '600',
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
    color: '#2196F3',
    fontWeight: '600',
  },
  listContent: {
    padding: 12,
    paddingBottom: 32,
  },
  card: {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    marginBottom: 10,
    padding: 14,
    shadowColor: '#000',
    shadowOffset: {width: 0, height: 1},
    shadowOpacity: 0.08,
    shadowRadius: 3,
    elevation: 2,
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 6,
    gap: 8,
  },
  typeBadge: {
    backgroundColor: '#1565C0',
    borderRadius: 4,
    paddingHorizontal: 7,
    paddingVertical: 2,
  },
  typeBadgeText: {
    color: '#FFFFFF',
    fontSize: 11,
    fontWeight: 'bold',
  },
  cardName: {
    flex: 1,
    fontSize: 16,
    fontWeight: '700',
    color: '#212121',
  },
  cardDayTime: {
    fontSize: 14,
    color: '#1976D2',
    fontWeight: '500',
    marginBottom: 2,
  },
  cardFormat: {
    fontSize: 12,
    color: '#757575',
    marginBottom: 4,
  },
  cardFooter: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginTop: 4,
    gap: 6,
  },
  cardAddressRow: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 4,
  },
  cardAddressIcon: {
    marginTop: 2,
  },
  cardAddress: {
    flex: 1,
    fontSize: 13,
    color: '#757575',
    lineHeight: 18,
  },
  cardDistance: {
    fontSize: 12,
    fontWeight: '600',
    color: '#1976D2',
    alignSelf: 'center',
  },
  externalCta: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 8,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: '#EEEEEE',
    gap: 4,
  },
  externalCtaText: {
    flex: 1,
    fontSize: 12,
    color: '#2196F3',
    fontStyle: 'italic',
  },
  emptyContainer: {
    padding: 48,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyTitle: {
    fontSize: 17,
    fontWeight: '600',
    color: '#757575',
    marginTop: 16,
    marginBottom: 8,
    textAlign: 'center',
  },
  emptySubtext: {
    fontSize: 14,
    color: '#9E9E9E',
    textAlign: 'center',
  },
  map: {
    flex: 1,
  },
  mapPlaceholder: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    gap: 12,
  },
  mapPlaceholderText: {
    fontSize: 15,
    color: '#757575',
  },
});

export default MeetingFinderScreen;
