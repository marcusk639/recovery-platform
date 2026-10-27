import { alreadyCheckedIn } from '../meetingDedupe';
import { Activity, ActivityStatus, ActivityType } from '../../entities/ActivityModel';

const meeting = (meetingId: string, extra: Partial<Activity> = {}): Activity =>
  ({
    id: `a-${meetingId}`,
    guestId: 'g1',
    houseId: 'h1',
    type: ActivityType.MEETING,
    status: ActivityStatus.ACTIVE,
    data: { type: 'meeting', meetingName: 'AA', meetingType: 'AA', duration: 60, meetingId },
    ...extra,
  }) as unknown as Activity;

describe('alreadyCheckedIn (same-day meeting dedupe)', () => {
  it('blocks a duplicate check-in to the same meeting', () => {
    expect(alreadyCheckedIn([meeting('m1')], 'm1')).toBe(true);
    expect(alreadyCheckedIn([meeting('m1')], 'm2')).toBe(false);
  });

  it('a pending-dispute meeting still blocks a duplicate check-in (it still counts)', () => {
    expect(alreadyCheckedIn([meeting('m1', { status: ActivityStatus.DISPUTED })], 'm1')).toBe(true);
  });

  it('a rejected dispute still blocks; an approved dispute or a deletion does not', () => {
    expect(
      alreadyCheckedIn([meeting('m1', { status: ActivityStatus.RESOLVED, disputed: 'rejected', incomplete: false })], 'm1'),
    ).toBe(true);
    expect(
      alreadyCheckedIn([meeting('m1', { status: ActivityStatus.RESOLVED, disputed: 'successful', incomplete: true })], 'm1'),
    ).toBe(false);
    expect(alreadyCheckedIn([meeting('m1', { status: ActivityStatus.DELETED })], 'm1')).toBe(false);
  });

  it('never matches a meeting without an id', () => {
    expect(alreadyCheckedIn([meeting('')], undefined)).toBe(false);
  });
});
