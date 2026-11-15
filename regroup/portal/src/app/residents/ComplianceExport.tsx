import { useState } from 'react';
import { useCurrentWeek } from '@mobile/hooks/activity/useCurrentWeek';
import { exportWeeklyReportPDF } from '@mobile/services/reportExport';
import { useWeekSummary } from '@mobile/state/queries/activityQueries';
import { Alert } from '../../adapter/react-native';
import { useHouseAccess } from '../useHouseAccess';
import { reportGuest, reportRules, reportStats } from './compliance-text';

const button = {
  padding: '6px 12px',
  border: '1px solid #b9c6cf',
  borderRadius: 6,
  background: '#fff',
  color: '#1d3a4f',
  font: 'inherit',
  cursor: 'pointer',
};

// The phone's compliance export (GuestHome's handleExportPDF): the same inputs,
// the same report and the same messages. The print view stands in for the
// phone's share sheet. It counts as Reports, so peer leaders don't get it
// (owner decision, 2026-11-09).
export function ComplianceExport({ guest, house }: { guest: any; house: any }) {
  const { view } = useHouseAccess(house.id);
  const { startDate } = useCurrentWeek(house.timezone);
  const full = view === 'full';
  const { data: summary = null, isLoading } = useWeekSummary(
    guest.id,
    startDate,
    full && !!guest.id && !!startDate,
  );
  const [exporting, setExporting] = useState(false);
  if (!full) return null;

  const phaseRules = house.phases?.[String(guest.phase)]?.rules ?? null;
  const onExport = async () => {
    if (!phaseRules || !summary) {
      Alert.alert('Export Error', 'Unable to generate report: missing guest or week data.');
      return;
    }
    setExporting(true);
    try {
      await exportWeeklyReportPDF(reportGuest(guest), reportStats(summary.stats), startDate, reportRules(phaseRules));
    } catch (err: any) {
      Alert.alert('Export Failed', err?.message || 'Could not generate PDF.');
    } finally {
      setExporting(false);
    }
  };

  return (
    <button
      type="button"
      style={button}
      data-testid="export-compliance-report"
      disabled={isLoading || exporting}
      onClick={onExport}
    >
      Export compliance report
    </button>
  );
}
