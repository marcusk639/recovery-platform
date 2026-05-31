import React, { useState, useMemo, useCallback } from 'react';
import { View, ScrollView, StyleSheet, TouchableOpacity } from 'react-native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { RootStackParamList } from '../../navigation/types';
import { useSelectedHouse } from '../../hooks/useSelectedHouse';
import { useGuests } from '../../state/queries/guestQueries';
import {
  useOccupancyReport,
  useComplianceTrend,
  useDischargeReport,
} from '../../state/queries/reportingQueries';
import { DischargePeriod } from '../../services/reportingService';
import { Guest } from '../../entities/Guest';
import { RatsText } from '../../components/rats-text';
import RatsLoadingIndicator from '../../components/rats-loading-indicator/rats-loading-indicator';
import ScreenHeader from '../../components/screen-header';
import { color, normalize, fontSize, CARD_STYLE } from '../../styles/theme';

interface Props {
  navigation: NativeStackNavigationProp<RootStackParamList>;
}

const PERIOD_OPTIONS: DischargePeriod[] = [30, 60, 90];

const AdminReportScreen: React.FC<Props> = ({ navigation }) => {
  const { house, houseId } = useSelectedHouse();
  const [dischargePeriod, setDischargePeriod] = useState<DischargePeriod>(30);

  const { data: guestsMap, isLoading: guestsLoading } = useGuests(
    houseId ?? '',
  );

  const allGuests: Guest[] = useMemo(
    () => Object.values((guestsMap ?? {}) as Record<string, Guest>),
    [guestsMap],
  );
  const activeGuests = useMemo(
    () => allGuests.filter(g => g.status === 'active'),
    [allGuests],
  );
  const activeGuestIds = useMemo(
    () => activeGuests.map(g => g.id),
    [activeGuests],
  );

  const capacity = house?.maximumCapacity ?? 0;
  const dataReady = !!houseId && !guestsLoading;

  const { data: occupancy, isLoading: occLoading } = useOccupancyReport(
    houseId ?? '',
    activeGuests,
    capacity,
    dataReady,
  );
  const { data: compliance, isLoading: compLoading } = useComplianceTrend(
    houseId ?? '',
    activeGuestIds,
    4,
    dataReady,
  );
  const { data: discharge, isLoading: disLoading } = useDischargeReport(
    houseId ?? '',
    allGuests,
    dischargePeriod,
    dataReady,
  );

  const isLoading = guestsLoading || occLoading || compLoading || disLoading;

  const pct = useCallback((rate: number) => `${Math.round(rate * 100)}%`, []);
  const rateColor = useCallback(
    (rate: number, threshold: number) =>
      rate >= threshold ? color.green : color.red,
    [],
  );

  return (
    <View style={styles.container} testID="admin-report-screen">
      <ScreenHeader renderBackButton header="Reports" />

      {isLoading ? (
        <View testID="report-loading">
          <RatsLoadingIndicator />
        </View>
      ) : (
        <ScrollView contentContainerStyle={styles.scroll}>
          {/* Occupancy */}
          <View style={[CARD_STYLE, styles.card]} testID="occupancy-section">
            <RatsText
              text="Occupancy"
              style={styles.sectionTitle}
              translate={false}
            />
            {occupancy ? (
              <View style={styles.row}>
                <RatsText
                  text={`${occupancy.activeCount} / ${occupancy.capacity}`}
                  style={styles.bigStat}
                  translate={false}
                  testID="occupancy-ratio"
                />
                <RatsText
                  text={`(${occupancy.occupancyPct}%)`}
                  style={[
                    styles.bigStatSub,
                    { color: rateColor(occupancy.occupancyPct / 100, 0.8) },
                  ]}
                  translate={false}
                  testID="occupancy-pct"
                />
              </View>
            ) : (
              <RatsText
                text="No data"
                style={styles.noData}
                translate={false}
              />
            )}
          </View>

          {/* 4-Week Compliance */}
          <View style={[CARD_STYLE, styles.card]} testID="compliance-section">
            <RatsText
              text="4-Week Compliance"
              style={styles.sectionTitle}
              translate={false}
            />
            <View style={styles.complianceLegend}>
              <RatsText
                text="Week"
                style={styles.colHeader}
                translate={false}
              />
              <RatsText
                text="Chores"
                style={styles.colHeader}
                translate={false}
              />
              <RatsText
                text="Meetings"
                style={styles.colHeader}
                translate={false}
              />
            </View>
            {compliance && compliance.weeks.length > 0 ? (
              compliance.weeks.map(week => (
                <View
                  key={week.weekStart}
                  style={styles.complianceRow}
                  testID={`week-row-${week.weekStart}`}>
                  <RatsText
                    text={week.weekStart.slice(5)}
                    style={styles.colCell}
                    translate={false}
                  />
                  <RatsText
                    text={pct(week.choreRate)}
                    style={[
                      styles.colCell,
                      { color: rateColor(week.choreRate, 0.8) },
                    ]}
                    translate={false}
                    testID={`chore-rate-${week.weekStart}`}
                  />
                  <RatsText
                    text={pct(week.meetingRate)}
                    style={[
                      styles.colCell,
                      { color: rateColor(week.meetingRate, 0.8) },
                    ]}
                    translate={false}
                    testID={`meeting-rate-${week.weekStart}`}
                  />
                </View>
              ))
            ) : (
              <RatsText
                text="No compliance data for the last 4 weeks."
                style={styles.noData}
                translate={false}
              />
            )}
          </View>

          {/* Discharge Summary */}
          <View style={[CARD_STYLE, styles.card]} testID="discharge-section">
            <RatsText
              text="Discharge Summary"
              style={styles.sectionTitle}
              translate={false}
            />
            <View style={styles.toggleRow}>
              {PERIOD_OPTIONS.map(p => (
                <TouchableOpacity
                  key={p}
                  style={[
                    styles.toggleBtn,
                    dischargePeriod === p && styles.toggleBtnActive,
                  ]}
                  onPress={() => setDischargePeriod(p)}
                  testID={`period-btn-${p}`}>
                  <RatsText
                    text={`${p}d`}
                    style={[
                      styles.toggleBtnText,
                      dischargePeriod === p && styles.toggleBtnTextActive,
                    ]}
                    translate={false}
                  />
                </TouchableOpacity>
              ))}
            </View>
            {discharge ? (
              discharge.count === 0 ? (
                <RatsText
                  text={`No discharges in the last ${dischargePeriod} days.`}
                  style={styles.noData}
                  translate={false}
                  testID="discharge-empty"
                />
              ) : (
                <>
                  <RatsText
                    text={`${discharge.count} resident${
                      discharge.count !== 1 ? 's' : ''
                    } discharged`}
                    style={styles.dischargeSummary}
                    translate={false}
                    testID="discharge-count"
                  />
                  {discharge.residents.map(r => (
                    <View
                      key={r.id}
                      style={styles.dischargeRow}
                      testID={`discharge-row-${r.id}`}>
                      <RatsText
                        text={r.displayName}
                        style={styles.dischargeName}
                        translate={false}
                      />
                      <RatsText
                        text={r.movedOutDate}
                        style={styles.dischargeDate}
                        translate={false}
                      />
                    </View>
                  ))}
                </>
              )
            ) : (
              <RatsText
                text="No data"
                style={styles.noData}
                translate={false}
              />
            )}
          </View>
        </ScrollView>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: color.light_grey },
  scroll: { padding: normalize(16), paddingBottom: normalize(40) },
  card: { marginBottom: normalize(16), padding: normalize(16) },
  sectionTitle: {
    fontSize: fontSize.large,
    fontWeight: '700',
    color: color.dark_grey,
    marginBottom: normalize(12),
  },
  row: { flexDirection: 'row', alignItems: 'baseline', gap: normalize(8) },
  bigStat: { fontSize: 28, fontWeight: '700', color: color.dark_grey },
  bigStatSub: { fontSize: fontSize.large, fontWeight: '600' },
  noData: { color: color.dark_grey, fontSize: fontSize.small },
  complianceLegend: { flexDirection: 'row', marginBottom: normalize(4) },
  complianceRow: {
    flexDirection: 'row',
    paddingVertical: normalize(6),
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: color.light_grey,
  },
  colHeader: {
    flex: 1,
    fontSize: fontSize.small,
    fontWeight: '600',
    color: color.dark_grey,
  },
  colCell: { flex: 1, fontSize: 14, color: color.dark_grey },
  toggleRow: {
    flexDirection: 'row',
    marginBottom: normalize(12),
    gap: normalize(8),
  },
  toggleBtn: {
    paddingHorizontal: normalize(14),
    paddingVertical: normalize(6),
    borderRadius: normalize(16),
    borderWidth: 1,
    borderColor: color.dark_grey,
  },
  toggleBtnActive: { backgroundColor: color.dark_grey },
  toggleBtnText: { fontSize: fontSize.small, color: color.dark_grey },
  toggleBtnTextActive: { color: color.white },
  dischargeSummary: {
    fontSize: 14,
    fontWeight: '600',
    color: color.dark_grey,
    marginBottom: normalize(8),
  },
  dischargeRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: normalize(6),
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: color.light_grey,
  },
  dischargeName: { fontSize: 14, color: color.dark_grey },
  dischargeDate: { fontSize: fontSize.small, color: color.dark_grey },
});

export default AdminReportScreen;
