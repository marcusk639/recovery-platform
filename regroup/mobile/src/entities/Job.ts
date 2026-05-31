import { BaseEntity } from './BaseEntity';
import { Location } from './Meeting';

class Job extends BaseEntity {
  employer: string = '';
  startDate: string = '';
  endDate: string = '';
  city: string = '';
  state: string = '';
  zip: string = '';
  street: string = '';
  lat: number = 0;
  lng: number = 0;
  type: 'school' | 'volunteer' | 'work' | 'seekingWork' = 'work';
}

export const jobItems = {
  School: 'school',
  Volunteer: 'volunteer',
  Work: 'work',
  'Seeking Work': 'seekingWork',
};

export default Job;
