export type AdminRemovalStatus =
  | 'pending'
  | 'approved'
  | 'rejected'
  | 'expired'
  | 'withdrawn';

export interface AdminRemovalRequest {
  id: string;
  groupId: string;
  targetAdminId: string;
  targetAdminName: string;
  initiatedBy: string;
  initiatedByName: string;
  reason: string;
  status: AdminRemovalStatus;
  createdAt: string; // ISO string
  expiresAt: string;
  resolvedAt?: string;
  votesFor: number;
  votesAgainst: number;
  votesAbstain: number;
  totalEligibleVoters: number;
  adminResponse?: string;
  adminRespondedAt?: string;
}

export interface AdminRemovalVote {
  userId: string;
  userName: string;
  vote: 'yes' | 'no' | 'abstain';
  votedAt: string;
}
