import { act, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Modal } from 'react-native-web';
import { beforeEach, vi } from 'vitest';
import { Alert } from '../src/adapter/react-native';
import { AlertHost } from '../src/adapter/alert/AlertHost';
import { resetAlerts } from '../src/adapter/alert/alert-store';

const show = (...args: Parameters<typeof Alert.alert>) => act(() => Alert.alert(...args));

beforeEach(() => {
  act(() => resetAlerts());
  render(<AlertHost />);
});

test('shows title, message and all buttons', () => {
  show('Approve dispute?', 'It stops counting.', [{ text: 'Cancel' }, { text: 'Approve' }]);
  const dialog = screen.getByRole('alertdialog');
  expect(dialog.textContent).toContain('Approve dispute?');
  expect(dialog.textContent).toContain('It stops counting.');
  expect(screen.getAllByRole('button').map((b) => b.textContent)).toEqual(['Cancel', 'Approve']);
});

test('a button click runs its onPress once and closes', async () => {
  const approve = vi.fn();
  show('Approve?', undefined, [{ text: 'Approve', onPress: approve }]);
  await userEvent.click(screen.getByRole('button', { name: 'Approve' }));
  expect(approve).toHaveBeenCalledTimes(1);
  expect(screen.queryByRole('alertdialog')).toBeNull();
});

test('no buttons means a single OK that closes', async () => {
  show('Error', 'Could not save.');
  await userEvent.click(screen.getByRole('button', { name: 'OK' }));
  expect(screen.queryByRole('alertdialog')).toBeNull();
});

test('Escape runs the cancel-style button, or closes if none, and never a confirm', async () => {
  const approve = vi.fn();
  const cancel = vi.fn();
  show('Approve dispute?', 'msg', [{ text: 'Cancel', onPress: cancel }, { text: 'Approve', onPress: approve }]);
  await userEvent.keyboard('{Escape}');
  expect(approve).not.toHaveBeenCalled();
  expect(cancel).toHaveBeenCalledTimes(1);
  expect(screen.queryByRole('alertdialog')).toBeNull();
});

test('Escape treats style cancel as the cancel button, whatever its text', async () => {
  const dismiss = vi.fn();
  show('Choose', undefined, [{ text: 'Lease', onPress: vi.fn() }, { text: 'Never mind', style: 'cancel', onPress: dismiss }]);
  await userEvent.keyboard('{Escape}');
  expect(dismiss).toHaveBeenCalledTimes(1);
});

test('Escape with only confirm buttons leaves the choice open', async () => {
  const choose = vi.fn();
  show('Choose a category', undefined, [{ text: 'Lease', onPress: choose }, { text: 'ID', onPress: choose }]);
  await userEvent.keyboard('{Escape}');
  expect(choose).not.toHaveBeenCalled();
  expect(screen.queryByRole('alertdialog')).toBeNull();
});

test('clicking outside does not confirm', async () => {
  const approve = vi.fn();
  show('Approve?', 'msg', [{ text: 'Cancel' }, { text: 'Approve', onPress: approve }]);
  await userEvent.click(screen.getByTestId('alert-backdrop'));
  expect(approve).not.toHaveBeenCalled();
});

test('a double-click on a button runs onPress once', async () => {
  const approve = vi.fn();
  show('Approve?', undefined, [{ text: 'Approve', onPress: approve }]);
  await userEvent.dblClick(screen.getByRole('button', { name: 'Approve' }));
  expect(approve).toHaveBeenCalledTimes(1);
});

test('a second alert waits until the first closes', async () => {
  show('First');
  show('Second');
  expect(screen.getByRole('alertdialog').textContent).toContain('First');
  await userEvent.click(screen.getByRole('button', { name: 'OK' }));
  expect(screen.getByRole('alertdialog').textContent).toContain('Second');
});

// PaymentDashboard reports a failed payment while its full-screen Modal is open,
// and react-native-web's Modal moves focus back into itself.
test('it appears above an open React Native Modal and takes clicks and focus', async () => {
  const ok = vi.fn();
  render(<Modal visible><button>inside modal</button></Modal>);
  show('Error', 'Failed to record payment.', [{ text: 'OK', onPress: ok }]);
  const button = await screen.findByRole('button', { name: 'OK' });
  await waitFor(() => expect(document.activeElement).toBe(button));
  const backdrop = screen.getByTestId('alert-backdrop');
  const modalContent = screen.getByText('inside modal');
  expect(backdrop.compareDocumentPosition(modalContent) & Node.DOCUMENT_POSITION_PRECEDING).toBeTruthy();
  await userEvent.click(button);
  expect(ok).toHaveBeenCalledTimes(1);
});
