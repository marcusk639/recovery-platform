import { BaseEntity } from './BaseEntity';
import { getCurrentTime } from '../util/display';

export type HouseIssueType = 'maintenance' | 'house' | 'guest';

export enum IssueStatus {
  OPEN = 'open',
  IN_PROGRESS = 'in_progress',
  RESOLVED = 'resolved',
  DISMISSED = 'dismissed', // replaces the 'invalid' boolean
}

export class HouseIssue extends BaseEntity {
  type!: HouseIssueType; // Set in constructor
  description: string = '';
  emergency: boolean = false;
  issuer: string = ''; // the admin id or guest id of the creator of the issue
  /** @deprecated Use status instead */
  resolution: string = '';
  resolver: string = ''; // the admin id or guest id of the user that resolves the issue
  /** @deprecated Use status instead */
  invalid: boolean = false;
  houseId: string = '';
  status: IssueStatus = IssueStatus.OPEN;

  constructor(
    id: string,
    type: HouseIssueType,
    description: string,
    issuer: string,
    emergency: boolean = false,
  ) {
    super();
    this.id = id;
    this.type = type;
    this.description = description;
    this.emergency = emergency;
    this.issuer = issuer;
    this.createdAt = getCurrentTime();
  }
}

/**
 * Derives the canonical IssueStatus for an issue.
 * Supports legacy issues that were persisted before the status field existed:
 *   - issues with invalid===true  → DISMISSED
 *   - issues with a non-empty resolution string → RESOLVED
 *   - otherwise → OPEN
 * For issues that already carry the new status field the field is returned
 * directly.
 */
export function getIssueStatus(issue: HouseIssue): IssueStatus {
  if (issue.status) return issue.status;
  if (issue.invalid) return IssueStatus.DISMISSED;
  if (issue.resolution) return IssueStatus.RESOLVED;
  return IssueStatus.OPEN;
}

export class MaintenanceIssue extends HouseIssue {}

export interface Issues {
  [key: string]: HouseIssue;
}
