// Pure decisions for the resident list. No mobile imports.
import { formatCents } from '../houses/summary';
import type { SortState } from '../sort';

interface GuestLike {
  id: string;
  status?: string;
  firstName?: string;
  lastName?: string;
  phase?: unknown;
}

export function roomOf(rooms: Record<string, { beds?: Record<string, { guestId?: string | null }> }> | undefined, guestId: string): string | null {
  for (const [name, room] of Object.entries(rooms ?? {})) {
    if (Object.values(room.beds ?? {}).some((bed) => bed.guestId === guestId)) return name;
  }
  return null;
}

// Discharged residents leave the list, as on the phone; their record stays.
export const currentResidents = <G extends GuestLike>(guests: Record<string, G>): G[] =>
  Object.values(guests).filter((guest) => guest.status !== 'discharged');

export function matchesName(guest: { firstName?: string; lastName?: string }, text: string): boolean {
  const wanted = text.trim().toLowerCase();
  if (!wanted) return true;
  return `${guest.firstName ?? ''} ${guest.lastName ?? ''}`.toLowerCase().includes(wanted);
}

export function balanceLabel(rentOwed: unknown): string {
  if (rentOwed === undefined) return formatCents(0);
  return typeof rentOwed === 'number' && Number.isFinite(rentOwed) ? formatCents(rentOwed) : "Can't read";
}

// A phase named after the guest is their own customized phase (UserInfo.tsx).
export function phaseLabel(guest: { id: string; phase?: unknown }): string {
  if (guest.phase === undefined || guest.phase === null || guest.phase === '') return 'No phase';
  return guest.phase === guest.id ? 'Custom' : String(guest.phase);
}

export const fullName = (guest: { firstName?: string; lastName?: string }) =>
  `${guest.firstName ?? ''} ${guest.lastName ?? ''}`.trim();

export type ResidentKey = 'name' | 'status' | 'phase' | 'room' | 'movedIn' | 'week' | 'balance';
export interface TableState {
  sort: SortState<ResidentKey>;
  filter: string;
}

// Memory only, so it survives opening a record and coming back, and the full page
// load at sign-out wipes it.
const tables = new Map<string, TableState>();
export function tableStateFor(houseId: string): TableState {
  let state = tables.get(houseId);
  if (!state) {
    state = { sort: { key: 'name', direction: 'asc' }, filter: '' };
    tables.set(houseId, state);
  }
  return state;
}
