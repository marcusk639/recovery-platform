import React, { useEffect, useRef, useState } from 'react';
import { TextInput, View, ScrollView } from 'react-native';
import {
  color,
  fontFamily,
  fontSize,
  normalize,
  ROW,
} from '../../styles/theme';
import styles from './styles';
import RatsLabel from '../rats-label/rats-label';
import { FormikHandlers, FormikErrors, FormikTouched } from 'formik';
import { TextInputProps } from 'react-native';
import RatsGooglePlacesAutocomplete from '../google-places-autocomplete';
import {
  getPlaceAsAddress,
  AddressDetails,
  getAddressDisplay,
} from '../../util/address';
import { IOS } from '../../util/platform';
import { TouchableOpacity } from 'react-native-gesture-handler';
import { RatsIcon } from '../rats-icon/rats-icon';
import { ARROW_BUTTON } from '../rats-numeric-input';
import { GooglePlacesAutocompleteRef } from 'react-native-google-places-autocomplete';

interface Props {
  placeholder?: string;
  style?: Partial<{
    inputView: {};
    textInput: {};
    contentContainer: {};
  }>;
  sideButtonPress?: () => void;
  lowerContent?: JSX.Element;
  currentLocation?: boolean;
  renderCornerIcon?: () => JSX.Element;
  touchedValue?: boolean;
  labelColor?: string;
  disabled?: boolean;
  labelDisabled?: boolean;
  formatter?: (value: any) => any;
  label?: string;
  styleType?: 'primary' | 'secondary';
  icon?: any;
  customHandleChange?: (value: any) => void;
  textAlign?: string;
  field?: Partial<{
    name?: string;
    onBlur?: FormikHandlers['handleBlur'];
    onChange?: FormikHandlers['handleChange'];
    value?: any;
  }>;
  form?: {
    errors?: Record<string, any> | FormikErrors<any>;
    touched?: Record<string, boolean> | FormikTouched<any>;
    setFieldValue?: (
      field: string,
      value: any,
      shouldValidate?: boolean,
    ) => void;
    values?: any;
  };
  address?: boolean;
  pathToAddress?: string; // denotes the path to the address in a nexted object (e.g, for house.street, this value should be 'house.')
  lowercase?: boolean;
  onPress?: () => any;
  showCurrentLocation?: boolean;
  setRef?: (ref: any) => any;
  onFieldBlur?: (e: any) => void;
  keepResultsAfterBlur?: boolean;
}

const getOnChangeFn = (
  customHandleChange: ((value: any) => void) | undefined,
  onChange: FormikHandlers['handleChange'] | undefined,
  formatter: ((value: any) => any) | undefined,
  setFieldValue: ((field: string, value: any) => void) | undefined,
  name: string,
) => {
  if (customHandleChange) {
    return customHandleChange;
  }
  if (formatter && setFieldValue) {
    return (newValue: any) => {
      const formattedValue = formatter(newValue);
      setFieldValue(name, formattedValue);
    };
  }
  if (onChange) {
    return (value: any) => {
      const event = { target: { name, value } } as any;
      onChange(event);
    };
  }
  return () => {};
};

const getColor = (disabled: boolean) => (disabled ? color.grey : color.black);
const getBorderColor = (errors: any, touched: any, name: string) =>
  errors[name] && touched[name] ? color.red : color.grey;

const formatString = (s: string) => {
  return s && s.length ? s + ' ' : '';
};
const getFieldValue = (values: any, path: string = '') => {
  let parts = path.split('.');
  parts = parts.slice(0, parts.length - 1);
  let accessor = values;

  for (let i = 0; i < parts.length; i++) {
    if (!accessor) {
      break;
    }

    // Check if the part contains an array index pattern like "jobs[0]"
    const arrayMatch = parts[i].match(/^(.*)\[(\d+)\]$/);

    if (arrayMatch) {
      // Extract the property name and array index
      const propName = arrayMatch[1];
      const arrayIndex = parseInt(arrayMatch[2], 10);

      // Access the array property first
      accessor = accessor[propName];

      // Then access the array element at the specified index
      if (accessor && Array.isArray(accessor) && arrayIndex < accessor.length) {
        accessor = accessor[arrayIndex];
      } else {
        accessor = undefined;
        break;
      }
    } else {
      // Regular property access
      accessor = accessor[parts[i]];
    }
  }

  accessor = accessor || {};
  return getAddressDisplay(
    accessor.street,
    accessor.city,
    accessor.state,
    accessor.zip,
  );
};

/**
 * Standard text input box to be used with Formik
 * Intended to be wrapped in <Field> component
 * styleType may be 'primary' or 'secondary'
 */
const RatsTextInput = (props: Props & TextInputProps) => {
  const {
    placeholder,
    address = false,
    style = { inputView: {}, textInput: {} },
    touchedValue,
    field: { name, value, onChange, onBlur } = {},
    form: { errors = {}, touched = {}, setFieldValue, values } = { errors: {}, touched: {}, values: {} },
    disabled = false,
    labelDisabled = false,
    // autoCapitalize = 'none',
    secureTextEntry = false,
    icon,
    editable,
    keepResultsAfterBlur,
    customHandleChange,
    onFocus,
    styleType = 'primary',
    formatter,
    keyboardType,
    labelColor,
    label,
    onFieldBlur,
    textAlign,
    renderCornerIcon,
    currentLocation,
    lowerContent,
    sideButtonPress,
    onPress,
    showCurrentLocation,
    setRef = () => {},
    // lowercase = false
  } = props;
  const hasBeenTouched = () =>
    (address ? (touched as Record<string, boolean>)?.state : (name && (touched as Record<string, boolean>)?.[name])) || touchedValue;
  const onInputBlur = (event: any) => {
    if (value) {
      const val = (value as string).replace(/\s+/gi, ' ');
      if (setFieldValue) {
        setFieldValue(name || '', val.trim());
      } else if (customHandleChange) {
        customHandleChange(val.trim());
      }
    }
    if (onFieldBlur) {
      onFieldBlur(event);
    }
    if (onBlur) {
      return onBlur(name || '');
    }
  };
  const [listViewDisplayed, setListViewDisplayed] = useState(false);
  const textInputStyle = {
    ...styles[styleType].input,
    ...{
      color: getColor(disabled),
      borderColor: getBorderColor(errors, touched, name || ''),
    },
    ...(style.textInput || {}),
  };

  let capitalize = props.autoCapitalize;

  if (!capitalize) {
    capitalize = props.numberOfLines ? 'sentences' : 'words';
  }

  const googlePlacesRef = useRef<GooglePlacesAutocompleteRef>();

  const setGooglePlacesRef = (ref: GooglePlacesAutocompleteRef) => {
    googlePlacesRef.current = ref;
    setRef(ref);
  };

  useEffect(() => {
    if (googlePlacesRef.current) {
      const value = getFieldValue(values, props.pathToAddress);
      const address = value
        ? value
        : showCurrentLocation
        ? 'Current Location'
        : '';
      googlePlacesRef.current.setAddressText(address);
    }
  }, [value]);

  const setPropertyValue = (key: string, addressDetails: AddressDetails, path: string) => {
    setFieldValue?.(path + key, addressDetails[key as keyof AddressDetails]);
  };

  return (
    <View>
      <TouchableOpacity
        onPress={onPress}
        activeOpacity={onPress ? 0.2 : 1.0}
        style={[
          styles[styleType!].container,
          style.contentContainer,
          lowerContent ? { marginBottom: 0 } : {},
        ]}>
        {!labelDisabled && (
          <View style={styles[styleType!].labelContainer}>
            {
              <RatsLabel
                style={[
                  { fontFamily: fontFamily.roboto },
                  labelColor
                    ? { color: labelColor }
                    : { color: color.dark_grey },
                ]}
                label={label || name}
              />
            }
            {renderCornerIcon && renderCornerIcon()}
          </View>
        )}
        {!address && (
          <View
            style={
              sideButtonPress !== undefined
                ? [
                    ROW,
                    {
                      width: '100%',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                    },
                  ]
                : {}
            }>
            <View
              style={[
                styles[styleType!].inputView,
                style.inputView,
                { width: sideButtonPress !== undefined ? '86%' : '100%' },
              ]}>
              {icon && (
                <View
                  style={{ alignItems: 'center', justifyContent: 'center' }}>
                  {icon}
                </View>
              )}
              {!address && (
                <TextInput
                  testID={props.testID}
                  editable={!disabled}
                  ref={ref => (setRef !== undefined ? setRef(ref) : null)}
                  selectTextOnFocus={!disabled}
                  underlineColorAndroid="transparent"
                  style={{
                    ...textInputStyle,
                    ...(props.numberOfLines ? { textAlignVertical: 'top' as const } : {}),
                    ...(props.numberOfLines ? { minHeight: 20 * props.numberOfLines } : {}),
                    ...(textAlign ? { textAlign: textAlign as any } : {}),
                  }}
                  // onChangeText={customHandleChange ? text => customHandleChange(text) : onChange(name)}
                  onChangeText={getOnChangeFn(
                    customHandleChange,
                    onChange,
                    formatter,
                    setFieldValue,
                    name || '',
                  )}
                  placeholder={placeholder}
                  value={value ? `${value}` : ''}
                  onBlur={onInputBlur}
                  onFocus={onFocus}
                  blurOnSubmit={true}
                  placeholderTextColor={color.grey}
                  autoCapitalize={capitalize}
                  secureTextEntry={secureTextEntry}
                  keyboardType={keyboardType}
                  multiline={
                    props.secureTextEntry ? false : props.multiline || false
                  }
                  onSubmitEditing={props.onSubmitEditing}
                  numberOfLines={props.numberOfLines || 1}
                />
              )}
            </View>
            {sideButtonPress && (
              <TouchableOpacity
                style={[
                  ARROW_BUTTON,
                  { borderColor: color.red, paddingVertical: 6 },
                ]}
                onPress={sideButtonPress}>
                <RatsIcon
                  name="times"
                  style={{ color: color.red }}
                  size={normalize(27)}
                />
              </TouchableOpacity>
            )}
          </View>
        )}
        {address && (
          <RatsGooglePlacesAutocomplete
            placeholder="Begin typing to see addresses..."
            placeholderTextColor={color.grey}
            keyboardShouldPersistTaps="always"
            suppressDefaultStyles
            currentLocation={currentLocation}
            ref={null}
            setRef={(ref: GooglePlacesAutocompleteRef) =>
              setGooglePlacesRef(ref)
            }
            textInputProps={{ onFocus }}
            rightButtonStyle={{ marginRight: normalize(10) }}
            styles={{
              container: {
                position: 'relative',
              },
              textInputContainer: styles[styleType!].inputView,
              description: {
                fontFamily: fontFamily.bold,
                fontSize: fontSize.regular_medium,
                color: color.black,
              },
              predefinedPlacesDescription: {
                color: '#1faadb',
              },
              textInput: {
                ...textInputStyle,
                paddingTop: IOS ? 0 : styles[styleType!].input.paddingTop,
              },
              listView: {},
              row: {
                padding: 13,
                height: 44,
                flexDirection: 'row',
              },
            }}
            getDefaultValue={() => {
              const value = getFieldValue(values, props.pathToAddress);
              return value
                ? value
                : showCurrentLocation
                ? 'Current Location'
                : '';
            }}
            listViewDisplayed={listViewDisplayed}
            keepResultsAfterBlur={keepResultsAfterBlur}
            onPress={(data, details = null) => {
              // 'details' is provided when fetchDetails = true
              const addressDetails = getPlaceAsAddress(details as any);
              const path = props.pathToAddress || '';
              Object.getOwnPropertyNames(addressDetails).forEach(key => {
                setPropertyValue(key, addressDetails, path);
              });
              setListViewDisplayed(false);
            }}
          />
        )}
        {name && (errors as Record<string, any>)[name] && hasBeenTouched() && (
          <RatsLabel
            style={[styles[styleType!].error]}
            label={(errors as Record<string, any>)[name]}
          />
        )}
      </TouchableOpacity>
      {lowerContent}
    </View>
  );
};

export default RatsTextInput;
