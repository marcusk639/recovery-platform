import { ActivityType } from './ActivityModel';

export type DisputeType = ActivityType;
export const DISPUTABLE_STATS = [
  ActivityType.CHORE,
  ActivityType.PRIMARY_SUPPORTER,
  ActivityType.WORK,
  ActivityType.MEETING,
  ActivityType.MEDICATION,
];

export class DisputeChallenge {
  challenger: string = '';
  message: string = '';
}

export interface Dispute {
  id: string;
  guestId: string;
  houseId: string;
  activityId: string;
  type: ActivityType;
  message: string;
  status: 'pending' | 'resolved' | 'rejected';
  createdDate: string;
  createdAt: string;
  updatedAt: string;
  resolvedDate?: string;
  resolvedBy?: string;
  resolutionMessage?: string;
  challenges?: DisputeChallenge[];
}
