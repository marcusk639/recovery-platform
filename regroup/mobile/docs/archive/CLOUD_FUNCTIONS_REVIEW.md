---
archived: true
archived_date: 2026-05-24
reason: 'Nov 2025 review of legacy CF code. Cloud Functions have since been fully rewritten in regroup-functions repo.'
---

I'll analyze the cloud functions in the regroup-functions directory to identify what needs to be updated for the activity-based system.

[15 tools called]

Now I have a complete picture of the cloud functions. Let me provide a comprehensive analysis of what needs to be updated.

---

# Cloud Functions Analysis: Required Changes for Activity-Based System

## Current State

The cloud functions in `regroup-functions` are **heavily dependent on the legacy Week/Day data model**. Here are the critical areas that need updating:

## 🔴 Critical Issues Found

### 1. **Weekly Transfer Function (`transferStats` in `util/guest.ts`)**

**Current Behavior:**

- Lines 57-91: Relies entirely on `guest.currentWeek` and `guest.previousWeek`
- Archives old weeks to `guest-weeks` collection
- Creates `WeeklyReport` from Week data using `sumStat()`
- Starts new weeks by creating new Week objects with Day structures

**Problems:**

- ❌ Will break when `currentWeek`/`previousWeek` are removed from Guest entity
- ❌ Creates redundant Week documents in Firestore
- ❌ Cannot leverage activity-based data

**Required Changes:**

```typescript
// NEW: regroup-functions/functions/src/util/guest.ts

import {
  activityCollection,
  weeklySummaryCollection,
  dailySummaryCollection,
} from '../api/firestore';

export const transferStats = async (
  context: EventContext,
  timezone?: string,
  houseId?: string,
) => {
  logger.info('Starting activity-based weekly transfer...');
  let houseQuery: any;
  let guests: Guests = {};

  if (houseId) {
    houseQuery = await houseCollection.where('id', '==', houseId).get();
  } else {
    houseQuery = timezone
      ? await houseCollection.where('timezone', '==', timezone).get()
      : await houseCollection.get();
  }

  logger.info('All houses retrieved. Processing weekly reports...');

  for (let doc of houseQuery.docs) {
    const house = doc.data() as House;

    try {
      await ratsFirestore.runTransaction(async transaction => {
        logger.info('Processing house', house.id, house.name);

        const guestQuery = await transaction.get(
          guestCollection.where('houseId', '==', house.id),
        );

        // Calculate weekly health for house
        calculateWeeklyHealth(guestQuery, house);
        transaction.update(doc.ref, JSON.parse(JSON.stringify(house)));

        for (const document of guestQuery.docs) {
          const guest = document.data() as Guest;
          guests[guest.id] = guest;

          // Get current week dates
          const lastWeekStart = getStartOfWeek(
            new Date(Date.now() - 7 * 24 * 60 * 60 * 1000),
          );
          const lastWeekEnd = getEndOfWeek(lastWeekStart);

          // Check if weekly report already exists
          const existingReportQuery = await reportCollection
            .where('guestId', '==', guest.id)
            .where('startDate', '==', lastWeekStart)
            .get();

          if (existingReportQuery.empty) {
            logger.info(
              'Creating weekly report for',
              guest.firstName,
              guest.lastName,
            );

            // Get or create weekly summary from activities
            const weeklySummaryKey = `${guest.id}_${lastWeekStart}`;
            const weeklySummaryDoc = await transaction.get(
              weeklySummaryCollection.doc(weeklySummaryKey),
            );

            let weeklyReport: WeeklyReport;

            if (weeklySummaryDoc.exists) {
              // Use existing summary
              const summary = weeklySummaryDoc.data() as WeeklyActivitySummary;
              weeklyReport = {
                id: reportCollection.doc().id,
                guestId: guest.id,
                startDate: lastWeekStart,
                endDate: lastWeekEnd,
                hoursWorked: summary.totalHoursWorked,
                meeting: summary.totalMeetings,
                medication: summary.medicationsTaken,
                choreCompleted: summary.totalChoresCompleted,
                metPrimarySupporter: summary.supporterMeetings > 0,
                step: guest.step || 1,
              };
            } else {
              // Fallback: Calculate from activities
              const activitiesQuery = await activityCollection
                .where('residentId', '==', guest.id)
                .where('date', '>=', lastWeekStart)
                .where('date', '<=', lastWeekEnd)
                .get();

              weeklyReport = calculateWeeklyReportFromActivities(
                guest.id,
                lastWeekStart,
                lastWeekEnd,
                activitiesQuery.docs.map(d => d.data() as Activity),
                guest.step,
              );
            }

            // Save weekly report
            const weeklyReportDoc = reportCollection.doc(weeklyReport.id);
            transaction.set(weeklyReportDoc, weeklyReport);

            logger.info('Weekly report created for', guest.firstName);
          }
        }

        logger.info('Transaction completed for house', house.id);
      });
    } catch (error) {
      logger.error('Error processing house', house.id, error);
    }
  }

  logger.info('Weekly transfer complete!');
  return guests;
};

// Helper function to calculate report from activities
function calculateWeeklyReportFromActivities(
  guestId: string,
  startDate: string,
  endDate: string,
  activities: Activity[],
  step: number | string,
): WeeklyReport {
  const stats = {
    hoursWorked: 0,
    meeting: 0,
    medication: 0,
    choreCompleted: 0,
    metPrimarySupporter: false,
  };

  activities.forEach(activity => {
    switch (activity.type) {
      case 'meeting_attended':
        stats.meeting += 1;
        break;
      case 'hours_worked':
        stats.hoursWorked += activity.value as number;
        break;
      case 'chore_completed':
        stats.choreCompleted += 1;
        break;
      case 'supporter_met':
        stats.metPrimarySupporter = true;
        break;
      case 'medication_taken':
        stats.medication += 1;
        break;
    }
  });

  return {
    id: reportCollection.doc().id,
    guestId,
    startDate,
    endDate,
    ...stats,
    step,
  };
}
```

### 2. **Dispute Resolution (`util/disputes.ts`)**

**Current Behavior:**

- Lines 62-93: Directly manipulates `guest[week].days[date]` and `guest[week].activities`
- Reverses stats by modifying Day objects
- Updates activities array in Week

**Problems:**

- ❌ Tightly coupled to Week/Day structure
- ❌ Won't work with activity-based system

**Required Changes:**

```typescript
// NEW: regroup-functions/functions/src/util/disputes.ts

export const determineDisputeResult = async (
  house: House,
  dispute: Dispute,
  transaction: FirebaseFirestore.Transaction,
) => {
  logger.info('Determining dispute result...', dispute);

  // Get the disputed activity directly from activities collection
  const activityDoc = await transaction.get(
    activityCollection.doc(dispute.activityId),
  );

  if (!activityDoc.exists) {
    logger.error('Activity not found:', dispute.activityId);
    return;
  }

  const activity = activityDoc.data() as Activity;
  const result = disputeResult(dispute, activity);

  if (result !== 'none') {
    logger.info('Dispute result:', result);

    // Update the activity's dispute status
    const updatedActivity = {
      ...activity,
      underDispute: Math.max(0, activity.underDispute - 1),
      disputeResult: result,
      updatedDate: getCurrentTime(),
    };

    transaction.update(activityDoc.ref, updatedActivity);

    // If dispute was successful, mark activity as invalid/disputed
    if (result === 'success') {
      transaction.update(activityDoc.ref, {
        value: false, // or 0, depending on type
        metadata: {
          ...activity.metadata,
          disputedSuccessfully: true,
          disputeId: dispute.id,
        },
      });

      // Recalculate daily and weekly summaries
      await recalculateSummariesForDate(
        activity.residentId,
        activity.date,
        transaction,
      );
    }

    // Update house disputes
    const { disputes, resolvedDispute } = updateHouseDisputes(
      house,
      dispute,
      result === 'fail' ? 'overturned' : 'allowed',
    );

    // Update the dispute in the house document
    updateDispute(disputes, null, [], transaction, resolvedDispute);
  }
};

// New helper function
async function recalculateSummariesForDate(
  residentId: string,
  date: string,
  transaction: FirebaseFirestore.Transaction,
) {
  // Get all activities for that date
  const activitiesQuery = await activityCollection
    .where('residentId', '==', residentId)
    .where('date', '==', date)
    .get();

  // Recalculate daily summary
  const dailySummary = {
    id: `${residentId}_${date}`,
    residentId,
    date,
    meetingsAttended: 0,
    hoursWorked: 0,
    choresCompleted: 0,
    supporterMet: false,
    medicationsTaken: 0,
    lastUpdated: getCurrentTime(),
  };

  activitiesQuery.docs.forEach(doc => {
    const activity = doc.data() as Activity;

    // Skip disputed activities
    if (activity.disputeResult === 'success') return;

    switch (activity.type) {
      case 'meeting_attended':
        dailySummary.meetingsAttended += 1;
        break;
      case 'hours_worked':
        dailySummary.hoursWorked += activity.value as number;
        break;
      case 'chore_completed':
        dailySummary.choresCompleted += 1;
        break;
      case 'supporter_met':
        dailySummary.supporterMet = true;
        break;
      case 'medication_taken':
        dailySummary.medicationsTaken += 1;
        break;
    }
  });

  transaction.set(dailySummaryCollection.doc(dailySummary.id), dailySummary);

  // TODO: Also recalculate weekly summary
}
```

### 3. **House Health Calculation (`util/house.ts`)**

**Current Behavior:**

- Lines 44-70: Accesses `guest.currentWeek.days` to calculate health percentage
- Directly iterates through Day objects

**Problems:**

- ❌ Relies on Day structure

**Required Changes:**

```typescript
// NEW: regroup-functions/functions/src/util/house.ts

export const getOverallPercentage = async (
  guest: Guest,
  house: House,
  date: string,
): Promise<number> => {
  const phaseRules = house.phases[guest.phase].rules;
  const weekStart = getStartOfWeek(date);

  // Get weekly summary from cache or calculate from activities
  const weeklySummaryKey = `${guest.id}_${weekStart}`;
  const weeklySummaryDoc = await weeklySummaryCollection
    .doc(weeklySummaryKey)
    .get();

  let meetings = 0,
    supporter = false,
    chore = 0,
    work = 0;

  if (weeklySummaryDoc.exists) {
    const summary = weeklySummaryDoc.data() as WeeklyActivitySummary;
    meetings = summary.totalMeetings;
    supporter = summary.supporterMeetings > 0;
    chore = summary.totalChoresCompleted;
    work = summary.totalHoursWorked;
  } else {
    // Fallback: query activities directly
    const weekEnd = getEndOfWeek(weekStart);
    const activitiesQuery = await activityCollection
      .where('residentId', '==', guest.id)
      .where('date', '>=', weekStart)
      .where('date', '<=', date)
      .get();

    activitiesQuery.docs.forEach(doc => {
      const activity = doc.data() as Activity;
      if (activity.disputeResult === 'success') return; // Skip disputed

      switch (activity.type) {
        case 'meeting_attended':
          meetings += 1;
          break;
        case 'hours_worked':
          work += activity.value as number;
          break;
        case 'chore_completed':
          chore += 1;
          break;
        case 'supporter_met':
          supporter = true;
          break;
      }
    });
  }

  // Calculate percentages
  const meetingPercentage =
    phaseRules.meetings > 0 ? meetings / phaseRules.meetings : 1.0;
  const supporterPercentage = supporter ? 1.0 : 0.0;
  const chorePercentage = chore / 7;
  const workPercentage =
    phaseRules.work > 0 ? Math.min(work / phaseRules.work, 1.0) : 1.0;

  const weight = 0.25;
  const overall =
    meetingPercentage * weight +
    supporterPercentage * weight +
    chorePercentage * weight +
    workPercentage * weight;

  return Math.ceil(overall * 100);
};

// Make this async
export const calculateWeeklyHealth = async (
  guestsQuery: FirebaseFirestore.QuerySnapshot,
  house: House,
) => {
  const guests = fillGuests(guestsQuery);
  const weekEndDate = getYesterdaysDate();

  // Calculate health for each guest (now async)
  const healthPromises = Object.values(guests).map(guest =>
    getOverallPercentage(guest, house, weekEndDate),
  );

  const healthScores = await Promise.all(healthPromises);
  const totalHealth = healthScores.reduce((sum, score) => sum + score, 0);
  const avgHealth =
    healthScores.length > 0 ? Math.ceil(totalHealth / healthScores.length) : 0;

  // Support legacy houses
  if (
    !house.health ||
    typeof house.health === 'number' ||
    typeof house.health === 'string'
  ) {
    house.health = {};
  }

  // Keep only last 8 weeks
  if (_.size(house.health) === 8) {
    const dates = Object.keys(house.health);
    const sortedDates = dates.sort((a, b) => a.localeCompare(b));
    delete house.health[sortedDates[0]]; // Remove oldest
  }

  house.health[weekEndDate] = avgHealth;
};
```

### 4. **Guest Entity (`entities/Guest.ts`)**

**Current Issues:**

- Lines 79-81: Still has `currentWeek`, `previousWeek`, `nextWeek`
- Constructor creates a new Week

**Required Changes:**

```typescript
// UPDATED: regroup-functions/functions/src/entities/Guest.ts

export class Guest extends BaseEntity {
  id: string = '';
  userId: string = '';
  houseId: string = '';
  isAdmin: boolean = false;
  rentOwed: number = 0;
  choreFees: number = 0;
  dailyHabit: number = 0;
  drugOfChoice: string = '';
  email: string = '';
  firstName: string = '';
  hasJob: boolean = false;
  lastName: string = '';
  sobrietyDate: string = '';
  phase: number | string = 'default';
  avatar: string;
  supporters: string[] = [];
  roles: Roles;
  // REMOVED: currentWeek, previousWeek, nextWeek
  phoneNumber: string;
  infoEntered: boolean = false;
  jobs = [];
  createdDate = getCurrentTime();
  step: number | string = 1; // Add step tracking at guest level
  primarySupporterId: string = ''; // Add to guest level
  primarySupporterName: string = ''; // Add to guest level
  sponsees: string[] = []; // Add to guest level
  currentChore: string = ''; // Add current chore to guest level

  constructor() {
    super();
    this.id = createGuestId();
    // REMOVED: this.currentWeek = new Week(this);
  }
}
```

### 5. **Week Entity - Deprecation**

The `Week` entity should be **marked as deprecated** but kept for backward compatibility with archived data:

```typescript
// DEPRECATED: regroup-functions/functions/src/entities/Week.ts

/**
 * @deprecated This entity is deprecated and should not be used for new data.
 * Use the Activity-based system instead. Kept for backward compatibility with
 * archived week data in the 'guest-weeks' collection.
 */
export default class Week extends BaseEntity {
  // ... existing implementation
}
```

### 6. **WeeklyReport Updates**

```typescript
// UPDATED: regroup-functions/functions/src/entities/WeeklyReport.ts

import { BaseEntity } from './BaseEntity';

class WeeklyReport extends BaseEntity {
  guestId: string;
  startDate: string;
  endDate: string;
  hoursWorked: number | string;
  step: number | string;
  medication: number | string;
  choreCompleted: number | string;
  metPrimarySupporter: boolean;
  meeting: number | string;

  // NEW: Constructor that works with activity summaries
  constructor(
    guestId: string,
    startDate: string,
    endDate: string,
    stats: {
      hoursWorked: number;
      meeting: number;
      medication: number;
      choreCompleted: number;
      metPrimarySupporter: boolean;
      step: number | string;
    },
  ) {
    super();
    this.guestId = guestId;
    this.startDate = startDate;
    this.endDate = endDate;
    this.hoursWorked = stats.hoursWorked;
    this.medication = stats.medication;
    this.meeting = stats.meeting;
    this.metPrimarySupporter = stats.metPrimarySupporter;
    this.choreCompleted = stats.choreCompleted;
    this.step = stats.step;
  }

  // DEPRECATED: Keep for backward compatibility
  static fromWeek(week: Week, id: string): WeeklyReport {
    const report = new WeeklyReport(
      week.guestId,
      week.startDate,
      week.endDate,
      {
        hoursWorked: sumStat(week, 'hoursWorked'),
        medication: sumStat(week, 'medication'),
        meeting: sumStat(week, 'meeting'),
        metPrimarySupporter: sumStat(week, 'metPrimarySupporter') > 0,
        choreCompleted: sumStat(week, 'choreCompleted'),
        step: week.step,
      },
    );
    report.id = id;
    return report;
  }
}

export default WeeklyReport;
```

### 7. **New Firestore Collections**

Add to `api/firestore.ts`:

```typescript
// ADD: regroup-functions/functions/src/api/firestore.ts

export const activityCollection = ratsFirestore.collection('activities');
export const dailySummaryCollection =
  ratsFirestore.collection('daily-summaries');
export const weeklySummaryCollection =
  ratsFirestore.collection('weekly-summaries');
```

### 8. **New Activity Entity for Cloud Functions**

Create a new file matching the client-side Activity entity:

```typescript
// NEW: regroup-functions/functions/src/entities/Activity.ts

import { BaseEntity } from './BaseEntity';
import { getCurrentTime, getTodaysDate } from '../util/date';
import { v4 as uuid } from 'uuid';

export type ActivityType =
  | 'meeting_attended'
  | 'hours_worked'
  | 'chore_completed'
  | 'supporter_met'
  | 'medication_taken'
  | 'step_work'
  | 'sponsor_meeting'
  | 'therapy_session'
  | 'group_meeting'
  | 'individual_meeting'
  | 'dispute'
  | 'payment'
  | 'chore_changed';

export interface ActivityMetadata {
  meetingName?: string;
  meetingLocation?: string;
  jobName?: string;
  hours?: number;
  supporterName?: string;
  choreName?: string;
  medicationType?: string;
  disputeReason?: string;
  paymentAmount?: number;
  stepNumber?: number;
  sponsorName?: string;
  therapyType?: string;
  groupName?: string;
  individualCounselor?: string;
  notes?: string;
  verified?: boolean;
  disputedSuccessfully?: boolean;
  disputeId?: string;
}

export class Activity extends BaseEntity {
  id: string = uuid();
  residentId: string = '';
  houseId: string = '';
  type: ActivityType;
  date: string = getTodaysDate();
  value: number | boolean = true;
  metadata: ActivityMetadata = {};
  underDispute: number = 0;
  disputeResult: 'none' | 'success' | 'fail' = 'none';
  disputeId: string = '';
  createdDate: string = getCurrentTime();
  updatedDate: string = getCurrentTime();

  constructor(
    residentId: string,
    type: ActivityType,
    value: number | boolean = true,
    metadata: ActivityMetadata = {},
    date?: string,
  ) {
    super();
    this.residentId = residentId;
    this.type = type;
    this.value = value;
    this.metadata = metadata;
    this.date = date || getTodaysDate();
  }
}

export interface DailyActivitySummary {
  id: string;
  residentId: string;
  date: string;
  meetingsAttended: number;
  hoursWorked: number;
  choresCompleted: number;
  supporterMet: boolean;
  medicationsTaken: number;
  lastUpdated: string;
}

export interface WeeklyActivitySummary {
  id: string;
  residentId: string;
  weekStartDate: string;
  weekEndDate: string;
  totalMeetings: number;
  totalHoursWorked: number;
  totalChoresCompleted: number;
  supporterMeetings: number;
  medicationsTaken: number;
  healthScore: number;
  lastUpdated: string;
}
```

---

## Summary of Changes Required

### High Priority (Breaking Changes)

1. ✅ Update `transferStats()` function to use activities instead of Week/Day
2. ✅ Update `determineDisputeResult()` to work with activities collection
3. ✅ Update `getOverallPercentage()` and `calculateWeeklyHealth()` to query activities
4. ✅ Remove `currentWeek`, `previousWeek`, `nextWeek` from Guest entity
5. ✅ Add new Firestore collections: `activities`, `daily-summaries`, `weekly-summaries`
6. ✅ Create new Activity entity for cloud functions

### Medium Priority

7. ✅ Update WeeklyReport constructor to work with activity stats
8. ✅ Add backward compatibility for archived Week data
9. ✅ Update any other functions that access `guest.currentWeek.days`

### Low Priority

10. Create migration function to backfill activities from archived weeks
11. Update scheduled functions if any depend on Week structure
12. Update tests to use new activity-based approach

---

## Migration Strategy

1. **Phase 1**: Deploy new entity definitions and collections
2. **Phase 2**: Deploy updated functions in parallel (feature flag)
3. **Phase 3**: Test with subset of houses
4. **Phase 4**: Migrate all houses to new system
5. **Phase 5**: Remove deprecated Week-based code
