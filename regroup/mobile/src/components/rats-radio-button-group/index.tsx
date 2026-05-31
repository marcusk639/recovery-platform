import React from 'react';
import { View, StyleSheet, ViewStyle } from 'react-native';
import { color, fontFamily, normalize, fontSize } from '../../styles/theme';
import RatsLabel from '../rats-label/rats-label';
import { FieldProps } from 'formik';
import { useTranslation } from '../../context';
import RadioForm, {
  RadioButton,
  RadioButtonInput,
  RadioButtonLabel,
} from 'react-native-simple-radio-button';
import { withRats, HOCProps } from '../rats-hoc';

interface Option {
  color: string;
  disabled: boolean;
  label: string;
  layout: string;
  selected: boolean;
  size: number;
  value: any;
}

interface Props extends HOCProps {
  disabled?: boolean;
  flexDirection?: string;
  radioButtons: any[];
  labelDisabled?: boolean;
  containerStyle?: any;
  labelContainerStyle?: any;
  formHorizontal: boolean;
  labelStyle?: any;
  label?: string;
  errorStyle?: any;
  labelHorizontal: boolean;
  buttonColor: string;
  selectedButtonColor: string;
  initial: number;
  wrapStyle: ViewStyle;
}

const styles = StyleSheet.create({
  container: {
    marginTop: normalize(10),
  },
  hackContainer: {
    alignSelf: 'flex-start',
  },
  labelContainer: {
    // flexDirection: 'row',
    alignItems: 'stretch',
    justifyContent: 'space-between',
    alignContent: 'flex-end',
    marginBottom: normalize(10),
  },
  error: {
    color: color.red,
    fontSize: fontSize.small,
  },
});

const RatsRadioButtonGroup = (props: Props & FieldProps) => {
  const {
    field: { name, value },
    form: { setFieldValue, errors, touched },
    disabled,
    labelHorizontal = true,
    formHorizontal = true,
    buttonColor = color.black,
    selectedButtonColor = color.black,
    radioButtons,
    labelDisabled,
    label,
    containerStyle,
    labelContainerStyle,
    labelStyle,
    errorStyle,
    initial = -1,
    t,
    wrapStyle = {},
    theme,
  } = props;
  return (
    // outer container is added because of the inability to override RadioGroup styles
    <View style={styles.hackContainer}>
      <View style={[styles.container, containerStyle]}>
        {!labelDisabled && (
          <View style={[styles.labelContainer, labelContainerStyle]}>
            {
              <RatsLabel
                style={[
                  { fontFamily: fontFamily.roboto, marginBottom: 0 },
                  labelStyle,
                ]}
                label={label}
              />
            }
            {errors[name] && touched[name] && (
              <RatsLabel
                style={[styles.error, errorStyle]}
                label={errors[name]}
              />
            )}
          </View>
        )}
      </View>
      <RadioForm formHorizontal={formHorizontal} animation={true}>
        {/* To create radio buttons, loop through your array of options */}
        {radioButtons.map((obj, i) => {
          obj.label = t?.(obj.label) || obj.label;
          return (
            <RadioButton
              wrapStyle={{ marginHorizontal: normalize(10), ...wrapStyle }}
              labelHorizontal={labelHorizontal}
              key={i}>
              {/*  You can set RadioButtonLabel before RadioButtonInput */}
              <RadioButtonInput
                obj={obj}
                index={i}
                isSelected={!obj.disabled && value === obj.value}
                onPress={(value: any) =>
                  !obj.disabled ? setFieldValue(name, value) : null
                }
                borderWidth={1}
                buttonInnerColor={obj.disabled ? color.dark_grey : color.black}
                buttonOuterColor={obj.disabled ? color.dark_grey : color.black}
                buttonSize={normalize(20)}
                buttonOuterSize={normalize(25)}
                buttonStyle={{}}
                buttonWrapStyle={{}}
              />
              <RadioButtonLabel
                obj={obj}
                index={i}
                labelHorizontal={labelHorizontal}
                onPress={(value: any) =>
                  !obj.disabled ? setFieldValue(name, value) : null
                }
                labelStyle={{
                  fontSize: fontSize.regular_medium,
                  color: obj.disabled ? color.dark_grey : color.black,
                  fontFamily: fontFamily.roboto,
                }}
                labelWrapStyle={{
                  paddingBottom: normalize(20),
                  width: formHorizontal ? undefined : '93%',
                }}
              />
            </RadioButton>
          );
        })}
      </RadioForm>
    </View>
  );
};

RatsRadioButtonGroup.defaultProps = {
  flexDirection: 'row',
  disabled: false,
  labelDisabled: false,
};

export default withRats(RatsRadioButtonGroup);
