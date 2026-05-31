import React, { useState, useEffect, useCallback, Fragment } from 'react';
import {
  StyleSheet,
  View,
  Dimensions,
  TextStyle,
  ListRenderItemInfo,
} from 'react-native';
import { filter, isEmpty, size } from 'lodash';
import { Houses } from '../../types';
import { HEALTH_ICON_MAP, HEALTH_COLOR_MAP } from '../../util/guest';
import { User } from '../../entities/User';
import { RatsText } from '../../components/rats-text';
import RatsButton from '../../components/rats-button/rats-button';
import { Routes, AuthStackNavigationProp } from '../../navigation/types';
import RatsLoadingIndicator from '../../components/rats-loading-indicator/rats-loading-indicator';
import { selectHouseById } from '../../state/slices/housesSlice';
import { searchForHouses as searchForHousesService } from '../../services/house';
import { logException } from '../../util/logging';
import {
  fontSize,
  ROW,
  color,
  CARD_STYLE,
  normalize,
  fontFamily,
} from '../../styles/theme';
import { checkAndRequestLocationPermissions } from '../../util/permissions';
import RatsSearchFilter from '../../components/rats-search-filter';
import RatsScrollView from '../../components/rats-scroll-view';
import RatsSearchBar from '../../components/rats-search-bar';
import HelpIcon from '../../components/help-icon';
import ScreenHeader from '../../components/screen-header';
// Phase 3.3: Migrated from 2 HOC layers to Context hooks
// Removed: withFormModal, withPopover
// Added: useModal, useNotification hooks
import { useModal, useNotification } from '../../context';
import { HouseSearchFilter } from '../../entities/HouseSearch';
import { HouseSearchFilterForm } from './HouseSearchFilterForm';
import { House } from '../../entities/House';
import RatsAvatar from '../../components/rats-avatar';
import { RatsFlatList } from '../../components/rats-flat-list';
import { RatsIcon } from '../../components/rats-icon';
import HealthConstants from '../../constants/health';
import { getAddressDisplay } from '../../util/address';
import EmptyScreen from '../../components/empty-screen';
import Geolocation from '@react-native-community/geolocation';
import isEqual from 'lodash/isEqual';

import { useAppSelector, useAppDispatch } from '../../state/store';

interface HouseSearchProps {
  navigation: AuthStackNavigationProp;
}

const styles = StyleSheet.create({
  container: {
    flexGrow: 1,
    justifyContent: 'flex-start',
    alignItems: 'center',
    backgroundColor: color.light_grey,
  },
});

type GenderFilter = 'male' | 'female' | '';

/**
 * House Search Screen
 *
 * Allows users to search for sober living houses by location and filters.
 *
 * @migrated Phase 2.2 - Converted from old Redux to RTK
 * Changes:
 * - Replaced old Redux actions with RTK thunks
 * - Added typed selectors (removed 3 'as any' casts)
 * - Kept HOCs (will be removed in Phase 3)
 */
const HouseSearchScreen: React.FC<HouseSearchProps> = props => {
  const { navigation } = props;

  // Context hooks (replaces HOCs)
  const { showFormModal, dismissFormModal } = useModal();
  const { showPopover, setPopoverRef } = useNotification();

  const dispatch = useAppDispatch();

  // Phase C removed the searchForHouses thunk and the searchedHouses /
  // searchingHouses slice fields it wrote to. Search state now lives in
  // local useState and the service call is direct.
  const user = useAppSelector(state => state.user.user);
  const [searchedHouses, setSearchedHouses] = useState<House[]>([]);
  const [searching, setSearching] = useState(false);

  const [gettingPermissions, setGettingPermissions] = useState(true);
  const [locationDenied, setLocationDenied] = useState(false);
  const [results, setResults] = useState<any>(null);
  const [filters, setFilters] = useState<HouseSearchFilter>(
    new HouseSearchFilter(),
  );
  const [currentPlace, setCurrentPlace] = useState<any>(null);
  const [currentLocation, setCurrentLocation] = useState(false);
  const [listViewDisplayed, setListViewDisplayed] = useState(false);
  const [searchTerm, setSearchTermState] = useState('');

  const setSearchFiltersCallback = useCallback(
    (newFilters: HouseSearchFilter) => {
      if (isEqual(newFilters, filters)) {
        return;
      }
      setFilters(newFilters);
      setCurrentLocation(false);
      searchForHouses(null, newFilters);
    },
    [filters],
  );

  const setCoords = useCallback(
    (coords: any, callback?: () => any, isCurrentLocation = false) => {
      setFilters(prev => ({
        ...prev,
        location: { lat: coords.latitude, lng: coords.longitude },
      }));
      setCurrentLocation(isCurrentLocation);
      if (callback) {
        callback();
      }
    },
    [],
  );

  const searchForHouses = useCallback(
    async (_place?: any, searchFilters?: HouseSearchFilter) => {
      if (!searchFilters) {
        return;
      }
      setSearching(true);
      try {
        const results = await searchForHousesService({
          filters: searchFilters,
        });
        setSearchedHouses(Object.values(results ?? {}) as House[]);
      } catch (err) {
        logException(err);
        setSearchedHouses([]);
      } finally {
        setSearching(false);
      }
    },
    [],
  );

  const selectHouse = useCallback(
    (houseId: string) => {
      const house = searchedHouses.find(h => h.id === houseId);
      if (house) {
        dispatch(selectHouseById(house.id));
        navigation.navigate(Routes.IntroHouseSummary);
      }
    },
    [searchedHouses, dispatch, navigation],
  );

  const renderFilter = useCallback(
    (
      onPress: () => void,
      active: boolean = false,
      filterName: string,
      iconName: string,
    ) => {
      return (
        <RatsSearchFilter
          onPress={onPress}
          active={active}
          filterName={filterName}
          iconName={iconName}
        />
      );
    },
    [],
  );

  const renderHouses = useCallback(() => {
    const houseResults = filter(searchedHouses, house => {
      if (searchTerm && searchTerm.length) {
        return house.name?.toLowerCase().includes(searchTerm.toLowerCase());
      } else {
        return true;
      }
    }).sort((a, b) => {
      return (a.name || '').localeCompare(b.name || '', 'en', {
        sensitivity: 'base',
      });
    });
    return (
      <RatsFlatList<House>
        scrollEnabled
        renderItem={renderHouse}
        data={houseResults}
        keyExtractor={(item, index) => index.toString()}
        removeClippedSubviews={true} // Unmount components when outside of window
        initialNumToRender={5} // Reduce initial render amount
        maxToRenderPerBatch={1} // Reduce number in each render batch
        updateCellsBatchingPeriod={100} // Increase time between renders
        windowSize={7} // Reduce the window size
        ItemSeparatorComponent={() => <View style={{ height: normalize(5) }} />}
      />
    );
  }, [searchedHouses, searchTerm]);

  const renderDescription = useCallback((row: any) => {
    return row.description;
  }, []);

  const executeSearch = useCallback(() => {
    searchForHouses();
  }, [searchForHouses]);

  const setSearchTerm = useCallback((text: string) => {
    setSearchTermState(text);
  }, []);

  const clearCurrentLocation = useCallback(() => {
    setCurrentLocation(false);
  }, []);

  const openFilters = useCallback(() => {
    showFormModal(
      <HouseSearchFilterForm
        clearCurrentLocation={clearCurrentLocation}
        currentLocation={currentLocation}
        setSearchFilters={setSearchFiltersCallback}
        dismissModal={dismissFormModal}
        filters={filters}
      />,
    );
  }, [
    showFormModal,
    clearCurrentLocation,
    currentLocation,
    setSearchFiltersCallback,
    dismissFormModal,
    filters,
  ]);

  const renderHelp = useCallback(() => {
    showPopover?.(
      'HOUSE SEARCH',
      'Here you can search for sober living homes in any location and view basic information about those homes.',
    );
  }, [showPopover]);

  const renderSearch = useCallback(() => {
    return (
      <View>
        <ScreenHeader
          renderBackButton
          container={{ marginBottom: 1 }}
          icon={<HelpIcon setRef={setPopoverRef} helpFn={renderHelp} />}
          header="Find Houses"
        />
        <RatsSearchBar
          container={{ ...CARD_STYLE, marginBottom: 1 }}
          onSubmitEditing={executeSearch}
          value={searchTerm}
          onChangeText={setSearchTerm}
          onFilter={openFilters}
          placeholder="Search house name..."
        />
      </View>
    );
  }, [
    renderHelp,
    setPopoverRef,
    executeSearch,
    searchTerm,
    setSearchTerm,
    openFilters,
  ]);

  const renderHouseImage = useCallback((house: House) => {
    return (
      <RatsAvatar
        name={house.name}
        style={{
          height: normalize(45),
          width: normalize(45),
          borderRadius: normalize(45),
          marginRight: normalize(5),
        }}
        source={{ uri: house.avatar }}
        resizeMethod="resize"
        resizeMode="cover"
      />
    );
  }, []);

  const renderStars = useCallback((house: House) => {
    const phaseNumber = size(house.phases);
    const number = house.rating || 3;
    const stars: JSX.Element[] = [];
    for (let i = 1; i <= number; i++) {
      stars.push(
        <RatsIcon
          solid
          name="star"
          size={20}
          style={{ color: color.yellow }}
        />,
      );
    }
    return <View style={ROW}>{stars}</View>;
  }, []);

  const renderHouseDescription = useCallback(
    (house: House) => {
      const HOUSE_DESCRIPTION_TEXT: TextStyle = {
        fontSize: fontSize.regular_medium,
        marginBottom: normalize(2),
      };
      return (
        <Fragment>
          <RatsText style={HOUSE_DESCRIPTION_TEXT} text={house.street || ''} />
          <RatsText
            style={HOUSE_DESCRIPTION_TEXT}
            text={getAddressDisplay('', house.city, house.state, house.zip)}
          />
          <View style={ROW}>
            <RatsIcon
              name={house.certified ? 'check' : 'times'}
              style={{
                ...HOUSE_DESCRIPTION_TEXT,
                color: house.certified ? color.green : color.red,
                marginRight: normalize(5),
              }}
              size={20}
            />
            <RatsText
              style={HOUSE_DESCRIPTION_TEXT}
              text={house.certified ? 'Certified' : 'Not Certified'}
            />
          </View>
          {renderStars(house)}
        </Fragment>
      );
    },
    [renderStars],
  );

  const renderHouseHeading = useCallback((house: House) => {
    return (
      <View
        style={{
          justifyContent: 'center',
          flex: 1,
          marginLeft: normalize(10),
        }}>
        <RatsText
          text={house.name}
          style={{
            fontSize: fontSize.medium_large,
            fontFamily: fontFamily.bold,
          }}
        />
        <RatsText
          text={'12 Step'}
          style={{ fontSize: fontSize.regular_medium, color: color.grey }}
        />
      </View>
    );
  }, []);

  const renderDetailsButton = useCallback(
    (house: House) => {
      return (
        <RatsButton
          onPress={() => selectHouse(house.id)}
          title="VIEW DETAILS"
          containerStyle={{
            backgroundColor: color.white,
            borderColor: color.baby_blue,
            borderWidth: 1.5,
            marginTop: normalize(15),
            marginBottom: normalize(10),
          }}
          style={{ color: color.baby_blue }}
        />
      );
    },
    [selectHouse],
  );

  const renderHouseHealth = useCallback((house: House) => {
    const icon = HEALTH_ICON_MAP[HealthConstants.SAD];
    return (
      <RatsIcon
        size={30}
        name={HEALTH_ICON_MAP[HealthConstants.SAD]}
        style={{ color: HEALTH_COLOR_MAP[HealthConstants.SAD] }}
      />
    );
  }, []);

  const renderHouse = useCallback(
    (listItem: ListRenderItemInfo<House>) => {
      const house = listItem.item;
      const width = Dimensions.get('screen').width;
      return (
        <View
          key={listItem.index}
          style={[
            CARD_STYLE,
            {
              width,
              paddingVertical: normalize(15),
              paddingHorizontal: normalize(15),
            },
          ]}>
          <View style={[ROW]}>
            {renderHouseImage(house)}
            {renderHouseHeading(house)}
            {renderHouseHealth(house)}
          </View>
          <View
            style={{
              width: '100%',
              paddingVertical: normalize(10),
              paddingHorizontal: normalize(5),
            }}>
            {renderHouseDescription(house)}
          </View>
          <View style={{ paddingHorizontal: normalize(5) }}>
            {renderDetailsButton(house)}
          </View>
        </View>
      );
    },
    [
      renderHouseImage,
      renderHouseHeading,
      renderHouseHealth,
      renderHouseDescription,
      renderDetailsButton,
    ],
  );

  const renderSearchView = useCallback(() => {
    return <View style={{ width: '100%' }}>{renderSearch()}</View>;
  }, [renderSearch]);

  useEffect(() => {
    const initialize = async () => {
      const permission = await checkAndRequestLocationPermissions();
      if (permission) {
        Geolocation.getCurrentPosition(
          position => {
            setCoords(
              {
                latitude: position.coords.latitude,
                longitude: position.coords.longitude,
              },
              () => {
                searchForHouses(null, filters);
              },
              true,
            );
          },
          _error => {
            // GPS error (device cannot determine position): let user search manually
            setLocationDenied(true);
          },
        );
      } else {
        // Permission denied — inform the user and let them search manually via filters
        setLocationDenied(true);
      }
      setGettingPermissions(false);
    };

    initialize();
  }, []);

  if (gettingPermissions) {
    return <RatsLoadingIndicator />;
  }
  return (
    <View
      style={{ flex: 1, backgroundColor: color.light_grey }}
      testID="house-search-screen">
      {renderSearchView()}
      <View style={styles.container}>
        {locationDenied && (
          <View
            testID="location-denied-banner"
            style={{
              backgroundColor: color.baby_blue,
              padding: normalize(12),
              marginHorizontal: normalize(10),
              marginBottom: normalize(8),
              borderRadius: 6,
            }}>
            <RatsText
              translate={false}
              text="Location unavailable. Use the filters to search by city or zip code."
              style={{
                color: color.white,
                textAlign: 'center' as const,
                fontSize: fontSize.small,
              }}
            />
          </View>
        )}
        {searching && <RatsLoadingIndicator />}
        {!searching && !isEmpty(searchedHouses) && renderHouses()}
        {!searching && isEmpty(searchedHouses) && (
          <EmptyScreen
            containerStyle={{ paddingHorizontal: normalize(10) }}
            icon="folder-open"
            buttonTitle="CHANGE FILTERS"
            onPress={() => openFilters()}
            message="No houses found. Try changing the search filters."
          />
        )}
      </View>
    </View>
  );
};

export default HouseSearchScreen;
