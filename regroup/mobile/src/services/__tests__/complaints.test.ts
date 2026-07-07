// src/services/__tests__/complaints.test.ts
//
// Unit tests for the complaints service (src/services/complaints.ts).
//
// Regression coverage for 2026-07-05: removeComplaint used batch.set() to
// "remove" a complaint, which rewrote the same document back instead of
// deleting it — the complaint disappeared from the house's embedded list
// view but the standalone collection doc persisted untouched (an
// orphaned-record data-integrity issue). It also blind-wrote the entire
// client-side house snapshot instead of just the changed field.

jest.mock("../../../firebase-setup", () => {
  const complaintDocRef = {
    set: jest.fn(() => Promise.resolve()),
    update: jest.fn(() => Promise.resolve()),
    delete: jest.fn(() => Promise.resolve()),
    get: jest.fn(() => Promise.resolve({ exists: false, data: () => null })),
  };

  const houseDocRef = {
    set: jest.fn(() => Promise.resolve()),
    update: jest.fn(() => Promise.resolve()),
    delete: jest.fn(() => Promise.resolve()),
    get: jest.fn(() => Promise.resolve({ exists: false, data: () => null })),
  };

  const batch = {
    set: jest.fn(),
    update: jest.fn(),
    delete: jest.fn(),
    commit: jest.fn(() => Promise.resolve()),
  };

  const complaintsCollection = {
    doc: jest.fn(() => complaintDocRef),
    _docRef: complaintDocRef,
  };

  const housesCollection = {
    doc: jest.fn(() => houseDocRef),
    _docRef: houseDocRef,
  };

  const firestore = {
    collection: jest.fn((name: string) => {
      if (name === "complaints") return complaintsCollection;
      return housesCollection;
    }),
    batch: jest.fn(() => batch),
    _complaintDocRef: complaintDocRef,
    _houseDocRef: houseDocRef,
    _batch: batch,
    _complaintsCollection: complaintsCollection,
    _housesCollection: housesCollection,
  };

  return { firestore };
});

jest.mock("../crud", () => ({
  create: jest.fn(),
}));

import { firestore } from "../../../firebase-setup";
import { removeComplaint } from "../complaints";
import { Complaint } from "../../entities/Complaint";
import { House } from "../../entities/House";

function makeComplaint(overrides: Partial<Complaint> = {}): Complaint {
  const complaint = new Complaint();
  complaint.id = "complaint1";
  complaint.houseId = "house1";
  return Object.assign(complaint, overrides);
}

function makeHouse(overrides: Partial<House> = {}): House {
  const house = Object.create(House.prototype) as House;
  house.id = "house1";
  house.complaints = {};
  return Object.assign(house, overrides);
}

function makeHouseWithComplaint(complaint: Complaint): House {
  return makeHouse({ complaints: { [complaint.id]: complaint } });
}

const fs = firestore as any;
const getComplaintDocRef = () => fs._complaintDocRef;
const getHouseDocRef = () => fs._houseDocRef;
const getBatch = () => fs._batch;

describe("complaints service", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    getBatch().commit.mockResolvedValue(undefined);
    fs._complaintsCollection.doc.mockReturnValue(getComplaintDocRef());
    fs._housesCollection.doc.mockReturnValue(getHouseDocRef());
    fs.batch.mockReturnValue(getBatch());
  });

  describe("removeComplaint", () => {
    it("commits the batch", async () => {
      const complaint = makeComplaint();
      const house = makeHouseWithComplaint(complaint);

      await removeComplaint(house, complaint);

      expect(getBatch().commit).toHaveBeenCalledTimes(1);
    });

    it("removes the complaint from house.complaints in the returned house", async () => {
      const complaint = makeComplaint();
      const house = makeHouseWithComplaint(complaint);

      const result = await removeComplaint(house, complaint);

      expect(result.complaints).not.toHaveProperty("complaint1");
    });

    it("calls batch.delete on the complaints collection doc instead of rewriting it", async () => {
      const complaint = makeComplaint();
      const house = makeHouseWithComplaint(complaint);

      await removeComplaint(house, complaint);

      expect(getBatch().delete).toHaveBeenCalledWith(getComplaintDocRef());
      expect(getBatch().set).not.toHaveBeenCalled();
    });

    it("calls batch.update on the houses collection doc scoped to just the complaints field", async () => {
      const complaint = makeComplaint();
      const house = makeHouseWithComplaint(complaint);

      await removeComplaint(house, complaint);

      expect(getBatch().update).toHaveBeenCalledWith(getHouseDocRef(), {
        complaints: {},
      });
      const [, payload] = getBatch().update.mock.calls[0];
      expect(payload).not.toHaveProperty("id");
    });

    it("does not mutate the original house.complaints object", async () => {
      const complaint = makeComplaint();
      const house = makeHouseWithComplaint(complaint);
      const originalComplaints = { ...house.complaints };

      await removeComplaint(house, complaint);

      expect(house.complaints).toEqual(originalComplaints);
    });

    it("propagates errors from batch.commit", async () => {
      getBatch().commit.mockRejectedValue(new Error("Batch failed"));
      const complaint = makeComplaint();
      const house = makeHouseWithComplaint(complaint);

      await expect(removeComplaint(house, complaint)).rejects.toThrow(
        "Batch failed"
      );
    });
  });
});
