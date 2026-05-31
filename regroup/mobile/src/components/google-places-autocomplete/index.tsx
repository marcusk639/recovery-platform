import React, { Component } from 'react';
import { GOOGLE_API_KEY } from '../../../google/apikeys';
import {
  GooglePlacesAutocomplete,
  GooglePlacesAutocompleteRef,
} from 'react-native-google-places-autocomplete';
import autocompleteStyles from './styles';
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
  listViewDisplayed: boolean;
  placeholder?: string;
  textInputProps?: TextInputProps;
  setRef: (ref: GooglePlacesAutocompleteRef) => void;
  rightButtonStyle?: any;
  suppressDefaultStyles?: boolean;
  styles?: any;
  [key: string]: any;
}

class State {
  listViewDisplayed: boolean = false;
}

class RatsGooglePlacesAutocomplete extends Component<
  RatsGooglePlacesAutocompleteProps,
  State
> {
  googlePlacesRef: any;
  state = new State();

  onRightButtonPress = () => {
    this.googlePlacesRef.setAddressText('');
    if (this.props.rightButtonPress) {
      this.props.rightButtonPress();
    }
    this.setState({ listViewDisplayed: false });
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

  isListViewDisplayed = () =>
    this.props.listViewDisplayed && this.state.listViewDisplayed;

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
        listViewDisplayed={this.isListViewDisplayed()} // true/false/undefined
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
        onPress={onPress}
        query={{
          // available options: https://developers.google.com/places/web-service/autocomplete
          key: apiKey,
          language: 'en', // language of the results
        }}
        styles={styles ? styles : autocompleteStyles}
        GooglePlacesSearchQuery={{
          // available options for GooglePlacesSearch API : https://developers.google.com/places/web-service/search
          rankby: 'distance',
        }}
        ref={this.setGooglePlacesRef}
        {...restProps}
      />
      // </View>
    );
  }
}

export default RatsGooglePlacesAutocomplete;
