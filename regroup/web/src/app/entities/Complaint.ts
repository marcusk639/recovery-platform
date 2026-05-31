import { BaseEntity } from './BaseEntity';

export class Complaint extends BaseEntity {
  description: string;
  // id of the complainer
  plaintiff: string;
  plaintiffType: 'guest' | 'admin' | 'superAdmin' | 'supporter' | 'anonymous';
  reply: string;
  createdDate: string = '';
  houseId: string;
}

export interface Complaints {
  [id: string]: Complaint;
}
