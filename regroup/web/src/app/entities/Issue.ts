import { BaseEntity } from './BaseEntity';

export type HouseIssueType = 'maintenance' | 'house' | 'guest';

export class HouseIssue extends BaseEntity {
  type: HouseIssueType;
  description: string;
  emergency: boolean = false;
  issuer: string; // the admin id or guest id of the creator of the issue
  resolution: string;
  resolver: string; // the admin id or guest id of the user that resolves the issue
  invalid: boolean = false;
  houseId: string;

  constructor(id: string, type: HouseIssueType, description: string, issuer: string, emergency: boolean = false) {
    super();
    this.id = id;
    this.type = type;
    this.description = description;
    this.emergency = emergency;
    this.issuer = issuer;
  }
}

export class MaintenanceIssue extends HouseIssue {}

export interface Issues {
  [key: string]: HouseIssue;
}
