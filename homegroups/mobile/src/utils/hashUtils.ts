import {Meeting} from '../types';
import HashUtil from 'js-sha1'; // Import the SHA-1 library

/**
 * Generates a unique hash ID for a meeting based on key properties using SHA-1.
 * Ensures consistency with the ID generation logic used in the population script.
 * @param meeting The meeting object to generate a hash for.
 * @returns A 24-character hexadecimal string hash.
 */
export function generateMeetingHash(meeting: Meeting): string {
  // Create a consistent string representation including all unique identifiers
  // Matches the input fields used in the functions/scripts/populateMeetings.ts version
  const meetingString = [
    meeting.name?.trim() || '',
    meeting.day || '', // Included day
    meeting.time || '',
    // Using individual address components for potentially more stability than a formatted string
    meeting.street?.trim() || '',
    meeting.city?.trim() || '',
    meeting.state?.trim() || '',
    meeting.zip?.trim() || '',
    // Include link only if it's an online meeting to differentiate
    meeting.online ? meeting.link?.trim() || '' : '',
    // Optionally add location name if consistently available and important for uniqueness
    // meeting.location?.trim() || "",
  ].join('|');

  // Generate SHA-1 hash using js-sha1
  const hash = HashUtil.sha1(meetingString);

  // Return the first 24 characters, matching the script's output length
  return hash.substring(0, 24);
}
