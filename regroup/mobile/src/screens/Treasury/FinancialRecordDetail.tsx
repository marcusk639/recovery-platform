import React, { useState } from "react";
import {
  Alert,
  ScrollView,
  StyleSheet,
  TouchableOpacity,
  View,
} from "react-native";
import { useNavigation, useRoute } from "@react-navigation/native";
import { useQuery } from "@tanstack/react-query";
import { useData } from "../../context/DataContext";
import { useModal } from "../../context";
import {
  treasuryKeys,
  useApproveRecord,
  useRejectRecord,
} from "../../state/queries/treasuryQueries";
import { getFinancialRecord } from "../../services/treasury";
import { shareWeeklyReport } from "../../services/treasuryReport";
import { useTreasuryRole } from "../../hooks/useTreasuryRole";
import { Routes } from "../../navigation/types";
import type { FinancialRecord } from "../../entities/oxford/FinancialRecord";
import RatsText from "../../components/rats-text/rats-text";
import ScreenHeader from "../../components/screen-header/screen-header";
import RatsLoadingIndicator from "../../components/rats-loading-indicator/rats-loading-indicator";
import RatsTextInput from "../../components/rats-text-input/rats-text-input";
import RatsButton from "../../components/rats-button/rats-button";
import { logException } from "../../util/logging";
import {
  CARD_STYLE,
  color,
  fontSize,
  fontFamily,
  normalize,
} from "../../styles/theme";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fmt(cents: number): string {
  return `$${(Math.abs(cents) / 100).toFixed(2)}`;
}

function formatWeekRange(periodStart: string): string {
  const start = new Date(periodStart + "T00:00:00");
  const end = new Date(start);
  end.setDate(start.getDate() + 6);
  const fmtDate = (d: Date) =>
    d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
  return `${fmtDate(start)} – ${fmtDate(end)}`;
}

const STATUS_COLORS: Record<FinancialRecord["status"], string> = {
  draft: color.medium_grey,
  submitted: "#F59E0B",
  approved: color.green,
  rejected: color.red,
};

// ─── Reject record form ─────────────────────────────────────────────────────
// A standalone, independently-mounted component so its own text input state
// re-renders correctly inside the frozen showFormModal snapshot (see
// handleReject below for why this can't just be inline JSX + outer state).

interface RejectRecordFormProps {
  onSubmit: (reason: string) => Promise<void>;
}

const RejectRecordForm: React.FC<RejectRecordFormProps> = ({ onSubmit }) => {
  const [reason, setReason] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handlePress = async () => {
    if (!reason.trim()) {
      return;
    }
    setIsSubmitting(true);
    try {
      await onSubmit(reason.trim());
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <View style={{ padding: normalize(15) }}>
      <RatsText
        text="Please provide a reason for rejection:"
        style={{ fontSize: fontSize.medium, marginBottom: normalize(10) }}
      />
      <RatsTextInput
        testID="reject-reason-input"
        placeholder="Reason for rejection"
        field={{ name: "rejectionReason", value: reason }}
        customHandleChange={setReason}
      />
      <RatsButton
        testID="submit-rejection-button"
        title="REJECT RECORD"
        onPress={handlePress}
        disabled={isSubmitting || !reason.trim()}
        containerStyle={{ marginTop: normalize(15) }}
      />
    </View>
  );
};

// ─── Component ────────────────────────────────────────────────────────────────

type RouteParams = { recordId: string; houseId: string };

const FinancialRecordDetail: React.FC = () => {
  const navigation = useNavigation<any>();
  const { params } = useRoute() as { params: RouteParams };
  const { houseId, recordId } = params;

  const { currentUser, currentHouse } = useData();
  const { canCreate, canApprove } = useTreasuryRole(houseId);

  const { data: record, isLoading } = useQuery<FinancialRecord | null>({
    queryKey: treasuryKeys.record(houseId, recordId),
    queryFn: () => getFinancialRecord(houseId, recordId),
    enabled: !!houseId && !!recordId,
  });

  const approveMutation = useApproveRecord();
  const rejectMutation = useRejectRecord();
  const { showFormModal, dismissFormModal } = useModal();

  const handleApprove = async () => {
    if (!record) {
      return;
    }
    try {
      await approveMutation.mutateAsync({
        houseId,
        recordId,
        userId: currentUser?.uid ?? "",
      });
      Alert.alert("Approved", "Financial record has been approved.");
    } catch {
      Alert.alert("Error", "Failed to approve record.");
    }
  };

  // Hardened 2026-07-05: Alert.prompt is gated to iOS only in React Native's
  // source (no Android branch at all), so this admin-only "Reject" button
  // silently did nothing on Android. Replaced with a cross-platform text
  // input modal. The form is its own mounted component (RejectRecordForm)
  // rather than inline JSX built from this component's state — showFormModal
  // stores whatever element it's given as a frozen snapshot in ModalContext,
  // so a controlled input driven by this component's state would never
  // reflect keystrokes (this component re-rendering doesn't re-render
  // ModalProvider). A real, independently-mounted component re-renders
  // itself correctly on its own state changes, same as AddManager.tsx.
  const handleReject = () => {
    if (!record) {
      return;
    }
    showFormModal(
      <RejectRecordForm
        onSubmit={async (reason) => {
          try {
            await rejectMutation.mutateAsync({ houseId, recordId, reason });
            dismissFormModal();
          } catch (error) {
            logException(error, "Failed to reject financial record");
            Alert.alert("Error", "Failed to reject record.");
          }
        }}
      />,
      "Reject Record",
      true
    );
  };

  const handleShare = async () => {
    if (!record) {
      return;
    }
    const houseName = currentHouse?.name ?? "";
    const submitterName = record.submittedBy ?? "";
    const approverName = record.approvedBy;
    await shareWeeklyReport(record, houseName, submitterName, approverName);
  };

  const handleEditResubmit = () => {
    navigation.navigate(Routes.FinancialRecordForm, { recordId, houseId });
  };

  if (isLoading) {
    return <RatsLoadingIndicator />;
  }

  if (!record) {
    return (
      <View style={styles.container}>
        <ScreenHeader renderBackButton header="Financial Record" />
        <View style={styles.emptyState}>
          <RatsText translate={false} text="Record not found." />
        </View>
      </View>
    );
  }

  const statusColor = STATUS_COLORS[record.status];
  const headerTitle = `Week of ${formatWeekRange(record.period)}`;

  return (
    <View style={styles.container}>
      <ScreenHeader renderBackButton header={headerTitle} />
      <ScrollView contentContainerStyle={styles.scroll}>
        {/* Status badge */}
        <View style={styles.statusRow}>
          <View style={[styles.statusBadge, { backgroundColor: statusColor }]}>
            <RatsText
              translate={false}
              text={record.status.toUpperCase()}
              style={styles.statusText}
            />
          </View>
        </View>

        {/* Balance summary */}
        <View style={[CARD_STYLE, styles.section]} testID="balance-summary">
          <View style={styles.balanceRow}>
            <View style={styles.balanceItem}>
              <RatsText
                translate={false}
                text="Beginning Balance"
                style={styles.balanceLabel}
              />
              <RatsText
                translate={false}
                text={fmt(record.beginningCheckingBalance)}
                style={styles.balanceValue}
              />
            </View>
            <RatsText translate={false} text="→" style={styles.balanceArrow} />
            <View style={styles.balanceItem}>
              <RatsText
                translate={false}
                text="Ending Balance"
                style={styles.balanceLabel}
              />
              <RatsText
                translate={false}
                text={fmt(record.endingCheckingBalance)}
                style={[
                  styles.balanceValue,
                  {
                    color:
                      record.endingCheckingBalance >= 0
                        ? color.green
                        : color.red,
                  },
                ]}
              />
            </View>
          </View>
        </View>

        {/* Income breakdown */}
        <View style={[CARD_STYLE, styles.section]} testID="income-section">
          <RatsText
            translate={false}
            text="Cash & Receipts from Members"
            style={styles.sectionHeader}
          />
          {record.incomeLines.map((line, index) => (
            <View
              key={index}
              testID={`income-line-${index}`}
              style={styles.tableRow}
            >
              <RatsText
                translate={false}
                text={line.category}
                style={styles.tableCell}
              />
              {line.description ? (
                <RatsText
                  translate={false}
                  text={line.description}
                  style={styles.tableCellMuted}
                />
              ) : null}
              <RatsText
                translate={false}
                text={fmt(line.amount)}
                style={styles.tableCellAmount}
              />
            </View>
          ))}
          <View style={[styles.tableRow, styles.subtotalRow]}>
            <RatsText
              translate={false}
              text="Total Receipts"
              style={styles.subtotalLabel}
            />
            <RatsText
              translate={false}
              text={fmt(record.totalIncome)}
              style={styles.subtotalValue}
            />
          </View>
        </View>

        {/* Expense breakdown */}
        <View style={[CARD_STYLE, styles.section]} testID="expense-section">
          <RatsText
            translate={false}
            text="Amount Paid Out"
            style={styles.sectionHeader}
          />
          {record.expenseLines.map((line, index) => (
            <View
              key={index}
              testID={`expense-line-${index}`}
              style={styles.tableRow}
            >
              <View style={styles.tableCellGroup}>
                <RatsText
                  translate={false}
                  text={line.category}
                  style={styles.tableCell}
                />
                {line.payee ? (
                  <RatsText
                    translate={false}
                    text={line.payee}
                    style={styles.tableCellMuted}
                  />
                ) : null}
                {line.checkNumber ? (
                  <RatsText
                    translate={false}
                    text={`Check #${line.checkNumber}`}
                    style={styles.tableCellMuted}
                  />
                ) : null}
              </View>
              <RatsText
                translate={false}
                text={fmt(line.amount)}
                style={styles.tableCellAmount}
              />
            </View>
          ))}
          <View style={[styles.tableRow, styles.subtotalRow]}>
            <RatsText
              translate={false}
              text="Total Paid Out"
              style={styles.subtotalLabel}
            />
            <RatsText
              translate={false}
              text={fmt(record.totalExpenses)}
              style={styles.subtotalValue}
            />
          </View>
        </View>

        {/* Bills due */}
        {record.billsDue.length > 0 && (
          <View style={[CARD_STYLE, styles.section]} testID="bills-section">
            <RatsText
              translate={false}
              text="Bills To Be Paid"
              style={styles.sectionHeader}
            />
            {record.billsDue.map((bill, index) => (
              <View
                key={index}
                testID={`bill-line-${index}`}
                style={styles.tableRow}
              >
                <RatsText
                  translate={false}
                  text={bill.description}
                  style={styles.tableCell}
                />
                <RatsText
                  translate={false}
                  text={bill.dueDate}
                  style={styles.tableCellMuted}
                />
                <RatsText
                  translate={false}
                  text={fmt(bill.amount)}
                  style={styles.tableCellAmount}
                />
              </View>
            ))}
          </View>
        )}

        {/* Totals section */}
        <View style={[CARD_STYLE, styles.section]} testID="totals-section">
          <View style={styles.totalRow}>
            <RatsText
              translate={false}
              text="Beginning Balance"
              style={styles.totalLabel}
            />
            <RatsText
              translate={false}
              text={fmt(record.beginningCheckingBalance)}
              style={styles.totalValue}
            />
          </View>
          <View style={styles.totalRow}>
            <RatsText
              translate={false}
              text="+ Income"
              style={styles.totalLabel}
            />
            <RatsText
              translate={false}
              text={fmt(record.totalIncome)}
              style={[styles.totalValue, { color: color.green }]}
            />
          </View>
          <View style={styles.totalRow}>
            <RatsText
              translate={false}
              text="− Expenses"
              style={styles.totalLabel}
            />
            <RatsText
              translate={false}
              text={fmt(record.totalExpenses)}
              style={[styles.totalValue, { color: color.red }]}
            />
          </View>
          <View style={[styles.totalRow, styles.totalFinalRow]}>
            <RatsText
              translate={false}
              text="= Ending Balance"
              style={styles.totalFinalLabel}
            />
            <RatsText
              translate={false}
              text={fmt(record.endingCheckingBalance)}
              style={[
                styles.totalFinalValue,
                {
                  color:
                    record.endingCheckingBalance >= 0 ? color.green : color.red,
                },
              ]}
            />
          </View>
        </View>

        {/* Approval section */}
        {record.status === "submitted" && canApprove && (
          <View style={[CARD_STYLE, styles.section]} testID="approval-section">
            <View style={styles.actionRow}>
              <TouchableOpacity
                testID="btn-approve"
                style={[styles.actionButton, styles.approveButton]}
                onPress={handleApprove}
                disabled={approveMutation.isPending}
              >
                <RatsText
                  translate={false}
                  text="Approve"
                  style={styles.actionButtonText}
                />
              </TouchableOpacity>
              <TouchableOpacity
                testID="btn-reject"
                style={[styles.actionButton, styles.rejectButton]}
                onPress={handleReject}
                disabled={rejectMutation.isPending}
              >
                <RatsText
                  translate={false}
                  text="Reject"
                  style={styles.actionButtonText}
                />
              </TouchableOpacity>
            </View>
          </View>
        )}

        {/* Rejection info */}
        {record.status === "rejected" && (
          <View style={[CARD_STYLE, styles.section]} testID="rejection-section">
            <RatsText
              translate={false}
              text="Rejection Reason"
              style={styles.sectionHeader}
            />
            <RatsText
              translate={false}
              text={record.rejectionReason ?? "No reason provided."}
              style={styles.rejectionReason}
            />
            {canCreate && (
              <TouchableOpacity
                testID="btn-edit-resubmit"
                style={[styles.actionButton, styles.editButton]}
                onPress={handleEditResubmit}
              >
                <RatsText
                  translate={false}
                  text="Edit & Resubmit"
                  style={styles.actionButtonText}
                />
              </TouchableOpacity>
            )}
          </View>
        )}

        {/* Share button */}
        {record.status === "approved" && (
          <View style={styles.shareRow}>
            <TouchableOpacity
              testID="btn-share"
              style={[styles.actionButton, styles.shareButton]}
              onPress={handleShare}
            >
              <RatsText
                translate={false}
                text="Share Report"
                style={styles.actionButtonText}
              />
            </TouchableOpacity>
          </View>
        )}
      </ScrollView>
    </View>
  );
};

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: color.light_grey },
  scroll: { padding: normalize(12), paddingBottom: normalize(40) },
  emptyState: { flex: 1, alignItems: "center", justifyContent: "center" },

  statusRow: {
    alignItems: "flex-end",
    marginBottom: normalize(8),
  },
  statusBadge: {
    paddingHorizontal: normalize(10),
    paddingVertical: normalize(4),
    borderRadius: normalize(12),
  },
  statusText: {
    fontSize: fontSize.tiny ?? 10,
    color: color.white,
    fontFamily: fontFamily.bold,
  },

  section: { marginBottom: normalize(12), padding: normalize(12) },

  sectionHeader: {
    fontSize: fontSize.regular_medium,
    fontFamily: fontFamily.bold,
    color: color.dark_grey,
    marginBottom: normalize(8),
  },

  balanceRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  balanceItem: { alignItems: "center", flex: 1 },
  balanceLabel: {
    fontSize: fontSize.small,
    color: color.dark_grey,
    marginBottom: normalize(4),
    textAlign: "center",
  },
  balanceValue: {
    fontSize: fontSize.regular_medium,
    fontFamily: fontFamily.bold,
    color: color.dark_grey,
  },
  balanceArrow: {
    fontSize: fontSize.regular_medium,
    color: color.medium_grey,
    marginHorizontal: normalize(8),
  },

  tableRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: normalize(4),
    borderBottomWidth: 1,
    borderBottomColor: color.light_grey,
  },
  tableCellGroup: { flex: 1 },
  tableCell: { flex: 1, fontSize: fontSize.small, color: color.dark_grey },
  tableCellMuted: {
    fontSize: fontSize.tiny ?? 10,
    color: color.medium_grey,
  },
  tableCellAmount: {
    fontSize: fontSize.small,
    fontFamily: fontFamily.bold,
    color: color.dark_grey,
    marginLeft: normalize(8),
  },

  subtotalRow: {
    borderTopWidth: 1,
    borderTopColor: color.medium_grey,
    borderBottomWidth: 0,
    marginTop: normalize(4),
    paddingTop: normalize(4),
  },
  subtotalLabel: {
    flex: 1,
    fontSize: fontSize.small,
    fontFamily: fontFamily.bold,
    color: color.dark_grey,
  },
  subtotalValue: {
    fontSize: fontSize.small,
    fontFamily: fontFamily.bold,
    color: color.dark_grey,
  },

  totalRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: normalize(6),
  },
  totalLabel: { fontSize: fontSize.small, color: color.dark_grey },
  totalValue: {
    fontSize: fontSize.small,
    fontFamily: fontFamily.bold,
    color: color.dark_grey,
  },
  totalFinalRow: {
    borderTopWidth: 1,
    borderTopColor: color.medium_grey,
    paddingTop: normalize(6),
    marginTop: normalize(4),
  },
  totalFinalLabel: {
    fontSize: fontSize.regular,
    fontFamily: fontFamily.bold,
    color: color.dark_grey,
  },
  totalFinalValue: {
    fontSize: fontSize.regular,
    fontFamily: fontFamily.bold,
  },

  rejectionReason: {
    fontSize: fontSize.small,
    color: color.dark_grey,
    marginBottom: normalize(12),
  },

  actionRow: {
    flexDirection: "row",
    gap: normalize(10),
  },
  shareRow: {
    marginBottom: normalize(16),
  },
  actionButton: {
    flex: 1,
    paddingVertical: normalize(12),
    borderRadius: normalize(8),
    alignItems: "center",
  },
  approveButton: { backgroundColor: color.green },
  rejectButton: { backgroundColor: color.red },
  editButton: {
    flex: 0,
    backgroundColor: color.baby_blue,
    paddingHorizontal: normalize(16),
  },
  shareButton: { backgroundColor: color.baby_blue, flex: 0 },
  actionButtonText: {
    color: color.white,
    fontSize: fontSize.regular,
    fontFamily: fontFamily.bold,
  },
});

export default FinancialRecordDetail;
