import {
  differenceInYears,
  differenceInMonths,
  differenceInDays,
  addYears,
  addMonths,
  parseISO,
} from "date-fns";
import { Guest, Stat, stats } from "../entities/Guest";
import { WeekStats } from "../entities/WeekSummary";
import {
  Activity,
  ActivityType,
  WorkActivityData,
} from "../entities/ActivityModel";
import {
  getDayOfWeek,
  dayIsAfter,
  dayIsBefore,
  getTodaysDate,
  militaryTimeToFormatted,
  getStartOfWeek,
  getEndOfWeek,
} from "../util/display";
import { Guests } from "../types/index";
import { House } from "../entities/House";
import { User } from "../entities/User";
import RatsListItem from "../components/rats-list-item";
import { toAddress, getAddressDisplay } from "./address";
import { View } from "react-native";
import React from "react";
import Job from "../entities/Job";
import { cloneDeep, each, isEqual, size } from "lodash";
import { color, fontFamily } from "../styles/theme";
import HealthConstants, { Health } from "../constants/health";
import { ActivityFilterFormValues } from "../screens/Activity/ActivityFilterForm";
import { Dispute } from "../entities/Dispute";

export const HEALTH_COLOR_MAP = {
  [HealthConstants.HAPPY]: color.green,
  [HealthConstants.SUPER_HAPPY]: color.baby_blue,
  [HealthConstants.NEUTRAL]: color.darkYellow,
  [HealthConstants.SAD]: color.red,
};

export const HEALTH_ICON_MAP: Record<Health, string> = {
  [HealthConstants.HAPPY]: "laugh",
  [HealthConstants.SUPER_HAPPY]: "laugh-beam",
  [HealthConstants.NEUTRAL]: "meh",
  [HealthConstants.SAD]: "frown-open",
} as Record<Health, string>;

export const HEALTH_STATUS_MAP = {
  [HealthConstants.HAPPY]: "GREAT",
  [HealthConstants.SUPER_HAPPY]: "EXCELLENT",
  [HealthConstants.NEUTRAL]: "NEEDS WORK",
  [HealthConstants.SAD]: "NOT GOOD",
};

export const getTimeSober = (sobrietyDate: string) => {
  const sobriety = parseISO(sobrietyDate);
  const today = new Date();
  if (sobriety > today) {
    return { yearsSober: 0, monthsSober: 0, daysSober: 0 };
  }
  const yearsSober = Math.abs(differenceInYears(today, sobriety));
  const afterYears = addYears(sobriety, yearsSober);
  const monthsSober = Math.abs(differenceInMonths(today, afterYears));
  const afterMonths = addMonths(afterYears, monthsSober);
  const daysSober = Math.abs(differenceInDays(today, afterMonths));
  return { yearsSober, monthsSober, daysSober };
};

export const addObjectProperties = (object: { [key: string]: number }) => {
  let total = 0;
  each(object, (property) => {
    total += property;
  });
  return total;
};

export const getMoneySaved = (daysSober: number, dailyHabit: number) =>
  daysSober * dailyHabit;

export const getHealth = (grade: number, date: string) => {
  //@ts-ignore
  const dayOfWeek = getDayOfWeek(date) + 1;
  const happyMinimum = 0.75 * (dayOfWeek / 7);
  const neutralMinimum = 0.5 * (dayOfWeek / 7);
  if (grade >= happyMinimum) {
    return HealthConstants.HAPPY;
  }
  if (grade >= neutralMinimum) {
    return HealthConstants.NEUTRAL;
  }
  return HealthConstants.SAD;
};

export const getHealthByPercentage = (percentage: number): Health => {
  let health: Health = HealthConstants.HAPPY;
  if (percentage >= 90) {
    health = HealthConstants.SUPER_HAPPY;
  } else if (percentage < 90 && percentage >= 75) {
    health = HealthConstants.HAPPY;
  } else if (percentage < 75 && percentage >= 50) {
    health = HealthConstants.NEUTRAL;
  } else {
    health = HealthConstants.SAD;
  }
  return health;
};

export const getPercentage = (done: number | boolean, required: number) => {
  const amountDone = typeof done === "number" ? done : done ? 1 : 0;
  return required > 0 ? Math.ceil((amountDone / required) * 100) : 0;
};

/**
 * Calculates weekly stats from activities for a given guest and week
 */
export const calculateWeeklyStatsFromActivities = (
  activities: Activity[],
  guestId: string,
  weekStartDate: string,
  weekEndDate: string
) => {
  const weekActivities = activities.filter((activity) => {
    const ts = activity.timestamp;
    if (!ts) return false;
    const activityDate =
      typeof ts === "string"
        ? ts.split("T")[0]
        : (ts as Date).toISOString().split("T")[0];
    return (
      activity.guestId === guestId &&
      activityDate >= weekStartDate &&
      activityDate <= weekEndDate
    );
  });

  const stats = {
    meeting: 0,
    medication: 0,
    metPrimarySupporter: false,
    hoursWorked: 0,
    choreCompleted: 0,
  };

  weekActivities.forEach((activity) => {
    switch (activity.type) {
      case ActivityType.MEETING:
        stats.meeting += 1;
        break;
      case ActivityType.MEDICATION:
        stats.medication += 1;
        break;
      case ActivityType.PRIMARY_SUPPORTER:
        stats.metPrimarySupporter = true;
        break;
      case ActivityType.WORK:
        stats.hoursWorked += (activity.data as WorkActivityData).hoursWorked;
        break;
      case ActivityType.CHORE:
        stats.choreCompleted += 1;
        break;
    }
  });

  return stats;
};

/**
 * Gets the current week start and end dates
 */
export const getCurrentWeekDates = () => {
  const startDate = getStartOfWeek();
  const endDate = getEndOfWeek();
  return { startDate, endDate };
};

/**
 * Calculates disputes for a specific stat from activities
 */
export const calculateDisputesForStat = (
  activities: Activity[],
  guestId: string,
  stat: Stat,
  weekStartDate?: string,
  weekEndDate?: string
) => {
  let filteredActivities = activities.filter(
    (activity) =>
      activity.guestId === guestId && (activity.underDispute ?? 0) > 0
  );

  if (weekStartDate && weekEndDate) {
    filteredActivities = filteredActivities.filter((activity) => {
      const ts = activity.timestamp;
      if (!ts) return false;
      const activityDate =
        typeof ts === "string"
          ? ts.split("T")[0]
          : (ts as Date).toISOString().split("T")[0];
      return activityDate >= weekStartDate && activityDate <= weekEndDate;
    });
  }

  // Map stat types to activity types (supporting both legacy and modern types)
  const statToActivityType: Record<Stat, string[]> = {
    meeting: ["meeting_attended", "meeting"],
    medication: ["medication_taken", "medication"],
    metPrimarySupporter: ["supporter_met", "primary_supporter"],
    hoursWorked: ["hours_worked", "work"],
    choreCompleted: ["chore_completed", "chore"],
  };

  const relevantActivityTypes = statToActivityType[stat];
  return filteredActivities.filter((activity) =>
    relevantActivityTypes.includes(activity.type as string)
  ).length;
};

/**
 * Gets phase rules for a specific stat
 */
export const getPhaseRuleForStat = (
  house: House,
  guest: Guest,
  stat: Stat
): number => {
  const phase = house.phases[guest.phase];
  if (!phase || !phase.rules) {
    return 0;
  }

  const rules = phase.rules;
  switch (stat) {
    case ActivityType.MEETING:
      return rules.meetings || 0;
    case ActivityType.MEDICATION:
      return rules.medications ? 1 : 0;
    case "metPrimarySupporter":
      return 1; // Boolean - just need to meet once
    case "hoursWorked":
      return rules.work || 0;
    case "choreCompleted":
      return rules.chore ? 1 : 0; // Boolean - just need to complete chore
    default:
      return 0;
  }
};

export const getPhaseRule = (house: House, guest: Guest, stat: Stat) => {
  return getPhaseRuleForStat(house, guest, stat);
};

const STAT_TO_WEEK_KEY: Record<Stat, keyof WeekStats> = {
  meeting: "meetingsAttended",
  medication: "medicationTaken",
  metPrimarySupporter: "primarySupporterMet",
  hoursWorked: "hoursWorked",
  choreCompleted: "choresCompleted",
};

/**
 * Calculates overall health percentage from pre-aggregated WeekSummary data.
 * Pass weekStats (from useWeekSummary) for a real value; omitting returns 0.
 */
export const getOverallPercentage = (
  guest: Guest,
  house: House,
  date: string,
  stat?: Stat,
  weekStats?: WeekStats
): number => {
  if (!weekStats) {
    return 0;
  }

  const computeStatPercentage = (s: Stat): number => {
    const required = getPhaseRuleForStat(house, guest, s);
    if (required === 0) return 100;
    const actual = weekStats[STAT_TO_WEEK_KEY[s]] ?? 0;
    return Math.min(100, Math.round((actual / required) * 100));
  };

  if (stat) {
    return computeStatPercentage(stat);
  }

  const activeStats = stats.filter(
    (s) => getPhaseRuleForStat(house, guest, s) > 0
  );
  if (activeStats.length === 0) return 100;
  const total = activeStats.reduce(
    (sum, s) => sum + computeStatPercentage(s),
    0
  );
  return Math.round(total / activeStats.length);
};

/**
 * Calculates a comprehensive health percentage for a guest based on their activities
 * and requirements.
 *
 * @param guest The guest object
 * @param house The house object containing phase rules
 * @param date The date to calculate health up to
 * @param stat Optional specific stat to focus on
 * @returns A percentage (0-100) representing the guest's health
 */
export const calculateHealthPercentage = (
  guest: Guest,
  house: House,
  date: string,
  stat?: Stat
): number => {
  return getOverallPercentage(guest, house, date, stat);
};

/**
 * Calculates the grade of a guest for the week based on the given date
 */
export const calculateHealth = (
  guest: Guest,
  house: House,
  date: string,
  stat?: Stat
) => {
  const percentage = calculateHealthPercentage(guest, house, date, stat);
  return getHealthByPercentage(percentage);
};

export const getGuestsArray = (_guests: Guests): Guest[] =>
  Object.keys(_guests).map((key) => _guests[key]);

/**
 * Sorts the given guests array by sobriety date, and returns the newly sorted array
 * @param {*} _guests
 */
export const sortGuests = (_guests: Guests): Guest[] => {
  const guestsArray = getGuestsArray(_guests);
  guestsArray.sort(
    (left, right) =>
      new Date(left.sobrietyDate).getTime() -
      new Date(right.sobrietyDate).getTime()
  );
  return guestsArray;
};

export const getGuestByUserId = (guests: Guests, userId: string) => {
  const guestsArray = getGuestsArray(guests);
  return guestsArray.find((guest) => guest.userId === userId);
};

export const dateIsInWeek = (
  date: string,
  weekBeginDate: string,
  weekEndDate: string
) => {
  return !dayIsAfter(date, weekEndDate) && !dayIsBefore(date, weekBeginDate);
};

export const mapUserToGuest = (user: Partial<User>, guest: Guest) => {
  guest.firstName = user.firstName!;
  guest.lastName = user.lastName!;
  guest.userId = user.uid!;
  guest.houseId = user.houseId!;
  guest.phoneNumber = user.phoneNumber!;
  guest.email = user.email!;
  return guest;
};

export const mapGuestToUser = (user: Partial<User>, guest: Guest) => {
  user.firstName = guest.firstName;
  user.lastName = guest.lastName;
  user.houseId = guest.houseId;
  user.guestId = guest.id;
  return user;
};

export const renderGuestJobs = (
  guest: Guest,
  onJobPress: (job: Job) => void,
  selectedJob: Job
) => {
  if (guest && guest.jobs && guest.jobs.length) {
    return guest.jobs.map((j) => {
      const isSelectedJob = isEqual(selectedJob, j);
      return (
        <RatsListItem
          style={{ backgroundColor: color.white, paddingHorizontal: 0 }}
          onPress={() => onJobPress(j)}
          key={j.employer}
          mainText={j.employer}
          mainTextStyle={{
            color: isSelectedJob ? "#33b3a6" : color.black,
            fontFamily: isSelectedJob ? fontFamily.bold : fontFamily.roboto,
          }}
          subTextStyle={{
            color: isSelectedJob ? "#33b3a6" : color.grey,
            fontFamily: isSelectedJob ? fontFamily.bold : fontFamily.roboto,
          }}
          subText={getAddressDisplay(j.street, j.city, j.state, j.zip)}
        />
      );
    });
  }
  return <View>{/* <RatsText text="None" /> */}</View>;
};

// renderWorkHoursInput removed 2026-07-06: it rendered a bare Formik <Field>
// with no <Formik> provider in its only call site (GuestWorkSummary's
// showAddHoursModal, which renders form-modal content outside any Formik
// context) — Formik's useField() throws in that situation, crashing the
// whole app. Replaced there with a standalone local-state form component.

export const filterActivities = (
  activities: Activity[],
  filters: ActivityFilterFormValues,
  guest?: Guest,
  searchTerm?: string,
  type?: ActivityType | "all",
  disputesOnly?: boolean
) => {
  return activities.filter((activity) => {
    let valid = true;

    // Filter by dispute status
    // disputesOnly === true: Only show activities that are under dispute (Disputes screen)
    // disputesOnly === false or undefined: Show all activities (Activity screen shows all, including disputed)
    if (disputesOnly === true) {
      // Only show disputed activities
      if (!activity.underDispute || activity.underDispute <= 0) {
        return false;
      }
    }

    if (filters.guest && filters.guest.id) {
      valid = valid && activity.guestId === filters.guest.id;
    }

    if (filters.type && filters.type !== "all") {
      valid =
        valid &&
        activity.type.toLowerCase().includes(filters.type.toLowerCase());
    }

    if (searchTerm && searchTerm.length) {
      const d = activity.data as any;
      valid =
        valid &&
        Boolean(
          d?.meetingName?.includes(searchTerm) ||
            d?.jobName?.includes(searchTerm) ||
            d?.supporterName?.includes(searchTerm) ||
            d?.choreName?.includes(searchTerm) ||
            d?.medicationName?.includes(searchTerm)
        );
    }

    return valid && (type ? type === "all" || activity.type === type : true);
  });
};

export const findGuestByName = (
  guests: Guests,
  firstName: string,
  lastName: string
): Guest | undefined => {
  return Object.values(guests).find(
    (guest) => guest.firstName === firstName && guest.lastName === lastName
  );
};

export const amountOfDisputeProps = (house: House) => {
  let disputeCount = 0;
  each(house.disputes, (dispute) => {
    // Since the new Dispute interface doesn't have challenges or messages arrays,
    // we'll count the dispute itself
    disputeCount += 1;
  });
  disputeCount += size(house.disputes);
  return disputeCount;
};

export function updateGuestStat(
  guest: Guest,
  week: string,
  stat: string,
  value: any,
  dispute: Dispute
): Guest {
  // This function updates guest stats after dispute resolution
  // For now, return a cloned guest - actual dispute logic is handled elsewhere
  const updatedGuest = cloneDeep(guest);
  return updatedGuest;
}

export function reverseGuestStat(guest: Guest, week: string, dispute: Dispute) {
  // This function reverses guest stats when a dispute is initiated
  // For now, return a cloned guest - actual dispute logic is handled elsewhere
  const updatedGuest = cloneDeep(guest);
  return updatedGuest;
}

export function getGuestCurfew(guest: Guest, house: House) {
  const curfewRule = house.phases[guest.phase].rules.curfew;
  if (curfewRule) {
    const dayOfWeek = getDayOfWeek(getTodaysDate(), true);
    const curfew = curfewRule.times[dayOfWeek as keyof typeof curfewRule.times];
    return militaryTimeToFormatted(curfew);
  }
}
