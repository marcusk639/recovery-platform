import { firestore, auth } from '../../firebase-setup';
import {
  HouseApplication,
  ApplicationStatus,
  ProgramType,
} from '../entities/Application';
import { logException } from '../util/logging';

export type ApplicationInput = {
  applicantName: string;
  applicantEmail: string;
  applicantPhone: string;
  sobrietyDate: string;
  programType: ProgramType;
  currentSituation: string;
  references: string;
};

const applicationsCollection = (houseId: string) =>
  firestore.collection('houses').doc(houseId).collection('applications');

export async function submitApplication(
  houseId: string,
  data: ApplicationInput,
): Promise<string> {
  const currentUser = auth.currentUser;
  if (!currentUser) throw new Error('Must be signed in to apply');

  const appRef = applicationsCollection(houseId).doc();
  const appId = appRef.id;

  const application = {
    id: appId,
    houseId,
    applicantUid: currentUser.uid,
    ...data,
    status: 'pending' as const,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  try {
    await appRef.set(application);
  } catch (error) {
    logException(error);
    throw new Error('Failed to submit application. Please try again.');
  }

  return appId;
}

export async function listHouseApplications(
  houseId: string,
): Promise<HouseApplication[]> {
  try {
    const snap = await applicationsCollection(houseId)
      .orderBy('createdAt', 'desc')
      .get();
    return snap.docs.map(doc => doc.data() as HouseApplication);
  } catch (error) {
    logException(error);
    throw new Error('Failed to load applications.');
  }
}

export async function getMyApplications(): Promise<HouseApplication[]> {
  const currentUser = auth.currentUser;
  if (!currentUser) return [];

  try {
    const snap = await firestore
      .collectionGroup('applications')
      .where('applicantUid', '==', currentUser.uid)
      .get();
    return snap.docs.map(doc => doc.data() as HouseApplication);
  } catch (error) {
    logException(error);
    throw new Error('Failed to load your applications.');
  }
}

export async function updateApplicationStatus(
  houseId: string,
  appId: string,
  status: ApplicationStatus,
  note?: string,
): Promise<void> {
  const currentUser = auth.currentUser;
  if (!currentUser)
    throw new Error('Must be signed in to update application status');

  try {
    await applicationsCollection(houseId)
      .doc(appId)
      .update({
        status,
        operatorNote: note ?? '',
        reviewedAt: new Date().toISOString(),
        reviewedBy: currentUser.uid,
      });
  } catch (error) {
    logException(error);
    throw new Error('Failed to update application status.');
  }
}
