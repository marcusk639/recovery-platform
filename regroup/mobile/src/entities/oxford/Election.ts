import { OfficerRole } from './Officer';

export interface ElectionCandidate {
  userId: string;
  nominatedBy: string;
}

export interface Election {
  id: string;
  houseId: string;
  role: OfficerRole;
  candidates: ElectionCandidate[];
  voteId: string;       // references votes collection
  winnerId?: string;
  termStartDate: string;
  termEndDate: string;
  conductedAt: string;
}
