import RNHTMLtoPDF from 'react-native-html-to-pdf';
import {Share, Platform} from 'react-native';
import {FinancialReport} from '../../types/domain/treasury';
import {format} from 'date-fns';

/**
 * Service for generating and sharing treasury reports
 */
export class TreasuryReportService {
  /**
   * Generate HTML content for the treasury report
   */
  static generateReportHTML(
    report: Omit<FinancialReport, 'id' | 'createdBy' | 'createdAt'>,
    groupName: string,
    treasurerName?: string,
  ): string {
    const formatCurrency = (amount: number) =>
      `$${Math.abs(amount).toFixed(2)}`;
    const formatDate = (date: Date) => format(date, 'MMM d, yyyy');

    // Generate income breakdown rows
    const incomeRows = Object.entries(report.incomeByCategory || {})
      .filter(([_, amount]) => amount > 0)
      .map(
        ([category, amount]) => `
        <tr>
          <td style="padding: 8px 16px;">${category}</td>
          <td style="padding: 8px 16px; text-align: right; color: #4CAF50;">${formatCurrency(
            amount as number,
          )}</td>
        </tr>
      `,
      )
      .join('');

    // Generate expense breakdown rows
    const expenseRows = Object.entries(report.expensesByCategory || {})
      .filter(([_, amount]) => amount > 0)
      .map(
        ([category, amount]) => `
        <tr>
          <td style="padding: 8px 16px;">${category}</td>
          <td style="padding: 8px 16px; text-align: right; color: #F44336;">${formatCurrency(
            amount as number,
          )}</td>
        </tr>
      `,
      )
      .join('');

    // Generate transaction rows
    const transactionRows = report.transactions
      .sort(
        (a, b) => (a.createdAt?.getTime() || 0) - (b.createdAt?.getTime() || 0),
      )
      .map(
        tx => `
        <tr>
          <td style="padding: 8px 12px;">${
            tx.createdAt ? formatDate(tx.createdAt) : 'N/A'
          }</td>
          <td style="padding: 8px 12px;">${tx.category}</td>
          <td style="padding: 8px 12px;">${tx.description || '-'}</td>
          <td style="padding: 8px 12px; text-align: right; color: ${
            tx.type === 'income' ? '#4CAF50' : '#F44336'
          };">
            ${tx.type === 'income' ? '+' : '-'}${formatCurrency(tx.amount)}
          </td>
        </tr>
      `,
      )
      .join('');

    return `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <style>
          body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;
            margin: 0;
            padding: 20px;
            color: #212121;
            background-color: #ffffff;
          }
          .header {
            text-align: center;
            margin-bottom: 24px;
            padding-bottom: 16px;
            border-bottom: 2px solid #1976D2;
          }
          .header h1 {
            color: #1976D2;
            margin: 0 0 8px 0;
            font-size: 24px;
          }
          .header .period {
            color: #757575;
            font-size: 14px;
          }
          .section {
            margin-bottom: 24px;
          }
          .section-title {
            font-size: 16px;
            font-weight: bold;
            color: #1976D2;
            margin-bottom: 12px;
            padding-bottom: 4px;
            border-bottom: 1px solid #E0E0E0;
          }
          .summary-grid {
            display: flex;
            flex-wrap: wrap;
            gap: 16px;
            margin-bottom: 16px;
          }
          .summary-item {
            flex: 1;
            min-width: 140px;
            background: #F5F5F5;
            padding: 12px;
            border-radius: 8px;
          }
          .summary-label {
            font-size: 12px;
            color: #757575;
            margin-bottom: 4px;
          }
          .summary-value {
            font-size: 18px;
            font-weight: bold;
          }
          .summary-value.income { color: #4CAF50; }
          .summary-value.expense { color: #F44336; }
          table {
            width: 100%;
            border-collapse: collapse;
            font-size: 14px;
          }
          thead {
            background: #F5F5F5;
          }
          th {
            padding: 10px 12px;
            text-align: left;
            font-weight: 600;
            color: #424242;
          }
          th:last-child {
            text-align: right;
          }
          tbody tr {
            border-bottom: 1px solid #E0E0E0;
          }
          tbody tr:last-child {
            border-bottom: none;
          }
          .footer {
            margin-top: 32px;
            padding-top: 16px;
            border-top: 1px solid #E0E0E0;
            font-size: 12px;
            color: #9E9E9E;
            text-align: center;
          }
          .no-data {
            color: #9E9E9E;
            font-style: italic;
            padding: 16px;
            text-align: center;
          }
        </style>
      </head>
      <body>
        <div class="header">
          <h1>${groupName}</h1>
          <div class="period">Treasury Report</div>
          <div class="period">${formatDate(report.startDate)} - ${formatDate(
      report.endDate,
    )}</div>
        </div>

        <div class="section">
          <div class="section-title">Summary</div>
          <div class="summary-grid">
            <div class="summary-item">
              <div class="summary-label">Starting Balance</div>
              <div class="summary-value">${formatCurrency(
                report.startingBalance,
              )}</div>
            </div>
            <div class="summary-item">
              <div class="summary-label">Total Income</div>
              <div class="summary-value income">+${formatCurrency(
                report.totalIncome,
              )}</div>
            </div>
            <div class="summary-item">
              <div class="summary-label">Total Expenses</div>
              <div class="summary-value expense">-${formatCurrency(
                report.totalExpenses,
              )}</div>
            </div>
            <div class="summary-item">
              <div class="summary-label">Ending Balance</div>
              <div class="summary-value">${formatCurrency(
                report.endingBalance,
              )}</div>
            </div>
          </div>
          <div class="summary-grid">
            <div class="summary-item">
              <div class="summary-label">Prudent Reserve</div>
              <div class="summary-value">${formatCurrency(
                report.prudentReserve,
              )}</div>
            </div>
            <div class="summary-item">
              <div class="summary-label">Available Funds</div>
              <div class="summary-value ${
                report.endingBalance - report.prudentReserve >= 0
                  ? 'income'
                  : 'expense'
              }">
                ${formatCurrency(report.endingBalance - report.prudentReserve)}
              </div>
            </div>
          </div>
        </div>

        ${
          incomeRows
            ? `
        <div class="section">
          <div class="section-title">Income Breakdown</div>
          <table>
            <thead>
              <tr>
                <th>Category</th>
                <th style="text-align: right;">Amount</th>
              </tr>
            </thead>
            <tbody>
              ${incomeRows}
            </tbody>
          </table>
        </div>
        `
            : ''
        }

        ${
          expenseRows
            ? `
        <div class="section">
          <div class="section-title">Expense Breakdown</div>
          <table>
            <thead>
              <tr>
                <th>Category</th>
                <th style="text-align: right;">Amount</th>
              </tr>
            </thead>
            <tbody>
              ${expenseRows}
            </tbody>
          </table>
        </div>
        `
            : ''
        }

        <div class="section">
          <div class="section-title">Transactions</div>
          ${
            transactionRows
              ? `
          <table>
            <thead>
              <tr>
                <th>Date</th>
                <th>Category</th>
                <th>Description</th>
                <th style="text-align: right;">Amount</th>
              </tr>
            </thead>
            <tbody>
              ${transactionRows}
            </tbody>
          </table>
          `
              : '<div class="no-data">No transactions during this period</div>'
          }
        </div>

        <div class="footer">
          <p>Report generated: ${format(new Date(), 'MMM d, yyyy h:mm a')}</p>
          ${treasurerName ? `<p>Generated by: ${treasurerName}</p>` : ''}
        </div>
      </body>
      </html>
    `;
  }

  /**
   * Generate a PDF file from the report
   */
  static async generatePDF(
    report: Omit<FinancialReport, 'id' | 'createdBy' | 'createdAt'>,
    groupName: string,
    treasurerName?: string,
  ): Promise<string> {
    try {
      const html = TreasuryReportService.generateReportHTML(
        report,
        groupName,
        treasurerName,
      );

      const fileName = `${groupName.replace(
        /[^a-zA-Z0-9]/g,
        '_',
      )}_Treasury_Report_${format(report.startDate, 'yyyy-MM')}`;

      const options = {
        html,
        fileName,
        directory: Platform.OS === 'ios' ? 'Documents' : 'Download',
      };

      const file = await RNHTMLtoPDF.convert(options);

      if (!file.filePath) {
        throw new Error('Failed to generate PDF');
      }

      return file.filePath;
    } catch (error) {
      console.error('Error generating PDF:', error);
      throw error;
    }
  }

  /**
   * Share the report as plain text
   */
  static async shareAsText(
    report: Omit<FinancialReport, 'id' | 'createdBy' | 'createdAt'>,
    groupName: string,
  ): Promise<void> {
    const formatCurrency = (amount: number) =>
      `$${Math.abs(amount).toFixed(2)}`;
    const formatDate = (date: Date) => format(date, 'MMM d, yyyy');

    let message = `${groupName} TREASURY REPORT\n`;
    message += `${formatDate(report.startDate)} - ${formatDate(
      report.endDate,
    )}\n`;
    message += `${'─'.repeat(40)}\n\n`;

    message += `SUMMARY\n`;
    message += `Starting Balance: ${formatCurrency(report.startingBalance)}\n`;
    message += `Total Income: +${formatCurrency(report.totalIncome)}\n`;
    message += `Total Expenses: -${formatCurrency(report.totalExpenses)}\n`;
    message += `Ending Balance: ${formatCurrency(report.endingBalance)}\n`;
    message += `Prudent Reserve: ${formatCurrency(report.prudentReserve)}\n`;
    message += `Available Funds: ${formatCurrency(
      report.endingBalance - report.prudentReserve,
    )}\n\n`;

    const incomeCategories = Object.entries(report.incomeByCategory || {});
    if (incomeCategories.length > 0) {
      message += `INCOME BREAKDOWN\n`;
      incomeCategories.forEach(([category, amount]) => {
        message += `  ${category}: ${formatCurrency(amount as number)}\n`;
      });
      message += '\n';
    }

    const expenseCategories = Object.entries(report.expensesByCategory || {});
    if (expenseCategories.length > 0) {
      message += `EXPENSE BREAKDOWN\n`;
      expenseCategories.forEach(([category, amount]) => {
        message += `  ${category}: ${formatCurrency(amount as number)}\n`;
      });
      message += '\n';
    }

    message += `${'─'.repeat(40)}\n`;
    message += `Report generated: ${format(
      new Date(),
      'MMM d, yyyy h:mm a',
    )}\n`;

    try {
      await Share.share({
        message,
        title: `${groupName} Treasury Report`,
      });
    } catch (error) {
      console.error('Error sharing report:', error);
      throw error;
    }
  }

  /**
   * Share the report as PDF
   */
  static async shareAsPDF(
    report: Omit<FinancialReport, 'id' | 'createdBy' | 'createdAt'>,
    groupName: string,
    treasurerName?: string,
  ): Promise<void> {
    try {
      const filePath = await TreasuryReportService.generatePDF(
        report,
        groupName,
        treasurerName,
      );

      await Share.share({
        url: Platform.OS === 'ios' ? filePath : `file://${filePath}`,
        title: `${groupName} Treasury Report`,
      });
    } catch (error) {
      console.error('Error sharing PDF:', error);
      throw error;
    }
  }
}
