import * as yup from 'yup';
import moment from 'moment';
import Week, { weekSchema } from './Week';
import SchemaConstants from './SchemaConstants';
import { BaseEntity } from './BaseEntity';
import { Roles } from './Roles';
import { RatsMeeting } from './Meeting';
import Job from './Job';
import uuid from 'uuid/v4';

export type Stat = 'meeting' | 'medication' | 'metPrimarySupporter' | 'hoursWorked' | 'choreCompleted';
export const stats: Stat[] = ['meeting', 'medication', 'metPrimarySupporter', 'hoursWorked', 'choreCompleted'];

export type ActivityType =
  | 'dispute'
  | 'payment'
  | 'chore'
  | 'meeting'
  | 'supporter'
  | 'work'
  | 'medication'
  | 'metPrimarySupporter'
  | 'hoursWorked'
  | 'choreCompleted'
  | 'all'
  | '';

export class Activity {
  type: ActivityType;
  id: string;
  guest: string;
  name: string;
  date: string;
  message: string;
  underDispute: number = 0;
  disputeResult: 'none' | 'success' | 'fail' = 'none';
  meeting?: RatsMeeting;
  disputeId: string = '';
  createdDate: string;
  jobName: string;
  [key: string]: any;
}

export type PartialGuestWithId = Partial<Guest> & { id: string };

/**
 * TODO: UPDATE GUEST SCHEMA
 */
export class Guest extends BaseEntity {
  id: string = '';
  userId: string = '';
  houseId: string = '';
  isAdmin: boolean = false;
  rentOwed: number = 0;
  choreFees: number = 0;
  dailyHabit: number = 0;
  drugOfChoice: string = '';
  email: string = '';
  firstName: string = '';
  hasJob: boolean = false;
  lastName: string = '';
  sobrietyDate: string = '';
  phase: number | string = 'default';
  avatar: string;
  supporters: string[] = [];
  roles: Roles;
  currentWeek: Week;
  previousWeek: Week;
  phoneNumber: string;
  infoEntered: boolean = false;
  jobs: Job[] = [];
  createdDate = '';
}

export const guestSchema = yup.object().shape({
  currentWeek: weekSchema,
  previousWeek: weekSchema,
  id: yup.string().notRequired(),
  houseId: yup.string().notRequired().max(50, SchemaConstants.stringMax(50)).min(1, SchemaConstants.stringMin(1)),
  rentOwed: yup.number().typeError(SchemaConstants.NUMBER).default(0).notRequired().min(0, SchemaConstants.numberMin(0)),
  choreFees: yup
    .number()
    .typeError(SchemaConstants.NUMBER)
    .notRequired()
    .default(0)
    .integer(SchemaConstants.INTEGER)
    .min(0, SchemaConstants.numberMin(0)),
  dailyHabit: yup
    .number()
    .typeError(SchemaConstants.NUMBER)
    .required(SchemaConstants.REQUIRED)
    .integer(SchemaConstants.INTEGER)
    .min(0, SchemaConstants.numberMin(0)),
  drugOfChoice: yup.string().required(SchemaConstants.REQUIRED).min(1, SchemaConstants.stringMin(1)).max(50, SchemaConstants.stringMax(50)),
  email: yup.string().email(SchemaConstants.EMAIL).max(50, SchemaConstants.stringMax(50)).required(SchemaConstants.REQUIRED),
  firstName: yup.string().required(SchemaConstants.REQUIRED).min(1, SchemaConstants.stringMin(0)).max(50, SchemaConstants.stringMax(50)),
  lastName: yup.string().required(SchemaConstants.REQUIRED).min(1, SchemaConstants.stringMin(0)).max(50, SchemaConstants.stringMax(50)),
  sobrietyDate: yup
    .string()
    .test('Maximum date', 'error.no.future.date', (value) => !moment(value).isAfter(moment(), 'day'))
    .required(SchemaConstants.REQUIRED),
  hasJob: yup.boolean().required(SchemaConstants.REQUIRED),
  phase: yup.string().required(SchemaConstants.REQUIRED),
});
