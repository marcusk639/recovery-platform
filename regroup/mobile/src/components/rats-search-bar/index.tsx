import React, { useState } from 'react';
import {
  StyleProp,
  ViewStyle,
  View,
  TextInput,
  TextInputProps,
  TextStyle,
  TouchableOpacity,
} from 'react-native';
import { Location } from '../../entities/Meeting';
import {
  normalize,
  color,
  fontSize,
  ROW,
  elevateStyle,
  fontFamily,
} from '../../styles/theme';
import { getPlaceAsAddress, AddressDetails, GooglePlaceDetail } from '../../util/address';
import { IOS } from '../../util/platform';
import RatsGooglePlacesAutocomplete from '../google-places-autocomplete';
import { RatsIcon } from '../rats-icon/rats-icon';
import { RatsText } from '../rats-text';
import Geolocation from 'react-native-geolocation-service';

// Declare navigator geolocation globally for this module
declare const navigator: {
  geolocation: typeof Geolocation;
};

export interface RatsSearchProps extends TextInputProps {
  placeholder?: string;
  value: string;
  icon?: string;
  onChangeText: (query: string) => void;
  onIconPress?: () => void;
  onFilter: () => void;
  style?: StyleProp<ViewStyle>;
  iconColor?: string;
  clearIcon?: any;
  container?: ViewStyle;
  filters?: string[];
  address?: boolean;
  setRef?: (ref: any) => void;
  onFocus?: () => void;
  showCurrentLocation?: boolean;
  setLocation?: (location: Location) => void;
}

const CONTAINER: ViewStyle = {
  width: '100%',
  // height: normalize(50),
  backgroundColor: color.white,
  // justifyContent: 'center',
  paddingHorizontal: normalize(5),
  ...elevateStyle,
};

const INPUT_CONTAINER: ViewStyle = {
  ...ROW,
  justifyContent: 'space-between',
  // alignItems: 'center',
  backgroundColor: color.white,
};

const ICON: TextStyle = {
  color: color.baby_blue,
  paddingHorizontal: normalize(10),
};

const TEXT_STYLE: TextStyle = {
  width: '100%',
  flex: 1,
  paddingVertical: normalize(5),
  color: color.grey,
  fontSize: fontSize.medium,
  backgroundColor: color.white,
  fontFamily: fontFamily.roboto,
};

navigator.geolocation = require('react-native-geolocation-service');

const RatsSearchBar = (props: RatsSearchProps) => {
  const [listViewDisplayed, setListViewDisplayed] = useState(false);
  const {
    onChangeText,
    value,
    onSubmitEditing,
    onFilter,
    container,
    filters,
    address = false,
    setRef,
    onFocus,
    showCurrentLocation,
    setLocation,
  } = props;
  return (
    <View style={[CONTAINER, container]}>
      <View style={INPUT_CONTAINER}>
        <RatsIcon
          name="search"
          size={fontSize.medium}
          style={{ ...ICON, color: color.grey, paddingVertical: normalize(15) }}
        />
        {!address && (
          <TextInput
            underlineColorAndroid="transparent"
            style={TEXT_STYLE}
            onChangeText={onChangeText}
            placeholder={props.placeholder || 'Search...'}
            value={value}
            placeholderTextColor={color.grey}
            autoCapitalize="words"
            returnKeyType="search"
            onSubmitEditing={onSubmitEditing}
          />
        )}
        {address && (
          <RatsGooglePlacesAutocomplete
            placeholder="Begin typing to see addresses..."
            placeholderTextColor={color.black}
            // suppressDefaultStyles
            currentLocation={true}
            setRef={setRef || (() => {})}
            textInputProps={{ onFocus }}
            rightButtonStyle={{ marginRight: normalize(10) }}
            styles={{
              container: {
                position: 'relative',
                flex: 1,
                justifyContent: 'center',
              },
              listView: {
                zIndex: 10,
                // height: normalize(100)
              },
              // textInputContainer: INPUT_CONTAINER,
              description: {
                fontFamily: fontFamily.bold,
                fontSize: fontSize.regular_medium,
                color: color.black,
              },
              predefinedPlacesDescription: {
                color: '#1faadb',
              },
              textInput: { ...TEXT_STYLE },
              // listView: {},
              row: {
                padding: 13,
                height: 44,
                flexDirection: 'row',
              },
            }}
            getDefaultValue={() => {
              // const value = getFieldValue(values, props.pathToAddress);
              // return value ? value : showCurrentLocation ? 'Current Location' : '';
              return showCurrentLocation ? 'Current Location' : value;
            }}
            listViewDisplayed={listViewDisplayed}
            onPress={(data, details = null) => {
              // 'details' is provided when fetchDetails = true
              if (details && details.geometry) {
                const addressDetails: AddressDetails = getPlaceAsAddress(details as GooglePlaceDetail);
                const location: Location = {
                  lat: typeof addressDetails.lat === 'string'
                    ? parseFloat(addressDetails.lat)
                    : addressDetails.lat,
                  lng: typeof addressDetails.lng === 'string'
                    ? parseFloat(addressDetails.lng)
                    : addressDetails.lng,
                  city: addressDetails.city,
                  state: addressDetails.state,
                  street: addressDetails.street,
                  zip: addressDetails.zip,
                };
                setLocation?.(location);
              }
              setListViewDisplayed(false);
            }}
          />
        )}
        <TouchableOpacity
          testID="filter-activities-button"
          style={{ paddingTop: normalize(15) }}
          onPress={onFilter}>
          <RatsIcon name="filter" size={fontSize.large} style={ICON} />
        </TouchableOpacity>
      </View>
      {filters && filters.length && (
        <View style={ROW}>
          {filters.map(
            filter =>
              filter && (
                <RatsText
                  key={filter + 'key'}
                  translate={false}
                  text={filter}
                  style={{
                    fontSize: fontSize.regular,
                    padding: normalize(5),
                    borderWidth: 1,
                    borderRadius: 5,
                    borderColor: color.black,
                  }}
                />
              ),
          )}
        </View>
      )}
    </View>
  );
};

export default RatsSearchBar;
