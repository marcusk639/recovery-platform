import {HomeGroup} from '../../../types';

/**
 * Format a group's location into a display string
 * @param group - The HomeGroup object
 * @returns Formatted location string or null if no location data
 */
export function formatGroupLocation(group: HomeGroup): string | null {
  if (group.city || group.state || group.zip) {
    const cityState = [group.city, group.state].filter(Boolean).join(', ');
    return group.zip ? `${cityState} ${group.zip}` : cityState;
  }
  return group.location || null;
}

/**
 * Truncate an address to show only the first part
 * @param address - Full address string
 * @param maxLength - Maximum length before truncation
 * @returns Truncated address
 */
export function truncateAddress(
  address: string,
  maxLength: number = 15,
): string {
  const addressPart = address.split(',')[0].trim();
  if (addressPart.length > maxLength) {
    return `${addressPart.substring(0, maxLength)}...`;
  }
  return addressPart;
}

/**
 * Filter groups by search query (name, description, location)
 * @param groups - Array of groups to filter
 * @param query - Search query string
 * @returns Filtered array of groups
 */
export function filterGroupsByQuery(
  groups: HomeGroup[],
  query: string,
): HomeGroup[] {
  if (!query.trim()) {
    return groups;
  }

  const lowerQuery = query.toLowerCase();
  return groups.filter(
    group =>
      group.name.toLowerCase().includes(lowerQuery) ||
      group.description?.toLowerCase().includes(lowerQuery) ||
      (group.location && group.location.toLowerCase().includes(lowerQuery)) ||
      (group.city && group.city.toLowerCase().includes(lowerQuery)) ||
      (group.state && group.state.toLowerCase().includes(lowerQuery)),
  );
}
