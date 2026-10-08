import * as admin from "firebase-admin";
import {
  MEETING_ATTENDANCE_SUBCOLLECTION,
  attendanceDocPath,
  buildAttendanceRecord,
} from "../utils/meetingAttendance";

describe("meetingAttendance helpers", () => {
  it("builds a deterministic doc path keyed by instanceId", () => {
    expect(attendanceDocPath("user-1", "inst-9")).toBe(
      "users/user-1/meetingAttendance/inst-9",
    );
    expect(MEETING_ATTENDANCE_SUBCOLLECTION).toBe("meetingAttendance");
  });

  it("stamps attendedAt with a server timestamp sentinel, never a client clock", () => {
    const record = buildAttendanceRecord({
      instanceId: "inst-9",
      meetingId: "meet-3",
      groupId: "group-7",
      scheduledAt: null,
    });
    expect(record.attendedAt).toEqual(
      admin.firestore.FieldValue.serverTimestamp(),
    );
    expect(record.attendedAt instanceof Date).toBe(false);
  });

  it("carries groupId and instanceId so the index is queryable without a join", () => {
    const record = buildAttendanceRecord({
      instanceId: "inst-9",
      meetingId: "meet-3",
      groupId: "group-7",
      scheduledAt: null,
    });
    expect(record).toMatchObject({
      instanceId: "inst-9",
      meetingId: "meet-3",
      groupId: "group-7",
    });
  });
});
