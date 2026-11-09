import { daysOfWeek } from "./date";
import {
  DirectoryMeeting,
  DirectoryProvider,
} from "../entities/DirectoryMeeting";
import { SerializedMeeting } from "../callable/findMeetings";

/**
 * A directory day as a lowercase name. recovery-api stores names, but rows
 * written before 2026-11-09 may still hold an integer 0–6 (0 = Sunday) until
 * migrated. Duplicated in the other product's directoryMapping.ts, because
 * products share no code.
 * @param {string | number | undefined} day a stored or requested day
 * @return {string | undefined} the day's name, or undefined if it isn't a day
 */
export function directoryDayName(day?: string | number): string | undefined {
  if (typeof day === "number") return daysOfWeek[day];
  if (typeof day !== "string") return undefined;
  const lower = day.trim().toLowerCase();
  if (daysOfWeek.includes(lower)) return lower;
  if (/^[0-6]$/.test(lower)) return daysOfWeek[Number(lower)];
  return undefined;
}

/** Map recovery-api directory providers onto homegroups' client-facing meeting types. */
const PROVIDER_TO_TYPE: Record<DirectoryProvider, string> = {
  AA: "AA",
  NA: "NA",
  CELEBRATE_RECOVERY: "Celebrate Recovery",
  CUSTOM: "Custom",
};

/**
 * Map a shared-directory meeting into homegroups' `SerializedMeeting` client
 * contract.
 *
 * Field-for-field translation only — keeps mobile/web untouched. The directory's
 * `day`, stored as a name or a legacy integer, becomes homegroups' lowercase
 * weekday string; `provider` becomes the client `type`. The directory exposes no timestamps, so `createdAt`
 * / `updatedAt` are emitted as empty strings (deterministic for tests; the
 * client treats these as informational only for directory-sourced rows).
 */
export function mapDirectoryToSerialized(
  meeting: DirectoryMeeting,
): SerializedMeeting {
  return {
    id: meeting.id,
    name: meeting.name ?? "",
    time: meeting.time ?? "",
    format: meeting.format ?? "",
    type: PROVIDER_TO_TYPE[meeting.provider] ?? "",
    verified: false,
    addedBy: "",
    createdAt: "",
    updatedAt: "",
    address: meeting.location?.address,
    street: meeting.location?.address,
    city: meeting.location?.city,
    state: meeting.location?.state,
    zip: meeting.location?.zip,
    lat: meeting.location?.lat,
    lng: meeting.location?.lng,
    geohash: meeting.location?.geohash,
    day: directoryDayName(meeting.day),
    online: meeting.online,
    link: meeting.link,
    onlineNotes: meeting.onlineNotes,
    ...(meeting.timezone ? { timezone: meeting.timezone } : {}),
    ...(meeting.dataAsOf ? { dataAsOf: meeting.dataAsOf } : {}),
    ...(meeting.externalId ? { apiId: meeting.externalId } : {}),
  };
}
