// ─── useSelectedHouse mock ────────────────────────────────────────────────────
const mockUseSelectedHouse = jest.fn();

jest.mock("../../../hooks/useSelectedHouse", () => ({
  useSelectedHouse: () => mockUseSelectedHouse(),
}));

// Stub useFocusEffect so the screen can run outside a NavigationContainer.
jest.mock("@react-navigation/native", () => ({
  useFocusEffect: jest.fn(),
  useNavigation: () => ({ navigate: jest.fn(), goBack: jest.fn() }),
}));

import React from "react";
import { StyleSheet as InsetStyleSheet } from 'react-native';
// The module object itself: an `import * as` namespace is a copy, which a spy would miss.
const SafeArea = require('react-native-safe-area-context');
import { render, waitFor, fireEvent, within } from "@testing-library/react-native";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

// Standard mocks for this project
jest.mock("../../../context", () => ({
  useTheme: () => ({
    theme: {
      primaryColor: "rgb(99,139,250)",
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
}));

jest.mock("../../../components/screen-header", () => {
  const { View, Text } = require("react-native");
  return ({ header }: any) => (
    <View>
      <Text>{header}</Text>
    </View>
  );
});

jest.mock("../../../components/rats-text/rats-text", () => {
  const { Text } = require("react-native");
  return ({ text, children }: any) => <Text>{text ?? children ?? ""}</Text>;
});

jest.mock("../../../components/rats-button/rats-button", () => {
  const { TouchableOpacity, Text } = require("react-native");
  return ({ title, onPress, disabled }: any) => (
    <TouchableOpacity onPress={onPress} disabled={disabled}>
      <Text>{title}</Text>
    </TouchableOpacity>
  );
});

jest.mock("victory-native", () => ({
  VictoryBar: () => null,
  VictoryChart: ({ children }: any) => <>{children}</>,
  VictoryAxis: () => null,
  VictoryTheme: { material: {} },
}));

// The dashboard reads the Firestore payment records (#191); the Stripe
// callable now only feeds the failed-payment banner.
const mockListHousePayments = jest.fn((..._args: any[]) => Promise.resolve([]));
const mockGetHousePaymentRecords = jest.fn((..._args: any[]): any => Promise.resolve([]));
const mockRecordManualPayment = jest.fn();
jest.mock("../../../services/payments", () => ({
  listHousePayments: (...args: any[]) => mockListHousePayments(...args),
  getHousePaymentRecords: (...args: any[]) => mockGetHousePaymentRecords(...args),
  recordManualPayment: (...args: any[]) => mockRecordManualPayment(...args),
  createPaymentId: () => `pay-${++mockPaymentIds}`,
  MAX_PAYMENT_CENTS: 10000000,
}));
let mockPaymentIds = 0;

const mockUseAppSelector = jest.fn();
jest.mock("../../../state/store", () => ({
  useAppSelector: (selector: any) => mockUseAppSelector(selector),
}));

// Platform for the keyboard tests below: a getter, so a test can switch it.
// Every other test runs as iOS, the Jest default.
let mockIOS = true;
jest.mock("../../../util/platform", () => ({
  ...jest.requireActual("../../../util/platform"),
  get IOS() {
    return mockIOS;
  },
  get ANDROID() {
    return !mockIOS;
  },
}));

import PaymentDashboard from "../PaymentDashboard";
import { KeyboardToolbar } from "react-native-keyboard-controller";
import { RatsKeyboardAvoidingView } from "../../../components/rats-keyboard";

const mockNavigation = { navigate: jest.fn(), goBack: jest.fn() } as any;

const PAYMENT_TEST_HOUSE = { id: "house1", name: "Test House" };

// After A2 migration, PaymentDashboard reads guests via useGuests(houseId)
// instead of state.guests.guests. Stash the fixture so makeWrapper can seed
// the React Query cache. See .full-review [A2].
let currentTestGuests: Record<string, any> = {};

const setupStore = (guests: Record<string, any> = {}) => {
  currentTestGuests = guests;
  mockUseSelectedHouse.mockReturnValue({
    house: PAYMENT_TEST_HOUSE,
    houseId: PAYMENT_TEST_HOUSE.id,
    isLoading: false,
  });
  mockUseAppSelector.mockImplementation((selector: any) =>
    selector({
      houses: { selectedHouse: PAYMENT_TEST_HOUSE },
      guests: { guests },
    }),
  );
};

const makeWrapper = () => {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  qc.setQueryData(["guests", "list", PAYMENT_TEST_HOUSE.id], currentTestGuests);
  return ({ children }: any) => (
    <QueryClientProvider client={qc}>{children}</QueryClientProvider>
  );
};

const renderDashboard = () =>
  render(<PaymentDashboard navigation={mockNavigation} />, {
    wrapper: makeWrapper(),
  });

describe("PaymentDashboard", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("shows loading state initially", () => {
    setupStore();
    mockGetHousePaymentRecords.mockReturnValue(new Promise(() => {}));
    const { getByTestId } = renderDashboard();
    expect(getByTestId("payment-dashboard-loading")).toBeTruthy();
  });

  it("shows total collected amount for succeeded payments", async () => {
    setupStore({
      g1: { id: "g1", userId: "u1", firstName: "Alice", lastName: "Smith" },
    });
    mockGetHousePaymentRecords.mockResolvedValue([
      {
        id: "c1",
        amount: 500,
        currency: "usd",
        status: "succeeded",
        description: "Rent",
        createdAt: new Date().toISOString(),
        guestId: "g1",
        houseId: "house1",
      },
    ]);
    const { findByTestId } = renderDashboard();
    await findByTestId("payment-stats-card");
  });

  it("renders date filter pills", async () => {
    setupStore();
    mockGetHousePaymentRecords.mockResolvedValue([]);
    const { findByText } = renderDashboard();
    expect(await findByText("This Week")).toBeTruthy();
    expect(await findByText("This Month")).toBeTruthy();
    expect(await findByText("All Time")).toBeTruthy();
  });

  it("shows empty state when no payments", async () => {
    setupStore();
    mockGetHousePaymentRecords.mockResolvedValue([]);
    const { findByTestId } = renderDashboard();
    await findByTestId("payment-empty-state");
  });

  it("shows FAB for recording manual payment", async () => {
    setupStore();
    mockGetHousePaymentRecords.mockResolvedValue([]);
    const { findByTestId } = renderDashboard();
    await findByTestId("manual-payment-fab");
  });

  it("renders StalePendingBanner when there are stale pending payments", async () => {
    setupStore({
      g1: { id: "g1", userId: "u1", firstName: "Alice", lastName: "Smith" },
    });
    mockGetHousePaymentRecords.mockResolvedValue([
      {
        id: "pay-stale-1",
        guestId: "g1",
        houseId: "house1",
        amount: 50000,
        status: "pending",
        createdAt: new Date(Date.now() - 25 * 60 * 60 * 1000).toISOString(),
        description: "Rent Payment",
      },
    ]);
    const { findByTestId } = renderDashboard();
    await findByTestId("stale-pending-banner");
  });

  it("does not render StalePendingBanner when no stale pending payments", async () => {
    setupStore();
    mockGetHousePaymentRecords.mockResolvedValue([]);
    const { queryByTestId, findByTestId } = renderDashboard();
    await findByTestId("payment-empty-state");
    expect(queryByTestId("stale-pending-banner")).toBeNull();
  });

  describe("ManualPaymentModal", () => {
    const guestFixtures = {
      g1: { id: "g1", userId: "u1", firstName: "Alice", lastName: "Smith" },
      g2: { id: "g2", userId: "u2", firstName: "Bob", lastName: "Jones" },
    };

    const openModal = async (utils: ReturnType<typeof renderDashboard>) => {
      const fab = await utils.findByTestId("manual-payment-fab");
      fireEvent.press(fab);
    };

    it("calls recordManualPayment with correct args and closes modal", async () => {
      setupStore(guestFixtures);
      mockGetHousePaymentRecords.mockResolvedValue([]);
      mockRecordManualPayment.mockResolvedValue({});

      const utils = renderDashboard();
      await openModal(utils);

      // Select a guest
      const guestPill = await utils.findByTestId("guest-pill-g1");
      fireEvent.press(guestPill);

      // Enter amount
      const amountInput = utils.getByPlaceholderText("Amount ($)");
      fireEvent.changeText(amountInput, "150");

      // Press Record
      const recordBtn = utils.getByText("Record");
      fireEvent.press(recordBtn);

      await waitFor(() => {
        expect(mockRecordManualPayment).toHaveBeenCalledWith(
          "g1",
          "house1",
          15000, // $150.00 in cents
          "Cash",
          "",
          // The resident's uid, so the record is readable in their history.
          'u1',
          // One payment id per modal open, so a retry can't record twice.
          expect.any(String),
        );
      });
    });

    it("closes modal after successful recordManualPayment", async () => {
      setupStore(guestFixtures);
      mockGetHousePaymentRecords.mockResolvedValue([]);
      mockRecordManualPayment.mockResolvedValue({});

      const utils = renderDashboard();
      await openModal(utils);

      // Verify modal title is visible
      expect(utils.getByText("Record Manual Payment")).toBeTruthy();

      // Select guest and enter amount
      fireEvent.press(await utils.findByTestId("guest-pill-g2"));
      fireEvent.changeText(utils.getByPlaceholderText("Amount ($)"), "200");

      fireEvent.press(utils.getByText("Record"));

      await waitFor(() => {
        expect(mockRecordManualPayment).toHaveBeenCalled();
      });
    });

    it("shows error alert when recordManualPayment throws", async () => {
      const { Alert } = require("react-native");
      jest.spyOn(Alert, "alert");

      setupStore(guestFixtures);
      mockGetHousePaymentRecords.mockResolvedValue([]);
      mockRecordManualPayment.mockRejectedValue(new Error("Network error"));

      const utils = renderDashboard();
      await openModal(utils);

      fireEvent.press(await utils.findByTestId("guest-pill-g1"));
      fireEvent.changeText(utils.getByPlaceholderText("Amount ($)"), "75");

      fireEvent.press(utils.getByText("Record"));

      await waitFor(() => {
        expect(Alert.alert).toHaveBeenCalledWith(
          "Error",
          "Failed to record payment. Please try again.",
        );
      });
    });

    it("invalidates the guests list query after recording a payment, so Overdue Residents refreshes", async () => {
      setupStore(guestFixtures);
      mockGetHousePaymentRecords.mockResolvedValue([]);
      mockRecordManualPayment.mockResolvedValue({});

      const qc = new QueryClient({
        defaultOptions: { queries: { retry: false } },
      });
      qc.setQueryData(
        ["guests", "list", PAYMENT_TEST_HOUSE.id],
        currentTestGuests,
      );
      const invalidateSpy = jest.spyOn(qc, "invalidateQueries");

      const utils = render(<PaymentDashboard navigation={mockNavigation} />, {
        wrapper: ({ children }: any) => (
          <QueryClientProvider client={qc}>{children}</QueryClientProvider>
        ),
      });

      await openModal(utils);

      fireEvent.press(await utils.findByTestId("guest-pill-g1"));
      fireEvent.changeText(utils.getByPlaceholderText("Amount ($)"), "150");
      fireEvent.press(utils.getByText("Record"));

      await waitFor(() => {
        expect(mockRecordManualPayment).toHaveBeenCalled();
      });

      // handleRecord already invalidates paymentKeys.housePayments/guestBalances/
      // history — it must also invalidate the guests list query, since
      // overdueGuests (and the "Overdue Residents" card) derive from `guests`,
      // which is backed by this exact query key.
      await waitFor(() => {
        expect(invalidateSpy).toHaveBeenCalledWith(
          expect.objectContaining({
            queryKey: ["guests", "list", PAYMENT_TEST_HOUSE.id],
          }),
        );
      });
    });
  });
});

describe('PaymentDashboard bottom inset (Android edge-to-edge)', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('lifts the manual-payment FAB by the bottom safe-area inset', async () => {
    jest
      .spyOn(SafeArea, 'useSafeAreaInsets')
      .mockReturnValue({ top: 0, right: 0, bottom: 48, left: 0 });
    setupStore();
    mockGetHousePaymentRecords.mockResolvedValue([]);
    const { findByTestId } = renderDashboard();

    const fab = await findByTestId('manual-payment-fab');
    expect(InsetStyleSheet.flatten(fab.props.style)).toEqual(
      expect.objectContaining({ position: 'absolute', marginBottom: 48 }),
    );
  });
});

describe("PaymentDashboard ManualPaymentModal keyboard (Task 15)", () => {
  afterEach(() => {
    mockIOS = true;
  });

  const openModal = async () => {
    setupStore();
    mockGetHousePaymentRecords.mockResolvedValue([]);
    const utils = renderDashboard();
    fireEvent.press(await utils.findByTestId("manual-payment-fab"));
    await utils.findByPlaceholderText("Amount ($)");
    return utils;
  };

  it("renders the keyboard toolbar inside the modal on iOS (Done for the amount pad)", async () => {
    const utils = await openModal();
    expect(utils.UNSAFE_queryAllByType(KeyboardToolbar)).toHaveLength(1);
  });

  it("renders no keyboard toolbar on Android", async () => {
    mockIOS = false;
    const utils = await openModal();
    expect(utils.UNSAFE_queryAllByType(KeyboardToolbar)).toHaveLength(0);
  });

  it("keeps the amount field inside a padding avoiding view on both platforms", async () => {
    for (const ios of [true, false]) {
      mockIOS = ios;
      const utils = await openModal();
      const kav = utils.UNSAFE_getByType(RatsKeyboardAvoidingView);
      expect(kav.props.behavior).toBe("padding");
      expect(
        kav.findAll((node) => node.props.placeholder === "Amount ($)").length,
      ).toBeGreaterThan(0);
      utils.unmount();
    }
  });
});

// ─── #189 and #190: what's typed is what's recorded, once ─────────────────────
describe('ManualPaymentModal amount and submit', () => {
  const guests = { g1: { id: 'g1', userId: 'u1', firstName: 'Alice', lastName: 'Smith' } };

  const fillIn = async (amount: string) => {
    setupStore(guests);
    mockGetHousePaymentRecords.mockResolvedValue([]);
    const utils = renderDashboard();
    fireEvent.press(await utils.findByTestId('manual-payment-fab'));
    fireEvent.press(await utils.findByTestId('guest-pill-g1'));
    fireEvent.changeText(utils.getByPlaceholderText('Amount ($)'), amount);
    return utils;
  };

  beforeEach(() => mockRecordManualPayment.mockReset());

  it('records "1,500.00" as $1,500.00, not $1.00 (#189)', async () => {
    mockRecordManualPayment.mockResolvedValue({});
    const utils = await fillIn('1,500.00');
    fireEvent.press(utils.getByText('Record'));
    await waitFor(() => expect(mockRecordManualPayment).toHaveBeenCalled());
    expect(mockRecordManualPayment.mock.calls[0][2]).toBe(150000);
  });

  it.each(['1e3', '5OO', '12abc', '12,34'])(
    'refuses %s and says why, instead of recording a guess (#189)',
    async (typed) => {
      const utils = await fillIn(typed);
      fireEvent.press(utils.getByText('Record'));
      expect(await utils.findByTestId('manual-payment-amount-error')).toBeTruthy();
      expect(mockRecordManualPayment).not.toHaveBeenCalled();
    },
  );

  it('records once when Record is pressed twice before the first save finishes (#190)', async () => {
    let finish: (value: unknown) => void = () => {};
    mockRecordManualPayment.mockReturnValue(new Promise(resolve => (finish = resolve)));
    const utils = await fillIn('150');
    fireEvent.press(utils.getByText('Record'));
    fireEvent.press(utils.getByText('Record'));
    finish({});
    await waitFor(() => expect(mockRecordManualPayment).toHaveBeenCalledTimes(1));
  });

  it('lets a failed save be retried, with the same payment id (#190)', async () => {
    mockRecordManualPayment.mockRejectedValueOnce(new Error('offline')).mockResolvedValue({});
    const utils = await fillIn('150');
    fireEvent.press(utils.getByText('Record'));
    await waitFor(() => expect(mockRecordManualPayment).toHaveBeenCalledTimes(1));
    fireEvent.press(utils.getByText('Record'));
    await waitFor(() => expect(mockRecordManualPayment).toHaveBeenCalledTimes(2));
    const [first, second] = mockRecordManualPayment.mock.calls;
    expect(first[6]).toEqual(expect.stringMatching(/^pay-/));
    expect(second[6]).toBe(first[6]);
  });
});

// ─── #191, #183 item 6: the dashboard's figures come from the records and balances ─
describe('PaymentDashboard figures', () => {
  const now = new Date().toISOString();
  const residents = {
    g1: { id: 'g1', firstName: 'Alice', lastName: 'Smith', rentOwed: 15000, status: 'active' },
    g2: { id: 'g2', firstName: 'Bob', lastName: 'Jones', rentOwed: 0, status: 'active' },
    g3: { id: 'g3', firstName: 'Cara', lastName: 'Lee', rentOwed: -5000, status: 'active' },
    g4: { id: 'g4', firstName: 'Dan', lastName: 'Ray', rentOwed: 9000, status: 'discharged' },
  };

  it('counts a manual payment in Collected, net of refunds (#191)', async () => {
    setupStore(residents);
    mockGetHousePaymentRecords.mockResolvedValue([
      { id: 'p1', guestId: 'g2', houseId: 'house1', amount: 20000, status: 'succeeded',
        createdAt: now, description: 'Manual Payment — Cash' },
      { id: 'p2', guestId: 'g2', houseId: 'house1', amount: 10000, status: 'succeeded',
        createdAt: now, description: 'Rent', refundedAmountCents: 4000 },
    ]);
    const { findByText } = renderDashboard();
    expect(await findByText('$260.00')).toBeTruthy();
  });

  it("puts Outstanding at what current residents owe, not pending charges (#183)", async () => {
    setupStore(residents);
    mockGetHousePaymentRecords.mockResolvedValue([]);
    const { findByText, queryByText } = renderDashboard();
    // Alice 150, Bob 0, Cara's credit counts as 0, Dan has left.
    expect(await findByText('$150.00')).toBeTruthy();
    expect(queryByText('100%')).toBeNull();
  });

  it('shows a dash, not $NaN, for a record with no dollar amount', async () => {
    setupStore(residents);
    mockGetHousePaymentRecords.mockResolvedValue([
      { id: 'p9', guestId: 'g1', houseId: 'house1', amountMinorUnits: 900, currency: 'eur',
        status: 'succeeded', createdAt: now, description: 'Rent' },
    ]);
    const { findByTestId, queryByText } = renderDashboard();
    const row = await findByTestId('payment-row-p9');
    expect(within(row).getByText('—')).toBeTruthy();
    expect(queryByText(/NaN/)).toBeNull();
  });

  it("names the resident on a payment instead of Unknown (#183)", async () => {
    setupStore(residents);
    mockGetHousePaymentRecords.mockResolvedValue([
      { id: 'p1', guestId: 'g1', houseId: 'house1', amount: 15000, status: 'succeeded',
        createdAt: now, description: 'Rent' },
    ]);
    const { findByTestId } = renderDashboard();
    const row = await findByTestId('payment-row-p1');
    expect(within(row).getByText('Alice Smith')).toBeTruthy();
  });

  it('marks a refunded payment as refunded, not succeeded (review)', async () => {
    setupStore(residents);
    mockGetHousePaymentRecords.mockResolvedValue([
      { id: 'p7', guestId: 'g2', houseId: 'house1', amount: 10000, status: 'succeeded',
        refundedAmountCents: 10000, createdAt: now, description: 'Rent' },
    ]);
    const { findByTestId } = renderDashboard();
    const row = await findByTestId('payment-row-p7');
    expect(within(row).getByText('REFUNDED')).toBeTruthy();
    expect(within(row).queryByText('SUCCEEDED')).toBeNull();
  });

  it("lists the same residents as Outstanding in the Overdue card (review)", async () => {
    setupStore({
      ...residents,
      g5: { id: 'g5', firstName: 'Eve', lastName: 'Fee', rentOwed: 0, choreFees: 2500, status: 'active' },
    });
    mockGetHousePaymentRecords.mockResolvedValue([]);
    const { findByTestId } = renderDashboard();
    const card = await findByTestId('overdue-residents-card');
    expect(within(card).getByText(/Eve Fee/)).toBeTruthy();
    expect(within(card).queryByText(/Dan Ray/)).toBeNull();
  });

  it("escapes names in the CSV so none can run as a formula (review)", async () => {
    const { Share } = require('react-native');
    const share = jest.spyOn(Share, 'share').mockResolvedValue({ action: 'sharedAction' });
    setupStore({ g1: { id: 'g1', firstName: '=HYPERLINK("x")', lastName: '', rentOwed: 0, status: 'active' } });
    mockGetHousePaymentRecords.mockResolvedValue([
      { id: 'p8', guestId: 'g1', houseId: 'house1', amount: 5000, status: 'succeeded',
        refundedAmountCents: 2000, createdAt: now, description: 'Rent' },
    ]);
    const { findByTestId } = renderDashboard();
    fireEvent.press(await findByTestId('csv-export-button'));
    await waitFor(() => expect(share).toHaveBeenCalled());
    const [header, row] = (share.mock.calls[0][0] as any).message.split('\n');
    expect(header).toBe('Date,Guest Name,Amount,Refunded,Status,Type');
    expect(row).toContain(`"'=HYPERLINK(""x"")"`);
    expect(row).toContain(',50.00,20.00,');
  });
});
