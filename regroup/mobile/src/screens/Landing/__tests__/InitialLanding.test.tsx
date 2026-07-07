/**
 * InitialLanding Tests
 *
 * Covers:
 *  - Renders without crashing (testID on root SafeAreaView)
 *  - The RATS logo is rendered
 *  - The form section is rendered (via InitialLandingForm)
 *  - "How can we help?" heading is visible
 *  - "Have an account?" heading is visible
 *  - "SIGN IN" button is visible
 *  - "NEXT" button is visible
 *  - Pressing SIGN IN navigates to the Login route
 *  - "OR" divider text is present
 *  - "Want to try it out?" text is present
 *  - "Use the demo" link is present
 *  - Loading indicator shown when form is in loading state
 */

// ─── Navigation mock ──────────────────────────────────────────────────────────
jest.mock("@react-navigation/native-stack", () => ({}));

jest.mock("@react-navigation/native", () => ({
  useNavigation: jest.fn(() => ({
    navigate: jest.fn(),
    goBack: jest.fn(),
    canGoBack: jest.fn(() => false),
  })),
}));

// ─── firebase-setup mock ──────────────────────────────────────────────────────
jest.mock("../../../../firebase-setup", () => ({
  auth: {
    currentUser: null,
    signInWithEmailAndPassword: jest.fn(),
    onAuthStateChanged: jest.fn(() => () => {}),
  },
  firestore: {
    collection: jest.fn(() => ({
      doc: jest.fn(() => ({
        get: jest.fn(() =>
          Promise.resolve({ exists: false, data: () => null })
        ),
        set: jest.fn(() => Promise.resolve()),
      })),
    })),
    settings: jest.fn(),
  },
}));

// ─── Context mock ─────────────────────────────────────────────────────────────
jest.mock("../../../context", () => ({
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

// ─── Component stubs ──────────────────────────────────────────────────────────

jest.mock("../../../components/rats-logo/rats-logo", () => ({
  RatsLogoHorizontal: () => {
    const { View } = require("react-native");
    return require("react").createElement(View, {
      testID: "rats-logo-horizontal",
    });
  },
}));

jest.mock("../../../components/rats-text", () => ({
  RatsText: ({ text }: any) => {
    const { Text } = require("react-native");
    return require("react").createElement(Text, null, text || "");
  },
}));

jest.mock(
  "../../../components/rats-loading-indicator/rats-loading-indicator",
  () => {
    const { View } = require("react-native");
    return () =>
      require("react").createElement(View, { testID: "loading-indicator" });
  }
);

jest.mock("../../../components/rats-button/rats-button", () => {
  const { TouchableOpacity, Text } = require("react-native");
  return ({ title, onPress, testID, disabled }: any) =>
    require("react").createElement(
      TouchableOpacity,
      { testID: testID || `btn-${title}`, onPress, disabled },
      require("react").createElement(Text, null, title)
    );
});

jest.mock("../../../components/rats-radio-button-group", () => {
  const { View } = require("react-native");
  return () =>
    require("react").createElement(View, { testID: "radio-button-group" });
});

jest.mock("../../../components/rats-horizontal-rule", () => ({
  RatsHR: () => null,
}));

// ─── Platform util mock ───────────────────────────────────────────────────────
jest.mock("../../../util/platform", () => ({
  IOS: false,
  IS_X: false,
  ANDROID: true,
}));

// ─── Demo-login regression mocks ──────────────────────────────────────────────
// login is mocked to a plain-action creator so dispatching it doesn't invoke
// the real async thunk (which would hit Firebase auth). navigateToMain is
// mocked so we can assert the demo flow reaches it, rather than the regular
// Login screen.
jest.mock("../../../state/slices/userSlice", () => {
  const actual = jest.requireActual("../../../state/slices/userSlice");
  return {
    // Babel's `__esModule` marker on `actual` is non-enumerable
    // (`Object.defineProperty(exports, "__esModule", {value: true})`), so
    // `{...actual}` silently drops it — without it, `import userReducer from
    // '...'` treats this WHOLE mocked module object as the default export
    // instead of `actual.default`, breaking every default-import consumer.
    __esModule: true,
    ...actual,
    login: jest.fn((credentials: any) => ({
      type: "user/login/mocked",
      payload: credentials,
    })),
  };
});

jest.mock("../../../navigation/authNavigation", () => ({
  navigateAuthStackRoute: jest.fn(),
  navigateToMain: jest.fn(),
}));

// ─── React imports (after mocks) ──────────────────────────────────────────────
import React from "react";
import { render, fireEvent, act } from "@testing-library/react-native";
import { Provider } from "react-redux";
import { configureStore } from "@reduxjs/toolkit";

import userReducer from "../../../state/slices/userSlice";
import housesReducer from "../../../state/slices/housesSlice";
import guestsReducer from "../../../state/slices/guestsSlice";
import adminReducer from "../../../state/slices/adminSlice";
import authReducer from "../../../state/slices/authSlice";
import themeReducer from "../../../state/slices/themeSlice";
import chatReducer from "../../../state/slices/chatSlice";
import setupReducer from "../../../state/slices/setupSlice";
import notificationsReducer from "../../../state/slices/notificationsSlice";
import meetingsReducer from "../../../state/slices/meetingsSlice";

import InitialLanding from "../InitialLanding";

// ─── Store builder ─────────────────────────────────────────────────────────────

function buildStore(userState: any = {}) {
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
      user: {
        user: null,
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
        invitation: null,
        loginFailed: false,
        token: null,
        ...userState,
      } as any,
    },
  });
}

function renderScreen(userState: any = {}) {
  const store = buildStore(userState);
  return render(
    <Provider store={store}>
      <InitialLanding />
    </Provider>
  );
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe("InitialLanding", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  // ─── Smoke test ─────────────────────────────────────────────────────────────
  describe("smoke test", () => {
    it("renders without crashing", () => {
      const { getByTestId } = renderScreen();
      expect(getByTestId("initial-landing-screen")).toBeTruthy();
    });
  });

  // ─── Logo ────────────────────────────────────────────────────────────────────
  describe("logo", () => {
    it("renders the RATS logo", () => {
      const { getByTestId } = renderScreen();
      expect(getByTestId("rats-logo-horizontal")).toBeTruthy();
    });
  });

  // ─── Form content ────────────────────────────────────────────────────────────
  describe("form content", () => {
    it('shows the "How can we help?" heading', () => {
      const { getByText } = renderScreen();
      expect(getByText("How can we help?")).toBeTruthy();
    });

    it('shows the "Have an account?" heading', () => {
      const { getByText } = renderScreen();
      expect(getByText("Have an account?")).toBeTruthy();
    });

    it("renders the radio button group for user type selection", () => {
      const { getByTestId } = renderScreen();
      expect(getByTestId("radio-button-group")).toBeTruthy();
    });

    it("renders the NEXT button", () => {
      const { getByText } = renderScreen();
      expect(getByText("NEXT")).toBeTruthy();
    });

    it("renders the SIGN IN button", () => {
      const { getByTestId } = renderScreen();
      expect(getByTestId("sign-in-button")).toBeTruthy();
    });

    it('shows the "OR" divider', () => {
      const { getByText } = renderScreen();
      expect(getByText("OR")).toBeTruthy();
    });

    it('shows the "Want to try it out?" text', () => {
      const { getByText } = renderScreen();
      expect(getByText("Want to try it out?")).toBeTruthy();
    });

    it('shows the "Use the demo" link', () => {
      const { getByText } = renderScreen();
      expect(getByText("Use the demo")).toBeTruthy();
    });
  });

  // ─── Navigation ──────────────────────────────────────────────────────────────
  describe("navigation", () => {
    it("pressing SIGN IN calls navigation.navigate", async () => {
      const mockNavigate = jest.fn();
      const { useNavigation } = require("@react-navigation/native");
      useNavigation.mockReturnValue({
        navigate: mockNavigate,
        goBack: jest.fn(),
        canGoBack: jest.fn(() => false),
      });

      const { getByTestId } = renderScreen();
      const signInButton = getByTestId("sign-in-button");

      await act(async () => {
        fireEvent.press(signInButton);
      });

      expect(mockNavigate).toHaveBeenCalled();
    });

    // Regression coverage for 2026-07-05: "Use the demo" used to just call
    // navigation.navigate(Routes.Login) — identical to the SIGN IN button —
    // even though a fully-built demo-login flow (showDemo, using the seeded
    // demo_user@appdemo.net account) already existed in the same file and was
    // simply never wired to this link.
    it('pressing "Use the demo" logs in as the demo user and navigates to Main, not the regular Login screen', async () => {
      const { login } = require("../../../state/slices/userSlice");
      const { navigateToMain } = require("../../../navigation/authNavigation");
      const mockNavigate = jest.fn();
      const { useNavigation } = require("@react-navigation/native");
      useNavigation.mockReturnValue({
        navigate: mockNavigate,
        goBack: jest.fn(),
        canGoBack: jest.fn(() => false),
      });

      const { getByTestId } = renderScreen();

      await act(async () => {
        fireEvent.press(getByTestId("landing-demo-link"));
      });

      expect(login).toHaveBeenCalledWith({
        email: "demo_user@appdemo.net",
        password: "DemoUser1",
      });
      expect(navigateToMain).toHaveBeenCalled();
      expect(mockNavigate).not.toHaveBeenCalledWith("login");
    });
  });
});
