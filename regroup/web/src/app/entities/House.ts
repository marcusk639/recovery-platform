import * as yup from 'yup';
import SchemaConstants from './SchemaConstants';
import { BaseEntity } from './BaseEntity';
import { Phases, defaultPhases } from './Phase';
import { defaultChores, Chores } from './Chore';
import { Roles } from './Roles';
import { Dispute } from './Dispute';
import { GenderFilter } from './HouseSearch';
import { Issues } from './Issue';
import { HouseApplications } from './Application';
import { Complaints } from './Complaint';
import { Rooms } from './Room';

export type PartialHouseWithId = Partial<House> & { id: string };

export interface AwaitingVerification {
  firstName: string;
  lastName: string;
  userId: string;
}

export interface HouseHealth {
  [weekEndDate: string]: number;
}

export type ManagerSetupType = 'senior-peer' | 'operator-only' | 'external-managers' | 'democratic';

export const HouseActionItems: HouseActionType[] = ['issues', 'applications', 'disputes', 'complaints'];
export type HouseActionType = 'issues' | 'applications' | 'disputes' | 'complaints';

export class House extends BaseEntity {
  id: string;
  timezone: string = ''; // needed for cloud scheduler function
  superAdminId: string = '';
  lat: string | number = '';
  lng: string | number = '';
  adminId: string = '';
  adminIds: string[] = [];
  superAdminIds: string[] = [];
  street: string = '';
  city: string = '';
  country: string = '';
  health: HouseHealth = {};
  name: string = '';
  monthlyRent: number = 0;
  weeklyRent: number = 0;
  currentCapacity: number = 0;
  maximumCapacity: number = 1;
  state: string = '';
  zip: string = '';
  code: string = '';
  avatar: string = '';
  imageUrl: string = '';
  depositsAndFees: string | number = 0;
  certified: boolean = false;
  phoneNumber: string = '';
  rentFrequency: 'weekly' | 'monthly' | 'both' = 'both';
  pendingAdminInvites?: string[] = [];
  pendingGuestInvites?: string[] = [];
  isDemoHouse: boolean = false;
  seniorPeerEmails?: string[] = [];
  managerSetupType: ManagerSetupType = 'operator-only';
  awaitingVerification: AwaitingVerification[] = [];
  chores: Chores = defaultChores;
  phases: Phases = defaultPhases;
  gender: GenderFilter = null;
  disputes: {
    [id: string]: Dispute;
  } = {};
  issues: Issues = {};
  applications: HouseApplications = {};
  complaints: Complaints = {};
  rooms: Rooms = {};
  baths: number = 1;
  wifi: boolean = false;
  rating: number = 3;
}

export const houseSchema = yup.object().shape({
  gender: yup.string().oneOf(['male', 'female', 'non-binary', ''], SchemaConstants.REQUIRED).required(SchemaConstants.REQUIRED),
  maximumCapacity: yup.number().required(SchemaConstants.REQUIRED).max(5000, SchemaConstants.numberMax(5000)).min(0, SchemaConstants.numberMin(0)),
  monthlyRent: yup.number().max(5000, SchemaConstants.numberMax(5000)).min(0, SchemaConstants.numberMin(0)),
  weeklyRent: yup.number().min(0, SchemaConstants.numberMin(0)).max(5000, SchemaConstants.numberMax(5000)),
  phoneNumber: yup.string().required(SchemaConstants.REQUIRED).min(10, SchemaConstants.stringMin(10)).max(14, SchemaConstants.stringMax(15)),
  id: yup.string().required(),
  name: yup.string().required(SchemaConstants.REQUIRED),
});
