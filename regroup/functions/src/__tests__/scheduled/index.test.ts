// src/__tests__/scheduled/index.test.ts

// ---------------------------------------------------------------------------
// Mock firebase-functions/v2/scheduler before the module is loaded.
// onSchedule is called at module load time; the mock extracts the handler so
// tests can invoke it directly.
// ---------------------------------------------------------------------------
jest.mock("firebase-functions/v2/scheduler", () => ({
  onSchedule: jest.fn((_schedOrOpts: any, handler?: any) =>
    typeof _schedOrOpts === "function"
      ? _schedOrOpts
      : (handler ?? _schedOrOpts),
  ),
}));

// ---------------------------------------------------------------------------
// Mock firebase-functions logger (v1 compat logger used in scheduled/index)
// ---------------------------------------------------------------------------
jest.mock("firebase-functions", () => ({
  logger: { info: jest.fn(), error: jest.fn(), warn: jest.fn() },
}));

// ---------------------------------------------------------------------------
// Mock houseCollection from firestore API
// ---------------------------------------------------------------------------
const mockHouseCollectionGet = jest.fn();

jest.mock("../../api/firestore", () => ({
  houseCollection: {
    get: mockHouseCollectionGet,
  },
  app: {},
}));

// ---------------------------------------------------------------------------
// Mock utility dependencies
// ---------------------------------------------------------------------------
const mockRunDisputeTransaction = jest.fn();
const mockTransferStats = jest.fn();

jest.mock("../../util/disputes", () => ({
  runDisputeTransaction: mockRunDisputeTransaction,
}));

jest.mock("../../util/guest", () => ({
  transferStats: mockTransferStats,
}));

// ---------------------------------------------------------------------------
// Import after all mocks are registered.
// ---------------------------------------------------------------------------
import { updateDisputes, warmWebsite } from "../../scheduled/index";

// ---------------------------------------------------------------------------
// Minimal event object (scheduleTime is used by transfer handlers for logging)
// ---------------------------------------------------------------------------
const makeEvent = (scheduleTime = "2026-02-23T00:00:00Z") => ({ scheduleTime });

beforeEach(() => jest.clearAllMocks());

// ===========================================================================
// updateDisputes
// ===========================================================================
describe("updateDisputes", () => {
  function makeDoc(id: string, disputes: Record<string, unknown> = {}) {
    return {
      id,
      data: () => ({ disputes }),
    };
  }

  it("queries houseCollection", async () => {
    mockHouseCollectionGet.mockResolvedValue({ docs: [] });

    await (updateDisputes as Function)(makeEvent());

    expect(mockHouseCollectionGet).toHaveBeenCalledTimes(1);
  });

  it("does not call runDisputeTransaction when there are no houses", async () => {
    mockHouseCollectionGet.mockResolvedValue({ docs: [] });

    await (updateDisputes as Function)(makeEvent());

    expect(mockRunDisputeTransaction).not.toHaveBeenCalled();
  });

  it("calls runDisputeTransaction for each dispute in a house", async () => {
    const dispute1 = { id: "d1", status: "open" };
    const dispute2 = { id: "d2", status: "open" };
    const house = makeDoc("house-1", { d1: dispute1, d2: dispute2 });

    mockHouseCollectionGet.mockResolvedValue({ docs: [house] });
    mockRunDisputeTransaction.mockResolvedValue(undefined);

    await (updateDisputes as Function)(makeEvent());

    expect(mockRunDisputeTransaction).toHaveBeenCalledTimes(2);
  });

  it("passes the house object and individual dispute to runDisputeTransaction", async () => {
    const dispute = { id: "d1", amount: 100 };
    const house = makeDoc("house-1", { d1: dispute });

    mockHouseCollectionGet.mockResolvedValue({ docs: [house] });
    mockRunDisputeTransaction.mockResolvedValue(undefined);

    await (updateDisputes as Function)(makeEvent());

    expect(mockRunDisputeTransaction).toHaveBeenCalledWith(
      expect.objectContaining({ disputes: { d1: dispute } }),
      dispute,
    );
  });

  it("processes disputes across multiple houses", async () => {
    const house1 = makeDoc("h1", { d1: { id: "d1" } });
    const house2 = makeDoc("h2", { d2: { id: "d2" }, d3: { id: "d3" } });

    mockHouseCollectionGet.mockResolvedValue({ docs: [house1, house2] });
    mockRunDisputeTransaction.mockResolvedValue(undefined);

    await (updateDisputes as Function)(makeEvent());

    expect(mockRunDisputeTransaction).toHaveBeenCalledTimes(3);
  });

  it("skips houses with no disputes without throwing", async () => {
    const house = makeDoc("h1", {});

    mockHouseCollectionGet.mockResolvedValue({ docs: [house] });

    await expect(
      (updateDisputes as Function)(makeEvent()),
    ).resolves.not.toThrow();
    expect(mockRunDisputeTransaction).not.toHaveBeenCalled();
  });

  it("awaits all runDisputeTransaction promises before completing", async () => {
    const order: string[] = [];

    const dispute1 = { id: "d1" };
    const dispute2 = { id: "d2" };
    const house = makeDoc("h1", { d1: dispute1, d2: dispute2 });

    mockHouseCollectionGet.mockResolvedValue({ docs: [house] });
    mockRunDisputeTransaction
      .mockImplementationOnce(
        () =>
          new Promise<void>((res) =>
            setTimeout(() => {
              order.push("d1");
              res();
            }, 10),
          ),
      )
      .mockImplementationOnce(
        () =>
          new Promise<void>((res) =>
            setTimeout(() => {
              order.push("d2");
              res();
            }, 5),
          ),
      );

    await (updateDisputes as Function)(makeEvent());

    // Both promises resolved before the function returned
    expect(order).toHaveLength(2);
    expect(order).toContain("d1");
    expect(order).toContain("d2");
  });
});

// ===========================================================================
// warmWebsite
// ===========================================================================
describe("warmWebsite", () => {
  it("resolves without throwing", async () => {
    await expect((warmWebsite as Function)(makeEvent())).resolves.not.toThrow();
  });

  it("does not call transferStats or runDisputeTransaction", async () => {
    await (warmWebsite as Function)(makeEvent());

    expect(mockTransferStats).not.toHaveBeenCalled();
    expect(mockRunDisputeTransaction).not.toHaveBeenCalled();
  });
});
