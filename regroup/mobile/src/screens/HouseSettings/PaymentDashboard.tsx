import React, { useState, useMemo } from 'react';
import {
  View,
  ActivityIndicator,
  Alert,
  StyleSheet,
  TouchableOpacity,
  Modal,
  TextInput,
  ScrollView,
  Share,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { RootStackParamList } from '../../navigation/types';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useFocusEffect } from '@react-navigation/native';
import { useCallback } from 'react';
import {
  paymentKeys,
  useFailedPayments,
} from '../../state/queries/paymentQueries';
import FailedPaymentBanner from '../Payments/FailedPaymentBanner';
import StalePendingBanner from '../Payments/StalePendingBanner';
import { logException } from '../../util/logging';
import { toDateSafe } from '../../util/firestore';
import {
  VictoryBar,
  VictoryChart,
  VictoryAxis,
  VictoryTheme,
} from 'victory-native';
import {
  format,
  isAfter,
  startOfISOWeek,
  startOfMonth,
  subWeeks,
  endOfISOWeek,
  isWithinInterval,
} from 'date-fns';

import ScreenHeader from '../../components/screen-header';
import { RatsText } from '../../components/rats-text';
import RatsButton from '../../components/rats-button/rats-button';

import { useSelectedHouse } from '../../hooks/useSelectedHouse';
import { useGuests } from '../../state/queries/guestQueries';
import {
  listHousePayments,
  recordManualPayment,
  HousePaymentRecord,
} from '../../services/payments';
import { Guest } from '../../entities/Guest';
import {
  color,
  normalize,
  fontSize,
  CARD_STYLE,
  fontFamily,
} from '../../styles/theme';

type DateFilter = 'week' | 'month' | 'all';

interface Props {
  navigation: NativeStackNavigationProp<RootStackParamList>;
}

const PaymentDashboard: React.FC<Props> = ({ navigation }) => {
  const { house } = useSelectedHouse();
  // React Query is the source of truth for guests; see .full-review [A2].
  const { data: guestsData = {} } = useGuests(house?.id ?? '');
  const guests = guestsData as Record<string, Guest>;
  const { data: failedPayments = [] } = useFailedPayments(house?.id ?? '');

  const [dateFilter, setDateFilter] = useState<DateFilter>('month');
  const [showManualModal, setShowManualModal] = useState(false);

  const queryClient = useQueryClient();

  const {
    data: allPayments = [],
    isLoading,
    error,
  } = useQuery({
    queryKey: paymentKeys.housePayments(house?.id ?? ''),
    queryFn: () => listHousePayments(house!.id),
    enabled: !!house?.id,
    staleTime: 60_000,
  });

  const stalePendingPayments = useMemo(() => {
    const cutoff = Date.now() - 24 * 60 * 60 * 1000;
    return allPayments.filter(p => {
      const created = toDateSafe(p.createdAt)?.getTime();
      return (
        p.status === 'pending' && created !== undefined && created < cutoff
      );
    });
  }, [allPayments]);

  const lastLoggedError = React.useRef<unknown>(null);
  React.useEffect(() => {
    if (error && error !== lastLoggedError.current) {
      lastLoggedError.current = error;
      logException(error);
    }
  }, [error]);

  // Refetch on focus so returning from ManualPaymentModal / payment detail
  // shows the up-to-date list instead of a stale cache.
  // exact: true prevents also invalidating useFailedPayments (which shares the
  // same key prefix) and causing a redundant Cloud Function call on every focus.
  useFocusEffect(
    useCallback(() => {
      if (house?.id) {
        queryClient.invalidateQueries({
          queryKey: paymentKeys.housePayments(house.id),
          exact: true,
        });
      }
    }, [house?.id, queryClient]),
  );

  // Memoize the guest array so ManualPaymentModal's guests prop is stable
  // across unrelated PaymentDashboard re-renders.
  const guestList = useMemo(() => Object.values(guests) as Guest[], [guests]);

  const overdueGuests = useMemo(
    () =>
      guestList
        .filter(g => (g.rentOwed ?? 0) > 0)
        .sort((a, b) => (b.rentOwed ?? 0) - (a.rentOwed ?? 0)),
    [guestList],
  );

  const guestNames = useMemo(
    () =>
      guestList.reduce<Record<string, string>>(
        (acc, g) => ({
          ...acc,
          [g.id]:
            `${g.firstName || ''} ${g.lastName || ''}`.trim() ||
            'Unknown Resident',
        }),
        {},
      ),
    [guestList],
  );

  const filteredPayments = useMemo(() => {
    if (dateFilter === 'all') return allPayments;
    const cutoff =
      dateFilter === 'week'
        ? startOfISOWeek(new Date())
        : startOfMonth(new Date());
    return allPayments.filter(p => {
      const createdAt = toDateSafe(p.createdAt);
      return createdAt !== null && isAfter(createdAt, cutoff);
    });
  }, [allPayments, dateFilter]);

  const guestName = useCallback(
    (guestId: string | null): string => {
      if (!guestId) return 'Unknown';
      const g = guests[guestId];
      if (!g) return 'Unknown Resident';
      return (
        `${g.firstName || ''} ${g.lastName || ''}`.trim() || 'Unknown Resident'
      );
    },
    [guests],
  );

  const generateCSV = useCallback((): string => {
    const header = 'Date,Guest Name,Amount,Status,Type';
    const rows = filteredPayments.map(p => {
      const date = (() => {
        const d = toDateSafe(p.createdAt);
        return d ? format(d, 'yyyy-MM-dd') : 'Unknown';
      })();
      const name = `"${guestName(p.guestId)}"`;
      const amount = (p.amount / 100).toFixed(2);
      const status = p.status;
      const type = (p.description ?? '').includes('Manual')
        ? 'Manual'
        : 'Stripe';
      return `${date},${name},${amount},${status},${type}`;
    });
    return [header, ...rows].join('\n');
  }, [filteredPayments, guestName]);

  const handleExportCSV = useCallback(async () => {
    try {
      const csv = generateCSV();
      const filename = `payments-${format(new Date(), 'yyyy-MM-dd')}.csv`;
      await Share.share({
        message: csv,
        title: filename,
      });
    } catch (e) {
      logException(e);
    }
  }, [generateCSV]);

  // Single-pass aggregation memoized on filteredPayments so unrelated re-renders
  // (modal open/close, focus invalidation) don't recompute these every time.
  const { totalCollected, totalOutstanding, collectionRate } = useMemo(() => {
    let collected = 0;
    let outstanding = 0;
    let succeededCount = 0;
    let actionableCount = 0;
    for (const p of filteredPayments) {
      if (p.status === 'succeeded') {
        collected += p.amount;
        succeededCount += 1;
        actionableCount += 1;
      } else if (p.status === 'pending') {
        outstanding += p.amount;
        actionableCount += 1;
      }
      // 'failed' is excluded from actionableCount, matching the prior logic
    }
    return {
      totalCollected: collected,
      totalOutstanding: outstanding,
      collectionRate:
        actionableCount > 0
          ? Math.round((succeededCount / actionableCount) * 100)
          : 0,
    };
  }, [filteredPayments]);

  const weeklyData = useMemo(() => {
    const weeks: { week: string; total: number }[] = [];
    for (let i = 7; i >= 0; i--) {
      const weekStart = startOfISOWeek(subWeeks(new Date(), i));
      const weekEnd = endOfISOWeek(weekStart);
      const total = allPayments
        .filter(p => {
          if (p.status !== 'succeeded') return false;
          const createdAt = toDateSafe(p.createdAt);
          return (
            createdAt !== null &&
            isWithinInterval(createdAt, { start: weekStart, end: weekEnd })
          );
        })
        .reduce((sum, p) => sum + p.amount, 0);
      weeks.push({ week: format(weekStart, 'M/d'), total: total / 100 });
    }
    return weeks;
  }, [allPayments]);

  if (isLoading) {
    return (
      <View style={styles.container}>
        <ScreenHeader renderBackButton header="Payment Dashboard" />
        <View style={styles.centered} testID="payment-dashboard-loading">
          <ActivityIndicator size="large" color={color.main} />
        </View>
      </View>
    );
  }

  if (error) {
    return (
      <View style={styles.container}>
        <ScreenHeader renderBackButton header="Payment Dashboard" />
        <View style={styles.centered}>
          <RatsText
            translate={false}
            text="Failed to load payment data."
            style={styles.errorText}
          />
        </View>
      </View>
    );
  }

  return (
    <View style={styles.container} testID="payment-dashboard-screen">
      <ScreenHeader renderBackButton header="Payment Dashboard" />
      <ScrollView contentContainerStyle={styles.scroll}>
        <FailedPaymentBanner
          failedPayments={failedPayments}
          houseId={house?.id ?? ''}
          guestNames={guestNames}
        />
        <StalePendingBanner
          stalePendingPayments={stalePendingPayments}
          guestNames={guestNames}
        />
        {/* Date Filter Pills */}
        <View style={styles.pills}>
          {(['week', 'month', 'all'] as DateFilter[]).map(f => (
            <TouchableOpacity
              key={f}
              onPress={() => setDateFilter(f)}
              style={[styles.pill, dateFilter === f && styles.pillActive]}>
              <RatsText
                translate={false}
                text={
                  f === 'week'
                    ? 'This Week'
                    : f === 'month'
                    ? 'This Month'
                    : 'All Time'
                }
                style={[
                  styles.pillText,
                  dateFilter === f && styles.pillTextActive,
                ]}
              />
            </TouchableOpacity>
          ))}
        </View>

        {overdueGuests.length > 0 && (
          <View
            testID="overdue-residents-card"
            style={[CARD_STYLE, styles.overdueCard]}>
            <RatsText
              translate={false}
              text={`Overdue Residents (${overdueGuests.length})`}
              style={styles.overdueCardTitle}
            />
            {overdueGuests.map(guest => (
              <View
                key={guest.id}
                testID="overdue-resident-row"
                style={styles.overdueRow}>
                <RatsText
                  translate={false}
                  text={`${guest.firstName || ''} ${
                    guest.lastName || ''
                  }`.trim()}
                  style={styles.overdueGuestName}
                />
                <RatsText
                  translate={false}
                  text={`$${(guest.rentOwed ?? 0).toFixed(2)} owed`}
                  style={styles.overdueAmount}
                />
              </View>
            ))}
          </View>
        )}

        {/* CSV Export */}
        <TouchableOpacity
          testID="csv-export-button"
          style={styles.exportButton}
          onPress={handleExportCSV}>
          <RatsText
            translate={false}
            text="Export CSV"
            style={styles.exportButtonText}
          />
        </TouchableOpacity>

        {/* Stats Card */}
        <View
          style={[CARD_STYLE, styles.statsCard]}
          testID="payment-stats-card">
          <View style={styles.statRow}>
            <View style={styles.stat}>
              <RatsText
                translate={false}
                text="Collected"
                style={styles.statLabel}
              />
              <RatsText
                translate={false}
                text={`$${(totalCollected / 100).toFixed(2)}`}
                style={[styles.statValue, { color: color.green }]}
              />
            </View>
            <View style={styles.stat}>
              <RatsText
                translate={false}
                text="Outstanding"
                style={styles.statLabel}
              />
              <RatsText
                translate={false}
                text={`$${(totalOutstanding / 100).toFixed(2)}`}
                style={[styles.statValue, { color: color.red }]}
              />
            </View>
            <View style={styles.stat}>
              <RatsText
                translate={false}
                text="Collection"
                style={styles.statLabel}
              />
              <RatsText
                translate={false}
                text={`${collectionRate}%`}
                style={[styles.statValue, { color: color.baby_blue }]}
              />
            </View>
          </View>
        </View>

        {/* 8-Week Bar Chart */}
        <View style={[CARD_STYLE, styles.chartCard]}>
          <RatsText
            translate={false}
            text="Weekly Revenue (8 weeks)"
            style={styles.chartTitle}
          />
          <VictoryChart
            theme={VictoryTheme.material}
            height={180}
            padding={{ top: 10, bottom: 40, left: 50, right: 20 }}>
            <VictoryAxis
              tickFormat={(t: string) => t}
              style={{ tickLabels: { fontSize: 9, angle: -30 } }}
            />
            <VictoryAxis dependentAxis tickFormat={(v: number) => `$${v}`} />
            <VictoryBar
              data={weeklyData}
              x="week"
              y="total"
              style={{ data: { fill: color.baby_blue } }}
            />
          </VictoryChart>
        </View>

        {/* Payment List */}
        {filteredPayments.length === 0 ? (
          <View style={styles.emptyContainer} testID="payment-empty-state">
            <RatsText
              translate={false}
              text="No payments in this period."
              style={styles.emptyText}
            />
          </View>
        ) : (
          filteredPayments.map(item => {
            const succeeded = item.status === 'succeeded';
            return (
              <View
                key={item.id}
                style={[
                  CARD_STYLE,
                  styles.paymentCard,
                  { borderLeftColor: succeeded ? color.green : color.red },
                ]}>
                <View style={styles.row}>
                  <View style={{ flex: 1 }}>
                    <RatsText
                      translate={false}
                      text={guestName(item.guestId)}
                      style={styles.guestName}
                    />
                    <RatsText
                      translate={false}
                      text={item.description || ''}
                      style={styles.description}
                    />
                    <RatsText
                      translate={false}
                      text={(() => {
                        const d = toDateSafe(item.createdAt);
                        return d ? format(d, 'MMM d, yyyy') : '—';
                      })()}
                      style={styles.date}
                    />
                  </View>
                  <View style={styles.rightColumn}>
                    <RatsText
                      translate={false}
                      text={`$${(item.amount / 100).toFixed(2)}`}
                      style={styles.amount}
                    />
                    <View
                      style={[
                        styles.statusBadge,
                        {
                          backgroundColor: succeeded ? color.green : color.red,
                        },
                      ]}>
                      <RatsText
                        translate={false}
                        text={item.status.toUpperCase()}
                        style={styles.statusText}
                      />
                    </View>
                  </View>
                </View>
              </View>
            );
          })
        )}
      </ScrollView>

      {/* FAB for manual payment */}
      <TouchableOpacity
        testID="manual-payment-fab"
        style={styles.fab}
        onPress={() => setShowManualModal(true)}>
        <RatsText
          translate={false}
          text="+ Record Payment"
          style={styles.fabText}
        />
      </TouchableOpacity>

      <ManualPaymentModal
        visible={showManualModal}
        onClose={() => setShowManualModal(false)}
        guests={guestList}
        houseId={house?.id ?? ''}
      />
    </View>
  );
};

// ─── Manual Payment Modal ─────────────────────────────────────────────────────

interface ManualPaymentModalProps {
  visible: boolean;
  onClose: () => void;
  guests: Guest[];
  houseId: string;
}

const ManualPaymentModal: React.FC<ManualPaymentModalProps> = ({
  visible,
  onClose,
  guests,
  houseId,
}) => {
  const [amount, setAmount] = useState('');
  const [method, setMethod] = useState<'Cash' | 'Check' | 'Venmo' | 'Zelle'>(
    'Cash',
  );
  const [notes, setNotes] = useState('');
  const [selectedGuestId, setSelectedGuestId] = useState<string | null>(null);
  const queryClient = useQueryClient();

  const handleRecord = async () => {
    if (!selectedGuestId || !houseId || !amount) return;
    const parsed = parseFloat(amount);
    if (isNaN(parsed) || parsed <= 0) return;
    const amountInCents = Math.round(parsed * 100);
    try {
      await recordManualPayment(
        selectedGuestId,
        houseId,
        amountInCents,
        method,
        notes,
      );
      // Refresh the parent dashboard list and any guest-balance views.
      queryClient.invalidateQueries({
        queryKey: paymentKeys.housePayments(houseId),
      });
      queryClient.invalidateQueries({
        queryKey: paymentKeys.guestBalances(houseId),
      });
      queryClient.invalidateQueries({
        queryKey: paymentKeys.history(selectedGuestId),
      });
      setAmount('');
      setNotes('');
      setSelectedGuestId(null);
      setMethod('Cash');
      onClose();
    } catch (err) {
      logException(err);
      Alert.alert('Error', 'Failed to record payment. Please try again.');
    }
  };

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={() => {
        setAmount('');
        setNotes('');
        setSelectedGuestId(null);
        setMethod('Cash');
        onClose();
      }}>
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView
          contentContainerStyle={{ padding: normalize(16) }}
          keyboardShouldPersistTaps="handled">
          <RatsText
            translate={false}
            text="Record Manual Payment"
            style={{ fontSize: fontSize.large, marginBottom: normalize(16) }}
          />
          <RatsText
            translate={false}
            text="Resident"
            style={styles.inputLabel}
          />
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
            style={{ marginBottom: normalize(8) }}>
            {guests.map(g => {
              const name =
                `${g.firstName || ''} ${g.lastName || ''}`.trim() || 'Unknown';
              const selected = selectedGuestId === g.id;
              return (
                <TouchableOpacity
                  key={g.id}
                  testID={`guest-pill-${g.id}`}
                  onPress={() => setSelectedGuestId(g.id)}
                  style={[
                    styles.methodPill,
                    selected && styles.methodPillActive,
                  ]}>
                  <RatsText
                    translate={false}
                    text={name}
                    style={{
                      color: selected ? color.white : color.dark_grey,
                      fontSize: fontSize.small,
                    }}
                  />
                </TouchableOpacity>
              );
            })}
          </ScrollView>
          <TextInput
            placeholder="Amount ($)"
            keyboardType="decimal-pad"
            value={amount}
            onChangeText={setAmount}
            style={styles.input}
          />
          <View style={styles.methodRow}>
            {(['Cash', 'Check', 'Venmo', 'Zelle'] as const).map(m => (
              <TouchableOpacity
                key={m}
                onPress={() => setMethod(m)}
                style={[
                  styles.methodPill,
                  method === m && styles.methodPillActive,
                ]}>
                <RatsText
                  translate={false}
                  text={m}
                  style={{
                    color: method === m ? color.white : color.dark_grey,
                    fontSize: fontSize.small,
                  }}
                />
              </TouchableOpacity>
            ))}
          </View>
          <TextInput
            placeholder="Notes (optional)"
            value={notes}
            onChangeText={setNotes}
            style={[styles.input, { marginTop: normalize(8) }]}
          />
          <RatsButton
            title="Record"
            onPress={handleRecord}
            containerStyle={{ marginTop: normalize(16) }}
          />
          <RatsButton
            title="Cancel"
            light
            onPress={() => {
              setAmount('');
              setNotes('');
              setSelectedGuestId(null);
              setMethod('Cash');
              onClose();
            }}
            containerStyle={{ marginTop: normalize(8) }}
          />
        </ScrollView>
      </KeyboardAvoidingView>
    </Modal>
  );
};

// ─── Styles ──────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: color.light_grey },
  scroll: { padding: normalize(12), paddingBottom: normalize(80) },
  centered: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: normalize(20),
    minHeight: normalize(100),
  },
  emptyContainer: {
    justifyContent: 'center',
    alignItems: 'center',
    padding: normalize(20),
    minHeight: normalize(100),
  },
  pills: { flexDirection: 'row', marginBottom: normalize(12) },
  pill: {
    paddingHorizontal: normalize(14),
    paddingVertical: normalize(6),
    borderRadius: normalize(20),
    marginRight: normalize(8),
    backgroundColor: color.white,
    borderWidth: 1,
    borderColor: color.medium_grey,
  },
  pillActive: {
    backgroundColor: color.baby_blue,
    borderColor: color.baby_blue,
  },
  pillText: { fontSize: fontSize.small, color: color.dark_grey },
  pillTextActive: { color: color.white },
  statsCard: { marginBottom: normalize(12), padding: normalize(16) },
  statRow: { flexDirection: 'row', justifyContent: 'space-between' },
  stat: { alignItems: 'center', flex: 1 },
  statLabel: {
    fontSize: fontSize.small,
    color: color.dark_grey,
    marginBottom: normalize(4),
  },
  statValue: { fontSize: fontSize.large, fontFamily: fontFamily.bold },
  chartCard: { marginBottom: normalize(12), padding: normalize(12) },
  chartTitle: {
    fontSize: fontSize.small,
    color: color.dark_grey,
    marginBottom: normalize(4),
  },
  paymentCard: {
    marginBottom: normalize(8),
    borderRadius: 8,
    borderLeftWidth: 4,
    backgroundColor: color.white,
    padding: normalize(12),
  },
  row: { flexDirection: 'row', alignItems: 'center' },
  guestName: {
    fontSize: fontSize.medium,
    color: color.black,
    fontFamily: fontFamily.bold,
  },
  description: {
    fontSize: fontSize.small,
    color: color.dark_grey,
    marginTop: normalize(2),
  },
  date: {
    fontSize: fontSize.small,
    color: color.grey,
    marginTop: normalize(2),
  },
  rightColumn: { alignItems: 'flex-end' },
  amount: {
    fontSize: fontSize.medium,
    color: color.black,
    fontFamily: fontFamily.bold,
  },
  statusBadge: {
    marginTop: normalize(4),
    paddingHorizontal: normalize(8),
    paddingVertical: normalize(2),
    borderRadius: normalize(4),
  },
  statusText: { fontSize: fontSize.extraSmall, color: color.white },
  emptyText: {
    color: color.dark_grey,
    fontSize: fontSize.regular,
    textAlign: 'center',
  },
  errorText: {
    color: color.red,
    fontSize: fontSize.regular,
    textAlign: 'center',
  },
  fab: {
    position: 'absolute',
    bottom: normalize(24),
    right: normalize(24),
    backgroundColor: color.baby_blue,
    paddingHorizontal: normalize(16),
    paddingVertical: normalize(12),
    borderRadius: normalize(24),
    elevation: 4,
    shadowColor: '#000',
    shadowOpacity: 0.2,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 2 },
  },
  fabText: {
    color: color.white,
    fontSize: fontSize.regular,
    fontFamily: fontFamily.bold,
  },
  input: {
    borderWidth: 1,
    borderColor: color.medium_grey,
    borderRadius: normalize(4),
    padding: normalize(10),
    fontSize: fontSize.regular,
    color: color.black,
    marginBottom: normalize(8),
  },
  methodRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginBottom: normalize(8),
  },
  methodPill: {
    paddingHorizontal: normalize(12),
    paddingVertical: normalize(6),
    borderRadius: normalize(16),
    marginRight: normalize(8),
    marginBottom: normalize(8),
    borderWidth: 1,
    borderColor: color.medium_grey,
    backgroundColor: color.white,
  },
  methodPillActive: {
    backgroundColor: color.baby_blue,
    borderColor: color.baby_blue,
  },
  inputLabel: {
    fontSize: fontSize.small,
    color: color.dark_grey,
    marginBottom: normalize(4),
  },
  overdueCard: { marginBottom: normalize(12), padding: normalize(12) },
  overdueCardTitle: {
    fontSize: fontSize.regular,
    fontFamily: fontFamily.bold,
    color: color.black,
    marginBottom: normalize(8),
  },
  overdueRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: normalize(6),
    borderBottomWidth: 1,
    borderBottomColor: color.medium_grey,
  },
  overdueGuestName: {
    fontSize: fontSize.regular,
    color: color.dark_grey,
  },
  overdueAmount: {
    fontSize: fontSize.regular,
    color: color.red,
    fontFamily: fontFamily.bold,
  },
  exportButton: {
    alignSelf: 'flex-end',
    paddingHorizontal: normalize(12),
    paddingVertical: normalize(6),
    marginBottom: normalize(8),
    borderRadius: normalize(6),
    borderWidth: 1,
    borderColor: color.main,
  },
  exportButtonText: {
    fontSize: fontSize.small,
    color: color.main,
    fontFamily: fontFamily.bold,
  },
});

export default PaymentDashboard;
