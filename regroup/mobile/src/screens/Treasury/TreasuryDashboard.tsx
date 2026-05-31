import React from 'react';
import {
  View,
  FlatList,
  TouchableOpacity,
  StyleSheet,
  ListRenderItem,
} from 'react-native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { RootStackParamList, Routes } from '../../navigation/types';
import { useData } from '../../context/DataContext';
import { useTreasuryRole } from '../../hooks/useTreasuryRole';
import {
  useCurrentWeekRecord,
  useFinancialRecords,
} from '../../state/queries/treasuryQueries';
import type { FinancialRecord } from '../../entities/oxford/FinancialRecord';
import RatsText from '../../components/rats-text/rats-text';
import RatsLoadingIndicator from '../../components/rats-loading-indicator/rats-loading-indicator';
import ScreenHeader from '../../components/screen-header/screen-header';
import {
  color,
  normalize,
  fontSize,
  CARD_STYLE,
  fontFamily,
} from '../../styles/theme';

interface Props {
  navigation: NativeStackNavigationProp<RootStackParamList>;
}

const formatCents = (cents: number): string => `$${(cents / 100).toFixed(2)}`;

const STATUS_COLORS: Record<string, string> = {
  draft: color.dark_grey,
  submitted: '#D97706',
  approved: color.green,
  rejected: color.red,
};

const STATUS_LABELS: Record<string, string> = {
  draft: 'Draft',
  submitted: 'Submitted',
  approved: 'Approved',
  rejected: 'Rejected',
};

const TreasuryDashboard: React.FC<Props> = ({ navigation }) => {
  const { currentHouse } = useData();
  const houseId = currentHouse?.id ?? '';

  const {
    role: _role,
    canCreate,
    isLoading: roleLoading,
  } = useTreasuryRole(houseId);
  const { data: currentWeekRecord, isLoading: weekLoading } =
    useCurrentWeekRecord(houseId);
  const { data: records = [], isLoading: recordsLoading } =
    useFinancialRecords(houseId);

  const isLoading = roleLoading || weekLoading || recordsLoading;

  if (isLoading) {
    return (
      <View style={styles.container} testID="treasury-loading">
        <ScreenHeader renderBackButton header="Treasury" />
        <RatsLoadingIndicator />
      </View>
    );
  }

  const balance =
    currentWeekRecord?.endingCheckingBalance ??
    currentWeekRecord?.beginningCheckingBalance ??
    0;
  const income = currentWeekRecord?.totalIncome ?? 0;
  const expenses = currentWeekRecord?.totalExpenses ?? 0;

  const navigateToForm = (recordId?: string) => {
    navigation.navigate(Routes.FinancialRecordForm, { recordId, houseId });
  };

  const renderStatusBanner = () => {
    if (!currentWeekRecord) {
      return (
        <View
          style={[styles.banner, styles.bannerNeutral]}
          testID="status-banner-no-record">
          <RatsText
            translate={false}
            text="No report for this week"
            style={styles.bannerText}
          />
          {canCreate && (
            <TouchableOpacity
              testID="btn-create-report"
              onPress={() => navigateToForm()}
              style={styles.bannerButton}>
              <RatsText
                translate={false}
                text="Create Report"
                style={styles.bannerButtonText}
              />
            </TouchableOpacity>
          )}
        </View>
      );
    }

    const status = currentWeekRecord.status;

    if (status === 'approved') {
      return (
        <View
          style={[styles.banner, styles.bannerApproved]}
          testID="status-banner-approved">
          <RatsText
            translate={false}
            text="✓ Approved"
            style={[styles.bannerText, { color: color.white }]}
          />
        </View>
      );
    }

    if (status === 'submitted') {
      return (
        <View
          style={[styles.banner, styles.bannerAmber]}
          testID="status-banner-submitted">
          <RatsText
            translate={false}
            text="Awaiting approval"
            style={[styles.bannerText, { color: color.white }]}
          />
        </View>
      );
    }

    if (status === 'rejected') {
      return (
        <View
          style={[styles.banner, styles.bannerRejected]}
          testID="status-banner-rejected">
          <RatsText
            translate={false}
            text="Rejected — needs revision"
            style={[styles.bannerText, { color: color.white }]}
          />
          {canCreate && (
            <TouchableOpacity
              testID="btn-edit-report"
              onPress={() => navigateToForm(currentWeekRecord.id)}
              style={styles.bannerButton}>
              <RatsText
                translate={false}
                text="Edit"
                style={styles.bannerButtonText}
              />
            </TouchableOpacity>
          )}
        </View>
      );
    }

    // draft
    return (
      <View
        style={[styles.banner, styles.bannerNeutral]}
        testID="status-banner-draft">
        <RatsText
          translate={false}
          text="Draft in progress"
          style={styles.bannerText}
        />
        {canCreate && (
          <TouchableOpacity
            testID="btn-continue-report"
            onPress={() => navigateToForm(currentWeekRecord.id)}
            style={styles.bannerButton}>
            <RatsText
              translate={false}
              text="Continue Editing"
              style={styles.bannerButtonText}
            />
          </TouchableOpacity>
        )}
      </View>
    );
  };

  const renderRecord: ListRenderItem<FinancialRecord> = ({ item }) => {
    const badgeColor = STATUS_COLORS[item.status] ?? color.dark_grey;
    return (
      <TouchableOpacity
        testID={`record-row-${item.id}`}
        style={[CARD_STYLE, styles.recordRow]}
        onPress={() =>
          navigation.navigate(Routes.FinancialRecordDetail, {
            recordId: item.id,
            houseId,
          })
        }>
        <View style={{ flex: 1 }}>
          <RatsText
            translate={false}
            text={`Week of ${item.period}`}
            style={styles.recordPeriod}
          />
          <RatsText
            translate={false}
            text={`Ending balance: ${formatCents(item.endingCheckingBalance)}`}
            style={styles.recordBalance}
          />
        </View>
        <View style={[styles.statusBadge, { backgroundColor: badgeColor }]}>
          <RatsText
            translate={false}
            text={STATUS_LABELS[item.status] ?? item.status}
            style={styles.statusBadgeText}
          />
        </View>
      </TouchableOpacity>
    );
  };

  return (
    <View style={styles.container}>
      <ScreenHeader renderBackButton header="Treasury" />

      <FlatList
        data={records}
        keyExtractor={item => item.id}
        renderItem={renderRecord}
        contentContainerStyle={styles.scroll}
        ListHeaderComponent={
          <>
            {/* Stat Cards */}
            <View style={styles.statsRow}>
              <View
                style={[CARD_STYLE, styles.statCard]}
                testID="stat-card-balance">
                <RatsText
                  translate={false}
                  text="Checking Balance"
                  style={styles.statLabel}
                />
                <RatsText
                  translate={false}
                  text={formatCents(balance)}
                  style={[
                    styles.statValue,
                    { color: balance >= 0 ? color.green : color.red },
                  ]}
                />
              </View>

              <View
                style={[CARD_STYLE, styles.statCard]}
                testID="stat-card-income">
                <RatsText
                  translate={false}
                  text="Income"
                  style={styles.statLabel}
                />
                <RatsText
                  translate={false}
                  text={formatCents(income)}
                  style={[styles.statValue, { color: color.green }]}
                />
              </View>

              <View
                style={[CARD_STYLE, styles.statCard]}
                testID="stat-card-expenses">
                <RatsText
                  translate={false}
                  text="Expenses"
                  style={styles.statLabel}
                />
                <RatsText
                  translate={false}
                  text={formatCents(expenses)}
                  style={[styles.statValue, { color: color.red }]}
                />
              </View>
            </View>

            {/* Status Banner */}
            {renderStatusBanner()}

            {/* Section title */}
            <RatsText
              translate={false}
              text="Past Reports"
              style={styles.sectionTitle}
            />
          </>
        }
        ListEmptyComponent={
          <View style={styles.emptyContainer}>
            <RatsText
              translate={false}
              text="No reports yet."
              style={styles.emptyText}
            />
          </View>
        }
      />

      {canCreate && (
        <TouchableOpacity
          testID="treasury-fab"
          style={styles.fab}
          onPress={() => navigateToForm()}>
          <RatsText translate={false} text="+" style={styles.fabText} />
        </TouchableOpacity>
      )}
    </View>
  );
};

// ─── Styles ──────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: color.light_grey },
  scroll: { padding: normalize(12), paddingBottom: normalize(80) },

  // Stat cards
  statsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: normalize(12),
  },
  statCard: {
    flex: 1,
    marginHorizontal: normalize(4),
    padding: normalize(10),
    alignItems: 'center',
  },
  statLabel: {
    fontSize: fontSize.extraSmall,
    color: color.dark_grey,
    marginBottom: normalize(4),
    textAlign: 'center',
  },
  statValue: {
    fontSize: fontSize.medium,
    fontFamily: fontFamily.bold,
    textAlign: 'center',
  },

  // Status banner
  banner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderRadius: normalize(8),
    padding: normalize(12),
    marginBottom: normalize(12),
  },
  bannerNeutral: { backgroundColor: color.medium_grey },
  bannerApproved: { backgroundColor: color.green },
  bannerAmber: { backgroundColor: '#D97706' },
  bannerRejected: { backgroundColor: color.red },
  bannerText: { fontSize: fontSize.regular, flex: 1 },
  bannerButton: {
    backgroundColor: color.white,
    borderRadius: normalize(4),
    paddingHorizontal: normalize(10),
    paddingVertical: normalize(6),
  },
  bannerButtonText: { fontSize: fontSize.small, color: color.dark_grey },

  // Section title
  sectionTitle: {
    fontSize: fontSize.medium,
    fontFamily: fontFamily.bold,
    color: color.dark_grey,
    marginBottom: normalize(8),
  },

  // Record rows
  recordRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: normalize(8),
    padding: normalize(12),
  },
  recordPeriod: {
    fontSize: fontSize.regular,
    color: color.black,
    fontFamily: fontFamily.bold,
  },
  recordBalance: {
    fontSize: fontSize.small,
    color: color.dark_grey,
    marginTop: normalize(2),
  },
  statusBadge: {
    paddingHorizontal: normalize(8),
    paddingVertical: normalize(4),
    borderRadius: normalize(4),
  },
  statusBadgeText: { fontSize: fontSize.extraSmall, color: color.white },

  // Empty state
  emptyContainer: {
    alignItems: 'center',
    padding: normalize(20),
  },
  emptyText: { color: color.dark_grey, fontSize: fontSize.regular },

  // FAB
  fab: {
    position: 'absolute',
    bottom: normalize(24),
    right: normalize(24),
    backgroundColor: color.baby_blue,
    width: normalize(56),
    height: normalize(56),
    borderRadius: normalize(28),
    alignItems: 'center',
    justifyContent: 'center',
    elevation: 4,
    shadowColor: '#000',
    shadowOpacity: 0.2,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 2 },
  },
  fabText: {
    color: color.white,
    fontSize: normalize(28),
    fontFamily: fontFamily.bold,
    lineHeight: normalize(32),
  },
});

export default TreasuryDashboard;
