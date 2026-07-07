// src/services/__tests__/issues.test.ts
//
// Unit tests for the issues service (src/services/issues.ts).
//
// The service exports:
//   createIssue        — enforces status=OPEN then delegates to crud.create
//   removeIssue        — uses firestore.batch() to update both collections
//   updateIssueStatus  — clones house.issues, patches one entry, calls
//                        houseCollection.doc(id).update({ issues })
//   resolveIssue       — convenience wrapper: RESOLVED status
//   dismissIssue       — convenience wrapper: DISMISSED status
//
// Note: jest.mock() is hoisted before const declarations, so mock objects
// must be defined inside the factory rather than referencing outer variables.
// We expose internal mock handles via hidden properties on the returned object
// so tests can control resolved values in beforeEach/per-test.

// ─── Mocks (hoisted before imports) ─────────────────────────────────────────

jest.mock("../../../firebase-setup", () => {
  const issueDocRef = {
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

  const issuesCollection = {
    doc: jest.fn(() => issueDocRef),
    _docRef: issueDocRef,
  };

  const housesCollection = {
    doc: jest.fn(() => houseDocRef),
    _docRef: houseDocRef,
  };

  const firestore = {
    collection: jest.fn((name: string) => {
      if (name === "issues") return issuesCollection;
      return housesCollection;
    }),
    batch: jest.fn(() => batch),
    _issueDocRef: issueDocRef,
    _houseDocRef: houseDocRef,
    _batch: batch,
    _issuesCollection: issuesCollection,
    _housesCollection: housesCollection,
  };

  return { firestore };
});

jest.mock("../crud", () => ({
  create: jest.fn(),
  get: jest.fn(),
  update: jest.fn(),
  deleteObject: jest.fn(),
}));

// ─── Imports (after mocks) ───────────────────────────────────────────────────

import { firestore } from "../../../firebase-setup";
import * as crud from "../crud";
import {
  createIssue,
  removeIssue,
  updateIssueStatus,
  resolveIssue,
  dismissIssue,
} from "../issues";
import { HouseIssue, IssueStatus } from "../../entities/Issue";
import { House } from "../../entities/House";

// ─── Helpers ─────────────────────────────────────────────────────────────────

function makeIssue(overrides: Partial<HouseIssue> = {}): HouseIssue {
  const issue = new HouseIssue(
    "issue1",
    "maintenance",
    "Leaky faucet",
    "admin1"
  );
  issue.houseId = "house1";
  return Object.assign(issue, overrides);
}

/** Create a bare House-shaped object without invoking the real constructor
 * (which calls houseService.createHouseId() and would require further mocking).
 */
function makeHouse(overrides: Partial<House> = {}): House {
  const house = Object.create(House.prototype) as House;
  house.id = "house1";
  house.issues = {};
  house.adminIds = [];
  house.superAdminIds = [];
  house.ownerId = "";
  return Object.assign(house, overrides);
}

function makeHouseWithIssue(issue: HouseIssue): House {
  return makeHouse({ issues: { [issue.id]: issue } });
}

// ─── Accessors for mock internals ─────────────────────────────────────────────

const fs = firestore as any;
const getIssueDocRef = () =>
  fs._issueDocRef as jest.Mocked<typeof fs._issueDocRef>;
const getHouseDocRef = () =>
  fs._houseDocRef as jest.Mocked<typeof fs._houseDocRef>;
const getBatch = () => fs._batch as jest.Mocked<typeof fs._batch>;

// ─── Tests ───────────────────────────────────────────────────────────────────

describe("issues service", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    getIssueDocRef().set.mockResolvedValue(undefined);
    getIssueDocRef().update.mockResolvedValue(undefined);
    getHouseDocRef().update.mockResolvedValue(undefined);
    getBatch().commit.mockResolvedValue(undefined);
    // Restore collection.doc() returns after clearAllMocks
    fs._issuesCollection.doc.mockReturnValue(getIssueDocRef());
    fs._housesCollection.doc.mockReturnValue(getHouseDocRef());
    fs.batch.mockReturnValue(getBatch());
  });

  // ── createIssue ───────────────────────────────────────────────────────────

  describe("createIssue", () => {
    it("delegates to crud.create with the issue", async () => {
      const issue = makeIssue();
      (crud.create as jest.Mock).mockResolvedValue({
        ...issue,
        status: IssueStatus.OPEN,
      });

      await createIssue(issue);

      expect(crud.create).toHaveBeenCalledTimes(1);
    });

    it("always forces status to OPEN regardless of the input status", async () => {
      const issue = makeIssue({ status: IssueStatus.RESOLVED });
      (crud.create as jest.Mock).mockImplementation((_col: any, obj: any) =>
        Promise.resolve(obj)
      );

      await createIssue(issue);

      const [, passedObj] = (crud.create as jest.Mock).mock.calls[0];
      expect(passedObj.status).toBe(IssueStatus.OPEN);
    });

    it("passes the issue id as the explicit id argument to crud.create", async () => {
      const issue = makeIssue({ id: "my-issue-id" });
      (crud.create as jest.Mock).mockResolvedValue(issue);

      await createIssue(issue);

      const [, , passedId] = (crud.create as jest.Mock).mock.calls[0];
      expect(passedId).toBe("my-issue-id");
    });

    it("returns the result from crud.create", async () => {
      const issue = makeIssue();
      const created = { ...issue, status: IssueStatus.OPEN };
      (crud.create as jest.Mock).mockResolvedValue(created);

      const result = await createIssue(issue);

      expect(result).toEqual(created);
    });

    it("propagates errors from crud.create", async () => {
      (crud.create as jest.Mock).mockRejectedValue(new Error("Write failed"));

      await expect(createIssue(makeIssue())).rejects.toThrow("Write failed");
    });
  });

  // ── removeIssue ───────────────────────────────────────────────────────────

  describe("removeIssue", () => {
    it("commits the batch", async () => {
      const issue = makeIssue();
      const house = makeHouseWithIssue(issue);

      await removeIssue(house, issue);

      expect(getBatch().commit).toHaveBeenCalledTimes(1);
    });

    it("removes the issue from house.issues in the returned house", async () => {
      const issue = makeIssue();
      const house = makeHouseWithIssue(issue);

      const result = await removeIssue(house, issue);

      expect(result.issues).not.toHaveProperty("issue1");
    });

    it("calls batch.delete on the issues collection doc instead of rewriting it", async () => {
      // Hardened 2026-07-05: this previously called batch.set(ref, issue),
      // which rewrote the same issue doc back instead of deleting it — the
      // standalone collection doc persisted untouched (orphaned-record bug).
      const issue = makeIssue();
      const house = makeHouseWithIssue(issue);

      await removeIssue(house, issue);

      expect(getBatch().delete).toHaveBeenCalledWith(getIssueDocRef());
      expect(getBatch().set).not.toHaveBeenCalled();
    });

    it("calls batch.update on the houses collection doc scoped to just the issues field", async () => {
      // Hardened 2026-07-05: this previously blind-wrote the entire client
      // house snapshot, risking clobbering concurrent edits from other admins.
      const issue = makeIssue();
      const house = makeHouseWithIssue(issue);

      await removeIssue(house, issue);

      expect(getBatch().update).toHaveBeenCalledWith(getHouseDocRef(), {
        issues: {},
      });
      const [, payload] = getBatch().update.mock.calls[0];
      expect(payload).not.toHaveProperty("id");
    });

    it("returns the updated house object with correct id", async () => {
      const issue = makeIssue();
      const house = makeHouseWithIssue(issue);

      const result = await removeIssue(house, issue);

      expect(result.id).toBe("house1");
    });

    it("does not mutate the original house.issues object (uses cloneDeep)", async () => {
      const issue = makeIssue();
      const house = makeHouseWithIssue(issue);
      const originalIssues = { ...house.issues };

      await removeIssue(house, issue);

      expect(house.issues).toEqual(originalIssues);
    });

    it("propagates errors from batch.commit", async () => {
      getBatch().commit.mockRejectedValue(new Error("Batch failed"));
      const issue = makeIssue();
      const house = makeHouseWithIssue(issue);

      await expect(removeIssue(house, issue)).rejects.toThrow("Batch failed");
    });
  });

  // ── updateIssueStatus ─────────────────────────────────────────────────────

  describe("updateIssueStatus", () => {
    it("throws when the issueId is not found on the house", async () => {
      const house = makeHouse(); // no issues

      await expect(
        updateIssueStatus(house, "nonexistent", IssueStatus.RESOLVED)
      ).rejects.toThrow("Issue nonexistent not found on house house1");
    });

    it("updates the issue status to RESOLVED", async () => {
      const issue = makeIssue({ status: IssueStatus.OPEN });
      const house = makeHouseWithIssue(issue);

      const result = await updateIssueStatus(
        house,
        "issue1",
        IssueStatus.RESOLVED
      );

      expect(result.issues["issue1"].status).toBe(IssueStatus.RESOLVED);
    });

    it("updates the issue status to IN_PROGRESS", async () => {
      const issue = makeIssue({ status: IssueStatus.OPEN });
      const house = makeHouseWithIssue(issue);

      const result = await updateIssueStatus(
        house,
        "issue1",
        IssueStatus.IN_PROGRESS
      );

      expect(result.issues["issue1"].status).toBe(IssueStatus.IN_PROGRESS);
    });

    it("sets the resolution text when provided", async () => {
      const issue = makeIssue();
      const house = makeHouseWithIssue(issue);

      const result = await updateIssueStatus(
        house,
        "issue1",
        IssueStatus.RESOLVED,
        "Fixed the leak"
      );

      expect(result.issues["issue1"].resolution).toBe("Fixed the leak");
    });

    it("sets invalid=true when status is DISMISSED", async () => {
      const issue = makeIssue();
      const house = makeHouseWithIssue(issue);

      const result = await updateIssueStatus(
        house,
        "issue1",
        IssueStatus.DISMISSED
      );

      expect(result.issues["issue1"].invalid).toBe(true);
    });

    it("sets invalid=false when status is not DISMISSED", async () => {
      const issue = makeIssue({ invalid: true });
      const house = makeHouseWithIssue(issue);

      const result = await updateIssueStatus(
        house,
        "issue1",
        IssueStatus.RESOLVED
      );

      expect(result.issues["issue1"].invalid).toBe(false);
    });

    it("calls houseCollection.doc().update with a payload containing the updated issues map", async () => {
      const issue = makeIssue();
      const house = makeHouseWithIssue(issue);

      await updateIssueStatus(house, "issue1", IssueStatus.RESOLVED, "Done");

      expect(getHouseDocRef().update).toHaveBeenCalledWith(
        expect.objectContaining({
          issues: expect.objectContaining({
            issue1: expect.objectContaining({ status: IssueStatus.RESOLVED }),
          }),
        })
      );
    });

    it("returns the updated house object", async () => {
      const issue = makeIssue();
      const house = makeHouseWithIssue(issue);

      const result = await updateIssueStatus(
        house,
        "issue1",
        IssueStatus.RESOLVED
      );

      expect(result.id).toBe("house1");
    });

    it("propagates errors from the Firestore update call", async () => {
      getHouseDocRef().update.mockRejectedValue(new Error("Update failed"));
      const issue = makeIssue();
      const house = makeHouseWithIssue(issue);

      await expect(
        updateIssueStatus(house, "issue1", IssueStatus.RESOLVED)
      ).rejects.toThrow("Update failed");
    });
  });

  // ── resolveIssue ──────────────────────────────────────────────────────────

  describe("resolveIssue", () => {
    it("sets status to RESOLVED", async () => {
      const issue = makeIssue();
      const house = makeHouseWithIssue(issue);

      const result = await resolveIssue(house, "issue1");

      expect(result.issues["issue1"].status).toBe(IssueStatus.RESOLVED);
    });

    it("passes the resolution text through to the updated issue", async () => {
      const issue = makeIssue();
      const house = makeHouseWithIssue(issue);

      const result = await resolveIssue(house, "issue1", "Plumber fixed it");

      expect(result.issues["issue1"].resolution).toBe("Plumber fixed it");
    });

    it("propagates errors from updateIssueStatus", async () => {
      getHouseDocRef().update.mockRejectedValue(new Error("Resolve failed"));
      const issue = makeIssue();
      const house = makeHouseWithIssue(issue);

      await expect(resolveIssue(house, "issue1")).rejects.toThrow(
        "Resolve failed"
      );
    });
  });

  // ── dismissIssue ──────────────────────────────────────────────────────────

  describe("dismissIssue", () => {
    it("sets status to DISMISSED", async () => {
      const issue = makeIssue();
      const house = makeHouseWithIssue(issue);

      const result = await dismissIssue(house, "issue1");

      expect(result.issues["issue1"].status).toBe(IssueStatus.DISMISSED);
    });

    it("sets invalid=true for backward compatibility with legacy data", async () => {
      const issue = makeIssue();
      const house = makeHouseWithIssue(issue);

      const result = await dismissIssue(house, "issue1");

      expect(result.issues["issue1"].invalid).toBe(true);
    });

    it("stores the explanation as the resolution field", async () => {
      const issue = makeIssue();
      const house = makeHouseWithIssue(issue);

      const result = await dismissIssue(house, "issue1", "Not a real issue");

      expect(result.issues["issue1"].resolution).toBe("Not a real issue");
    });

    it("propagates errors from updateIssueStatus", async () => {
      getHouseDocRef().update.mockRejectedValue(new Error("Dismiss failed"));
      const issue = makeIssue();
      const house = makeHouseWithIssue(issue);

      await expect(dismissIssue(house, "issue1")).rejects.toThrow(
        "Dismiss failed"
      );
    });
  });
});
