import { meetingSchema, RatsMeeting } from './Meeting';
import * as yup from 'yup';

interface HoursWorked {
  [jobName: string]: number;
}

export class Day {
  date: string;
  choreCompleted: boolean = false;
  hoursWorked: HoursWorked = {};
  metPrimarySupporter: boolean = false;
  meeting: RatsMeeting[] = [];
  medication: boolean = false;

  static isDay(arg: any): arg is Day {
    return arg.choreCompleted !== undefined;
  }

  constructor(date: string) {
    this.date = date;
  }
}

export const daySchema = yup.object().shape({
  date: yup.string().required(),
  choreCompleted: yup.boolean().required(),
  metPrimarySupporter: yup.boolean().required(),
  meeting: yup
    .array()
    .of(meetingSchema)
    .notRequired(),
  hoursWorked: yup
    .number()
    .integer()
    .min(0, 'Must be no less than 0')
    .max(100, 'Must be less than 100')
    .required('Required')
});

export interface Days {
  [date: string]: Day;
}
