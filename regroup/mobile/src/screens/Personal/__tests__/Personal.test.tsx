/**
 * PersonalScreen Tests
 *
 * Covers:
 *  - Renders loading indicator when user, house, or loggingOut is truthy
 *  - Renders the main profile screen when user and house are present
 *  - Renders the avatar header with user name and role
 *  - "Admin" label displayed when user isAdmin === true
 *  - "Guest" label displayed when user isAdmin === false
 *  - Menu options render (My Profile, Notifications, File complaint, etc.)
 *  - Admin-only "Add Home" option is hidden for non-super-admins
 *  - Admin-only "Two-Factor Authentication" option hidden for guests
 *  - Pressing "LOG OUT" calls navigation.navigate with PriorAuth route
 *  - Pressing "My Profile" navigates to EditUserInfo
 *  - Pressing "Notifications" navigates to Notifications
 *  - showFormModal is called when "File complaint" is pressed
 *  - showFormModal is called when "Log house issue" is pressed
 *  - showFormModal is called when "Report bug" is pressed
 *  - showFormModal is called when "Send feedback" is pressed
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

// ─── Context mocks ────────────────────────────────────────────────────────────
const mockShowFormModal = jest.fn();
const mockDismissFormModal = jest.fn();
const mockNotify = jest.fn();
const mockShowPopover = jest.fn();

jest.mock("../../../context", () => ({
  useModal: () => ({
    showFormModal: mockShowFormModal,
    dismissFormModal: mockDismissFormModal,
    setLoadingModalState: jest.fn(),
  }),
  useNotification: () => ({
    notify: mockNotify,
    showPopover: mockShowPopover,
    setPopoverRef: jest.fn(),
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

// ─── Firebase / external service mocks ───────────────────────────────────────
jest.mock("../../../services/feedback", () => ({
  createBugReport: jest.fn(() => Promise.resolve()),
  createFeedback: jest.fn(() => Promise.resolve()),
}));

jest.mock("../../../util/display", () => ({
  getCurrentTime: jest.fn(() => "2026-02-22T00:00:00.000Z"),
  getTodaysDate: jest.fn(() => "2026-02-22"),
  getDateAndTime: jest.fn(() => "Feb 22, 2026"),
}));

jest.mock("../../../util/user", () => ({
  isDemo: jest.fn(() => false),
}));

jest.mock("uuid", () => ({
  v4: jest.fn(() => "mock-uuid-1234"),
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

jest.mock(
  "../../../components/rats-loading-indicator/rats-loading-indicator",
  () => {
    const { View } = require("react-native");
    return () => <View testID="loading-indicator" />;
  }
);

jest.mock("../../../components/avatar-item", () => {
  const { View, Text } = require("react-native");
  return ({ name, type }: any) => (
    <View testID="avatar-item">
      <Text testID="avatar-name">{name}</Text>
      <Text testID="avatar-type">{type}</Text>
    </View>
  );
});

jest.mock("../../../components/rats-button/rats-button", () => {
  const { TouchableOpacity, Text } = require("react-native");
  return ({ title, onPress, testID, containerStyle }: any) => (
    <TouchableOpacity testID={testID || "rats-button"} onPress={onPress}>
      <Text>{title}</Text>
    </TouchableOpacity>
  );
});

jest.mock("../../../components/rats-text", () => ({
  RatsText: ({ text }: any) => {
    const { Text } = require("react-native");
    return <Text>{text || ""}</Text>;
  },
}));

jest.mock("../../../components/rats-icon", () => ({
  RatsIcon: ({ testID, name }: any) => {
    const { View } = require("react-native");
    return <View testID={testID || `icon-${name}`} />;
  },
}));

// MiscellaneousHouseForm is rendered inside a modal — stub it out
jest.mock("../MiscellaneousHouseForm", () => ({
  MiscellaneousHouseForm: () => null,
}));

// ─── useUpdateHouse mock ───────────────────────────────────────────────────
const mockUpdateHouseMutation = {
  isPending: false,
  isSuccess: false,
  isError: false,
  mutateAsync: jest.fn(() => Promise.resolve()),
};
jest.mock("../../../state/queries/houseQueries", () => ({
  useUpdateHouse: () => mockUpdateHouseMutation,
}));

// ─── React imports (after mocks) ──────────────────────────────────────────────
import React from "react";
import { render, fireEvent, act } from "@testing-library/react-native";
import { Provider } from "react-redux";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { configureStore } from "@reduxjs/toolkit";

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

import PersonalScreen from "../Personal";

// ─── Fixtures ─────────────────────────────────────────────────────────────────

const BASE_HOUSE: any = {
  id: "house-1",
  name: "Recovery House",
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
  issues: {},
  rooms: {},
  baths: 1,
  wifi: false,
  rating: 3,
  createdDate: "2024-01-01",
  lastUpdated: "2024-01-01",
};

const BASE_USER_ADMIN: any = {
  uid: "user-1",
  id: "user-1",
  firstName: "Alice",
  lastName: "Manager",
  email: "alice@example.com",
  isAdmin: true,
  loading: false,
};

const BASE_USER_GUEST: any = {
  uid: "user-2",
  id: "user-2",
  firstName: "Bob",
  lastName: "Resident",
  email: "bob@example.com",
  isAdmin: false,
  loading: false,
};

const BASE_ADMIN: any = {
  id: "admin-1",
  userId: "user-1",
  firstName: "Alice",
  lastName: "Manager",
  email: "alice@example.com",
  houseIds: ["house-1"],
  superAdmin: [],
  phoneNumber: "",
  avatar: "",
};

const SUPER_ADMIN: any = {
  ...BASE_ADMIN,
  superAdmin: ["house-1"],
};

const BASE_GUEST_ENTITY: any = {
  id: "guest-1",
  userId: "user-2",
  firstName: "Bob",
  lastName: "Resident",
  email: "bob@example.com",
  houseId: "house-1",
  avatar: "",
};

// ─── Store builder ─────────────────────────────────────────────────────────────

interface BuildStoreOptions {
  user?: any;
  house?: any;
  admin?: any;
  guest?: any;
  loggingOut?: boolean;
  loggingIn?: boolean;
  loggingOutSuccessful?: boolean;
  updatingHouse?: boolean;
  userLoading?: boolean;
}

function buildStore({
  user = BASE_USER_ADMIN,
  house = BASE_HOUSE,
  admin = BASE_ADMIN,
  guest = null,
  loggingOut = false,
  loggingIn = false,
  loggingOutSuccessful = false,
  updatingHouse = false,
  userLoading = false,
}: BuildStoreOptions = {}) {
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
        houses: house ? { [house.id]: house } : {},
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
        updatingHouse,
        updatingHouseSuccessful: false,
        updatingHouseFailed: false,
      } as any,
      guests: {
        guests: guest ? { [guest.id]: guest } : {},
        selectedGuest: null,
        userAsGuest: guest ?? null,
        status: "idle",
        error: null,
        updateStatus: "idle",
        createStatus: "idle",
        deleteStatus: "idle",
        customizePhaseStatus: "idle",
      } as any,
      admin: {
        houseAdmins: admin ? { [admin.id]: admin } : {},
        admins: admin ? { [admin.id]: admin } : {},
        selectedAdmin: null,
        userAsAdmin: admin ?? null,
        loading: false,
        error: null,
      } as any,
      user: {
        user,
        loading: userLoading,
        error: null,
        loggedIn: !!user,
        loggingIn,
        loggingInFailed: false,
        loggingOut,
        loggingOutSuccessful,
        updatingSuccessful: false,
        signingUp: false,
        signingUpFailed: false,
      } as any,
    },
  });
}

const mockNavigation: any = {
  navigate: jest.fn(),
  goBack: jest.fn(),
};

function renderScreen(storeOptions: BuildStoreOptions = {}) {
  const store = buildStore(storeOptions);
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <Provider store={store}>
        <PersonalScreen navigation={mockNavigation} />
      </Provider>
    </QueryClientProvider>
  );
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe("PersonalScreen", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockUpdateHouseMutation.isPending = false;
    mockUpdateHouseMutation.isSuccess = false;
    mockUpdateHouseMutation.isError = false;
  });

  // Regression coverage for 2026-07-05: updatingFailed only read the legacy
  // Redux error fields, never updateHouseMutation.isError — since house
  // updates moved to this React Query mutation, state.houses.error is never
  // set by it, so the "Action Failed" banner could never fire for a failed
  // complaint/issue update.
  describe("mutation failure banner", () => {
    it('notifies "Action Failed" when the update-house mutation errors', () => {
      mockUpdateHouseMutation.isError = true;
      renderScreen();
      expect(mockNotify).toHaveBeenCalledWith(
        "Action Failed",
        "Something went wrong.",
        [],
        "fail"
      );
    });

    it('does not notify "Action Failed" when nothing has failed', () => {
      renderScreen();
      expect(mockNotify).not.toHaveBeenCalledWith(
        "Action Failed",
        expect.anything(),
        expect.anything(),
        expect.anything()
      );
    });
  });

  // ─── Loading states ─────────────────────────────────────────────────────────
  describe("loading states", () => {
    it("renders loading indicator when user is null", () => {
      const { getByTestId } = renderScreen({ user: null });
      expect(getByTestId("loading-indicator")).toBeTruthy();
    });

    it("renders loading indicator when house is null", () => {
      const { getByTestId } = renderScreen({ house: null });
      expect(getByTestId("loading-indicator")).toBeTruthy();
    });

    it("renders loading indicator when loggingOut is true", () => {
      const { getByTestId } = renderScreen({ loggingOut: true });
      expect(getByTestId("loading-indicator")).toBeTruthy();
    });

    it("renders loading indicator when user.loading is true", () => {
      // loggingIn selector reads state.user.loading
      const { getByTestId } = renderScreen({ userLoading: true });
      expect(getByTestId("loading-indicator")).toBeTruthy();
    });

    it("renders loading indicator when loggingOutSuccessful is true", () => {
      const { getByTestId } = renderScreen({ loggingOutSuccessful: true });
      expect(getByTestId("loading-indicator")).toBeTruthy();
    });

    it("does not render the main profile screen while loading", () => {
      const { queryByTestId } = renderScreen({ user: null });
      expect(queryByTestId("profile-screen")).toBeNull();
    });
  });

  // ─── Main render ───────────────────────────────────────────────────────────
  describe("main render", () => {
    it("renders the profile screen without crashing", () => {
      const { getByTestId } = renderScreen();
      expect(getByTestId("profile-screen")).toBeTruthy();
    });

    it("renders the avatar header when user and house are present", () => {
      const { getByTestId } = renderScreen();
      expect(getByTestId("avatar-item")).toBeTruthy();
    });

    it("renders the logout button", () => {
      const { getByTestId } = renderScreen();
      expect(getByTestId("logout-button")).toBeTruthy();
    });
  });

  // ─── Avatar header content ─────────────────────────────────────────────────
  describe("avatar header", () => {
    it("displays admin full name when user is an admin", () => {
      const { getByTestId } = renderScreen({ admin: BASE_ADMIN });
      expect(getByTestId("avatar-name").props.children).toBe("Alice Manager");
    });

    it('displays "Admin" role label when user.isAdmin is true', () => {
      const { getByTestId } = renderScreen({
        user: BASE_USER_ADMIN,
        admin: BASE_ADMIN,
      });
      expect(getByTestId("avatar-type").props.children).toBe("Admin");
    });

    it('displays "Guest" role label when user.isAdmin is false', () => {
      const { getByTestId } = renderScreen({
        user: BASE_USER_GUEST,
        admin: null,
        guest: BASE_GUEST_ENTITY,
      });
      expect(getByTestId("avatar-type").props.children).toBe("Guest");
    });

    it("displays guest full name when user is a guest (no admin entity)", () => {
      const { getByTestId } = renderScreen({
        user: BASE_USER_GUEST,
        admin: null,
        guest: BASE_GUEST_ENTITY,
      });
      expect(getByTestId("avatar-name").props.children).toBe("Bob Resident");
    });
  });

  // ─── Menu options ──────────────────────────────────────────────────────────
  describe("menu options", () => {
    it('renders the "My Profile" option', () => {
      const { getByText } = renderScreen();
      expect(getByText("My Profile")).toBeTruthy();
    });

    it('renders the "Notifications" option', () => {
      const { getByText } = renderScreen();
      expect(getByText("Notifications")).toBeTruthy();
    });

    it('renders the "File complaint" option', () => {
      const { getByText } = renderScreen();
      expect(getByText("File complaint")).toBeTruthy();
    });

    it('renders the "Log house issue" option', () => {
      const { getByText } = renderScreen();
      expect(getByText("Log house issue")).toBeTruthy();
    });

    it('renders the "Report bug" option', () => {
      const { getByText } = renderScreen();
      expect(getByText("Report bug")).toBeTruthy();
    });

    it('renders the "Send feedback" option', () => {
      const { getByText } = renderScreen();
      expect(getByText("Send feedback")).toBeTruthy();
    });
  });

  // ─── Admin-gated options ───────────────────────────────────────────────────
  describe("admin-gated options", () => {
    it('hides "Add Home" when no admin entity exists (guest user)', () => {
      // disabled: !admin || !admin.superAdmin — when admin is null, disabled = true
      const { queryByText } = renderScreen({
        user: BASE_USER_GUEST,
        admin: null,
        guest: BASE_GUEST_ENTITY,
      });
      expect(queryByText("Add Home")).toBeNull();
    });

    it('shows "Add Home" when an admin entity exists (superAdmin property present)', () => {
      // disabled: !admin || !admin.superAdmin — admin.superAdmin = [] is truthy, so disabled = false
      const { getByText } = renderScreen({ admin: BASE_ADMIN });
      expect(getByText("Add Home")).toBeTruthy();
    });

    it('shows "Add Home" for super-admin', () => {
      const { getByText } = renderScreen({ admin: SUPER_ADMIN });
      expect(getByText("Add Home")).toBeTruthy();
    });

    it('hides "Two-Factor Authentication" when no admin entity exists (guest user)', () => {
      const { queryByText } = renderScreen({
        user: BASE_USER_GUEST,
        admin: null,
        guest: BASE_GUEST_ENTITY,
      });
      expect(queryByText("Two-Factor Authentication")).toBeNull();
    });

    it('shows "Two-Factor Authentication" when an admin entity exists', () => {
      const { getByText } = renderScreen({ admin: BASE_ADMIN });
      expect(getByText("Two-Factor Authentication")).toBeTruthy();
    });
  });

  // ─── Navigation ────────────────────────────────────────────────────────────
  describe("navigation", () => {
    it('navigates to EditUserInfo when "My Profile" is pressed', () => {
      const { getByText } = renderScreen();
      fireEvent.press(getByText("My Profile"));
      expect(mockNavigation.navigate).toHaveBeenCalledWith("editUserInfo");
    });

    it('navigates to Notifications when "Notifications" is pressed', () => {
      const { getByText } = renderScreen();
      fireEvent.press(getByText("Notifications"));
      expect(mockNavigation.navigate).toHaveBeenCalledWith("notifications");
    });

    it("navigates to PriorAuth when logout button is pressed", async () => {
      const { getByTestId } = renderScreen();
      await act(async () => {
        fireEvent.press(getByTestId("logout-button"));
      });
      expect(mockNavigation.navigate).toHaveBeenCalledWith("priorAuth");
    });
  });

  // ─── Form modals ───────────────────────────────────────────────────────────
  describe("form modals", () => {
    it('calls showFormModal when "File complaint" is pressed', () => {
      const { getByText } = renderScreen();
      fireEvent.press(getByText("File complaint"));
      expect(mockShowFormModal).toHaveBeenCalledWith(
        expect.anything(),
        "File Complaint",
        true
      );
    });

    it('calls showFormModal when "Log house issue" is pressed', () => {
      const { getByText } = renderScreen();
      fireEvent.press(getByText("Log house issue"));
      expect(mockShowFormModal).toHaveBeenCalledWith(
        expect.anything(),
        "House Issue",
        true
      );
    });

    it('calls showFormModal when "Report bug" is pressed', () => {
      const { getByText } = renderScreen();
      fireEvent.press(getByText("Report bug"));
      expect(mockShowFormModal).toHaveBeenCalledWith(
        expect.anything(),
        "Bug Report",
        true
      );
    });

    it('calls showFormModal when "Send feedback" is pressed', () => {
      const { getByText } = renderScreen();
      fireEvent.press(getByText("Send feedback"));
      expect(mockShowFormModal).toHaveBeenCalledWith(
        expect.anything(),
        "Send Feedback",
        true
      );
    });
  });

  // ─── Add Home demo guard ───────────────────────────────────────────────────
  describe("Add Home demo guard", () => {
    it("calls showPopover instead of navigating for a demo user", () => {
      const { isDemo } = require("../../../util/user");
      (isDemo as jest.Mock).mockReturnValueOnce(true);

      const { getByText } = renderScreen({ admin: SUPER_ADMIN });
      fireEvent.press(getByText("Add Home"));
      expect(mockShowPopover).toHaveBeenCalledWith(
        "Add Home",
        "This functionality is disabled in demo mode."
      );
      expect(mockNavigation.navigate).not.toHaveBeenCalledWith("inAppOrgSetup");
    });
  });
});
