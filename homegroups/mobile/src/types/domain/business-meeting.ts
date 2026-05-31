/**
 * Types specific to business meetings
 */

import {FinancialReport} from './treasury';

export interface BusinessMeeting {
  id: string;
  groupId: string;
  date: Date;
  startTime: string;
  endTime?: string;
  location: string;
  isOnline: boolean;
  onlineLink?: string;
  chair: string;
  secretary: string;
  attendees: string[];
  agenda: AgendaItem[];
  minutes?: string;
  treasuryReport?: FinancialReport;
  decisions: Decision[];
  nextMeetingDate?: Date;
  status: 'scheduled' | 'in_progress' | 'completed' | 'cancelled';
  createdBy: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface AgendaItem {
  id: string;
  title: string;
  description?: string;
  presenter: string;
  type: 'old_business' | 'new_business' | 'report' | 'election' | 'other';
  timeAllotted?: number; // minutes
  order: number;
  status: 'pending' | 'in_progress' | 'completed' | 'tabled';
  notes?: string;
}

export interface Decision {
  id: string;
  topic: string;
  description: string;
  motionBy: string;
  secondBy?: string;
  voteFor: number;
  voteAgainst: number;
  voteAbstain: number;
  passed: boolean;
  implementationDate?: Date;
  responsibleParty?: string;
  notes?: string;
}
