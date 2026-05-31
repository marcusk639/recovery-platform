import { BaseEntity } from './BaseEntity';
import { Location } from './Meeting';

class Job extends BaseEntity {
  employer: string;
  startDate: string;
  endDate: string;
  city: string;
  state: string;
  zip: string;
  street: string;
  lat: number;
  lng: number;
  type: 'school' | 'volunteer' | 'work' | 'seekingWork';
}

export const jobItems = {
  School: 'school',
  Volunteer: 'volunteer',
  Work: 'work',
  'Seeking Work': 'seekingWork'
};

export default Job;
