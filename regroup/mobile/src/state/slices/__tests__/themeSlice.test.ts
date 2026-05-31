/**
 * Theme Slice Tests
 *
 * Tests for Redux Toolkit theme state management
 */

// ── Mocks ─────────────────────────────────────────────────────────────────────

// react-native-size-matters is used by the theme module and requires native modules
jest.mock('react-native-size-matters', () => ({
  moderateScale: jest.fn((size: number) => size),
}));

// @callstack/react-theme-provider requires native context; mock it out
jest.mock('@callstack/react-theme-provider', () => ({
  createTheming: jest.fn(() => ({
    ThemeProvider: ({ children }: { children: any }) => children,
    withTheme: (component: any) => component,
    useTheme: jest.fn(),
  })),
}));

// ── Imports ────────────────────────────────────────────────────────────────────

import themeReducer, { setTheme } from '../themeSlice';
import { RatsTheme, themes } from '../../../styles/theme';

// ── Test Suite ─────────────────────────────────────────────────────────────────

describe('themeSlice', () => {
  const defaultTheme: RatsTheme = themes.default;

  const initialState = {
    theme: defaultTheme,
  };

  const alternateTheme: RatsTheme = {
    primaryColor: '#ff0000',
    secondaryColor: '#00ff00',
    tertiaryColor: '#0000ff',
    backgroundColor: '#ffffff',
    textColor: '#000000',
    primaryFontFamily: 'Helvetica',
    secondaryFontFamily: 'Arial',
    logoTintColor: '#cccccc',
  };

  // ── Initial State ────────────────────────────────────────────────────────────

  describe('Initial State', () => {
    it('should return the default theme on unknown action', () => {
      const state = themeReducer(undefined, { type: 'unknown' });
      expect(state.theme).toEqual(defaultTheme);
    });

    it('should have the default theme set to the exported themes.default value', () => {
      const state = themeReducer(undefined, { type: 'unknown' });
      expect(state.theme).toBe(defaultTheme);
    });
  });

  // ── setTheme ─────────────────────────────────────────────────────────────────

  describe('setTheme', () => {
    it('should replace the current theme with a new theme', () => {
      const state = themeReducer(initialState, setTheme(alternateTheme));
      expect(state.theme).toEqual(alternateTheme);
    });

    it('should set all RatsTheme fields correctly', () => {
      const state = themeReducer(initialState, setTheme(alternateTheme));
      expect(state.theme.primaryColor).toBe('#ff0000');
      expect(state.theme.secondaryColor).toBe('#00ff00');
      expect(state.theme.tertiaryColor).toBe('#0000ff');
      expect(state.theme.backgroundColor).toBe('#ffffff');
      expect(state.theme.textColor).toBe('#000000');
      expect(state.theme.primaryFontFamily).toBe('Helvetica');
      expect(state.theme.secondaryFontFamily).toBe('Arial');
      expect(state.theme.logoTintColor).toBe('#cccccc');
    });

    it('should allow switching back to the default theme', () => {
      const stateWithAlternate = {
        theme: alternateTheme,
      };
      const state = themeReducer(stateWithAlternate, setTheme(defaultTheme));
      expect(state.theme).toEqual(defaultTheme);
    });

    it('should be idempotent when setting the same theme', () => {
      const state = themeReducer(initialState, setTheme(defaultTheme));
      expect(state.theme).toEqual(defaultTheme);
    });

    it('should allow setting a partial-override theme', () => {
      const partialOverride: RatsTheme = {
        ...defaultTheme,
        primaryColor: '#123456',
      };
      const state = themeReducer(initialState, setTheme(partialOverride));
      expect(state.theme.primaryColor).toBe('#123456');
      // Other fields should carry over from defaultTheme
      expect(state.theme.textColor).toBe(defaultTheme.textColor);
    });
  });

  // ── State Immutability ─────────────────────────────────────────────────────────

  describe('State Immutability', () => {
    it('should not mutate the original state when changing theme', () => {
      const state = themeReducer(initialState, setTheme(alternateTheme));
      expect(state).not.toBe(initialState);
      expect(initialState.theme).toBe(defaultTheme);
    });
  });
});
