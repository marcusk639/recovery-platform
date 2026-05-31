import React from 'react';
import {
  View,
  TextStyle,
  ViewStyle,
  TextInput,
  TextInputProps,
  TouchableOpacity,
} from 'react-native';
import RatsLabel from '../rats-label/rats-label';
import { fontSize, fontFamily, normalize, color } from '../../styles/theme';
import { FieldProps } from 'formik';
import RatsTextInput from '../rats-text-input/rats-text-input';
import styles from '../rats-text-input/styles';
import { RatsIcon } from '../rats-icon/rats-icon';
import { IOS } from '../../util/platform';

interface Props {
  style: any;
  disabled: boolean;
  labelDisabled: boolean;
  minimumValue?: number;
  maximumValue?: number;
  label: string;
  labelStyle?: TextStyle;
  row?: boolean;
  containerStyle?: ViewStyle;
  textAlign?: any;
  inputView?: ViewStyle;
  styleType: 'primary' | 'secondary';
}

export const ARROW_BUTTON: ViewStyle = {
  alignItems: 'center',
  justifyContent: 'center',
  paddingVertical: normalize(5),
  paddingHorizontal: normalize(8),
  borderColor: color.baby_blue,
  borderWidth: 1.5,
  borderRadius: 5,
};

const numberIsValid = (number: number, min: number, max: number) => {
  return number <= max && number >= min;
};

const RatsNumericInput = (props: Props & FieldProps & TextInputProps) => {
  const {
    field: { name, value = 0 },
    form: { setFieldValue, errors, touched },
    label,
    labelDisabled,
    minimumValue = 0,
    maximumValue = 1000,
    labelStyle,
    row,
    containerStyle,
    placeholder,
    textAlign,
    styleType = 'secondary',
  } = props;
  return (
    <View style={[{ marginVertical: normalize(10) }, containerStyle]}>
      {!labelDisabled && (
        <RatsLabel
          style={[{ fontFamily: fontFamily.roboto }, labelStyle]}
          label={label}
        />
      )}
      <View
        style={{
          flexDirection: 'row',
          justifyContent: 'space-between',
          flex: 1,
        }}>
        <View style={[styles[styleType].inputView]}>
          <TextInput
            underlineColorAndroid="transparent"
            style={[
              styles[styleType].input,
              IOS ? { paddingTop: 0, width: '75%' } : { width: '73%' },
            ]}
            // onChangeText={customHandleChange ? text => customHandleChange(text) : onChange(name)}
            onChangeText={text => {
              const number = parseInt(text || '0');
              // if (numberIsValid(number, minimumValue, maximumValue)) setFieldValue(name, number);
              setFieldValue(name, number);
            }}
            placeholder={placeholder}
            value={`${value}`}
            placeholderTextColor={color.grey}
            keyboardType="numeric"
            // textAlign={textAlign}
            // multiline={props.multiline || true}
            onSubmitEditing={props.onSubmitEditing}
          />
        </View>
        <View
          style={{
            width: IOS ? '25%' : '27%',
            flexDirection: 'row',
            justifyContent: 'space-evenly',
          }}>
          <TouchableOpacity
            style={ARROW_BUTTON}
            onPress={() => {
              const integer = parseInt(value || 0);
              const newValue =
                integer - 1 < minimumValue ? integer : integer - 1;
              setFieldValue(name, newValue || minimumValue || 0);
            }}>
            <RatsIcon
              name="arrow-down"
              style={{ color: color.baby_blue }}
              size={20}
            />
          </TouchableOpacity>
          <TouchableOpacity
            style={ARROW_BUTTON}
            onPress={() => {
              const integer = parseInt(value);
              const newValue =
                integer + 1 > maximumValue ? integer : integer + 1;
              setFieldValue(name, newValue || minimumValue || 0);
            }}>
            <RatsIcon
              name="arrow-up"
              style={{ color: color.baby_blue }}
              size={20}
            />
          </TouchableOpacity>
        </View>
      </View>
      {errors[name] && touched[name] && (
        <RatsLabel
          style={styles[styleType].error}
          label={errors[name as any]}
        />
      )}
    </View>
  );
};

export default RatsNumericInput;
