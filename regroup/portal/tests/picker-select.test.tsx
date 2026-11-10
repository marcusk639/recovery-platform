import { act, fireEvent, render, screen } from '@testing-library/react';
import { createRef } from 'react';
import { vi } from 'vitest';
import RNPickerSelect from '../src/adapter/picker-select';

const items = [
  { key: 'k', label: 'Kitchen', value: 'Kitchen' },
  { key: 'b', label: 'Bathroom', value: 'Bathroom' },
];

test('shows the items and the current value', () => {
  render(<RNPickerSelect items={items} value="Bathroom" onValueChange={() => {}} />);
  expect(screen.getByRole('combobox').querySelector('option:checked')?.textContent).toBe('Bathroom');
  expect(screen.getAllByRole('option').map((o) => o.textContent)).toEqual(['Select an item...', 'Kitchen', 'Bathroom']);
});
test('reports the chosen value and its index, counting the placeholder', () => {
  const onValueChange = vi.fn();
  render(<RNPickerSelect items={items} value={null} onValueChange={onValueChange} />);
  fireEvent.change(screen.getByRole('combobox'), { target: { value: '1' } });
  expect(onValueChange).toHaveBeenCalledWith('Kitchen', 1);
});
test('choosing the placeholder reports its null value', () => {
  const onValueChange = vi.fn();
  render(<RNPickerSelect items={items} value="Kitchen" onValueChange={onValueChange} />);
  fireEvent.change(screen.getByRole('combobox'), { target: { value: '0' } });
  expect(onValueChange).toHaveBeenCalledWith(null, 0);
});
test('a placeholder of {} means none', () => {
  render(<RNPickerSelect items={items} value="Kitchen" placeholder={{}} onValueChange={() => {}} />);
  expect(screen.getAllByRole('option')).toHaveLength(2);
});
test('values of any type survive the trip', () => {
  const onValueChange = vi.fn();
  render(<RNPickerSelect items={[{ label: 'Two', value: 2 }]} value={null} onValueChange={onValueChange} />);
  fireEvent.change(screen.getByRole('combobox'), { target: { value: '1' } });
  expect(onValueChange).toHaveBeenCalledWith(2, 1);
});
test('setState from a ref, as RatsPicker calls it, does not throw', () => {
  const ref = createRef<any>();
  render(<RNPickerSelect ref={ref} items={items} value="Kitchen" onValueChange={() => {}} />);
  expect(() => act(() => ref.current.setState({ showPicker: false }))).not.toThrow();
});
test('onDonePress runs after a choice', () => {
  const onDonePress = vi.fn();
  render(<RNPickerSelect items={items} value={null} onValueChange={() => {}} onDonePress={onDonePress} />);
  fireEvent.change(screen.getByRole('combobox'), { target: { value: '2' } });
  expect(onDonePress).toHaveBeenCalledTimes(1);
});
test('the accessible name comes from textInputProps', () => {
  render(<RNPickerSelect items={items} value="Kitchen" onValueChange={() => {}} textInputProps={{ accessibilityLabel: 'Chore' }} />);
  expect(screen.getByRole('combobox', { name: 'Chore' })).toBeTruthy();
});
test('an Icon component renders beside the select', () => {
  render(<RNPickerSelect items={items} value="Kitchen" onValueChange={() => {}} Icon={() => <span>arrow</span>} />);
  expect(screen.getByText('arrow')).toBeTruthy();
});
