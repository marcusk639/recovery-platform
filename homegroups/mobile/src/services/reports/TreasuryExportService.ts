import {Share} from 'react-native';

/**
 * A transaction document as returned from Firestore.
 * Matches the top-level `transactions` collection schema.
 */
export interface TransactionExportDocument {
  id: string;
  groupId: string;
  type: 'income' | 'expense';
  category: string;
  amount: number;
  description?: string;
  createdAt: {toDate: () => Date} | number | string;
}

/**
 * Service for exporting treasury transaction data as CSV.
 *
 * Note on file export: `Share.share({ message: csvString })` works for email
 * and clipboard on both iOS and Android. For a proper .csv file attachment,
 * `react-native-fs` would be needed (not currently installed).
 * The Share.share text approach works for email.
 * If a proper file attachment is required, add: yarn add react-native-fs
 * and use RNFS.writeFile to write the CSV then share the file path.
 */
export class TreasuryExportService {
  /**
   * Generates a CSV string from raw transaction data.
   * Fields: Date, Type, Category, Description, Amount
   */
  static generateCSV(transactions: TransactionExportDocument[]): string {
    const header = 'Date,Type,Category,Description,Amount\n';
    const rows = transactions.map(tx => {
      let date: string;
      if (
        tx.createdAt &&
        typeof tx.createdAt === 'object' &&
        'toDate' in tx.createdAt
      ) {
        date = tx.createdAt.toDate().toLocaleDateString('en-US');
      } else if (typeof tx.createdAt === 'number') {
        date = new Date(tx.createdAt).toLocaleDateString('en-US');
      } else if (typeof tx.createdAt === 'string') {
        date = new Date(tx.createdAt).toLocaleDateString('en-US');
      } else {
        date = '';
      }

      const amount =
        tx.type === 'expense'
          ? `-${tx.amount.toFixed(2)}`
          : tx.amount.toFixed(2);
      // Escape commas and quotes in description
      const desc = (tx.description || '').replace(/"/g, '""');
      const escapedDesc = desc.includes(',') ? `"${desc}"` : desc;

      return `${date},${tx.type},${tx.category},${escapedDesc},${amount}`;
    });
    return header + rows.join('\n');
  }

  /**
   * Generates CSV from transactions and shares it via the native Share sheet.
   * On iOS this shares as text; on Android may open share targets.
   * For proper .csv file attachment, react-native-fs is needed.
   */
  static async exportAndShare(
    transactions: TransactionExportDocument[],
    groupName: string,
    periodLabel: string,
  ): Promise<void> {
    const csv = this.generateCSV(transactions);
    const title = `${groupName} Treasury ${periodLabel}.csv`;

    await Share.share({
      title,
      message: csv,
    });
  }
}
