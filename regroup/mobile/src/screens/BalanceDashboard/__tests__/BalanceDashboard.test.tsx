import React from "react";
import { render } from "@testing-library/react-native";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import BalanceDashboard from "../BalanceDashboard";

jest.mock("../../../components/rats-text/rats-text", () => {
  const { Text } = require("react-native");
  return ({ text }: any) => <Text>{String(text ?? "")}</Text>;
});

jest.mock("../../../components/screen-header", () => {
  const { View, Text } = require("react-native");
  return ({ header }: any) => (
    <View>
      <Text>{header}</Text>
    </View>
  );
});

jest.mock("../../../context/DataContext", () => ({
  useData: () => ({
    currentHouse: { id: "house-1", monthlyRent: 1200 },
  }),
}));

jest.mock("../../../state/queries/paymentQueries", () => ({
  useGuestBalances: jest.fn(),
}));

jest.mock("../../../state/store", () => ({
  useAppSelector: () => [
    { id: "g1", displayName: "John Doe", rentOwed: 600, choreFees: 50 },
    { id: "g2", displayName: "Jane Smith", rentOwed: 0, choreFees: 0 },
  ],
}));

import { useGuestBalances } from "../../../state/queries/paymentQueries";

const wrapper = ({ children }: { children: React.ReactNode }) => (
  <QueryClientProvider
    client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
  >
    {children}
  </QueryClientProvider>
);

describe("BalanceDashboard", () => {
  it("renders per-resident balances sorted by amount owed", () => {
    (useGuestBalances as jest.Mock).mockReturnValue({
      data: [
        {
          guestId: "g1",
          guestName: "John Doe",
          totalBalance: 650,
          totalPaid: 1200,
          status: "overdue",
          lastPaymentDate: "2026-04-01",
        },
        {
          guestId: "g2",
          guestName: "Jane Smith",
          totalBalance: 0,
          totalPaid: 2400,
          status: "current",
          lastPaymentDate: "2026-04-05",
        },
      ],
      isLoading: false,
    });
    const { getAllByText } = render(<BalanceDashboard />, { wrapper });
    // Names appear in both the balance row list and the aging section
    expect(getAllByText("John Doe").length).toBeGreaterThanOrEqual(1);
    expect(getAllByText("Jane Smith").length).toBeGreaterThanOrEqual(1);
  });

  it("renders loading indicator while data is fetching", () => {
    (useGuestBalances as jest.Mock).mockReturnValue({
      data: undefined,
      isLoading: true,
    });
    const { getByTestId } = render(<BalanceDashboard />, { wrapper });
    expect(getByTestId("balance-dashboard-loading")).toBeTruthy();
  });

  it("renders empty state when no balances are returned", () => {
    (useGuestBalances as jest.Mock).mockReturnValue({
      data: [],
      isLoading: false,
    });
    const { getByTestId } = render(<BalanceDashboard />, { wrapper });
    expect(getByTestId("balance-empty-state")).toBeTruthy();
  });

  it("shows Overdue badge for guests with balance > 0", () => {
    (useGuestBalances as jest.Mock).mockReturnValue({
      data: [
        {
          guestId: "g1",
          guestName: "John Doe",
          totalBalance: 650,
          totalPaid: 0,
          status: "overdue",
          lastPaymentDate: null,
        },
      ],
      isLoading: false,
    });
    const { getByText } = render(<BalanceDashboard />, { wrapper });
    expect(getByText("Overdue")).toBeTruthy();
    expect(getByText("No payments")).toBeTruthy();
  });

  it("shows Current badge for guests with zero balance", () => {
    (useGuestBalances as jest.Mock).mockReturnValue({
      data: [
        {
          guestId: "g2",
          guestName: "Jane Smith",
          totalBalance: 0,
          totalPaid: 2400,
          status: "current",
          lastPaymentDate: "2026-04-05",
        },
      ],
      isLoading: false,
    });
    const { getByText } = render(<BalanceDashboard />, { wrapper });
    expect(getByText("Current")).toBeTruthy();
  });

  it("shows the same cents-precision balance in the aging section as in the balance row above it", () => {
    (useGuestBalances as jest.Mock).mockReturnValue({
      data: [
        {
          guestId: "g1",
          guestName: "John Doe",
          totalBalance: 15050, // $150.50 in cents
          totalPaid: 0,
          status: "overdue",
          lastPaymentDate: "2026-04-01",
        },
      ],
      isLoading: false,
    });
    const { getAllByText, queryByText } = render(<BalanceDashboard />, {
      wrapper,
    });
    // With a single guest, "$150.50" appears three times: the Outstanding
    // stat card total, the per-resident balance row, and the aging section
    // entry — all must agree on cents-precision, not just the first two.
    expect(getAllByText("$150.50").length).toBe(3);
    // Whole-dollar rounding ("$151" or "$150") must not appear anywhere.
    expect(queryByText("$151")).toBeNull();
    expect(queryByText("$150")).toBeNull();
  });
});
