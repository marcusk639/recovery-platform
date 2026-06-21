import { daysOfWeek } from "./date";
import { RatsMeeting, MeetingType } from "../entities/Meeting";
import {
  DirectoryMeeting,
  DirectoryProvider,
} from "../entities/DirectoryMeeting";

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
  m.day =
    typeof meeting.day === "number" ? (daysOfWeek[meeting.day] ?? "") : "";
  m.type = PROVIDER_TO_TYPE[meeting.provider] ?? "AA";
  m.online = meeting.online;
  m.link = meeting.link;
  m.onlineNotes = meeting.onlineNotes ?? "";
  return m;
}
