import { firestore } from '../../firebase-setup';
import * as crud from './crud';
import { Feedback } from '../entities/Feedback';
import { BugReport } from '../entities/BugReport';

const bugReportCollection = firestore.collection('bugs');
const feedbackCollection = firestore.collection('feedback');

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
  feedback.id = feedbackCollection.doc().id;
  return crud.create<any>(feedbackCollection, feedback, feedback.id);
}

export async function createBugReport(
  bugReport: BugReport,
): Promise<BugReport> {
  bugReport.id = bugReportCollection.doc().id;
  return crud.create<BugReport>(bugReportCollection, bugReport, bugReport.id);
}
