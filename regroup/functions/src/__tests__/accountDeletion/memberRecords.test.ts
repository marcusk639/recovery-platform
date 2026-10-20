const mockTxGet = jest.fn();
const mockTxSet = jest.fn();
const mockTxDelete = jest.fn();
const mockTxUpdate = jest.fn();
const mockAdminGet = jest.fn();
const mockAdminDelete = jest.fn();
const mockHouseUpdate = jest.fn();
const mockHouseGet = jest.fn();

jest.mock("firebase-admin", () => {
  const firestore = () => ({});
  firestore.FieldValue = {
    arrayRemove: (...v: unknown[]) => ({ sentinel: "arrayRemove", v }),
  };
  return { firestore };
});

jest.mock("firebase-functions/v2", () => ({
  logger: { info: jest.fn(), error: jest.fn(), warn: jest.fn() },
}));

const ref = (path: string) => ({ path });

jest.mock("../../api/firestore", () => ({
  guestCollection: { doc: (id: string) => ref(`guests/${id}`) },
  houseCollection: {
    doc: (id: string) => ({
      path: `houses/${id}`,
      get: () => mockHouseGet(id),
      update: (d: unknown) => mockHouseUpdate(id, d),
    }),
  },
  adminCollection: {
    doc: (id: string) => ({
      path: `admins/${id}`,
      get: () => mockAdminGet(id),
      delete: () => mockAdminDelete(id),
    }),
  },
  ratsFirestore: {
    collection: (name: string) => ({ doc: (id: string) => ref(`${name}/${id}`) }),
    runTransaction: async (fn: (tx: unknown) => Promise<void>) =>
      fn({ get: mockTxGet, set: mockTxSet, delete: mockTxDelete, update: mockTxUpdate }),
  },
}));

import {
  GUEST_PII_FIELDS,
  dischargeResident,
  removeStaffAdmin,
  scrubGuestForArchive,
} from "../../accountDeletion/memberRecords";

const NOW = "2026-10-20T00:00:00.000Z";
const KEPT = {
  id: "g1",
  houseId: "h1",
  firstName: "A",
  lastName: "B",
  rentOwed: 10,
  choreFees: 2,
  moveInDate: "2026-01-01",
  moveOutDate: "2026-09-01",
  intakeDate: "2026-01-01",
};

const snap = (data?: Record<string, unknown>) => ({ exists: !!data, data: () => data });

beforeEach(() => jest.clearAllMocks());

describe("memberRecords", () => {
  it("strips contact and health fields from the archived guest", () => {
    const pii = Object.fromEntries(GUEST_PII_FIELDS.map((k) => [k, "x"]));
    const out = scrubGuestForArchive({ ...KEPT, ...pii, userId: "u1" }, NOW);
    for (const k of GUEST_PII_FIELDS) expect(out).not.toHaveProperty(k);
    expect(out).toMatchObject(KEPT);
    expect(out.accountDeletedAt).toBe(NOW);
    expect(out.userId).toBeNull();
  });

  const rooms = {
    r1: { id: "r1", beds: { b1: { id: "b1", guestId: "g1" }, b2: { id: "b2", guestId: "g2" } } },
  };

  function arrange(capacity: number) {
    mockTxGet.mockImplementation(async (r: { path: string }) =>
      r.path === "guests/g1"
        ? snap({ ...KEPT, email: "e@x.com" })
        : snap({ id: "h1", currentCapacity: capacity, rooms }),
    );
  }

  it("discharges the resident and frees the bed", async () => {
    arrange(3);
    await dischargeResident("g1", NOW);
    const [archRef, archData] = mockTxSet.mock.calls[0];
    expect(archRef.path).toBe("guest-archive/g1");
    expect(archData).not.toHaveProperty("email");
    expect(archData.accountDeletedAt).toBe(NOW);
    expect(mockTxDelete.mock.calls[0][0].path).toBe("guests/g1");
    const [houseRef, update] = mockTxUpdate.mock.calls[0];
    expect(houseRef.path).toBe("houses/h1");
    expect(update.currentCapacity).toBe(2);
    expect(update.rooms.r1.beds.b1.guestId).toBeNull();
    expect(update.rooms.r1.beds.b2.guestId).toBe("g2");
  });

  it("never drives currentCapacity below zero", async () => {
    arrange(0);
    await dischargeResident("g1", NOW);
    expect(mockTxUpdate.mock.calls[0][1].currentCapacity).toBe(0);
  });

  it("discharging an already-deleted guest is a no-op", async () => {
    mockTxGet.mockResolvedValue(snap(undefined));
    await dischargeResident("g1", NOW);
    expect(mockTxSet).not.toHaveBeenCalled();
    expect(mockTxDelete).not.toHaveBeenCalled();
    expect(mockTxUpdate).not.toHaveBeenCalled();
  });

  it("removes a staff admin from every house and deletes the admin doc", async () => {
    mockAdminGet.mockResolvedValue(snap({ houseIds: ["h1", "gone"] }));
    mockHouseGet.mockImplementation(async (id: string) => ({ exists: id === "h1" }));
    await removeStaffAdmin("a1");
    expect(mockHouseUpdate).toHaveBeenCalledTimes(1);
    const [id, data] = mockHouseUpdate.mock.calls[0];
    expect(id).toBe("h1");
    expect(data.adminIds).toEqual({ sentinel: "arrayRemove", v: ["a1"] });
    expect(data.superAdminIds).toEqual({ sentinel: "arrayRemove", v: ["a1"] });
    expect(mockAdminDelete).toHaveBeenCalledWith("a1");
  });

  it("removing an already-deleted admin is a no-op", async () => {
    mockAdminGet.mockResolvedValue(snap(undefined));
    await removeStaffAdmin("a1");
    expect(mockHouseUpdate).not.toHaveBeenCalled();
    expect(mockAdminDelete).not.toHaveBeenCalled();
  });
});
