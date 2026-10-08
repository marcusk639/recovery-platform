import { backfillMeetingAttendance } from "../scripts/backfillMeetingAttendance";

/**
 * Minimal Firestore stand-in. The backfill takes `db` as a parameter precisely so it
 * can be driven without the emulator; this fake records every write so the test can
 * assert that instance documents are never touched.
 */
function makeFakeDb(instances: Record<string, Record<string, unknown>>) {
  const written: Record<string, Record<string, unknown>> = {};
  const instanceUpdates: unknown[] = [];
  const ordered = Object.keys(instances).sort();

  return {
    written,
    instanceUpdates,
    collection(_name: string) {
      const q: Record<string, unknown> = {};
      let limit: number | undefined;
      let after: { id: string } | undefined;
      Object.assign(q, {
        orderBy: () => q,
        limit: (n: number) => {
          limit = n;
          return q;
        },
        startAfter: (cursor: { id: string }) => {
          after = cursor;
          return q;
        },
        get: async () => {
          let ids = ordered;
          if (after) ids = ids.slice(ids.indexOf(after.id) + 1);
          const page = ids.slice(0, limit ?? ids.length);
          const docs = page.map((id) => ({
            id,
            data: () => instances[id],
            update: (patch: unknown) => instanceUpdates.push(patch),
          }));
          return { empty: docs.length === 0, docs, size: docs.length };
        },
      });
      return q;
    },
    doc(path: string) {
      return {
        get: async () => ({ exists: path in written }),
        set: async (data: Record<string, unknown>) => {
          written[path] = data;
        },
      };
    },
  };
}

describe("backfillMeetingAttendance", () => {
  it("creates one attendance doc per attendee and is safe to re-run", async () => {
    const db = makeFakeDb({
      "inst-1": { groupId: "g1", meetingId: "m1", attendees: ["u1", "u2"] },
    });

    const first = await backfillMeetingAttendance(db as never);
    expect(first.recordsWritten).toBe(2);
    expect(Object.keys(db.written).sort()).toEqual([
      "users/u1/meetingAttendance/inst-1",
      "users/u2/meetingAttendance/inst-1",
    ]);

    const second = await backfillMeetingAttendance(db as never);
    expect(second.recordsWritten).toBe(0);
    expect(second.recordsSkipped).toBe(2);
  });

  it("never writes to the meeting instance, so attendeeCount is left alone", async () => {
    const db = makeFakeDb({
      "inst-1": { groupId: "g1", attendees: ["u1"], attendeeCount: 1 },
    });

    await backfillMeetingAttendance(db as never);
    await backfillMeetingAttendance(db as never);

    expect(db.instanceUpdates).toEqual([]);
  });

  it("tolerates an instance with no attendees field", async () => {
    const db = makeFakeDb({ "inst-2": { groupId: "g1" } });

    const res = await backfillMeetingAttendance(db as never);

    expect(res.recordsWritten).toBe(0);
    expect(res.instancesScanned).toBe(1);
  });

  it("pages through more instances than the page size", async () => {
    const instances: Record<string, Record<string, unknown>> = {};
    for (let i = 0; i < 7; i++) {
      instances[`inst-${i}`] = { groupId: "g1", attendees: [`u${i}`] };
    }
    const db = makeFakeDb(instances);

    const res = await backfillMeetingAttendance(db as never, { pageSize: 2 });

    expect(res.instancesScanned).toBe(7);
    expect(res.recordsWritten).toBe(7);
  });
});
