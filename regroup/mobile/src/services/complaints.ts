import * as crud from './crud';
import { firestore } from '../../firebase-setup';
import { House } from '../entities/House';
import cloneDeep from 'lodash/cloneDeep';
import { Complaint } from '../entities/Complaint';

const complaintsCollection = firestore.collection('complaints');
const houseCollection = firestore.collection('houses');

export const createComplaint = (complaint: Complaint) => {
  return crud.create<Complaint>(complaintsCollection, complaint, complaint.id);
};

export const removeComplaint = async (_house: House, complaint: Complaint) => {
  const batch = firestore.batch();
  const complaints = cloneDeep(_house.complaints);
  delete complaints[complaint.id];
  const house: House = { ..._house, complaints: { ...complaints } };
  batch.set(complaintsCollection.doc(complaint.id), complaint);
  batch.update(houseCollection.doc(house.id), house);
  await batch.commit();
  return house;
};
