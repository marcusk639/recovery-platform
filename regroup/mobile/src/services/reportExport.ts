import { Platform } from 'react-native';
import { csvCell, recordAmountCsv, recordNetCsv, recordRefundedCsv } from '../util/paymentDisplay';
import { format, parseISO } from 'date-fns';
import { toDateSafe } from '../util/firestore';
import { generatePDF } from 'react-native-html-to-pdf';

import { RentPayment } from './payments';
import { paymentDisplayStatus } from '../util/paymentStatus';

import { Guest } from '../entities/Guest';
import { WeekStats } from '../entities/WeekSummary';
import { PhaseRule } from '../entities/Phase';
import { buildWeeklyReportHtml } from './weeklyReportHtml';

// PDF export is offered on Android only, as before the React Native 0.88
// upgrade. react-native-html-to-pdf 1.3.0 is a TurboModule linked on both
// platforms; enabling iOS is a product decision, not yet verified on a device
// (decision record, Task 6). Callers check isPDFExportAvailable() first.
export function isPDFExportAvailable(): boolean {
  return Platform.OS !== 'ios';
}

/**
 * Generates a PDF compliance report for a guest's week and returns the file path.
 */
export async function exportWeeklyReportPDF(
  guest: Guest,
  stats: WeekStats,
  weekStart: string,
  phaseRules: PhaseRule,
): Promise<string> {
  const html = buildWeeklyReportHtml(guest, stats, weekStart, phaseRules);

  const options = {
    html,
    fileName: `compliance_${guest.id}_${weekStart}`,
    directory: 'Documents',
  };

  if (!isPDFExportAvailable()) {
    throw new Error(
      'PDF export is temporarily unavailable on iOS. Please try again from the web or Android app.',
    );
  }

  // 1.x's named generatePDF takes the same { html, fileName, directory } as
  // 0.12's default `.convert`.
  const file = await generatePDF(options);
  return file.filePath;
}

// ─── CSV Export ───────────────────────────────────────────────────────────────

// Quotes and formula-guards every text cell (see csvCell).
const escapeCsvField = csvCell;

/**
 * A payment's `createdAt` as yyyy-MM-dd, or '' when it can't be read. Firestore
 * records carry a Timestamp (#168); the callables return ISO strings, parsed as
 * before so a date-only value stays on its local day.
 */
function paymentDate(createdAt: unknown): string {
  if (!createdAt) {
    return '';
  }
  const date = typeof createdAt === 'string' ? parseISO(createdAt) : toDateSafe(createdAt);
  return date && !Number.isNaN(date.getTime()) ? format(date, 'yyyy-MM-dd') : '';
}

/**
 * Generates a CSV string for a payment history export.
 * guestNames maps guestId → display name for the name column.
 */
export function exportPaymentHistoryCSV(
  payments: RentPayment[],
  guestNames: Record<string, string>,
): string {
  const header = ['Date', 'Guest', 'Amount ($)', 'Refunded ($)', 'Net ($)', 'Status', 'Description'].join(',');
  const rows = payments.map((p) => {
    const date = paymentDate(p.createdAt);
    const guest = escapeCsvField(guestNames[p.guestId] ?? p.guestId);
    const amount = recordAmountCsv(p);
    const refunded = recordRefundedCsv(p);
    const net = recordNetCsv(p);
    const status = escapeCsvField(paymentDisplayStatus(p).label);
    const description = escapeCsvField(p.description ?? '');
    return [date, guest, amount, refunded, net, status, description].join(',');
  });
  return [header, ...rows].join('\n');
}

export interface EESRecord {
  id: string;
  guestId: string;
  type: string;
  amount: number;
  date: string;
  notes?: string;
}

/**
 * Generates a CSV string for an EES (Emergency Expense Sharing) export.
 */
export function exportEESHistoryCSV(
  records: EESRecord[],
  guestNames: Record<string, string>,
): string {
  const header = ['Date', 'Guest', 'Type', 'Amount ($)', 'Notes'].join(',');
  const rows = records.map((r) => {
    const date = r.date ? format(parseISO(r.date), 'yyyy-MM-dd') : '';
    const guest = escapeCsvField(guestNames[r.guestId] ?? r.guestId);
    const type = escapeCsvField(r.type);
    const amount = String(r.amount ?? '');
    const notes = escapeCsvField(r.notes ?? '');
    return [date, guest, type, amount, notes].join(',');
  });
  return [header, ...rows].join('\n');
}
