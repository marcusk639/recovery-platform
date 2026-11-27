import {
  doc,
  getDocs,
  query,
  serverTimestamp,
  where,
  writeBatch,
} from '@react-native-firebase/firestore';
import { auth, firestore } from '../../firebase-setup';
import { guestCollection, createGuestId } from './guest';
import { logException } from '../util/logging';
import { MAX_IMPORT_ROWS, normalizeEmail, rowProblem, toIsoDate } from './guestImportRules';

export interface GuestImportRow {
  firstName: string;
  lastName: string;
  email: string;
  sobrietyDate: string;
  drugOfChoice: string;
  phoneNumber?: string;
  moveInDate?: string;
}

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
  if (quoted) {
    throw new GuestCsvError('A quoted field is never closed. Check the quotes in the file.');
  }
  record.push(field);
  records.push(record);
  return records.filter(r => r.some(v => v.trim() !== ''));
}

/** A row the file holds but the import leaves out, and why. */
export interface SkippedGuestRow {
  /** 1 for the first resident row (the header is not counted). */
  row: number;
  reason: string;
}

export interface GuestCsvReport {
  rows: GuestImportRow[];
  skipped: SkippedGuestRow[];
}

/**
 * The residents a CSV holds, and each row it leaves out with the reason
 * (guestImportRules). Throws GuestCsvError for a problem with the whole file.
 */
export function parseGuestCsvReport(csvText: string): GuestCsvReport {
  // Excel's "CSV UTF-8" byte-order mark goes with the header's trim().
  const lines = splitCsvRecords(csvText);
  if (lines.length < 2) return { rows: [], skipped: [] };

  const headers = lines[0].map(h => h.trim());
  const missingHeaders = REQUIRED_HEADERS.filter(h => !headers.includes(h));
  if (missingHeaders.length > 0) {
    const plural = missingHeaders.length > 1 ? 's' : '';
    throw new GuestCsvError(`Missing column${plural}: ${missingHeaders.join(', ')}`);
  }
  const count = lines.length - 1;
  if (count > MAX_IMPORT_ROWS) {
    throw new GuestCsvError(
      `The file has ${count} residents. Import at most ${MAX_IMPORT_ROWS} at a time.`,
    );
  }

  const rows: GuestImportRow[] = [];
  const skipped: SkippedGuestRow[] = [];
  const seenEmails = new Set<string>();
  for (let i = 1; i < lines.length; i++) {
    const values = lines[i].map(v => v.trim());
    const record: Record<string, string> = {};
    headers.forEach((h, idx) => {
      record[h] = values[idx] ?? '';
    });
    const reason = rowProblem(record, seenEmails);
    if (reason) {
      skipped.push({ row: i, reason });
      continue;
    }
    const { firstName, lastName, email, sobrietyDate, drugOfChoice, phoneNumber, moveInDate } =
      record;
    seenEmails.add(normalizeEmail(email));
    rows.push({
      firstName: sanitizeCsvValue(firstName),
      lastName: sanitizeCsvValue(lastName),
      email,
      sobrietyDate: toIsoDate(sobrietyDate) as string,
      drugOfChoice: sanitizeCsvValue(drugOfChoice),
      phoneNumber: phoneNumber ? sanitizeCsvValue(phoneNumber) : undefined,
      moveInDate: moveInDate ? (toIsoDate(moveInDate) as string) : moveInDate,
    });
  }
  return { rows, skipped };
}

/** The importable rows of a CSV (parseGuestCsvReport without the skips). */
export function parseGuestCsv(csvText: string): GuestImportRow[] {
  return parseGuestCsvReport(csvText).rows;
}

const BATCH_LIMIT = 499;

/** The guest record an imported row becomes. */
function importedGuest(row: GuestImportRow, id: string, houseId: string, createdBy?: string) {
  return {
    ...row,
    id,
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
  };
}

export interface GuestImportResult {
  imported: number;
  /**
   * Rows whose email is already on one of the house's guest records, a
   * departed resident's included (so "already on file", not "already
   * residents"). The field name predates that wording.
   */
  alreadyResidents: number;
  /** Rows not written because a batch failed; importing again adds them. */
  failed: number;
}

/**
 * Imports the rows into the house, skipping anyone whose email is already on
 * one of its guest records (current or departed), so running it again after a partial failure
 * adds only what is missing. Batches commit one after another: when one
 * fails, the ones before it stay, and the result says how many did.
 */
export async function importGuests(
  houseId: string,
  rows: GuestImportRow[],
): Promise<GuestImportResult> {
  if (!houseId) throw new Error('houseId is required');
  let existing: Set<string>;
  try {
    const snap = await getDocs(query(guestCollection, where('houseId', '==', houseId)));
    existing = new Set(
      snap.docs.map(d => normalizeEmail(String((d.data() as { email?: unknown }).email ?? ''))),
    );
  } catch (error) {
    logException(error);
    throw new Error("Could not check the house's residents. Please try again.");
  }
  const fresh = rows.filter(r => !existing.has(normalizeEmail(r.email)));
  const result: GuestImportResult = {
    imported: 0,
    alreadyResidents: rows.length - fresh.length,
    failed: 0,
  };
  const createdBy = auth.currentUser?.uid;
  for (let start = 0; start < fresh.length; start += BATCH_LIMIT) {
    const batch = writeBatch(firestore);
    const slice = fresh.slice(start, start + BATCH_LIMIT);
    for (const row of slice) {
      const docRef = doc(guestCollection, createGuestId());
      batch.set(docRef, importedGuest(row, docRef.id, houseId, createdBy));
    }
    try {
      await batch.commit();
      result.imported += slice.length;
    } catch (error) {
      logException(error);
      result.failed = fresh.length - result.imported;
      return result;
    }
  }
  return result;
}

export async function importGuestsFromRows(
  houseId: string,
  rows: GuestImportRow[],
): Promise<number> {
  if (!houseId) throw new Error('houseId is required');
  if (rows.length === 0) return 0;

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
        batch.set(docRef, importedGuest(row, docRef.id, houseId, createdBy));
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
