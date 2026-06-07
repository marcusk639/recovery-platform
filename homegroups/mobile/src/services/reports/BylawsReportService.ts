import RNHTMLtoPDF from 'react-native-html-to-pdf';
import {Share, Platform} from 'react-native';
import {BylawDocument} from '../../types/schema';
import {format} from 'date-fns';

/**
 * Service for generating and sharing bylaws/guidelines as PDF
 */
export class BylawsReportService {
  /**
   * Generate HTML content for the bylaws report
   */
  static generateReportHTML(bylaw: BylawDocument, groupName: string): string {
    const formatDate = (ts: any): string => {
      try {
        const date =
          typeof ts?.toDate === 'function' ? ts.toDate() : new Date(ts);
        return format(date, 'MMMM d, yyyy');
      } catch {
        return 'Unknown date';
      }
    };

    const ratificationInfo =
      bylaw.status === 'ratified' && bylaw.ratifiedAt
        ? `<div class="ratification-info">Ratified by group conscience vote on ${formatDate(bylaw.ratifiedAt)}</div>`
        : bylaw.status === 'draft'
        ? '<div class="draft-watermark">DRAFT — Not yet ratified</div>'
        : '';

    // Convert plain text to paragraphs for HTML display
    const contentHtml = (bylaw.content || '')
      .split('\n')
      .map(line => {
        const trimmed = line.trim();
        if (!trimmed) return '<br>';
        return `<p>${trimmed.replace(/</g, '&lt;').replace(/>/g, '&gt;')}</p>`;
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
            padding: 24px;
            color: #212121;
            background-color: #ffffff;
          }
          .header {
            text-align: center;
            margin-bottom: 24px;
            padding-bottom: 16px;
            border-bottom: 2px solid #388E3C;
          }
          .header h1 {
            color: #212121;
            margin: 0 0 4px 0;
            font-size: 22px;
          }
          .header h2 {
            color: #388E3C;
            margin: 0 0 8px 0;
            font-size: 18px;
            font-weight: 600;
          }
          .header .version {
            color: #757575;
            font-size: 13px;
          }
          .ratification-info {
            background: #E8F5E9;
            border-radius: 6px;
            padding: 10px 14px;
            color: #2E7D32;
            font-size: 13px;
            margin-bottom: 20px;
            text-align: center;
          }
          .draft-watermark {
            background: #FFF8E1;
            border-radius: 6px;
            padding: 10px 14px;
            color: #E65100;
            font-size: 13px;
            margin-bottom: 20px;
            text-align: center;
            font-weight: bold;
          }
          .content {
            font-size: 14px;
            line-height: 1.7;
            color: #212121;
          }
          .content p {
            margin: 0 0 10px 0;
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
          <h1>${groupName.replace(/</g, '&lt;')}</h1>
          <h2>Official Guidelines</h2>
          <div class="version">Version ${bylaw.version}${bylaw.ratifiedAt ? ` &bull; Ratified ${formatDate(bylaw.ratifiedAt)}` : ''}</div>
        </div>

        ${ratificationInfo}

        <div class="content">
          ${contentHtml}
        </div>

        <div class="footer">
          <p>Ratified by group conscience vote &bull; Homegroups</p>
          <p>Generated: ${format(new Date(), 'MMM d, yyyy h:mm a')}</p>
        </div>
      </body>
      </html>
    `;
  }

  /**
   * Generate PDF and share
   */
  static async generateAndShare(
    bylaw: BylawDocument,
    groupName: string,
  ): Promise<void> {
    const html = BylawsReportService.generateReportHTML(bylaw, groupName);

    const fileName = `${groupName.replace(/[^a-zA-Z0-9]/g, '_')}_Guidelines_v${bylaw.version}`;

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
      title: `${groupName} Guidelines`,
    });
  }
}
