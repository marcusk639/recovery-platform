import * as Sentry from '@sentry/react-native';

export const logException = (error: any, message?: string) => {
  return Sentry.captureException(error);
};
