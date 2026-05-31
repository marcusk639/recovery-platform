/**
 * Tests for the pure streak computation logic.
 * Imports from functions/src/utils/streakCompute.ts — no Firebase dependencies.
 */

// Make this file a module to avoid global scope conflicts
export {};

import { computeStreak, StreakData } from "../utils/streakCompute";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function buildStreak(overrides: Partial<StreakData> = {}): StreakData {
  return {
    currentStreak: 1,
    longestStreak: 1,
    lastCheckIn: null,
    checkInDates: [],
    ...overrides,
  };
}

/** Returns YYYY-MM-DD for today in UTC */
function todayUTC(): string {
  return new Date().toISOString().slice(0, 10);
}

/** Returns YYYY-MM-DD for N days ago (UTC) relative to today */
function daysAgoUTC(n: number): string {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() - n);
  return d.toISOString().slice(0, 10);
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("computeStreak", () => {
  // -------------------------------------------------------------------------
  // 1. First ever check-in (streak = 1)
  // -------------------------------------------------------------------------
  describe("first ever check-in", () => {
    it("sets currentStreak to 1 when there is no prior state (null)", () => {
      const result = computeStreak(null, todayUTC());
      expect(result.currentStreak).toBe(1);
    });

    it("sets longestStreak to 1 on first check-in", () => {
      const result = computeStreak(null, todayUTC());
      expect(result.longestStreak).toBe(1);
    });

    it("records lastCheckIn as today", () => {
      const today = todayUTC();
      const result = computeStreak(null, today);
      expect(result.lastCheckIn).toBe(today);
    });

    it("adds today to checkInDates", () => {
      const today = todayUTC();
      const result = computeStreak(null, today);
      expect(result.checkInDates).toContain(today);
    });

    it("sets currentStreak to 1 when prior streak had lastCheckIn: null", () => {
      const prior = buildStreak({ currentStreak: 0, lastCheckIn: null });
      const result = computeStreak(prior, todayUTC());
      expect(result.currentStreak).toBe(1);
    });
  });

  // -------------------------------------------------------------------------
  // 2. Check-in on consecutive day (streak increments)
  // -------------------------------------------------------------------------
  describe("consecutive day check-in", () => {
    it("increments currentStreak by 1 when last check-in was yesterday", () => {
      const yesterday = daysAgoUTC(1);
      const prior = buildStreak({
        currentStreak: 5,
        longestStreak: 5,
        lastCheckIn: yesterday,
        checkInDates: [yesterday],
      });
      const result = computeStreak(prior, todayUTC());
      expect(result.currentStreak).toBe(6);
    });

    it("updates longestStreak when currentStreak surpasses it", () => {
      const yesterday = daysAgoUTC(1);
      const prior = buildStreak({
        currentStreak: 10,
        longestStreak: 10,
        lastCheckIn: yesterday,
        checkInDates: [yesterday],
      });
      const result = computeStreak(prior, todayUTC());
      expect(result.longestStreak).toBe(11);
    });

    it("does not decrease longestStreak when current is already lower", () => {
      const yesterday = daysAgoUTC(1);
      const prior = buildStreak({
        currentStreak: 3,
        longestStreak: 30, // long past streak
        lastCheckIn: yesterday,
        checkInDates: [yesterday],
      });
      const result = computeStreak(prior, todayUTC());
      expect(result.longestStreak).toBe(30);
    });

    it("correctly increments from 1 to 2 on day 2", () => {
      const yesterday = daysAgoUTC(1);
      const prior = buildStreak({
        currentStreak: 1,
        longestStreak: 1,
        lastCheckIn: yesterday,
        checkInDates: [yesterday],
      });
      const result = computeStreak(prior, todayUTC());
      expect(result.currentStreak).toBe(2);
    });
  });

  // -------------------------------------------------------------------------
  // 3. Same-day check-in (no double increment)
  // -------------------------------------------------------------------------
  describe("same-day check-in (idempotent)", () => {
    it("does not increment streak when last check-in is today", () => {
      const today = todayUTC();
      const prior = buildStreak({
        currentStreak: 7,
        longestStreak: 7,
        lastCheckIn: today,
        checkInDates: [today],
      });
      const result = computeStreak(prior, today);
      expect(result.currentStreak).toBe(7);
    });

    it("returns unchanged longestStreak on same-day re-check", () => {
      const today = todayUTC();
      const prior = buildStreak({
        currentStreak: 3,
        longestStreak: 10,
        lastCheckIn: today,
        checkInDates: [today],
      });
      const result = computeStreak(prior, today);
      expect(result.longestStreak).toBe(10);
    });

    it("returns same lastCheckIn on same-day re-check", () => {
      const today = todayUTC();
      const prior = buildStreak({
        currentStreak: 5,
        lastCheckIn: today,
        checkInDates: [today],
      });
      const result = computeStreak(prior, today);
      expect(result.lastCheckIn).toBe(today);
    });
  });

  // -------------------------------------------------------------------------
  // 4. Missed a day (streak resets to 1)
  // -------------------------------------------------------------------------
  describe("missed day — streak resets to 1", () => {
    it("resets currentStreak to 1 when last check-in was 2 days ago", () => {
      const twoDaysAgo = daysAgoUTC(2);
      const prior = buildStreak({
        currentStreak: 15,
        longestStreak: 15,
        lastCheckIn: twoDaysAgo,
        checkInDates: [twoDaysAgo],
      });
      const result = computeStreak(prior, todayUTC());
      expect(result.currentStreak).toBe(1);
    });

    it("resets currentStreak to 1 when last check-in was many days ago", () => {
      const longAgo = daysAgoUTC(30);
      const prior = buildStreak({
        currentStreak: 100,
        longestStreak: 100,
        lastCheckIn: longAgo,
        checkInDates: [longAgo],
      });
      const result = computeStreak(prior, todayUTC());
      expect(result.currentStreak).toBe(1);
    });

    it("preserves longestStreak when current resets", () => {
      const threeDaysAgo = daysAgoUTC(3);
      const prior = buildStreak({
        currentStreak: 50,
        longestStreak: 50,
        lastCheckIn: threeDaysAgo,
        checkInDates: [threeDaysAgo],
      });
      const result = computeStreak(prior, todayUTC());
      expect(result.longestStreak).toBe(50);
      expect(result.currentStreak).toBe(1);
    });

    it("resets when last check-in was exactly 2 days ago (not 1)", () => {
      // yesterday's yesterday
      const d = new Date();
      d.setUTCDate(d.getUTCDate() - 2);
      const twoDaysAgo = d.toISOString().slice(0, 10);

      const prior = buildStreak({
        currentStreak: 20,
        longestStreak: 20,
        lastCheckIn: twoDaysAgo,
      });
      const result = computeStreak(prior, todayUTC());
      expect(result.currentStreak).toBe(1);
    });
  });

  // -------------------------------------------------------------------------
  // 5. checkInDates management
  // -------------------------------------------------------------------------
  describe("checkInDates management", () => {
    it("keeps at most 30 dates when overflow occurs", () => {
      // Build 30 pre-existing dates
      const dates = Array.from({ length: 30 }, (_, i) => daysAgoUTC(30 - i));
      const yesterday = daysAgoUTC(1);
      const prior = buildStreak({
        currentStreak: 30,
        longestStreak: 30,
        lastCheckIn: yesterday,
        checkInDates: dates,
      });
      const result = computeStreak(prior, todayUTC());
      expect(result.checkInDates.length).toBeLessThanOrEqual(30);
    });

    it("includes today's date in checkInDates after check-in", () => {
      const yesterday = daysAgoUTC(1);
      const today = todayUTC();
      const prior = buildStreak({
        currentStreak: 1,
        lastCheckIn: yesterday,
        checkInDates: [yesterday],
      });
      const result = computeStreak(prior, today);
      expect(result.checkInDates).toContain(today);
    });

    it("does not duplicate today in checkInDates when it is already present", () => {
      const today = todayUTC();
      const yesterday = daysAgoUTC(1);
      const prior = buildStreak({
        currentStreak: 1,
        lastCheckIn: yesterday,
        checkInDates: [yesterday, today], // today already in list
      });
      // Calling with same day should be no-op
      const result = computeStreak(prior, today);
      // Since lastCheckIn === yesterday (not today), it would set today
      // but the filter ensures no duplicates
      const todayCount = result.checkInDates.filter((d) => d === today).length;
      expect(todayCount).toBe(1);
    });

    it("initialises checkInDates to [today] for first check-in", () => {
      const today = todayUTC();
      const result = computeStreak(null, today);
      expect(result.checkInDates).toEqual([today]);
    });
  });

  // -------------------------------------------------------------------------
  // 6. Edge cases
  // -------------------------------------------------------------------------
  describe("edge cases", () => {
    it("handles month boundaries correctly: consecutive days across months", () => {
      // Jan 31 → Feb 1 should be consecutive in any year
      const jan31 = "2024-01-31";
      const feb01 = "2024-02-01";
      const prior = buildStreak({
        currentStreak: 5,
        longestStreak: 5,
        lastCheckIn: jan31,
        checkInDates: [jan31],
      });
      const result = computeStreak(prior, feb01);
      expect(result.currentStreak).toBe(6);
    });

    it("handles leap year Feb 29 → Mar 1 as consecutive", () => {
      // 2024 is a leap year: yesterday of Mar 1 = Feb 29
      const feb29 = "2024-02-29";
      const mar01 = "2024-03-01";
      const prior = buildStreak({
        currentStreak: 5,
        longestStreak: 5,
        lastCheckIn: feb29,
        checkInDates: [feb29],
      });
      const result = computeStreak(prior, mar01);
      expect(result.currentStreak).toBe(6);
    });

    it("handles non-leap year Feb 28 → Mar 1 as consecutive", () => {
      // 2023 is NOT a leap year: yesterday of Mar 1 = Feb 28
      const feb28 = "2023-02-28";
      const mar01 = "2023-03-01";
      const prior = buildStreak({
        currentStreak: 5,
        longestStreak: 5,
        lastCheckIn: feb28,
        checkInDates: [feb28],
      });
      const result = computeStreak(prior, mar01);
      expect(result.currentStreak).toBe(6);
    });

    it("handles dates at year boundaries correctly", () => {
      // Dec 31 → Jan 1 next year should be consecutive
      const dec31 = "2023-12-31";
      const jan01 = "2024-01-01";
      const prior = buildStreak({
        currentStreak: 10,
        longestStreak: 10,
        lastCheckIn: dec31,
        checkInDates: [dec31],
      });
      const result = computeStreak(prior, jan01);
      expect(result.currentStreak).toBe(11);
    });
  });
});
