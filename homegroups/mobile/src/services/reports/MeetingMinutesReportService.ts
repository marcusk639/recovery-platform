import RNHTMLtoPDF from 'react-native-html-to-pdf';
import {Share, Platform} from 'react-native';
import {MeetingMinutesDocument} from '../../types/schema';
import {format} from 'date-fns';

/**
 * Service for generating and sharing meeting minutes as PDF
 */
export class MeetingMinutesReportService {
  static generateReportHTML(
    minutes: MeetingMinutesDocument,
    groupName: string,
  ): string {
    const formatDate = (ts: any): string => {
      try {
        const date =
          typeof ts?.toDate === 'function' ? ts.toDate() : new Date(ts);
        return format(date, 'MMMM d, yyyy');
      } catch {
        return 'Unknown date';
      }
    };

    const formatCurrency = (n: number) => `$${n.toFixed(2)}`;

    const isApproved = minutes.status === 'approved';

    const agendaRows =
      minutes.agendaItems && minutes.agendaItems.length > 0
        ? minutes.agendaItems
            .map(
              (item, idx) => `
          <tr>
            <td style="padding: 8px 12px;">${idx + 1}. ${item.title.replace(/</g, '&lt;')}</td>
            <td style="padding: 8px 12px; text-align: center;">
              <span style="background: ${item.outcome === 'voted' ? '#4CAF50' : '#9E9E9E'}; color: white; padding: 2px 6px; border-radius: 3px; font-size: 11px;">
                ${item.outcome.replace(/_/g, ' ').toUpperCase()}
              </span>
            </td>
            <td style="padding: 8px 12px; font-size: 13px; color: #616161;">${(item.notes || '').replace(/</g, '&lt;')}</td>
          </tr>
        `,
            )
            .join('')
        : '<tr><td colspan="3" style="padding: 12px; text-align: center; color: #9E9E9E; font-style: italic;">None recorded</td></tr>';

    const decisionRows =
      minutes.decisions && minutes.decisions.length > 0
        ? minutes.decisions
            .map(
              (d, idx) => `
          <div style="margin-bottom: 16px; padding: 12px; background: #F5F5F5; border-radius: 6px;">
            <div style="font-weight: bold; margin-bottom: 4px;">${idx + 1}. ${d.topic.replace(/</g, '&lt;')}</div>
            <div style="font-style: italic; color: #616161; margin-bottom: 8px;">${(d.motionText || '').replace(/</g, '&lt;')}</div>
            <div>
              <span style="background: ${d.passed ? '#4CAF50' : '#F44336'}; color: white; padding: 2px 8px; border-radius: 3px; font-size: 12px; font-weight: bold;">
                ${d.passed ? 'PASSED' : 'FAILED'}
              </span>
              <span style="margin-left: 12px; font-size: 13px; color: #757575;">
                For: ${d.voteFor} | Against: ${d.voteAgainst} | Abstain: ${d.voteAbstain}
              </span>
            </div>
          </div>
        `,
            )
            .join('')
        : '<p style="color: #9E9E9E; font-style: italic;">None recorded</p>';

    const treasurySection = minutes.treasuryReport
      ? `
      <div class="section">
        <div class="section-title">Treasury Report</div>
        <table>
          <tbody>
            <tr><td style="padding: 6px 12px;">Opening Balance</td><td style="padding: 6px 12px; text-align: right;">${formatCurrency(minutes.treasuryReport.openingBalance)}</td></tr>
            <tr><td style="padding: 6px 12px;">7th Tradition</td><td style="padding: 6px 12px; text-align: right; color: #4CAF50;">+${formatCurrency(minutes.treasuryReport.collection7thTradition)}</td></tr>
            <tr><td style="padding: 6px 12px;">Expenses</td><td style="padding: 6px 12px; text-align: right; color: #F44336;">-${formatCurrency(minutes.treasuryReport.expenses)}</td></tr>
            <tr style="font-weight: bold; border-top: 1px solid #E0E0E0;"><td style="padding: 8px 12px;">Closing Balance</td><td style="padding: 8px 12px; text-align: right;">${formatCurrency(minutes.treasuryReport.closingBalance)}</td></tr>
            <tr><td style="padding: 6px 12px; color: #757575;">Prudent Reserve</td><td style="padding: 6px 12px; text-align: right; color: #757575;">${formatCurrency(minutes.treasuryReport.prudentReserve)}</td></tr>
          </tbody>
        </table>
      </div>
    `
      : '';

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
            border-bottom: 2px solid #1976D2;
            padding-bottom: 16px;
            margin-bottom: 24px;
          }
          .header h1 { color: #212121; margin: 0 0 4px; font-size: 20px; }
          .header h2 { color: #1976D2; margin: 0 0 6px; font-size: 16px; font-weight: 600; }
          .header .date { color: #757575; font-size: 14px; }
          ${!isApproved ? '.draft-watermark { background: #FFF8E1; border-radius: 6px; padding: 8px 14px; color: #E65100; font-size: 13px; margin-bottom: 16px; text-align: center; font-weight: bold; }' : ''}
          .section { margin-bottom: 20px; }
          .section-title {
            font-size: 15px;
            font-weight: bold;
            color: #1976D2;
            border-bottom: 1px solid #E0E0E0;
            padding-bottom: 4px;
            margin-bottom: 10px;
          }
          table { width: 100%; border-collapse: collapse; font-size: 14px; }
          th { background: #F5F5F5; padding: 8px 12px; text-align: left; font-weight: 600; color: #424242; }
          tbody tr { border-bottom: 1px solid #F0F0F0; }
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
          <h1>${groupName.replace(/</g, '&lt;')}</h1>
          <h2>Business Meeting Minutes</h2>
          <div class="date">${formatDate(minutes.date)}</div>
        </div>

        ${!isApproved ? '<div class="draft-watermark">DRAFT — Not yet approved</div>' : ''}

        <div class="section">
          <div class="section-title">Meeting Info</div>
          <table>
            <tbody>
              <tr><td style="padding: 6px 12px;">Chair</td><td style="padding: 6px 12px;">${(minutes.chair || '—').replace(/</g, '&lt;')}</td></tr>
              <tr><td style="padding: 6px 12px;">Secretary</td><td style="padding: 6px 12px;">${(minutes.secretary || '—').replace(/</g, '&lt;')}</td></tr>
              ${minutes.openedAt ? `<tr><td style="padding: 6px 12px;">Opened</td><td style="padding: 6px 12px;">${minutes.openedAt}</td></tr>` : ''}
              ${minutes.closedAt ? `<tr><td style="padding: 6px 12px;">Closed</td><td style="padding: 6px 12px;">${minutes.closedAt}</td></tr>` : ''}
              <tr><td style="padding: 6px 12px;">Attendance</td><td style="padding: 6px 12px;">${minutes.attendanceCount} members${minutes.memberQuorum ? ' — Quorum met' : ''}</td></tr>
              <tr><td style="padding: 6px 12px;">Opening Prayer</td><td style="padding: 6px 12px;">${minutes.openingPrayer ? 'Yes' : 'No'}</td></tr>
              <tr><td style="padding: 6px 12px;">Closing Prayer</td><td style="padding: 6px 12px;">${minutes.closingPrayer ? 'Yes' : 'No'}</td></tr>
            </tbody>
          </table>
        </div>

        ${treasurySection}

        <div class="section">
          <div class="section-title">Agenda Items</div>
          <table>
            <thead><tr><th>Item</th><th>Outcome</th><th>Notes</th></tr></thead>
            <tbody>${agendaRows}</tbody>
          </table>
        </div>

        <div class="section">
          <div class="section-title">Decisions / Votes</div>
          ${decisionRows}
        </div>

        ${minutes.announcements ? `<div class="section"><div class="section-title">Announcements</div><p style="font-size:14px;">${minutes.announcements.replace(/</g, '&lt;')}</p></div>` : ''}

        <div class="footer">
          <p>${isApproved ? 'Approved by group conscience' : 'Draft minutes'} &bull; RecoveryConnect</p>
          <p>Generated: ${format(new Date(), 'MMM d, yyyy h:mm a')}</p>
        </div>
      </body>
      </html>
    `;
  }

  static async generateAndShare(
    minutes: MeetingMinutesDocument,
    groupName: string,
  ): Promise<void> {
    const html = MeetingMinutesReportService.generateReportHTML(
      minutes,
      groupName,
    );

    let dateStr = 'meeting';
    try {
      const d =
        typeof minutes.date?.toDate === 'function'
          ? minutes.date.toDate()
          : new Date(minutes.date as any);
      dateStr = format(d, 'yyyy-MM-dd');
    } catch {}

    const fileName = `${groupName.replace(/[^a-zA-Z0-9]/g, '_')}_Minutes_${dateStr}`;

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
      title: `${groupName} Meeting Minutes`,
    });
  }
}
