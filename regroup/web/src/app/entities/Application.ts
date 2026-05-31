import { BaseEntity } from './BaseEntity';

export class HouseApplication extends BaseEntity {}

export interface HouseApplications {
  [id: string]: HouseApplication;
}
