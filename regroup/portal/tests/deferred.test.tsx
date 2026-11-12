import { render, screen } from '@testing-library/react';
import { deferred, inert, NativeFeatureUnavailable } from '../src/adapter/deferred';

test('calling a deferred feature throws, naming it', () => {
  const feature = deferred('react-native-webview') as unknown as () => void;
  expect(() => feature()).toThrow(NativeFeatureUnavailable);
  expect(() => feature()).toThrow(/react-native-webview/);
});
test('calling a method of a deferred feature throws, naming it', () => {
  const feature = deferred('react-native-fs') as unknown as { readFile: () => void };
  expect(() => feature.readFile()).toThrow(/react-native-fs\.readFile/);
});
test('rendering a deferred feature shows a visible message', () => {
  const C = deferred('react-native-webview');
  render(<C />);
  expect(screen.getByText(/not available on the web yet: react-native-webview/)).toBeTruthy();
});
test('an inert feature can be called, chained and awaited at load', async () => {
  const feature = inert('messaging') as unknown as { onMessage: () => () => void };
  expect(() => feature.onMessage()()).not.toThrow();
  await expect(Promise.resolve(feature)).resolves.toBeDefined();
});
test('an inert feature renders nothing', () => {
  const C = inert('keyboard');
  const { container } = render(<C />);
  expect(container.textContent).toBe('');
});
