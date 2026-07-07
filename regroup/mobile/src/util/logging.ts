import * as Sentry from "@sentry/react-native";

// Hardened 2026-07-05: `message` was accepted but never passed through to
// Sentry — this is the app's only error sink, so every call site relying on
// the message for context (e.g. `logException(error, 'Error signing out')`)
// silently lost that context in production error triage.
export const logException = (error: any, message?: string) => {
  if (message) {
    return Sentry.captureException(error, { extra: { message } });
  }
  return Sentry.captureException(error);
};
