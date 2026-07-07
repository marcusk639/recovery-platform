// src/state/slices/__tests__/setupSlice.test.ts

// Mock firebase-setup before any imports that depend on it
jest.mock("../../../../firebase-setup", () => ({
  firestore: {
    collection: jest.fn(() => ({
      doc: jest.fn(() => ({
        get: jest.fn(),
        set: jest.fn(),
        update: jest.fn(),
        delete: jest.fn(),
      })),
      get: jest.fn(),
      add: jest.fn(),
      where: jest.fn().mockReturnThis(),
    })),
  },
  functions: {
    httpsCallable: jest.fn(() => jest.fn()),
  },
}));

// Mock house service so async thunks don't touch Firebase
jest.mock("../../../services/house", () => ({
  createHouse: jest.fn(),
  updateHouse: jest.fn(),
  getHouse: jest.fn(),
  finalizeHouseSetup: jest.fn(),
  createHouseId: jest.fn(() => "mock-house-id"),
  houseCollection: {},
}));

// Mock organization service
jest.mock("../../../services/organization", () => ({
  createOrganization: jest.fn(),
  getOrganization: jest.fn(),
}));

// Mock admin service (imported transitively)
jest.mock("../../../services/admin", () => ({
  getAdmin: jest.fn(),
  getHouseAdmins: jest.fn(),
  createAdmin: jest.fn(),
  updateAdmin: jest.fn(),
  deleteAdmin: jest.fn(),
  sendAdminInvite: jest.fn(),
  createAdminId: jest.fn(() => "mock-admin-id"),
  adminCollection: {},
}));

// Mock guest service (imported transitively)
jest.mock("../../../services/guest", () => ({
  getGuests: jest.fn(),
  getGuest: jest.fn(),
  updateGuest: jest.fn(),
  createGuest: jest.fn(),
  deleteGuest: jest.fn(),
  createGuestId: jest.fn(() => "mock-guest-id"),
  guestCollection: {},
  archiveCollection: {},
}));

import { configureStore } from "@reduxjs/toolkit";
import setupReducer, {
  setCurrentStep,
  nextStep,
  previousStep,
  setOrganization,
  setSelectedHouse,
  updateHouseData,
  removeHouseFromSetup,
  setSelectedPhase,
  setSelectedChore,
  setGuests,
  setAdmins,
  setInApp,
  startHouseSetup,
  resetSubmissionState,
  clearError,
  resetSetupState,
  createOrganization,
  createHouse,
  updateHouseConfig,
  completeSetup,
  selectCurrentStep,
  selectOrganization,
  selectSelectedHouse,
  selectHouses,
  selectSelectedPhase,
  selectSelectedChore,
  selectSetupGuests,
  selectSetupAdmins,
  selectInApp,
  selectSubmitting,
  selectSubmittingSuccessful,
  selectSubmittingFailed,
  selectSetupError,
  SetupState,
} from "../setupSlice";
import * as houseService from "../../../services/house";
import * as orgService from "../../../services/organization";
import { House } from "../../../entities/House";
import Organization from "../../../entities/Organization";

/**
 * Build minimal plain-object House (bypasses constructor to avoid Firebase calls).
 */
const makeHouse = (id = "h1"): House =>
  ({
    id,
    name: "Test House",
    ownerId: "owner-1",
    lat: 40.7,
    lng: -74.0,
    geohash: "",
    adminId: "",
    adminIds: [],
    superAdminIds: [],
    street: "123 Main St",
    city: "New York",
    state: "NY",
    zip: "10001",
    country: "US",
    code: "TEST01",
    health: {},
    monthlyRent: 1000,
    weeklyRent: 250,
    currentCapacity: 2,
    maximumCapacity: 5,
    avatar: "",
    imageUrl: "",
    depositsAndFees: 0,
    certified: false,
    phoneNumber: "5551234567",
    rentFrequency: "both",
    pendingAdminInvites: [],
    pendingGuestInvites: [],
    subscriptionStatus: "active",
    isDemoHouse: false,
    houseType: "traditional",
    seniorPeerEmails: [],
    managerSetupType: "operator-only",
    awaitingVerification: [],
    chores: {},
    phases: {},
    gender: "",
    disputes: {},
    issues: {},
    applications: {},
    complaints: {},
    rooms: {},
    baths: 1,
    wifi: false,
    rating: 3,
    timezone: "",
    createdAt: "2024-01-01T00:00:00.000Z",
    updatedAt: "2024-01-01T00:00:00.000Z",
  } as unknown as House);

/**
 * Build a minimal plain-object Organization.
 */
const makeOrg = (id = "org1"): Organization =>
  ({
    id,
    name: "Test Org",
    owners: ["u1"],
    associates: [],
    houseIds: [],
    numberOfHouses: 1,
    createdAt: "2024-01-01T00:00:00.000Z",
    updatedAt: "2024-01-01T00:00:00.000Z",
  } as Organization);

const makePhase = (id = "phase1") =>
  ({
    id,
    name: "Phase 1",
    duration: 30,
  } as any);

const makeChore = (id = "chore1") =>
  ({
    id,
    name: "Clean Kitchen",
    assignedTo: "g1",
  } as any);

const makeStore = () => configureStore({ reducer: { setup: setupReducer } });

describe("setupSlice", () => {
  const initialState = setupReducer(undefined, { type: "@@INIT" });

  // ---------------------------------------------------------------------------
  // Initial State
  // ---------------------------------------------------------------------------
  describe("Initial State", () => {
    it("returns the correct initial state shape", () => {
      expect(initialState.organization).toBeNull();
      expect(initialState.selectedHouse).toBeNull();
      expect(initialState.houses).toEqual({});
      expect(initialState.selectedPhase).toBeNull();
      expect(initialState.selectedChore).toBeNull();
      expect(initialState.guests).toEqual({});
      expect(initialState.admins).toEqual({});
      expect(initialState.currentStep).toBe(0);
      expect(initialState.inApp).toBe(false);
      expect(initialState.submitting).toBe(false);
      expect(initialState.submittingSuccessful).toBe(false);
      expect(initialState.submittingFailed).toBe(false);
      expect(initialState.error).toBeNull();
    });
  });

  // ---------------------------------------------------------------------------
  // Synchronous reducers — navigation
  // ---------------------------------------------------------------------------
  describe("setCurrentStep", () => {
    it("sets currentStep to the provided value", () => {
      const state = setupReducer(initialState, setCurrentStep(3));
      expect(state.currentStep).toBe(3);
    });

    it("replaces existing currentStep", () => {
      const s = { ...initialState, currentStep: 2 };
      const state = setupReducer(s, setCurrentStep(5));
      expect(state.currentStep).toBe(5);
    });
  });

  describe("nextStep", () => {
    it("increments currentStep by 1", () => {
      const state = setupReducer(initialState, nextStep());
      expect(state.currentStep).toBe(1);
    });

    it("increments from an existing non-zero step", () => {
      const s = { ...initialState, currentStep: 3 };
      const state = setupReducer(s, nextStep());
      expect(state.currentStep).toBe(4);
    });
  });

  describe("previousStep", () => {
    it("decrements currentStep by 1 when currentStep > 0", () => {
      const s = { ...initialState, currentStep: 2 };
      const state = setupReducer(s, previousStep());
      expect(state.currentStep).toBe(1);
    });

    it("does not decrement below 0", () => {
      const state = setupReducer(initialState, previousStep());
      expect(state.currentStep).toBe(0);
    });
  });

  // ---------------------------------------------------------------------------
  // Synchronous reducers — data updates
  // ---------------------------------------------------------------------------
  describe("setOrganization", () => {
    it("sets the organization", () => {
      const org = makeOrg();
      const state = setupReducer(initialState, setOrganization(org));
      expect(state.organization?.id).toBe("org1");
    });
  });

  describe("setSelectedHouse", () => {
    it("sets selectedHouse and caches it in houses map", () => {
      const house = makeHouse("h1");
      const state = setupReducer(initialState, setSelectedHouse(house));
      expect(state.selectedHouse?.id).toBe("h1");
      expect(state.houses["h1"]?.id).toBe("h1");
    });

    it("replaces an existing selectedHouse", () => {
      const first = makeHouse("h1");
      const s = { ...initialState, selectedHouse: first };
      const second = makeHouse("h2");
      const state = setupReducer(s, setSelectedHouse(second));
      expect(state.selectedHouse?.id).toBe("h2");
      expect(state.houses["h2"]?.id).toBe("h2");
    });
  });

  describe("updateHouseData", () => {
    it("merges updates into selectedHouse", () => {
      const house = makeHouse("h1");
      const s = { ...initialState, selectedHouse: house };
      const state = setupReducer(s, updateHouseData({ name: "Updated House" }));
      expect(state.selectedHouse?.name).toBe("Updated House");
    });

    it("is a no-op when selectedHouse is null", () => {
      const state = setupReducer(
        initialState,
        updateHouseData({ name: "Should not apply" })
      );
      expect(state.selectedHouse).toBeNull();
    });

    it("also syncs the update into the houses map (regression: OrgSetup could not see edits from ManagerSetup/ChoreSetup/PhaseConfigSetup)", () => {
      const house = makeHouse("h1");
      const s = {
        ...initialState,
        selectedHouse: house,
        houses: { h1: house },
      };
      const state = setupReducer(s, updateHouseData({ name: "Updated House" }));
      expect(state.houses["h1"]?.name).toBe("Updated House");
    });

    it("does not add an entry to houses when the house is not already cached there", () => {
      const house = makeHouse("h1");
      const s = { ...initialState, selectedHouse: house, houses: {} };
      const state = setupReducer(s, updateHouseData({ name: "Updated House" }));
      expect(state.houses["h1"]).toBeUndefined();
    });
  });

  describe("removeHouseFromSetup", () => {
    it("removes the house from the houses map", () => {
      const house = makeHouse("h1");
      const s = { ...initialState, houses: { h1: house } };
      const state = setupReducer(s, removeHouseFromSetup("h1"));
      expect(state.houses["h1"]).toBeUndefined();
    });

    it("clears selectedHouse when it matches the removed house", () => {
      const house = makeHouse("h1");
      const s = {
        ...initialState,
        selectedHouse: house,
        houses: { h1: house },
      };
      const state = setupReducer(s, removeHouseFromSetup("h1"));
      expect(state.selectedHouse).toBeNull();
    });

    it("leaves selectedHouse untouched when it does not match the removed house", () => {
      const selected = makeHouse("h2");
      const other = makeHouse("h1");
      const s = {
        ...initialState,
        selectedHouse: selected,
        houses: { h1: other, h2: selected },
      };
      const state = setupReducer(s, removeHouseFromSetup("h1"));
      expect(state.selectedHouse?.id).toBe("h2");
      expect(state.houses["h1"]).toBeUndefined();
      expect(state.houses["h2"]?.id).toBe("h2");
    });

    it("is a no-op when the house id is not present", () => {
      const house = makeHouse("h1");
      const s = { ...initialState, houses: { h1: house } };
      const state = setupReducer(s, removeHouseFromSetup("nonexistent"));
      expect(state.houses).toEqual({ h1: house });
    });
  });

  describe("setSelectedPhase", () => {
    it("sets selectedPhase", () => {
      const phase = makePhase("phase1");
      const state = setupReducer(initialState, setSelectedPhase(phase));
      expect((state.selectedPhase as any)?.id).toBe("phase1");
    });
  });

  describe("setSelectedChore", () => {
    it("sets selectedChore", () => {
      const chore = makeChore("chore1");
      const state = setupReducer(initialState, setSelectedChore(chore));
      expect((state.selectedChore as any)?.id).toBe("chore1");
    });
  });

  describe("setGuests", () => {
    it("sets the guests map", () => {
      const guests = { g1: { id: "g1" } as any };
      const state = setupReducer(initialState, setGuests(guests));
      expect(state.guests["g1"]).toBeDefined();
    });
  });

  describe("setAdmins", () => {
    it("sets the admins map", () => {
      const admins = { a1: { id: "a1" } as any };
      const state = setupReducer(initialState, setAdmins(admins));
      expect(state.admins["a1"]).toBeDefined();
    });
  });

  describe("setInApp", () => {
    it("sets inApp to true", () => {
      const state = setupReducer(initialState, setInApp(true));
      expect(state.inApp).toBe(true);
    });

    it("sets inApp to false", () => {
      const s = { ...initialState, inApp: true };
      const state = setupReducer(s, setInApp(false));
      expect(state.inApp).toBe(false);
    });
  });

  describe("startHouseSetup", () => {
    it("sets selectedHouse, guests, admins, and resets currentStep to 0", () => {
      const house = makeHouse("h1");
      const guests = { g1: { id: "g1" } as any };
      const admins = { a1: { id: "a1" } as any };
      const s = { ...initialState, currentStep: 3 };
      const state = setupReducer(s, startHouseSetup({ house, guests, admins }));
      expect(state.selectedHouse?.id).toBe("h1");
      expect(state.guests["g1"]).toBeDefined();
      expect(state.admins["a1"]).toBeDefined();
      expect(state.currentStep).toBe(0);
    });
  });

  describe("resetSubmissionState", () => {
    it("resets all submission-related fields", () => {
      const dirtyState = {
        ...initialState,
        submitting: true,
        submittingSuccessful: true,
        submittingFailed: true,
        error: "some error",
      };
      const state = setupReducer(dirtyState, resetSubmissionState());
      expect(state.submitting).toBe(false);
      expect(state.submittingSuccessful).toBe(false);
      expect(state.submittingFailed).toBe(false);
      expect(state.error).toBeNull();
    });

    it("is a no-op when submission state is already clean", () => {
      const state = setupReducer(initialState, resetSubmissionState());
      expect(state.submitting).toBe(false);
      expect(state.submittingSuccessful).toBe(false);
      expect(state.submittingFailed).toBe(false);
      expect(state.error).toBeNull();
    });
  });

  describe("clearError", () => {
    it("clears the error field", () => {
      const s = { ...initialState, error: "some error" };
      const state = setupReducer(s, clearError());
      expect(state.error).toBeNull();
    });

    it("is a no-op when there is no error", () => {
      const state = setupReducer(initialState, clearError());
      expect(state.error).toBeNull();
    });
  });

  describe("resetSetupState", () => {
    it("resets the entire state to initial values", () => {
      const dirtyState: SetupState = {
        organization: makeOrg(),
        selectedHouse: makeHouse("h1"),
        houses: { h1: makeHouse("h1") },
        selectedPhase: makePhase(),
        selectedChore: makeChore(),
        guests: { g1: { id: "g1" } as any },
        admins: { a1: { id: "a1" } as any },
        currentStep: 5,
        inApp: true,
        submitting: true,
        submittingSuccessful: true,
        submittingFailed: true,
        error: "some error",
      };
      const state = setupReducer(dirtyState, resetSetupState());
      expect(state).toEqual(initialState);
    });
  });

  // ---------------------------------------------------------------------------
  // Async thunks — createOrganization
  // ---------------------------------------------------------------------------
  describe("createOrganization thunk", () => {
    it("sets submitting=true on pending", () => {
      const state = setupReducer(
        initialState,
        createOrganization.pending("", {})
      );
      expect(state.submitting).toBe(true);
      expect(state.error).toBeNull();
    });

    it("stores org and sets success flags on fulfilled", () => {
      const org = makeOrg("org1");
      const action = createOrganization.fulfilled(org, "", {});
      const state = setupReducer(initialState, action);
      expect(state.submitting).toBe(false);
      expect(state.submittingSuccessful).toBe(true);
      expect(state.organization?.id).toBe("org1");
    });

    it("sets failure flags and error on rejected", () => {
      const action = createOrganization.rejected(
        new Error("Create org failed"),
        "",
        {}
      );
      const state = setupReducer(initialState, action);
      expect(state.submitting).toBe(false);
      expect(state.submittingFailed).toBe(true);
      expect(state.error).toBe("Create org failed");
    });

    it("uses fallback error message on rejected with no message", () => {
      const error = new Error("");
      error.message = "";
      const action = createOrganization.rejected(error, "", {});
      const state = setupReducer(initialState, action);
      expect(state.error).toBe("Failed to create organization");
    });

    it("dispatches createOrganization and stores result via real store", async () => {
      const org = makeOrg("org1");
      (orgService.createOrganization as jest.Mock).mockResolvedValueOnce(org);
      const store = makeStore();
      await store.dispatch(createOrganization({ name: "Test Org" }));
      expect(store.getState().setup.organization?.id).toBe("org1");
      expect(store.getState().setup.submittingSuccessful).toBe(true);
    });
  });

  // ---------------------------------------------------------------------------
  // Async thunks — createHouse
  // ---------------------------------------------------------------------------
  describe("createHouse thunk", () => {
    it("sets submitting=true on pending", () => {
      const state = setupReducer(initialState, createHouse.pending("", {}));
      expect(state.submitting).toBe(true);
    });

    it("stores house in selectedHouse and houses map on fulfilled", () => {
      const house = makeHouse("h1");
      const action = createHouse.fulfilled(house, "", {});
      const state = setupReducer(initialState, action);
      expect(state.submitting).toBe(false);
      expect(state.submittingSuccessful).toBe(true);
      expect(state.selectedHouse?.id).toBe("h1");
      expect(state.houses["h1"]?.id).toBe("h1");
    });

    it("sets failure flags on rejected", () => {
      const action = createHouse.rejected(
        new Error("Create house failed"),
        "",
        {}
      );
      const state = setupReducer(initialState, action);
      expect(state.submitting).toBe(false);
      expect(state.submittingFailed).toBe(true);
      expect(state.error).toBe("Create house failed");
    });

    it("dispatches createHouse and stores result via real store", async () => {
      const house = makeHouse("h1");
      (houseService.createHouse as jest.Mock).mockResolvedValueOnce(house);
      const store = makeStore();
      await store.dispatch(createHouse({ name: "Test House" }));
      const s = store.getState().setup;
      expect(s.selectedHouse?.id).toBe("h1");
      expect(s.houses["h1"]?.id).toBe("h1");
    });
  });

  // ---------------------------------------------------------------------------
  // Async thunks — updateHouseConfig
  // ---------------------------------------------------------------------------
  describe("updateHouseConfig thunk", () => {
    const arg = {
      houseId: "h1",
      updates: { id: "h1", name: "Updated" } as any,
    };

    it("sets submitting=true on pending", () => {
      const state = setupReducer(
        initialState,
        updateHouseConfig.pending("", arg)
      );
      expect(state.submitting).toBe(true);
    });

    it("updates selectedHouse and houses map on fulfilled", () => {
      const house = makeHouse("h1");
      house.name = "Updated";
      const action = updateHouseConfig.fulfilled(house, "", arg);
      const state = setupReducer(initialState, action);
      expect(state.submitting).toBe(false);
      expect(state.selectedHouse?.name).toBe("Updated");
      expect(state.houses["h1"]?.name).toBe("Updated");
    });

    it("sets error on rejected", () => {
      const action = updateHouseConfig.rejected(
        new Error("Update config failed"),
        "",
        arg
      );
      const state = setupReducer(initialState, action);
      expect(state.submitting).toBe(false);
      expect(state.error).toBe("Update config failed");
    });

    it("dispatches updateHouseConfig and updates store via real store", async () => {
      const house = makeHouse("h1");
      house.name = "Updated";
      (houseService.updateHouse as jest.Mock).mockResolvedValueOnce(undefined);
      (houseService.getHouse as jest.Mock).mockResolvedValueOnce(house);
      const store = makeStore();
      await store.dispatch(updateHouseConfig(arg));
      expect(store.getState().setup.selectedHouse?.name).toBe("Updated");
    });
  });

  // ---------------------------------------------------------------------------
  // Async thunks — completeSetup
  // ---------------------------------------------------------------------------
  describe("completeSetup thunk", () => {
    const arg = { houseId: "h1", finalConfig: { name: "Final" } };

    it("sets submitting=true on pending", () => {
      const state = setupReducer(initialState, completeSetup.pending("", arg));
      expect(state.submitting).toBe(true);
    });

    it("sets submittingSuccessful=true on fulfilled", () => {
      const action = completeSetup.fulfilled("h1", "", arg);
      const state = setupReducer(initialState, action);
      expect(state.submitting).toBe(false);
      expect(state.submittingSuccessful).toBe(true);
    });

    it("sets failure flags on rejected", () => {
      const action = completeSetup.rejected(
        new Error("Complete failed"),
        "",
        arg
      );
      const state = setupReducer(initialState, action);
      expect(state.submitting).toBe(false);
      expect(state.submittingFailed).toBe(true);
      expect(state.error).toBe("Complete failed");
    });

    it("dispatches completeSetup and updates store via real store", async () => {
      (houseService.finalizeHouseSetup as jest.Mock).mockResolvedValueOnce(
        undefined
      );
      const store = makeStore();
      await store.dispatch(completeSetup(arg));
      expect(store.getState().setup.submittingSuccessful).toBe(true);
    });
  });

  // ---------------------------------------------------------------------------
  // Selectors
  // ---------------------------------------------------------------------------
  describe("selectors", () => {
    const house = makeHouse("h1");
    const org = makeOrg("org1");
    const phase = makePhase("phase1");
    const chore = makeChore("chore1");
    const guests = { g1: { id: "g1" } as any };
    const admins = { a1: { id: "a1" } as any };

    const storeState = {
      setup: {
        organization: org,
        selectedHouse: house,
        houses: { h1: house },
        selectedPhase: phase,
        selectedChore: chore,
        guests,
        admins,
        currentStep: 2,
        inApp: true,
        submitting: true,
        submittingSuccessful: false,
        submittingFailed: false,
        error: "test error",
      } as SetupState,
    };

    it("selectCurrentStep returns currentStep", () => {
      expect(selectCurrentStep(storeState)).toBe(2);
    });

    it("selectOrganization returns organization", () => {
      expect(selectOrganization(storeState)?.id).toBe("org1");
    });

    it("selectSelectedHouse returns selectedHouse", () => {
      expect(selectSelectedHouse(storeState)?.id).toBe("h1");
    });

    it("selectHouses returns houses map", () => {
      expect(selectHouses(storeState)).toEqual({ h1: house });
    });

    it("selectSelectedPhase returns selectedPhase", () => {
      expect((selectSelectedPhase(storeState) as any)?.id).toBe("phase1");
    });

    it("selectSelectedChore returns selectedChore", () => {
      expect((selectSelectedChore(storeState) as any)?.id).toBe("chore1");
    });

    it("selectSetupGuests returns guests", () => {
      expect(selectSetupGuests(storeState)).toEqual(guests);
    });

    it("selectSetupAdmins returns admins", () => {
      expect(selectSetupAdmins(storeState)).toEqual(admins);
    });

    it("selectInApp returns inApp flag", () => {
      expect(selectInApp(storeState)).toBe(true);
    });

    it("selectSubmitting returns submitting flag", () => {
      expect(selectSubmitting(storeState)).toBe(true);
    });

    it("selectSubmittingSuccessful returns submittingSuccessful flag", () => {
      expect(selectSubmittingSuccessful(storeState)).toBe(false);
    });

    it("selectSubmittingFailed returns submittingFailed flag", () => {
      expect(selectSubmittingFailed(storeState)).toBe(false);
    });

    it("selectSetupError returns error", () => {
      expect(selectSetupError(storeState)).toBe("test error");
    });
  });
});
