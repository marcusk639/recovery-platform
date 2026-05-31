import { firestore } from '../../../firebase-setup';
import { BusinessMeeting } from '../../entities/oxford/BusinessMeeting';
import { logException } from '../../util/logging';

export async function createBusinessMeeting(
  houseId: string,
  meeting: Omit<BusinessMeeting, 'id'>,
): Promise<BusinessMeeting> {
  try {
    const ref = firestore
      .collection('houses')
      .doc(houseId)
      .collection('business-meetings')
      .doc();

    const newMeeting: BusinessMeeting = {
      ...meeting,
      id: ref.id,
      houseId,
      createdAt: new Date().toISOString(),
    };

    await ref.set(newMeeting);
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
    const snapshot = await firestore
      .collection('houses')
      .doc(houseId)
      .collection('business-meetings')
      .orderBy('scheduledDate', 'desc')
      .limit(20)
      .get();

    return snapshot.docs.map(
      doc => ({ ...doc.data(), id: doc.id } as BusinessMeeting),
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
    await firestore
      .collection('houses')
      .doc(houseId)
      .collection('business-meetings')
      .doc(meetingId)
      .update(update);
  } catch (error) {
    logException(error);
    throw new Error('Failed to update business meeting');
  }
}
