/**
 * Shared Jest setup — auto-mocks the v2 Firebase callable surface so
 * individual test files don't need to copy-paste the same mocks.
 *
 * Wired in via jest.config.js -> setupFiles. Runs before the test
 * framework loads, so module mocks are registered before any imports.
 *
 * Tests that need a custom logger mock (e.g. to assert on log calls via a
 * top-level `mockLogger` reference) can still override these with their own
 * jest.mock(...) call — Jest's per-file hoisted mock takes precedence over
 * setupFiles mocks.
 *
 * Tests that mock onRequest (HTTP functions), use external mockOnCall
 * references, or otherwise customize the v2/https surface should keep
 * their per-file mock — it overrides this one.
 */

jest.mock("firebase-functions/v2/https", () => ({
  onCall: jest
    .fn()
    .mockImplementation((arg1: unknown, arg2?: unknown) =>
      typeof arg1 === "function" ? arg1 : arg2,
    ),
  CallableRequest: jest.fn(),
  HttpsError: class HttpsError extends Error {
    code: string;
    details?: unknown;
    constructor(code: string, message: string, details?: unknown) {
      super(message);
      this.code = code;
      this.details = details;
    }
  },
}));

jest.mock("firebase-functions/logger", () => ({
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
}));
