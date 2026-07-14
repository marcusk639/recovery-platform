// functions/src/callable/exportMeetingGuideFormat.ts
// V3.2 Task 2.3 — Export group meetings in Meeting Guide CSV / JSON format
import {
  onCall,
  CallableRequest,
  HttpsError,
} from "firebase-functions/v2/https";
import * as logger from "firebase-functions/logger";
import { db } from "../utils/firebase";
import { requireAuth } from "../utils/callableWrapper";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface ExportMeetingGuideInput {
  groupId: string;
}

interface MeetingGuideRow {
  name: string;
  day: string;
  time: string;
  end_time: string;
  types: string;
  address: string;
  city: string;
  state: string;
  zip: string;
  country: string;
  location_name: string;
  notes: string;
  conference_url: string;
  conference_url_notes: string;
}

interface ExportMeetingGuideResult {
  csv: string;
  json: string;
  instructions: string;
}

// ---------------------------------------------------------------------------
// CSV escape helper — wraps a value in quotes and escapes internal quotes
// ---------------------------------------------------------------------------
function csvEscape(value: string | undefined | null): string {
  const s = (value ?? "").toString();
  if (s.includes(",") || s.includes('"') || s.includes("\n")) {
    return '"' + s.replace(/"/g, '""') + '"';
  }
  return s;
}

// ---------------------------------------------------------------------------
// Map meeting type to Meeting Guide format codes
// O = Open, C = Closed, BB = Big Book, SP = Speaker, SS = Step Study
// ---------------------------------------------------------------------------
function mapMeetingType(
  type: string | undefined,
  format: string | undefined,
): string {
  const typeCodes: string[] = [];

  const upperType = (type ?? "").toUpperCase();
  if (upperType.includes("AA")) typeCodes.push("AA");
  if (upperType.includes("NA")) typeCodes.push("NA");
  if (upperType.includes("AL-ANON") || upperType.includes("ALANON"))
    typeCodes.push("AL-ANON");
  if (upperType.includes("CA")) typeCodes.push("CA");
  if (upperType.includes("CR") || upperType.includes("CELEBRATE"))
    typeCodes.push("CR");

  const upperFormat = (format ?? "").toUpperCase();
  if (upperFormat.includes("OPEN")) typeCodes.push("O");
  else if (upperFormat.includes("CLOSED")) typeCodes.push("C");

  if (upperFormat.includes("SPEAKER") || upperFormat.includes("SP"))
    typeCodes.push("SP");
  if (upperFormat.includes("BIG BOOK") || upperFormat.includes("BB"))
    typeCodes.push("BB");
  if (upperFormat.includes("STEP STUDY") || upperFormat.includes("SS"))
    typeCodes.push("SS");

  // Fallback: put raw type if nothing matched
  if (typeCodes.length === 0 && type) {
    typeCodes.push(type);
  }

  return typeCodes.join(",");
}

// ---------------------------------------------------------------------------
// Convert a Firestore meeting document to a MeetingGuideRow
// ---------------------------------------------------------------------------
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function toMeetingGuideRow(meetingData: Record<string, any>): MeetingGuideRow {
  const isOnline = meetingData.online ?? meetingData.isOnline ?? false;

  return {
    name: meetingData.name ?? "",
    day: meetingData.day ?? "",
    time: meetingData.time ?? "",
    end_time: meetingData.endTime ?? "",
    types: mapMeetingType(meetingData.type, meetingData.format),
    address: isOnline ? "" : (meetingData.address ?? meetingData.street ?? ""),
    city: isOnline ? "" : (meetingData.city ?? ""),
    state: isOnline ? "" : (meetingData.state ?? ""),
    zip: isOnline ? "" : (meetingData.zip ?? ""),
    country: isOnline ? "" : (meetingData.country ?? "US"),
    location_name: isOnline
      ? "Online"
      : (meetingData.locationName ?? meetingData.location ?? ""),
    notes: meetingData.notes ?? meetingData.temporaryNotice ?? "",
    conference_url: isOnline
      ? (meetingData.link ?? meetingData.onlineLink ?? "")
      : "",
    conference_url_notes: isOnline ? (meetingData.onlineNotes ?? "") : "",
  };
}

// CSV header fields in Meeting Guide format order
const CSV_HEADERS: (keyof MeetingGuideRow)[] = [
  "name",
  "day",
  "time",
  "end_time",
  "types",
  "address",
  "city",
  "state",
  "zip",
  "country",
  "location_name",
  "notes",
  "conference_url",
  "conference_url_notes",
];

// ---------------------------------------------------------------------------
// Build CSV string from rows
// ---------------------------------------------------------------------------
function buildCsv(rows: MeetingGuideRow[]): string {
  const headerLine = CSV_HEADERS.join(",");
  const dataLines = rows.map((row) =>
    CSV_HEADERS.map((field) => csvEscape(row[field])).join(","),
  );
  return [headerLine, ...dataLines].join("\n");
}

// ---------------------------------------------------------------------------
// Callable function
// ---------------------------------------------------------------------------
export const exportMeetingGuideFormat = onCall(
  async (
    request: CallableRequest<ExportMeetingGuideInput>,
  ): Promise<ExportMeetingGuideResult> => {
    // Auth check
    const userId = requireAuth(request);

    const { groupId } = request.data ?? {};

    if (!groupId || typeof groupId !== "string") {
      throw new HttpsError(
        "invalid-argument",
        "groupId is required and must be a string.",
      );
    }

    // Membership check — only members of the group can export
    const memberDocId = `${groupId}_${userId}`;
    const memberDoc = await db.collection("members").doc(memberDocId).get();

    if (!memberDoc.exists) {
      throw new HttpsError(
        "permission-denied",
        "You must be a member of this group to export its meeting guide.",
      );
    }

    // Fetch all meetings for this group
    const meetingsSnap = await db
      .collection("meetings")
      .where("groupId", "==", groupId)
      .get();

    const rows: MeetingGuideRow[] = meetingsSnap.docs.map((doc) =>
      toMeetingGuideRow(doc.data()),
    );

    const csv = buildCsv(rows);
    const json = JSON.stringify(rows, null, 2);
    const instructions =
      "Forward this CSV to your intergroup webmaster or district GSR to update the meeting guide. " +
      "For online submission portals, use the JSON format. " +
      "Column descriptions: types uses AA/NA/O (Open)/C (Closed)/SP (Speaker)/BB (Big Book)/SS (Step Study). " +
      "Questions? Contact your local intergroup or district.";

    logger.info(
      `exportMeetingGuideFormat: exported ${rows.length} meetings for group ${groupId} by user ${userId}`,
    );

    return { csv, json, instructions };
  },
);
