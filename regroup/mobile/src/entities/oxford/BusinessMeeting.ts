export interface AgendaItem {
  id: string;
  title: string;
  description?: string;
  addedBy: string; // userId
  voteId?: string;
}

export interface BusinessMeeting {
  id: string;
  houseId: string;
  scheduledDate: string; // ISO date
  actualDate?: string;
  agenda: AgendaItem[];
  attendees: string[]; // Guest Firestore doc ID (g.id), NOT Auth UID
  quorumMet: boolean;
  minutes?: string;
  createdBy: string;
  createdAt: string;
}
