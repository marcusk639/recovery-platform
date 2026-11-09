export type Direction = 'asc' | 'desc';

// Unknown values (loading, failed, hidden) sort last in either direction.
export function sortRows<T>(rows: T[], value: (row: T) => string | number | null, direction: Direction): T[] {
  const sign = direction === 'asc' ? 1 : -1;
  return [...rows].sort((a, b) => {
    const x = value(a);
    const y = value(b);
    if (x === null || y === null) return x === y ? 0 : x === null ? 1 : -1;
    if (typeof x === 'string' || typeof y === 'string') {
      return sign * String(x).localeCompare(String(y), undefined, { sensitivity: 'base' });
    }
    return sign * (x - y);
  });
}

export interface SortState<K extends string> {
  key: K;
  direction: Direction;
}

// The first click sorts ascending, the next flips it.
export const nextSort = <K extends string>(current: SortState<K>, key: K): SortState<K> =>
  current.key === key ? { key, direction: current.direction === 'asc' ? 'desc' : 'asc' } : { key, direction: 'asc' };
