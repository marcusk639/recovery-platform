import React, { Component } from 'react';
import { GOOGLE_API_KEY } from '../../../google/apikeys';
import {
  GooglePlacesAutocomplete,
  GooglePlacesAutocompleteRef,
} from 'react-native-google-places-autocomplete';
import autocompleteStyles from './styles';
import { toLegacyPlaceDetail } from './placeDetail';
import { RatsIcon } from '../rats-icon/rats-icon';
import { fontSize, normalize } from '../../styles/theme';
import { TouchableOpacity, Platform, TextInputProps } from 'react-native';

// Define types to match the library's expectations
interface DescriptionRow {
  description?: string;
  formatted_address?: string;
  name?: string;
  vicinity?: string;
  [key: string]: any;
}

interface GooglePlaceData {
  description: string;
  [key: string]: any;
}

interface GooglePlaceDetail {
  formatted_address?: string;
  name?: string;
  vicinity?: string;
  [key: string]: any;
}

const apiKey = GOOGLE_API_KEY();

export interface RatsGooglePlacesAutocompleteProps {
  onPress: (data: GooglePlaceData, details: GooglePlaceDetail | null) => void;
  rightButtonPress?: () => void;
  renderDescription?: (row: DescriptionRow) => string;
  /** Ignored: the library shows and hides the list itself (see render). */
  listViewDisplayed?: boolean;
  placeholder?: string;
  textInputProps?: TextInputProps;
  setRef: (ref: GooglePlacesAutocompleteRef) => void;
  rightButtonStyle?: any;
  suppressDefaultStyles?: boolean;
  styles?: any;
  [key: string]: any;
}

interface State {
  /** The field has been focused at least once. */
  opened: boolean;
}

class RatsGooglePlacesAutocomplete extends Component<
  RatsGooglePlacesAutocompleteProps,
  State
> {
  googlePlacesRef: any;
  state: State = { opened: false };

  onFocus: NonNullable<TextInputProps['onFocus']> = event => {
    if (!this.state.opened) {
      this.setState({ opened: true });
    }
    this.props.textInputProps?.onFocus?.(event);
  };

  onRightButtonPress = () => {
    this.googlePlacesRef.setAddressText('');
    if (this.props.rightButtonPress) {
      this.props.rightButtonPress();
    }
  };

  renderRightButton = (): React.JSX.Element => {
    if (Platform.OS !== 'android') {
      return <></>;
    }
    return (
      <TouchableOpacity
        style={[
          {
            justifyContent: 'center',
            alignItems: 'center',
            alignSelf: 'center',
            position: 'absolute',
            marginRight: normalize(20),
            paddingTop: normalize(3),
            right: 0,
          },
          this.props.rightButtonStyle,
        ]}
        onPress={this.onRightButtonPress}>
        <RatsIcon name="times" size={fontSize.regular} />
      </TouchableOpacity>
    );
  };

  setGooglePlacesRef = (ref: GooglePlacesAutocompleteRef) => {
    this.googlePlacesRef = ref;
    if (this.props.setRef) {
      this.props.setRef(ref);
    }
  };

  render() {
    const {
      placeholder,
      suppressDefaultStyles,
      textInputProps,
      renderDescription,
      onPress,
      styles,
      setRef,
      listViewDisplayed,
      rightButtonPress,
      rightButtonStyle,
      ...restProps
    } = this.props;

    return (
      // <View style={{ width: Dimensions.get('screen').width }}>
      <GooglePlacesAutocomplete
        placeholder={placeholder || 'Search...'}
        keyboardShouldPersistTaps="handled"
        minLength={2} // minimum length of text to search
        fetchDetails={true}
        currentLocation={true}
        suppressDefaultStyles={suppressDefaultStyles ? true : false}
        currentLocationLabel="Current Location"
        textInputProps={{
          clearButtonMode: 'always',
          autoFocus: false,
          returnKeyType: 'search',
          keyboardAppearance: 'light',
          ...(textInputProps || {}),
          onFocus: this.onFocus,
        }}
        renderRightButton={this.renderRightButton}
        renderDescription={
          renderDescription ||
          function (row: DescriptionRow): string {
            return (
              row.description ||
              row.formatted_address ||
              row.name ||
              row.vicinity ||
              ''
            );
          }
        } // custom description render
        onPress={(data, details) => onPress(data, toLegacyPlaceDetail(details))}
        // Places API (New). The legacy places-backend.googleapis.com service is
        // disabled on the phoenix-cleanhouse project, so the legacy
        // /maps/api/place/* endpoints this library calls by default cannot work.
        //
        // isNewPlacesAPI switches it to POST /v1/places:autocomplete and
        // GET /v1/places/{id}. The library maps the new suggestions back to the
        // legacy shape (placePrediction.text.text -> description, placeId ->
        // place_id), but not Place Details: toLegacyPlaceDetail (onPress above)
        // does that, so rats-search-bar and rats-text-input need no change.
        isNewPlacesAPI
        requestUrl={{
          useOnPlatform: 'all',
          url: 'https://places.googleapis.com',
          // The search is a POST with a JSON body, and the library sets no
          // Content-Type. React Native on Android refuses to send a body
          // without one ("Payload is set but no content-type header
          // specified"), so every search failed there with status 0.
          headers: { 'Content-Type': 'application/json' },
        }}
        // Field mask for the Place Details call only — the library passes
        // `fields` to GET /v1/places/{id} and not to :autocomplete. Names are
        // UNPREFIXED here: the `places.` prefix belongs to search responses,
        // where results sit under places[], and sending it to Details returns
        // HTTP 400 "Request contains an invalid argument" (verified against the
        // live API). Defaults to '*' in the library, which bills at the widest
        // SKU, so this narrows it to what the legacy mapping actually reads.
        fields="id,displayName,formattedAddress,location,addressComponents,types"
        query={{
          // Options: https://developers.google.com/maps/documentation/places/web-service/place-autocomplete
          key: apiKey,
          // New API uses languageCode, not language.
          languageCode: 'en',
        }}
        styles={styles ? styles : autocompleteStyles}
        GooglePlacesSearchQuery={{
          // available options for GooglePlacesSearch API : https://developers.google.com/places/web-service/search
          rankby: 'distance',
        }}
        ref={this.setGooglePlacesRef}
        {...restProps}
        // Closed until the field is first focused, then 'auto': the library
        // opens the list on focus and while there are suggestions, and closes
        // it after a pick or on blur. Since 2.6.5 a boolean controls the list
        // outright, and false (all this wrapper used to pass) hid it for good.
        listViewDisplayed={this.state.opened ? 'auto' : false}
      />
      // </View>
    );
  }
}

export default RatsGooglePlacesAutocomplete;
