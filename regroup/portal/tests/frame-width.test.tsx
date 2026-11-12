import { act, render, screen } from '@testing-library/react';
import { vi } from 'vitest';
import { Dimensions, useWindowDimensions } from '../src/adapter/react-native';
import { FrameWidth } from '../src/app/frame-width';

// jsdom has no ResizeObserver: this one lets a test report a new size.
let report: (width: number) => void = () => {};
beforeEach(() => {
  vi.stubGlobal(
    'ResizeObserver',
    class {
      constructor(callback: (entries: { contentRect: { width: number } }[]) => void) {
        report = (width) => callback([{ contentRect: { width } }]);
      }
      observe() {}
      disconnect() {}
    },
  );
});
afterEach(() => vi.unstubAllGlobals());

const Width = () => <span data-testid="width">{useWindowDimensions().width}</span>;

test('outside a frame, screens get the window width', () => {
  render(<Width />);
  expect(screen.getByTestId('width').textContent).toBe(String(Dimensions.get('window').width));
});

test('inside a frame, screens get its width as it resizes', () => {
  render(
    <FrameWidth testID="frame">
      <Width />
    </FrameWidth>,
  );
  act(() => report(700.4));
  expect(screen.getByTestId('width').textContent).toBe('700');
  act(() => report(500));
  expect(screen.getByTestId('width').textContent).toBe('500');
  expect(screen.getByTestId('frame')).toBeTruthy();
});

// react-native-modal sizes its backdrop from Dimensions, so that must stay the window.
test("Dimensions keeps the window's width inside a frame", () => {
  const before = Dimensions.get('window').width;
  render(
    <FrameWidth>
      <Width />
    </FrameWidth>,
  );
  act(() => report(700));
  expect(Dimensions.get('window').width).toBe(before);
  expect(Dimensions.get('screen').width).toBe(before);
});
