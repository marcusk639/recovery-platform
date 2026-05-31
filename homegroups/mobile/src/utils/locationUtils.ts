import {HomeGroup, GroupMember, Meeting, MeetingType} from '../types';
// ... other imports ...

/**
 * Calculate distance between two points using Haversine formula
 * @param lat1 Latitude of point 1
 * @param lon1 Longitude of point 1
 * @param lat2 Latitude of point 2
 * @param lon2 Longitude of point 2
 * @returns Distance in miles
 */
export function calculateDistance(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number,
): number {
  const R = 3959; // Radius of the Earth in miles
  const dLat = deg2rad(lat2 - lat1);
  const dLon = deg2rad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(deg2rad(lat1)) *
      Math.cos(deg2rad(lat2)) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  const distance = R * c; // Distance in miles
  return distance;
}

function deg2rad(deg: number): number {
  return deg * (Math.PI / 180);
}

export const streetTypes = [
  'street',
  'avenue',
  'drive',
  'court',
  'place',
  'boulevard',
  'highway',
  'lane',
  'road',
  'trail',
  'way',
  'street',
  'avenue',
  'drive',
  'court',
  'place',
  'boulevard',
  'highway',
  'lane',
  'road',
  'trail',
  'way',
];
