/**
 * Tests for the consolidated `weeklyTransfers` scheduled function.
 *
 * The v2 `onSchedule` API wraps a handler and registers Cloud Scheduler
 * metadata. We mock `onSchedule` to return the raw handler function so we
 * can invoke it directly in tests, exactly matching the pattern used by
 * `src/__tests__/scheduled/index.test.ts`.
 */

import { WEEKLY_TRANSFER_TIMEZONES } from "../../util/timezones";

// Mock firebase-functions/v2/scheduler BEFORE importing the module under test.
jest.mock("firebase-functions/v2/scheduler", () => ({
  onSchedule: jest.fn((_opts: unknown, handler: unknown) => handler),
}));

// Mock transferStats so we can assert invocation counts.
jest.mock("../../util/guest", () => ({
  transferStats: jest.fn(async () => ({})),
}));

// Mock firebase-admin (imported transitively via api/firestore).
jest.mock("firebase-admin", () => ({
  apps: [{}],
  initializeApp: jest.fn(),
  app: jest.fn(() => ({})),
  firestore: jest.fn(() => ({
    collection: jest.fn(() => ({ doc: jest.fn(() => ({ id: "mock" })) })),
  })),
}));

import { weeklyTransfers } from "../../scheduled";
import { transferStats } from "../../util/guest";

describe("weeklyTransfers (consolidated scheduled handler)", () => {
  beforeEach(() => {
    (transferStats as jest.Mock).mockClear();
  });

  it("calls transferStats once per supported timezone", async () => {
    await (weeklyTransfers as unknown as (e: unknown) => Promise<void>)({
      scheduleTime: "2026-04-19T05:00:00Z",
    });

    expect(transferStats).toHaveBeenCalledTimes(
      WEEKLY_TRANSFER_TIMEZONES.length + 1, // 4 timezones + 1 fallback
    );
  });

  it("passes each supported timezone to transferStats", async () => {
    await (weeklyTransfers as unknown as (e: unknown) => Promise<void>)({
      scheduleTime: "2026-04-19T05:00:00Z",
    });

    for (const tz of WEEKLY_TRANSFER_TIMEZONES) {
      expect(transferStats).toHaveBeenCalledWith(null, tz);
    }
  });

  it("calls transferStats with null timezone for the fallback pass", async () => {
    await (weeklyTransfers as unknown as (e: unknown) => Promise<void>)({
      scheduleTime: "2026-04-19T05:00:00Z",
    });

    expect(transferStats).toHaveBeenCalledWith(null, null);
  });

  it("continues processing remaining timezones if one fails", async () => {
    (transferStats as jest.Mock)
      .mockRejectedValueOnce(new Error("NY failed"))
      .mockResolvedValue({});

    await expect(
      (weeklyTransfers as unknown as (e: unknown) => Promise<void>)({
        scheduleTime: "2026-04-19T05:00:00Z",
      }),
    ).resolves.toBeUndefined();

    // All 5 calls attempted despite the first one throwing.
    expect(transferStats).toHaveBeenCalledTimes(
      WEEKLY_TRANSFER_TIMEZONES.length + 1,
    );
  });
});
