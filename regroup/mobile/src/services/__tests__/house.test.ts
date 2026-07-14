// src/services/__tests__/house.test.ts
//
// Unit tests for the house service.
//
// house.tsx imports from firebase-setup (firestore, functions) and several
// sibling services / utilities. We mock firebase-setup inline so the batch
// and doc helpers are fully controlled, and mock every sibling module that
// would otherwise pull in native code.

// ─── Mocks (hoisted before imports) ─────────────────────────────────────────

jest.mock("../../../firebase-setup", () => {
  const mockBatch = {
    set: jest.fn(),
    update: jest.fn(),
    delete: jest.fn(),
    commit: jest.fn().mockResolvedValue(undefined),
  };

  const docObj = {
    id: "generated-doc-id",
    get: jest.fn(() => Promise.resolve({ exists: false, data: () => null })),
    set: jest.fn(() => Promise.resolve()),
    update: jest.fn(() => Promise.resolve()),
    delete: jest.fn(() => Promise.resolve()),
  };

  const collectionObj: any = {
    doc: jest.fn(() => docObj),
    where: jest.fn(),
    orderBy: jest.fn().mockReturnThis(),
    limit: jest.fn().mockReturnThis(),
    get: jest.fn(() => Promise.resolve({ docs: [] })),
    add: jest.fn(() => Promise.resolve({ id: "mock-id" })),
  };

  // Make where chainable and return collectionObj so callers can chain .get()
  collectionObj.where = jest.fn(() => collectionObj);

  return {
    firestore: {
      collection: jest.fn(() => collectionObj),
      batch: jest.fn(() => mockBatch),
      _mockBatch: mockBatch,
      _collectionObj: collectionObj,
      _docObj: docObj,
    },
    functions: {
      httpsCallable: jest.fn(() =>
        jest.fn(() => Promise.resolve({ data: {} })),
      ),
    },
  };
});

jest.mock("../crud", () => ({
  get: jest.fn(),
  getByAttribute: jest.fn(),
  create: jest.fn(),
  update: jest.fn(),
  deleteObject: jest.fn(),
  createId: jest.fn(() => "generated-id"),
}));

jest.mock("../admin", () => ({
  adminCollection: {
    doc: jest.fn(() => ({
      id: "admin-doc-id",
      update: jest.fn(() => Promise.resolve()),
      delete: jest.fn(() => Promise.resolve()),
    })),
  },
}));

jest.mock("../guest", () => ({
  guestCollection: {
    doc: jest.fn(() => ({
      id: "guest-doc-id",
      update: jest.fn(() => Promise.resolve()),
      delete: jest.fn(() => Promise.resolve()),
    })),
  },
  archiveCollection: {
    doc: jest.fn(() => ({
      id: "archive-doc-id",
      set: jest.fn(() => Promise.resolve()),
    })),
  },
}));

jest.mock("../storage", () => ({
  uploadHousePhoto: jest.fn(() =>
    Promise.resolve({ url: "https://mock-photo-url" }),
  ),
}));

jest.mock("../setup-wizard", () => ({
  createAdminInvite: jest.fn(() => Promise.resolve({ token: "mock-token" })),
  createGuestInvite: jest.fn(() => Promise.resolve({ token: "mock-token" })),
}));

jest.mock("../invitations", () => ({
  createInvitation: jest.fn(() => Promise.resolve({ token: "mock-token" })),
}));

jest.mock("../../util/geolocation", () => ({
  geohash: jest.fn(() => "mock-geohash"),
  getGeohashRange: jest.fn(() => ({ lower: "abc", upper: "xyz" })),
}));

jest.mock("../../util/house", () => ({
  getFirstPhase: jest.fn(() => ({ name: "Phase 1" })),
  findGuestBed: jest.fn(),
}));

jest.mock("../../util/admin", () => ({
  houseIdsRemoved: jest.fn(() => [[], []]),
}));

jest.mock("../../../google/timezone", () => ({
  getTimezone: jest.fn(() => Promise.resolve("America/Chicago")),
}));

jest.mock("../../util/display", () => ({
  getCurrentTime: jest.fn(() => "2024-01-01T00:00:00.000Z"),
  getTodaysDate: jest.fn(() => "2024-01-01"),
  getDaysOfWeek: jest.fn(() => []),
  formatDate: jest.fn((d: string) => d),
}));

// ─── Imports (after mocks) ───────────────────────────────────────────────────

import { firestore, functions } from "../../../firebase-setup";
import * as crud from "../crud";
import {
  getHouse,
  createHouse,
  getHouses,
  updateHouse,
  updateHouseAwaitingVerification,
  getNearbyHouses,
  searchForHouses,
  createHouseBatch,
  finalizeHouseSetup,
  shapeHouses,
  removeGuestPrivileges,
} from "../house";
import { Guest } from "../../entities/Guest";
import { House } from "../../entities/House";
import { HOUSE_CODE_INVALID } from "../../constants/errors";

// ─── Helpers ─────────────────────────────────────────────────────────────────

const makeHouse = (overrides: Partial<House> = {}): House =>
  ({
    id: "h1",
    name: "Test House",
    ownerId: "owner1",
    adminIds: [],
    superAdminIds: [],
    street: "123 Main St",
    city: "Chicago",
    state: "IL",
    zip: "60601",
    code: "ABC123",
    lat: 41.8781,
    lng: -87.6298,
    geohash: "dp3wjzp",
    gender: "male",
    phases: {},
    chores: {},
    awaitingVerification: [],
    ...overrides,
  }) as unknown as House;

const getBatch = () =>
  (firestore as any)._mockBatch as {
    set: jest.Mock;
    update: jest.Mock;
    delete: jest.Mock;
    commit: jest.Mock;
  };

// ─── Tests ───────────────────────────────────────────────────────────────────

describe("house service", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    // Restore batch.commit default after clearAllMocks
    getBatch().commit.mockResolvedValue(undefined);
  });

  // ── shapeHouses ───────────────────────────────────────────────────────────

  describe("shapeHouses", () => {
    it("converts an array of QueryDocumentSnapshots into an id-keyed map", () => {
      const docs = [
        { id: "h1", data: () => ({ name: "House A" }) },
        { id: "h2", data: () => ({ name: "House B" }) },
      ] as any[];

      const result = shapeHouses(docs);

      expect(Object.keys(result)).toHaveLength(2);
      expect(result["h1"]).toEqual({ name: "House A" });
      expect(result["h2"]).toEqual({ name: "House B" });
    });

    it("returns an empty object for an empty docs array", () => {
      const result = shapeHouses([]);
      expect(result).toEqual({});
    });
  });

  // ── getHouse ──────────────────────────────────────────────────────────────

  describe("getHouse", () => {
    it("returns the house returned by crud.get", async () => {
      const house = makeHouse();
      (crud.get as jest.Mock).mockResolvedValue(house);

      const result = await getHouse("h1");

      expect(result.id).toBe("h1");
      expect(crud.get).toHaveBeenCalledTimes(1);
      expect(crud.get).toHaveBeenCalledWith(expect.anything(), "h1");
    });

    it("propagates errors from crud.get", async () => {
      (crud.get as jest.Mock).mockRejectedValue(new Error("Firestore error"));

      await expect(getHouse("h1")).rejects.toThrow("Firestore error");
    });
  });

  // ── createHouse ───────────────────────────────────────────────────────────

  describe("createHouse", () => {
    it("delegates to crud.create and returns the created house", async () => {
      const house = makeHouse();
      (crud.create as jest.Mock).mockResolvedValue(house);

      const result = await createHouse(house);

      expect(crud.create).toHaveBeenCalledTimes(1);
      expect(crud.create).toHaveBeenCalledWith(expect.anything(), house);
      expect(result.id).toBe("h1");
    });

    it("propagates errors from crud.create", async () => {
      const house = makeHouse();
      (crud.create as jest.Mock).mockRejectedValue(new Error("Create failed"));

      await expect(createHouse(house)).rejects.toThrow("Create failed");
    });
  });

  // ── getHouses ─────────────────────────────────────────────────────────────

  describe("getHouses", () => {
    it("returns houses as an id-keyed map", async () => {
      const houseArray = [makeHouse({ id: "h1" }), makeHouse({ id: "h2" })];
      (crud.getByAttribute as jest.Mock).mockResolvedValue(houseArray);

      const result = await getHouses("ownerId", "==", "owner1");

      expect(Object.keys(result)).toHaveLength(2);
      expect(result["h1"]).toBeDefined();
      expect(result["h2"]).toBeDefined();
    });

    it("returns an empty object when no houses match", async () => {
      (crud.getByAttribute as jest.Mock).mockResolvedValue([]);

      const result = await getHouses("ownerId", "==", "owner1");

      expect(result).toEqual({});
    });

    it("passes attribute, operator, and value to crud.getByAttribute", async () => {
      (crud.getByAttribute as jest.Mock).mockResolvedValue([]);

      await getHouses("code", "==", "XYZ");

      expect(crud.getByAttribute).toHaveBeenCalledWith(
        expect.anything(),
        "code",
        "==",
        "XYZ",
      );
    });
  });

  // ── updateHouse ───────────────────────────────────────────────────────────

  describe("updateHouse", () => {
    it("delegates to crud.update", async () => {
      (crud.update as jest.Mock).mockResolvedValue(undefined);

      await updateHouse("h1", { name: "Updated Name" });

      expect(crud.update).toHaveBeenCalledTimes(1);
    });

    it("sets the id on values when not already present", async () => {
      (crud.update as jest.Mock).mockResolvedValue(undefined);

      await updateHouse("h1", { name: "No Id" });

      expect(crud.update).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({ id: "h1", name: "No Id" }),
      );
    });

    it("preserves an existing id in values", async () => {
      (crud.update as jest.Mock).mockResolvedValue(undefined);

      await updateHouse("h1", { id: "h1", name: "Has Id" });

      expect(crud.update).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({ id: "h1" }),
      );
    });

    it("cleans chores by removing entries with empty names", async () => {
      (crud.update as jest.Mock).mockResolvedValue(undefined);

      const values = {
        chores: {
          dishes: { name: "Dishes", description: "Wash dishes" },
          "": { name: "", description: "Empty" },
          "  ": { name: "  ", description: "Whitespace" },
        },
      };

      await updateHouse("h1", values as any);

      const callArg = (crud.update as jest.Mock).mock.calls[0][1];
      expect(Object.keys(callArg.chores)).toHaveLength(1);
      expect(callArg.chores["Dishes"]).toBeDefined();
    });
  });

  // ── updateHouseAwaitingVerification ───────────────────────────────────────

  describe("updateHouseAwaitingVerification", () => {
    it("throws HOUSE_CODE_INVALID when no house is found with the code", async () => {
      (crud.getByAttribute as jest.Mock).mockResolvedValue([]);

      await expect(
        updateHouseAwaitingVerification("BADCODE", {
          firstName: "Jane",
          lastName: "Doe",
          userId: "u1",
        }),
      ).rejects.toThrow(HOUSE_CODE_INVALID);
    });

    it("pushes the awaitingVerification entry and calls updateHouse", async () => {
      const house = makeHouse({
        id: "h1",
        code: "GOODCODE",
        awaitingVerification: [],
      });
      (crud.getByAttribute as jest.Mock).mockResolvedValue([house]);
      (crud.update as jest.Mock).mockResolvedValue(undefined);

      await updateHouseAwaitingVerification("GOODCODE", {
        firstName: "Jane",
        lastName: "Doe",
        userId: "u2",
      });

      expect(crud.update).toHaveBeenCalledTimes(1);
      const callArg = (crud.update as jest.Mock).mock.calls[0][1];
      expect(callArg.awaitingVerification).toHaveLength(1);
      expect(callArg.awaitingVerification[0].userId).toBe("u2");
    });

    it("initialises awaitingVerification when it is missing from the house", async () => {
      const house = makeHouse({ id: "h1", code: "GOODCODE" });
      delete (house as any).awaitingVerification;
      (crud.getByAttribute as jest.Mock).mockResolvedValue([house]);
      (crud.update as jest.Mock).mockResolvedValue(undefined);

      await updateHouseAwaitingVerification("GOODCODE", {
        firstName: "Jane",
        lastName: "Doe",
        userId: "u3",
      });

      const callArg = (crud.update as jest.Mock).mock.calls[0][1];
      expect(Array.isArray(callArg.awaitingVerification)).toBe(true);
      expect(callArg.awaitingVerification).toHaveLength(1);
    });
  });

  // ── getNearbyHouses ───────────────────────────────────────────────────────

  describe("getNearbyHouses", () => {
    it("returns a shaped house map from Firestore results", async () => {
      const collectionObj = (firestore as any)._collectionObj;
      collectionObj.get.mockResolvedValueOnce({
        docs: [{ id: "h1", data: () => ({ name: "Near House" }) }],
      });

      const result = await getNearbyHouses(41.8, -87.6, 10);

      expect(result["h1"]).toBeDefined();
      expect(result["h1"].name).toBe("Near House");
    });

    it("returns an empty object when no houses are nearby", async () => {
      const collectionObj = (firestore as any)._collectionObj;
      collectionObj.get.mockResolvedValueOnce({ docs: [] });

      const result = await getNearbyHouses(41.8, -87.6, 10);

      expect(result).toEqual({});
    });
  });

  // ── searchForHouses ───────────────────────────────────────────────────────

  describe("searchForHouses", () => {
    it("returns all nearby houses when no gender filter is set", async () => {
      const collectionObj = (firestore as any)._collectionObj;
      collectionObj.get.mockResolvedValueOnce({
        docs: [
          { id: "h1", data: () => ({ name: "House A", gender: "male" }) },
          { id: "h2", data: () => ({ name: "House B", gender: "female" }) },
        ],
      });

      const result = await searchForHouses({
        filters: { location: { lat: 41.8, lng: -87.6 } },
      } as any);

      expect(Object.keys(result as object)).toHaveLength(2);
    });

    it("filters houses by gender when a gender filter is provided", async () => {
      const collectionObj = (firestore as any)._collectionObj;
      collectionObj.get.mockResolvedValueOnce({
        docs: [
          { id: "h1", data: () => ({ name: "House A", gender: "male" }) },
          { id: "h2", data: () => ({ name: "House B", gender: "female" }) },
        ],
      });

      const result = await searchForHouses({
        filters: { location: { lat: 41.8, lng: -87.6 }, gender: "male" },
      } as any);

      expect(Array.isArray(result)).toBe(true);
      expect((result as any[]).every((h: any) => h.gender === "male")).toBe(
        true,
      );
    });
  });

  // ── createHouseBatch ──────────────────────────────────────────────────────

  describe("createHouseBatch", () => {
    it("commits the batch and returns the new house and admins", async () => {
      const house = makeHouse({ lat: 41.8781, lng: -87.6298 });
      const admins = [{ id: "a1", email: "admin@test.com" }] as any[];

      const result = await createHouseBatch(house, admins);

      expect(getBatch().commit).toHaveBeenCalledTimes(1);
      expect(result.house).toBeDefined();
      expect(result.admins).toBeDefined();
      expect(Array.isArray(result.admins)).toBe(true);
    });

    it("attaches timezone to the new house", async () => {
      const house = makeHouse({ lat: 41.8781, lng: -87.6298 });

      const result = await createHouseBatch(house, []);

      expect(result.house.timezone).toBe("America/Chicago");
    });

    it("computes a geohash for the new house", async () => {
      const house = makeHouse({ lat: 41.8781, lng: -87.6298 });

      const result = await createHouseBatch(house, []);

      expect(result.house.geohash).toBe("mock-geohash");
    });

    it("throws when batch.commit fails", async () => {
      getBatch().commit.mockRejectedValueOnce(new Error("Batch failed"));

      const house = makeHouse({ lat: 41.8781, lng: -87.6298 });

      await expect(createHouseBatch(house, [])).rejects.toThrow(
        "Failed to create house.",
      );
    });
  });

  // ── finalizeHouseSetup ────────────────────────────────────────────────────

  describe("finalizeHouseSetup", () => {
    it("calls crud.update with setupComplete set to true", async () => {
      (crud.update as jest.Mock).mockResolvedValue(undefined);

      await finalizeHouseSetup("h1", { name: "Final House" });

      expect(crud.update).toHaveBeenCalledTimes(1);
      expect(crud.update).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({ id: "h1", setupComplete: true }),
      );
    });

    it("merges the provided finalConfig into the update", async () => {
      (crud.update as jest.Mock).mockResolvedValue(undefined);

      await finalizeHouseSetup("h1", {
        name: "Renamed House",
        maximumCapacity: 8,
      });

      expect(crud.update).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({ name: "Renamed House", maximumCapacity: 8 }),
      );
    });

    it("propagates errors from crud.update", async () => {
      (crud.update as jest.Mock).mockRejectedValue(new Error("Update failed"));

      await expect(finalizeHouseSetup("h1", {})).rejects.toThrow(
        "Update failed",
      );
    });
  });

  // ── removeGuestPrivileges ─────────────────────────────────────────────────
  //
  // Mirrors removeAdminPrivilegesForGuests's shape but with role: "guest" —
  // this is the callable dischargeGuest now invokes to revoke a discharged
  // resident's house-access custom claims.

  describe("removeGuestPrivileges", () => {
    const makeGuestFixture = (overrides: Partial<Guest> = {}): Guest =>
      ({
        id: "g1",
        userId: "u1",
        houseId: "h1",
        ...overrides,
      }) as Guest;

    it('calls the removePrivilegesForGuests callable with role "guest" and the given guests', async () => {
      const guest = makeGuestFixture();

      await removeGuestPrivileges([guest]);

      const httpsCallableMock = functions.httpsCallable as jest.Mock;
      expect(httpsCallableMock).toHaveBeenCalledWith(
        "removePrivilegesForGuests",
      );

      const invokedCallable = httpsCallableMock.mock.results[0].value;
      expect(invokedCallable).toHaveBeenCalledWith({
        role: "guest",
        guests: [guest],
      });
    });

    it("returns the callable response data", async () => {
      const httpsCallableMock = functions.httpsCallable as jest.Mock;
      httpsCallableMock.mockReturnValueOnce(
        jest.fn().mockResolvedValue({ data: "success" }),
      );

      const result = await removeGuestPrivileges([makeGuestFixture()]);

      expect(result).toBe("success");
    });

    it("does not call the callable when given an empty guest array", async () => {
      const httpsCallableMock = functions.httpsCallable as jest.Mock;

      await removeGuestPrivileges([]);

      expect(httpsCallableMock).not.toHaveBeenCalled();
    });

    it("does not call the callable when given undefined", async () => {
      const httpsCallableMock = functions.httpsCallable as jest.Mock;

      await removeGuestPrivileges(undefined as unknown as Guest[]);

      expect(httpsCallableMock).not.toHaveBeenCalled();
    });
  });
});
