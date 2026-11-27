// One house's page: a figure the role may not see is left out, as Overdue already is
// for a peer leader, rather than shown as a dash.
import { render, screen } from '@testing-library/react';
import { expect, vi } from 'vitest';
import type { HouseSummary } from '../src/app/houses/summary';
import { summary } from './fixtures/house-summary';

const current = vi.hoisted(() => ({ summary: null as HouseSummary | null }));
vi.mock('../src/app/houses/useHouseSummary', () => ({ useHouseSummary: () => current.summary }));
vi.mock('../src/app/houses/healthLabel', () => ({ healthLabel: () => 'Good' }));

import { HouseNumbers } from '../src/app/houses/HouseNumbers';

test('an owner or manager sees how many applications wait', () => {
  current.summary = summary({ applicationsWaiting: { state: 'ready', value: 3 } });
  render(<HouseNumbers houseId="h1" />);
  expect(screen.getByText('Applications waiting').nextElementSibling?.textContent).toBe('3');
});

test('a peer leader gets no Applications waiting figure (owner, 2026-11-27)', () => {
  current.summary = summary({
    applicationsWaiting: { state: 'hidden' },
    rentOverdueCents: { state: 'hidden' },
  });
  render(<HouseNumbers houseId="h1" />);
  expect(screen.queryByText('Applications waiting')).toBeNull();
  expect(screen.getByText('Open disputes')).toBeTruthy();
});
