import * as yup from 'yup';
import { BaseEntity } from './BaseEntity';
import { Day, Days } from './Day';
import { Chore } from './Chore';
import { Activity, Guest } from './Guest';

/**
 * Interface for Week entity
 * A Week entity contains a guest's stats for a given week
 */
export default class Week extends BaseEntity {
  id: string;
  houseId: string = '';
  guestId: string = '';
  userId: string = '';
  startDate: string;
  endDate: string;
  primarySupporterId: string = '';
  primarySupporterName: string = '';
  sponsees: string[] = [];
  chore: Chore = new Chore();
  activities: Activity[] = [];
  days: Days;
  step: number | string = 1;
}

export const weekSchema = yup.object().shape({
  guestId: yup.string().notRequired(),
  houseId: yup.string().notRequired(),
  id: yup.string().notRequired(),
  userId: yup.string().notRequired(),
  startDate: yup.string().required(),
  endDate: yup.string().required(),
  primarySupporterId: yup.string().notRequired(),
  chore: yup.string().required('Required').min(1, 'Must choose a chore'),
});
