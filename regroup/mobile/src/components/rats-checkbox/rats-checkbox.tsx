import React from "react";
import { View } from "react-native";
import CheckBox from "@react-native-community/checkbox";
import styles from "./styles";
import RatsLabel from "../rats-label/rats-label";
import { camelCaseToDisplayForm } from "../../util/display";
import { normalize } from "../../styles/theme";

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

/**
 * Standard checkbox field
 */
const RatsCheckBox = (props: Props) => {
  const {
    field: { name = "", value = "", onChange } = {
      name: "",
      value: "",
      onChange: null,
      onBlur: null,
    },
    form: { errors = {}, touched = {} } = { errors: {}, touched: {} },
    labelDisabled = false,
    label = "Default Label",
    viewStyle = {},
    checkboxStyle = {},
    labelStyle = {},
    onValueChange = () => {},
    suppressErrors = false,
    testID,
  } = props;
  return (
    <View style={[styles.view, viewStyle]}>
      <CheckBox
        testID={testID}
        style={[styles.checkbox, checkboxStyle]}
        value={value}
        onValueChange={onChange ? onChange(name) : onValueChange}
      />
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
