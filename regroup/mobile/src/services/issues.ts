import {
  collection,
  deleteDoc,
  doc,
  updateDoc,
} from "@react-native-firebase/firestore";
import { logException } from "../util/logging";
import * as crud from "./crud";
import { firestore } from "../../firebase-setup";
import { HouseIssue, IssueStatus } from "../entities/Issue";
import { House } from "../entities/House";
import cloneDeep from "lodash/cloneDeep";

const issuesCollection = collection(firestore, "issues");
const houseCollection = collection(firestore, "houses");

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
  const issues = cloneDeep(_house.issues);
  delete issues[issue.id];
  const house: House = { ..._house, issues: { ...issues } };
  // The house's list is what the app shows, and it alone decides the outcome.
  // Scoped to just the issues field (hardened 2026-07-05): a blind write of the
  // whole house snapshot could clobber other admins' edits.
  await updateDoc(doc(houseCollection, house.id), { issues: house.issues });
  // Residents add issues only to that list. Delete an issues/{id} record if one
  // exists (never rewrite it, 2026-07-05). With no record the rules refuse the
  // delete (they read resource.data), and in one batch that refusal used to fail
  // the whole removal.
  try {
    await deleteDoc(doc(issuesCollection, issue.id));
  } catch (error: any) {
    if (error?.code !== "firestore/permission-denied") {
      logException(error, "removeIssue: issues/{id} record");
    }
  }
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
  await updateDoc(doc(houseCollection, house.id), { issues });
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
