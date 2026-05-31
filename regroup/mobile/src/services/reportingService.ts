import { firestore, auth } from '../../firebase-setup';
import { logException } from '../util/logging';
import { Guest } from '../entities/Guest';
import { WeekSummary } from '../entities/WeekSummary';
import {
  startOfWeek,
  subWeeks,
  format,
  subDays,
  isAfter,
  parseISO,
} from 'date-fns';

export const weekSummaryCollection = firestore.collection('week-summaries');

export interface OccupancyReport {
  activeCount: number;
  capacity: number;
  occupancyPct: number;
}

export interface WeekComplianceSlice {
  weekStart: string;
  choreRate: number;
  meetingRate: number;
  guestCount: number;
}

export interface ComplianceTrend {
  weeks: WeekComplianceSlice[];
}

export type DischargePeriod = 30 | 60 | 90;

export interface DischargedResident {
  id: string;
  displayName: string;
  movedOutDate: string;
}

export interface DischargeReport {
  period: DischargePeriod;
  residents: DischargedResident[];
  count: number;
}

export function getSundayAnchoredWeekStart(date: Date): string {
  return format(startOfWeek(date, { weekStartsOn: 0 }), 'yyyy-MM-dd');
}

function resolveDisplayName(guest: Partial<Guest>): string {
  if (guest.displayName) return guest.displayName;
  const first = guest.firstName ?? '';
  const last = guest.lastName ?? '';
  return `${first} ${last}`.trim() || 'Unknown';
}

export async function getOccupancyReport(
  houseId: string,
  activeGuests: Guest[],
  capacity: number,
): Promise<OccupancyReport> {
  if (!auth.currentUser) {
    throw new Error('getOccupancyReport: user not authenticated');
  }
  if (!houseId) throw new Error('getOccupancyReport: houseId is required');

  const activeCount = activeGuests.filter(
    g => g.houseId === houseId && g.status === 'active',
  ).length;

  const safeCap = capacity > 0 ? capacity : 1;
  const occupancyPct = Math.round((activeCount / safeCap) * 100);

  return { activeCount, capacity: safeCap, occupancyPct };
}

export async function getComplianceTrend(
  houseId: string,
  guestIds: string[],
  weeksBack: number = 4,
): Promise<ComplianceTrend> {
  if (!auth.currentUser) {
    throw new Error('getComplianceTrend: user not authenticated');
  }
  if (!houseId) throw new Error('getComplianceTrend: houseId is required');
  if (guestIds.length === 0) {
    return { weeks: [] };
  }

  const now = new Date();
  const weekStarts: string[] = [];
  for (let i = 0; i < weeksBack; i++) {
    weekStarts.push(getSundayAnchoredWeekStart(subWeeks(now, i)));
  }
  weekStarts.reverse();

  const CHUNK = 30;
  const allDocs: WeekSummary[] = [];

  const weekStartSet = new Set(weekStarts);

  try {
    for (let i = 0; i < guestIds.length; i += CHUNK) {
      const chunk = guestIds.slice(i, i + CHUNK);
      // Only one 'in' operator per Firestore query — filter startDate client-side
      const snap = await weekSummaryCollection
        .where('houseId', '==', houseId)
        .where('guestId', 'in', chunk)
        .get();
      snap.docs
        .map(d => d.data() as WeekSummary)
        .filter(doc => weekStartSet.has(doc.startDate))
        .forEach(doc => allDocs.push(doc));
    }
  } catch (error) {
    throw new Error('Failed to fetch compliance trend data');
  }

  const byWeek: Record<string, WeekSummary[]> = {};
  for (const doc of allDocs) {
    const key = doc.startDate;
    if (!byWeek[key]) byWeek[key] = [];
    byWeek[key].push(doc);
  }

  const guestCount = guestIds.length;
  const weeks: WeekComplianceSlice[] = weekStarts.map(weekStart => {
    const docs = byWeek[weekStart] ?? [];
    const choresMet = docs.filter(d => d.stats.choresCompleted > 0).length;
    const meetingsMet = docs.filter(d => d.stats.meetingsAttended >= 3).length;
    return {
      weekStart,
      choreRate: guestCount > 0 ? choresMet / guestCount : 0,
      meetingRate: guestCount > 0 ? meetingsMet / guestCount : 0,
      guestCount,
    };
  });

  return { weeks };
}

export async function getDischargeReport(
  houseId: string,
  allGuests: Guest[],
  daysBack: DischargePeriod,
): Promise<DischargeReport> {
  if (!auth.currentUser) {
    throw new Error('getDischargeReport: user not authenticated');
  }
  if (!houseId) throw new Error('getDischargeReport: houseId is required');

  const cutoff = subDays(new Date(), daysBack);

  const discharged = allGuests.filter(g => {
    if (g.houseId !== houseId) return false;
    if (g.status !== 'discharged') return false;
    if (!g.moveOutDate) return false;
    try {
      return isAfter(parseISO(g.moveOutDate), cutoff);
    } catch {
      return false;
    }
  });

  const residents: DischargedResident[] = discharged.map(g => ({
    id: g.id,
    displayName: resolveDisplayName(g),
    movedOutDate: g.moveOutDate ?? '',
  }));

  residents.sort((a, b) => b.movedOutDate.localeCompare(a.movedOutDate));

  return { period: daysBack, residents, count: residents.length };
}
