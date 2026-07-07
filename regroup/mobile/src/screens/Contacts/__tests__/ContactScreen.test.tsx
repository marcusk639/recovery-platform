/**
 * ContactScreen Tests
 *
 * Covers:
 *  - Returns null when user is null
 *  - Returns null when house is null
 *  - Returns null when loggingOut is true
 *  - Renders the screen header with "House Members"
 *  - Renders the search bar
 *  - Renders admin section header
 *  - Renders guest section header
 *  - Renders admin contacts from Redux state
 *  - Renders guest contacts from Redux state
 *  - Renders empty state (no contacts shown) when admins and guests are empty
 *  - Pressing a contact row navigates to DirectMessage route
 *  - Pressing the filter button opens the filter modal
 *  - Help popover is triggered when help icon is pressed
 *  - subscribeToDirectChat is called on mount when participants exist
 *  - unsubscribeFromDirectChat is called on unmount
 */

// ─── useSelectedHouse mock ────────────────────────────────────────────────────
const mockUseSelectedHouse = jest.fn();

// After A2 migration, ContactScreen reads guests via useGuests(houseId). This
// test has no QueryClientProvider, so stub the hook. buildStore() wires the
// fixture via mockUseGuestsForContacts.mockReturnValue. See .full-review [A2].
const mockUseGuestsForContacts = jest.fn(() => ({
  data: {},
  isLoading: false,
  isError: false,
}));
jest.mock("../../../state/queries/guestQueries", () => ({
  useGuests: (...args: any[]) => mockUseGuestsForContacts(...args),
}));

jest.mock("../../../hooks/useSelectedHouse", () => ({
  useSelectedHouse: () => mockUseSelectedHouse(),
}));

// ─── Navigation mock ──────────────────────────────────────────────────────────
jest.mock("@react-navigation/native-stack", () => ({}));

// ─── Context mocks ────────────────────────────────────────────────────────────
const mockShowFormModal = jest.fn();
const mockDismissFormModal = jest.fn();
const mockShowPopover = jest.fn();
const mockSetPopoverRef = jest.fn();

jest.mock("../../../context", () => ({
  useModal: () => ({
    showFormModal: mockShowFormModal,
    dismissFormModal: mockDismissFormModal,
    setLoadingModalState: jest.fn(),
  }),
  useNotification: () => ({
    notify: jest.fn(),
    showPopover: mockShowPopover,
    setPopoverRef: mockSetPopoverRef,
  }),
  useTheme: () => ({
    theme: {
      primaryFontFamily: "System",
      secondaryFontFamily: "System",
      primaryColor: "#000",
      secondaryColor: "#fff",
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

// ─── Message service mocks ─────────────────────────────────────────────────────
const mockSubscribeToDirectChat = jest.fn();
const mockUnsubscribeFromDirectChat = jest.fn();

jest.mock("../../../services/message", () => ({
  subscribeToHouseChat: jest.fn(),
  unsubscribeFromHouseChat: jest.fn(),
  loadChat: jest.fn(() => Promise.resolve([])),
  sendMessageToHouseChat: jest.fn(() => Promise.resolve()),
  loadDirectChat: jest.fn(() => Promise.resolve([])),
  subscribeToDirectChat: (...args: any[]) => mockSubscribeToDirectChat(...args),
  unsubscribeFromDirectChat: (...args: any[]) =>
    mockUnsubscribeFromDirectChat(...args),
  CHAT_ID: jest.fn((ids: string[]) => [...ids].sort().join("_")),
  updateConversation: jest.fn(() => Promise.resolve()),
  markRead: jest.fn(() => Promise.resolve()),
}));

// ─── util/phone ───────────────────────────────────────────────────────────────
jest.mock("../../../util/phone", () => ({
  callNumber: jest.fn(),
}));

// ─── util/display ─────────────────────────────────────────────────────────────
jest.mock("../../../util/display", () => ({
  dateAndTime: jest.fn(() => "Jan 1, 2026 12:00 PM"),
  getPickerItems: jest.fn((obj: any) =>
    Object.entries(obj).map(([label, value]) => ({ label, value }))
  ),
}));

// ─── ContactForm stub ─────────────────────────────────────────────────────────
jest.mock("../ContactForm", () => ({
  ContactFilterForm: () => null,
  ContactFilterFormValues: class {
    type: string = "all";
  },
}));

// ─── Collapsible stub ─────────────────────────────────────────────────────────
jest.mock("react-native-collapsible", () => {
  const { View } = require("react-native");
  return ({ children, collapsed }: any) =>
    collapsed === false ? <View>{children}</View> : null;
});

// ─── Component stubs ──────────────────────────────────────────────────────────
// Pass the icon through directly so the TouchableOpacity inside ContactScreen's
// icon prop is rendered and pressable in tests.
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
  return (props: any) => <ScrollView {...props} />;
});

jest.mock("../../../components/rats-search-bar", () => {
  const { View, TouchableOpacity, TextInput, Text } = require("react-native");
  return (props: any) => (
    <View testID="search-bar-container">
      <TextInput
        testID="search-bar-input"
        value={props.value}
        onChangeText={props.onChangeText}
      />
      <TouchableOpacity testID="filter-button" onPress={props.onFilter}>
        <Text>Filter</Text>
      </TouchableOpacity>
    </View>
  );
});

jest.mock("../../../components/rats-text", () => ({
  RatsText: ({ text, testID }: any) => {
    const { Text } = require("react-native");
    return <Text testID={testID}>{text || ""}</Text>;
  },
}));

jest.mock("../../../components/rats-icon", () => ({
  RatsIcon: ({ testID, name }: any) => {
    const { View } = require("react-native");
    return <View testID={testID || `icon-${name}`} />;
  },
  Icon: ({ testID, name }: any) => {
    const { View } = require("react-native");
    return <View testID={testID || `icon-${name}`} />;
  },
}));

jest.mock("../../../components/rats-avatar", () => {
  const { View } = require("react-native");
  return ({ testID }: any) => <View testID={testID || "rats-avatar"} />;
});

jest.mock("../../../components/rats-icon/boxed-icon", () => {
  const { TouchableOpacity, Text } = require("react-native");
  return ({ onPress, name, testID }: any) => (
    <TouchableOpacity testID={testID || `boxed-icon-${name}`} onPress={onPress}>
      <Text>{name}</Text>
    </TouchableOpacity>
  );
});

// ─── React imports (after mocks) ──────────────────────────────────────────────
import React from "react";
import { render, fireEvent, act, waitFor } from "@testing-library/react-native";
import { Provider } from "react-redux";
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

import ContactScreen from "../ContactScreen";

// ─── Fixtures ─────────────────────────────────────────────────────────────────

const BASE_HOUSE: any = {
  id: "house-1",
  name: "Test House",
  adminIds: ["admin-1"],
  superAdminIds: [],
  avatar: "",
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
};

const BASE_USER: any = {
  uid: "user-1",
  id: "user-1",
  firstName: "Alice",
  lastName: "Manager",
  email: "alice@example.com",
  isAdmin: true,
  adminId: "admin-1",
  guestId: undefined,
  avatar: "",
};

const BASE_USER_GUEST: any = {
  uid: "user-guest-1",
  id: "user-guest-1",
  firstName: "Bob",
  lastName: "Resident",
  email: "bob@example.com",
  isAdmin: false,
  adminId: undefined,
  guestId: "guest-1",
  avatar: "",
};

const SAMPLE_ADMIN: any = {
  id: "admin-2",
  userId: "user-admin-2",
  firstName: "Carol",
  lastName: "Admin",
  email: "carol@example.com",
  houseIds: ["house-1"],
  superAdmin: [],
  phoneNumber: "5551112222",
  avatar: "",
};

const SAMPLE_GUEST: any = {
  id: "guest-1",
  userId: "user-guest-1",
  firstName: "Dave",
  lastName: "Resident",
  email: "dave@example.com",
  houseId: "house-1",
  phoneNumber: "5553334444",
  avatar: "",
  // ContactScreen checks for `phase` to determine if it's a guest
  phase: "phase-1",
};

// ─── Store builder ─────────────────────────────────────────────────────────────

interface BuildStoreOptions {
  house?: any;
  user?: any;
  admin?: any;
  admins?: Record<string, any>;
  guests?: Record<string, any>;
  loggingOut?: boolean;
  adminLoading?: boolean;
  guestsLoading?: boolean;
}

function buildStore({
  house = BASE_HOUSE,
  user = BASE_USER,
  admin = null,
  admins = {},
  guests = {},
  loggingOut = false,
  adminLoading = false,
  guestsLoading = false,
}: BuildStoreOptions = {}) {
  mockUseSelectedHouse.mockReturnValue({
    house,
    houseId: house?.id ?? null,
    isLoading: false,
  });
  // A2 migration: feed the same fixture through useGuests.
  mockUseGuestsForContacts.mockReturnValue({
    data: guests,
    isLoading: guestsLoading,
    isError: false,
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
    } as any,
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
        updatingHouse: false,
        updatingHouseSuccessful: false,
        updatingHouseFailed: false,
      } as any,
      guests: {
        guests,
        selectedGuest: null,
        userAsGuest: null,
        status: guestsLoading ? "loading" : "idle",
        error: null,
        updateStatus: "idle",
        createStatus: "idle",
        deleteStatus: "idle",
        customizePhaseStatus: "idle",
      } as any,
      admin: {
        houseAdmins: admins,
        admins,
        selectedAdmin: null,
        userAsAdmin: admin ?? null,
        loading: adminLoading,
        error: null,
      } as any,
      user: {
        user,
        loading: false,
        error: null,
        loggedIn: !!user,
        loggingIn: false,
        loggingInFailed: false,
        loggingOut,
        loggingOutSuccessful: false,
        signingUp: false,
        signingUpFailed: false,
      } as any,
      chat: {
        conversations: {},
        activeConversationId: null,
        recipient: null,
        sendingMessage: false,
        messageSent: false,
        loading: false,
        error: null,
      } as any,
    },
  });
}

const mockNavigation: any = {
  navigate: jest.fn(),
  goBack: jest.fn(),
  addListener: jest.fn(() => jest.fn()),
};

function renderScreen(storeOptions: BuildStoreOptions = {}) {
  const store = buildStore(storeOptions);
  return render(
    <Provider store={store}>
      <ContactScreen navigation={mockNavigation} />
    </Provider>
  );
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe("ContactScreen", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    // subscribeToDirectChat now returns the Firestore unsubscribe
    // function — ContactScreen stores it in a ref and calls it on
    // cleanup. Return mockUnsubscribeFromDirectChat so the existing
    // "calls unsubscribeFromDirectChat on unmount" test still passes.
    mockSubscribeToDirectChat.mockImplementation(
      () => mockUnsubscribeFromDirectChat
    );
  });

  // ─── Null/guard states ─────────────────────────────────────────────────────
  describe("guard conditions", () => {
    it("renders nothing when user is null", () => {
      const { toJSON } = renderScreen({ user: null });
      expect(toJSON()).toBeNull();
    });

    it("renders nothing when house is null", () => {
      const { toJSON } = renderScreen({ house: null });
      expect(toJSON()).toBeNull();
    });

    it("renders nothing when loggingOut is true", () => {
      const { toJSON } = renderScreen({ loggingOut: true });
      expect(toJSON()).toBeNull();
    });
  });

  // ─── Main render ───────────────────────────────────────────────────────────
  describe("main render", () => {
    it("renders without crashing when user and house are present", () => {
      const { getByTestId } = renderScreen();
      expect(getByTestId("screen-header")).toBeTruthy();
    });

    it('renders the "House Members" header text', () => {
      const { getByText } = renderScreen();
      expect(getByText("House Members")).toBeTruthy();
    });

    it("renders the ADMIN section header", () => {
      const { getByText } = renderScreen();
      expect(getByText("ADMIN")).toBeTruthy();
    });

    it("renders the GUEST section header", () => {
      const { getByText } = renderScreen();
      expect(getByText("GUEST")).toBeTruthy();
    });

    it("renders the help icon (question-circle) in the header", () => {
      const { getByTestId } = renderScreen();
      expect(getByTestId("icon-question-circle")).toBeTruthy();
    });
  });

  // ─── Empty state ───────────────────────────────────────────────────────────
  describe("empty state", () => {
    it("renders without any contact rows when admins and guests are empty", () => {
      const { queryByText } = renderScreen({ admins: {}, guests: {} });
      // No contact names should appear
      expect(queryByText("Carol Admin")).toBeNull();
      expect(queryByText("Dave Resident")).toBeNull();
    });
  });

  // ─── Contact data rendering ────────────────────────────────────────────────
  describe("contact data", () => {
    it("renders admin contact names from Redux state", () => {
      const { getByText } = renderScreen({
        admins: { "admin-2": SAMPLE_ADMIN },
      });
      expect(getByText("Carol Admin")).toBeTruthy();
    });

    it("renders guest contact names from Redux state", () => {
      const { getByText } = renderScreen({
        guests: { "guest-1": SAMPLE_GUEST },
      });
      expect(getByText("Dave Resident")).toBeTruthy();
    });

    it("renders both admin and guest contacts together", () => {
      const { getByText } = renderScreen({
        admins: { "admin-2": SAMPLE_ADMIN },
        guests: { "guest-1": SAMPLE_GUEST },
      });
      expect(getByText("Carol Admin")).toBeTruthy();
      expect(getByText("Dave Resident")).toBeTruthy();
    });
  });

  // ─── Navigation to Direct Message ─────────────────────────────────────────
  describe("navigate to DirectMessage", () => {
    it("navigates to DirectMessage when a guest contact row is tapped", async () => {
      const { getByText } = renderScreen({
        guests: { "guest-1": SAMPLE_GUEST },
      });
      const contactRow = getByText("Dave Resident");
      // The TouchableOpacity wraps the full avatar item
      const touchable = contactRow.parent;
      await act(async () => {
        fireEvent.press(touchable!);
      });
      expect(mockNavigation.navigate).toHaveBeenCalledWith("directMessage");
    });

    it("navigates to DirectMessage when an admin contact row is tapped", async () => {
      const { getByText } = renderScreen({
        admins: { "admin-2": SAMPLE_ADMIN },
      });
      const contactRow = getByText("Carol Admin");
      const touchable = contactRow.parent;
      await act(async () => {
        fireEvent.press(touchable!);
      });
      expect(mockNavigation.navigate).toHaveBeenCalledWith("directMessage");
    });
  });

  // ─── Filter modal ──────────────────────────────────────────────────────────
  describe("filter modal", () => {
    it("does not call showFormModal without any user interaction", () => {
      renderScreen();
      expect(mockShowFormModal).not.toHaveBeenCalled();
    });

    // Regression coverage for 2026-07-05: renderSearch() (which contains the
    // filter button) was fully built and wired to real state, but the JSX
    // return never called it — the search bar was never actually mounted.
    it("mounts the search bar", () => {
      const { getByTestId } = renderScreen();
      expect(getByTestId("search-bar-container")).toBeTruthy();
    });

    it("opens the filter modal when the filter button is pressed", () => {
      const { getByTestId } = renderScreen();
      fireEvent.press(getByTestId("filter-button"));
      expect(mockShowFormModal).toHaveBeenCalled();
    });
  });

  // ─── Name search ────────────────────────────────────────────────────────────
  // Regression coverage for 2026-07-05: shouldShowUser() only checked
  // filters.type — typing into the (previously unmounted) search bar filtered
  // nothing.
  describe("name search", () => {
    it("shows only contacts matching the typed search term", () => {
      const { getByTestId, getByText, queryByText } = renderScreen({
        admins: { "admin-2": SAMPLE_ADMIN },
        guests: { "guest-1": SAMPLE_GUEST },
      });
      fireEvent.changeText(getByTestId("search-bar-input"), "Dave");
      expect(getByText("Dave Resident")).toBeTruthy();
      expect(queryByText("Carol Admin")).toBeNull();
    });

    it("shows all contacts again when the search term is cleared", () => {
      const { getByTestId, getByText } = renderScreen({
        admins: { "admin-2": SAMPLE_ADMIN },
        guests: { "guest-1": SAMPLE_GUEST },
      });
      const input = getByTestId("search-bar-input");
      fireEvent.changeText(input, "Dave");
      fireEvent.changeText(input, "");
      expect(getByText("Dave Resident")).toBeTruthy();
      expect(getByText("Carol Admin")).toBeTruthy();
    });
  });

  // ─── Help popover ──────────────────────────────────────────────────────────
  // The help icon is a TouchableOpacity directly inside the icon prop rendered
  // by ScreenHeader. We locate the question-circle icon and press its parent.
  describe("help popover", () => {
    it("calls showPopover when the help icon is pressed", async () => {
      const { getByTestId } = renderScreen();
      const helpIcon = getByTestId("icon-question-circle");
      // The TouchableOpacity is the direct parent of the RatsIcon
      const touchable = helpIcon.parent;
      await act(async () => {
        fireEvent.press(touchable!);
      });
      expect(mockShowPopover).toHaveBeenCalledWith(
        "HOUSE MEMBERS",
        expect.any(String)
      );
    });
  });

  // ─── Firebase subscriptions ────────────────────────────────────────────────
  describe("Firebase subscriptions", () => {
    it("calls subscribeToDirectChat for each guest when adminId is present", () => {
      renderScreen({
        guests: { "guest-1": SAMPLE_GUEST },
        admins: {},
      });
      expect(mockSubscribeToDirectChat).toHaveBeenCalled();
    });

    it("calls subscribeToDirectChat for each admin when adminId is present", () => {
      renderScreen({
        admins: { "admin-2": SAMPLE_ADMIN },
        guests: {},
      });
      expect(mockSubscribeToDirectChat).toHaveBeenCalled();
    });

    it("calls unsubscribeFromDirectChat on unmount", () => {
      const { unmount } = renderScreen({
        guests: { "guest-1": SAMPLE_GUEST },
      });
      unmount();
      expect(mockUnsubscribeFromDirectChat).toHaveBeenCalled();
    });

    it("does not call subscribeToDirectChat when user has no adminId or guestId", () => {
      renderScreen({
        user: { ...BASE_USER, adminId: undefined, guestId: undefined },
        guests: { "guest-1": SAMPLE_GUEST },
      });
      expect(mockSubscribeToDirectChat).not.toHaveBeenCalled();
    });
  });
});
