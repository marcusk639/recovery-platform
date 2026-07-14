import React from "react";
import { render } from "@testing-library/react-native";
import BalanceAgingView from "../BalanceAgingView";

// balance amounts are in cents, matching GuestBalance.totalBalance
const makeRow = (
  name: string,
  balanceInCents: number,
  lastPaymentDate: string | null,
) => ({
  guestId: `guest-${name}`,
  guestName: name,
  totalOwed: balanceInCents,
  lastPaymentDate,
});

it("shows guest name and balance for each row", () => {
  const rows = [makeRow("Alice", 50000, "2026-04-01")];
  const { getByText } = render(<BalanceAgingView rows={rows} />);
  expect(getByText("Alice")).toBeTruthy();
  expect(getByText("$500.00")).toBeTruthy();
});

it('shows "No payment" label when lastPaymentDate is null', () => {
  const rows = [makeRow("Bob", 20000, null)];
  const { getByText } = render(<BalanceAgingView rows={rows} />);
  expect(getByText(/No payment/i)).toBeTruthy();
});

it("shows overdue days based on last payment date", () => {
  const fortyFiveDaysAgo = new Date();
  fortyFiveDaysAgo.setDate(fortyFiveDaysAgo.getDate() - 45);
  const rows = [makeRow("Bob", 20000, fortyFiveDaysAgo.toISOString())];
  const { getByText } = render(<BalanceAgingView rows={rows} />);
  expect(getByText(/45 days/)).toBeTruthy();
});

it("renders empty state when no rows", () => {
  const { getByText } = render(<BalanceAgingView rows={[]} />);
  expect(getByText(/All balances current/i)).toBeTruthy();
});

it("renders cents-precision amounts rather than rounding to whole dollars", () => {
  const rows = [makeRow("Carol", 15050, "2026-04-01")];
  const { getByText, queryByText } = render(<BalanceAgingView rows={rows} />);
  expect(getByText("$150.50")).toBeTruthy();
  expect(queryByText("$151")).toBeNull();
  expect(queryByText("$150")).toBeNull();
});
