import {
  DisputeChallenge,
  DISPUTABLE_STATS,
  DisputeType,
} from '../Dispute';
import { ActivityType } from '../ActivityModel';

describe('DisputeChallenge class', () => {
  describe('constructor', () => {
    it('does not throw when instantiated', () => {
      expect(() => new DisputeChallenge()).not.toThrow();
    });

    it('defaults challenger to empty string', () => {
      const challenge = new DisputeChallenge();
      expect(challenge.challenger).toBe('');
    });

    it('defaults message to empty string', () => {
      const challenge = new DisputeChallenge();
      expect(challenge.message).toBe('');
    });
  });

  describe('field mutation', () => {
    it('allows challenger to be set', () => {
      const challenge = new DisputeChallenge();
      challenge.challenger = 'admin-123';
      expect(challenge.challenger).toBe('admin-123');
    });

    it('allows message to be set', () => {
      const challenge = new DisputeChallenge();
      challenge.message = 'This chore was not done properly.';
      expect(challenge.message).toBe('This chore was not done properly.');
    });
  });

  describe('two independent instances', () => {
    it('do not share field values', () => {
      const a = new DisputeChallenge();
      const b = new DisputeChallenge();
      a.challenger = 'admin-1';
      expect(b.challenger).toBe('');
    });
  });
});

describe('DISPUTABLE_STATS constant', () => {
  it('is an array', () => {
    expect(Array.isArray(DISPUTABLE_STATS)).toBe(true);
  });

  it('contains CHORE activity type', () => {
    expect(DISPUTABLE_STATS).toContain(ActivityType.CHORE);
  });

  it('contains PRIMARY_SUPPORTER activity type', () => {
    expect(DISPUTABLE_STATS).toContain(ActivityType.PRIMARY_SUPPORTER);
  });

  it('contains WORK activity type', () => {
    expect(DISPUTABLE_STATS).toContain(ActivityType.WORK);
  });

  it('contains MEETING activity type', () => {
    expect(DISPUTABLE_STATS).toContain(ActivityType.MEETING);
  });

  it('contains MEDICATION activity type', () => {
    expect(DISPUTABLE_STATS).toContain(ActivityType.MEDICATION);
  });

  it('has exactly 5 entries', () => {
    expect(DISPUTABLE_STATS).toHaveLength(5);
  });
});

describe('DisputeType (type alias for ActivityType)', () => {
  it('accepts ActivityType values as DisputeType', () => {
    const type: DisputeType = ActivityType.CHORE;
    expect(type).toBe(ActivityType.CHORE);
  });
});
