/**
 * Utility helpers for working with HouseIssue collections.
 *
 * These functions are pure (no side effects) and work on the Issues record
 * shape that is stored on the House entity (`house.issues`).
 */

import { HouseIssue, IssueStatus, Issues, getIssueStatus } from '../entities/Issue';

/**
 * Returns an array of issues whose resolved status matches the supplied value.
 * Uses `getIssueStatus` so that legacy issues (no explicit status field) are
 * handled correctly.
 */
export function filterIssuesByStatus(
  issues: Issues,
  status: IssueStatus,
): HouseIssue[] {
  return Object.values(issues).filter(
    issue => getIssueStatus(issue) === status,
  );
}

/**
 * Returns the number of issues that are currently OPEN.
 * Uses `getIssueStatus` for legacy compatibility.
 */
export function getOpenIssueCount(issues: Issues): number {
  return filterIssuesByStatus(issues, IssueStatus.OPEN).length;
}

/** Priority order used when sorting issues by status. Lower index = higher priority. */
const STATUS_SORT_ORDER: IssueStatus[] = [
  IssueStatus.OPEN,
  IssueStatus.IN_PROGRESS,
  IssueStatus.RESOLVED,
  IssueStatus.DISMISSED,
];

/**
 * Returns all issues sorted by status priority (OPEN first, IN_PROGRESS next,
 * then RESOLVED and DISMISSED last).  Within the same status bucket issues are
 * sorted newest-first by their `createdDate` legacy field or `createdAt` ISO
 * field.
 */
export function getSortedIssues(issues: Issues): HouseIssue[] {
  return Object.values(issues).sort((a, b) => {
    const statusA = getIssueStatus(a);
    const statusB = getIssueStatus(b);
    const orderDiff =
      STATUS_SORT_ORDER.indexOf(statusA) - STATUS_SORT_ORDER.indexOf(statusB);
    if (orderDiff !== 0) return orderDiff;

    // Within same status: newest first
    const dateA = a.createdAt || String(a.createdDate || '');
    const dateB = b.createdAt || String(b.createdDate || '');
    if (dateA < dateB) return 1;
    if (dateA > dateB) return -1;
    return 0;
  });
}
