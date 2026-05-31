export interface GroupDashboardMetrics {
  groupId: string;
  period: 'month' | 'week' | 'all_time';
  periodStart: Date;
  periodEnd: Date;
  messageCount: number;
  announcementCount: number;
  activeMembers: number;
  totalMembers: number;
  treasuryBalance: number;
  periodIncome: number;
  periodExpenses: number;
  transactionCount: number;
  meetingsHeld: number;
  meetingsCancelled: number;
  totalAttendance: number;
  newMembers: number;
  membersLeft: number;
  memberEngagementRate?: number;
  averageAttendance?: number;
  computedAt: Date;
}

export interface DashboardState {
  metrics: GroupDashboardMetrics | null;
  loading: boolean;
  error: string | null;
  lastFetched: number | null;
}
