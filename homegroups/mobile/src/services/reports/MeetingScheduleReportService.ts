import RNHTMLtoPDF from 'react-native-html-to-pdf';
import {Share, Platform} from 'react-native';
import {format} from 'date-fns';

export interface ScheduleMeeting {
  day: string; // e.g., "Monday", "Tuesday"
  time: string; // e.g., "7:00 PM"
  name: string;
  type?: string; // Open / Closed
  meetingFormat?: string; // Speaker / Discussion / Big Book
  location?: string;
  locationName?: string;
  isOnline?: boolean;
}

const DAY_ORDER = [
  'Sunday',
  'Monday',
  'Tuesday',
  'Wednesday',
  'Thursday',
  'Friday',
  'Saturday',
];

/**
 * Service for generating and sharing meeting schedule reports as PDF.
 * Follows the same pattern as TreasuryReportService.
 */
export class MeetingScheduleReportService {
  /**
   * Generate HTML content for the meeting schedule report.
   */
  static generateReportHTML(
    meetings: ScheduleMeeting[],
    groupName: string,
    generatedDate: Date,
  ): string {
    const formatDate = (date: Date) => format(date, 'MMM d, yyyy h:mm a');

    // Sort meetings by day of week then time
    const sorted = [...meetings].sort((a, b) => {
      const dayDiff = DAY_ORDER.indexOf(a.day) - DAY_ORDER.indexOf(b.day);
      if (dayDiff !== 0) return dayDiff;
      return a.time.localeCompare(b.time);
    });

    // Group by day
    const byDay: Record<string, ScheduleMeeting[]> = {};
    sorted.forEach(meeting => {
      const day = meeting.day || 'Other';
      if (!byDay[day]) {
        byDay[day] = [];
      }
      byDay[day].push(meeting);
    });

    const dayRows = Object.entries(byDay)
      .map(([day, dayMeetings]) => {
        const meetingRows = dayMeetings
          .map(
            meeting => `
            <tr>
              <td style="padding: 8px 12px; font-weight: 500;">${day}</td>
              <td style="padding: 8px 12px;">${meeting.time}</td>
              <td style="padding: 8px 12px;">${meeting.name}</td>
              <td style="padding: 8px 12px; color: ${
                meeting.type === 'Open' ? '#4CAF50' : '#1976D2'
              };">${meeting.type || '—'}</td>
              <td style="padding: 8px 12px;">${
                meeting.meetingFormat || '—'
              }</td>
              <td style="padding: 8px 12px; color: #757575;">${
                meeting.isOnline
                  ? 'Online'
                  : meeting.locationName || meeting.location || '—'
              }</td>
            </tr>
          `,
          )
          .join('');
        return meetingRows;
      })
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
          .header .subtitle {
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
          table {
            width: 100%;
            border-collapse: collapse;
            font-size: 13px;
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
          tbody tr {
            border-bottom: 1px solid #E0E0E0;
          }
          tbody tr:last-child {
            border-bottom: none;
          }
          tbody tr:nth-child(even) {
            background-color: #FAFAFA;
          }
          .footer {
            margin-top: 32px;
            padding-top: 16px;
            border-top: 1px solid #E0E0E0;
            font-size: 12px;
            color: #9E9E9E;
            text-align: center;
          }
          .legend {
            display: flex;
            gap: 16px;
            margin-bottom: 12px;
            font-size: 12px;
          }
          .legend-item {
            display: flex;
            align-items: center;
            gap: 4px;
          }
          .dot-open { color: #4CAF50; font-weight: bold; }
          .dot-closed { color: #1976D2; font-weight: bold; }
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
          <div class="subtitle">Weekly Meeting Schedule</div>
          <div class="subtitle">Generated: ${formatDate(generatedDate)}</div>
        </div>

        <div class="section">
          <div class="section-title">Meeting Schedule (${meetings.length} meetings)</div>
          ${
            dayRows
              ? `
          <table>
            <thead>
              <tr>
                <th>Day</th>
                <th>Time</th>
                <th>Meeting Name</th>
                <th>Type</th>
                <th>Format</th>
                <th>Location</th>
              </tr>
            </thead>
            <tbody>
              ${dayRows}
            </tbody>
          </table>
          `
              : '<div class="no-data">No meetings scheduled</div>'
          }
        </div>

        <div class="footer">
          <p>Generated by Homegroups on ${formatDate(generatedDate)}</p>
          <p>Schedule subject to change — confirm with group secretary</p>
        </div>
      </body>
      </html>
    `;
  }

  /**
   * Generate a PDF file from the meeting schedule.
   */
  static async generatePDF(
    meetings: ScheduleMeeting[],
    groupName: string,
  ): Promise<string> {
    try {
      const html = MeetingScheduleReportService.generateReportHTML(
        meetings,
        groupName,
        new Date(),
      );

      const fileName = `${groupName.replace(
        /[^a-zA-Z0-9]/g,
        '_',
      )}_Meeting_Schedule_${format(new Date(), 'yyyy-MM-dd')}`;

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
      console.error('Error generating meeting schedule PDF:', error);
      throw error;
    }
  }

  /**
   * Generate PDF and share via the native share sheet.
   */
  static async generateAndShare(
    meetings: ScheduleMeeting[],
    groupName: string,
  ): Promise<void> {
    try {
      const filePath = await MeetingScheduleReportService.generatePDF(
        meetings,
        groupName,
      );

      await Share.share({
        url: Platform.OS === 'ios' ? filePath : `file://${filePath}`,
        title: `${groupName} Meeting Schedule`,
      });
    } catch (error) {
      console.error('Error sharing meeting schedule PDF:', error);
      throw error;
    }
  }
}
