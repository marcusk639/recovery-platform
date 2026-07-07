/**
 * Tests for RatsImage component
 */

import React from "react";
import { render } from "@testing-library/react-native";
import { Image } from "react-native";

// Mock the normalize utility so styles can resolve
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

import RatsImage from "../rats-image";

describe("RatsImage", () => {
  it("renders without crashing", () => {
    const { toJSON } = render(
      <RatsImage source={{ uri: "https://example.com/img.jpg" }} />
    );
    expect(toJSON()).toBeTruthy();
  });

  it("renders an Image element", () => {
    const { UNSAFE_getByType } = render(
      <RatsImage source={{ uri: "https://example.com/img.jpg" }} />
    );
    expect(UNSAFE_getByType(Image)).toBeTruthy();
  });

  it("passes the source prop to the Image", () => {
    const source = { uri: "https://example.com/photo.jpg" };
    const { UNSAFE_getByType } = render(<RatsImage source={source} />);
    const image = UNSAFE_getByType(Image);
    expect(image.props.source).toEqual(source);
  });

  it("uses a require source (static asset)", () => {
    const source = 1 as any; // require() returns a number in test environment
    const { UNSAFE_getByType } = render(<RatsImage source={source} />);
    expect(UNSAFE_getByType(Image).props.source).toBe(source);
  });

  it("accepts additional ImageProps like resizeMode", () => {
    const { UNSAFE_getByType } = render(
      <RatsImage source={{ uri: "https://x.com/a.jpg" }} resizeMode="contain" />
    );
    expect(UNSAFE_getByType(Image).props.resizeMode).toBe("contain");
  });

  it("accepts resizeMethod prop", () => {
    const { UNSAFE_getByType } = render(
      <RatsImage
        source={{ uri: "https://x.com/a.jpg" }}
        resizeMethod="resize"
      />
    );
    expect(UNSAFE_getByType(Image).props.resizeMethod).toBe("resize");
  });

  it("renders with a custom style prop without crashing", () => {
    const { toJSON } = render(
      <RatsImage
        source={{ uri: "https://example.com/img.jpg" }}
        style={{ height: 100, width: 100 }}
      />
    );
    expect(toJSON()).toBeTruthy();
  });

  // Regression coverage for 2026-07-05: style={imageStyles || props.style}
  // always evaluated to imageStyles (a plain object literal, always truthy),
  // discarding every caller-supplied custom style.
  it("applies the caller-supplied custom style instead of the default imageStyles", () => {
    const customStyle = {
      height: 100,
      width: 100,
      position: "absolute" as const,
    };
    const { UNSAFE_getByType } = render(
      <RatsImage
        source={{ uri: "https://example.com/img.jpg" }}
        style={customStyle}
      />
    );
    expect(UNSAFE_getByType(Image).props.style).toEqual(customStyle);
  });

  it("renders with an empty source object without crashing", () => {
    const { toJSON } = render(<RatsImage source={{}} />);
    expect(toJSON()).toBeTruthy();
  });

  it("renders default styles (height and width come from imageStyles)", () => {
    const { UNSAFE_getByType } = render(
      <RatsImage source={{ uri: "https://example.com/img.jpg" }} />
    );
    const image = UNSAFE_getByType(Image);
    // imageStyles is applied as the style (height:45, width:45, marginRight:15 with normalize mock)
    const style = image.props.style;
    expect(style).toEqual({ height: 45, width: 45, marginRight: 15 });
  });

  it("forwards testID prop", () => {
    const { getByTestId } = render(
      <RatsImage source={{ uri: "https://x.com/a.jpg" }} testID="my-image" />
    );
    expect(getByTestId("my-image")).toBeTruthy();
  });

  it("passes accessibilityLabel prop through to Image", () => {
    const { UNSAFE_getByType } = render(
      <RatsImage
        source={{ uri: "https://x.com/a.jpg" }}
        accessibilityLabel="profile photo"
      />
    );
    expect(UNSAFE_getByType(Image).props.accessibilityLabel).toBe(
      "profile photo"
    );
  });
});
