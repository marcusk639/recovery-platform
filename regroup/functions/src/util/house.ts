import { House } from "../entities/House";
import _ from "lodash";
import { Guests, Guest } from "../entities/Guest";
import { getYesterdaysDate, dateIsAfter } from "./date";
import { Day } from "../entities/Day";
import { weekSummariesCollection } from "../api/firestore";

interface WeekStats {
  choresCompleted: number;
  meetingsAttended: number;
  hoursWorked: number;
  primarySupporterMet: number;
}

// Minimal shape of a Google Places API address component.
interface PlaceAddressComponent {
  types: string[];
  long_name: string;
  short_name: string;
}

// Minimal shape of a Google Places API place result.
interface Place {
  types?: string[];
  addressComponents: PlaceAddressComponent[];
}

export const findStreetComponent = (
  addressComponents: PlaceAddressComponent[]
) => {
  return addressComponents.find((component) =>
    component.types.includes("route")
  );
};

export const houseAtPlace = (
  place: Place,
  houses: { [key: string]: House }
) => {
  return _.find(houses, (house) => {
    const streetAddressComponent = findStreetComponent(place.addressComponents);
    // These attributes may change if we change third-party modules for interacting with Google Places.
    if (
      streetAddressComponent &&
      (house.street.includes(streetAddressComponent.long_name) ||
        house.street.includes(streetAddressComponent.short_name))
    ) {
      return true;
    }
    return false;
  });
};

export const placeIsNotLocale = (place: Place) => {
  if (place && place.types && place.types.length) {
    return !place.types.includes("locality");
  }
  return false;
};

export const addObjectProperties = (object: { [key: string]: number }) => {
  let total = 0;
  _.each(object, (property) => {
    total += property;
  });
  return total;
};

export const addHoursWorked = (day: Day) => {
  return addObjectProperties(day.hoursWorked);
};

const EMPTY_WEEK_STATS: WeekStats = {
  choresCompleted: 0,
  meetingsAttended: 0,
  hoursWorked: 0,
  primarySupporterMet: 0,
};

/**
 * Fetches the guest's current week-summary stats (the live, actively
 * maintained aggregate — see mobile's services/activity.ts
 * incrementWeekSummaryForActivity). Falls back to all-zero stats when the
 * guest has no currentWeekId or no summary doc exists yet, rather than
 * throwing — a guest with no activity logged this week legitimately has
 * nothing to report.
 *
 * Hardened 2026-07-05: this previously read the legacy embedded
 * `guest.currentWeek.days` field, which no longer exists on the current
 * Guest model (migrated to currentWeekId/currentWeekStartDate) —
 * Object.getOwnPropertyNames(undefined) threw for every migrated guest,
 * silently killing house health updates every week (caught by an inner
 * try/catch in transferStats that only logs a warning).
 */
const getWeekStats = async (guest: Guest): Promise<WeekStats> => {
  if (!guest.currentWeekId) {
    return EMPTY_WEEK_STATS;
  }
  const doc = await weekSummariesCollection.doc(guest.currentWeekId).get();
  if (!doc.exists) {
    return EMPTY_WEEK_STATS;
  }
  const stats = (doc.data() as { stats?: Partial<WeekStats> })?.stats;
  return { ...EMPTY_WEEK_STATS, ...stats };
};

export const getOverallPercentage = async (
  guest: Guest,
  house: House,
  date: string
) => {
  const phaseRules = house.phases[guest.phase].rules;
  const stats = await getWeekStats(guest);
  // Each category is weighted equally at 25%.
  const meetingPercentage = stats.meetingsAttended / phaseRules.meetings;
  const supporterPercentage = stats.primarySupporterMet > 0 ? 1.0 : 0.0;
  const chorePercentage = stats.choresCompleted / 7;
  const workPercentage =
    stats.hoursWorked > phaseRules.work
      ? 1
      : stats.hoursWorked / phaseRules.work;
  const weight = 0.25;
  const overall =
    meetingPercentage * weight +
    supporterPercentage * weight +
    chorePercentage * weight +
    workPercentage * weight;
  return Math.ceil(overall * 100);
};

/** weekEndDate should be the Saturday of the week being evaluated. */
export const getHousePercentage = async (
  house: House,
  guests: Guests,
  weekEndDate: string
) => {
  let runningTotal = 0;
  let count = 0;
  for (const guest of Object.values(guests)) {
    count++;
    runningTotal += await getOverallPercentage(guest, house, weekEndDate);
  }
  return count > 0 ? Math.ceil(runningTotal / count) : 0;
};

export const fillGuests = (guestsQuery: FirebaseFirestore.QuerySnapshot) => {
  const guests: Guests = {};
  guestsQuery.docs.forEach((doc) => {
    const guest = doc.data() as Guest;
    guests[guest.id] = guest;
  });
  return guests;
};

export const calculateWeeklyHealth = async (
  guestsQuery: FirebaseFirestore.QuerySnapshot,
  house: House
) => {
  const guests = fillGuests(guestsQuery);
  const weekEndDate = getYesterdaysDate();
  const health = await getHousePercentage(house, guests, weekEndDate);
  // Support legacy houses that stored health as a plain number or string.
  if (
    !house.health ||
    typeof house.health === "number" ||
    typeof house.health === "string"
  ) {
    house.health = {};
  }
  // Keep at most 8 weekly health entries; drop the oldest when at capacity.
  if (_.size(house.health) === 8) {
    const dates = Object.keys(house.health);
    let latestDate: string = dates[0];
    dates.forEach((date, index) => {
      if (
        !latestDate ||
        index === dates.length - 1 ||
        dateIsAfter(dates[index + 1], date)
      ) {
        latestDate = dates[index + 1];
      }
    });
    delete house.health[latestDate];
  }
  house.health[weekEndDate] = health;
};
