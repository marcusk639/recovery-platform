/**
 * Tests for RatsNumericInput component
 */

import React from "react";
import { render, fireEvent } from "@testing-library/react-native";

// ── mocks ─────────────────────────────────────────────────────────────────────

jest.mock("../../../styles/theme", () => ({
  normalize: (n: number) => n,
  color: {
    light_grey: "#eee",
    baby_blue: "#89cff0",
    black: "#000",
    white: "#fff",
    grey: "#aaa",
    dark_grey: "#555",
    red: "#f00",
    green: "#0f0",
    medium_grey: "#999",
  },
  fontSize: {
    regular: 14,
    regular_medium: 16,
    medium: 15,
    large: 18,
    small: 12,
    larger: 22,
    extraLarge: 24,
  },
  fontFamily: {
    roboto: "Roboto",
    bold: "Roboto-Bold",
    timesNewRoman: "TimesNewRoman",
  },
  ROW: { flexDirection: "row" as const },
  CARD_STYLE: {},
  tabBarStyle: {},
  elevateStyle: {},
  themes: { default: { primaryColor: "#000" } },
  windowHeight: 800,
}));

jest.mock("../../../context", () => ({
  useTheme: () => ({ theme: { primaryColor: "#000" } }),
  useTranslation: () => ({ t: (k: string) => k, i18n: { language: "en" } }),
}));

jest.mock("../../../util/platform", () => ({ IOS: false }));

jest.mock("react-native-vector-icons/FontAwesome5", () => {
  const React = require("react");
  const { View } = require("react-native");
  return (props: any) => <View testID={`fa5-${props.name}`} />;
});

jest.mock("../../rats-label/rats-label", () => {
  const React = require("react");
  const { Text } = require("react-native");
  return ({ label }: any) => <Text>{label}</Text>;
});

jest.mock("../../rats-icon/rats-icon", () => {
  const React = require("react");
  const { View } = require("react-native");
  return {
    RatsIcon: ({ name }: any) => <View testID={`icon-${name}`} />,
  };
});

// Stub rats-text-input styles
jest.mock("../../rats-text-input/styles", () => ({
  primary: {
    inputView: {},
    input: {},
    error: {},
  },
  secondary: {
    inputView: {},
    input: {},
    error: {},
  },
}));

import RatsNumericInput from "../index";

const buildProps = (overrides: any = {}) => ({
  field: { name: "count", value: 5 },
  form: { setFieldValue: jest.fn(), errors: {}, touched: {} },
  label: "Count",
  disabled: false,
  labelDisabled: false,
  styleType: "secondary" as const,
  style: {},
  ...overrides,
});

describe("RatsNumericInput", () => {
  it("renders without crashing", () => {
    const { toJSON } = render(<RatsNumericInput {...buildProps()} />);
    expect(toJSON()).toBeTruthy();
  });

  it("renders the label", () => {
    const { getByText } = render(
      <RatsNumericInput {...buildProps({ label: "Guests" })} />
    );
    expect(getByText("Guests")).toBeTruthy();
  });

  it("does not render the label when labelDisabled is true", () => {
    const { queryByText } = render(
      <RatsNumericInput
        {...buildProps({ labelDisabled: true, label: "Hidden" })}
      />
    );
    expect(queryByText("Hidden")).toBeNull();
  });

  it("renders the current value in the TextInput", () => {
    const { getByDisplayValue } = render(
      <RatsNumericInput
        {...buildProps({ field: { name: "count", value: 7 } })}
      />
    );
    expect(getByDisplayValue("7")).toBeTruthy();
  });

  it("renders value of 0 correctly", () => {
    const { getByDisplayValue } = render(
      <RatsNumericInput
        {...buildProps({ field: { name: "count", value: 0 } })}
      />
    );
    expect(getByDisplayValue("0")).toBeTruthy();
  });

  it("renders arrow-down and arrow-up icons", () => {
    const { getByTestId } = render(<RatsNumericInput {...buildProps()} />);
    expect(getByTestId("icon-arrow-down")).toBeTruthy();
    expect(getByTestId("icon-arrow-up")).toBeTruthy();
  });

  it("calls setFieldValue when text changes", () => {
    const setFieldValue = jest.fn();
    const { getByDisplayValue } = render(
      <RatsNumericInput
        {...buildProps({
          form: { setFieldValue, errors: {}, touched: {} },
          field: { name: "count", value: 3 },
        })}
      />
    );
    fireEvent.changeText(getByDisplayValue("3"), "10");
    expect(setFieldValue).toHaveBeenCalledWith("count", 10);
  });

  it("increments value when up-arrow is pressed", () => {
    const setFieldValue = jest.fn();
    const props = buildProps({
      form: { setFieldValue, errors: {}, touched: {} },
      field: { name: "count", value: 5 },
      maximumValue: 100,
    });
    const { getByTestId } = render(<RatsNumericInput {...props} />);
    fireEvent.press(getByTestId("icon-arrow-up").parent!);
    expect(setFieldValue).toHaveBeenCalledWith("count", 6);
  });

  it("decrements value when down-arrow is pressed", () => {
    const setFieldValue = jest.fn();
    const props = buildProps({
      form: { setFieldValue, errors: {}, touched: {} },
      field: { name: "count", value: 5 },
      minimumValue: 0,
    });
    const { getByTestId } = render(<RatsNumericInput {...props} />);
    fireEvent.press(getByTestId("icon-arrow-down").parent!);
    expect(setFieldValue).toHaveBeenCalledWith("count", 4);
  });

  it("does not go below minimumValue", () => {
    const setFieldValue = jest.fn();
    const props = buildProps({
      form: { setFieldValue, errors: {}, touched: {} },
      field: { name: "count", value: 0 },
      minimumValue: 0,
    });
    const { getByTestId } = render(<RatsNumericInput {...props} />);
    fireEvent.press(getByTestId("icon-arrow-down").parent!);
    expect(setFieldValue).toHaveBeenCalledWith("count", 0);
  });

  it("does not go above maximumValue", () => {
    const setFieldValue = jest.fn();
    const props = buildProps({
      form: { setFieldValue, errors: {}, touched: {} },
      field: { name: "count", value: 10 },
      maximumValue: 10,
    });
    const { getByTestId } = render(<RatsNumericInput {...props} />);
    fireEvent.press(getByTestId("icon-arrow-up").parent!);
    expect(setFieldValue).toHaveBeenCalledWith("count", 10);
  });

  it("shows validation error when errors[name] and touched[name] are set", () => {
    const props = buildProps({
      form: {
        setFieldValue: jest.fn(),
        errors: { count: "Required field" },
        touched: { count: true },
      },
    });
    const { getByText } = render(<RatsNumericInput {...props} />);
    expect(getByText("Required field")).toBeTruthy();
  });

  it("does not show error when field is not touched", () => {
    const props = buildProps({
      form: {
        setFieldValue: jest.fn(),
        errors: { count: "Required field" },
        touched: { count: false },
      },
    });
    const { queryByText } = render(<RatsNumericInput {...props} />);
    expect(queryByText("Required field")).toBeNull();
  });

  // Regression coverage for 2026-07-06: customHandleChange was added so
  // this component can be used outside a Formik context (the non-anonymous
  // guest modals — GuestSupporterSummary, GuestWorkSummary — pass field:
  // {name, value} with no form at all). Only the Formik-mode path had
  // coverage until now.
  describe("customHandleChange (non-Formik mode)", () => {
    it("calls customHandleChange instead of setFieldValue when text changes", () => {
      const customHandleChange = jest.fn();
      const setFieldValue = jest.fn();
      const { getByDisplayValue } = render(
        <RatsNumericInput
          {...buildProps({
            field: { name: "hours", value: 3 },
            form: undefined,
            customHandleChange,
          })}
        />
      );
      fireEvent.changeText(getByDisplayValue("3"), "10");
      expect(customHandleChange).toHaveBeenCalledWith(10);
      expect(setFieldValue).not.toHaveBeenCalled();
    });

    it("calls customHandleChange on up-arrow press", () => {
      const customHandleChange = jest.fn();
      const { getByTestId } = render(
        <RatsNumericInput
          {...buildProps({
            field: { name: "hours", value: 5 },
            form: undefined,
            customHandleChange,
            maximumValue: 100,
          })}
        />
      );
      fireEvent.press(getByTestId("icon-arrow-up").parent!);
      expect(customHandleChange).toHaveBeenCalledWith(6);
    });

    it("calls customHandleChange on down-arrow press", () => {
      const customHandleChange = jest.fn();
      const { getByTestId } = render(
        <RatsNumericInput
          {...buildProps({
            field: { name: "hours", value: 5 },
            form: undefined,
            customHandleChange,
            minimumValue: 0,
          })}
        />
      );
      fireEvent.press(getByTestId("icon-arrow-down").parent!);
      expect(customHandleChange).toHaveBeenCalledWith(4);
    });

    it("works with no form prop at all (field-only, matching the real non-Formik call sites)", () => {
      const customHandleChange = jest.fn();
      const { getByDisplayValue } = render(
        <RatsNumericInput
          label="Hours"
          field={{ name: "hours", value: 2 }}
          customHandleChange={customHandleChange}
        />
      );
      fireEvent.changeText(getByDisplayValue("2"), "4");
      expect(customHandleChange).toHaveBeenCalledWith(4);
    });
  });
});
