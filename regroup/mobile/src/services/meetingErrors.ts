// User-facing messages for the 12-step meeting callables (findMeetings,
// userIsAtMeeting). Each account gets a set number of calls an hour per
// callable (regroup/functions util/rateLimit.ts); over it the server refuses
// with `resource-exhausted` and a message written for the user ("... Please
// try again in N minutes."), which is shown as it is.

export const MEETING_SEARCH_FAILED_MESSAGE = "Couldn't load meetings. Please try again.";
export const CHECK_IN_FAILED_MESSAGE = "Couldn't check you in. Please try again.";

const errorParts = (error: unknown): { code: string; message: string } => {
  const err = (error ?? {}) as { code?: unknown; message?: unknown };
  return {
    // Bare from @react-native-firebase, "functions/"-prefixed from the web SDK.
    code: typeof err.code === 'string' ? err.code.replace(/^functions\//, '') : '',
    message:
      typeof err.message === 'string' ? err.message.replace(/^\[[^\]]+\]\s*/, '').trim() : '',
  };
};

/** The server's message when a meeting callable refused for the hourly limit, else null. */
export const meetingLimitMessage = (error: unknown): string | null => {
  const { code, message } = errorParts(error);
  return code === 'resource-exhausted' && message ? message : null;
};

/** What the meeting search shows when a search failed. */
export const meetingSearchErrorMessage = (error: unknown): string =>
  meetingLimitMessage(error) ?? MEETING_SEARCH_FAILED_MESSAGE;

/**
 * What a failed check-in tells the user. The check-in mutation throws its own
 * messages, written for the user, as plain Errors (no `code`); a callable or
 * network error carries a code and its text is not meant for the user.
 */
export const checkInErrorMessage = (error: unknown): string => {
  const limit = meetingLimitMessage(error);
  if (limit) return limit;
  const { code, message } = errorParts(error);
  return !code && message ? message : CHECK_IN_FAILED_MESSAGE;
};
