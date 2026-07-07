// ─── Mock declarations (before imports) ──────────────────────────────────────

const mockNavigate = jest.fn();
const mockGoBack = jest.fn();
const mockUseRoute = jest.fn();
jest.mock("@react-navigation/native", () => ({
  useRoute: () => mockUseRoute(),
  useNavigation: () => ({ navigate: mockNavigate, goBack: mockGoBack }),
}));

const mockUseQuery = jest.fn();
jest.mock("@tanstack/react-query", () => ({
  ...jest.requireActual("@tanstack/react-query"),
  useQuery: (opts: any) => mockUseQuery(opts),
}));

const mockApprovedMutateAsync = jest.fn();
const mockRejectMutateAsync = jest.fn();
jest.mock("../../../state/queries/treasuryQueries", () => ({
  treasuryKeys: {
    record: (houseId: string, id: string) => [
      "treasury",
      "record",
      houseId,
      id,
    ],
  },
  useApproveRecord: () => ({
    mutateAsync: mockApprovedMutateAsync,
    isPending: false,
  }),
  useRejectRecord: () => ({
    mutateAsync: mockRejectMutateAsync,
    isPending: false,
  }),
}));

jest.mock("../../../services/treasury", () => ({
  getFinancialRecord: jest.fn(),
}));

jest.mock("../../../services/treasuryReport", () => ({
  shareWeeklyReport: jest.fn().mockResolvedValue(undefined),
}));

const mockUseTreasuryRole = jest.fn();
jest.mock("../../../hooks/useTreasuryRole", () => ({
  useTreasuryRole: () => mockUseTreasuryRole(),
}));

jest.mock("../../../context/DataContext", () => ({
  useData: () => ({
    currentHouse: { id: "house-1", name: "Test House" },
    currentUser: { uid: "user-1", firstName: "Jane", lastName: "Admin" },
  }),
}));

jest.mock("../../../components/rats-text/rats-text", () => {
  const { Text } = require("react-native");
  return ({ text }: any) => <Text>{String(text ?? "")}</Text>;
});

jest.mock("../../../components/screen-header/screen-header", () => {
  const { View, Text } = require("react-native");
  return ({ header }: any) => (
    <View>
      <Text>{header}</Text>
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

const mockShowFormModal = jest.fn();
const mockDismissFormModal = jest.fn();
jest.mock("../../../context", () => ({
  useTheme: () => ({
    theme: {
      primaryColor: "#638BFA",
      secondaryColor: "#d2d8ef",
      tertiaryColor: "#969696",
      backgroundColor: "#FAFAFA",
      textColor: "black",
      primaryFontFamily: "Quicksand-Medium",
      secondaryFontFamily: "Quicksand-Medium",
      logoTintColor: "#ffffff",
    },
  }),
  useTranslation: () => ({ t: (k: string) => k }),
  useModal: () => ({
    showFormModal: mockShowFormModal,
    dismissFormModal: mockDismissFormModal,
  }),
}));

jest.mock("../../../components/rats-text-input/rats-text-input", () => {
  const { TextInput } = require("react-native");
  return (props: any) => (
    <TextInput
      testID={props.testID}
      value={props.field?.value}
      onChangeText={props.customHandleChange}
    />
  );
});

jest.mock("../../../components/rats-button/rats-button", () => {
  const { TouchableOpacity, Text } = require("react-native");
  return (props: any) => (
    <TouchableOpacity
      testID={props.testID}
      onPress={props.disabled ? undefined : props.onPress}
      disabled={props.disabled}
    >
      <Text>{props.title}</Text>
    </TouchableOpacity>
  );
});

// ─── Imports ──────────────────────────────────────────────────────────────────

import React from "react";
import { render, fireEvent, act, waitFor } from "@testing-library/react-native";
import FinancialRecordDetail from "../FinancialRecordDetail";
import type { FinancialRecord } from "../../../entities/oxford/FinancialRecord";

// ─── Test fixtures ────────────────────────────────────────────────────────────

const BASE_RECORD: FinancialRecord = {
  id: "rec-1",
  houseId: "house-1",
  period: "2026-04-07",
  status: "submitted",
  totalIncome: 50000,
  totalExpenses: 30000,
  balance: 20000,
  beginningCheckingBalance: 100000,
  endingCheckingBalance: 120000,
  incomeLines: [
    { category: "EES Collected", amount: 50000, description: "April EES" },
  ],
  expenseLines: [
    {
      category: "Utilities",
      amount: 30000,
      payee: "Electric Co",
      checkNumber: "1042",
    },
  ],
  billsDue: [],
  breakdown: [],
  submittedBy: "user-2",
  submittedAt: "2026-04-08T10:00:00Z",
  approvedByVote: false,
};

function setupRoute(params = { houseId: "house-1", recordId: "rec-1" }) {
  mockUseRoute.mockReturnValue({ params });
}

function setupRole(
  overrides: Partial<{ canCreate: boolean; canApprove: boolean }> = {}
) {
  mockUseTreasuryRole.mockReturnValue({
    role: "treasurer",
    canCreate: false,
    canApprove: true,
    canViewDrafts: true,
    isLoading: false,
    ...overrides,
  });
}

function setupRecord(record: FinancialRecord | null, isLoading = false) {
  mockUseQuery.mockReturnValue({ data: record, isLoading });
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe("FinancialRecordDetail", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    setupRoute();
    setupRole();
    setupRecord(BASE_RECORD);
  });

  it("renders income breakdown with category and amount", () => {
    const { getByText, getAllByText } = render(<FinancialRecordDetail />);
    expect(getByText("EES Collected")).toBeTruthy();
    // amount appears in both the income table row and the totals section
    expect(getAllByText("$500.00").length).toBeGreaterThanOrEqual(1);
  });

  it("renders income description when present", () => {
    const { getByText } = render(<FinancialRecordDetail />);
    expect(getByText("April EES")).toBeTruthy();
  });

  it("renders expense breakdown with payee and check number", () => {
    const { getByText, getAllByText } = render(<FinancialRecordDetail />);
    expect(getByText("Utilities")).toBeTruthy();
    expect(getByText("Electric Co")).toBeTruthy();
    expect(getByText("Check #1042")).toBeTruthy();
    // amount appears in both the expense table row and the totals section
    expect(getAllByText("$300.00").length).toBeGreaterThanOrEqual(1);
  });

  it("renders Approve button when status=submitted and canApprove=true", () => {
    setupRecord({ ...BASE_RECORD, status: "submitted" });
    setupRole({ canApprove: true });
    const { getByTestId } = render(<FinancialRecordDetail />);
    expect(getByTestId("btn-approve")).toBeTruthy();
  });

  it("hides Approve button when canApprove=false", () => {
    setupRecord({ ...BASE_RECORD, status: "submitted" });
    setupRole({ canApprove: false });
    const { queryByTestId } = render(<FinancialRecordDetail />);
    expect(queryByTestId("btn-approve")).toBeNull();
  });

  it("renders Reject button when status=submitted and canApprove=true", () => {
    setupRecord({ ...BASE_RECORD, status: "submitted" });
    setupRole({ canApprove: true });
    const { getByTestId } = render(<FinancialRecordDetail />);
    expect(getByTestId("btn-reject")).toBeTruthy();
  });

  // Regression coverage for 2026-07-05: Alert.prompt is gated to iOS only in
  // React Native's source (no Android branch at all), so this admin-only
  // "Reject" button silently did nothing — pressing it opened no UI on
  // Android. Replaced with a cross-platform showFormModal-based form.
  describe("reject flow", () => {
    beforeEach(() => {
      setupRecord({ ...BASE_RECORD, status: "submitted" });
      setupRole({ canApprove: true });
    });

    it("opens a real form modal instead of the iOS-only Alert.prompt", () => {
      const { getByTestId } = render(<FinancialRecordDetail />);
      fireEvent.press(getByTestId("btn-reject"));

      expect(mockShowFormModal).toHaveBeenCalledWith(
        expect.anything(),
        "Reject Record",
        true
      );
    });

    it("submits the typed reason and dismisses the modal", async () => {
      mockRejectMutateAsync.mockResolvedValueOnce(undefined);
      const { getByTestId } = render(<FinancialRecordDetail />);
      fireEvent.press(getByTestId("btn-reject"));

      const formElement = mockShowFormModal.mock.calls[0][0];
      const { getByTestId: getByTestIdInModal } = render(formElement);

      fireEvent.changeText(
        getByTestIdInModal("reject-reason-input"),
        "Missing receipts"
      );
      await act(async () => {
        fireEvent.press(getByTestIdInModal("submit-rejection-button"));
      });

      expect(mockRejectMutateAsync).toHaveBeenCalledWith({
        houseId: "house-1",
        recordId: "rec-1",
        reason: "Missing receipts",
      });
      await waitFor(() => expect(mockDismissFormModal).toHaveBeenCalled());
    });

    it("does not submit when no reason has been typed", () => {
      const { getByTestId } = render(<FinancialRecordDetail />);
      fireEvent.press(getByTestId("btn-reject"));

      const formElement = mockShowFormModal.mock.calls[0][0];
      const { getByTestId: getByTestIdInModal } = render(formElement);

      // TouchableOpacity (RatsButton's underlying element) doesn't surface
      // `disabled` directly on the rendered host node — it's consumed
      // internally and reflected via accessibilityState.disabled instead.
      expect(
        getByTestIdInModal("submit-rejection-button").props.accessibilityState
          .disabled
      ).toBe(true);
    });
  });

  it("renders Share button when status=approved", () => {
    setupRecord({ ...BASE_RECORD, status: "approved" });
    const { getByTestId } = render(<FinancialRecordDetail />);
    expect(getByTestId("btn-share")).toBeTruthy();
  });

  it("hides Share button when status is not approved", () => {
    setupRecord({ ...BASE_RECORD, status: "submitted" });
    const { queryByTestId } = render(<FinancialRecordDetail />);
    expect(queryByTestId("btn-share")).toBeNull();
  });

  it("shows rejection reason when status=rejected", () => {
    setupRecord({
      ...BASE_RECORD,
      status: "rejected",
      rejectionReason: "Missing receipts",
    });
    const { getByText } = render(<FinancialRecordDetail />);
    expect(getByText("Missing receipts")).toBeTruthy();
  });

  it("shows Edit & Resubmit button when status=rejected and canCreate=true", () => {
    setupRecord({
      ...BASE_RECORD,
      status: "rejected",
      rejectionReason: "Missing receipts",
    });
    setupRole({ canCreate: true, canApprove: false });
    const { getByTestId } = render(<FinancialRecordDetail />);
    expect(getByTestId("btn-edit-resubmit")).toBeTruthy();
  });

  it("hides Edit & Resubmit button when canCreate=false", () => {
    setupRecord({
      ...BASE_RECORD,
      status: "rejected",
      rejectionReason: "Missing receipts",
    });
    setupRole({ canCreate: false, canApprove: false });
    const { queryByTestId } = render(<FinancialRecordDetail />);
    expect(queryByTestId("btn-edit-resubmit")).toBeNull();
  });

  it("renders bills due section when bills are present", () => {
    setupRecord({
      ...BASE_RECORD,
      billsDue: [
        { description: "Water Bill", amount: 5000, dueDate: "2026-04-15" },
      ],
    });
    const { getByTestId, getByText } = render(<FinancialRecordDetail />);
    expect(getByTestId("bills-section")).toBeTruthy();
    expect(getByText("Water Bill")).toBeTruthy();
  });

  it("hides bills due section when no bills", () => {
    setupRecord({ ...BASE_RECORD, billsDue: [] });
    const { queryByTestId } = render(<FinancialRecordDetail />);
    expect(queryByTestId("bills-section")).toBeNull();
  });

  it("shows loading indicator while fetching", () => {
    setupRecord(null, true);
    const { getByTestId } = render(<FinancialRecordDetail />);
    expect(getByTestId("loading-indicator")).toBeTruthy();
  });
});
