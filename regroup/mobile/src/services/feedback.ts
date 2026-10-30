import {
  collection,
  doc,
  type CollectionReference,
  type FirebaseFirestoreTypes,
} from '@react-native-firebase/firestore';
import { firestore } from '../../firebase-setup';
import * as crud from './crud';
import { Feedback } from '../entities/Feedback';
import { BugReport } from '../entities/BugReport';

// Typed for both APIs while crud still takes the namespaced type (Task 10f).
const bugReportCollection = collection(firestore, 'bugs') as CollectionReference &
  FirebaseFirestoreTypes.CollectionReference;
const feedbackCollection = collection(firestore, 'feedback') as CollectionReference &
  FirebaseFirestoreTypes.CollectionReference;

/**
 * Gets feedback from db and maps them to object of key-value pairs
 * @param house
 */
export async function getFeedback(
  attribute: string,
  value: string | number | boolean | null,
): Promise<{ [id: string]: Feedback }> {
  const result = await crud.getByAttribute<Feedback>(
    feedbackCollection,
    attribute,
    '==',
    value,
  );
  const feedback: Record<string, Feedback> = {};
  const promises: Promise<any>[] = [];
  result.forEach(f => {
    feedback[f.id] = f;
  });
  await Promise.all(promises);
  return feedback;
}

export async function createFeedback(feedback: Feedback): Promise<Feedback> {
  feedback.id = doc(feedbackCollection).id;
  return crud.create<any>(feedbackCollection, feedback, feedback.id);
}

export async function createBugReport(
  bugReport: BugReport,
): Promise<BugReport> {
  bugReport.id = doc(bugReportCollection).id;
  return crud.create<BugReport>(bugReportCollection, bugReport, bugReport.id);
}
