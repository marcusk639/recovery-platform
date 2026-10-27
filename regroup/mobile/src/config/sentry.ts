import { e2eVariant } from './env';

const SENTRY_DSN = 'https://d785dae671464fc3a3a4464c5e7876cc@sentry.io/4306202';

export type SentryOptions = {
  dsn: string | undefined;
  enabled: boolean;
  environment: string;
  tracesSampleRate: number;
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
 */
export const sentryOptions = (): SentryOptions => {
  const variant = e2eVariant();
  return {
    dsn: variant === null ? SENTRY_DSN : undefined,
    enabled: variant === null,
    environment: variant !== null ? `e2e-${variant}` : __DEV__ ? 'development' : 'production',
    tracesSampleRate: 0.2,
  };
};
