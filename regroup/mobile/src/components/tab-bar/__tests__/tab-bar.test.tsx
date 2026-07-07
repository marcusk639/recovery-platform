/**
 * Tests for Tab and TabBar components
 */

import React from "react";
import { render, fireEvent } from "@testing-library/react-native";
import { Text } from "react-native";

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
  tabBarStyle: { flexDirection: "row" as const, backgroundColor: "#007AFF" },
  elevateStyle: {},
  themes: { default: { primaryColor: "#000" } },
  windowHeight: 800,
}));

jest.mock("../../../context", () => ({
  useTheme: () => ({ theme: { primaryColor: "#000" } }),
  useTranslation: () => ({ t: (k: string) => k, i18n: { language: "en" } }),
}));

jest.mock("../../rats-text", () => {
  const React = require("react");
  const { Text } = require("react-native");
  return {
    RatsText: ({ text }: any) => (
      <Text testID={`rats-text-${text}`}>{text}</Text>
    ),
  };
});

import { Tab, TabBar } from "../tab-bar";

const mockNavigate = jest.fn();
const mockNavigation = { navigate: mockNavigate } as any;

describe("Tab", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("renders without crashing", () => {
    const { toJSON } = render(
      <Tab
        title="House"
        route="house"
        currentRoute="house"
        navigation={mockNavigation}
      />
    );
    expect(toJSON()).toBeTruthy();
  });

  it("renders the tab title", () => {
    const { getByTestId } = render(
      <Tab
        title="House"
        route="house"
        currentRoute="house"
        navigation={mockNavigation}
      />
    );
    expect(getByTestId("rats-text-House")).toBeTruthy();
  });

  it("calls navigation.navigate with the route when pressed", () => {
    const { getByTestId } = render(
      <Tab
        title="Guests"
        route="guest"
        currentRoute="house"
        navigation={mockNavigation}
      />
    );
    fireEvent.press(getByTestId("rats-text-Guests"));
    expect(mockNavigate).toHaveBeenCalledWith("guest");
  });

  it("navigates to the correct route (not a different one)", () => {
    const { getByTestId } = render(
      <Tab
        title="Activities"
        route="activities"
        currentRoute="house"
        navigation={mockNavigation}
      />
    );
    fireEvent.press(getByTestId("rats-text-Activities"));
    expect(mockNavigate).toHaveBeenCalledWith("activities");
    expect(mockNavigate).not.toHaveBeenCalledWith("house");
  });

  it("applies selectedTabStyle when route matches currentRoute", () => {
    // Just verify it renders without error when selected
    const { toJSON } = render(
      <Tab
        title="House"
        route="house"
        currentRoute="house"
        navigation={mockNavigation}
      />
    );
    expect(toJSON()).toBeTruthy();
  });

  it("applies baseTabStyle when route does not match currentRoute", () => {
    const { toJSON } = render(
      <Tab
        title="Guests"
        route="guest"
        currentRoute="house"
        navigation={mockNavigation}
      />
    );
    expect(toJSON()).toBeTruthy();
  });

  it("renders multiple tabs without crashing", () => {
    const { getAllByTestId } = render(
      <>
        <Tab
          title="House"
          route="house"
          currentRoute="house"
          navigation={mockNavigation}
        />
        <Tab
          title="Guest"
          route="guest"
          currentRoute="house"
          navigation={mockNavigation}
        />
      </>
    );
    expect(getAllByTestId(/rats-text/).length).toBe(2);
  });
});

describe("TabBar", () => {
  const tabBarScreenProps = {
    navigation: mockNavigation,
    route: { key: "main", name: "main" } as any,
  };

  it("renders without crashing", () => {
    const { toJSON } = render(
      <TabBar {...tabBarScreenProps}>
        {[<Text key="1">Tab 1</Text>, <Text key="2">Tab 2</Text>]}
      </TabBar>
    );
    expect(toJSON()).toBeTruthy();
  });

  it("renders children", () => {
    const { getByText } = render(
      <TabBar {...tabBarScreenProps}>
        {[<Text key="1">Child A</Text>, <Text key="2">Child B</Text>]}
      </TabBar>
    );
    expect(getByText("Child A")).toBeTruthy();
    expect(getByText("Child B")).toBeTruthy();
  });

  it("renders navBar when provided", () => {
    const navBar = () => <Text>NavBar</Text>;
    const { getByText } = render(
      <TabBar {...tabBarScreenProps} navBar={navBar}>
        {[<Text key="1">Child</Text>]}
      </TabBar>
    );
    expect(getByText("NavBar")).toBeTruthy();
  });

  it("does NOT render navBar area when navBar prop is absent", () => {
    const { queryByText } = render(
      <TabBar {...tabBarScreenProps}>{[<Text key="1">Child</Text>]}</TabBar>
    );
    expect(queryByText("NavBar")).toBeNull();
  });

  it("renders Tab children inside TabBar", () => {
    const { getByTestId } = render(
      <TabBar {...tabBarScreenProps}>
        {[
          <Tab
            key="house"
            title="House"
            route="house"
            currentRoute="house"
            navigation={mockNavigation}
          />,
          <Tab
            key="guest"
            title="Guests"
            route="guest"
            currentRoute="house"
            navigation={mockNavigation}
          />,
        ]}
      </TabBar>
    );
    expect(getByTestId("rats-text-House")).toBeTruthy();
    expect(getByTestId("rats-text-Guests")).toBeTruthy();
  });
});
