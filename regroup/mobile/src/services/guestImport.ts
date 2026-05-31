import FirebaseFirestore from '@react-native-firebase/firestore';
import { firestore } from '../../firebase-setup';
import { guestCollection, createGuestId } from './guest';
import { logException } from '../util/logging';

export interface GuestImportRow {
  firstName: string;
  lastName: string;
  email: string;
  sobrietyDate: string;
  drugOfChoice: string;
  phoneNumber?: string;
  moveInDate?: string;
}

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const FORMULA_PREFIX = /^[=+\-@]/;

function sanitizeCsvValue(val: string): string {
  return FORMULA_PREFIX.test(val) ? `'${val}` : val;
}

const REQUIRED_HEADERS = [
  'firstName',
  'lastName',
  'email',
  'sobrietyDate',
  'drugOfChoice',
];

export function parseGuestCsv(csvText: string): GuestImportRow[] {
  const lines = csvText.trim().split('\n');
  if (lines.length < 2) return [];

  const headers = lines[0].split(',').map(h => h.trim());
  const missingHeaders = REQUIRED_HEADERS.filter(h => !headers.includes(h));
  if (missingHeaders.length > 0) {
    throw new Error(
      `CSV is missing required columns: ${missingHeaders.join(', ')}`,
    );
  }

  const rows: GuestImportRow[] = [];
  for (let i = 1; i < lines.length; i++) {
    const values = lines[i].split(',').map(v => v.trim());
    const record: Record<string, string> = {};
    headers.forEach((h, idx) => {
      record[h] = values[idx] ?? '';
    });

    const {
      firstName,
      lastName,
      email,
      sobrietyDate,
      drugOfChoice,
      phoneNumber,
      moveInDate,
    } = record;

    if (!firstName || !lastName || !email || !sobrietyDate || !drugOfChoice) {
      continue;
    }
    if (!EMAIL_REGEX.test(email)) continue;

    rows.push({
      firstName: sanitizeCsvValue(firstName),
      lastName: sanitizeCsvValue(lastName),
      email,
      sobrietyDate,
      drugOfChoice: sanitizeCsvValue(drugOfChoice),
      phoneNumber: phoneNumber ? sanitizeCsvValue(phoneNumber) : undefined,
      moveInDate,
    });
  }
  return rows;
}

export async function importGuestsFromRows(
  houseId: string,
  rows: GuestImportRow[],
): Promise<number> {
  if (!houseId) throw new Error('houseId is required');
  if (rows.length === 0) return 0;

  const BATCH_LIMIT = 499;
  let imported = 0;

  try {
    for (let start = 0; start < rows.length; start += BATCH_LIMIT) {
      const batch = firestore.batch();
      const slice = rows.slice(start, start + BATCH_LIMIT);
      for (const row of slice) {
        const docRef = guestCollection.doc(createGuestId());
        batch.set(docRef, {
          ...row,
          id: docRef.id,
          houseId,
          displayName: `${row.firstName} ${row.lastName}`,
          status: 'active',
          isAdmin: false,
          infoEntered: false,
          hasJob: false,
          rentOwed: 0,
          choreFees: 0,
          dailyHabit: 0,
          supporters: [],
          jobs: [],
          version: 0,
          phase: 'default',
          step: 1,
          createdAt: new Date().toISOString(),
          updatedAt: FirebaseFirestore.FieldValue.serverTimestamp(),
        });
      }
      await batch.commit();
      imported += slice.length;
    }
    return imported;
  } catch (error) {
    logException(error);
    throw new Error(
      'Guest import failed. Please check your CSV and try again.',
    );
  }
}
