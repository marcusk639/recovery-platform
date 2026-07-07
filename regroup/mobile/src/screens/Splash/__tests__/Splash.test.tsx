/**
 * Splash Screen Tests
 *
 * Covers:
 *  - Renders loading state (logo visible while appIsReady is false)
 *  - RatsLogo component is present during splash phase
 *  - Wrapped component renders once user state is ready (appIsReady = true)
 *  - Navigates to main app when authenticated user is present in Redux state
 *  - Stays on splash (shows logo) when no user is present
 *  - Firebase messaging permission is requested after user authenticates
 *  - Firebase messaging background handler is registered on mount
 *  - Auth subscription is cleaned up on unmount
 *  - Deep link listener is cleaned up on unmount
 *  - Deep link with invitation type dispatches initializeInvitation
 */

// ─── Navigation mock ──────────────────────────────────────────────────────────
jest.mock("@react-navigation/native-stack", () => ({}));

jest.mock("@react-navigation/native", () => ({
  useNavigation: jest.fn(() => ({
    navigate: jest.fn(),
    goBack: jest.fn(),
    canGoBack: jest.fn(() => false),
  })),
  CommonActions: { reset: jest.fn((p: any) => p) },
}));

// ─── firebase-setup mock ──────────────────────────────────────────────────────
jest.mock("../../../firebase-setup", () => ({
  firestore: { collection: jest.fn(() => ({ doc: jest.fn(() => ({})) })) },
  functions: { httpsCallable: jest.fn() },
  auth: {
    currentUser: null,
    onAuthStateChanged: jest.fn((cb: any) => {
      cb(null);
      return jest.fn();
    }),
  },
}));

// ─── @react-native-firebase/auth mock ────────────────────────────────────────
// NOTE: jest.mock factories are hoisted to the top of the file by Babel. Variables
// that need to be referenced inside a factory must be declared with var (hoistable),
// not const/let, OR the factory must use require() to get them lazily.
// We use module-level var declarations so they are visible after hoisting.

jest.mock("@react-native-firebase/auth", () => {
  const authFn = jest.fn(() => ({
    currentUser: null,
    // onAuthStateChanged is pulled lazily from the module-level variable below
    get onAuthStateChanged() {
      // eslint-disable-next-line @typescript-eslint/no-use-before-define
      return (global as any).__splashTestOnAuthStateChanged;
    },
  }));
  return { __esModule: true, default: authFn, FirebaseAuthTypes: {} };
});

// ─── @react-native-firebase/messaging mock ────────────────────────────────────
jest.mock("@react-native-firebase/messaging", () => ({
  __esModule: true,
  default: () => ({
    get requestPermission() {
      return (global as any).__splashTestRequestPermission;
    },
    get getToken() {
      return (global as any).__splashTestGetToken;
    },
    get onMessage() {
      return (global as any).__splashTestOnMessage;
    },
    get onNotificationOpenedApp() {
      return jest.fn(() => jest.fn());
    },
    get getInitialNotification() {
      return jest.fn().mockResolvedValue(null);
    },
    get setBackgroundMessageHandler() {
      return (global as any).__splashTestSetBGHandler;
    },
    get onTokenRefresh() {
      return (global as any).__splashTestOnTokenRefresh;
    },
  }),
}));

// ─── @react-native-firebase/firestore mock ────────────────────────────────────
jest.mock("@react-native-firebase/firestore", () => ({
  firebase: {},
  FirebaseFirestoreTypes: {},
}));

// ─── Native deep links mock ───────────────────────────────────────────────────
jest.mock("../../../services/native-deep-links", () => ({
  get getInitialLink() {
    return (global as any).__splashTestGetInitialLink;
  },
  get onLink() {
    return (global as any).__splashTestOnLink;
  },
  get getLinkType() {
    return (global as any).__splashTestGetLinkType;
  },
  get createInvitationFromLink() {
    return (global as any).__splashTestCreateInvitationFromLink;
  },
}));

// ─── Linking mock ─────────────────────────────────────────────────────────────
jest.mock("react-native/Libraries/Linking/Linking", () => ({
  getInitialURL: jest.fn().mockResolvedValue(null),
  addEventListener: jest.fn(() => ({ remove: jest.fn() })),
  canOpenURL: jest.fn().mockResolvedValue(false),
  openURL: jest.fn().mockResolvedValue(undefined),
}));

// ─── Debug deep links service mock (used by DeepLinkTester) ──────────────────
jest.mock("../../../services/debug-deep-links", () => ({
  testDeepLinkCapability: jest.fn().mockResolvedValue(false),
  testOpenDeepLink: jest.fn().mockResolvedValue(undefined),
  debugConfig: {
    testUrls: {
      invitation: "regroup-app://?type=invitation",
      universalInvitation: "https://regroup-app.com/?type=invitation",
    },
  },
}));

// ─── SimpleDebugLogViewer mock ────────────────────────────────────────────────
jest.mock("../../../components/SimpleDebugLogViewer", () => ({
  SimpleDebugLogViewer: () => null,
}));

// ─── Util mocks ───────────────────────────────────────────────────────────────
jest.mock("../../../util/logging", () => ({ logException: jest.fn() }));

jest.mock("../../../util/simple-debug-logger", () => ({
  logDebug: jest.fn(),
  logError: jest.fn(),
  logWarn: jest.fn(),
  logInfo: jest.fn(),
  simpleDebugLogger: {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
    getLogs: jest.fn(() => []),
    clearLogs: jest.fn(),
  },
}));

jest.mock("../../../util/subscription", () => ({
  subscriptionStatus: jest.fn().mockReturnValue("active"),
}));

// display.tsx exports `wait` — must be mocked to prevent real timers
jest.mock("../../../util/display.tsx", () => ({
  wait: jest.fn().mockResolvedValue(undefined),
  normalize: jest.fn((n: number) => n),
  dayIsAfter: jest.fn(() => false),
  getTodaysDate: jest.fn(() => new Date()),
  toDate: jest.fn((d: any) => d),
}));

// ─── Styles mock ──────────────────────────────────────────────────────────────
jest.mock("../../../styles/theme", () => ({
  normalize: jest.fn((n: number) => n),
  themes: { default: { primaryColor: "#000", secondaryColor: "#fff" } },
}));

// ─── Navigation service mock ──────────────────────────────────────────────────
jest.mock("../../../navigation/service", () => ({
  navigationRef: { current: null },
}));

// ─── Component stubs ──────────────────────────────────────────────────────────
jest.mock("../../../components/rats-logo", () => ({
  RatsLogo: () => {
    const { View } = require("react-native");
    return require("react").createElement(View, { testID: "rats-logo" });
  },
  RatsLogoHorizontal: () => {
    const { View } = require("react-native");
    return require("react").createElement(View, {
      testID: "rats-logo-horizontal",
    });
  },
}));

jest.mock("../../../components/DeepLinkTester", () => ({
  DeepLinkTester: () => null,
}));

// ─── Redux action creators mock ───────────────────────────────────────────────
// Full mock of the userSlice module prevents transitive imports from loading
// the real service layer (which would fail due to missing native modules).
jest.mock("../../../state/slices/userSlice", () => ({
  get autoLogin() {
    return (global as any).__splashTestAutoLogin;
  },
  get anonymouslyLogin() {
    return (global as any).__splashTestAnonLogin;
  },
  get loginFailedAction() {
    return (global as any).__splashTestLoginFailed;
  },
  get initializeInvitation() {
    return (global as any).__splashTestInitInvitation;
  },
  get updateUser() {
    return (global as any).__splashTestUpdateUser;
  },
}));

// ─── Redux store mock (useAppSelector / useAppDispatch) ───────────────────────
jest.mock("../../../state/store", () => ({
  useAppDispatch: () => (global as any).__splashTestDispatch,
  useAppSelector: (selector: (state: any) => any) =>
    selector({ user: (global as any).__splashTestUserState }),
}));

// ─── Imports (must come after all jest.mock() calls) ─────────────────────────
import React from "react";
import { View, Text } from "react-native";
import { render, act } from "@testing-library/react-native";

import { withSplash } from "../Splash";

// ─── Mock implementations (assigned as globals so lazy getters can access them)

const mockUnsubscribeAuth = jest.fn();
const mockOnAuthStateChanged = jest.fn();
const mockRequestPermission = jest.fn().mockResolvedValue(1);
const mockGetToken = jest.fn().mockResolvedValue("mock-fcm-token");
const mockOnMessage = jest.fn(() => jest.fn());
const mockSetBGHandler = jest.fn();
const mockOnTokenRefresh = jest.fn(() => jest.fn());
const mockGetInitialLink = jest.fn().mockResolvedValue(null);
const mockOnLink = jest.fn(() => jest.fn());
const mockGetLinkType = jest.fn().mockReturnValue(null);
const mockCreateInvitationFromLink = jest.fn();
const mockAutoLogin = jest.fn();
const mockAnonLogin = jest.fn();
const mockUpdateUser = jest.fn((arg: any) => ({
  type: "user/updateUser",
  arg,
  unwrap: jest.fn().mockResolvedValue({}),
}));
const mockLoginFailed = jest.fn(() => ({ type: "user/loginFailed" }));
const mockInitInvitation = jest.fn((inv: any) => ({
  type: "user/initializeInvitation",
  payload: inv,
}));
const mockDispatch = jest.fn();

// Assign to global so lazy getters in jest.mock() factories can access them
(global as any).__splashTestOnAuthStateChanged = mockOnAuthStateChanged;
(global as any).__splashTestRequestPermission = mockRequestPermission;
(global as any).__splashTestGetToken = mockGetToken;
(global as any).__splashTestOnMessage = mockOnMessage;
(global as any).__splashTestSetBGHandler = mockSetBGHandler;
(global as any).__splashTestOnTokenRefresh = mockOnTokenRefresh;
(global as any).__splashTestGetInitialLink = mockGetInitialLink;
(global as any).__splashTestOnLink = mockOnLink;
(global as any).__splashTestGetLinkType = mockGetLinkType;
(global as any).__splashTestCreateInvitationFromLink =
  mockCreateInvitationFromLink;
(global as any).__splashTestAutoLogin = mockAutoLogin;
(global as any).__splashTestAnonLogin = mockAnonLogin;
(global as any).__splashTestUpdateUser = mockUpdateUser;
(global as any).__splashTestLoginFailed = mockLoginFailed;
(global as any).__splashTestInitInvitation = mockInitInvitation;
(global as any).__splashTestDispatch = mockDispatch;
(global as any).__splashTestUserState = {};

// ─── Base user state fixture ──────────────────────────────────────────────────

const baseUserState = {
  user: null as any,
  loading: false,
  creatingUser: false,
  loggingIn: false,
  loggingOut: false,
  loggingOutSuccessful: false,
  loggedIn: false,
  error: null,
  updating: false,
  updatingFailed: false,
  updatingSuccessful: false,
  signUpRole: null,
  invitation: null as any,
  loginFailed: false,
  token: null,
  accountVerifyFailed: false,
  houseCodeErrorMessage: null,
  autoLoggingIn: false,
  anonLoggingIn: false,
  anonUser: null,
  anonymous: false,
  subscriptionStatus: null,
};

// ─── Test component factory ────────────────────────────────────────────────────

const WrappedContent = () =>
  React.createElement(
    View,
    { testID: "wrapped-component" },
    React.createElement(Text, null, "Authenticated Content")
  );

const SplashHOC = withSplash(WrappedContent);

function renderSplash(userState: Partial<typeof baseUserState> = {}) {
  (global as any).__splashTestUserState = { ...baseUserState, ...userState };
  const mockNavigation = {
    navigate: jest.fn(),
    goBack: jest.fn(),
    reset: jest.fn(),
  };
  const utils = render(<SplashHOC navigation={mockNavigation as any} />);
  return { mockNavigation, ...utils };
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe("Splash (withSplash HOC)", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (global as any).__splashTestUserState = { ...baseUserState };

    // Restore global refs after clearAllMocks() resets them
    (global as any).__splashTestOnAuthStateChanged = mockOnAuthStateChanged;
    (global as any).__splashTestRequestPermission = mockRequestPermission;
    (global as any).__splashTestGetToken = mockGetToken;
    (global as any).__splashTestOnMessage = mockOnMessage;
    (global as any).__splashTestSetBGHandler = mockSetBGHandler;
    (global as any).__splashTestOnTokenRefresh = mockOnTokenRefresh;
    (global as any).__splashTestGetInitialLink = mockGetInitialLink;
    (global as any).__splashTestOnLink = mockOnLink;
    (global as any).__splashTestGetLinkType = mockGetLinkType;
    (global as any).__splashTestCreateInvitationFromLink =
      mockCreateInvitationFromLink;
    (global as any).__splashTestAutoLogin = mockAutoLogin;
    (global as any).__splashTestAnonLogin = mockAnonLogin;
    (global as any).__splashTestUpdateUser = mockUpdateUser;
    (global as any).__splashTestLoginFailed = mockLoginFailed;
    (global as any).__splashTestInitInvitation = mockInitInvitation;
    (global as any).__splashTestDispatch = mockDispatch;

    // Default: auth fires with null (unauthenticated) and returns unsubscribe fn
    mockOnAuthStateChanged.mockImplementation((cb: (u: null) => void) => {
      cb(null);
      return mockUnsubscribeAuth;
    });

    // Default dispatch: passes through, supports thunk-like objects with .unwrap()
    mockDispatch.mockImplementation((action: any) => {
      if (action && typeof action.unwrap === "function") return action;
      return Promise.resolve({ payload: null });
    });

    // Default thunks return thunk-like objects with .unwrap()
    mockAutoLogin.mockReturnValue({
      type: "user/autoLogin",
      unwrap: jest.fn().mockResolvedValue({}),
    });
    mockAnonLogin.mockReturnValue({
      type: "user/anonymouslyLogin",
      unwrap: jest.fn().mockResolvedValue({}),
    });

    mockGetInitialLink.mockResolvedValue(null);
    mockOnLink.mockReturnValue(jest.fn());
    mockGetLinkType.mockReturnValue(null);
    mockRequestPermission.mockResolvedValue(1);
    mockGetToken.mockResolvedValue("mock-fcm-token");
    mockOnMessage.mockReturnValue(jest.fn());
    mockOnTokenRefresh.mockReturnValue(jest.fn());
  });

  // ─── Rendering: loading state ────────────────────────────────────────────────

  describe("initial render — loading state", () => {
    it("renders without crashing", () => {
      const { toJSON } = renderSplash();
      expect(toJSON()).not.toBeNull();
    });

    it("shows the RatsLogo while appIsReady is false (no user in state)", () => {
      const { getByTestId } = renderSplash({ user: null, invitation: null });
      expect(getByTestId("rats-logo")).toBeTruthy();
    });

    it("does not render the wrapped component while loading", () => {
      const { queryByTestId } = renderSplash({ user: null, invitation: null });
      expect(queryByTestId("wrapped-component")).toBeNull();
    });
  });

  // ─── Rendering: ready state ───────────────────────────────────────────────────

  describe("ready state — user present in Redux state", () => {
    it("renders the wrapped component when a user is in state", async () => {
      const { getByTestId } = renderSplash({
        user: { uid: "user-123", email: "test@example.com" },
      });
      await act(async () => {});
      expect(getByTestId("wrapped-component")).toBeTruthy();
    });

    it("hides the logo once the wrapped component is shown", async () => {
      const { queryByTestId } = renderSplash({
        user: { uid: "user-123", email: "test@example.com" },
      });
      await act(async () => {});
      expect(queryByTestId("rats-logo")).toBeNull();
    });

    it("shows wrapped component when an invitation is present (no user required)", async () => {
      const { getByTestId } = renderSplash({
        invitation: {
          id: "inv-1",
          type: "guest",
          houseId: "h1",
          inviterId: "",
          ownerId: "",
          email: "g@e.com",
          initialPhase: "Basic",
          expirationDate: new Date(),
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        },
      });
      await act(async () => {});
      expect(getByTestId("wrapped-component")).toBeTruthy();
    });

    it("shows wrapped component once auth resolves to no-user (loginFailed) so a no-account user reaches the landing screen", async () => {
      // A prospective resident with no account must not be trapped on the
      // splash screen waiting for a background anonymous login. Once auth has
      // resolved to "no user" (loginFailed), the app is ready and renders the
      // unauthenticated stack (landing → browse).
      const { getByTestId } = renderSplash({
        user: null,
        invitation: null,
        loginFailed: true,
      });
      await act(async () => {});
      expect(getByTestId("wrapped-component")).toBeTruthy();
    });
  });

  // ─── Firebase messaging ──────────────────────────────────────────────────────

  describe("Firebase messaging", () => {
    it("registers a background message handler on mount", async () => {
      renderSplash();
      await act(async () => {});
      expect(mockSetBGHandler).toHaveBeenCalledTimes(1);
    });

    it("subscribes to foreground messages via onMessage on mount", async () => {
      renderSplash();
      await act(async () => {});
      expect(mockOnMessage).toHaveBeenCalledTimes(1);
    });

    it("requests messaging permission when a user is present in state", async () => {
      renderSplash({ user: { uid: "user-123", email: "test@example.com" } });
      await act(async () => {});
      expect(mockRequestPermission).toHaveBeenCalledTimes(1);
    });

    it("does not request messaging permission when no user is in state", async () => {
      renderSplash({ user: null });
      await act(async () => {});
      expect(mockRequestPermission).not.toHaveBeenCalled();
    });

    // Regression coverage for 2026-07-05: updateTokenIfNecessary had both its
    // branches commented out with a stale "should be imported if available"
    // note, so no messaging token was ever persisted anywhere — push
    // notifications could never reach any user.
    describe("messaging token persistence", () => {
      it("dispatches updateUser with the token when the user has no messagingToken yet", async () => {
        renderSplash({
          user: { uid: "user-123", email: "test@example.com" } as any,
        });
        await act(async () => {});

        expect(mockUpdateUser).toHaveBeenCalledWith({
          user: { uid: "user-123", email: "test@example.com" },
          updates: { messagingToken: ["mock-fcm-token"] },
        });
      });

      it("dispatches updateUser appending the token when the user has a different token", async () => {
        renderSplash({
          user: {
            uid: "user-123",
            email: "test@example.com",
            messagingToken: ["old-token"],
          } as any,
        });
        await act(async () => {});

        expect(mockUpdateUser).toHaveBeenCalledWith({
          user: {
            uid: "user-123",
            email: "test@example.com",
            messagingToken: ["old-token"],
          },
          updates: { messagingToken: ["old-token", "mock-fcm-token"] },
        });
      });

      it("does not dispatch updateUser when the token is already persisted", async () => {
        renderSplash({
          user: {
            uid: "user-123",
            email: "test@example.com",
            messagingToken: ["mock-fcm-token"],
          } as any,
        });
        await act(async () => {});

        expect(mockUpdateUser).not.toHaveBeenCalled();
      });

      it("does not dispatch updateUser while a user update is already in progress", async () => {
        renderSplash({
          user: { uid: "user-123", email: "test@example.com" } as any,
          updating: true,
        });
        await act(async () => {});

        expect(mockUpdateUser).not.toHaveBeenCalled();
      });
    });
  });

  // ─── Deep link handling ──────────────────────────────────────────────────────

  describe("deep link handling", () => {
    it("registers a deep link listener via onLink on mount", async () => {
      renderSplash();
      await act(async () => {});
      expect(mockOnLink).toHaveBeenCalledTimes(1);
    });

    it("checks for an initial deep link when no invitation exists in state", async () => {
      renderSplash({ invitation: null });
      await act(async () => {});
      expect(mockGetInitialLink).toHaveBeenCalledTimes(1);
    });

    it("skips initial deep link check when invitation already exists in state", async () => {
      renderSplash({
        invitation: {
          id: "inv-1",
          type: "guest",
          houseId: "h1",
          inviterId: "",
          ownerId: "",
          email: "g@e.com",
          initialPhase: "Basic",
          expirationDate: new Date(),
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        },
      });
      await act(async () => {});
      expect(mockGetInitialLink).not.toHaveBeenCalled();
    });

    it("dispatches initializeInvitation when initial link has invitation type", async () => {
      const invitationLink = {
        url: "regroup-app://?type=invitation&house=h1&email=a@b.com",
      };
      mockGetInitialLink.mockResolvedValueOnce(invitationLink);
      mockGetLinkType.mockReturnValueOnce("invitation");
      const invPayload = {
        id: "",
        type: "guest",
        houseId: "h1",
        inviterId: "",
        ownerId: "",
        email: "a@b.com",
        initialPhase: "",
        expirationDate: new Date(),
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
      mockCreateInvitationFromLink.mockReturnValueOnce(invPayload);

      renderSplash({ invitation: null });
      await act(async () => {});

      expect(mockCreateInvitationFromLink).toHaveBeenCalledWith(invitationLink);
      expect(mockInitInvitation).toHaveBeenCalledTimes(1);
      expect(mockDispatch).toHaveBeenCalledWith(
        expect.objectContaining({ type: "user/initializeInvitation" })
      );
    });
  });

  // ─── Cleanup on unmount ──────────────────────────────────────────────────────

  describe("cleanup on unmount", () => {
    it("calls the auth unsubscribe when component unmounts", async () => {
      mockOnAuthStateChanged.mockImplementationOnce((cb: (u: null) => void) => {
        cb(null);
        return mockUnsubscribeAuth;
      });

      const { unmount } = renderSplash();
      await act(async () => {});
      act(() => {
        unmount();
      });

      expect(mockUnsubscribeAuth).toHaveBeenCalledTimes(1);
    });

    it("calls the deep link unsubscribe when component unmounts", async () => {
      const linkUnsub = jest.fn();
      mockOnLink.mockReturnValueOnce(linkUnsub);

      const { unmount } = renderSplash();
      await act(async () => {});
      act(() => {
        unmount();
      });

      expect(linkUnsub).toHaveBeenCalledTimes(1);
    });
  });
});
