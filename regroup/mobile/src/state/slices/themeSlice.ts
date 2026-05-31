import { createSlice, PayloadAction } from '@reduxjs/toolkit';
import { RatsTheme, themes } from '../../styles/theme';

/**
 * Theme Slice - UI theme preference
 *
 * Manages the current theme selection for the app
 */

interface ThemeState {
  theme: RatsTheme;
}

const initialState: ThemeState = {
  theme: themes.default,
};

const themeSlice = createSlice({
  name: 'theme',
  initialState,
  reducers: {
    setTheme: (state, action: PayloadAction<RatsTheme>) => {
      state.theme = action.payload;
    },
  },
});

export const { setTheme } = themeSlice.actions;

export default themeSlice.reducer;
