/**
 * exportWeeklyReportPDF on react-native-html-to-pdf 1.3.0 (RN 0.88 upgrade, Task 6): the
 * library's named generatePDF replaces 0.12's default `.convert`, with the same options.
 * PDF export stays Android-only (isPDFExportAvailable), as before the upgrade.
 */
import { Platform } from 'react-native';
import { generatePDF } from 'react-native-html-to-pdf';
import { exportWeeklyReportPDF, isPDFExportAvailable } from '../reportExport';

const guest = { id: 'guest-1', firstName: 'A', lastName: 'B' } as any;
const stats = {} as any;
const rules = {} as any;

const setOS = (os: 'ios' | 'android') => Object.defineProperty(Platform, 'OS', { get: () => os, configurable: true });
const originalOS = Platform.OS;

afterEach(() => {
  setOS(originalOS as 'ios' | 'android');
  (generatePDF as jest.Mock).mockClear();
});

describe('exportWeeklyReportPDF', () => {
  it('calls generatePDF with the html, file name and Documents directory, and returns the path', async () => {
    setOS('android');
    (generatePDF as jest.Mock).mockResolvedValueOnce({ filePath: '/data/Documents/report.pdf' });

    const path = await exportWeeklyReportPDF(guest, stats, '2026-10-05', rules);

    expect(path).toBe('/data/Documents/report.pdf');
    expect(generatePDF).toHaveBeenCalledTimes(1);
    expect(generatePDF).toHaveBeenCalledWith({
      html: expect.stringContaining('<html>'),
      fileName: 'compliance_guest-1_2026-10-05',
      directory: 'Documents',
    });
  });

  it('is unavailable on iOS and refuses without generating anything', async () => {
    setOS('ios');

    expect(isPDFExportAvailable()).toBe(false);
    await expect(exportWeeklyReportPDF(guest, stats, '2026-10-05', rules)).rejects.toThrow(
      'PDF export is temporarily unavailable on iOS',
    );
    expect(generatePDF).not.toHaveBeenCalled();
  });
});
