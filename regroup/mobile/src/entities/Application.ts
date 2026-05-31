import { BaseEntity } from './BaseEntity';

export type ApplicationStatus =
  | 'pending'
  | 'reviewing'
  | 'approved'
  | 'rejected';
export type ProgramType = 'AA' | 'NA' | 'SMART Recovery' | 'other';

export class HouseApplication extends BaseEntity {
  houseId: string = '';
  applicantUid: string = '';
  applicantName: string = '';
  applicantEmail: string = '';
  applicantPhone: string = '';
  sobrietyDate: string = '';
  programType: ProgramType = 'AA';
  currentSituation: string = '';
  references: string = '';
  status: ApplicationStatus = 'pending';
  operatorNote: string = '';
  reviewedAt: string = '';
  reviewedBy: string = '';
  createdAt: string = '';
}

export interface HouseApplications {
  [id: string]: HouseApplication;
}
