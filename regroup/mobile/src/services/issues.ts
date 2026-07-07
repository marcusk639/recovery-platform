import * as crud from "./crud";
import { firestore } from "../../firebase-setup";
import { HouseIssue, IssueStatus } from "../entities/Issue";
import { House } from "../entities/House";
import cloneDeep from "lodash/cloneDeep";

const issuesCollection = firestore.collection("issues");
const houseCollection = firestore.collection("houses");

export const createIssue = (issue: HouseIssue) => {
  // Ensure new issues always start with an explicit OPEN status
  const issueWithStatus: HouseIssue = { ...issue, status: IssueStatus.OPEN };
  return crud.create<HouseIssue>(
    issuesCollection,
    issueWithStatus,
    issueWithStatus.id
  );
};

export const removeIssue = async (_house: House, issue: HouseIssue) => {
  const batch = firestore.batch();
  const issues = cloneDeep(_house.issues);
  delete issues[issue.id];
  const house: House = { ..._house, issues: { ...issues } };
  // Hardened 2026-07-05: batch.set() rewrote the same issue document back
  // instead of deleting it — "Remove" disappeared the item from the house's
  // embedded list view but the standalone collection doc persisted untouched.
  // Also scoped the house update to just the changed field instead of
  // blind-writing the full client-side house snapshot, which risked
  // clobbering concurrent edits from other admins.
  batch.delete(issuesCollection.doc(issue.id));
  batch.update(houseCollection.doc(house.id), { issues: house.issues });
  await batch.commit();
  return house;
};

/**
 * Updates the status of an issue nested inside a house document.
 * When resolving (RESOLVED) a resolution string may be provided.
 * When dismissing (DISMISSED) an explanation may be provided via resolution.
 * Returns the updated House object.
 */
export const updateIssueStatus = async (
  _house: House,
  issueId: string,
  status: IssueStatus,
  resolution?: string
): Promise<House> => {
  const issues = cloneDeep(_house.issues);
  const existing = issues[issueId];
  if (!existing) {
    throw new Error(`Issue ${issueId} not found on house ${_house.id}`);
  }

  const updatedIssue: HouseIssue = {
    ...existing,
    status,
    // Keep legacy fields in sync for backward compatibility
    invalid: status === IssueStatus.DISMISSED,
    resolution:
      resolution !== undefined
        ? resolution
        : status === IssueStatus.RESOLVED
        ? existing.resolution
        : "",
  };

  issues[issueId] = updatedIssue;
  const house: House = { ..._house, issues };
  await houseCollection.doc(house.id).update({ issues });
  return house;
};

/** Convenience wrapper: mark an issue as RESOLVED with an optional resolution text. */
export const resolveIssue = (
  house: House,
  issueId: string,
  resolution?: string
) => updateIssueStatus(house, issueId, IssueStatus.RESOLVED, resolution);

/** Convenience wrapper: mark an issue as DISMISSED (replaces the invalid flag). */
export const dismissIssue = (
  house: House,
  issueId: string,
  explanation?: string
) => updateIssueStatus(house, issueId, IssueStatus.DISMISSED, explanation);
