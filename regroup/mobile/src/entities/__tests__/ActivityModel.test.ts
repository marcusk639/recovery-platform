/**
 * Activity Entity Unit Tests
 *
 * Comprehensive tests for ActivityModel entities, type guards, factories,
 * and data conversion utilities.
 */

import {
  Activity,
  ActivityType,
  ActivityStatus,
  ActivityEntity,
  ActivityDataFactory,
  ChoreActivityData,
  MeetingActivityData,
  WorkActivityData,
  MedicationActivityData,
  PrimarySupporterActivityData,
  isChoreActivity,
  isMeetingActivity,
  isWorkActivity,
  isMedicationActivity,
  isPrimarySupporterActivity,
} from '../ActivityModel';

describe('ActivityModel', () => {
  // ============================================================================
  // Activity Entity Creation
  // ============================================================================

  describe('ActivityEntity', () => {
    it('should create activity entity with required fields', () => {
      const activity = new ActivityEntity(
        'guest123',
        'house456',
        ActivityType.CHORE,
        ActivityDataFactory.chore('daily', 'Kitchen'),
        'user789'
      );

      expect(activity.guestId).toBe('guest123');
      expect(activity.houseId).toBe('house456');
      expect(activity.type).toBe(ActivityType.CHORE);
      expect(activity.loggedBy).toBe('user789');
      expect(activity.status).toBe(ActivityStatus.ACTIVE);
      expect(activity.verified).toBe(false);
      expect(activity.timestamp).toBeInstanceOf(Date);
      expect(activity.loggedAt).toBeInstanceOf(Date);
    });

    it('should initialize with default values', () => {
      const activity = new ActivityEntity(
        'guest123',
        'house456',
        ActivityType.MEETING,
        ActivityDataFactory.meeting('AA Meeting', 'AA', 60),
        'user789'
      );

      expect(activity.id).toBe('');
      expect(activity.verified).toBe(false);
      expect(activity.status).toBe(ActivityStatus.ACTIVE);
      expect(activity.disputeReason).toBeUndefined();
      expect(activity.disputeResolvedBy).toBeUndefined();
      expect(activity.notes).toBeUndefined();
    });
  });

  // ============================================================================
  // Activity Data Factories
  // ============================================================================

  describe('ActivityDataFactory', () => {
    describe('chore', () => {
      it('should create chore activity data', () => {
        const data = ActivityDataFactory.chore('daily', 'Kitchen', 'chore123');

        expect(data.type).toBe('chore');
        expect(data.choreType).toBe('daily');
        expect(data.choreName).toBe('Kitchen');
        expect(data.choreId).toBe('chore123');
      });

      it('should create chore without choreId', () => {
        const data = ActivityDataFactory.chore('weekly', 'Bathroom');

        expect(data.type).toBe('chore');
        expect(data.choreType).toBe('weekly');
        expect(data.choreName).toBe('Bathroom');
        expect(data.choreId).toBeUndefined();
      });
    });

    describe('meeting', () => {
      it('should create meeting activity data', () => {
        const data = ActivityDataFactory.meeting(
          'Monday Night AA',
          'AA',
          90,
          'meeting123',
          '123 Main St'
        );

        expect(data.type).toBe('meeting');
        expect(data.meetingName).toBe('Monday Night AA');
        expect(data.meetingType).toBe('AA');
        expect(data.duration).toBe(90);
        expect(data.meetingId).toBe('meeting123');
        expect(data.location).toBe('123 Main St');
      });

      it('should use default duration if not provided', () => {
        const data = ActivityDataFactory.meeting('NA Meeting', 'NA');

        expect(data.duration).toBe(60);
      });

      it('should create meeting without optional fields', () => {
        const data = ActivityDataFactory.meeting('AA Meeting', 'AA', 60);

        expect(data.meetingId).toBeUndefined();
        expect(data.location).toBeUndefined();
      });
    });

    describe('work', () => {
      it('should create work activity data', () => {
        const shiftStart = new Date('2024-01-15T09:00:00');
        const shiftEnd = new Date('2024-01-15T17:00:00');

        const data = ActivityDataFactory.work(
          'Restaurant Server',
          8,
          'job123',
          shiftStart,
          shiftEnd
        );

        expect(data.type).toBe('work');
        expect(data.jobName).toBe('Restaurant Server');
        expect(data.hoursWorked).toBe(8);
        expect(data.jobId).toBe('job123');
        expect(data.shiftStart).toBe(shiftStart);
        expect(data.shiftEnd).toBe(shiftEnd);
      });

      it('should create work without optional fields', () => {
        const data = ActivityDataFactory.work('Retail', 6);

        expect(data.jobName).toBe('Retail');
        expect(data.hoursWorked).toBe(6);
        expect(data.jobId).toBeUndefined();
        expect(data.shiftStart).toBeUndefined();
        expect(data.shiftEnd).toBeUndefined();
      });

      it('should handle decimal hours', () => {
        const data = ActivityDataFactory.work('Part Time', 4.5);

        expect(data.hoursWorked).toBe(4.5);
      });
    });

    describe('medication', () => {
      it('should create medication activity data', () => {
        const data = ActivityDataFactory.medication(
          'Antabuse',
          '250mg',
          'morning'
        );

        expect(data.type).toBe('medication');
        expect(data.medicationName).toBe('Antabuse');
        expect(data.dosage).toBe('250mg');
        expect(data.prescribedTime).toBe('morning');
      });

      it('should create medication with minimal data', () => {
        const data = ActivityDataFactory.medication();

        expect(data.type).toBe('medication');
        expect(data.medicationName).toBeUndefined();
        expect(data.dosage).toBeUndefined();
        expect(data.prescribedTime).toBeUndefined();
      });
    });

    describe('primarySupporter', () => {
      it('should create primary supporter activity data', () => {
        const data = ActivityDataFactory.primarySupporter(
          'supporter123',
          'John Sponsor',
          60,
          'in-person'
        );

        expect(data.type).toBe('primary_supporter');
        expect(data.supporterId).toBe('supporter123');
        expect(data.supporterName).toBe('John Sponsor');
        expect(data.duration).toBe(60);
        expect(data.meetingType).toBe('in-person');
      });

      it('should create supporter meeting without optional fields', () => {
        const data = ActivityDataFactory.primarySupporter(
          'supporter123',
          'John Sponsor'
        );

        expect(data.supporterId).toBe('supporter123');
        expect(data.supporterName).toBe('John Sponsor');
        expect(data.duration).toBeUndefined();
        expect(data.meetingType).toBeUndefined();
      });
    });
  });

  // ============================================================================
  // Type Guards
  // ============================================================================

  describe('Type Guards', () => {
    const createActivity = (type: ActivityType, data: any): Activity => ({
      id: 'act123',
      guestId: 'guest123',
      houseId: 'house456',
      type,
      timestamp: new Date(),
      data,
      loggedBy: 'user789',
      loggedAt: new Date(),
      verified: false,
      status: ActivityStatus.ACTIVE,
    });

    describe('isChoreActivity', () => {
      it('should return true for chore activity', () => {
        const activity = createActivity(
          ActivityType.CHORE,
          ActivityDataFactory.chore('daily', 'Kitchen')
        );

        expect(isChoreActivity(activity)).toBe(true);
      });

      it('should return false for non-chore activity', () => {
        const activity = createActivity(
          ActivityType.MEETING,
          ActivityDataFactory.meeting('AA', 'AA', 60)
        );

        expect(isChoreActivity(activity)).toBe(false);
      });

      it('should narrow type correctly', () => {
        const activity = createActivity(
          ActivityType.CHORE,
          ActivityDataFactory.chore('daily', 'Kitchen')
        );

        if (isChoreActivity(activity)) {
          // TypeScript should know this is ChoreActivityData
          expect(activity.data.choreName).toBe('Kitchen');
        }
      });
    });

    describe('isMeetingActivity', () => {
      it('should return true for meeting activity', () => {
        const activity = createActivity(
          ActivityType.MEETING,
          ActivityDataFactory.meeting('AA', 'AA', 60)
        );

        expect(isMeetingActivity(activity)).toBe(true);
      });

      it('should return false for non-meeting activity', () => {
        const activity = createActivity(
          ActivityType.CHORE,
          ActivityDataFactory.chore('daily', 'Kitchen')
        );

        expect(isMeetingActivity(activity)).toBe(false);
      });
    });

    describe('isWorkActivity', () => {
      it('should return true for work activity', () => {
        const activity = createActivity(
          ActivityType.WORK,
          ActivityDataFactory.work('Server', 8)
        );

        expect(isWorkActivity(activity)).toBe(true);
      });

      it('should return false for non-work activity', () => {
        const activity = createActivity(
          ActivityType.CHORE,
          ActivityDataFactory.chore('daily', 'Kitchen')
        );

        expect(isWorkActivity(activity)).toBe(false);
      });
    });

    describe('isMedicationActivity', () => {
      it('should return true for medication activity', () => {
        const activity = createActivity(
          ActivityType.MEDICATION,
          ActivityDataFactory.medication('Antabuse')
        );

        expect(isMedicationActivity(activity)).toBe(true);
      });

      it('should return false for non-medication activity', () => {
        const activity = createActivity(
          ActivityType.CHORE,
          ActivityDataFactory.chore('daily', 'Kitchen')
        );

        expect(isMedicationActivity(activity)).toBe(false);
      });
    });

    describe('isPrimarySupporterActivity', () => {
      it('should return true for primary supporter activity', () => {
        const activity = createActivity(
          ActivityType.PRIMARY_SUPPORTER,
          ActivityDataFactory.primarySupporter('supporter123', 'John')
        );

        expect(isPrimarySupporterActivity(activity)).toBe(true);
      });

      it('should return false for non-supporter activity', () => {
        const activity = createActivity(
          ActivityType.CHORE,
          ActivityDataFactory.chore('daily', 'Kitchen')
        );

        expect(isPrimarySupporterActivity(activity)).toBe(false);
      });
    });
  });

});

