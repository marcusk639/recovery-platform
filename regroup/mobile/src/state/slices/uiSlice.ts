import { createSlice, PayloadAction } from '@reduxjs/toolkit';

/**
 * UI Slice - Pure UI state (modals, loading, toasts)
 *
 * This slice manages transient UI state that doesn't come from the server:
 * - Modal visibility
 * - Global loading indicators
 * - Toast notifications
 */

interface UIState {
  modals: {
    activityForm: boolean;
    disputeModal: boolean;
    filterModal: boolean;
    guestForm: boolean;
    houseForm: boolean;
    meetingForm: boolean;
    [key: string]: boolean;
  };
  loading: {
    global: boolean;
    action: string | null;
  };
  toast: {
    message: string | null;
    type: 'success' | 'error' | 'info' | 'warning' | null;
    duration?: number;
  };
}

const initialState: UIState = {
  modals: {
    activityForm: false,
    disputeModal: false,
    filterModal: false,
    guestForm: false,
    houseForm: false,
    meetingForm: false,
  },
  loading: {
    global: false,
    action: null,
  },
  toast: {
    message: null,
    type: null,
    duration: 3000,
  },
};

const uiSlice = createSlice({
  name: 'ui',
  initialState,
  reducers: {
    // Modal actions
    showModal: (state, action: PayloadAction<string>) => {
      state.modals[action.payload] = true;
    },
    hideModal: (state, action: PayloadAction<string>) => {
      state.modals[action.payload] = false;
    },
    hideAllModals: (state) => {
      Object.keys(state.modals).forEach((key) => {
        state.modals[key] = false;
      });
    },

    // Loading actions
    setLoading: (
      state,
      action: PayloadAction<{ global: boolean; action?: string }>,
    ) => {
      state.loading.global = action.payload.global;
      state.loading.action = action.payload.action || null;
    },
    clearLoading: (state) => {
      state.loading.global = false;
      state.loading.action = null;
    },

    // Toast actions
    showToast: (
      state,
      action: PayloadAction<{
        message: string;
        type: 'success' | 'error' | 'info' | 'warning';
        duration?: number;
      }>,
    ) => {
      state.toast = {
        message: action.payload.message,
        type: action.payload.type,
        duration: action.payload.duration || 3000,
      };
    },
    hideToast: (state) => {
      state.toast = {
        message: null,
        type: null,
        duration: 3000,
      };
    },
  },
});

export const {
  showModal,
  hideModal,
  hideAllModals,
  setLoading,
  clearLoading,
  showToast,
  hideToast,
} = uiSlice.actions;

export default uiSlice.reducer;
