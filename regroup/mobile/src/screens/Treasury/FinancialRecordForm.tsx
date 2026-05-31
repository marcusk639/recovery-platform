import React, { useEffect, useState } from 'react';
import {
  Alert,
  ScrollView,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { useNavigation, useRoute } from '@react-navigation/native';
import { useData } from '../../context/DataContext';
import { logException } from '../../util/logging';
import {
  useCreateFinancialRecord,
  useEESIncomeForWeek,
  usePreviousWeekRecord,
  useUpdateFinancialRecord,
} from '../../state/queries/treasuryQueries';
import { getFinancialRecord } from '../../services/treasury';
import {
  BillDue,
  EXPENSE_CATEGORIES,
  FinancialLineItem,
  INCOME_CATEGORIES,
  computeTotals,
  createEmptyBillDue,
  createEmptyLineItem,
} from '../../entities/oxford/FinancialRecord';
import RatsText from '../../components/rats-text/rats-text';
import ScreenHeader from '../../components/screen-header/screen-header';
import {
  CARD_STYLE,
  color,
  fontSize,
  fontFamily,
  normalize,
} from '../../styles/theme';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function centsToDollars(cents: number): string {
  return (cents / 100).toFixed(2);
}

function dollarsToCents(value: string): number {
  const parsed = parseFloat(value);
  if (isNaN(parsed)) {
    return 0;
  }
  return Math.round(parsed * 100);
}

function getCurrentWeekPeriod(): string {
  const now = new Date();
  const day = now.getDay();
  const monday = new Date(now);
  monday.setDate(now.getDate() - (day === 0 ? 6 : day - 1));
  return monday.toISOString().slice(0, 10);
}

function formatWeekRange(periodStart: string): string {
  const start = new Date(periodStart + 'T00:00:00');
  const end = new Date(start);
  end.setDate(start.getDate() + 6);
  const fmt = (d: Date) =>
    d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  return `${fmt(start)} – ${fmt(end)}`;
}

// ─── Component ────────────────────────────────────────────────────────────────

type RouteParams = { houseId: string; recordId?: string };

const FinancialRecordForm: React.FC = () => {
  const navigation = useNavigation();
  const { params } = useRoute() as { params: RouteParams };
  const { houseId, recordId } = params;
  const { currentUser } = useData();

  const period = getCurrentWeekPeriod();

  const { data: previousWeek } = usePreviousWeekRecord(houseId);
  const { data: eesTotal = 0 } = useEESIncomeForWeek(houseId, period);
  const createMutation = useCreateFinancialRecord();
  const updateMutation = useUpdateFinancialRecord();

  // ─── Form state ────────────────────────────────────────────────────────────

  const [beginningBalance, setBeginningBalance] = useState('0.00');
  const [savingsBalance, setSavingsBalance] = useState('');
  const [incomeLines, setIncomeLines] = useState<FinancialLineItem[]>([
    createEmptyLineItem(),
  ]);
  const [expenseLines, setExpenseLines] = useState<FinancialLineItem[]>([
    createEmptyLineItem(),
  ]);
  const [billsDue, setBillsDue] = useState<BillDue[]>([createEmptyBillDue()]);

  // ─── Pre-fill from previous week ───────────────────────────────────────────

  useEffect(() => {
    if (previousWeek?.endingCheckingBalance != null) {
      setBeginningBalance(centsToDollars(previousWeek.endingCheckingBalance));
    }
  }, [previousWeek]);

  // ─── Load existing record when editing ─────────────────────────────────────

  useEffect(() => {
    if (!recordId) {
      return;
    }
    getFinancialRecord(houseId, recordId).then(rec => {
      if (!rec) {
        return;
      }
      setBeginningBalance(centsToDollars(rec.beginningCheckingBalance));
      if (rec.savingsBalance != null) {
        setSavingsBalance(centsToDollars(rec.savingsBalance));
      }
      setIncomeLines(
        rec.incomeLines.length > 0 ? rec.incomeLines : [createEmptyLineItem()],
      );
      setExpenseLines(
        rec.expenseLines.length > 0
          ? rec.expenseLines
          : [createEmptyLineItem()],
      );
      setBillsDue(
        rec.billsDue.length > 0 ? rec.billsDue : [createEmptyBillDue()],
      );
    });
  }, [houseId, recordId]);

  // ─── Derived totals ────────────────────────────────────────────────────────

  const beginningCents = dollarsToCents(beginningBalance);
  const { totalIncome, totalExpenses, endingBalance } = computeTotals(
    incomeLines,
    expenseLines,
    beginningCents,
  );

  // ─── Income line handlers ──────────────────────────────────────────────────

  const addIncomeLine = () =>
    setIncomeLines(prev => [...prev, createEmptyLineItem()]);

  const updateIncomeLine = (
    index: number,
    field: keyof FinancialLineItem,
    value: string | number,
  ) =>
    setIncomeLines(prev =>
      prev.map((item, i) => (i === index ? { ...item, [field]: value } : item)),
    );

  // ─── Expense line handlers ─────────────────────────────────────────────────

  const addExpenseLine = () =>
    setExpenseLines(prev => [...prev, createEmptyLineItem()]);

  const updateExpenseLine = (
    index: number,
    field: keyof FinancialLineItem,
    value: string | number,
  ) =>
    setExpenseLines(prev =>
      prev.map((item, i) => (i === index ? { ...item, [field]: value } : item)),
    );

  // ─── Bills due handlers ────────────────────────────────────────────────────

  const addBill = () => setBillsDue(prev => [...prev, createEmptyBillDue()]);

  const updateBill = (
    index: number,
    field: keyof BillDue,
    value: string | number,
  ) =>
    setBillsDue(prev =>
      prev.map((item, i) => (i === index ? { ...item, [field]: value } : item)),
    );

  // ─── EES pre-fill ──────────────────────────────────────────────────────────

  const addEESLine = () => {
    setIncomeLines(prev => [
      ...prev,
      { category: INCOME_CATEGORIES[0], amount: eesTotal },
    ]);
  };

  // ─── Submit ────────────────────────────────────────────────────────────────

  const buildRecord = (status: 'draft' | 'submitted') => ({
    houseId,
    period,
    status,
    incomeLines,
    expenseLines,
    billsDue,
    beginningCheckingBalance: beginningCents,
    endingCheckingBalance: endingBalance,
    savingsBalance: savingsBalance ? dollarsToCents(savingsBalance) : undefined,
    totalIncome,
    totalExpenses,
    balance: totalIncome - totalExpenses,
    breakdown: [...incomeLines, ...expenseLines],
    submittedBy: currentUser?.id ?? '',
    submittedAt: new Date().toISOString(),
    approvedByVote: false,
  });

  const hasLineItems =
    incomeLines.some(l => l.amount > 0) || expenseLines.some(l => l.amount > 0);

  const handleSave = async (status: 'draft' | 'submitted') => {
    if (status === 'submitted' && !hasLineItems) {
      Alert.alert(
        'Required',
        'Add at least one income or expense line before submitting.',
      );
      return;
    }
    try {
      const record = buildRecord(status) as any;
      if (recordId) {
        await updateMutation.mutateAsync({ houseId, recordId, data: record });
      } else {
        await createMutation.mutateAsync({ houseId, record });
      }
      navigation.goBack();
    } catch (error) {
      logException(error);
      Alert.alert(
        'Error',
        'Failed to save financial record. Please try again.',
      );
    }
  };

  const isPending = createMutation.isPending || updateMutation.isPending;

  // ─── Render ────────────────────────────────────────────────────────────────

  return (
    <View style={styles.container}>
      <ScreenHeader renderBackButton header="Financial Report" />
      <ScrollView contentContainerStyle={styles.scroll}>
        {/* Period */}
        <View style={[CARD_STYLE, styles.section]}>
          <RatsText
            translate={false}
            text={`Week of ${formatWeekRange(period)}`}
            style={styles.periodText}
          />
        </View>

        {/* Beginning balance */}
        <View style={[CARD_STYLE, styles.section]}>
          <RatsText
            translate={false}
            text="Beginning Balance"
            style={styles.sectionHeader}
          />
          <View style={styles.row}>
            <RatsText
              translate={false}
              text="Checking ($)"
              style={styles.label}
            />
            <TextInput
              testID="input-beginning-balance"
              style={styles.amountInput}
              value={beginningBalance}
              onChangeText={setBeginningBalance}
              keyboardType="decimal-pad"
              placeholder="0.00"
            />
          </View>
          <View style={styles.row}>
            <RatsText
              translate={false}
              text="Savings ($)"
              style={styles.label}
            />
            <TextInput
              testID="input-savings-balance"
              style={styles.amountInput}
              value={savingsBalance}
              onChangeText={setSavingsBalance}
              keyboardType="decimal-pad"
              placeholder="0.00"
            />
          </View>
        </View>

        {/* EES banner */}
        {eesTotal > 0 && (
          <View style={styles.eesBanner} testID="ees-banner">
            <RatsText
              translate={false}
              text={`EES collected this week: $${centsToDollars(
                eesTotal,
              )} — Add to income?`}
              style={styles.eesBannerText}
            />
            <TouchableOpacity
              testID="btn-ees-add"
              onPress={addEESLine}
              style={styles.eesBannerButton}>
              <RatsText
                translate={false}
                text="Add"
                style={styles.eesBannerButtonText}
              />
            </TouchableOpacity>
          </View>
        )}

        {/* Income section */}
        <View style={[CARD_STYLE, styles.section]}>
          <RatsText
            translate={false}
            text="Cash & Receipts from Members"
            style={styles.sectionHeader}
          />
          {incomeLines.map((line, index) => (
            <View
              key={index}
              testID={`income-row-${index}`}
              style={styles.lineItem}>
              <TextInput
                testID={`income-category-${index}`}
                style={styles.categoryInput}
                value={line.category}
                onChangeText={val => updateIncomeLine(index, 'category', val)}
                placeholder={INCOME_CATEGORIES.join(' / ')}
              />
              <TextInput
                testID={`income-amount-${index}`}
                style={styles.amountInput}
                value={line.amount > 0 ? centsToDollars(line.amount) : ''}
                onChangeText={val =>
                  updateIncomeLine(index, 'amount', dollarsToCents(val))
                }
                keyboardType="decimal-pad"
                placeholder="0.00"
              />
              <TextInput
                testID={`income-description-${index}`}
                style={styles.descriptionInput}
                value={line.description ?? ''}
                onChangeText={val =>
                  updateIncomeLine(index, 'description', val)
                }
                placeholder="Description (optional)"
              />
            </View>
          ))}
          <TouchableOpacity
            testID="btn-add-income"
            onPress={addIncomeLine}
            style={styles.addButton}>
            <RatsText
              translate={false}
              text="+ Add Income Line"
              style={styles.addButtonText}
            />
          </TouchableOpacity>
        </View>

        {/* Expense section */}
        <View style={[CARD_STYLE, styles.section]}>
          <RatsText
            translate={false}
            text="Amount Paid Out"
            style={styles.sectionHeader}
          />
          {expenseLines.map((line, index) => (
            <View
              key={index}
              testID={`expense-row-${index}`}
              style={styles.lineItem}>
              <TextInput
                testID={`expense-category-${index}`}
                style={styles.categoryInput}
                value={line.category}
                onChangeText={val => updateExpenseLine(index, 'category', val)}
                placeholder={EXPENSE_CATEGORIES[0]}
              />
              <TextInput
                testID={`expense-amount-${index}`}
                style={styles.amountInput}
                value={line.amount > 0 ? centsToDollars(line.amount) : ''}
                onChangeText={val =>
                  updateExpenseLine(index, 'amount', dollarsToCents(val))
                }
                keyboardType="decimal-pad"
                placeholder="0.00"
              />
              <TextInput
                testID={`expense-payee-${index}`}
                style={styles.descriptionInput}
                value={line.payee ?? ''}
                onChangeText={val => updateExpenseLine(index, 'payee', val)}
                placeholder="Payee"
              />
              <TextInput
                testID={`expense-check-${index}`}
                style={styles.descriptionInput}
                value={line.checkNumber ?? ''}
                onChangeText={val =>
                  updateExpenseLine(index, 'checkNumber', val)
                }
                placeholder="Check #"
                keyboardType="number-pad"
              />
              <TextInput
                testID={`expense-description-${index}`}
                style={styles.descriptionInput}
                value={line.description ?? ''}
                onChangeText={val =>
                  updateExpenseLine(index, 'description', val)
                }
                placeholder="Description (optional)"
              />
            </View>
          ))}
          <TouchableOpacity
            testID="btn-add-expense"
            onPress={addExpenseLine}
            style={styles.addButton}>
            <RatsText
              translate={false}
              text="+ Add Expense Line"
              style={styles.addButtonText}
            />
          </TouchableOpacity>
        </View>

        {/* Bills due */}
        <View style={[CARD_STYLE, styles.section]}>
          <RatsText
            translate={false}
            text="Bills To Be Paid (next 30 days)"
            style={styles.sectionHeader}
          />
          {billsDue.map((bill, index) => (
            <View
              key={index}
              testID={`bill-row-${index}`}
              style={styles.lineItem}>
              <TextInput
                testID={`bill-description-${index}`}
                style={styles.categoryInput}
                value={bill.description}
                onChangeText={val => updateBill(index, 'description', val)}
                placeholder="Description"
              />
              <TextInput
                testID={`bill-amount-${index}`}
                style={styles.amountInput}
                value={bill.amount > 0 ? centsToDollars(bill.amount) : ''}
                onChangeText={val =>
                  updateBill(index, 'amount', dollarsToCents(val))
                }
                keyboardType="decimal-pad"
                placeholder="0.00"
              />
              <TextInput
                testID={`bill-due-date-${index}`}
                style={styles.descriptionInput}
                value={bill.dueDate}
                onChangeText={val => updateBill(index, 'dueDate', val)}
                placeholder="Due date (YYYY-MM-DD)"
              />
            </View>
          ))}
          <TouchableOpacity
            testID="btn-add-bill"
            onPress={addBill}
            style={styles.addButton}>
            <RatsText
              translate={false}
              text="+ Add Bill"
              style={styles.addButtonText}
            />
          </TouchableOpacity>
        </View>

        {/* Summary footer */}
        <View style={[CARD_STYLE, styles.section]} testID="summary-footer">
          <RatsText
            translate={false}
            text="Summary"
            style={styles.sectionHeader}
          />
          <View style={styles.summaryRow}>
            <RatsText
              translate={false}
              text="Beginning Balance"
              style={styles.summaryLabel}
            />
            <RatsText
              translate={false}
              text={`$${centsToDollars(beginningCents)}`}
              style={styles.summaryValue}
            />
          </View>
          <View style={styles.summaryRow}>
            <RatsText
              translate={false}
              text="+ Income"
              style={styles.summaryLabel}
            />
            <RatsText
              translate={false}
              text={`$${centsToDollars(totalIncome)}`}
              style={[styles.summaryValue, { color: color.green }]}
            />
          </View>
          <View style={styles.summaryRow}>
            <RatsText
              translate={false}
              text="− Expenses"
              style={styles.summaryLabel}
            />
            <RatsText
              translate={false}
              text={`$${centsToDollars(totalExpenses)}`}
              style={[styles.summaryValue, { color: color.red }]}
            />
          </View>
          <View style={[styles.summaryRow, styles.summaryTotal]}>
            <RatsText
              translate={false}
              text="Ending Balance"
              style={styles.summaryTotalLabel}
            />
            <RatsText
              translate={false}
              text={`$${centsToDollars(endingBalance)}`}
              style={[
                styles.summaryTotalValue,
                { color: endingBalance >= 0 ? color.green : color.red },
              ]}
            />
          </View>
        </View>

        {/* Action buttons */}
        <View style={styles.actionRow}>
          <TouchableOpacity
            testID="btn-save-draft"
            style={[styles.actionButton, styles.draftButton]}
            onPress={() => handleSave('draft')}
            disabled={isPending}>
            <RatsText
              translate={false}
              text="Save Draft"
              style={styles.actionButtonText}
            />
          </TouchableOpacity>
          <TouchableOpacity
            testID="btn-submit"
            style={[styles.actionButton, styles.submitButton]}
            onPress={() => handleSave('submitted')}
            disabled={isPending}>
            <RatsText
              translate={false}
              text="Submit for Approval"
              style={styles.actionButtonText}
            />
          </TouchableOpacity>
        </View>
      </ScrollView>
    </View>
  );
};

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: color.light_grey },
  scroll: { padding: normalize(12), paddingBottom: normalize(40) },

  section: { marginBottom: normalize(12), padding: normalize(12) },

  periodText: {
    fontSize: fontSize.regular,
    color: color.dark_grey,
    textAlign: 'center',
  },

  sectionHeader: {
    fontSize: fontSize.regular_medium,
    fontFamily: fontFamily.bold,
    color: color.dark_grey,
    marginBottom: normalize(8),
  },

  row: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: normalize(8),
  },

  label: { flex: 1, fontSize: fontSize.small, color: color.dark_grey },

  lineItem: { marginBottom: normalize(10) },

  categoryInput: {
    borderWidth: 1,
    borderColor: color.medium_grey,
    borderRadius: normalize(4),
    padding: normalize(8),
    fontSize: fontSize.small,
    color: color.black,
    marginBottom: normalize(4),
    backgroundColor: color.white,
  },

  amountInput: {
    borderWidth: 1,
    borderColor: color.medium_grey,
    borderRadius: normalize(4),
    padding: normalize(8),
    fontSize: fontSize.small,
    color: color.black,
    marginBottom: normalize(4),
    backgroundColor: color.white,
  },

  descriptionInput: {
    borderWidth: 1,
    borderColor: color.medium_grey,
    borderRadius: normalize(4),
    padding: normalize(8),
    fontSize: fontSize.small,
    color: color.dark_grey,
    marginBottom: normalize(4),
    backgroundColor: color.white,
  },

  addButton: { marginTop: normalize(4) },

  addButtonText: {
    fontSize: fontSize.small,
    color: color.baby_blue,
    fontFamily: fontFamily.bold,
  },

  eesBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#EFF6FF',
    borderWidth: 1,
    borderColor: '#BFDBFE',
    borderRadius: normalize(8),
    padding: normalize(10),
    marginBottom: normalize(12),
  },

  eesBannerText: {
    flex: 1,
    fontSize: fontSize.small,
    color: '#1D4ED8',
  },

  eesBannerButton: {
    backgroundColor: '#2563EB',
    borderRadius: normalize(4),
    paddingHorizontal: normalize(10),
    paddingVertical: normalize(6),
  },

  eesBannerButtonText: {
    fontSize: fontSize.small,
    color: color.white,
    fontFamily: fontFamily.bold,
  },

  summaryRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: normalize(6),
  },

  summaryLabel: { fontSize: fontSize.small, color: color.dark_grey },

  summaryValue: {
    fontSize: fontSize.small,
    color: color.dark_grey,
    fontFamily: fontFamily.bold,
  },

  summaryTotal: {
    borderTopWidth: 1,
    borderTopColor: color.medium_grey,
    paddingTop: normalize(6),
    marginTop: normalize(4),
  },

  summaryTotalLabel: {
    fontSize: fontSize.regular,
    fontFamily: fontFamily.bold,
    color: color.dark_grey,
  },

  summaryTotalValue: {
    fontSize: fontSize.regular,
    fontFamily: fontFamily.bold,
  },

  actionRow: {
    flexDirection: 'row',
    gap: normalize(10),
    marginBottom: normalize(20),
  },

  actionButton: {
    flex: 1,
    paddingVertical: normalize(12),
    borderRadius: normalize(8),
    alignItems: 'center',
  },

  draftButton: { backgroundColor: color.dark_grey },

  submitButton: { backgroundColor: color.baby_blue },

  actionButtonText: {
    color: color.white,
    fontSize: fontSize.regular,
    fontFamily: fontFamily.bold,
  },
});

export default FinancialRecordForm;
