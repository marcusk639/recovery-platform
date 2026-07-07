/**
 * Tests for Weekdays component
 */

import React from "react";
import { render, fireEvent } from "@testing-library/react-native";

jest.mock("../../../styles/theme", () => ({
  normalize: (n: number) => n,
  fontSize: {
    small: 10,
    regular: 12,
    medium: 14,
    medium_large: 16,
    large: 18,
    huge: 24,
    huger: 28,
  },
  color: {
    white: "#ffffff",
    black: "#000000",
    dark_grey: "#888888",
    grey: "#cccccc",
    green: "#00ff00",
    baby_blue: "#89CFF0",
    red: "#ff0000",
  },
  fontFamily: { bold: "System-Bold", regular: "System" },
  CARD_STYLE: {},
  CARD_NO_ELEVATION: {},
  ROW: { flexDirection: "row" },
  elevateStyle: {},
  themes: {
    default: {
      primaryColor: "#89CFF0",
      secondaryColor: "#fff",
      backgroundColor: "#fff",
      textColor: "#000",
    },
  },
  useThemeHook: () => ({
    primaryColor: "#89CFF0",
    secondaryColor: "#fff",
    backgroundColor: "#fff",
    textColor: "#000",
  }),
}));

jest.mock("../../../context", () => ({
  useTheme: () => ({
    theme: {
      primaryColor: "#89CFF0",
      secondaryColor: "#fff",
      backgroundColor: "#fff",
      textColor: "#000",
    },
  }),
  useTranslation: () => ({ t: (k: string) => k, i18n: { language: "en" } }),
}));

// getDayOfWeek returns Sunday=0, Monday=1, ... Saturday=6
// We fix "today" as Wednesday (3) so tests are deterministic
jest.mock("../../../util/display", () => ({
  getDayOfWeek: jest.fn(() => 3), // Wednesday
  getTodaysDate: jest.fn(() => "2026-02-18"), // a Wednesday
}));

jest.mock("@react-native-community/datetimepicker", () => "DateTimePicker");

import { Weekdays, daysOfWeek, WeekdayWithTime } from "../index";

describe("daysOfWeek array", () => {
  it("has 7 days", () => {
    expect(daysOfWeek).toHaveLength(7);
  });

  it("starts with sunday", () => {
    expect(daysOfWeek[0]).toBe("sunday");
  });

  it("ends with saturday", () => {
    expect(daysOfWeek[6]).toBe("saturday");
  });

  it("contains all expected days", () => {
    expect(daysOfWeek).toEqual([
      "sunday",
      "monday",
      "tuesday",
      "wednesday",
      "thursday",
      "friday",
      "saturday",
    ]);
  });
});

describe("Weekdays component", () => {
  it("renders without crashing", () => {
    const { toJSON } = render(<Weekdays />);
    expect(toJSON()).toBeTruthy();
  });

  it("renders the first letter of each day", () => {
    const { getAllByText } = render(<Weekdays />);
    // Each day renders its first letter. Several days share first letters (s, t, f)
    // sunday=s, monday=m, tuesday=t, wednesday=w, thursday=t, friday=f, saturday=s
    expect(getAllByText("s").length).toBeGreaterThanOrEqual(2); // sunday + saturday
    expect(getAllByText("m").length).toBeGreaterThanOrEqual(1);
    expect(getAllByText("t").length).toBeGreaterThanOrEqual(2); // tuesday + thursday
    expect(getAllByText("w").length).toBeGreaterThanOrEqual(1);
    expect(getAllByText("f").length).toBeGreaterThanOrEqual(1);
  });

  it("renders 7 day buttons", () => {
    const { UNSAFE_getAllByType } = render(<Weekdays />);
    const { TouchableOpacity } = require("react-native");
    const buttons = UNSAFE_getAllByType(TouchableOpacity);
    expect(buttons).toHaveLength(7);
  });

  it("calls onWeekdayPress with day number when a past day is pressed", () => {
    const onWeekdayPress = jest.fn();
    const { UNSAFE_getAllByType } = render(
      <Weekdays onWeekdayPress={onWeekdayPress} />
    );
    // Monday (index 1) is a past day when today is Wednesday (3)
    const { TouchableOpacity } = require("react-native");
    const buttons = UNSAFE_getAllByType(TouchableOpacity);
    fireEvent.press(buttons[1]); // monday
    expect(onWeekdayPress).toHaveBeenCalled();
    expect(onWeekdayPress.mock.calls[0][0]).toBe(1);
  });

  it("calls onWeekdayPress with the current day number", () => {
    const onWeekdayPress = jest.fn();
    const { UNSAFE_getAllByType } = render(
      <Weekdays onWeekdayPress={onWeekdayPress} />
    );
    const { TouchableOpacity } = require("react-native");
    const buttons = UNSAFE_getAllByType(TouchableOpacity);
    fireEvent.press(buttons[3]); // wednesday = today
    expect(onWeekdayPress).toHaveBeenCalled();
    expect(onWeekdayPress.mock.calls[0][0]).toBe(3);
  });

  it("shows description text by default", () => {
    const { getByText } = render(<Weekdays />);
    // The description text key is 'house.overview.weekdays.description' (mocked t() returns the key)
    expect(getByText("house.overview.weekdays.description")).toBeTruthy();
  });

  it("hides description text when displayDaysToGo is false", () => {
    const { queryByText } = render(<Weekdays displayDaysToGo={false} />);
    expect(queryByText("house.overview.weekdays.description")).toBeNull();
  });

  it("renders without crash when alwaysEnabled is true", () => {
    const { toJSON } = render(<Weekdays alwaysEnabled={true} />);
    expect(toJSON()).toBeTruthy();
  });

  it("renders with custom containerStyle", () => {
    const { toJSON } = render(<Weekdays containerStyle={{ margin: 10 }} />);
    expect(toJSON()).toBeTruthy();
  });

  it("renders with weekBackgroundColor", () => {
    const { toJSON } = render(<Weekdays weekBackgroundColor="#ff0000" />);
    expect(toJSON()).toBeTruthy();
  });
});

// Regression coverage for 2026-07-05: this component used to embed a
// commented-out DateTimePicker plus an unused onChange prop. Verified both
// real callers (PhaseConfigForm.tsx, NewMeeting.tsx) only ever use this as a
// read-only "day: time" display chip — the actual time-picking UI lives
// entirely elsewhere in both cases — so the dead code was removed rather
// than wired up. This suite confirms the chip still renders its day/time
// text correctly without the removed props.
describe("WeekdayWithTime component", () => {
  it("renders the day and time text", () => {
    const { getByText } = render(
      <WeekdayWithTime day="Monday" time="6:00 PM" />
    );
    expect(getByText("Monday")).toBeTruthy();
    expect(getByText("6:00 PM")).toBeTruthy();
  });

  it("renders without crashing when no time has been set yet", () => {
    const { toJSON } = render(<WeekdayWithTime day="Tuesday" time="" />);
    expect(toJSON()).toBeTruthy();
  });
});
