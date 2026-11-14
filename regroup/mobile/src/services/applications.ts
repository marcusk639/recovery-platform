import {
  collection,
  collectionGroup,
  doc,
  getDocs,
  orderBy,
  query,
  setDoc,
  updateDoc,
  where,
} from '@react-native-firebase/firestore';
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
  collection(doc(collection(firestore, 'houses'), houseId), 'applications');

export async function submitApplication(
  houseId: string,
  data: ApplicationInput,
): Promise<string> {
  const currentUser = auth.currentUser;
  if (!currentUser) throw new Error('Must be signed in to apply');

  const appRef = doc(applicationsCollection(houseId));
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
    await setDoc(appRef, application);
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
    const snap = await getDocs(query(applicationsCollection(houseId), orderBy('createdAt', 'desc')));
    return snap.docs.map(application => application.data() as HouseApplication);
  } catch (error) {
    logException(error);
    throw new Error('Failed to load applications.');
  }
}

export async function getMyApplications(): Promise<HouseApplication[]> {
  const currentUser = auth.currentUser;
  if (!currentUser) return [];

  try {
    const snap = await getDocs(
      query(collectionGroup(firestore, 'applications'), where('applicantUid', '==', currentUser.uid)),
    );
    return snap.docs.map(application => application.data() as HouseApplication);
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
    await updateDoc(doc(applicationsCollection(houseId), appId), {
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
