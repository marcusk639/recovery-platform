import React from "react";
import { Pressable, View } from "react-native";
import Icon from "@react-native-vector-icons/material-icons/static";
import styles from "./styles";
import RatsLabel from "../rats-label/rats-label";
import { camelCaseToDisplayForm } from "../../util/display";
import { color, normalize } from "../../styles/theme";
import { useTheme } from "../../context";

interface Props {
  placeholder: string;
  style: any;
  field: {
    name: string;
    value: any;
    onChange: (name: string) => any;
    onBlur: () => any;
  };
  form: {
    errors: any;
    touched: any;
    setFieldValue?: (name: string, value: any) => any;
  };
  disabled: boolean;
  labelDisabled: boolean;
  label: string;
  viewStyle: any;
  onValueChange: (value: any) => any;
  suppressErrors: boolean;
  checkboxStyle?: any;
  labelStyle?: any;
  testID?: string;
}

/** The Material checkbox glyph's size, matching the native Android box (24dp touch, 18dp box). */
const BOX_SIZE = normalize(24);

/**
 * Standard checkbox field, in JS (React Native 0.88 upgrade, Task 8). It replaces
 * @react-native-community/checkbox, whose New Architecture build no longer compiles, with a
 * Pressable and the Material check-box glyphs, keeping the props and testIDs.
 *
 * Inside a Formik Field the tap sets the field through form.setFieldValue. The native checkbox
 * handed Formik's field.onChange(name) a bare boolean, which Formik reads as an event and threw
 * on, so the value never changed (owner decision: fixed here; decision record, section 4).
 * `disabled` is honoured; the native version ignored it.
 */
const RatsCheckBox = (props: Props) => {
  const {
    field: { name = "", value = "", onChange } = {
      name: "",
      value: "",
      onChange: null,
      onBlur: null,
    },
    form: { errors = {}, touched = {}, setFieldValue } = { errors: {}, touched: {} },
    disabled = false,
    labelDisabled = false,
    label = "Default Label",
    viewStyle = {},
    checkboxStyle = {},
    labelStyle = {},
    onValueChange = () => {},
    suppressErrors = false,
    testID,
  } = props;
  const { theme } = useTheme();
  const checked = !!value;

  const toggle = () => {
    const next = !checked;
    if (onChange && setFieldValue) {
      setFieldValue(name, next);
      return;
    }
    onValueChange(next);
  };

  return (
    <View style={[styles.view, viewStyle]}>
      <Pressable
        testID={testID}
        accessibilityRole="checkbox"
        accessibilityState={{ checked, disabled }}
        disabled={disabled}
        hitSlop={normalize(8)}
        onPress={toggle}
        style={[styles.checkbox, checkboxStyle]}
      >
        <Icon
          name={checked ? "check-box" : "check-box-outline-blank"}
          size={BOX_SIZE}
          color={disabled ? color.medium_grey : checked ? theme.primaryColor : color.dark_grey}
        />
      </Pressable>
      {!labelDisabled && (
        <RatsLabel
          style={[{ marginTop: normalize(2) }, labelStyle]}
          label={label || camelCaseToDisplayForm(name)}
        />
      )}
      {!suppressErrors && errors[name] && touched[name] && (
        <RatsLabel style={{ marginTop: normalize(2) }} label={errors[name]} />
      )}
    </View>
  );
};

export default RatsCheckBox;
