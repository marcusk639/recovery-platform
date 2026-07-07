/**
 * GuestChoreSummary Tests
 *
 * Covers:
 *   - Renders correctly with stat data from useStatSummary
 *   - Shows the assigned chore name from guest.currentChore
 *   - Shows chore description from house.chores
 *   - Falls back to defaults when chore name / description are absent
 *   - Bar graph renders with historical data
 *   - Loading state renders RatsLoadingIndicator (testID absent)
 *   - Change Chore and Complete Chore action buttons render
 *   - showFormModal called with correct args on button press
 */

// ─── Firebase / native module mocks ────────────────────────────────────────
jest.mock("../../../../firebase-setup", () => ({
  auth: { currentUser: { uid: "user-1" } },
  firestore: {
    collection: jest.fn(() => ({
      doc: jest.fn(() => ({
        id: "temp-doc-id",
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

// ─── image picker mock ────────────────────────────────────────────────────────
jest.mock("react-native-image-picker", () => ({
  launchImageLibrary: jest.fn(),
}));

// ─── storage service mock ─────────────────────────────────────────────────────
jest.mock("../../../../services/storage", () => ({
  uploadChoreEvidencePhoto: jest.fn(() =>
    Promise.resolve("https://storage.example.com/photo.jpg")
  ),
}));

// ─── activity queries mock ────────────────────────────────────────────────────
jest.mock("../../../../state/queries/activityQueries", () => ({
  useLogNewActivity: jest.fn(() => ({
    mutateAsync: jest.fn(() => Promise.resolve()),
  })),
}));

// ─── guest queries mock ───────────────────────────────────────────────────────
const mockUpdateGuestMutateAsync = jest.fn(() => Promise.resolve());
jest.mock("../../../../state/queries/guestQueries", () => ({
  useUpdateGuest: jest.fn(() => ({
    mutateAsync: mockUpdateGuestMutateAsync,
  })),
}));

// ─── logging mock ─────────────────────────────────────────────────────────────
jest.mock("../../../../util/logging", () => ({ logException: jest.fn() }));

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

// ─── useStatSummary mock ──────────────────────────────────────────────────────
const mockGetBarFillColor = jest.fn(() => "#009A39");

const defaultStatSummary = {
  guest: {
    id: "guest-1",
    userId: "user-1",
    houseId: "house-1",
    firstName: "Alice",
    lastName: "Smith",
    phase: "phase1",
    step: 2,
    currentChore: "Kitchen Cleaning",
  },
  house: {
    id: "house-1",
    name: "Test House",
    chores: {
      "Kitchen Cleaning": {
        description: "Clean the kitchen thoroughly each week.",
      },
    },
    phases: {
      phase1: {
        rules: { medications: true, meetings: 3, work: 20, chore: true },
      },
    },
    isDemoHouse: false,
  },
  user: { id: "user-1", firstName: "Alice", lastName: "Smith" },
  statSum: 1,
  phaseRule: 1,
  percentage: 100,
  disputes: 0,
  daysRemaining: 3,
  graphData: [
    { x: "01/01", y: 1 },
    { x: "01/08", y: 0 },
    { x: "01/15", y: 1 },
  ],
  getBarFillColor: mockGetBarFillColor,
  isLoading: false,
  reports: [],
};

jest.mock("../../../../hooks/useStatSummary", () => ({
  useStatSummary: jest.fn(() => defaultStatSummary),
}));

// ─── Guest util ───────────────────────────────────────────────────────────────
jest.mock("../../../../util/guest", () => ({
  getPhaseRule: jest.fn(() => 1),
  getPhaseRuleForStat: jest.fn(() => 1),
  getPercentage: jest.fn((val: number, rule: number) =>
    rule > 0 ? Math.round((val / rule) * 100) : 0
  ),
  getHealthByPercentage: jest.fn(() => "good"),
  HEALTH_COLOR_MAP: { good: "#009A39", fair: "#ffbf00", poor: "#bb0000" },
}));

// ─── Display util ─────────────────────────────────────────────────────────────
jest.mock("../../../../util/display", () => ({
  getCurrentTime: jest.fn(() => "2024-01-01T00:00:00.000Z"),
  getDateAndTime: jest.fn(() => "Jan 1, 2024"),
  camelCaseToDisplayForm: jest.fn((s: string) => s),
  getTodaysDate: jest.fn(() => "2024-01-01"),
  daysLeft: jest.fn(() => 3),
  getPickerItems: jest.fn(() => []),
  STAT_MAP: {
    medication: { label: "Medication", icon: "pills" },
    meeting: { label: "Meetings", icon: "users" },
    metPrimarySupporter: { label: "Sponsor", icon: "user" },
    hoursWorked: { label: "Work", icon: "briefcase" },
    choreCompleted: { label: "Chores", icon: "home" },
  },
}));

// ─── getPickerItems (also imported from util/display in the screen) ───────────
jest.mock("../../../../util/display", () => ({
  getCurrentTime: jest.fn(() => "2024-01-01T00:00:00.000Z"),
  getDateAndTime: jest.fn(() => "Jan 1, 2024"),
  camelCaseToDisplayForm: jest.fn((s: string) => s),
  getTodaysDate: jest.fn(() => "2024-01-01"),
  daysLeft: jest.fn(() => 3),
  getPickerItems: jest.fn(() => []),
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

// ─── Picker mock ──────────────────────────────────────────────────────────────
jest.mock("../../../../components/rats-picker/rats-picker", () => "RatsPicker");

// ─── Component stubs ──────────────────────────────────────────────────────────
jest.mock("../../../../components/rats-scroll-view", () => {
  const { ScrollView } = require("react-native");
  return ScrollView;
});

jest.mock("../../../../components/screen-header", () => "ScreenHeader");
jest.mock("../../../../components/help-icon", () => "HelpIcon");
jest.mock("../../../../components/rats-bar-graph", () => "RatsBarGraph");

// ─── React imports (after mocks) ─────────────────────────────────────────────
import React from "react";
import { render, fireEvent, waitFor } from "@testing-library/react-native";
import { Alert } from "react-native";
import { Provider } from "react-redux";
import { launchImageLibrary } from "react-native-image-picker";
import { uploadChoreEvidencePhoto } from "../../../../services/storage";
import { useLogNewActivity } from "../../../../state/queries/activityQueries";
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
import GuestChoreSummary from "../GuestChoreSummary";

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
      <GuestChoreSummary navigation={mockNavigation} />
    </Provider>
  );
}

// ─── Tests ────────────────────────────────────────────────────────────────────
describe("GuestChoreSummary", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (useStatSummary as jest.Mock).mockReturnValue(defaultStatSummary);
  });

  describe("Rendering", () => {
    it("renders without crashing", () => {
      const { getByTestId } = renderScreen();
      expect(getByTestId("chore-summary-screen")).toBeTruthy();
    });

    it("calls useStatSummary with the choreCompleted stat key", () => {
      renderScreen();
      expect(useStatSummary).toHaveBeenCalledWith("choreCompleted");
    });

    it("renders the chore name from guest.currentChore as the card header", () => {
      const { getByText } = renderScreen();
      expect(getByText("Kitchen Cleaning")).toBeTruthy();
    });

    it("renders the chore description from house.chores", () => {
      const { getByText } = renderScreen();
      expect(getByText("Clean the kitchen thoroughly each week.")).toBeTruthy();
    });

    it('falls back to "Weekly Chore" header when guest has no currentChore', () => {
      (useStatSummary as jest.Mock).mockReturnValue({
        ...defaultStatSummary,
        guest: { ...defaultStatSummary.guest, currentChore: undefined },
      });
      const { getByText } = renderScreen();
      expect(getByText("Weekly Chore")).toBeTruthy();
    });

    it("falls back to default description when chore is not found in house.chores", () => {
      (useStatSummary as jest.Mock).mockReturnValue({
        ...defaultStatSummary,
        guest: { ...defaultStatSummary.guest, currentChore: "Unknown Chore" },
      });
      const { getByText } = renderScreen();
      expect(
        getByText("Complete your assigned chore for this week.")
      ).toBeTruthy();
    });

    it("renders nothing for stat card when guest or house is null", () => {
      (useStatSummary as jest.Mock).mockReturnValue({
        ...defaultStatSummary,
        guest: null,
      });
      const { queryByText } = renderScreen();
      expect(queryByText("Kitchen Cleaning")).toBeNull();
    });
  });

  describe("Stat Data", () => {
    it("renders the stat sum and phase rule", () => {
      const { getByText } = renderScreen();
      // StatSummaryScreen WeekDetails renders "statSum of phaseRule"
      expect(getByText("1 of 1")).toBeTruthy();
    });

    it("renders disputes count when greater than 0", () => {
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
    it("renders the Change Chore button", () => {
      const { getByTestId } = renderScreen();
      expect(getByTestId("change-chore-button")).toBeTruthy();
    });

    it("renders the Complete Chore button", () => {
      const { getByTestId } = renderScreen();
      expect(getByTestId("complete-chore-button")).toBeTruthy();
    });

    it("shows photo attachment alert when Complete Chore is pressed", () => {
      const alertSpy = jest.spyOn(Alert, "alert").mockImplementation(() => {});
      const { getByTestId } = renderScreen();
      fireEvent.press(getByTestId("complete-chore-button"));
      expect(alertSpy).toHaveBeenCalledWith(
        "Attach Photo?",
        expect.any(String),
        expect.any(Array)
      );
      alertSpy.mockRestore();
    });

    it("calls showFormModal with the change chore title when Change Chore is pressed", () => {
      const { getByTestId } = renderScreen();
      fireEvent.press(getByTestId("change-chore-button"));
      expect(mockShowFormModal).toHaveBeenCalledWith(
        expect.anything(),
        "change.chore.modal.title",
        true
      );
    });

    it("does not call showFormModal for change chore when house is null", () => {
      (useStatSummary as jest.Mock).mockReturnValue({
        ...defaultStatSummary,
        house: null,
      });
      // With house null the stat card is not rendered, so buttons won't appear.
      // Confirm the screen still renders without crash.
      const { getByTestId } = renderScreen();
      expect(getByTestId("chore-summary-screen")).toBeTruthy();
      expect(mockShowFormModal).not.toHaveBeenCalled();
    });
  });

  describe("Bar Graph", () => {
    it("renders the bar graph section header", () => {
      const { getByText } = renderScreen();
      expect(getByText("LAST TWO MONTHS")).toBeTruthy();
    });

    it("does not render the main screen when isLoading is true and graphData is empty", () => {
      (useStatSummary as jest.Mock).mockReturnValue({
        ...defaultStatSummary,
        isLoading: true,
        graphData: [],
      });
      const { queryByTestId } = renderScreen();
      expect(queryByTestId("chore-summary-screen")).toBeNull();
    });
  });

  describe("Photo Evidence Flow", () => {
    it("logs chore activity without photo when user skips", async () => {
      const localMutateAsync = jest.fn(() => Promise.resolve());
      (useLogNewActivity as jest.Mock).mockReturnValue({
        mutateAsync: localMutateAsync,
      });

      const alertSpy = jest
        .spyOn(Alert, "alert")
        .mockImplementation((_title, _msg, buttons) => {
          // Simulate pressing "Skip"
          buttons?.[0]?.onPress?.();
        });

      const { getByTestId } = renderScreen();
      fireEvent.press(getByTestId("complete-chore-button"));

      await waitFor(() => {
        expect(localMutateAsync).toHaveBeenCalledWith(
          expect.objectContaining({
            type: "chore",
            data: expect.not.objectContaining({ photoUrl: expect.anything() }),
          })
        );
      });

      alertSpy.mockRestore();
    });

    it("uploads photo and includes photoUrl when user adds a photo", async () => {
      (launchImageLibrary as jest.Mock).mockResolvedValue({
        assets: [{ uri: "file:///tmp/chore.jpg" }],
      });

      const localMutateAsync = jest.fn(() => Promise.resolve());
      (useLogNewActivity as jest.Mock).mockReturnValue({
        mutateAsync: localMutateAsync,
      });

      const alertSpy = jest
        .spyOn(Alert, "alert")
        .mockImplementation((_title, _msg, buttons) => {
          // Simulate pressing "Add Photo"
          buttons?.[1]?.onPress?.();
        });

      const { getByTestId } = renderScreen();
      fireEvent.press(getByTestId("complete-chore-button"));

      await waitFor(() => {
        expect(uploadChoreEvidencePhoto).toHaveBeenCalledWith(
          "file:///tmp/chore.jpg",
          "house-1",
          expect.any(String)
        );
        expect(localMutateAsync).toHaveBeenCalledWith(
          expect.objectContaining({
            data: expect.objectContaining({
              photoUrl: "https://storage.example.com/photo.jpg",
            }),
          })
        );
      });

      alertSpy.mockRestore();
    });
  });
});
