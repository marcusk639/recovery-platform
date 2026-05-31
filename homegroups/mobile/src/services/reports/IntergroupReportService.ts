import RNHTMLtoPDF from 'react-native-html-to-pdf';
import {Share, Platform} from 'react-native';
import {IntergroupReportDocument} from '../../types/schema';
import {format} from 'date-fns';

/**
 * Service for generating and sharing intergroup/district monthly reports as PDF
 */
export class IntergroupReportService {
  static generateReportHTML(report: IntergroupReportDocument): string {
    const formatMonth = (reportMonth: string): string => {
      try {
        const [year, month] = reportMonth.split('-').map(Number);
        return format(new Date(year, month - 1, 1), 'MMMM yyyy');
      } catch {
        return reportMonth;
      }
    };

    const monthLabel = formatMonth(report.reportMonth);

    const officerRows =
      report.officers && report.officers.length > 0
        ? report.officers
            .map(
              o => `
          <tr>
            <td style="padding: 6px 12px; color: #616161;">${o.positionName.replace(/</g, '&lt;')}</td>
            <td style="padding: 6px 12px; font-weight: 600;">${o.holderName.replace(/</g, '&lt;')}</td>
          </tr>
        `,
            )
            .join('')
        : '<tr><td colspan="2" style="padding: 12px; text-align: center; color: #9E9E9E; font-style: italic;">No officers recorded</td></tr>';

    const birthdayRows =
      report.sobrietyBirthdays && report.sobrietyBirthdays.length > 0
        ? report.sobrietyBirthdays
            .map(
              b => `
          <tr>
            <td style="padding: 6px 12px;">${b.memberName.replace(/</g, '&lt;')}</td>
            <td style="padding: 6px 12px; text-align: center; font-weight: bold; color: #7B1FA2;">${b.years} yr${b.years !== 1 ? 's' : ''}</td>
          </tr>
        `,
            )
            .join('')
        : '<tr><td colspan="2" style="padding: 12px; text-align: center; color: #9E9E9E; font-style: italic;">None this month</td></tr>';

    return `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="UTF-8">
        <style>
          body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
            margin: 0;
            padding: 24px;
            color: #212121;
          }
          .header {
            text-align: center;
            border-bottom: 2px solid #3949AB;
            padding-bottom: 16px;
            margin-bottom: 24px;
          }
          .header h1 { color: #212121; margin: 0 0 4px; font-size: 20px; }
          .header h2 { color: #3949AB; margin: 0 0 6px; font-size: 16px; font-weight: 600; }
          .header .subtitle { color: #757575; font-size: 13px; }
          .section { margin-bottom: 20px; }
          .section-title {
            font-size: 15px;
            font-weight: bold;
            color: #3949AB;
            border-bottom: 1px solid #E0E0E0;
            padding-bottom: 4px;
            margin-bottom: 10px;
          }
          table { width: 100%; border-collapse: collapse; font-size: 14px; }
          th { background: #F5F5F5; padding: 8px 12px; text-align: left; font-weight: 600; color: #424242; }
          tbody tr { border-bottom: 1px solid #F0F0F0; }
          .highlight-box {
            background: #F5F5F5;
            border-radius: 6px;
            padding: 12px 16px;
            display: inline-block;
            margin-right: 16px;
            margin-bottom: 8px;
          }
          .highlight-label { font-size: 12px; color: #757575; }
          .highlight-value { font-size: 22px; font-weight: bold; color: #212121; }
          .notes-box {
            background: #F5F5F5;
            border-radius: 6px;
            padding: 12px;
            font-size: 14px;
            line-height: 1.6;
          }
          .footer {
            margin-top: 32px;
            padding-top: 16px;
            border-top: 1px solid #E0E0E0;
            font-size: 11px;
            color: #9E9E9E;
            text-align: center;
          }
        </style>
      </head>
      <body>
        <div class="header">
          <h1>${report.groupName.replace(/</g, '&lt;')}</h1>
          <h2>Monthly Intergroup Report</h2>
          <div class="subtitle">${monthLabel}</div>
        </div>

        <div class="section">
          <div class="section-title">Group Information</div>
          <table>
            <tbody>
              <tr><td style="padding: 6px 12px; color: #616161;">Group Type</td><td style="padding: 6px 12px;">${(report.groupType || '—').replace(/</g, '&lt;')}</td></tr>
              ${report.meetingDay || report.meetingTime ? `<tr><td style="padding: 6px 12px; color: #616161;">Meets</td><td style="padding: 6px 12px;">${[report.meetingDay, report.meetingTime].filter(Boolean).join(' at ').replace(/</g, '&lt;')}</td></tr>` : ''}
              ${report.meetingLocation ? `<tr><td style="padding: 6px 12px; color: #616161;">Location</td><td style="padding: 6px 12px;">${report.meetingLocation.replace(/</g, '&lt;')}</td></tr>` : ''}
              ${report.isOnlineMeeting ? `<tr><td style="padding: 6px 12px; color: #616161;">Format</td><td style="padding: 6px 12px;">Online Meeting</td></tr>` : ''}
              ${report.gsrName ? `<tr><td style="padding: 6px 12px; color: #616161;">GSR</td><td style="padding: 6px 12px;">${report.gsrName.replace(/</g, '&lt;')}</td></tr>` : ''}
              ${report.gsrPhoneNumber ? `<tr><td style="padding: 6px 12px; color: #616161;">GSR Phone</td><td style="padding: 6px 12px;">${report.gsrPhoneNumber.replace(/</g, '&lt;')}</td></tr>` : ''}
            </tbody>
          </table>
        </div>

        <div class="section">
          <div class="section-title">Attendance Summary</div>
          <div>
            <div class="highlight-box">
              <div class="highlight-label">Meetings Held</div>
              <div class="highlight-value">${report.numberOfMeetingsHeld}</div>
            </div>
            <div class="highlight-box">
              <div class="highlight-label">Avg Attendance</div>
              <div class="highlight-value">${report.averageAttendance}</div>
            </div>
          </div>
        </div>

        <div class="section">
          <div class="section-title">7th Tradition</div>
          <div class="highlight-box">
            <div class="highlight-label">Total Collected</div>
            <div class="highlight-value">$${report.totalSeventhTraditionCollected.toFixed(2)}</div>
          </div>
        </div>

        <div class="section">
          <div class="section-title">Sobriety Birthdays</div>
          <table>
            <thead><tr><th>Member</th><th>Years</th></tr></thead>
            <tbody>${birthdayRows}</tbody>
          </table>
        </div>

        <div class="section">
          <div class="section-title">Current Officers</div>
          <table>
            <thead><tr><th>Position</th><th>Name</th></tr></thead>
            <tbody>${officerRows}</tbody>
          </table>
        </div>

        ${
          report.groupNotes
            ? `<div class="section">
          <div class="section-title">Group Notes</div>
          <div class="notes-box">${report.groupNotes.replace(/</g, '&lt;').replace(/\n/g, '<br>')}</div>
        </div>`
            : ''
        }

        <div class="footer">
          <p>${report.status === 'submitted' ? 'Submitted to intergroup' : 'Draft report'} &bull; RecoveryConnect</p>
          <p>Generated: ${format(new Date(), 'MMM d, yyyy h:mm a')}</p>
        </div>
      </body>
      </html>
    `;
  }

  static async generateAndShare(report: IntergroupReportDocument): Promise<void> {
    const html = IntergroupReportService.generateReportHTML(report);

    const fileName = `${report.groupName.replace(/[^a-zA-Z0-9]/g, '_')}_GSR_Report_${report.reportMonth}`;

    const options = {
      html,
      fileName,
      directory: Platform.OS === 'ios' ? 'Documents' : 'Download',
    };

    const file = await RNHTMLtoPDF.convert(options);

    if (!file.filePath) {
      throw new Error('Failed to generate PDF');
    }

    await Share.share({
      url: Platform.OS === 'ios' ? file.filePath : `file://${file.filePath}`,
      title: `${report.groupName} GSR Report — ${report.reportMonth}`,
    });
  }
}
