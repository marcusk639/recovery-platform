/**
 * NewMeeting Screen Tests
 *
 * Covers:
 *  - Renders without crashing (smoke test)
 *  - Loading state — showLoadingModal is called when addingMeeting is true
 *  - Header renders with "Create Meeting"
 *  - Form fields render (Meeting Name, Type, Address, Days & Times)
 *  - Confirmation buttons render (confirm / cancel)
 *  - Cancel calls navigation.goBack
 *  - Loading modal is hidden when addingMeeting is false
 */

// ─── Navigation mock ──────────────────────────────────────────────────────────
jest.mock("@react-navigation/native-stack", () => ({}));

// ─── Meeting query hooks ──────────────────────────────────────────────────────
const mockAddMeetingMutateAsync = jest.fn(() => Promise.resolve());
const mockCheckIntoMeetingMutateAsync = jest.fn(() => Promise.resolve());

jest.mock("../../../state/queries/meetingQueries", () => ({
  useAddMeeting: jest.fn(),
  useCheckIntoMeeting: jest.fn(),
}));

// ─── Context mocks ────────────────────────────────────────────────────────────
const mockShowLoadingModal = jest.fn();
const mockHideLoadingModal = jest.fn();
const mockShowFormModal = jest.fn();
const mockDismissFormModal = jest.fn();

jest.mock("../../../context", () => ({
  useModal: () => ({
    showLoadingModal: mockShowLoadingModal,
    hideLoadingModal: mockHideLoadingModal,
    showFormModal: mockShowFormModal,
    dismissFormModal: mockDismissFormModal,
  }),
  useNotification: () => ({
    notify: jest.fn(),
    showPopover: jest.fn(),
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

// ─── Component stubs ──────────────────────────────────────────────────────────
jest.mock("../../../components/screen-header", () => {
  const { View, Text } = require("react-native");
  return ({ header }: any) => (
    <View testID="screen-header">
      <Text testID="screen-header-text">{header}</Text>
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

jest.mock("../../../components/rats-scroll-view", () => {
  const { ScrollView } = require("react-native");
  return (props: any) => {
    const { children, contentContainerStyle, ...rest } = props;
    return <ScrollView {...rest}>{children}</ScrollView>;
  };
});

jest.mock("../../../components/rats-text-input/rats-text-input", () => {
  const { TextInput } = require("react-native");
  return (props: any) => (
    <TextInput testID={`input-${props.name || "field"}`} {...props} />
  );
});

jest.mock("../../../components/rats-picker/rats-picker", () => {
  const { View, Text } = require("react-native");
  return ({ label, name }: any) => (
    <View testID={`picker-${name}`}>
      <Text>{label}</Text>
    </View>
  );
});

jest.mock("../../../components/rats-button/rats-button", () => {
  const { TouchableOpacity, Text } = require("react-native");
  return ({ title, onPress, testID }: any) => (
    <TouchableOpacity testID={testID || `btn-${title}`} onPress={onPress}>
      <Text>{title}</Text>
    </TouchableOpacity>
  );
});

jest.mock("../../../components/confirmation-buttons", () => {
  const { View, TouchableOpacity, Text } = require("react-native");
  return ({ cancel, confirm }: any) => (
    <View testID="confirmation-buttons">
      <TouchableOpacity testID="cancel-button" onPress={cancel}>
        <Text>Cancel</Text>
      </TouchableOpacity>
      <TouchableOpacity testID="confirm-button" onPress={confirm}>
        <Text>Confirm</Text>
      </TouchableOpacity>
    </View>
  );
});

jest.mock("../../../components/help-icon", () => {
  const { View } = require("react-native");
  return () => <View testID="help-icon" />;
});

jest.mock("../../../components/weekdays", () => ({
  Weekdays: () => null,
  WeekdayWithTime: () => null,
  daysOfWeek: [
    "Sunday",
    "Monday",
    "Tuesday",
    "Wednesday",
    "Thursday",
    "Friday",
    "Saturday",
  ],
}));

jest.mock("../DayTimeWidget", () => {
  const { View } = require("react-native");
  return () => <View testID="day-time-widget" />;
});

jest.mock("../../../components/rats-datepicker/rats-timepicker", () => ({
  RatsTimePicker: () => null,
}));

jest.mock("../../../util/form", () => ({
  renderField: (name: string, label: string) => {
    const { View, Text } = require("react-native");
    return (
      <View testID={`field-${name}`}>
        <Text>{label}</Text>
      </View>
    );
  },
}));

jest.mock("../../../util/meeting", () => ({
  getCheckinInput: jest.fn(() => ({ meetingId: "meeting-1" })),
}));

jest.mock("../../../util/display", () => ({
  militaryTimeToDate: jest.fn(() => new Date()),
  getFormattedTime: jest.fn(() => "5:00 PM"),
  getPickerItems: jest.fn((items: any) =>
    Object.keys(items).map((key) => ({ label: key, value: items[key] }))
  ),
}));

// ─── Formik stub ──────────────────────────────────────────────────────────────
jest.mock("formik", () => {
  const React = require("react");
  return {
    withFormik: (config: any) => (Component: any) => (props: any) => {
      const values = config.mapPropsToValues
        ? config.mapPropsToValues(props)
        : {};
      const handleSubmit = jest.fn(async () => {
        try {
          await config.handleSubmit(values, { props });
        } catch (e) {
          // swallow
        }
      });
      return React.createElement(Component, {
        ...props,
        values,
        setFieldValue: jest.fn(),
        handleSubmit,
        errors: {},
        touched: {},
        isSubmitting: false,
      });
    },
    Field: ({ component: Comp, ...rest }: any) => {
      if (!Comp) return null;
      return React.createElement(Comp, {
        field: { name: rest.name, value: "" },
        ...rest,
      });
    },
    FormikProps: {},
  };
});

// ─── React imports (after mocks) ──────────────────────────────────────────────
import React from "react";
import { render, fireEvent, act } from "@testing-library/react-native";
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

import {
  useAddMeeting,
  useCheckIntoMeeting,
} from "../../../state/queries/meetingQueries";
import NewMeeting from "../NewMeeting";

// ─── Fixtures ─────────────────────────────────────────────────────────────────

const BASE_HOUSE: any = {
  id: "house-1",
  name: "Test House",
  street: "100 Main St",
  city: "Springfield",
  state: "IL",
  zip: "62701",
  adminIds: [],
  superAdminIds: [],
  pendingAdminInvites: [],
  timezone: "",
  ownerId: "owner-1",
  lat: 0,
  lng: 0,
  geohash: "",
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
};

const BASE_USER: any = {
  id: "user-1",
  uid: "user-1",
  firstName: "Admin",
  lastName: "User",
  email: "admin@example.com",
  isAdmin: true,
  isGuest: false,
};

// ─── Store builder ─────────────────────────────────────────────────────────────

interface BuildStoreOptions {
  house?: any;
  user?: any;
}

function buildStore({
  house = BASE_HOUSE,
  user = BASE_USER,
}: BuildStoreOptions = {}) {
  return configureStore({
    reducer: {
      auth: authReducer,
      theme: themeReducer,
      user: userReducer,
      houses: housesReducer,
      guests: guestsReducer,
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
        requestingAdmin: false,
      } as any,
      user: {
        user,
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
  navigate: jest.fn(),
  goBack: jest.fn(),
};

// ─── Hook mock helpers ────────────────────────────────────────────────────────

function setupMeetingQueryMocks({
  addingMeeting = false,
  checkingIn = false,
} = {}) {
  (useAddMeeting as jest.Mock).mockReturnValue({
    isPending: addingMeeting,
    error: null,
    mutateAsync: mockAddMeetingMutateAsync,
  });
  (useCheckIntoMeeting as jest.Mock).mockReturnValue({
    isPending: checkingIn,
    error: null,
    mutateAsync: mockCheckIntoMeetingMutateAsync,
  });
}

function renderScreen(
  storeOptions: BuildStoreOptions = {},
  mutationOptions: { addingMeeting?: boolean; checkingIn?: boolean } = {}
) {
  setupMeetingQueryMocks(mutationOptions);
  const store = buildStore(storeOptions);
  const queryClient = buildQueryClient();
  return render(
    <Provider store={store}>
      <QueryClientProvider client={queryClient}>
        <NewMeeting navigation={mockNavigation} />
      </QueryClientProvider>
    </Provider>
  );
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe("NewMeeting", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    setupMeetingQueryMocks();
  });

  // ─── Smoke test ─────────────────────────────────────────────────────────────
  describe("render", () => {
    it("renders without crashing", () => {
      const { getByTestId } = renderScreen();
      expect(getByTestId("screen-header")).toBeTruthy();
    });

    it('renders the "Create Meeting" header', () => {
      const { getByText } = renderScreen();
      expect(getByText("Create Meeting")).toBeTruthy();
    });

    it("renders the Meeting Name field", () => {
      const { getByTestId } = renderScreen();
      expect(getByTestId("field-name")).toBeTruthy();
    });

    it("renders the Type picker", () => {
      const { getByTestId } = renderScreen();
      expect(getByTestId("picker-type")).toBeTruthy();
    });

    it("renders the Address field", () => {
      const { getByTestId } = renderScreen();
      expect(getByTestId("field-address")).toBeTruthy();
    });

    it("renders confirmation buttons", () => {
      const { getByTestId } = renderScreen();
      expect(getByTestId("confirmation-buttons")).toBeTruthy();
    });

    it("renders cancel button", () => {
      const { getByTestId } = renderScreen();
      expect(getByTestId("cancel-button")).toBeTruthy();
    });

    it("renders confirm button", () => {
      const { getByTestId } = renderScreen();
      expect(getByTestId("confirm-button")).toBeTruthy();
    });
  });

  // ─── Loading state ───────────────────────────────────────────────────────────
  describe("loading state", () => {
    it("calls showLoadingModal when addingMeeting is true", () => {
      renderScreen({}, { addingMeeting: true });
      expect(mockShowLoadingModal).toHaveBeenCalledWith("Adding meeting...");
    });

    it("calls hideLoadingModal when addingMeeting is false and no error", () => {
      renderScreen({}, { addingMeeting: false });
      expect(mockHideLoadingModal).toHaveBeenCalled();
    });

    it("does not call showLoadingModal when addingMeeting is false", () => {
      renderScreen({}, { addingMeeting: false });
      expect(mockShowLoadingModal).not.toHaveBeenCalled();
    });
  });

  // ─── Form field labels ───────────────────────────────────────────────────────
  describe("form field labels", () => {
    it('renders "Meeting Name" label text', () => {
      const { getByText } = renderScreen();
      expect(getByText("Meeting Name")).toBeTruthy();
    });

    it('renders "Type" label text', () => {
      const { getByText } = renderScreen();
      expect(getByText("Type")).toBeTruthy();
    });

    it('renders "Address" label text', () => {
      const { getByText } = renderScreen();
      expect(getByText("Address")).toBeTruthy();
    });
  });

  // ─── Confirmation buttons interaction ────────────────────────────────────────
  describe("confirmation button interactions", () => {
    it("calls navigation.goBack when Cancel is pressed", () => {
      const { getByTestId } = renderScreen();
      fireEvent.press(getByTestId("cancel-button"));
      expect(mockNavigation.goBack).toHaveBeenCalled();
    });

    // Regression coverage for 2026-07-05: handleSubmit used to hardcode
    // `newMeeting.type = 'Custom'` after cloning the form values, silently
    // discarding whatever the operator picked in the Type picker (NA/AA/IOP/
    // Celebrate Recovery/Custom). Every meeting was created as "Custom"
    // regardless of selection.
    it("submits the meeting with the type selected in the form, not hardcoded to Custom", async () => {
      const { getByTestId } = renderScreen();
      await act(async () => {
        fireEvent.press(getByTestId("confirm-button"));
      });
      expect(mockAddMeetingMutateAsync).toHaveBeenCalledWith(
        expect.objectContaining({
          meeting: expect.objectContaining({ type: "AA" }),
        })
      );
    });
  });
});
