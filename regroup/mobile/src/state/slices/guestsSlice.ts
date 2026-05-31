import { createSlice, PayloadAction } from '@reduxjs/toolkit';
import { Guest } from '../../entities/Guest';

type AsyncStatus = 'idle' | 'loading' | 'succeeded' | 'failed';

interface GuestsState {
  guests: { [id: string]: Guest };
  selectedGuest: Guest | null;
  selectedGuestId: string | null;
  userAsGuest: Guest | null;
  status: AsyncStatus;
  error: string | null;
  // Per-operation status
  updateStatus: AsyncStatus;
  createStatus: AsyncStatus;
  deleteStatus: AsyncStatus;
  customizePhaseStatus: AsyncStatus;
}

const initialState: GuestsState = {
  guests: {},
  selectedGuest: null,
  selectedGuestId: null,
  userAsGuest: null,
  status: 'idle',
  error: null,
  updateStatus: 'idle',
  createStatus: 'idle',
  deleteStatus: 'idle',
  customizePhaseStatus: 'idle',
};

// Slice
const guestsSlice = createSlice({
  name: 'guests',
  initialState,
  reducers: {
    selectGuest: (
      state,
      action: PayloadAction<{
        guestId: string;
        guests: { [id: string]: Guest } | null;
      }>,
    ) => {
      const { guestId, guests } = action.payload;
      const guestsSource = guests || state.guests;
      state.selectedGuest = guestsSource[guestId] || null;
    },
    updateSelectedGuest: (state, action: PayloadAction<Guest>) => {
      state.selectedGuest = action.payload;
      if (action.payload) {
        state.guests[action.payload.id] = action.payload;
      }
    },
    cacheGuests: (state, action: PayloadAction<{ [id: string]: Guest }>) => {
      state.guests = { ...state.guests, ...action.payload };
    },
    cacheGuest: (state, action: PayloadAction<Guest>) => {
      if (action.payload) {
        state.guests[action.payload.id] = action.payload;
      }
    },
    selectGuestById: (state, action: PayloadAction<string | null>) => {
      state.selectedGuestId = action.payload;
    },
    clearGuestError: state => {
      state.error = null;
      state.status = 'idle';
      state.updateStatus = 'idle';
      state.createStatus = 'idle';
      state.deleteStatus = 'idle';
      state.customizePhaseStatus = 'idle';
    },
  },
});

export const {
  selectGuest,
  selectGuestById,
  updateSelectedGuest,
  cacheGuests,
  cacheGuest,
  clearGuestError,
} = guestsSlice.actions;

export default guestsSlice.reducer;
