// @sentry/react-native is mocked globally in jest.setup.js
import * as Sentry from '@sentry/react-native';
import { logException } from '../logging';

describe('logException', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('is a function', () => {
    expect(typeof logException).toBe('function');
  });

  it('calls Sentry.captureException with the provided error', () => {
    const error = new Error('Test error');
    logException(error);
    expect(Sentry.captureException).toHaveBeenCalledWith(error);
  });

  it('calls Sentry.captureException exactly once', () => {
    const error = new Error('Another error');
    logException(error);
    expect(Sentry.captureException).toHaveBeenCalledTimes(1);
  });

  it('passes string errors to captureException', () => {
    logException('string error');
    expect(Sentry.captureException).toHaveBeenCalledWith('string error');
  });

  it('passes object errors to captureException', () => {
    const errorObj = { code: 'ERR_NETWORK', message: 'Network failure' };
    logException(errorObj);
    expect(Sentry.captureException).toHaveBeenCalledWith(errorObj);
  });

  it('works with optional message argument', () => {
    const error = new Error('error with message');
    logException(error, 'Additional context');
    expect(Sentry.captureException).toHaveBeenCalledWith(error);
  });

  it('returns the result of Sentry.captureException', () => {
    (Sentry.captureException as jest.Mock).mockReturnValueOnce('event-id-123');
    const result = logException(new Error('err'));
    expect(result).toBe('event-id-123');
  });

  it('can be called with null as an error', () => {
    logException(null);
    expect(Sentry.captureException).toHaveBeenCalledWith(null);
  });

  it('can be called with undefined as an error', () => {
    logException(undefined);
    expect(Sentry.captureException).toHaveBeenCalledWith(undefined);
  });

  it('can be called multiple times and captures each exception', () => {
    const err1 = new Error('First');
    const err2 = new Error('Second');
    logException(err1);
    logException(err2);
    expect(Sentry.captureException).toHaveBeenCalledTimes(2);
    expect(Sentry.captureException).toHaveBeenNthCalledWith(1, err1);
    expect(Sentry.captureException).toHaveBeenNthCalledWith(2, err2);
  });

  it('works without an optional message argument', () => {
    const error = new Error('no message arg');
    expect(() => logException(error)).not.toThrow();
  });
});
