import { View } from 'react-native';
import React from 'react';
import Picker, { Item } from 'react-native-picker-select';
import IoniconsIcon from 'react-native-vector-icons/Ionicons';
import { pickerSelectStyles, styles } from './styles';
import RatsLabel from '../rats-label/rats-label';
import { normalize, color } from '../../styles/theme';
import { useTranslation } from '../../context';
import { IOS } from '../../util/platform';
import { withRats, HOCProps } from '../rats-hoc';

interface Props extends HOCProps {
  disabled?: boolean;
  labelDisabled?: boolean;
  mode?: string;
  // the values associated with each picker item
  pickerItems: {
    [key: string]: any;
  };
  // maps values associated with each picker item to an object with key, label, and value
  // so RNPickerSelect can render the PickerItems with these values
  getPickerItems: (
    pickerItems: any,
    t?: (rbKey: string) => string,
  ) => {
    key: string;
    label: string;
    value: any;
  }[];
  handleValueChange?: (value: any) => void;
  label?: string;
  placeholder?: string;
  containerStyle?: any;
  items?: Item[];
  labelStyle?: any;
  style?: any;
  itemKey?: string;
  field: {
    name?: string;
    onBlur?: () => any;
    value?: any;
  };
  form: {
    errors?: Record<string, any>;
    touched?: Record<string, boolean>;
    setFieldValue?: (name: string, value: any) => any;
  };
  translate?: boolean;
}

/**
 * Select Picker which works both with and without Formik
 * @param {*} props
 */
const RatsPicker = (props: Props): JSX.Element => {
  const {
    field: { name, value },
    form: { errors, touched, setFieldValue },
    labelDisabled,
    pickerItems,
    getPickerItems,
    handleValueChange,
    label,
    itemKey,
    containerStyle,
    items,
    labelStyle = {},
    t,
    translate,
  } = props;
  let _ref: any;
  return (
    <View style={[styles.viewContainer, containerStyle]}>
      <View style={{ flexDirection: 'row' }}>
        {!labelDisabled && (
          <RatsLabel
            style={{ color: color.dark_grey, ...labelStyle }}
            label={label}
          />
        )}
        {/* {(errors as any)[name as any] && (touched as any)[name as any] && <RatsLabel style={styles.error} label={(errors as any)[name as any]} />} */}
      </View>
      <Picker
        value={value}
        itemKey={itemKey}
        ref={ref => (_ref = ref)}
        onDonePress={() => _ref.setState({ showPicker: false })}
        items={items || getPickerItems(pickerItems, translate && t ? t : undefined)}
        useNativeAndroidPickerStyle={false}
        style={{
          ...pickerSelectStyles,
          iconContainer: { top: IOS ? 10 : 12, right: 10 },
        }}
        textInputProps={{
          placeholderTextColor: color.grey,
        }}
        onValueChange={(itemValue, index) => {
          if (itemValue && itemValue !== value) {
            if (handleValueChange) {
              handleValueChange(itemValue);
            } else if (setFieldValue && name) {
              setFieldValue(name, itemValue);
            }
          }
        }}
        Icon={
          <IoniconsIcon name="md-arrow-down" size={normalize(24)} color="gray" />
        }
      />
      {name && errors?.[name] && touched?.[name] && (
        <RatsLabel style={[styles.error]} label={errors[name]} />
      )}
    </View>
  );
};

RatsPicker.defaultProps = {
  translate: true,
  disabled: false,
  placeholder: '',
  style: {},
  field: {
    onBlur: () => {},
  },
  form: {
    errors: {},
    touched: {},
  },
  labelDisabled: false,
  mode: 'dropdown',
  getPickerItems: (pickerItems: any, t?: (key: string) => string) =>
    Object.keys(pickerItems).map(key => ({
      key,
      label: t ? t(key) : key,
      value: pickerItems[key],
    })),
  label: 'forgot label',
  containerStyle: {},
};

export default withRats(RatsPicker);
