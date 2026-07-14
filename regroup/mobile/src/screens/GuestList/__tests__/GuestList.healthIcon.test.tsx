/**
 * GuestList health icon regression test
 *
 * Bug: GuestList.tsx called getOverallPercentage(guest, house, date) with only
 * 3 args. getOverallPercentage's `weekStats` param (5th arg) was never
 * supplied, so the function's `if (!weekStats) return 0;` guard fired on
 * every guest, which always maps to the worst ("frown-open" / SAD) health
 * icon regardless of the guest's actual compliance.
 *
 * This test does NOT mock `util/guest` (unlike GuestList.test.tsx), so the
 * real getOverallPercentage/getHealthByPercentage functions run against
 * mocked weekStats data, proving the icon reflects real guest activity.
 */

// ─── useSelectedHouse mock ────────────────────────────────────────────────────
const mockUseSelectedHouse = jest.fn();

jest.mock("../../../hooks/useSelectedHouse", () => ({
  useSelectedHouse: () => mockUseSelectedHouse(),
}));

// ─── Navigation mock ──────────────────────────────────────────────────────────
jest.mock("@react-navigation/native-stack", () => ({}));
jest.mock("@react-navigation/native", () => ({
  useFocusEffect: jest.fn(),
  useNavigation: () => ({ navigate: jest.fn(), goBack: jest.fn() }),
}));

// ─── Context mock ─────────────────────────────────────────────────────────────
jest.mock("../../../context", () => ({
  useNotification: () => ({
    showPopover: jest.fn(),
    setPopoverRef: jest.fn(),
    notify: jest.fn(),
  }),
  useModal: () => ({
    showFormModal: jest.fn(),
    dismissFormModal: jest.fn(),
    setLoadingModalState: jest.fn(),
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

// ─── useCurrentWeek mock ──────────────────────────────────────────────────────
const WEEK_START = "2026-02-16";
jest.mock("../../../hooks/activity/useCurrentWeek", () => ({
  useCurrentWeek: () => ({
    startDate: WEEK_START,
    endDate: "2026-02-22",
    weekNumber: 8,
    year: 2026,
  }),
}));

// ─── React Query hooks mock ───────────────────────────────────────────────────
const mockUseGuests = jest.fn();
const mockUseWeekSummary = jest.fn();

jest.mock("../../../state/queries", () => ({
  useGuests: (...args: any[]) => mockUseGuests(...args),
  useGuest: jest.fn(() => ({ data: null, isLoading: false, error: null })),
  useWeekSummary: (...args: any[]) => mockUseWeekSummary(...args),
}));

// ─── Compliance indicator stub (unrelated to this bug) ────────────────────────
jest.mock("../../../components/compliance-indicator", () => ({
  GuestComplianceDot: ({ testID }: any) => {
    const { View } = require("react-native");
    return <View testID={testID || "compliance-dot"} />;
  },
}));

// ─── Component stubs ──────────────────────────────────────────────────────────
jest.mock("../../../components/screen-header", () => {
  const { View, Text } = require("react-native");
  return ({ header, icon }: any) => (
    <View testID="screen-header">
      <Text>{header}</Text>
      {icon || null}
    </View>
  );
});

jest.mock("../../../components/rats-scroll-view", () => {
  const { ScrollView } = require("react-native");
  return (props: any) => {
    const { testID, children, contentContainerStyle, ...rest } = props;
    return (
      <ScrollView testID={testID} {...rest}>
        {children}
      </ScrollView>
    );
  };
});

jest.mock("../../../components/help-icon", () => {
  const { TouchableOpacity } = require("react-native");
  return ({ helpFn, setRef }: any) => (
    <TouchableOpacity testID="help-icon" onPress={helpFn} ref={setRef} />
  );
});

// Stub Section but surface the computed iconName/iconColor props so we can
// assert on the *real* health calculation performed by GuestList.
jest.mock("../../../components/rats-interactable-section", () => {
  const { TouchableOpacity, Text } = require("react-native");
  return ({ name, onPress, testID, iconName, iconColor }: any) => (
    <TouchableOpacity testID={testID || `section-${name}`} onPress={onPress}>
      <Text>{name}</Text>
      <Text testID={`health-icon-name-${name}`}>{iconName}</Text>
      <Text testID={`health-icon-color-${name}`}>{iconColor}</Text>
    </TouchableOpacity>
  );
});

jest.mock("../../../components/rats-text", () => ({
  RatsText: ({ text }: any) => {
    const { Text } = require("react-native");
    return <Text>{text || ""}</Text>;
  },
}));

// ─── React imports (after mocks) ──────────────────────────────────────────────
import React from "react";
import { render } from "@testing-library/react-native";
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

import GuestList from "../GuestList";

// ─── Fixtures ─────────────────────────────────────────────────────────────────

const HOUSE: any = {
  id: "house123",
  name: "Test House",
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
  // Only "meeting" and "metPrimarySupporter" are active stats for this
  // guest's phase (chore/medications/work requirements disabled).
  phases: {
    Default: {
      name: "Default",
      order: 1,
      rules: {
        meetings: 2,
        nightsOutAllowed: 0,
        supporter: true,
        work: 0,
        chore: false,
        medications: false,
      },
    },
  },
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
};

// Fully compliant guest: met both active requirements this week.
const COMPLIANT_GUEST: any = {
  id: "guest1",
  houseId: "house123",
  firstName: "John",
  lastName: "Doe",
  email: "john@test.com",
  avatar: null,
  phase: "Default",
  createdDate: new Date("2024-01-01"),
};

const MOCK_GUESTS_DATA = {
  guest1: COMPLIANT_GUEST,
};

// ─── Store builder ─────────────────────────────────────────────────────────────

function buildStore() {
  mockUseSelectedHouse.mockReturnValue({
    house: HOUSE,
    houseId: HOUSE.id,
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
        selectedHouse: HOUSE,
        houses: { [HOUSE.id]: HOUSE },
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
        user: {
          id: "user-1",
          firstName: "Admin",
          lastName: "User",
          isAdmin: true,
        },
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

function buildQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: { retry: false, gcTime: 0 },
      mutations: { retry: false },
    },
  });
}

const mockNavigation: any = {
  goBack: jest.fn(),
  navigate: jest.fn(),
};

function renderScreen() {
  const store = buildStore();
  const queryClient = buildQueryClient();
  return render(
    <Provider store={store}>
      <QueryClientProvider client={queryClient}>
        <GuestList navigation={mockNavigation} />
      </QueryClientProvider>
    </Provider>,
  );
}

describe("GuestList health icon", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockUseGuests.mockReturnValue({
      data: MOCK_GUESTS_DATA,
      isLoading: false,
      isError: false,
      error: null,
      refetch: jest.fn(),
    });
  });

  it("renders a real (non-worst-case) health icon for a fully compliant guest", () => {
    // Guest met both active requirements (2 meetings, primary supporter met)
    // for the current week — this should NOT be treated as the worst status.
    mockUseWeekSummary.mockImplementation(
      (guestId: string, weekStart: string, enabled: boolean) => {
        if (!enabled || guestId !== "guest1" || weekStart !== WEEK_START) {
          return { data: undefined, isLoading: false, error: null };
        }
        return {
          data: {
            id: `${guestId}_${weekStart}`,
            guestId,
            houseId: "house123",
            startDate: weekStart,
            endDate: "2026-02-22",
            stats: {
              meetingsAttended: 2,
              choresCompleted: 0,
              hoursWorked: 0,
              medicationTaken: 0,
              primarySupporterMet: 1,
            },
            dailyStats: {},
            lastUpdated: null,
            activityCount: 3,
          },
          isLoading: false,
          error: null,
        };
      },
    );

    const { getByTestId } = renderScreen();

    // GuestList must have actually wired up the per-guest weekStats query.
    expect(mockUseWeekSummary).toHaveBeenCalledWith(
      "guest1",
      WEEK_START,
      expect.anything(),
    );

    const iconName = getByTestId("health-icon-name-John Doe").props.children;
    const iconColor = getByTestId("health-icon-color-John Doe").props.children;

    // The bug always produced HEALTH_ICON_MAP[SAD] = "frown-open" because
    // weekStats was never passed through to getOverallPercentage.
    expect(iconName).not.toBe("frown-open");
    // Fully compliant (100%) maps to the best health icon.
    expect(iconName).toBe("laugh-beam");
    expect(iconColor).not.toBe("#d50000"); // not the SAD/red color
  });
});
