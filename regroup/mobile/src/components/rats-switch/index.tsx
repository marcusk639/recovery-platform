import React from 'react';
import { SwitchProps, Switch, View, ViewStyle, TextStyle } from 'react-native';
import { normalize, fontFamily, color } from '../../styles/theme';
import { FieldProps } from 'formik';
import RatsLabel from '../rats-label/rats-label';
import { IOS } from '../../util/platform';

interface RatsSwitchProps extends SwitchProps {
  labelDisabled?: boolean;
  containerStyle?: ViewStyle;
  labelSide?: 'left' | 'right';
}

const SWITCH_STYLE: ViewStyle = {
  transform: IOS
    ? [{ scaleX: 1.0 }, { scaleY: 0.9 }]
    : [{ scaleX: 1.4 }, { scaleY: 1.3 }],
  marginLeft: 'auto' as any,
  // marginRight: normalize(20)
};

const LABEL_CONTAINER: ViewStyle = { width: '77%' };

const CONTAINER: ViewStyle = {
  flexDirection: 'row',
  alignSelf: 'flex-start',
  marginVertical: normalize(10),
  width: '100%',
};

// const SWITCH_CONTAINER: ViewStyle = {
//   width: '100%'
// };
// const SWITCH_STYLE: ViewStyle = {
//   marginLeft: 'auto',
//   marginRight: normalize(20)
// };

const ERROR: TextStyle = {};

interface RatsSwitchLabelProps {
  labelContainerStyle?: ViewStyle;
  labelStyle?: TextStyle;
  label?: string;
}

const RatsSwitchLabel = (props: RatsSwitchLabelProps) => {
  const { labelContainerStyle, labelStyle, label } = props;
  return (
    <View style={[LABEL_CONTAINER, labelContainerStyle]}>
      {
        <RatsLabel
          style={[
            { fontFamily: fontFamily.roboto, color: color.black },
            labelStyle,
          ]}
          label={label}
        />
      }
      {/* {errors[name] && touched[name] && <RatsLabel style={ERROR} label={errors[name]} />} */}
    </View>
  );
};

export const RatsSwitch = (
  props: Partial<RatsSwitchProps & RatsSwitchLabelProps> & Partial<FieldProps>,
) => {
  const {
    labelDisabled,
    containerStyle,
    labelContainerStyle,
    labelStyle,
    label,
    field,
    form,
    labelSide = 'left',
  } = props;
  let onChange: ((e: any) => void) | undefined;
  let name: string | undefined;
  let value: boolean | undefined;
  let setFieldValue: ((field: string, value: any) => void) | undefined;

  if (field) {
    onChange = field.onChange;
    name = field.name;
    value = field.value;
  }
  if (form) {
    setFieldValue = form.setFieldValue;
  }
  const renderLabel = () => (
    <RatsSwitchLabel
      labelContainerStyle={labelContainerStyle}
      label={label}
      labelStyle={labelStyle}
    />
  );
  return (
    <View style={[CONTAINER, containerStyle]}>
      {!labelDisabled && labelSide === 'left' && renderLabel()}
      <Switch
        value={props.value || value}
        style={[SWITCH_STYLE, props.style]}
        onValueChange={val => {
          if (props.onValueChange) {
            return props.onValueChange(val);
          }
          if (setFieldValue && name) {
            return setFieldValue(name, val);
          }
        }}
      />
      {!labelDisabled && labelSide === 'right' && renderLabel()}
    </View>
  );
};
