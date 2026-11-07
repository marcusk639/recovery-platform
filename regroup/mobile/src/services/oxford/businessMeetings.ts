import {
  collection,
  doc,
  getDocs,
  limit as limitTo,
  orderBy,
  query,
  setDoc,
  updateDoc,
} from '@react-native-firebase/firestore';
import { firestore } from '../../../firebase-setup';
import { BusinessMeeting } from '../../entities/oxford/BusinessMeeting';
import { logException } from '../../util/logging';

export async function createBusinessMeeting(
  houseId: string,
  meeting: Omit<BusinessMeeting, 'id'>,
): Promise<BusinessMeeting> {
  try {
    const ref = doc(
      collection(doc(collection(firestore, 'houses'), houseId), 'business-meetings'),
    );

    const newMeeting: BusinessMeeting = {
      ...meeting,
      id: ref.id,
      houseId,
      createdAt: new Date().toISOString(),
    };

    await setDoc(ref, newMeeting);
    return newMeeting;
  } catch (error) {
    logException(error);
    throw new Error('Failed to create business meeting');
  }
}

export async function getBusinessMeetings(
  houseId: string,
): Promise<BusinessMeeting[]> {
  try {
    const snapshot = await getDocs(
      query(
        collection(doc(collection(firestore, 'houses'), houseId), 'business-meetings'),
        orderBy('scheduledDate', 'desc'),
        limitTo(20),
      ),
    );

    return snapshot.docs.map(
      meeting => ({ ...meeting.data(), id: meeting.id } as BusinessMeeting),
    );
  } catch (error) {
    logException(error);
    throw new Error('Failed to load business meetings');
  }
}

export async function updateBusinessMeeting(
  houseId: string,
  meetingId: string,
  update: Partial<BusinessMeeting>,
): Promise<void> {
  try {
    await updateDoc(
      doc(
        collection(doc(collection(firestore, 'houses'), houseId), 'business-meetings'),
        meetingId,
      ),
      update,
    );
  } catch (error) {
    logException(error);
    throw new Error('Failed to update business meeting');
  }
}
