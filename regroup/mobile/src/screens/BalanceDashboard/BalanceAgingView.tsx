import React from "react";
import { View, FlatList, StyleSheet } from "react-native";
import { differenceInDays, parseISO } from "date-fns";
import { RatsText } from "../../components/rats-text";
import { color, normalize, fontSize } from "../../styles/theme";

export interface AgingRow {
  guestId: string;
  guestName: string;
  /** Amount owed, in cents — matches GuestBalance.totalBalance precision. */
  totalOwed: number;
  lastPaymentDate: string | null;
}

interface Props {
  rows: AgingRow[];
}

/**
 * Convert cents to dollars and format, e.g. 15050 -> "$150.50".
 * Matches the cents-precision convention used elsewhere on this screen
 * (see BalanceDashboard's per-resident balance row) so the aging section
 * doesn't show a rounded whole-dollar figure while the rest of the screen
 * shows cents.
 */
function formatCentsAsCurrency(amountInCents: number): string {
  return `$${(amountInCents / 100).toFixed(2)}`;
}

function getDaysOverdue(lastPaymentDate: string | null): number | null {
  if (!lastPaymentDate) {
    return null;
  }
  return differenceInDays(new Date(), parseISO(lastPaymentDate));
}

function agingColor(days: number | null): string {
  if (days === null) {
    return color.red;
  }
  if (days > 30) {
    return color.red;
  }
  if (days > 14) {
    return color.orange;
  }
  return color.dark_grey;
}

const BalanceAgingView: React.FC<Props> = ({ rows }) => {
  if (rows.length === 0) {
    return (
      <View style={styles.empty}>
        <RatsText
          translate={false}
          text="All balances current"
          style={styles.emptyText}
        />
      </View>
    );
  }

  return (
    <FlatList
      data={rows}
      scrollEnabled={false}
      keyExtractor={(item) => item.guestId}
      renderItem={({ item }) => {
        const days = getDaysOverdue(item.lastPaymentDate);
        const labelText =
          days === null
            ? "No payment on record"
            : `${days} days since last payment`;
        return (
          <View style={styles.row}>
            <View style={styles.nameCol}>
              <RatsText
                translate={false}
                text={item.guestName}
                style={styles.name}
              />
              <RatsText
                translate={false}
                text={labelText}
                style={[styles.aging, { color: agingColor(days) }]}
              />
            </View>
            <RatsText
              translate={false}
              text={formatCentsAsCurrency(item.totalOwed)}
              style={[styles.balance, { color: agingColor(days) }]}
            />
          </View>
        );
      }}
    />
  );
};

const styles = StyleSheet.create({
  row: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: normalize(10),
    borderBottomWidth: 1,
    borderBottomColor: color.grey,
  },
  nameCol: { flex: 1 },
  name: {
    fontSize: fontSize.regular,
    color: color.dark_grey,
    fontWeight: "600",
  },
  aging: { fontSize: fontSize.small, marginTop: normalize(2) },
  balance: {
    fontSize: fontSize.regular,
    fontWeight: "700",
    minWidth: normalize(60),
    textAlign: "right",
  },
  empty: { padding: normalize(24), alignItems: "center" },
  emptyText: { fontSize: fontSize.regular, color: color.grey },
});

export default BalanceAgingView;
