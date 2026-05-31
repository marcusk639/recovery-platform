import { createSlice, PayloadAction } from '@reduxjs/toolkit';

interface NavigationState {
  currentTitle: string;
  modalShowing: boolean;
}

const initialState: NavigationState = {
  currentTitle: '',
  modalShowing: false,
};

const navigationSlice = createSlice({
  name: 'navigation',
  initialState,
  reducers: {
    setTitle: (state, action: PayloadAction<string>) => {
      state.currentTitle = action.payload;
    },
    setModalShowing: (state, action: PayloadAction<boolean>) => {
      state.modalShowing = action.payload;
    },
  },
});

export const { setTitle, setModalShowing } = navigationSlice.actions;

export default navigationSlice.reducer;
