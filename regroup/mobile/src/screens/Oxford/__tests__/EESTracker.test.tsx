/**
 * EESTracker Screen Tests
 *
 * Covers:
 * - Renders without crashing
 * - Loading state shows ActivityIndicator
 * - Empty state shows "No EES records" message and Generate button
 * - Summary card renders with week date and EES amount
 * - Records list renders paid/unpaid status badges
 * - Tapping an unpaid record calls markEESPaid
 * - Tapping a paid record does not call markEESPaid
 * - Generate EES Records button calls createEESRecords
 * - Alert shown when no residents exist for generation
 * - Pull-to-refresh reloads records
 */

// ─── useSelectedHouse mock ────────────────────────────────────────────────────
const mockUseSelectedHouse = jest.fn();

jest.mock("../../../hooks/useSelectedHouse", () => ({
  useSelectedHouse: () => mockUseSelectedHouse(),
}));

// ─── useOxfordGate mock — always-allow for screen-behavior tests ──────────────
jest.mock("../../../hooks/useOxfordGate", () => ({
  useOxfordGate: () => ({ allowed: true, houseId: "house-1" }),
}));

// ─── Navigation mock ──────────────────────────────────────────────────────────
jest.mock("@react-navigation/native-stack", () => ({}));

// ─── Firebase setup mock ──────────────────────────────────────────────────────
jest.mock("../../../../firebase-setup", () => ({
  firestore: {
    collection: jest.fn(() => ({
      doc: jest.fn(() => ({
        get: jest.fn(() =>
          Promise.resolve({ exists: false, data: () => null }),
        ),
        set: jest.fn(() => Promise.resolve()),
        update: jest.fn(() => Promise.resolve()),
        delete: jest.fn(() => Promise.resolve()),
      })),
      where: jest.fn().mockReturnThis(),
      orderBy: jest.fn().mockReturnThis(),
      limit: jest.fn().mockReturnThis(),
      get: jest.fn(() => Promise.resolve({ docs: [] })),
    })),
    batch: jest.fn(() => ({
      set: jest.fn(),
      update: jest.fn(),
      commit: jest.fn(() => Promise.resolve()),
    })),
  },
}));

// ─── EES service mocks ────────────────────────────────────────────────────────
const mockGetEESRecords = jest.fn();
const mockMarkEESPaid = jest.fn();
const mockCreateEESRecords = jest.fn();
const mockCalculateEES = jest.fn(
  (totalExpenses: number, residentCount: number) => {
    if (residentCount === 0) {
      return 0;
    }
    return Math.round((totalExpenses / residentCount) * 100) / 100;
  },
);

jest.mock("../../../services/oxford/ees", () => ({
  getEESRecords: (...args: any[]) => mockGetEESRecords(...args),
  markEESPaid: (...args: any[]) => mockMarkEESPaid(...args),
  calculateEES: (...args: any[]) =>
    mockCalculateEES(...(args as Parameters<typeof mockCalculateEES>)),
  createEESRecords: (...args: any[]) => mockCreateEESRecords(...args),
}));

// ─── Context mock ─────────────────────────────────────────────────────────────
jest.mock("../../../context", () => ({
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

// ─── Component stubs ──────────────────────────────────────────────────────────
jest.mock("../../../components/screen-header", () => {
  const { View, Text } = require("react-native");
  return ({ header }: any) => (
    <View testID="screen-header">
      <Text>{header}</Text>
    </View>
  );
});

jest.mock("../../../components/rats-scroll-view", () => {
  const { ScrollView } = require("react-native");
  return ScrollView;
});

jest.mock("../../../components/rats-text", () => ({
  RatsText: ({ text }: any) => {
    const { Text } = require("react-native");
    return <Text>{String(text ?? "")}</Text>;
  },
}));

jest.mock("../../../components/rats-button/rats-button", () => {
  const { TouchableOpacity, Text } = require("react-native");
  return ({ title, onPress, disabled }: any) => (
    <TouchableOpacity
      testID={`rats-button-${String(title ?? "")
        .toLowerCase()
        .replace(/\s+/g, "-")}`}
      onPress={onPress}
      disabled={disabled}
    >
      <Text>{title}</Text>
    </TouchableOpacity>
  );
});

// ─── React imports (after mocks) ──────────────────────────────────────────────
import React from "react";
import { render, fireEvent, waitFor, act } from "@testing-library/react-native";
import { Provider } from "react-redux";
import { configureStore } from "@reduxjs/toolkit";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Alert } from "react-native";

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

import EESTracker from "../EESTracker";

// ─── Fixtures ─────────────────────────────────────────────────────────────────

const BASE_HOUSE: any = {
  id: "house-1",
  name: "Oxford Recovery House",
  adminIds: [],
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
  currentCapacity: 4,
  maximumCapacity: 8,
  code: "OXF01",
  avatar: "",
  imageUrl: "",
  depositsAndFees: 0,
  certified: true,
  phoneNumber: "5551234567",
  rentFrequency: "both",
  subscriptionStatus: "active",
  isDemoHouse: false,
  houseType: "oxford",
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
  baths: 2,
  wifi: true,
  rating: 5,
  createdDate: "2024-01-01",
  lastUpdated: "2024-01-01",
};

const GUEST_1: any = {
  id: "guest-1",
  firstName: "Alice",
  lastName: "Smith",
  avatar: "",
  email: "alice@example.com",
  houseId: "house-1",
};

const GUEST_2: any = {
  id: "guest-2",
  firstName: "Bob",
  lastName: "Jones",
  avatar: "",
  email: "bob@example.com",
  houseId: "house-1",
};

const makeEESRecord = (overrides: any = {}) => ({
  id: "record-1",
  guestId: "guest-1",
  houseId: "house-1",
  weekStart: "2026-02-16",
  amount: 125.0,
  paid: false,
  ...overrides,
});

// ─── Store builder ─────────────────────────────────────────────────────────────

function buildStore(guests: Record<string, any> = {}, house = BASE_HOUSE) {
  mockUseSelectedHouse.mockReturnValue({
    house,
    houseId: house?.id ?? null,
    isLoading: false,
  });
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
    preloadedState: {
      houses: {
        selectedHouse: house,
        houses: { "house-1": house },
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
        guests,
        selectedGuest: null,
        userAsGuest: null,
        status: "idle",
        error: null,
        updateStatus: "idle",
        createStatus: "idle",
        deleteStatus: "idle",
        customizePhaseStatus: "idle",
      } as any,
      user: {
        user: { id: "user-1", firstName: "Admin", lastName: "User" },
        loading: false,
        error: null,
        loggedIn: true,
        loggingIn: false,
        loggingInFailed: false,
        signingUp: false,
        signingUpFailed: false,
      } as any,
    },
  });
}

const mockNavigation: any = { goBack: jest.fn(), navigate: jest.fn() };

function renderScreen(guests: Record<string, any> = {}, house = BASE_HOUSE) {
  const store = buildStore(guests, house);
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 } },
  });
  // After A2 migration screens read guests via useGuests(houseId). Mirror
  // the test fixture into the React Query cache. See .full-review [A2].
  if (house?.id) {
    queryClient.setQueryData(["guests", "list", house.id], guests);
  }
  return render(
    <QueryClientProvider client={queryClient}>
      <Provider store={store}>
        <EESTracker navigation={mockNavigation} />
      </Provider>
    </QueryClientProvider>,
  );
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe("EESTracker", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.spyOn(Alert, "alert");
    mockGetEESRecords.mockResolvedValue([]);
    mockMarkEESPaid.mockResolvedValue(undefined);
    mockCreateEESRecords.mockResolvedValue(undefined);
  });

  // ─── Smoke test ───────────────────────────────────────────────────────────
  describe("render", () => {
    it("renders without crashing", async () => {
      const { getByText } = renderScreen();
      await waitFor(() => {
        expect(getByText("Equal Expense Share")).toBeTruthy();
      });
    });

    it("renders the screen header", async () => {
      const { getByTestId } = renderScreen();
      await waitFor(() => {
        expect(getByTestId("screen-header")).toBeTruthy();
      });
    });
  });

  // ─── Loading state ────────────────────────────────────────────────────────
  describe("loading state", () => {
    it("renders ActivityIndicator while loading", () => {
      mockGetEESRecords.mockReturnValue(new Promise(() => {}));
      const { UNSAFE_getByType } = renderScreen();
      const { ActivityIndicator } = require("react-native");
      expect(UNSAFE_getByType(ActivityIndicator)).toBeTruthy();
    });

    it("renders screen header text in loading state", () => {
      mockGetEESRecords.mockReturnValue(new Promise(() => {}));
      const { getByText } = renderScreen();
      expect(getByText("Equal Expense Share")).toBeTruthy();
    });
  });

  // ─── Empty state ──────────────────────────────────────────────────────────
  describe("empty state", () => {
    it('shows "No EES records for this week" when no records exist', async () => {
      mockGetEESRecords.mockResolvedValue([]);
      const { getByText } = renderScreen();
      await waitFor(() => {
        expect(getByText("No EES records for this week.")).toBeTruthy();
      });
    });

    it("renders Generate EES Records button when no records exist", async () => {
      mockGetEESRecords.mockResolvedValue([]);
      const { getByText } = renderScreen({ "guest-1": GUEST_1 });
      await waitFor(() => {
        expect(getByText("Generate EES Records")).toBeTruthy();
      });
    });
  });

  // ─── Summary card ─────────────────────────────────────────────────────────
  describe("summary card", () => {
    it("renders EES Amount in summary card", async () => {
      mockGetEESRecords.mockResolvedValue([]);
      const { getByText } = renderScreen();
      await waitFor(() => {
        expect(getByText(/EES Amount:/)).toBeTruthy();
      });
    });

    it("renders resident count in summary card", async () => {
      mockGetEESRecords.mockResolvedValue([]);
      const { getByText } = renderScreen();
      await waitFor(() => {
        expect(getByText(/residents/)).toBeTruthy();
      });
    });

    it("uses actual resident count, not bed capacity, when occupancy is below capacity", async () => {
      // House has 4 beds but only 2 residents currently live there. The
      // preview shown to the admin must reflect who is actually being
      // billed (guestList.length) — matching handleCreateRecords — not how
      // many beds theoretically exist (house.currentCapacity).
      mockGetEESRecords.mockResolvedValue([]);
      const house = { ...BASE_HOUSE, currentCapacity: 4 };
      const { getByText, queryByText } = renderScreen(
        { "guest-1": GUEST_1, "guest-2": GUEST_2 },
        house,
      );
      await waitFor(() => {
        expect(getByText(/residents/)).toBeTruthy();
      });
      expect(getByText(/^2 residents/)).toBeTruthy();
      expect(queryByText(/^4 residents/)).toBeNull();
    });

    it("passes the actual resident count (not bed capacity) into calculateEES for the preview", async () => {
      mockGetEESRecords.mockResolvedValue([]);
      const house = { ...BASE_HOUSE, currentCapacity: 4 };
      renderScreen({ "guest-1": GUEST_1, "guest-2": GUEST_2 }, house);

      await waitFor(() => {
        expect(mockCalculateEES).toHaveBeenCalled();
      });

      // The preview call (before any record-generation) must divide by the
      // same resident count that handleCreateRecords uses.
      const previewCall = mockCalculateEES.mock.calls[0];
      expect(previewCall[1]).toBe(2);
    });

    it("shows a capacity-mismatch warning when resident count exceeds bed capacity", async () => {
      mockGetEESRecords.mockResolvedValue([]);
      const house = { ...BASE_HOUSE, currentCapacity: 1 };
      const { getByText } = renderScreen(
        { "guest-1": GUEST_1, "guest-2": GUEST_2 },
        house,
      );
      await waitFor(() => {
        expect(getByText(/exceeds/i)).toBeTruthy();
      });
    });
  });

  // ─── Records list ─────────────────────────────────────────────────────────
  describe("records list", () => {
    it("renders records when data exists", async () => {
      const records = [
        makeEESRecord({ id: "record-1", guestId: "guest-1", paid: false }),
        makeEESRecord({
          id: "record-2",
          guestId: "guest-2",
          paid: true,
          paidAt: "2026-02-17T10:00:00Z",
        }),
      ];
      mockGetEESRecords.mockResolvedValue(records);
      const { getByText } = renderScreen({
        "guest-1": GUEST_1,
        "guest-2": GUEST_2,
      });
      await waitFor(() => {
        expect(getByText("Alice Smith")).toBeTruthy();
        expect(getByText("Bob Jones")).toBeTruthy();
      });
    });

    it("renders UNPAID badge for unpaid records", async () => {
      const records = [makeEESRecord({ id: "record-1", paid: false })];
      mockGetEESRecords.mockResolvedValue(records);
      const { getByText } = renderScreen({ "guest-1": GUEST_1 });
      await waitFor(() => {
        expect(getByText("UNPAID")).toBeTruthy();
      });
    });

    it("renders PAID badge for paid records", async () => {
      const records = [
        makeEESRecord({
          id: "record-1",
          paid: true,
          paidAt: "2026-02-17T10:00:00Z",
        }),
      ];
      mockGetEESRecords.mockResolvedValue(records);
      const { getByText } = renderScreen({ "guest-1": GUEST_1 });
      await waitFor(() => {
        expect(getByText("PAID")).toBeTruthy();
      });
    });

    it('renders "Unknown Resident" for records with unknown guestId', async () => {
      const records = [
        makeEESRecord({
          id: "record-1",
          guestId: "unknown-guest",
          paid: false,
        }),
      ];
      mockGetEESRecords.mockResolvedValue(records);
      const { getByText } = renderScreen({});
      await waitFor(() => {
        expect(getByText("Unknown Resident")).toBeTruthy();
      });
    });

    it('renders "Tap a record to mark as paid" hint text', async () => {
      const records = [makeEESRecord({ id: "record-1", paid: false })];
      mockGetEESRecords.mockResolvedValue(records);
      const { getByText } = renderScreen({ "guest-1": GUEST_1 });
      await waitFor(() => {
        expect(getByText("Tap a record to mark as paid")).toBeTruthy();
      });
    });
  });

  // ─── Mark as paid interaction ─────────────────────────────────────────────
  describe("mark as paid", () => {
    it("calls markEESPaid when an unpaid record is tapped", async () => {
      const records = [
        makeEESRecord({ id: "record-1", guestId: "guest-1", paid: false }),
      ];
      mockGetEESRecords.mockResolvedValue(records);
      const { getByText } = renderScreen({ "guest-1": GUEST_1 });

      await waitFor(() => {
        expect(getByText("Alice Smith")).toBeTruthy();
      });

      await act(async () => {
        fireEvent.press(getByText("Alice Smith"));
      });

      await waitFor(() => {
        expect(mockMarkEESPaid).toHaveBeenCalledWith("record-1");
      });
    });

    it("does not call markEESPaid when a paid record is tapped", async () => {
      const records = [
        makeEESRecord({
          id: "record-1",
          guestId: "guest-1",
          paid: true,
          paidAt: "2026-02-17T10:00:00Z",
        }),
      ];
      mockGetEESRecords.mockResolvedValue(records);
      const { getByText } = renderScreen({ "guest-1": GUEST_1 });

      await waitFor(() => {
        expect(getByText("Alice Smith")).toBeTruthy();
      });

      await act(async () => {
        fireEvent.press(getByText("Alice Smith"));
      });

      expect(mockMarkEESPaid).not.toHaveBeenCalled();
    });

    it("shows error alert when markEESPaid fails", async () => {
      mockMarkEESPaid.mockRejectedValueOnce(new Error("Network error"));
      const records = [
        makeEESRecord({ id: "record-1", guestId: "guest-1", paid: false }),
      ];
      mockGetEESRecords.mockResolvedValue(records);
      const { getByText } = renderScreen({ "guest-1": GUEST_1 });

      await waitFor(() => {
        expect(getByText("Alice Smith")).toBeTruthy();
      });

      await act(async () => {
        fireEvent.press(getByText("Alice Smith"));
      });

      await waitFor(() => {
        expect(Alert.alert).toHaveBeenCalledWith(
          "Error",
          expect.stringContaining("Failed to mark as paid"),
        );
      });
    });
  });

  // ─── Generate EES Records ─────────────────────────────────────────────────
  describe("generate EES records", () => {
    it("calls createEESRecords when Generate button is pressed with residents", async () => {
      mockGetEESRecords.mockResolvedValue([]);
      const { getByText } = renderScreen({
        "guest-1": GUEST_1,
        "guest-2": GUEST_2,
      });

      await waitFor(() => {
        expect(getByText("Generate EES Records")).toBeTruthy();
      });

      await act(async () => {
        fireEvent.press(getByText("Generate EES Records"));
      });

      await waitFor(() => {
        expect(mockCreateEESRecords).toHaveBeenCalledWith(
          "house-1",
          expect.any(String),
          expect.arrayContaining(["guest-1", "guest-2"]),
          expect.any(Number),
        );
      });
    });

    it('shows "No Residents" alert when Generate is pressed with no guests', async () => {
      mockGetEESRecords.mockResolvedValue([]);
      const { getByText } = renderScreen({});

      await waitFor(() => {
        expect(getByText("Generate EES Records")).toBeTruthy();
      });

      await act(async () => {
        fireEvent.press(getByText("Generate EES Records"));
      });

      expect(Alert.alert).toHaveBeenCalledWith(
        "No Residents",
        expect.stringContaining("No residents found"),
      );
    });

    it("shows error alert when createEESRecords fails", async () => {
      mockCreateEESRecords.mockRejectedValueOnce(new Error("Server error"));
      mockGetEESRecords.mockResolvedValue([]);
      const { getByText } = renderScreen({ "guest-1": GUEST_1 });

      await waitFor(() => {
        expect(getByText("Generate EES Records")).toBeTruthy();
      });

      await act(async () => {
        fireEvent.press(getByText("Generate EES Records"));
      });

      await waitFor(() => {
        expect(Alert.alert).toHaveBeenCalledWith(
          "Error",
          expect.stringContaining("Failed to create EES records"),
        );
      });
    });
  });

  // ─── Refresh ──────────────────────────────────────────────────────────────
  describe("refresh", () => {
    it("calls getEESRecords again when pull-to-refresh fires", async () => {
      mockGetEESRecords.mockResolvedValue([]);
      const { getByText, UNSAFE_root } = renderScreen();

      // Wait for the ready branch — that's the only branch where
      // RatsScrollView gets the `refreshControl` prop (EESTracker.tsx:207-214).
      // The loading branch does not.
      await waitFor(() => {
        expect(getByText("No EES records for this week.")).toBeTruthy();
      });

      // `refreshControl` is a React element passed via the ScrollView's
      // `refreshControl` prop. Locate the first node that carries it, then
      // invoke the prop's `onRefresh` callback directly.
      const scrollNode = UNSAFE_root.findAll(
        (node: any) =>
          node.props &&
          node.props.refreshControl &&
          typeof node.props.refreshControl === "object",
      )[0];
      expect(scrollNode).toBeTruthy();
      await act(async () => {
        scrollNode.props.refreshControl.props.onRefresh();
      });

      expect(mockGetEESRecords).toHaveBeenCalledTimes(2);
    });
  });
});
