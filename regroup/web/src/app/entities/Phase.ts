import moment from 'moment';

const defaultCurfew = moment()
  .hour(22)
  .minute(0)
  .format('HH:mm')
  .toString();

export class Curfew {
  required: boolean = true;
  times: {
    sunday: string;
    monday: string;
    tuesday: string;
    wednesday: string;
    thursday: string;
    friday: string;
    saturday: string;
  } = {
    sunday: '',
    monday: '',
    tuesday: '',
    wednesday: '',
    thursday: '',
    friday: '',
    saturday: ''
  };

  constructor(defaultTime?: string, weekday?: string, weekend?: string) {
    this.times = {
      sunday: weekday || defaultTime || defaultCurfew,
      monday: weekday || defaultTime || defaultCurfew,
      tuesday: weekday || defaultTime || defaultCurfew,
      wednesday: weekday || defaultTime || defaultCurfew,
      thursday: weekday || defaultTime || defaultCurfew,
      friday: weekend || defaultTime || defaultCurfew,
      saturday: weekend || defaultTime || defaultCurfew
    };
  }
}

export class PhaseRule {
  meetings: number = 0;
  curfew?: Curfew = new Curfew();
  nightsOutAllowed: number = 0;
  supporter: boolean = true;
  work: number = 0;
  chore: boolean = true;
  medications: boolean = false; // TODO: Implement
}

export const DEFAULT_PHASE = 'Default';
export class PhaseConfiguration {
  name: string = DEFAULT_PHASE;
  order: number = 1;
  rules: PhaseRule = new PhaseRule();
}

export interface Phases {
  [name: string]: PhaseConfiguration;
}

export const defaultPhases: Phases = { [DEFAULT_PHASE]: new PhaseConfiguration() };

export type PhaseConfigType = 'basic' | 'moderate' | 'advanced' | 'custom';
