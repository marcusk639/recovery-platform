/**
 * OxfordDashboard tests
 *
 * Covers:
 *  - Paywall: upgrade prompt when oxfordEnabled is false / missing
 *  - Paywall: dashboard content when oxfordEnabled is true and onboarded
 *  - Hook order: non-Oxford house renders "not enabled" without React error
 *    (regression: useEffect previously sat below a conditional early return)
 *  - Onboarding redirect: navigates to wizard only when house is loaded AND
 *    is Oxford AND oxfordEnabled AND onboarding incomplete
 *  - Onboarding redirect: does NOT navigate while house is still loading
 *    (regression: !undefined === true previously triggered premature redirect)
 */

// ─── useSelectedHouse mock (reassignable per test) ───────────────────────────
const mockUseSelectedHouse = jest.fn();

jest.mock("../../../hooks/useSelectedHouse", () => ({
  useSelectedHouse: () => mockUseSelectedHouse(),
}));

jest.mock("@react-navigation/native-stack", () => ({}));
const mockOpenWebBilling = jest.fn((_page: string) => Promise.resolve(true));
jest.mock("../../../services/webBilling", () => ({
  openWebBilling: (page: string) => mockOpenWebBilling(page),
}));

// The catalog callable (Launch P5 Task 12). The price helpers stay real.
const mockGetTierCatalog = jest.fn((): Promise<any> => Promise.resolve(null));
jest.mock("../../../services/tierCatalog", () => ({
  ...jest.requireActual("../../../services/tierCatalog"),
  getTierCatalog: () => mockGetTierCatalog(),
}));

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
        collection: jest.fn().mockReturnThis(),
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

const mockUseOfficers = jest.fn((..._args: any[]) => ({ data: [] as any[] }));

jest.mock("../../../state/queries/oxfordQueries", () => ({
  useOfficers: (...args: any[]) => mockUseOfficers(...args),
  useBusinessMeetings: () => ({ data: [] }),
  useEESTransactions: () => ({ data: [] }),
}));

jest.mock("../../../state/queries/charterComplianceQueries", () => ({
  useCharterCompliance: () => ({
    summary: null,
    isLoading: false,
    isError: false,
  }),
}));

jest.mock("../../../state/queries/treasuryQueries", () => ({
  useCurrentWeekRecord: () => ({ data: null }),
}));

jest.mock("../../../components/oxford/CharterBadge", () => {
  const { View } = require("react-native");
  return () => <View testID="charter-badge-mock" />;
});

jest.mock("../../../components/screen-header", () => {
  const { View, Text } = require("react-native");
  return ({ header }: any) => (
    <View testID="screen-header">
      <Text>{header}</Text>
    </View>
  );
});

jest.mock("../../../components/rats-text", () => ({
  RatsText: ({ text, testID }: any) => {
    const { Text } = require("react-native");
    return <Text testID={testID}>{text}</Text>;
  },
}));

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

import React from "react";
import { render, fireEvent, waitFor, act } from "@testing-library/react-native";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Provider } from "react-redux";
import { configureStore } from "@reduxjs/toolkit";
import OxfordDashboard from "../OxfordDashboard";
import { Routes } from "../../../navigation/types";

type TestHouse = {
  id: string;
  houseType?: string;
  oxfordOnboardingComplete?: boolean;
} | null;

const makeStore = (oxfordEnabled: boolean | undefined) =>
  configureStore({
    reducer: {
      houses: () => ({ selectedHouse: null }),
      user: () => ({
        user: {
          subscriptionMetadata:
            oxfordEnabled === undefined ? {} : { oxfordEnabled },
        },
      }),
      guests: () => ({ guests: {} }),
    },
  });

const setSelectedHouse = (house: TestHouse) => {
  mockUseSelectedHouse.mockReturnValue({
    house: house ?? undefined,
    houseId: house?.id ?? "",
    isLoading: house === null,
  });
};

const mockNavigate = jest.fn();
const navigation = { navigate: mockNavigate, goBack: jest.fn() } as any;

function renderScreen(oxfordEnabled: boolean | undefined, house: TestHouse) {
  setSelectedHouse(house);
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <Provider store={makeStore(oxfordEnabled)}>
        <OxfordDashboard navigation={navigation} />
      </Provider>
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  mockNavigate.mockClear();
  mockUseOfficers.mockReturnValue({ data: [] });
  mockGetTierCatalog.mockReset();
  mockGetTierCatalog.mockResolvedValue(null);
});

describe("OxfordDashboard — paywall", () => {
  const OXFORD_ONBOARDED = {
    id: "h1",
    houseType: "oxford",
    oxfordOnboardingComplete: true,
  };

  it("shows upgrade prompt when oxfordEnabled is false", () => {
    const { getByTestId } = renderScreen(false, OXFORD_ONBOARDED);
    expect(getByTestId("oxford-upgrade-prompt")).toBeTruthy();
  });

  it("shows upgrade prompt when subscriptionMetadata has no oxfordEnabled field", () => {
    const { getByTestId } = renderScreen(undefined, OXFORD_ONBOARDED);
    expect(getByTestId("oxford-upgrade-prompt")).toBeTruthy();
  });

  it("shows dashboard content when oxfordEnabled is true and onboarding complete", () => {
    const { getByTestId } = renderScreen(true, OXFORD_ONBOARDED);
    expect(getByTestId("oxford-dashboard-content")).toBeTruthy();
  });

  it("opens plan management in the browser when upgrade button is pressed", () => {
    const { getByTestId } = renderScreen(false, OXFORD_ONBOARDED);
    fireEvent.press(getByTestId("oxford-upgrade-button"));
    expect(mockOpenWebBilling).toHaveBeenCalledWith("my-account");
    expect(mockNavigate).not.toHaveBeenCalledWith(Routes.SubscriptionHandler);
  });
});

describe("OxfordDashboard — hook order regression", () => {
  // These scenarios used to crash with "Rendered fewer hooks than expected"
  // when the useEffect was placed below the `if (!house || houseType !== oxford)`
  // early return. After fix, hooks run unconditionally and the early return
  // path no longer changes hook count between renders.

  it('renders "not enabled" message for non-Oxford house without React error', () => {
    const nonOxfordHouse = { id: "h1", houseType: "standard" };
    const { getByText } = renderScreen(true, nonOxfordHouse);
    expect(
      getByText("Oxford House features are not enabled for this house."),
    ).toBeTruthy();
  });

  it('renders "not enabled" message for non-Oxford house even when oxfordEnabled is true', () => {
    // Edge case: stale subscription metadata flag while user switches to a
    // non-Oxford house. Must not crash and must not redirect to wizard.
    const nonOxfordHouse = { id: "h2", houseType: "standard" };
    const { getByText } = renderScreen(true, nonOxfordHouse);
    expect(
      getByText("Oxford House features are not enabled for this house."),
    ).toBeTruthy();
    expect(mockNavigate).not.toHaveBeenCalled();
  });
});

describe("OxfordDashboard — onboarding redirect", () => {
  it("navigates to OxfordOnboardingWizard when Oxford house has onboarding incomplete", () => {
    const oxfordNotOnboarded = {
      id: "h1",
      houseType: "oxford",
      oxfordOnboardingComplete: false,
    };
    renderScreen(true, oxfordNotOnboarded);
    expect(mockNavigate).toHaveBeenCalledWith(Routes.OxfordOnboardingWizard);
  });

  it("does NOT navigate when Oxford house has onboarding complete", () => {
    const oxfordOnboarded = {
      id: "h1",
      houseType: "oxford",
      oxfordOnboardingComplete: true,
    };
    renderScreen(true, oxfordOnboarded);
    expect(mockNavigate).not.toHaveBeenCalled();
  });

  it("does NOT navigate while house is still loading (undefined)", () => {
    // Regression test: !house?.oxfordOnboardingComplete used to be true when
    // house was undefined, triggering a premature redirect before the house
    // document arrived from Firestore.
    renderScreen(true, null);
    expect(mockNavigate).not.toHaveBeenCalled();
  });

  it("does NOT navigate when Oxford is disabled even with incomplete onboarding flag", () => {
    const oxfordNotOnboarded = {
      id: "h1",
      houseType: "oxford",
      oxfordOnboardingComplete: false,
    };
    renderScreen(false, oxfordNotOnboarded);
    expect(mockNavigate).not.toHaveBeenCalled();
  });
});

describe("OxfordDashboard — officer name display", () => {
  const OXFORD_ONBOARDED = {
    id: "h1",
    houseType: "oxford",
    oxfordOnboardingComplete: true,
  };

  it("shows officer.name from onboarding when no guest matches the officer's userId", () => {
    mockUseOfficers.mockReturnValue({
      data: [
        {
          id: "officer-1",
          houseId: "h1",
          role: "president",
          name: "Jane Doe",
          isActive: true,
          // No userId — created during onboarding, never linked to a guest account.
        },
      ],
    });
    const { getByText, queryByText } = renderScreen(true, OXFORD_ONBOARDED);
    expect(getByText("Jane Doe")).toBeTruthy();
    expect(queryByText("Unknown")).toBeNull();
  });

  it('falls back to "Unknown" when officer has neither a matching guest nor a name', () => {
    mockUseOfficers.mockReturnValue({
      data: [
        {
          id: "officer-1",
          houseId: "h1",
          role: "president",
          isActive: true,
        },
      ],
    });
    const { getByText } = renderScreen(true, OXFORD_ONBOARDED);
    expect(getByText("Unknown")).toBeTruthy();
  });
});

// Launch P5 Task 12: the upgrade card's price and trial come from the catalog.
describe("OxfordDashboard — upgrade card from the catalog", () => {
  const OXFORD_ONBOARDED = {
    id: "h1",
    houseType: "oxford",
    oxfordOnboardingComplete: true,
  };
  const oxfordTier = (tier: string, amountCents: number, availableForSale = true) => ({
    houseType: "oxford",
    tier,
    label: tier,
    maxResidents: 15,
    maxProperties: 1,
    availableForSale,
    prices: { month: { amountCents }, year: null },
  });
  const catalog = {
    currency: "usd",
    tiers: [
      oxfordTier("plus", 8900),
      oxfordTier("standard", 4900),
      oxfordTier("network", 2900, false),
    ],
    trialDays: 7,
    salesOpen: true,
  };
  // Owner decision 2026-11-27: the trial note, shown only with a trial.
  const TRIAL_NOTE = "No charge during your free trial";

  it("shows the catalog's price and trial: $49/month and Start 7-Day Free Trial", async () => {
    mockGetTierCatalog.mockResolvedValue(catalog);
    const { findByText, getByText, queryByText } = renderScreen(false, OXFORD_ONBOARDED);
    expect(await findByText("Start 7-Day Free Trial")).toBeTruthy();
    expect(getByText("Oxford Plan — from $49/month")).toBeTruthy();
    expect(getByText(TRIAL_NOTE)).toBeTruthy();
    expect(queryByText("No payment required to start")).toBeNull();
    expect(queryByText(/14-Day/)).toBeNull();
    expect(mockGetTierCatalog).toHaveBeenCalledTimes(1);
  });

  it("with the catalog null, shows See plans and no number", async () => {
    mockGetTierCatalog.mockResolvedValue(null);
    const { findByText, findByTestId, getByText, toJSON } = renderScreen(
      false,
      OXFORD_ONBOARDED,
    );
    await waitFor(() => expect(mockGetTierCatalog).toHaveBeenCalled());
    await act(async () => {}); // let the query settle on null
    // The settled marker the BILL-008 flow waits for.
    expect(await findByTestId("oxford-upgrade-cta")).toBeTruthy();
    expect(await findByText("See plans")).toBeTruthy();
    expect(getByText("Oxford Plan")).toBeTruthy();
    const text = JSON.stringify(toJSON());
    expect(text).not.toMatch(/\$\d/);
    expect(text).not.toMatch(/\d+-Day/i);
    expect(text).not.toMatch(/free trial/i);
    expect(text).not.toContain("No payment required");
  });

  it("with sales closed, shows the price but no trial, and See plans", async () => {
    mockGetTierCatalog.mockResolvedValue({ ...catalog, salesOpen: false });
    const { findByText, getByText, queryByText } = renderScreen(false, OXFORD_ONBOARDED);
    // "See plans" also shows while loading: wait for the catalog's price first.
    expect(await findByText("Oxford Plan — from $49/month")).toBeTruthy();
    expect(getByText("See plans")).toBeTruthy();
    expect(queryByText(/Free Trial/)).toBeNull();
    expect(queryByText(TRIAL_NOTE)).toBeNull();
    expect(queryByText("No payment required to start")).toBeNull();
  });

  it("with no trial in the catalog, offers the plan without a trial", async () => {
    mockGetTierCatalog.mockResolvedValue({ ...catalog, trialDays: 0 });
    const { findByText, getByText, queryByText } = renderScreen(false, OXFORD_ONBOARDED);
    expect(await findByText("Oxford Plan — from $49/month")).toBeTruthy();
    expect(getByText("See plans")).toBeTruthy();
    expect(queryByText(/Free Trial/)).toBeNull();
    expect(queryByText(TRIAL_NOTE)).toBeNull();
  });

  it("marks the CTA as loading until the catalog settles", async () => {
    let resolve: (value: unknown) => void = () => {};
    mockGetTierCatalog.mockReturnValue(new Promise((r) => (resolve = r)));
    const { getByTestId, findByTestId, queryByTestId } = renderScreen(false, OXFORD_ONBOARDED);
    expect(getByTestId("oxford-upgrade-cta-loading")).toBeTruthy();
    expect(queryByTestId("oxford-upgrade-cta")).toBeNull();
    await act(async () => resolve(catalog));
    expect(await findByTestId("oxford-upgrade-cta")).toBeTruthy();
    expect(queryByTestId("oxford-upgrade-cta-loading")).toBeNull();
  });

  it("does not fetch the catalog once Oxford is enabled", () => {
    renderScreen(true, OXFORD_ONBOARDED);
    expect(mockGetTierCatalog).not.toHaveBeenCalled();
  });

  it("the button opens plan management in the browser whatever the catalog says", async () => {
    mockGetTierCatalog.mockResolvedValue(null);
    const { findByTestId } = renderScreen(false, OXFORD_ONBOARDED);
    fireEvent.press(await findByTestId("oxford-upgrade-button"));
    expect(mockOpenWebBilling).toHaveBeenCalledWith("my-account");
  });
});
