import { fireEvent, render, screen, within } from '@testing-library/react';
import { vi } from 'vitest';

vi.mock('@mobile/navigation/types', () => ({
  Routes: new Proxy({}, { get: (_target, key) => `route-${String(key)}` }),
}));
vi.mock('@mobile/navigation/service', () => ({ navigationRef: { current: null } }));

import { HouseTable } from '../src/app/houses/HouseTable';
import { summary } from './fixtures/house-summary';

test('a failed field says so and never shows zero', () => {
  render(<HouseTable summaries={[summary({ rentOverdueCents: { state: 'error' } })]} />);
  const row = screen.getByRole('row', { name: /One/ });
  expect(within(row).getByText("Couldn't load")).toBeTruthy();
  expect(row.textContent).not.toContain('$0.00');
});
test('a loading field says so', () => {
  render(<HouseTable summaries={[summary({ openDisputes: { state: 'loading' } })]} />);
  expect(screen.getAllByLabelText('Loading').length).toBeGreaterThan(0);
});
test('a house that failed entirely says so, by id', () => {
  const failed = summary({ name: null, house: { state: 'error' }, beds: { state: 'error' } });
  render(<HouseTable summaries={[failed]} />);
  expect(screen.getByText(/couldn't load this house/i)).toBeTruthy();
  expect(screen.getByRole('link', { name: 'h1' })).toBeTruthy();
});
test('a lapsed house shows that and no numbers', () => {
  render(<HouseTable summaries={[summary({ subscription: 'lapsed' })]} manageSubscriptionUrl="https://x" />);
  const row = screen.getByRole('row', { name: /One/ });
  expect(within(row).getByText('Subscription ended')).toBeTruthy();
  expect(within(row).getByRole('link', { name: 'Manage subscription' })).toBeTruthy();
  expect(row.textContent).not.toContain('$');
});
test('a house still loading shows dots, never Setting up', () => {
  render(<HouseTable summaries={[summary({ subscription: 'loading' })]} />);
  const row = screen.getByRole('row', { name: /One/ });
  expect(row.textContent).not.toContain('Setting up');
  expect(within(row).getAllByLabelText('Loading').length).toBe(5);
});
test('a house being set up says so', () => {
  render(<HouseTable summaries={[summary({ subscription: 'pending' })]} />);
  expect(screen.getByText('Setting up')).toBeTruthy();
});
test('a house in its grace period shows numbers and when it ends', () => {
  render(<HouseTable summaries={[summary({ subscription: 'grace', graceEndsAt: new Date('2026-07-01T12:00:00') })]} />);
  expect(screen.getByText('Subscription ending Jul 1, 2026')).toBeTruthy();
  expect(screen.getByRole('row', { name: /One/ }).textContent).toContain('$10.00');
});
test('totals say what they leave out', () => {
  render(<HouseTable summaries={[summary(), summary({ houseId: 'h2', name: 'Two', openDisputes: { state: 'error' } })]} />);
  expect(screen.getByRole('status').textContent).toContain('Not counting 1 of 2 houses');
});
test('nothing left out means no notice', () => {
  render(<HouseTable summaries={[summary()]} />);
  expect(screen.queryByRole('status')).toBeNull();
  expect(screen.getByTestId('total-overdue').textContent).toContain('$10.00');
});
test('a hidden field shows a dash, and its total disappears', () => {
  render(<HouseTable summaries={[summary({ rentOverdueCents: { state: 'hidden' } })]} />);
  expect(screen.getByRole('row', { name: /One/ }).textContent).not.toContain('$');
  expect(screen.queryByTestId('total-overdue')).toBeNull();
});
test('a house with no rooms set up says so rather than 0 / 0', () => {
  render(<HouseTable summaries={[summary({ beds: { state: 'ready', value: { used: 0, max: 0 } } })]} />);
  expect(screen.getByText('No beds set up')).toBeTruthy();
});
test('a house nobody can be scored in shows a dash, not 0%', () => {
  render(<HouseTable summaries={[summary({ healthPercent: { state: 'ready', value: null } })]} />);
  expect(screen.queryByText(/^0%/)).toBeNull();
});
test('health shows its word when given one', () => {
  render(<HouseTable summaries={[summary({ healthPercent: { state: 'ready', value: 75 } })]} healthLabel={() => 'Great'} />);
  expect(screen.getByText('75% Great')).toBeTruthy();
});
test('clicking a heading sorts, and says so to a screen reader', () => {
  render(
    <HouseTable
      summaries={[
        summary({ name: 'Low', rentOverdueCents: { state: 'ready', value: 1 } }),
        summary({ houseId: 'h2', name: 'High', rentOverdueCents: { state: 'ready', value: 9 } }),
      ]}
    />,
  );
  fireEvent.click(screen.getByRole('button', { name: /Overdue/ }));
  fireEvent.click(screen.getByRole('button', { name: /Overdue/ }));
  expect(screen.getAllByRole('link')[0].textContent).toBe('High');
  expect(screen.getByRole('columnheader', { name: /Overdue/ }).getAttribute('aria-sort')).toBe('descending');
});

const loadingHouse = (houseId: string) =>
  summary({
    houseId,
    name: null,
    house: { state: 'loading' },
    subscription: 'loading',
    beds: { state: 'loading' },
    healthPercent: { state: 'loading' },
    rentOverdueCents: { state: 'loading' },
    applicationsWaiting: { state: 'loading' },
    openDisputes: { state: 'loading' },
  });

test('while every house loads, the totals say so rather than showing zero', () => {
  render(<HouseTable summaries={[loadingHouse('h1'), loadingHouse('h2')]} />);
  expect(screen.getByTestId('total-beds').textContent).not.toContain('0 / 0');
  expect(screen.getByTestId('total-applications').textContent).not.toMatch(/\d/);
  expect(screen.getByTestId('total-disputes').textContent).not.toMatch(/\d/);
  expect(screen.queryByText('$0.00')).toBeNull();
});
test('no overdue card appears until a house has a known amount, so a peer leader never sees one flash', () => {
  render(<HouseTable summaries={[loadingHouse('h1')]} />);
  expect(screen.queryByTestId('total-overdue')).toBeNull();
});
test('the note gives the reason each house is left out', () => {
  render(
    <HouseTable
      summaries={[summary(), summary({ houseId: 'h2', subscription: 'lapsed' }), summary({ houseId: 'h3', house: { state: 'error' } })]}
    />,
  );
  const note = screen.getByRole('status').textContent ?? '';
  expect(note).toContain('Not counting 2 of 3 houses');
  expect(note).toContain('1 with an ended subscription');
  expect(note).toContain("1 that couldn't be read");
  expect(note).not.toContain('loading');
});

// A peer leader's houses show no money, so the overdue total leaves them out and says so.
test('the overdue total names the houses it leaves out for the role', () => {
  render(<HouseTable summaries={[summary(), summary({ houseId: 'h2', name: 'Two', rentOverdueCents: { state: 'hidden' } })]} />);
  const card = screen.getByTestId('total-overdue');
  expect(card.textContent).toContain('$10.00');
  expect(card.textContent).toContain('Leaves out 1 house your role');
});
test('one house unreadable and one hidden never shows the overdue total as $0.00', () => {
  render(
    <HouseTable
      summaries={[summary({ rentOverdueCents: { state: 'error' } }), summary({ houseId: 'h2', name: 'Two', rentOverdueCents: { state: 'hidden' } })]}
    />,
  );
  const card = screen.getByTestId('total-overdue');
  expect(card.textContent).not.toContain('$0.00');
  expect(within(card).getByLabelText('Not counted')).toBeTruthy();
});
test('a total with nothing left to load says Not counted, not Loading', () => {
  render(<HouseTable summaries={[summary({ subscription: 'lapsed' })]} manageSubscriptionUrl="https://x" />);
  const card = screen.getByTestId('total-disputes');
  expect(within(card).queryByLabelText('Loading')).toBeNull();
  expect(within(card).getByLabelText('Not counted')).toBeTruthy();
});
