import type { ReactNode } from 'react';
import { danger, muted } from '../ui';
import type { Cell } from './summary';

// One place for what a cell says when it has no number to show.
export function CellText<T>({ cell, render }: { cell: Cell<T>; render: (value: T) => ReactNode }) {
  if (cell.state === 'loading') return <span aria-label="Loading" style={muted}>…</span>;
  if (cell.state === 'error') return <span style={danger}>Couldn't load</span>;
  if (cell.state === 'hidden') return <span style={muted}>—</span>;
  return <>{render(cell.value)}</>;
}

export const bedsText = (beds: { used: number; max: number }) =>
  beds.max === 0 ? <span style={muted}>No beds set up</span> : `${beds.used} / ${beds.max}`;

export const healthText = (percent: number | null, label?: (percent: number) => string) =>
  percent === null ? <span style={muted}>—</span> : `${percent}%${label ? ` ${label(percent)}` : ''}`;
