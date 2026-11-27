/**
 * The 12-step meeting callables refuse with `resource-exhausted` once an
 * account passes its hourly limit; the app shows the server's message, which
 * says when to try again, and generic text for anything else.
 */
import {
  CHECK_IN_FAILED_MESSAGE,
  MEETING_SEARCH_FAILED_MESSAGE,
  checkInErrorMessage,
  meetingLimitMessage,
  meetingSearchErrorMessage,
} from '../meetingErrors';

const LIMIT =
  "You've searched for meetings many times in the last hour. Please try again in 7 minutes.";

describe('meetingLimitMessage', () => {
  it('returns the server message for resource-exhausted', () => {
    expect(meetingLimitMessage({ code: 'resource-exhausted', message: LIMIT })).toBe(LIMIT);
  });

  it('accepts the web SDK\'s "functions/" prefix and strips a "[code]" message prefix', () => {
    expect(
      meetingLimitMessage({
        code: 'functions/resource-exhausted',
        message: `[functions/resource-exhausted] ${LIMIT}`,
      }),
    ).toBe(LIMIT);
  });

  it('is null for any other code, an empty message, or no error', () => {
    expect(meetingLimitMessage({ code: 'internal', message: 'INTERNAL' })).toBeNull();
    expect(meetingLimitMessage({ code: 'resource-exhausted', message: '' })).toBeNull();
    expect(meetingLimitMessage(null)).toBeNull();
    expect(meetingLimitMessage(undefined)).toBeNull();
  });
});

describe('meetingSearchErrorMessage', () => {
  it('shows the hourly-limit message', () => {
    expect(meetingSearchErrorMessage({ code: 'resource-exhausted', message: LIMIT })).toBe(LIMIT);
  });

  it('is generic for any other failure', () => {
    expect(
      meetingSearchErrorMessage({ code: 'internal', message: 'Failed to retrieve meetings' }),
    ).toBe(MEETING_SEARCH_FAILED_MESSAGE);
    expect(meetingSearchErrorMessage(null)).toBe(MEETING_SEARCH_FAILED_MESSAGE);
  });
});

describe('checkInErrorMessage', () => {
  it('shows the hourly-limit message', () => {
    expect(checkInErrorMessage({ code: 'resource-exhausted', message: LIMIT })).toBe(LIMIT);
  });

  it("shows the check-in's own messages (plain Errors, no code)", () => {
    const own = new Error("Your attendance couldn't be saved. Please check in again.");
    expect(checkInErrorMessage(own)).toBe(own.message);
  });

  it('is generic for a callable or network error', () => {
    expect(checkInErrorMessage({ code: 'unavailable', message: 'UNAVAILABLE' })).toBe(
      CHECK_IN_FAILED_MESSAGE,
    );
    expect(checkInErrorMessage(undefined)).toBe(CHECK_IN_FAILED_MESSAGE);
  });
});
