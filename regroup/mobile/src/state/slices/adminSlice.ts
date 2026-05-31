import { createSlice, PayloadAction } from '@reduxjs/toolkit';
import Admin from '../../entities/Admin';

/**
 * Admin State Interface
 */
export interface AdminState {
  // Admin entities
  admins: { [id: string]: Admin };
  selectedAdmin: Admin | null;
  userAsAdmin: Admin | null;
  houseAdmins: { [id: string]: Admin };

  // Loading states
  loading: boolean;
  error: string | null;
}

/**
 * Initial State
 */
const initialState: AdminState = {
  admins: {},
  selectedAdmin: null,
  userAsAdmin: null,
  houseAdmins: {},
  loading: false,
  error: null,
};

/**
 * Admin Slice
 */
const adminSlice = createSlice({
  name: 'admin',
  initialState,
  reducers: {
    // Set current user as admin
    setUserAsAdmin: (state, action: PayloadAction<Admin>) => {
      state.userAsAdmin = action.payload;
    },

    // Select an admin for viewing/editing
    selectAdmin: (state, action: PayloadAction<Admin>) => {
      state.selectedAdmin = action.payload;
    },

    // Clear selected admin
    clearSelectedAdmin: state => {
      state.selectedAdmin = null;
    },

    // Clear error
    clearError: state => {
      state.error = null;
    },

    // Reset admin state
    resetAdminState: () => initialState,
  },
});

/**
 * Actions
 */
export const {
  setUserAsAdmin,
  selectAdmin,
  clearSelectedAdmin,
  clearError,
  resetAdminState,
} = adminSlice.actions;

/**
 * Selectors
 */
export const selectAllAdmins = (state: { admin: AdminState }) =>
  state.admin.admins;
export const selectAdminById = (
  state: { admin: AdminState },
  adminId: string,
) => state.admin.admins[adminId];
export const selectUserAsAdmin = (state: { admin: AdminState }) =>
  state.admin.userAsAdmin;
export const selectSelectedAdmin = (state: { admin: AdminState }) =>
  state.admin.selectedAdmin;
export const selectHouseAdmins = (state: { admin: AdminState }) =>
  state.admin.houseAdmins;
export const selectAdminLoading = (state: { admin: AdminState }) =>
  state.admin.loading;
export const selectAdminError = (state: { admin: AdminState }) =>
  state.admin.error;

/**
 * Reducer
 */
export default adminSlice.reducer;
