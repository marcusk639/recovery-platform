import { eventAgeMinutes, isStaleEvent, RETRY_CUTOFF_MS } from '../../util/eventAge';

const NOW = Date.parse('2026-10-27T12:00:00Z');

describe('eventAgeMinutes', () => {
  it('returns whole minutes since the event time', () => {
    expect(eventAgeMinutes('2026-10-27T11:30:30Z', NOW)).toBe(29);
  });

  it('returns null for a missing or unparseable time', () => {
    expect(eventAgeMinutes(undefined, NOW)).toBeNull();
    expect(eventAgeMinutes('not a date', NOW)).toBeNull();
  });
});

describe('isStaleEvent', () => {
  it('is false at the cutoff and true past it', () => {
    const atCutoff = new Date(NOW - RETRY_CUTOFF_MS).toISOString();
    const past = new Date(NOW - RETRY_CUTOFF_MS - 60000).toISOString();
    expect(isStaleEvent(atCutoff, NOW)).toBe(false);
    expect(isStaleEvent(past, NOW)).toBe(true);
  });

  it('treats a missing time as fresh', () => {
    expect(isStaleEvent(undefined, NOW)).toBe(false);
  });
});
