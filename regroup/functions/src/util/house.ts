import { House } from '../entities/House';
import _ from 'lodash';
import { Guests, Guest } from '../entities/Guest';
import { dayIsAfter, getYesterdaysDate, dateIsAfter } from './date';
import { Day } from '../entities/Day';

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

export const findStreetComponent = (addressComponents: PlaceAddressComponent[]) => {
  return addressComponents.find(component => component.types.includes('route'));
};

export const houseAtPlace = (place: Place, houses: { [key: string]: House }) => {
  return _.find(houses, house => {
    const streetAddressComponent = findStreetComponent(place.addressComponents);
    // These attributes may change if we change third-party modules for interacting with Google Places.
    if (
      streetAddressComponent && (
        house.street.includes(streetAddressComponent.long_name) ||
        house.street.includes(streetAddressComponent.short_name)
      )
    ) {
      return true;
    }
    return false;
  });
};

export const placeIsNotLocale = (place: Place) => {
  if (place && place.types && place.types.length) {
    return !place.types.includes('locality');
  }
  return false;
};

export const addObjectProperties = (object: { [key: string]: number }) => {
  let total = 0;
  _.each(object, property => {
    total += property;
  });
  return total;
};

export const addHoursWorked = (day: Day) => {
  return addObjectProperties(day.hoursWorked);
};

export const getOverallPercentage = (guest: Guest, house: House, date: string) => {
  const phaseRules = house.phases[guest.phase].rules;
  // currentWeek is a legacy embedded field; the normalized model uses currentWeekId instead.
  const days = (guest as any).currentWeek?.days;
  let meetings = 0,
    supporter = false,
    chore = 0,
    work = 0;
  // For each day up to (and including) the given date, accumulate the guest's stats.
  Object.getOwnPropertyNames(days).forEach(key => {
    const day = days[key];
    if (!dayIsAfter(key, date)) {
      meetings += day.meeting ? day.meeting.length : 0;
      supporter = supporter ? true : day.metPrimarySupporter;
      chore += day.choreCompleted ? 1 : 0;
      work += addHoursWorked(day);
    }
  });
  // Each category is weighted equally at 25%.
  const meetingPercentage = meetings / phaseRules.meetings;
  const supporterPercentage = supporter ? 1.0 : 0.0;
  const chorePercentage = chore / 7;
  const workPercentage = work > phaseRules.work ? 1 : work / phaseRules.work;
  const weight = 0.25;
  const overall = meetingPercentage * weight + supporterPercentage * weight + chorePercentage * weight + workPercentage * weight;
  return Math.ceil(overall * 100);
};

/** weekEndDate should be the Saturday of the week being evaluated. */
export const getHousePercentage = (house: House, guests: Guests, weekEndDate: string) => {
  let runningTotal = 0;
  let count = 0;
  _.each(guests, guest => {
    count++;
    runningTotal += getOverallPercentage(guest, house, weekEndDate);
  });
  return count > 0 ? Math.ceil(runningTotal / count) : 0;
};

export const fillGuests = (guestsQuery: FirebaseFirestore.QuerySnapshot) => {
  const guests: Guests = {};
  guestsQuery.docs.forEach(doc => {
    const guest = doc.data() as Guest;
    guests[guest.id] = guest;
  });
  return guests;
};

export const calculateWeeklyHealth = (guestsQuery: FirebaseFirestore.QuerySnapshot, house: House) => {
  const guests = fillGuests(guestsQuery);
  const weekEndDate = getYesterdaysDate();
  const health = getHousePercentage(house, guests, weekEndDate);
  // Support legacy houses that stored health as a plain number or string.
  if (!house.health || typeof house.health === 'number' || typeof house.health === 'string') {
    house.health = {};
  }
  // Keep at most 8 weekly health entries; drop the oldest when at capacity.
  if (_.size(house.health) === 8) {
    const dates = Object.keys(house.health);
    let latestDate: string = dates[0];
    dates.forEach((date, index) => {
      if (!latestDate || index === dates.length - 1 || dateIsAfter(dates[index + 1], date)) {
        latestDate = dates[index + 1];
      }
    });
    delete house.health[latestDate];
  }
  house.health[weekEndDate] = health;
};
