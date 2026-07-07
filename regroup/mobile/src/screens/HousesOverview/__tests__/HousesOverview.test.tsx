/**
 * HousesOverview Screen Tests
 *
 * Covers:
 *  - Renders without crashing
 *  - Loading state (when isLoading is true / user is null)
 *  - Renders list of houses
 *  - Empty state when no houses
 *  - Selecting a house dispatches SELECT_HOUSE action and calls navigation.pop()
 *  - Error state renders error message
 */

// ─── Navigation mock ──────────────────────────────────────────────────────────
jest.mock("@react-navigation/native-stack", () => ({}));

// ─── Context mocks ────────────────────────────────────────────────────────────
const mockShowPopover = jest.fn();
const mockSetPopoverRef = jest.fn();

jest.mock("../../../context", () => ({
  useNotification: () => ({
    showPopover: mockShowPopover,
    setPopoverRef: mockSetPopoverRef,
  }),
  useTheme: () => ({
    theme: {
      primaryFontFamily: "System",
      secondaryFontFamily: "System",
      primaryColor: "#000",
      secondaryColor: "#fff",
      tertiaryColor: "#ccc",
      backgroundColor: "#fff",
      textColor: "#000",
      logoTintColor: "#fff",
    },
  }),
  useTranslation: () => ({
    t: (key: string) => key,
    i18n: { language: "en", changeLanguage: jest.fn() },
  }),
}));

// ─── React Query hooks mock ───────────────────────────────────────────────────
const mockUseHousesByAdmin = jest.fn();

jest.mock("../../../state/queries", () => ({
  useHousesByAdmin: (...args: any[]) => mockUseHousesByAdmin(...args),
}));

// ─── withPopover HOC mock (imported by source file but not used at runtime) ────
jest.mock("../../../components/rats-hoc/withPopover", () => ({
  withPopover: (Component: any) => Component,
}));

// ─── Component stubs ──────────────────────────────────────────────────────────
jest.mock("../../../components/rats-scroll-view", () => {
  const { ScrollView } = require("react-native");
  return (props: any) => {
    const { testID, children, contentContainerStyle, behavior, ...rest } =
      props;
    return (
      <ScrollView testID={testID} {...rest}>
        {children}
      </ScrollView>
    );
  };
});

jest.mock("../../../components/screen-header", () => {
  const { View, Text } = require("react-native");
  return ({ header, icon }: any) => (
    <View testID="screen-header">
      <Text testID="screen-header-text">{header}</Text>
      {icon || null}
    </View>
  );
});

jest.mock(
  "../../../components/rats-loading-indicator/rats-loading-indicator",
  () => {
    const { View } = require("react-native");
    return () => <View testID="loading-indicator" />;
  }
);

jest.mock("../../../components/rats-text", () => ({
  RatsText: ({ text }: any) => {
    const { Text } = require("react-native");
    return <Text>{typeof text === "number" ? String(text) : text || ""}</Text>;
  },
}));

jest.mock("../../../components/rats-interactable-section", () => {
  const { TouchableOpacity, Text } = require("react-native");
  return ({ name, testID, onPress }: any) => (
    <TouchableOpacity testID={testID || `section-${name}`} onPress={onPress}>
      <Text>{name}</Text>
    </TouchableOpacity>
  );
});

jest.mock("../../../components/help-icon", () => {
  const { TouchableOpacity } = require("react-native");
  return ({ helpFn }: any) => (
    <TouchableOpacity testID="help-icon" onPress={helpFn} />
  );
});

// ─── React imports (after mocks) ──────────────────────────────────────────────
import React from "react";
import { render, fireEvent } from "@testing-library/react-native";
import { Provider } from "react-redux";
import { configureStore } from "@reduxjs/toolkit";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

import housesReducer from "../../../state/slices/housesSlice";
import guestsReducer from "../../../state/slices/guestsSlice";
import userReducer from "../../../state/slices/userSlice";
import adminReducer from "../../../state/slices/adminSlice";
import authReducer from "../../../state/slices/authSlice";
import themeReducer from "../../../state/slices/themeSlice";
import chatReducer from "../../../state/slices/chatSlice";
import setupReducer from "../../../state/slices/setupSlice";
import notificationsReducer from "../../../state/slices/notificationsSlice";
import meetingsReducer from "../../../state/slices/meetingsSlice";

import HousesOverview from "../HousesOverview";

// ─── Fixtures ─────────────────────────────────────────────────────────────────

function makeHouse(id: string, name: string, overrides: any = {}): any {
  return {
    id,
    name,
    adminIds: ["admin-1"],
    superAdminIds: [],
    pendingAdminInvites: [],
    timezone: "",
    ownerId: "owner-1",
    lat: 0,
    lng: 0,
    geohash: "",
    street: "1 Main St",
    city: "Springfield",
    state: "IL",
    zip: "62701",
    country: "US",
    health: {},
    monthlyRent: 1000,
    weeklyRent: 250,
    currentCapacity: 2,
    maximumCapacity: 5,
    code: "TEST01",
    avatar: "",
    imageUrl: "",
    depositsAndFees: 0,
    certified: false,
    phoneNumber: "5551234567",
    rentFrequency: "both",
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
    applications: {},
    complaints: {},
    rooms: {},
    baths: 1,
    wifi: false,
    rating: 3,
    createdDate: "2024-01-01",
    lastUpdated: "2024-01-01",
    ...overrides,
  };
}

const HOUSE_1 = makeHouse("house-1", "Recovery House Alpha");
const HOUSE_2 = makeHouse("house-2", "Recovery House Beta");

const BASE_USER: any = {
  id: "user-1",
  uid: "user-1",
  firstName: "Admin",
  lastName: "User",
  email: "admin@example.com",
  isAdmin: true,
};

// ─── Store builder ─────────────────────────────────────────────────────────────

interface BuildStoreOptions {
  user?: any | null;
}

// Captured actions accumulator (reset per-test in beforeEach)
let dispatchedActions: any[] = [];

const actionCapture = (_storeApi: any) => (next: any) => (action: any) => {
  dispatchedActions.push(action);
  return next(action);
};

function buildStore({ user = BASE_USER }: BuildStoreOptions = {}) {
  return configureStore({
    reducer: {
      auth: authReducer,
      theme: themeReducer,
      user: userReducer,
      houses: housesReducer,
      guests: guestsReducer,
      meetings: meetingsReducer,
      admin: adminReducer,
      chat: chatReducer,
      setup: setupReducer,
      notifications: notificationsReducer,
    },
    middleware: (getDefaultMiddleware) =>
      getDefaultMiddleware().concat(actionCapture),
    preloadedState: {
      houses: {
        selectedHouse: null,
        houses: {},
        searchedHouses: [],
        loading: false,
        error: null,
        requestingHouse: false,
        requestingHouseFailed: false,
        requestingHouses: false,
        requestingHousesSuccessful: false,
        requestingHousesFailed: false,
        searchingHouses: false,
        searchingHousesSuccessful: false,
        searchingHousesFailed: false,
        creatingHouse: false,
        creatingHouseSuccessful: false,
        creatingHouseFailed: false,
        updatingHouse: false,
        updatingHouseSuccessful: false,
        updatingHouseFailed: false,
      } as any,
      guests: {
        guests: {},
        selectedGuest: null,
        userAsGuest: null,
        status: "idle",
        error: null,
        updateStatus: "idle",
        createStatus: "idle",
        deleteStatus: "idle",
        customizePhaseStatus: "idle",
      } as any,
      admin: {
        houseAdmins: {},
        admins: {},
        selectedAdmin: null,
        userAsAdmin: null,
        loading: false,
        error: null,
      } as any,
      user: {
        user,
        loading: false,
        error: null,
        loggedIn: !!user,
        loggingIn: false,
        loggingInFailed: false,
        signingUp: false,
        signingUpFailed: false,
      } as any,
    },
  });
}

function buildQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: { retry: false, gcTime: 0 },
      mutations: { retry: false },
    },
  });
}

const mockNavigation: any = {
  navigate: jest.fn(),
  goBack: jest.fn(),
  pop: jest.fn(),
};

function renderScreen(storeOptions: BuildStoreOptions = {}) {
  const store = buildStore(storeOptions);
  const queryClient = buildQueryClient();
  return render(
    <Provider store={store}>
      <QueryClientProvider client={queryClient}>
        <HousesOverview navigation={mockNavigation} />
      </QueryClientProvider>
    </Provider>
  );
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe("HousesOverview", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    dispatchedActions = [];
    // Default: query resolves with two houses, not loading
    mockUseHousesByAdmin.mockReturnValue({
      data: { "house-1": HOUSE_1, "house-2": HOUSE_2 },
      isLoading: false,
      isError: false,
      error: null,
    });
  });

  // ─── Smoke test ─────────────────────────────────────────────────────────────
  describe("render", () => {
    it("renders without crashing", () => {
      const { getByTestId } = renderScreen();
      expect(getByTestId("house-list-modal")).toBeTruthy();
    });

    it("renders the screen header", () => {
      const { getByTestId } = renderScreen();
      expect(getByTestId("screen-header")).toBeTruthy();
    });

    it('renders "My Houses" header text', () => {
      const { getByTestId } = renderScreen();
      expect(getByTestId("screen-header-text").props.children).toBe(
        "My Houses"
      );
    });
  });

  // ─── Loading state ──────────────────────────────────────────────────────────
  describe("loading state", () => {
    it("renders loading indicator when isLoading is true", () => {
      mockUseHousesByAdmin.mockReturnValue({
        data: null,
        isLoading: true,
        isError: false,
        error: null,
      });
      const { getByTestId } = renderScreen();
      expect(getByTestId("loading-indicator")).toBeTruthy();
    });

    it("renders loading indicator when user is null", () => {
      mockUseHousesByAdmin.mockReturnValue({
        data: null,
        isLoading: false,
        isError: false,
        error: null,
      });
      const { getByTestId } = renderScreen({ user: null });
      expect(getByTestId("loading-indicator")).toBeTruthy();
    });

    it("does not render house list while loading", () => {
      mockUseHousesByAdmin.mockReturnValue({
        data: null,
        isLoading: true,
        isError: false,
        error: null,
      });
      const { queryByTestId } = renderScreen();
      expect(queryByTestId("house-list-modal")).toBeNull();
    });
  });

  // ─── House list ──────────────────────────────────────────────────────────────
  describe("house list", () => {
    it("renders a section for each house", () => {
      const { getByTestId } = renderScreen();
      expect(getByTestId("house-option-house-1")).toBeTruthy();
      expect(getByTestId("house-option-house-2")).toBeTruthy();
    });

    it("renders house names", () => {
      const { getByText } = renderScreen();
      expect(getByText("Recovery House Alpha")).toBeTruthy();
      expect(getByText("Recovery House Beta")).toBeTruthy();
    });

    it("renders a single house when only one house exists", () => {
      mockUseHousesByAdmin.mockReturnValue({
        data: { "house-1": HOUSE_1 },
        isLoading: false,
        isError: false,
        error: null,
      });
      const { getByTestId, queryByTestId } = renderScreen();
      expect(getByTestId("house-option-house-1")).toBeTruthy();
      expect(queryByTestId("house-option-house-2")).toBeNull();
    });
  });

  // ─── Empty state ─────────────────────────────────────────────────────────────
  describe("empty state", () => {
    it("renders no house sections when there are no houses", () => {
      mockUseHousesByAdmin.mockReturnValue({
        data: {},
        isLoading: false,
        isError: false,
        error: null,
      });
      const { queryByTestId } = renderScreen();
      expect(queryByTestId("house-option-house-1")).toBeNull();
    });

    it("renders the list container even when empty", () => {
      mockUseHousesByAdmin.mockReturnValue({
        data: {},
        isLoading: false,
        isError: false,
        error: null,
      });
      const { getByTestId } = renderScreen();
      expect(getByTestId("house-list-modal")).toBeTruthy();
    });

    it("renders the list container when housesData is null", () => {
      mockUseHousesByAdmin.mockReturnValue({
        data: null,
        isLoading: false,
        isError: false,
        error: null,
      });
      const { getByTestId } = renderScreen();
      // null data, not loading, user present → renders main view (empty list)
      expect(getByTestId("house-list-modal")).toBeTruthy();
    });
  });

  // ─── House selection ─────────────────────────────────────────────────────────
  describe("house selection", () => {
    it("dispatches selectHouseById with the house id when a house row is pressed", () => {
      const { getByTestId } = renderScreen();
      fireEvent.press(getByTestId("house-option-house-1"));

      // Regression coverage for 2026-07-06: this used to assert a raw
      // {type: 'SELECT_HOUSE'} action that no reducer handled — the test
      // was written against the bug (house-switching was a complete no-op),
      // which is why it shipped unnoticed.
      const selectAction = dispatchedActions.find(
        (a) => a.type === "houses/selectHouseById"
      );
      expect(selectAction).toBeDefined();
      expect(selectAction.payload).toEqual(HOUSE_1.id);
    });

    it("calls navigation.pop() after selecting a house", () => {
      const { getByTestId } = renderScreen();
      fireEvent.press(getByTestId("house-option-house-1"));
      expect(mockNavigation.pop).toHaveBeenCalled();
    });

    it("selects the correct house when house-2 is pressed", () => {
      const { getByTestId } = renderScreen();
      fireEvent.press(getByTestId("house-option-house-2"));

      const selectAction = dispatchedActions.find(
        (a) => a.type === "houses/selectHouseById"
      );
      expect(selectAction).toBeDefined();
      expect(selectAction.payload).toEqual(HOUSE_2.id);
    });
  });

  // ─── Error state ─────────────────────────────────────────────────────────────
  describe("error state", () => {
    it("renders error message when query fails", () => {
      mockUseHousesByAdmin.mockReturnValue({
        data: null,
        isLoading: false,
        isError: true,
        error: new Error("Network error"),
      });
      const { getByText } = renderScreen();
      expect(getByText("Failed to load houses")).toBeTruthy();
    });

    it("does not render house sections in error state", () => {
      mockUseHousesByAdmin.mockReturnValue({
        data: null,
        isLoading: false,
        isError: true,
        error: new Error("Network error"),
      });
      const { queryByTestId } = renderScreen();
      expect(queryByTestId("house-option-house-1")).toBeNull();
    });
  });

  // ─── Help popover ─────────────────────────────────────────────────────────────
  describe("help popover", () => {
    it("calls showPopover when the help icon is pressed", () => {
      const { getByTestId } = renderScreen();
      fireEvent.press(getByTestId("help-icon"));
      expect(mockShowPopover).toHaveBeenCalledWith(
        "HOUSE LIST",
        expect.any(String)
      );
    });
  });
});
