import { haversineKm } from './meetingSweep';
import type { MeetingGuideMeeting } from './sources/meetingGuide';

/**
 * Totals alone can't show a coastal gap, so a run reports on places a search from dry
 * land might not reach. Most are islands or barrier islands whose own cell is centered
 * on water. San Juan also hints at whether Spanish-language meetings are coming through.
 */
export const PLACES_TO_CHECK = [
  { name: 'Miami, FL', lat: 25.77, lng: -80.19 },
  { name: 'Key West, FL', lat: 24.56, lng: -81.78 },
  { name: 'Marathon, FL', lat: 24.71, lng: -81.09 },
  { name: 'Islamorada, FL', lat: 24.92, lng: -80.63 },
  { name: 'Sanibel, FL', lat: 26.45, lng: -82.1 },
  { name: 'San Francisco, CA', lat: 37.77, lng: -122.42 },
  { name: 'Nantucket, MA', lat: 41.28, lng: -70.1 },
  { name: 'Provincetown, MA', lat: 42.05, lng: -70.19 },
  { name: 'Block Island, RI', lat: 41.17, lng: -71.58 },
  { name: 'Montauk, NY', lat: 41.04, lng: -71.95 },
  { name: 'Nags Head, NC', lat: 35.96, lng: -75.62 },
  { name: 'Hatteras, NC', lat: 35.22, lng: -75.69 },
  { name: 'Ocracoke, NC', lat: 35.11, lng: -75.98 },
  { name: 'Put-in-Bay, OH', lat: 41.65, lng: -82.82 },
  { name: 'Galveston, TX', lat: 29.3, lng: -94.8 },
  { name: 'Unalaska, AK', lat: 53.87, lng: -166.53 },
  { name: 'San Juan, PR', lat: 18.47, lng: -66.11 },
  { name: 'Culebra, PR', lat: 18.3, lng: -65.3 },
  { name: 'Christiansted, VI', lat: 17.75, lng: -64.7 },
  { name: 'Charlotte Amalie, VI', lat: 18.34, lng: -64.93 },
  { name: 'Saipan, MP', lat: 15.18, lng: 145.75 },
  { name: 'Hagatna, GU', lat: 13.47, lng: 144.75 },
  { name: 'Pago Pago, AS', lat: -14.28, lng: -170.7 },
];

const NEAR_KM = 15;

export interface SweepCoverage {
  byState: Record<string, number>;
  places: { name: string; count: number }[];
}

export function summarizeCoverage(meetings: readonly MeetingGuideMeeting[]): SweepCoverage {
  const byState: Record<string, number> = {};
  const counts = new Array<number>(PLACES_TO_CHECK.length).fill(0);
  for (const m of meetings) {
    const state = m.state?.trim().toUpperCase() || 'unknown';
    byState[state] = (byState[state] ?? 0) + 1;
    const lat = parseFloat(m.latitude);
    const lng = parseFloat(m.longitude);
    PLACES_TO_CHECK.forEach((place, i) => {
      if (haversineKm(lat, lng, place.lat, place.lng) <= NEAR_KM) counts[i]++;
    });
  }
  return {
    byState: Object.fromEntries(Object.entries(byState).sort(([a], [b]) => a.localeCompare(b))),
    places: PLACES_TO_CHECK.map(({ name }, i) => ({ name, count: counts[i] })),
  };
}
