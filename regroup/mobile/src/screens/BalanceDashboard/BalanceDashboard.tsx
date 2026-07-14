import React, { useMemo } from "react";
import { View, FlatList, ActivityIndicator, StyleSheet } from "react-native";
import { format, parseISO } from "date-fns";

import ScreenHeader from "../../components/screen-header";
import { RatsText } from "../../components/rats-text";

import { useData } from "../../context/DataContext";
import {
  useGuestBalances,
  GuestBalance,
} from "../../state/queries/paymentQueries";
import { useGuests } from "../../state/queries/guestQueries";
import BalanceAgingView, { AgingRow } from "./BalanceAgingView";
import {
  color,
  normalize,
  fontSize,
  CARD_STYLE,
  fontFamily,
} from "../../styles/theme";

// ─── Balance Row ─────────────────────────────────────────────────────────────

interface BalanceRowProps {
  item: GuestBalance;
}

const BalanceRow: React.FC<BalanceRowProps> = ({ item }) => {
  const isOverdue = item.status === "overdue";
  return (
    <View
      style={[
        CARD_STYLE,
        styles.row,
        { borderLeftColor: isOverdue ? color.red : color.green },
      ]}
      testID={`balance-row-${item.guestId}`}
    >
      <View style={{ flex: 1 }}>
        <RatsText
          translate={false}
          text={item.guestName}
          style={styles.guestName}
        />
        <RatsText
          translate={false}
          text={
            item.lastPaymentDate
              ? `Last payment: ${format(
                  parseISO(item.lastPaymentDate),
                  "MMM d, yyyy",
                )}`
              : "No payments"
          }
          style={styles.dateText}
        />
      </View>
      <View style={styles.rightColumn}>
        <RatsText
          translate={false}
          text={`$${(item.totalBalance / 100).toFixed(2)}`}
          style={styles.balanceAmount}
        />
        <View
          style={[
            styles.statusBadge,
            { backgroundColor: isOverdue ? color.red : color.green },
          ]}
        >
          <RatsText
            translate={false}
            text={isOverdue ? "Overdue" : "Current"}
            style={styles.statusText}
          />
        </View>
      </View>
    </View>
  );
};

// ─── Screen ──────────────────────────────────────────────────────────────────

const BalanceDashboard: React.FC = () => {
  const { currentHouse } = useData();
  // React Query is the source of truth for guests; see .full-review [A2].
  const { data: guests = {} } = useGuests(currentHouse?.id ?? "");
  const guestList = useMemo(() => Object.values(guests), [guests]);

  const { data: balances = [], isLoading } = useGuestBalances(
    currentHouse?.id ?? "",
    guestList,
  );

  const sorted = useMemo(
    () => [...balances].sort((a, b) => b.totalBalance - a.totalBalance),
    [balances],
  );

  const totalOutstanding = sorted.reduce((sum, b) => sum + b.totalBalance, 0);
  const totalCollected = sorted.reduce((sum, b) => sum + b.totalPaid, 0);
  const collectionRate =
    totalCollected + totalOutstanding > 0
      ? Math.round((totalCollected / (totalCollected + totalOutstanding)) * 100)
      : 0;

  const agingRows: AgingRow[] = useMemo(
    () =>
      sorted
        .filter((b) => b.totalBalance > 0)
        .map((b) => ({
          guestId: b.guestId,
          guestName: b.guestName,
          // Keep totalOwed in cents (matching GuestBalance.totalBalance) so
          // the aging view can render the same cents-precision amount shown
          // in the balance row above it, instead of a whole-dollar rounding.
          totalOwed: b.totalBalance,
          lastPaymentDate: b.lastPaymentDate,
        })),
    [sorted],
  );

  return (
    <View style={styles.container}>
      <ScreenHeader renderBackButton header="Balance Details" />

      {isLoading ? (
        <View style={styles.centered} testID="balance-dashboard-loading">
          <ActivityIndicator size="large" color={color.main} />
        </View>
      ) : (
        <FlatList
          data={sorted}
          keyExtractor={(item) => item.guestId}
          contentContainerStyle={styles.listContent}
          ListHeaderComponent={
            <>
              <View
                style={[CARD_STYLE, styles.statsCard]}
                testID="balance-stats-card"
              >
                <View style={styles.statRow}>
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
                      text="Collection Rate"
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
              <View
                style={[CARD_STYLE, styles.agingCard]}
                testID="balance-aging-section"
              >
                <RatsText
                  translate={false}
                  text="Outstanding Balances"
                  style={styles.agingSectionHeader}
                />
                <BalanceAgingView rows={agingRows} />
              </View>
            </>
          }
          renderItem={({ item }) => <BalanceRow item={item} />}
          ListEmptyComponent={
            <View style={styles.emptyContainer} testID="balance-empty-state">
              <RatsText
                translate={false}
                text="No resident balances to display."
                style={styles.emptyText}
              />
            </View>
          }
        />
      )}
    </View>
  );
};

// ─── Styles ──────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: color.light_grey },
  centered: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    padding: normalize(20),
  },
  listContent: { padding: normalize(12), paddingBottom: normalize(32) },
  statsCard: { marginBottom: normalize(12), padding: normalize(16) },
  statRow: { flexDirection: "row", justifyContent: "space-between" },
  stat: { alignItems: "center", flex: 1 },
  statLabel: {
    fontSize: fontSize.small,
    color: color.dark_grey,
    marginBottom: normalize(4),
    textAlign: "center",
  },
  statValue: { fontSize: fontSize.large, fontFamily: fontFamily.bold },
  row: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: normalize(8),
    borderRadius: 8,
    borderLeftWidth: 4,
    backgroundColor: color.white,
    padding: normalize(12),
  },
  guestName: {
    fontSize: fontSize.medium,
    color: color.black,
    fontFamily: fontFamily.bold,
  },
  dateText: {
    fontSize: fontSize.small,
    color: color.dark_grey,
    marginTop: normalize(2),
  },
  rightColumn: { alignItems: "flex-end" },
  balanceAmount: {
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
  agingCard: { marginBottom: normalize(12), padding: normalize(16) },
  agingSectionHeader: {
    fontSize: fontSize.medium,
    color: color.dark_grey,
    fontFamily: fontFamily.bold,
    marginBottom: normalize(8),
  },
  emptyContainer: {
    justifyContent: "center",
    alignItems: "center",
    padding: normalize(20),
    minHeight: normalize(100),
  },
  emptyText: {
    color: color.dark_grey,
    fontSize: fontSize.regular,
    textAlign: "center",
  },
});

export default BalanceDashboard;
