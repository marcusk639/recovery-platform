jest.mock('../../util/logging', () => ({ logException: jest.fn() }));

import React from 'react';
import { Text } from 'react-native';
import { render } from '@testing-library/react-native';

import { ErrorBoundary } from '../ErrorBoundary';
import { logException } from '../../util/logging';

const Boom = () => {
  throw new Error('render failed');
};

describe('ErrorBoundary', () => {
  let consoleError: jest.SpyInstance;
  beforeEach(() => {
    (logException as jest.Mock).mockClear();
    // React itself logs the caught error in development; silence it here.
    consoleError = jest.spyOn(console, 'error').mockImplementation(() => {});
  });
  afterEach(() => consoleError.mockRestore());

  // Launch plan M10: the boundary only called console.error, so a production
  // render crash reached no one although Sentry is initialised.
  it('reports a caught render error to Sentry through logException', () => {
    render(
      <ErrorBoundary>
        <Boom />
      </ErrorBoundary>,
    );
    expect(logException).toHaveBeenCalledTimes(1);
    expect(logException).toHaveBeenCalledWith(
      expect.objectContaining({ message: 'render failed' }),
      'ErrorBoundary',
    );
  });

  it('does not log the error to the console itself', () => {
    render(
      <ErrorBoundary>
        <Boom />
      </ErrorBoundary>,
    );
    const ownCalls = consoleError.mock.calls.filter(
      ([first]) => typeof first === 'string' && first.startsWith('ErrorBoundary caught'),
    );
    expect(ownCalls).toEqual([]);
  });

  it('still calls a custom onError and shows the fallback', () => {
    const onError = jest.fn();
    const { getByText } = render(
      <ErrorBoundary onError={onError} fallback={<Text>fallback</Text>}>
        <Boom />
      </ErrorBoundary>,
    );
    expect(onError).toHaveBeenCalledWith(
      expect.objectContaining({ message: 'render failed' }),
      expect.anything(),
    );
    expect(getByText('fallback')).toBeTruthy();
  });
});
