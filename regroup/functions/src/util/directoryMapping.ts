import { daysOfWeek } from "./date";
import { RatsMeeting, MeetingType } from "../entities/Meeting";
import {
  DirectoryMeeting,
  DirectoryProvider,
} from "../entities/DirectoryMeeting";

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

/** Map recovery-api directory providers onto regroup's client-facing meeting types. */
const PROVIDER_TO_TYPE: Record<DirectoryProvider, MeetingType> = {
  AA: "AA",
  NA: "NA",
  CELEBRATE_RECOVERY: "Celebrate Recovery",
  CUSTOM: "CUSTOM",
};

/**
 * Map a shared-directory meeting into regroup's `RatsMeeting` client contract.
 *
 * Field-for-field translation only — keeps mobile/web untouched. The directory's
 * integer `day` (0–6) becomes regroup's lowercase weekday string; `provider`
 * becomes the client `type`.
 */
export function mapDirectoryToRats(meeting: DirectoryMeeting): RatsMeeting {
  const m = new RatsMeeting();
  m.name = meeting.name ?? "";
  m.time = meeting.time ?? "";
  m.street = meeting.location?.address ?? "";
  m.city = meeting.location?.city;
  m.state = meeting.location?.state;
  m.zip = meeting.location?.zip;
  m.lat = meeting.location?.lat;
  m.lng = meeting.location?.lng;
  m.day = directoryDayName(meeting.day) ?? "";
  m.type = PROVIDER_TO_TYPE[meeting.provider] ?? "AA";
  m.online = meeting.online;
  m.link = meeting.link;
  m.onlineNotes = meeting.onlineNotes ?? "";
  if (meeting.dataAsOf) m.dataAsOf = meeting.dataAsOf;
  return m;
}
