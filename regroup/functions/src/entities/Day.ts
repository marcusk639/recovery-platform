import { RatsMeeting } from './Meeting';

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

  static isDay(arg: unknown): arg is Day {
    return typeof arg === 'object' && arg !== null && 'choreCompleted' in arg;
  }

  constructor(date: string) {
    this.date = date;
  }
}
