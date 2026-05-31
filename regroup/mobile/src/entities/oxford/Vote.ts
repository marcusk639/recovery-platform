export type VoteType =
  | 'acceptance'
  | 'expulsion'
  | 'officer_removal'
  | 'chore_assignment'
  | 'general';

export interface Vote {
  id: string;
  houseId: string;
  meetingId?: string; // null for async votes
  topic: string;
  description: string;
  type: VoteType;
  options: string[];
  results: { [option: string]: number };
  individualVotes: { [userId: string]: string };
  threshold: number; // e.g. 0.8 for 80% acceptance requirement
  isAnonymous?: boolean; // When true, individualVotes map is not written
  passed: boolean;
  closedAt?: string;
  createdAt: string;
}
