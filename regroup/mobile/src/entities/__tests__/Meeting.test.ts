// Meeting.tsx has no external service dependencies requiring mocks.
// The firebase-setup global mock from moduleNameMapper handles any transitive imports.

import { RatsMeeting, DaysAndTimes, meetingHasLocation } from '../Meeting';

describe('DaysAndTimes entity', () => {
  it('does not throw when instantiated', () => {
    expect(() => new DaysAndTimes()).not.toThrow();
  });

  it('defaults all days to empty strings', () => {
    const days = new DaysAndTimes();
    expect(days.sunday).toBe('');
    expect(days.monday).toBe('');
    expect(days.tuesday).toBe('');
    expect(days.wednesday).toBe('');
    expect(days.thursday).toBe('');
    expect(days.friday).toBe('');
    expect(days.saturday).toBe('');
  });

  it('allows individual days to be set', () => {
    const days = new DaysAndTimes();
    days.monday = '18:00';
    expect(days.monday).toBe('18:00');
  });
});

describe('RatsMeeting entity', () => {
  describe('constructor with no args', () => {
    it('does not throw when instantiated', () => {
      expect(() => new RatsMeeting()).not.toThrow();
    });
  });

  describe('default field values', () => {
    let meeting: RatsMeeting;

    beforeEach(() => {
      meeting = new RatsMeeting();
    });

    it('defaults id to empty string', () => {
      expect(meeting.id).toBe('');
    });

    it('defaults name to empty string', () => {
      expect(meeting.name).toBe('');
    });

    it('defaults time to empty string', () => {
      expect(meeting.time).toBe('');
    });

    it('defaults street to empty string', () => {
      expect(meeting.street).toBe('');
    });

    it('defaults verified to false', () => {
      expect(meeting.verified).toBe(false);
    });

    it('defaults forced to false', () => {
      expect(meeting.forced).toBe(false);
    });

    it('initialises daysAndTimes as a DaysAndTimes instance', () => {
      expect(meeting.daysAndTimes).toBeInstanceOf(DaysAndTimes);
    });

    it('createdAt is a valid ISO string', () => {
      expect(typeof meeting.createdAt).toBe('string');
      expect(() => new Date(meeting.createdAt)).not.toThrow();
      expect(isNaN(new Date(meeting.createdAt).getTime())).toBe(false);
    });

    it('updatedAt is a valid ISO string', () => {
      expect(typeof meeting.updatedAt).toBe('string');
      expect(() => new Date(meeting.updatedAt)).not.toThrow();
      expect(isNaN(new Date(meeting.updatedAt).getTime())).toBe(false);
    });

    it('city is undefined by default', () => {
      expect(meeting.city).toBeUndefined();
    });

    it('state is undefined by default', () => {
      expect(meeting.state).toBeUndefined();
    });

    it('zip is undefined by default', () => {
      expect(meeting.zip).toBeUndefined();
    });

    it('lat is undefined by default', () => {
      expect(meeting.lat).toBeUndefined();
    });

    it('lng is undefined by default', () => {
      expect(meeting.lng).toBeUndefined();
    });

    it('online is undefined by default', () => {
      expect(meeting.online).toBeUndefined();
    });

    it('link is undefined by default', () => {
      expect(meeting.link).toBeUndefined();
    });

    it('addedBy is undefined by default', () => {
      expect(meeting.addedBy).toBeUndefined();
    });
  });

  describe('field mutation', () => {
    it('allows name to be set', () => {
      const meeting = new RatsMeeting();
      meeting.name = 'Monday Night AA';
      expect(meeting.name).toBe('Monday Night AA');
    });

    it('allows lat and lng to be set', () => {
      const meeting = new RatsMeeting();
      meeting.lat = 37.7749;
      meeting.lng = -122.4194;
      expect(meeting.lat).toBe(37.7749);
      expect(meeting.lng).toBe(-122.4194);
    });
  });
});

describe('meetingHasLocation', () => {
  it('returns true when lat and lng are both set', () => {
    const meeting = new RatsMeeting();
    meeting.lat = 37.7749;
    meeting.lng = -122.4194;
    expect(meetingHasLocation(meeting)).toBe(true);
  });

  it('returns true when Location array is non-empty', () => {
    const meeting = new RatsMeeting();
    meeting.Location = ['123 Main St'];
    expect(meetingHasLocation(meeting)).toBe(true);
  });

  it('returns false when neither lat/lng nor Location are set', () => {
    const meeting = new RatsMeeting();
    expect(meetingHasLocation(meeting)).toBe(false);
  });

  it('returns false when Location is an empty array', () => {
    const meeting = new RatsMeeting();
    meeting.Location = [];
    expect(meetingHasLocation(meeting)).toBe(false);
  });

  it('returns false when only lat is set without lng', () => {
    const meeting = new RatsMeeting();
    meeting.lat = 37.7749;
    // lng intentionally omitted (falsy)
    expect(meetingHasLocation(meeting)).toBe(false);
  });

  it('returns false when only lng is set without lat', () => {
    const meeting = new RatsMeeting();
    meeting.lng = -122.4194;
    expect(meetingHasLocation(meeting)).toBe(false);
  });
});
