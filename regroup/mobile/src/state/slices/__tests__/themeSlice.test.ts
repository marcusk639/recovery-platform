/**
 * Theme Slice Tests
 *
 * Tests for Redux Toolkit theme state management
 */

// ── Mocks ─────────────────────────────────────────────────────────────────────

// react-native-size-matters is used by the theme module and requires native modules
jest.mock("react-native-size-matters", () => ({
  moderateScale: jest.fn((size: number) => size),
}));

// @callstack/react-theme-provider requires native context; mock it out
jest.mock("@callstack/react-theme-provider", () => ({
  createTheming: jest.fn(() => ({
    ThemeProvider: ({ children }: { children: any }) => children,
    withTheme: (component: any) => component,
    useTheme: jest.fn(),
  })),
}));

// ── Imports ────────────────────────────────────────────────────────────────────

import themeReducer from "../themeSlice";
import { RatsTheme, themes } from "../../../styles/theme";

// ── Test Suite ─────────────────────────────────────────────────────────────────

describe("themeSlice", () => {
  const defaultTheme: RatsTheme = themes.default;

  const initialState = {
    theme: defaultTheme,
  };

  // ── Initial State ────────────────────────────────────────────────────────────

  describe("Initial State", () => {
    it("should return the default theme on unknown action", () => {
      const state = themeReducer(undefined, { type: "unknown" });
      expect(state.theme).toEqual(defaultTheme);
    });

    it("should have the default theme set to the exported themes.default value", () => {
      const state = themeReducer(undefined, { type: "unknown" });
      expect(state.theme).toBe(defaultTheme);
    });
  });
});
