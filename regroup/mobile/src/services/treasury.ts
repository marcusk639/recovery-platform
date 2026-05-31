import { firestore } from '../../firebase-setup';
import { FinancialRecord } from '../entities/oxford/FinancialRecord';
import { logException } from '../util/logging';

function recordsRef(houseId: string) {
  return firestore
    .collection('houses')
    .doc(houseId)
    .collection('financial-records');
}

export async function getFinancialRecords(
  houseId: string,
  limit = 20,
): Promise<FinancialRecord[]> {
  try {
    const snap = await recordsRef(houseId)
      .orderBy('period', 'desc')
      .limit(limit)
      .get();
    return snap.docs.map(d => ({ ...d.data(), id: d.id } as FinancialRecord));
  } catch (error) {
    logException(error);
    throw new Error('Failed to load financial records');
  }
}

export async function getFinancialRecord(
  houseId: string,
  recordId: string,
): Promise<FinancialRecord | null> {
  try {
    const doc = await recordsRef(houseId).doc(recordId).get();
    return doc.exists
      ? ({ ...doc.data(), id: doc.id } as FinancialRecord)
      : null;
  } catch (error) {
    logException(error);
    throw new Error('Failed to load financial record');
  }
}

export async function createFinancialRecord(
  houseId: string,
  record: Omit<FinancialRecord, 'id'>,
): Promise<FinancialRecord> {
  try {
    const ref = recordsRef(houseId).doc();
    const doc: FinancialRecord = { ...record, id: ref.id };
    await ref.set(doc);
    return doc;
  } catch (error) {
    logException(error);
    throw new Error('Failed to create financial record');
  }
}

export async function updateFinancialRecord(
  houseId: string,
  recordId: string,
  data: Partial<FinancialRecord>,
): Promise<void> {
  try {
    await recordsRef(houseId).doc(recordId).update(data);
  } catch (error) {
    logException(error);
    throw new Error('Failed to update financial record');
  }
}

export async function submitForApproval(
  houseId: string,
  recordId: string,
): Promise<void> {
  try {
    await recordsRef(houseId).doc(recordId).update({
      status: 'submitted',
      submittedAt: new Date().toISOString(),
    });
  } catch (error) {
    logException(error);
    throw new Error('Failed to submit record for approval');
  }
}

export async function approveRecord(
  houseId: string,
  recordId: string,
  userId: string,
): Promise<void> {
  try {
    await recordsRef(houseId).doc(recordId).update({
      status: 'approved',
      approvedBy: userId,
      approvedAt: new Date().toISOString(),
    });
  } catch (error) {
    logException(error);
    throw new Error('Failed to approve financial record');
  }
}

export async function rejectRecord(
  houseId: string,
  recordId: string,
  reason: string,
): Promise<void> {
  try {
    await recordsRef(houseId).doc(recordId).update({
      status: 'rejected',
      rejectionReason: reason,
    });
  } catch (error) {
    logException(error);
    throw new Error('Failed to reject financial record');
  }
}

export async function getCurrentWeekRecord(
  houseId: string,
): Promise<FinancialRecord | null> {
  try {
    const now = new Date();
    const day = now.getDay();
    const monday = new Date(now);
    monday.setDate(now.getDate() - (day === 0 ? 6 : day - 1));
    const weekStart = monday.toISOString().slice(0, 10);

    const snap = await recordsRef(houseId)
      .where('period', '==', weekStart)
      .limit(1)
      .get();
    return snap.empty
      ? null
      : ({ ...snap.docs[0].data(), id: snap.docs[0].id } as FinancialRecord);
  } catch (error) {
    logException(error);
    throw new Error('Failed to load current week record');
  }
}

export async function getPreviousWeekRecord(
  houseId: string,
): Promise<FinancialRecord | null> {
  try {
    const now = new Date();
    const day = now.getDay();
    const monday = new Date(now);
    monday.setDate(now.getDate() - (day === 0 ? 6 : day - 1) - 7);
    const weekStart = monday.toISOString().slice(0, 10);

    const snap = await recordsRef(houseId)
      .where('period', '==', weekStart)
      .limit(1)
      .get();
    return snap.empty
      ? null
      : ({ ...snap.docs[0].data(), id: snap.docs[0].id } as FinancialRecord);
  } catch (error) {
    logException(error);
    throw new Error('Failed to load previous week record');
  }
}

export async function getEESIncomeForWeek(
  houseId: string,
  weekStart: string,
): Promise<number> {
  try {
    const snap = await firestore
      .collection('ees-records')
      .where('houseId', '==', houseId)
      .where('weekStart', '==', weekStart)
      .get();
    return snap.docs.reduce((sum, d) => sum + (d.data().amount ?? 0), 0);
  } catch (error) {
    logException(error);
    return 0;
  }
}
