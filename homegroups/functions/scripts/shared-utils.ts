import * as crypto from "crypto";
import { Meeting } from "./shared-types";

/**
 * Generates a unique hash ID for a meeting based on key properties using SHA-1.
 * This function is shared across all scripts to ensure consistency.
 * @param meeting The meeting object to generate a hash for.
 * @returns A 24-character hexadecimal string hash.
 */
export function generateMeetingHash(meeting: Meeting): string {
  // Create a consistent string representation including all unique identifiers
  const meetingString = [
    meeting.name?.trim() || "",
    meeting.day || "", // CRITICAL: Include the day
    meeting.time || "",
    meeting.link || "",
    meeting.formattedAddress?.trim() || "", // Use full address string for location part
  ].join("|");

  // Generate SHA-1 hash
  const hash = crypto.createHash("sha1").update(meetingString).digest("hex");

  // Return a significant portion (e.g., first 24 chars) for practical uniqueness
  return hash.substring(0, 24);
}

/**
 * Parses the street address from a formatted address string.
 * Handles various formats and edge cases.
 * @param formattedAddress The full formatted address string
 * @returns The parsed street address or undefined if parsing fails
 */
export function parseStreetAddress(
  formattedAddress?: string
): string | undefined {
  if (!formattedAddress) return undefined;

  try {
    // Remove country if present (e.g., ", USA")
    const addressWithoutCountry = formattedAddress.replace(
      /,?\s*[A-Z]{2,3}$/,
      ""
    );

    // Split by commas and trim whitespace
    const parts = addressWithoutCountry.split(",").map((part) => part.trim());

    // The street address is typically the first part
    // But we need to handle cases where it might be empty or malformed
    if (parts.length > 0) {
      const streetPart = parts[0];

      // Validate that this looks like a street address
      // Should contain at least one number and some text
      if (/^\d+\s+[A-Za-z\s]+$/.test(streetPart)) {
        return streetPart;
      }

      // If the first part doesn't look like a street address,
      // try to find a part that does
      for (const part of parts) {
        if (/^\d+\s+[A-Za-z\s]+$/.test(part)) {
          return part;
        }
      }
    }

    // If we couldn't find a valid street address, return the first part
    // This handles cases where the address might be in a different format
    return parts[0] || undefined;
  } catch (error) {
    console.warn(
      `Error parsing street address from "${formattedAddress}":`,
      error
    );
    return undefined;
  }
}

/**
 * Normalize a string for comparison
 */
export function normalizeString(str?: string): string {
  return (str || "").toLowerCase().trim();
}

/**
 * Round a coordinate to specified precision
 */
export function roundCoordinate(num: number, precision: number): number {
  const factor = Math.pow(10, precision);
  return Math.round(num * factor) / factor;
}

/**
 * Clean meeting name by removing "-" and everything after it
 * @param name The meeting name to clean
 * @returns The cleaned meeting name
 */
export function cleanMeetingName(name: string): string {
  if (!name) return "";

  // Find the first occurrence of " - " and remove it and everything after
  const dashIndex = name.indexOf(" - ");
  if (dashIndex !== -1) {
    return name.substring(0, dashIndex).trim();
  }

  return name.trim();
}

/**
 * Sleep function for delays
 */
export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
