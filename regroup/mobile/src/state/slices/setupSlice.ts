import { createSlice, createAsyncThunk, PayloadAction } from '@reduxjs/toolkit';
import Organization from '../../entities/Organization';
import { House, PartialHouseWithId } from '../../entities/House';
import { PhaseConfiguration } from '../../entities/Phase';
import { Chore } from '../../entities/Chore';
import { Guests, Admins } from '../../types';
import * as houseService from '../../services/house';
import * as orgService from '../../services/organization';

/**
 * Setup State Interface
 * Manages the multi-step setup wizard for organizations and houses
 */
export interface SetupState {
  // Setup data
  organization: Organization | null;
  selectedHouse: House | null;
  houses: { [id: string]: House };
  selectedPhase: PhaseConfiguration | null;
  selectedChore: Chore | null;
  guests: Guests;
  admins: Admins;

  // Wizard state
  currentStep: number;
  inApp: boolean; // Setup within app (vs. onboarding)

  // Submission states
  submitting: boolean;
  submittingSuccessful: boolean;
  submittingFailed: boolean;
  error: string | null;
}

/**
 * Initial State
 */
const initialState: SetupState = {
  organization: null,
  selectedHouse: null,
  houses: {},
  selectedPhase: null,
  selectedChore: null,
  guests: {},
  admins: {},
  currentStep: 0,
  inApp: false,
  submitting: false,
  submittingSuccessful: false,
  submittingFailed: false,
  error: null,
};

/**
 * Async Thunks
 */

/**
 * Create organization
 */
export const createOrganization = createAsyncThunk<
  Organization,
  Partial<Organization>
>(
  'setup/createOrganization',
  async (orgData: Partial<Organization>) => {
    const organization = await orgService.createOrganization(orgData);
    return organization;
  }
);

/**
 * Create house
 */
export const createHouse = createAsyncThunk<
  House,
  Partial<House>
>(
  'setup/createHouse',
  async (houseData: Partial<House>) => {
    const house = await houseService.createHouse(houseData as House);
    return house;
  }
);

/**
 * Update house configuration
 */
export const updateHouseConfig = createAsyncThunk<
  House,
  { houseId: string; updates: PartialHouseWithId }
>(
  'setup/updateHouseConfig',
  async ({ houseId, updates }) => {
    await houseService.updateHouse(houseId, updates);
    // updateHouse returns void, so we need to fetch the updated house
    const house = await houseService.getHouse(houseId);
    return house;
  }
);

/**
 * Complete setup wizard
 */
export const completeSetup = createAsyncThunk<
  string,
  { houseId: string; finalConfig: Partial<House> }
>(
  'setup/completeSetup',
  async ({ houseId, finalConfig }) => {
    await houseService.finalizeHouseSetup(houseId, finalConfig);
    return houseId;
  }
);

/**
 * Setup Slice
 */
const setupSlice = createSlice({
  name: 'setup',
  initialState,
  reducers: {
    // Navigation
    setCurrentStep: (state, action: PayloadAction<number>) => {
      state.currentStep = action.payload;
    },

    nextStep: (state) => {
      state.currentStep += 1;
    },

    previousStep: (state) => {
      if (state.currentStep > 0) {
        state.currentStep -= 1;
      }
    },

    // Data updates
    setOrganization: (state, action: PayloadAction<Organization>) => {
      state.organization = action.payload;
    },

    setSelectedHouse: (state, action: PayloadAction<House>) => {
      state.selectedHouse = action.payload;
      state.houses[action.payload.id] = action.payload;
    },

    updateHouseData: (state, action: PayloadAction<Partial<House>>) => {
      if (state.selectedHouse) {
        state.selectedHouse = { ...state.selectedHouse, ...action.payload };
      }
    },

    setSelectedPhase: (state, action: PayloadAction<PhaseConfiguration>) => {
      state.selectedPhase = action.payload;
    },

    setSelectedChore: (state, action: PayloadAction<Chore>) => {
      state.selectedChore = action.payload;
    },

    setGuests: (state, action: PayloadAction<Guests>) => {
      state.guests = action.payload;
    },

    setAdmins: (state, action: PayloadAction<Admins>) => {
      state.admins = action.payload;
    },

    // Setup mode
    setInApp: (state, action: PayloadAction<boolean>) => {
      state.inApp = action.payload;
    },

    // Start house setup (from existing house)
    startHouseSetup: (
      state,
      action: PayloadAction<{ house: House; guests: Guests; admins: Admins }>
    ) => {
      state.selectedHouse = action.payload.house;
      state.guests = action.payload.guests;
      state.admins = action.payload.admins;
      state.currentStep = 0;
    },

    // Reset submission states
    resetSubmissionState: (state) => {
      state.submitting = false;
      state.submittingSuccessful = false;
      state.submittingFailed = false;
      state.error = null;
    },

    // Clear error
    clearError: (state) => {
      state.error = null;
    },

    // Reset entire setup state
    resetSetupState: () => initialState,
  },
  extraReducers: (builder) => {
    // Create Organization
    builder
      .addCase(createOrganization.pending, (state) => {
        state.submitting = true;
        state.error = null;
      })
      .addCase(createOrganization.fulfilled, (state, action) => {
        state.submitting = false;
        state.submittingSuccessful = true;
        state.organization = action.payload;
      })
      .addCase(createOrganization.rejected, (state, action) => {
        state.submitting = false;
        state.submittingFailed = true;
        state.error = action.error.message || 'Failed to create organization';
      });

    // Create House
    builder
      .addCase(createHouse.pending, (state) => {
        state.submitting = true;
        state.error = null;
      })
      .addCase(createHouse.fulfilled, (state, action) => {
        state.submitting = false;
        state.submittingSuccessful = true;
        const house = action.payload;
        state.selectedHouse = house;
        state.houses[house.id] = house;
      })
      .addCase(createHouse.rejected, (state, action) => {
        state.submitting = false;
        state.submittingFailed = true;
        state.error = action.error.message || 'Failed to create house';
      });

    // Update House Config
    builder
      .addCase(updateHouseConfig.pending, (state) => {
        state.submitting = true;
        state.error = null;
      })
      .addCase(updateHouseConfig.fulfilled, (state, action) => {
        state.submitting = false;
        const house = action.payload;
        if (house) {
          state.selectedHouse = house;
          state.houses[house.id] = house;
        }
      })
      .addCase(updateHouseConfig.rejected, (state, action) => {
        state.submitting = false;
        state.error = action.error.message || 'Failed to update house configuration';
      });

    // Complete Setup
    builder
      .addCase(completeSetup.pending, (state) => {
        state.submitting = true;
        state.error = null;
      })
      .addCase(completeSetup.fulfilled, (state) => {
        state.submitting = false;
        state.submittingSuccessful = true;
      })
      .addCase(completeSetup.rejected, (state, action) => {
        state.submitting = false;
        state.submittingFailed = true;
        state.error = action.error.message || 'Failed to complete setup';
      });
  },
});

/**
 * Actions
 */
export const {
  setCurrentStep,
  nextStep,
  previousStep,
  setOrganization,
  setSelectedHouse,
  updateHouseData,
  setSelectedPhase,
  setSelectedChore,
  setGuests,
  setAdmins,
  setInApp,
  startHouseSetup,
  resetSubmissionState,
  clearError,
  resetSetupState,
} = setupSlice.actions;

/**
 * Selectors
 */
export const selectCurrentStep = (state: { setup: SetupState }) => state.setup.currentStep;
export const selectOrganization = (state: { setup: SetupState }) => state.setup.organization;
export const selectSelectedHouse = (state: { setup: SetupState }) => state.setup.selectedHouse;
export const selectHouses = (state: { setup: SetupState }) => state.setup.houses;
export const selectSelectedPhase = (state: { setup: SetupState }) => state.setup.selectedPhase;
export const selectSelectedChore = (state: { setup: SetupState }) => state.setup.selectedChore;
export const selectSetupGuests = (state: { setup: SetupState }) => state.setup.guests;
export const selectSetupAdmins = (state: { setup: SetupState }) => state.setup.admins;
export const selectInApp = (state: { setup: SetupState }) => state.setup.inApp;
export const selectSubmitting = (state: { setup: SetupState }) => state.setup.submitting;
export const selectSubmittingSuccessful = (state: { setup: SetupState }) =>
  state.setup.submittingSuccessful;
export const selectSubmittingFailed = (state: { setup: SetupState }) =>
  state.setup.submittingFailed;
export const selectSetupError = (state: { setup: SetupState }) => state.setup.error;

/**
 * Reducer
 */
export default setupSlice.reducer;
