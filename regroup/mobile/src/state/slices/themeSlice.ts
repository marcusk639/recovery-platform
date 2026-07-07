import { createSlice } from "@reduxjs/toolkit";
import { RatsTheme, themes } from "../../styles/theme";

/**
 * Theme Slice - UI theme preference
 *
 * Manages the current theme selection for the app. Read-only today — the
 * `theme` field is populated once from `themes.default` and read via
 * `appSelectors.ts`; there's no user-facing theme switcher, so no action
 * ever changes it (the previous `setTheme` action had zero dispatch sites
 * anywhere in the app and was removed 2026-07-06).
 */

interface ThemeState {
  theme: RatsTheme;
}

const initialState: ThemeState = {
  theme: themes.default,
};

const themeSlice = createSlice({
  name: "theme",
  initialState,
  reducers: {},
});

export default themeSlice.reducer;
