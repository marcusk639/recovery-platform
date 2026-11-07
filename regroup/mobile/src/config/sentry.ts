import { e2eVariant } from './env';

const SENTRY_DSN = 'https://d785dae671464fc3a3a4464c5e7876cc@sentry.io/4306202';

export type SentryOptions = {
  dsn: string | undefined;
  enabled: boolean;
  environment: string;
  tracesSampleRate: number;
  sendDefaultPii: false;
  attachScreenshot: false;
  attachViewHierarchy: false;
};

/**
 * Options for Sentry.init in App.tsx.
 *
 * The DSN is the production project, so e2e builds send nothing to it: their
 * crashes are often deliberate (an emulator build with no emulators running
 * stops with E2EEmulatorUnreachable). The e2e environment tag stays so that
 * an event that gets through anyway is recognisable. The DSN is withheld as
 * well, not only `enabled: false`: without one, neither the JS nor the native
 * SDK has anywhere to send.
 *
 * Privacy (Sentry RN 8): no default PII (IP address, user identifiers), no
 * screenshots and no view hierarchy, since screens show residents' names,
 * recovery and payment details. Session replay is not configured (no replay
 * sample rates, no replay integration), so it stays off.
 */
export const sentryOptions = (): SentryOptions => {
  const variant = e2eVariant();
  return {
    dsn: variant === null ? SENTRY_DSN : undefined,
    enabled: variant === null,
    environment: variant !== null ? `e2e-${variant}` : __DEV__ ? 'development' : 'production',
    tracesSampleRate: 0.2,
    sendDefaultPii: false,
    attachScreenshot: false,
    attachViewHierarchy: false,
  };
};
