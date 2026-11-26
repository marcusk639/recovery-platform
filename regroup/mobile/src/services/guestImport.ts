import { doc, serverTimestamp, writeBatch } from '@react-native-firebase/firestore';
import { auth, firestore } from '../../firebase-setup';
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

/** A problem with the CSV itself, worded for the operator (P5 Task 17). */
export class GuestCsvError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'GuestCsvError';
  }
}

/**
 * Splits CSV text into records of fields: the RFC 4180 subset a spreadsheet
 * export uses. A field in double quotes may hold commas, line breaks and
 * doubled quotes (""); CRLF and LF both end a record. Blank records are dropped.
 */
function splitCsvRecords(text: string): string[][] {
  const records: string[][] = [];
  let record: string[] = [];
  let field = '';
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (quoted) {
      if (ch === '"' && text[i + 1] === '"') {
        field += '"';
        i++;
      } else if (ch === '"') {
        quoted = false;
      } else {
        field += ch;
      }
    } else if (ch === '"') {
      quoted = true;
    } else if (ch === ',') {
      record.push(field);
      field = '';
    } else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && text[i + 1] === '\n') i++;
      record.push(field);
      records.push(record);
      record = [];
      field = '';
    } else {
      field += ch;
    }
  }
  record.push(field);
  records.push(record);
  return records.filter(r => r.some(v => v.trim() !== ''));
}

export function parseGuestCsv(csvText: string): GuestImportRow[] {
  const lines = splitCsvRecords(csvText);
  if (lines.length < 2) return [];

  const headers = lines[0].map(h => h.trim());
  const missingHeaders = REQUIRED_HEADERS.filter(h => !headers.includes(h));
  if (missingHeaders.length > 0) {
    const plural = missingHeaders.length > 1 ? 's' : '';
    throw new GuestCsvError(`Missing column${plural}: ${missingHeaders.join(', ')}`);
  }

  const rows: GuestImportRow[] = [];
  for (let i = 1; i < lines.length; i++) {
    const values = lines[i].map(v => v.trim());
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
  // The rules require createdBy to be the caller. It is how the server
  // tells a staff-made record from a self-made one when it links records
  // for the same person.
  const createdBy = auth.currentUser?.uid;

  try {
    for (let start = 0; start < rows.length; start += BATCH_LIMIT) {
      const batch = writeBatch(firestore);
      const slice = rows.slice(start, start + BATCH_LIMIT);
      for (const row of slice) {
        const docRef = doc(guestCollection, createGuestId());
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
          // Rent charging starts an imported resident at the next full period: they
          // already lived there, and their balance was entered by hand.
          importedAt: new Date().toISOString(),
          updatedAt: serverTimestamp(),
          ...(createdBy ? { createdBy } : {}),
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
