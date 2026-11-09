import type { MeetingGuideMeeting } from './sources/meetingGuide';
import { PLACES_TO_CHECK, summarizeCoverage } from './sweepCoverage';

const at = (lat: number, lng: number, state?: string): MeetingGuideMeeting => ({
  id: 1,
  name: 'M',
  day: 1,
  time: '07:00',
  latitude: String(lat),
  longitude: String(lng),
  state,
});
const countAt = (rows: MeetingGuideMeeting[], name: string) =>
  summarizeCoverage(rows).places.find((p) => p.name === name)?.count;

describe('summarizeCoverage', () => {
  it('counts meetings by state, whatever their case', () => {
    const { byState } = summarizeCoverage([
      at(30, -97, 'TX'),
      at(30, -97, 'tx'),
      at(40, -100, 'NE'),
    ]);
    expect(byState).toEqual({ TX: 2, NE: 1 });
  });

  it('counts a meeting with no state under "unknown", so it is not lost from the totals', () => {
    expect(summarizeCoverage([at(30, -97)]).byState).toEqual({ unknown: 1 });
  });

  it('counts a meeting close to a place to check', () => {
    expect(countAt([at(24.73, -81.05)], 'Marathon, FL')).toBe(1);
  });

  it('does not count a meeting farther away', () => {
    expect(countAt([at(25.2, -81.05)], 'Marathon, FL')).toBe(0);
  });

  it('reports a place with no meetings rather than leaving it out', () => {
    expect(countAt([], 'Nantucket, MA')).toBe(0);
  });

  it('skips a meeting with unusable coordinates instead of failing the run', () => {
    expect(countAt([at(Number.NaN, Number.NaN)], 'Marathon, FL')).toBe(0);
  });

  it.each(['Marathon, FL', 'Nantucket, MA', 'Galveston, TX', 'Pago Pago, AS', 'San Juan, PR'])(
    'checks %s',
    (name) => {
      expect(PLACES_TO_CHECK.map((p) => p.name)).toContain(name);
    },
  );
});
