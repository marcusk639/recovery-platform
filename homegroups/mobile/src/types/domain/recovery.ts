/**
 * Types specific to recovery-related concepts
 */

export interface SobrietyMetrics {
  years: number;
  months: number;
  days: number;
  totalDays: number;
  nextMilestone: number; // Next year milestone
  daysUntilNextMilestone: number;
}

export interface RecoveryCelebration {
  type: 'sobriety' | 'birthday' | 'group_anniversary';
  userId?: string;
  userName: string;
  date: Date;
  years: number;
  groupId?: string;
  message?: string;
  attendees?: string[]; // Array of user IDs
  comments?: Comment[];
}

export interface Comment {
  id: string;
  userId: string;
  userName: string;
  text: string;
  createdAt: Date;
}

export enum MeetingFormat {
  // AA Meeting formats
  OPEN = 'O',
  CLOSED = 'C',
  DISCUSSION = 'D',
  SPEAKER = 'S',
  BIG_BOOK = 'BB',
  STEP_STUDY = 'ST',
  MEDITATION = 'M',
  MENS = 'MN',
  WOMENS = 'W',
  LGBTQ = 'LG',
  YOUNG_PEOPLE = 'YP',
  BEGINNERS = 'BE',

  // NA Meeting formats
  BASIC_TEXT = 'BT',
  CANDLELIGHT = 'CAN',
  CHILDREN_WELCOME = 'CW',
  LITERATURE_STUDY = 'LIT',
  NEWCOMER = 'NC',
  QUESTION_ANSWER = 'QA',
  STEP_WORKING_GUIDE = 'SWG',
  TRADITIONS_STUDY = 'TRAD',
  WHEELCHAIR = 'WC',

  // Generic formats
  ONLINE = 'ONL',
  HYBRID = 'HYB',
  IN_PERSON = 'IP',
}

export interface Service {
  id: string;
  name: string;
  description: string;
  commitment_length: number; // in months
  requirements?: string;
  user_id?: string;
  user_name?: string;
  start_date?: Date;
  end_date?: Date;
  group_id: string;
  is_filled: boolean;
}
