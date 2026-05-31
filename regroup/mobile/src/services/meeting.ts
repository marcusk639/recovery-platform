import { functions, firestore, callHttpsFunction } from '../../firebase-setup';
import {
  MeetingSearchInput,
  MeetingVerificationInput,
} from '../entities/Meeting';
import { RatsMeeting } from '../entities/Meeting';
import * as crud from './crud';
import { cloneDeep } from 'lodash';

export const meetingCollection = firestore.collection('meetings');

export async function searchForMeetings(
  searchInput: MeetingSearchInput,
): Promise<RatsMeeting[]> {
  const response = await callHttpsFunction('findMeetings', searchInput);
  return response.data;
}

export async function userIsAtMeeting(locations: MeetingVerificationInput) {
  const response = await functions.httpsCallable('userIsAtMeeting')(locations);
  return response.data;
}

export async function addMeeting(meeting: RatsMeeting) {
  return crud.create<RatsMeeting>(meetingCollection, cloneDeep(meeting));
}

export async function updateMeeting(
  meetingId: string,
  values: Partial<RatsMeeting>,
) {
  return crud.update<RatsMeeting>(meetingCollection, {
    id: meetingId,
    ...values,
  });
}

export async function deleteMeeting(meeting: RatsMeeting) {
  return crud.deleteObject<RatsMeeting>(meetingCollection, meeting);
}
