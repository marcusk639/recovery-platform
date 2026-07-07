/**
 * useHouseSetupWizard Hook Tests
 *
 * Tests the hook that reads setup wizard state from the RTK store.
 * All tests wrap the hook in a Redux Provider with a configured store.
 */

import { renderHook, act } from "@testing-library/react-native";
import React from "react";
import { Provider } from "react-redux";
import { configureStore } from "@reduxjs/toolkit";

// ── Slice imports ─────────────────────────────────────────────────────────────

import setupReducer, {
  setOrganization,
  setSelectedHouse,
  setGuests,
  setSelectedPhase,
} from "../../state/slices/setupSlice";
import adminReducer, { setUserAsAdmin } from "../../state/slices/adminSlice";

// ── Hook under test ───────────────────────────────────────────────────────────

import { useHouseSetupWizard } from "../useHouseSetupWizard";

// ── Firebase mocks (required by transitive imports) ──────────────────────────

jest.mock("../../firebase-setup", () => ({
  firestore: {
    collection: jest.fn(() => ({ doc: jest.fn(() => ({})) })),
    batch: jest.fn(),
  },
  functions: { httpsCallable: jest.fn() },
}));

// setup-wizard.ts (initializeHouses) is pulled in transitively via
// submitHouseSetup — mock it so submitHouse() tests don't touch Firebase.
jest.mock("../../services/setup-wizard", () => ({
  initializeHouses: jest.fn(),
}));

import { initializeHouses } from "../../services/setup-wizard";

// ── Helpers ───────────────────────────────────────────────────────────────────

// Minimal inline `user` reducer — avoids pulling userSlice's real transitive
// deps (navigation, userService) into what is otherwise an isolated hook test.
function makeStore(userState?: { id: string } | null) {
  return configureStore({
    reducer: {
      setup: setupReducer,
      admin: adminReducer,
      user: (state = { user: userState ?? null }) => state,
    },
  });
}

type TestStore = ReturnType<typeof makeStore>;

function makeWrapper(store: TestStore) {
  // Return a stable component reference so renderHook does not remount
  const Wrapper = ({ children }: { children: React.ReactNode }) =>
    React.createElement(Provider, { store, children });
  return Wrapper;
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe("useHouseSetupWizard", () => {
  describe("initial state", () => {
    it("returns null organization by default", () => {
      const store = makeStore();
      const { result } = renderHook(() => useHouseSetupWizard(), {
        wrapper: makeWrapper(store),
      });
      expect(result.current.organization).toBeNull();
    });

    it("returns null selectedHouse by default", () => {
      const store = makeStore();
      const { result } = renderHook(() => useHouseSetupWizard(), {
        wrapper: makeWrapper(store),
      });
      expect(result.current.selectedHouse).toBeNull();
    });

    it("returns empty houses object by default", () => {
      const store = makeStore();
      const { result } = renderHook(() => useHouseSetupWizard(), {
        wrapper: makeWrapper(store),
      });
      expect(result.current.houses).toEqual({});
    });

    it("returns null selectedPhase by default", () => {
      const store = makeStore();
      const { result } = renderHook(() => useHouseSetupWizard(), {
        wrapper: makeWrapper(store),
      });
      expect(result.current.selectedPhase).toBeNull();
    });

    it("returns empty guests object by default", () => {
      const store = makeStore();
      const { result } = renderHook(() => useHouseSetupWizard(), {
        wrapper: makeWrapper(store),
      });
      expect(result.current.guests).toEqual({});
    });

    it("returns null admin by default", () => {
      const store = makeStore();
      const { result } = renderHook(() => useHouseSetupWizard(), {
        wrapper: makeWrapper(store),
      });
      expect(result.current.admin).toBeNull();
    });

    it("returns submitting as false by default", () => {
      const store = makeStore();
      const { result } = renderHook(() => useHouseSetupWizard(), {
        wrapper: makeWrapper(store),
      });
      expect(result.current.submitting).toBe(false);
    });

    it("returns submittingSuccessful as false by default", () => {
      const store = makeStore();
      const { result } = renderHook(() => useHouseSetupWizard(), {
        wrapper: makeWrapper(store),
      });
      expect(result.current.submittingSuccessful).toBe(false);
    });

    it("returns submittingFailed as false by default", () => {
      const store = makeStore();
      const { result } = renderHook(() => useHouseSetupWizard(), {
        wrapper: makeWrapper(store),
      });
      expect(result.current.submittingFailed).toBe(false);
    });
  });

  describe("reflects store state changes", () => {
    it("reflects organization when dispatched to the store", () => {
      const store = makeStore();
      const org = { id: "org-1", name: "Test Org" } as any;

      const { result } = renderHook(() => useHouseSetupWizard(), {
        wrapper: makeWrapper(store),
      });

      act(() => {
        store.dispatch(setOrganization(org));
      });

      expect(result.current.organization).toEqual(org);
    });

    it("reflects selectedHouse when dispatched to the store", () => {
      const store = makeStore();
      const house = { id: "house-1", name: "Test House", disputes: {} } as any;

      const { result } = renderHook(() => useHouseSetupWizard(), {
        wrapper: makeWrapper(store),
      });

      act(() => {
        store.dispatch(setSelectedHouse(house));
      });

      expect(result.current.selectedHouse).toEqual(house);
    });

    it("reflects guests when dispatched to the store", () => {
      const store = makeStore();
      const guests = {
        "guest-1": { id: "guest-1", firstName: "Alice" },
      } as any;

      const { result } = renderHook(() => useHouseSetupWizard(), {
        wrapper: makeWrapper(store),
      });

      act(() => {
        store.dispatch(setGuests(guests));
      });

      expect(result.current.guests).toEqual(guests);
    });

    it("reflects admin (userAsAdmin) when dispatched to the store", () => {
      const store = makeStore();
      const admin = { id: "admin-1", email: "admin@test.com" } as any;

      const { result } = renderHook(() => useHouseSetupWizard(), {
        wrapper: makeWrapper(store),
      });

      act(() => {
        store.dispatch(setUserAsAdmin(admin));
      });

      expect(result.current.admin).toEqual(admin);
    });

    it("reflects selectedPhase when dispatched to the store", () => {
      const store = makeStore();
      const phase = { id: "phase-1", name: "Phase 1" } as any;

      const { result } = renderHook(() => useHouseSetupWizard(), {
        wrapper: makeWrapper(store),
      });

      act(() => {
        store.dispatch(setSelectedPhase(phase));
      });

      expect(result.current.selectedPhase).toEqual(phase);
    });
  });

  describe("return shape", () => {
    it("exposes all expected keys", () => {
      const store = makeStore();
      const { result } = renderHook(() => useHouseSetupWizard(), {
        wrapper: makeWrapper(store),
      });

      const keys = Object.keys(result.current);
      expect(keys).toContain("organization");
      expect(keys).toContain("houses");
      expect(keys).toContain("selectedHouse");
      expect(keys).toContain("selectedPhase");
      expect(keys).toContain("guests");
      expect(keys).toContain("admin");
      expect(keys).toContain("submitting");
      expect(keys).toContain("submittingSuccessful");
      expect(keys).toContain("submittingFailed");
      expect(keys).toContain("setupHouse");
      expect(keys).toContain("updateHouse");
      expect(keys).toContain("removeHouse");
      expect(keys).toContain("startHouseSetup");
      expect(keys).toContain("startPhaseSetup");
      expect(keys).toContain("submitHouse");
    });
  });

  // ---------------------------------------------------------------------------
  // Write-side actions
  //
  // Regression coverage for 2026-07-05: withHouseSetupWizard (and this hook,
  // originally) only ever returned read-side state. Every wizard step
  // destructured updateHouse/setupHouse/removeHouse/startHouseSetup/
  // submitHouse props that no parent ever supplied, so those calls were
  // always no-ops. These tests assert the hook's own bound versions actually
  // dispatch and mutate the store.
  // ---------------------------------------------------------------------------
  describe("setupHouse", () => {
    it("dispatches setSelectedHouse and caches it in the houses map", () => {
      const store = makeStore();
      const house = { id: "h1", name: "New House" } as any;
      const { result } = renderHook(() => useHouseSetupWizard(), {
        wrapper: makeWrapper(store),
      });

      act(() => {
        result.current.setupHouse(house);
      });

      expect(store.getState().setup.selectedHouse).toEqual(house);
      expect(store.getState().setup.houses["h1"]).toEqual(house);
    });
  });

  describe("updateHouse", () => {
    it("merges the update into selectedHouse and the houses map", () => {
      const store = makeStore();
      const house = { id: "h1", name: "Original" } as any;
      store.dispatch(setSelectedHouse(house));

      const { result } = renderHook(() => useHouseSetupWizard(), {
        wrapper: makeWrapper(store),
      });

      act(() => {
        result.current.updateHouse({ id: "h1", name: "Updated" });
      });

      expect(store.getState().setup.selectedHouse?.name).toBe("Updated");
      expect(store.getState().setup.houses["h1"]?.name).toBe("Updated");
    });
  });

  describe("removeHouse", () => {
    it("removes the house from the houses map", () => {
      const store = makeStore();
      const house = { id: "h1", name: "Doomed House" } as any;
      store.dispatch(setSelectedHouse(house));

      const { result } = renderHook(() => useHouseSetupWizard(), {
        wrapper: makeWrapper(store),
      });

      act(() => {
        result.current.removeHouse("h1");
      });

      expect(store.getState().setup.houses["h1"]).toBeUndefined();
    });

    it("is a no-op when called with no id", () => {
      const store = makeStore();
      const house = { id: "h1", name: "Untouched House" } as any;
      store.dispatch(setSelectedHouse(house));

      const { result } = renderHook(() => useHouseSetupWizard(), {
        wrapper: makeWrapper(store),
      });

      act(() => {
        result.current.removeHouse(undefined);
      });

      expect(store.getState().setup.houses["h1"]).toEqual(house);
    });
  });

  describe("startHouseSetup", () => {
    it("dispatches startHouseSetup with the given house and empty guests/admins", () => {
      const store = makeStore();
      const house = { id: "h1", name: "Editable House" } as any;

      const { result } = renderHook(() => useHouseSetupWizard(), {
        wrapper: makeWrapper(store),
      });

      act(() => {
        result.current.startHouseSetup(house);
      });

      expect(store.getState().setup.selectedHouse).toEqual(house);
      expect(store.getState().setup.guests).toEqual({});
      expect(store.getState().setup.admins).toEqual({});
    });

    it("is a no-op when called with no house", () => {
      const store = makeStore();
      const { result } = renderHook(() => useHouseSetupWizard(), {
        wrapper: makeWrapper(store),
      });

      act(() => {
        result.current.startHouseSetup(undefined);
      });

      expect(store.getState().setup.selectedHouse).toBeNull();
    });
  });

  describe("startPhaseSetup", () => {
    it("dispatches setSelectedPhase with the given phase", () => {
      const store = makeStore();
      const phase = { id: "phase-1", name: "Phase 1" } as any;

      const { result } = renderHook(() => useHouseSetupWizard(), {
        wrapper: makeWrapper(store),
      });

      act(() => {
        result.current.startPhaseSetup(phase);
      });

      expect(store.getState().setup.selectedPhase).toEqual(phase);
    });
  });

  describe("submitHouse", () => {
    beforeEach(() => {
      (initializeHouses as jest.Mock).mockReset();
    });

    it("throws without dispatching when no user is signed in", async () => {
      const store = makeStore(null);
      const { result } = renderHook(() => useHouseSetupWizard(), {
        wrapper: makeWrapper(store),
      });

      await expect(result.current.submitHouse()).rejects.toThrow(
        "Cannot submit house setup without a signed-in user."
      );
      expect(initializeHouses).not.toHaveBeenCalled();
    });

    // Regression coverage for 2026-07-07: this guard used to throw before
    // dispatching submitHouseSetup, so the thunk's rejected lifecycle never
    // ran and submittingFailed stayed false — a screen gating a failure UI
    // on that flag saw nothing.
    it("sets submittingFailed so a gated failure UI actually shows", async () => {
      const store = makeStore(null);
      const { result } = renderHook(() => useHouseSetupWizard(), {
        wrapper: makeWrapper(store),
      });

      await expect(result.current.submitHouse()).rejects.toThrow();

      const { result: afterState } = renderHook(() => useHouseSetupWizard(), {
        wrapper: makeWrapper(store),
      });
      expect(afterState.current.submittingFailed).toBe(true);
    });

    it("calls initializeHouses with the wizard's houses and the signed-in user, and sets success flags", async () => {
      const store = makeStore({ id: "operator-1" });
      const house = { id: "h1", name: "Submit Me" } as any;
      store.dispatch(setSelectedHouse(house));
      (initializeHouses as jest.Mock).mockResolvedValueOnce({
        houses: { h1: house },
      });

      const { result } = renderHook(() => useHouseSetupWizard(), {
        wrapper: makeWrapper(store),
      });

      await act(async () => {
        await result.current.submitHouse();
      });

      // setupSlice's initialState sets inApp: false (not undefined) — the
      // thunk forwards the real redux value, not a placeholder.
      expect(initializeHouses).toHaveBeenCalledWith(
        { h1: house },
        { id: "operator-1" },
        false
      );
      expect(store.getState().setup.submittingSuccessful).toBe(true);
    });

    it("sets failure flags when initializeHouses rejects", async () => {
      const store = makeStore({ id: "operator-1" });
      (initializeHouses as jest.Mock).mockRejectedValueOnce(
        new Error("Failed to create houses.")
      );

      const { result } = renderHook(() => useHouseSetupWizard(), {
        wrapper: makeWrapper(store),
      });

      // `expect(act(async () => ...)).rejects.toThrow()` doesn't propagate
      // the callback's rejection through act()'s own returned promise here —
      // confirmed via a real run that the rejection IS thrown and caught
      // correctly when awaited directly inside the act() callback instead.
      let caught: unknown = null;
      await act(async () => {
        try {
          await result.current.submitHouse();
        } catch (e) {
          caught = e;
        }
      });

      // createAsyncThunk's .unwrap() throws the serialized error action
      // payload (a plain {name, message, stack} object), not the original
      // Error instance.
      expect(caught).toMatchObject({ message: "Failed to create houses." });
      expect(store.getState().setup.submittingFailed).toBe(true);
      expect(store.getState().setup.error).toBe("Failed to create houses.");
    });
  });

  // Regression coverage for 2026-07-07: resetSetupState was exported from
  // the slice but dispatched nowhere, so a completed operator re-entering
  // the wizard could see stale selectedHouse/houses from a prior session.
  describe("resetSetup", () => {
    it("clears the wizard's staged state back to initial values", () => {
      const store = makeStore({ id: "operator-1" });
      store.dispatch(
        setSelectedHouse({ id: "h1", name: "Stale House" } as any)
      );

      const { result } = renderHook(() => useHouseSetupWizard(), {
        wrapper: makeWrapper(store),
      });
      expect(result.current.selectedHouse).toEqual({
        id: "h1",
        name: "Stale House",
      });

      act(() => {
        result.current.resetSetup();
      });

      expect(store.getState().setup.selectedHouse).toBeNull();
      expect(store.getState().setup.houses).toEqual({});
    });
  });
});
