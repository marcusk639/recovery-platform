import { firestore } from '../../firebase-setup';
import { DrugTest } from '../entities/DrugTest';
import { logException } from '../util/logging';

export const drugTestCollection = firestore.collection('drug-tests');

export async function logDrugTest(
  test: Omit<DrugTest, 'id' | 'createdAt' | 'escalationTriggered'>,
): Promise<DrugTest> {
  try {
    const ref = drugTestCollection.doc();
    const record: DrugTest = {
      ...test,
      id: ref.id,
      escalationTriggered:
        test.result === 'positive' || test.result === 'refused',
      createdAt: new Date().toISOString(),
    };
    await ref.set(record);
    return record;
  } catch (error) {
    logException(error);
    throw new Error('Failed to log drug test result');
  }
}

export async function getDrugTestsForGuest(
  guestId: string,
  limit = 50,
): Promise<DrugTest[]> {
  try {
    const snapshot = await drugTestCollection
      .where('guestId', '==', guestId)
      .orderBy('testDate', 'desc')
      .limit(limit)
      .get();
    return snapshot.docs.map(doc => doc.data() as DrugTest);
  } catch (error) {
    logException(error);
    throw new Error('Failed to fetch drug test history');
  }
}

export async function getDrugTestsForHouse(
  houseId: string,
  limit = 100,
): Promise<DrugTest[]> {
  try {
    const snapshot = await drugTestCollection
      .where('houseId', '==', houseId)
      .orderBy('testDate', 'desc')
      .limit(limit)
      .get();
    return snapshot.docs.map(doc => doc.data() as DrugTest);
  } catch (error) {
    logException(error);
    throw new Error('Failed to fetch house drug tests');
  }
}

export async function getPositiveTestCount(
  guestId: string,
  sinceDays = 90,
): Promise<number> {
  try {
    const since = new Date();
    since.setDate(since.getDate() - sinceDays);
    const snapshot = await drugTestCollection
      .where('guestId', '==', guestId)
      .where('result', 'in', ['positive', 'refused'])
      .where('testDate', '>=', since.toISOString())
      .get();
    return snapshot.size;
  } catch (error) {
    logException(error);
    throw new Error('Failed to count positive tests');
  }
}
