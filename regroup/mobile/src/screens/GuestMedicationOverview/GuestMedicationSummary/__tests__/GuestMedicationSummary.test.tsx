/**
 * GuestMedicationSummary Tests
 *
 * Covers:
 *   - Renders correctly with stat data from useStatSummary
 *   - Shows the medication stat card with correct description
 *   - Shows correct stat value and phase rule (statSum / phaseRule)
 *   - Bar graph renders with historical data
 *   - Loading state renders RatsLoadingIndicator
 *   - Log Medication and Update Medication action buttons render
 */

// ─── Firebase / native module mocks ────────────────────────────────────────
jest.mock("../../../../firebase-setup", () => ({
  firestore: {
    collection: jest.fn(() => ({
      doc: jest.fn(() => ({
        get: jest.fn(() =>
          Promise.resolve({ exists: false, data: () => null })
        ),
        set: jest.fn(() => Promise.resolve()),
        update: jest.fn(() => Promise.resolve()),
        delete: jest.fn(() => Promise.resolve()),
      })),
      get: jest.fn(() => Promise.resolve({ docs: [] })),
      where: jest.fn().mockReturnThis(),
      orderBy: jest.fn().mockReturnThis(),
      limit: jest.fn().mockReturnThis(),
    })),
    batch: jest.fn(() => ({
      set: jest.fn(),
      update: jest.fn(),
      commit: jest.fn(() => Promise.resolve()),
    })),
  },
}));

// ─── Context mocks ────────────────────────────────────────────────────────────
const mockShowFormModal = jest.fn();
const mockDismissFormModal = jest.fn();
const mockShowPopover = jest.fn();
const mockSetPopoverRef = jest.fn();

jest.mock("../../../../context", () => ({
  useModal: () => ({
    showFormModal: mockShowFormModal,
    dismissFormModal: mockDismissFormModal,
    formModalVisible: false,
  }),
  useNotification: () => ({
    notify: jest.fn(),
    showPopover: mockShowPopover,
    setPopoverRef: mockSetPopoverRef,
    popoverVisible: false,
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

// ─── Auth context mock ────────────────────────────────────────────────────────
jest.mock("../../../../context/auth", () => ({
  AuthConsumer: ({ children }: { children: (ctx: any) => React.ReactNode }) =>
    children({ token: { "house-1": { role: "admin" } } }),
}));

// ─── isAdmin utility ──────────────────────────────────────────────────────────
jest.mock("../../../../util/roles", () => ({
  isAdmin: jest.fn(() => true),
}));

// ─── useStatSummary mock — controls all data the screen uses ─────────────────
const mockGetBarFillColor = jest.fn(() => "#009A39");

const defaultStatSummary = {
  guest: {
    id: "guest-1",
    userId: "user-1",
    houseId: "house-1",
    firstName: "Alice",
    lastName: "Smith",
    phase: "phase1",
    step: 3,
    primarySupporterName: "Bob Jones",
  },
  house: {
    id: "house-1",
    name: "Test House",
    phases: {
      phase1: {
        rules: { medications: true, meetings: 3, work: 20, chore: true },
      },
    },
    isDemoHouse: false,
  },
  user: { id: "user-1", firstName: "Alice", lastName: "Smith" },
  statSum: 5,
  phaseRule: 7,
  percentage: 71,
  disputes: 0,
  daysRemaining: 3,
  graphData: [
    { x: "01/01", y: 6 },
    { x: "01/08", y: 7 },
    { x: "01/15", y: 5 },
  ],
  getBarFillColor: mockGetBarFillColor,
  isLoading: false,
  reports: [],
};

jest.mock("../../../../hooks/useStatSummary", () => ({
  useStatSummary: jest.fn(() => defaultStatSummary),
}));

// ─── Display util ─────────────────────────────────────────────────────────────
jest.mock("../../../../util/display", () => ({
  getCurrentTime: jest.fn(() => "2024-01-01T00:00:00.000Z"),
  getDateAndTime: jest.fn(() => "Jan 1, 2024"),
  camelCaseToDisplayForm: jest.fn((s: string) => s),
  getTodaysDate: jest.fn(() => "2024-01-01"),
  daysLeft: jest.fn(() => 3),
  STAT_MAP: {
    medication: { label: "Medication", icon: "pills" },
    meeting: { label: "Meetings", icon: "users" },
    metPrimarySupporter: { label: "Sponsor", icon: "user" },
    hoursWorked: { label: "Work", icon: "briefcase" },
    choreCompleted: { label: "Chores", icon: "home" },
  },
}));

// ─── Navigation mock ──────────────────────────────────────────────────────────
jest.mock("@react-navigation/native-stack", () => ({}));

// ─── Component stubs ──────────────────────────────────────────────────────────
jest.mock("../../../../components/rats-scroll-view", () => {
  const { ScrollView } = require("react-native");
  return ScrollView;
});

jest.mock("../../../../components/screen-header", () => "ScreenHeader");
jest.mock("../../../../components/help-icon", () => "HelpIcon");
jest.mock("../../../../components/rats-bar-graph", () => "RatsBarGraph");

jest.mock("../../../../components/rats-text-input/rats-text-input", () => {
  const react = require("react");
  const { TextInput } = require("react-native");
  return (props: any) =>
    react.createElement(TextInput, {
      testID: props.testID,
      value: props.field?.value,
      onChangeText: props.customHandleChange,
    });
});

jest.mock("../../../../components/rats-button/rats-button", () => {
  const react = require("react");
  const { TouchableOpacity, Text } = require("react-native");
  return (props: any) =>
    react.createElement(
      TouchableOpacity,
      {
        testID: props.testID,
        onPress: props.disabled ? undefined : props.onPress,
        disabled: props.disabled,
      },
      react.createElement(Text, null, props.title)
    );
});

// ─── Activity logging mock ────────────────────────────────────────────────────
const mockLogActivityMutateAsync = jest.fn(() => Promise.resolve());
jest.mock("../../../../state/queries/activityQueries", () => ({
  useLogNewActivity: () => ({ mutateAsync: mockLogActivityMutateAsync }),
}));

jest.mock("../../../../../firebase-setup", () => ({
  firestore: {
    collection: jest.fn(() => ({
      doc: jest.fn(() => ({
        get: jest.fn(() =>
          Promise.resolve({ exists: false, data: () => null })
        ),
        set: jest.fn(() => Promise.resolve()),
        update: jest.fn(() => Promise.resolve()),
        delete: jest.fn(() => Promise.resolve()),
      })),
      get: jest.fn(() => Promise.resolve({ docs: [] })),
      where: jest.fn().mockReturnThis(),
      orderBy: jest.fn().mockReturnThis(),
      limit: jest.fn().mockReturnThis(),
    })),
    batch: jest.fn(() => ({
      set: jest.fn(),
      update: jest.fn(),
      commit: jest.fn(() => Promise.resolve()),
    })),
  },
  auth: { currentUser: { uid: "user-1" } },
}));

// ─── React imports (after mocks) ─────────────────────────────────────────────
import React from "react";
import { render, fireEvent, act, waitFor } from "@testing-library/react-native";
import { Provider } from "react-redux";
import { configureStore } from "@reduxjs/toolkit";

import housesReducer from "../../../../state/slices/housesSlice";
import guestsReducer from "../../../../state/slices/guestsSlice";
import userReducer from "../../../../state/slices/userSlice";
import adminReducer from "../../../../state/slices/adminSlice";
import authReducer from "../../../../state/slices/authSlice";
import themeReducer from "../../../../state/slices/themeSlice";
import chatReducer from "../../../../state/slices/chatSlice";
import setupReducer from "../../../../state/slices/setupSlice";
import notificationsReducer from "../../../../state/slices/notificationsSlice";
import meetingsReducer from "../../../../state/slices/meetingsSlice";

import { useStatSummary } from "../../../../hooks/useStatSummary";
import GuestMedicationSummary from "../GuestMedicationSummary";

// ─── Store builder ────────────────────────────────────────────────────────────
function buildStore() {
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
        selectedHouse: defaultStatSummary.house,
        houses: { "house-1": defaultStatSummary.house },
        searchedHouses: [],
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
        error: null,
      } as any,
      guests: {
        guests: {},
        selectedGuest: defaultStatSummary.guest,
        loading: false,
        error: null,
        requestingGuests: false,
      } as any,
      user: {
        user: defaultStatSummary.user,
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

function renderScreen() {
  return render(
    <Provider store={buildStore()}>
      <GuestMedicationSummary navigation={mockNavigation} />
    </Provider>
  );
}

// ─── Tests ────────────────────────────────────────────────────────────────────
describe("GuestMedicationSummary", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (useStatSummary as jest.Mock).mockReturnValue(defaultStatSummary);
  });

  describe("Rendering", () => {
    it("renders without crashing", () => {
      const { getByTestId } = renderScreen();
      expect(getByTestId("medication-summary-screen")).toBeTruthy();
    });

    it("calls useStatSummary with the medication stat key", () => {
      renderScreen();
      expect(useStatSummary).toHaveBeenCalledWith("medication");
    });

    it("renders the medication stat card header", () => {
      const { getByText } = renderScreen();
      expect(getByText("Medication")).toBeTruthy();
    });

    it("renders the medication requirement description", () => {
      const { getByText } = renderScreen();
      expect(
        getByText(
          "You must take your prescribed medications daily as required."
        )
      ).toBeTruthy();
    });

    it('renders "no requirements" text when phaseRule is 0', () => {
      (useStatSummary as jest.Mock).mockReturnValue({
        ...defaultStatSummary,
        phaseRule: 0,
        house: {
          ...defaultStatSummary.house,
          phases: {
            phase1: {
              rules: { medications: false, meetings: 3, work: 20, chore: true },
            },
          },
        },
      });
      const { getByText } = renderScreen();
      expect(
        getByText("No medication requirements set for your current phase.")
      ).toBeTruthy();
    });
  });

  describe("Stat Data", () => {
    it("renders the stat sum and phase rule", () => {
      const { getByText } = renderScreen();
      // StatSummaryScreen renders "statSum of phaseRule"
      expect(getByText("5 of 7")).toBeTruthy();
    });

    it("renders the disputes count", () => {
      (useStatSummary as jest.Mock).mockReturnValue({
        ...defaultStatSummary,
        disputes: 2,
      });
      const { getByText } = renderScreen();
      expect(getByText("2")).toBeTruthy();
    });

    it("renders the days remaining", () => {
      const { getByText } = renderScreen();
      expect(getByText("3")).toBeTruthy();
    });
  });

  describe("Action Buttons", () => {
    it("renders the Log Medication button", () => {
      const { getByTestId } = renderScreen();
      expect(getByTestId("log-medication-button")).toBeTruthy();
    });

    it("renders the Update Medication button", () => {
      const { getByTestId } = renderScreen();
      expect(getByTestId("update-medication-button")).toBeTruthy();
    });
  });

  // Regression coverage for 2026-07-05: both buttons previously opened a
  // blank modal (showFormModal(<View />, ...)) — there was no way to
  // actually log or update medication through this screen.
  describe("medication logging", () => {
    it("opens a real form (not a blank View) when Log Medication is pressed", () => {
      const { getByTestId } = renderScreen();
      fireEvent.press(getByTestId("log-medication-button"));

      expect(mockShowFormModal).toHaveBeenCalledWith(
        expect.anything(),
        "Log Medication",
        true
      );
      const formElement = mockShowFormModal.mock.calls[0][0];
      const { getByTestId: getByTestIdInModal } = render(formElement);
      expect(getByTestIdInModal("medication-name-input")).toBeTruthy();
      expect(getByTestIdInModal("submit-medication-button")).toBeTruthy();
    });

    it("logs a MEDICATION activity with the entered name/dosage and dismisses the modal on submit", async () => {
      const { getByTestId } = renderScreen();
      fireEvent.press(getByTestId("log-medication-button"));
      const formElement = mockShowFormModal.mock.calls[0][0];
      const { getByTestId: getByTestIdInModal } = render(formElement);

      fireEvent.changeText(
        getByTestIdInModal("medication-name-input"),
        "Ibuprofen"
      );
      fireEvent.changeText(
        getByTestIdInModal("medication-dosage-input"),
        "200mg"
      );

      await act(async () => {
        fireEvent.press(getByTestIdInModal("submit-medication-button"));
      });

      expect(mockLogActivityMutateAsync).toHaveBeenCalledWith(
        expect.objectContaining({
          guestId: "guest-1",
          houseId: "house-1",
          type: "medication",
          loggedBy: "user-1",
          data: expect.objectContaining({
            medicationName: "Ibuprofen",
            dosage: "200mg",
          }),
        })
      );
      await waitFor(() => expect(mockDismissFormModal).toHaveBeenCalled());
    });

    it("opens the same real form for Update Medication Info", () => {
      const { getByTestId } = renderScreen();
      fireEvent.press(getByTestId("update-medication-button"));

      expect(mockShowFormModal).toHaveBeenCalledWith(
        expect.anything(),
        "Update Medication Info",
        true
      );
    });
  });

  describe("Bar Graph", () => {
    it("renders the bar graph with historical data", () => {
      const { getByText } = renderScreen();
      expect(getByText("LAST TWO MONTHS")).toBeTruthy();
    });

    it("renders loading indicator when isLoading is true and graphData is empty", () => {
      (useStatSummary as jest.Mock).mockReturnValue({
        ...defaultStatSummary,
        isLoading: true,
        graphData: [],
      });
      // When isLoading and no graph data, StatSummaryScreen renders a loading indicator
      const { queryByTestId } = renderScreen();
      expect(queryByTestId("medication-summary-screen")).toBeNull();
    });
  });
});
