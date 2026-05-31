import * as yup from 'yup';
import { BaseEntity } from './BaseEntity';
import { Roles } from './Roles';
import Job from './Job';
import { createGuestId } from '../services/guest';

export type GuestStatus =
  | 'active'
  | 'inactive'
  | 'expelled'
  | 'discharged'
  | 'archived';

export type Stat =
  | 'meeting'
  | 'medication'
  | 'metPrimarySupporter'
  | 'hoursWorked'
  | 'choreCompleted';
export const stats: Stat[] = [
  'meeting',
  'medication',
  'metPrimarySupporter',
  'hoursWorked',
  'choreCompleted',
];

export type PartialGuestWithId = Partial<Guest> & { id: string };

export class Guest extends BaseEntity {
  id: string = createGuestId();
  userId: string = '';
  houseId: string = '';
  displayName: string = '';
  firstName: string = '';
  lastName: string = '';
  email: string = '';
  avatar?: string;
  phoneNumber?: string;

  // Recovery
  sobrietyDate: string = '';
  drugOfChoice: string = '';
  phase: number | string = 'default';
  step: number = 1;

  // Status
  status: GuestStatus = 'active';
  isAdmin: boolean = false;
  infoEntered: boolean = false;
  hasJob: boolean = false;

  // Financial
  rentOwed: number = 0;
  choreFees: number = 0;
  dailyHabit: number = 0;
  autoPayEnabled?: boolean;

  // Relationships
  supporters: string[] = [];
  primarySupporterId?: string;
  primarySupporterName?: string;
  currentChore?: string;
  jobs: Job[] = [];
  roles?: Roles;

  // Timestamps
  version: number = 0;
  moveInDate?: string;
  moveOutDate?: string;

  // Intake fields
  emergencyContactName?: string;
  emergencyContactPhone?: string;
  emergencyContactRelation?: string;
  insuranceProvider?: string;
  insurancePolicyNumber?: string;
  referringCenterName?: string;
  referringCenterContact?: string;
  referralDate?: string;
  legalStatus?: string; // probation, parole, none
  probationOfficer?: string;
  probationOfficerPhone?: string;
  intakeDate?: string; // ISO date of formal intake
  intakeCompletedBy?: string; // userId who completed intake
  intakeNotes?: string;
  dischargeNotes?: string;
}

export const guestSchema = yup.object().shape({
  id: yup.string().notRequired(),
  houseId: yup.string().notRequired().max(50).min(1),
  email: yup.string().email().max(50).required('Email is required'),
  firstName: yup.string().required('First name is required').min(1).max(50),
  lastName: yup.string().required('Last name is required').min(1).max(50),
  sobrietyDate: yup.string().required('Sobriety date is required'),
  drugOfChoice: yup
    .string()
    .required('Drug of choice is required')
    .min(1)
    .max(50),
  hasJob: yup.boolean().required(),
  phase: yup.string().required(),
  rentOwed: yup
    .number()
    .integer()
    .typeError('Must be a number')
    .default(0)
    .min(0),
  choreFees: yup
    .number()
    .typeError('Must be a number')
    .default(0)
    .integer()
    .min(0),
  dailyHabit: yup
    .number()
    .typeError('Must be a number')
    .required()
    .integer()
    .min(0),
});
