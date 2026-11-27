import { createSlice, PayloadAction } from '@reduxjs/toolkit';
import { House } from '../../entities/House';
import { Houses } from '../../types';
import { isLogoutFulfilled } from './accountReset';

interface HousesState {
  houses: Houses;
  selectedHouse: House | null;
  selectedHouseId: string | null;
  searchedHouses: House[];
  loading: boolean;
  error: any;
}

const initialState: HousesState = {
  houses: {},
  selectedHouse: null,
  selectedHouseId: null,
  searchedHouses: [],
  loading: false,
  error: null,
};

// Slice
const housesSlice = createSlice({
  name: 'houses',
  initialState,
  reducers: {
    selectHouse: (state, action: PayloadAction<House>) => {
      state.selectedHouse = action.payload;
    },
    selectHouseById: (state, action: PayloadAction<string | null>) => {
      state.selectedHouseId = action.payload;
    },
    clearHouseError: state => {
      state.error = null;
    },
    resetSearchResults: state => {
      state.searchedHouses = [];
    },
  },
  // The next account on this phone starts with nothing selected; DataContext
  // selects its house only while none is.
  extraReducers: builder => {
    builder.addMatcher(isLogoutFulfilled, () => initialState);
  },
});

export const {
  selectHouse,
  selectHouseById,
  clearHouseError,
  resetSearchResults,
} = housesSlice.actions;

export default housesSlice.reducer;
