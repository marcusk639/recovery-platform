export interface Sponsorship {
  id: string;
  groupId: string;
  sponsorId: string;
  sponseeId: string;
  sponsorName: string;
  sponseeName: string;
  startDate: Date;
  endDate: Date | null;
  status: 'active' | 'completed' | 'terminated';
  createdAt: Date;
  updatedAt: Date;
}

export interface SponsorshipAnalytics {
  successRate: number;
  averageDuration: number;
  commonChallenges: {
    challenge: string;
    count: number;
  }[];
  solutions: {
    solution: string;
    successRate: number;
  }[];
}

export interface SponsorChatMessage {
  id: string;
  text: string;
  senderId: string;
  timestamp: Date;
  isRead: boolean;
}

export interface SponsorSettings {
  isAvailable: boolean;
  requirements: string[];
  bio: string;
}
