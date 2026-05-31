import React, {useState, useEffect, useCallback, useMemo} from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Alert,
  ActivityIndicator,
  SafeAreaView,
} from 'react-native';
import {useRoute, RouteProp, useNavigation} from '@react-navigation/native';
import {StackNavigationProp} from '@react-navigation/stack';
import auth from '@react-native-firebase/auth';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import {format, startOfMonth, endOfMonth, subMonths, addMonths} from 'date-fns';

import {GroupStackParamList} from '../../types/navigation';
import {FinancialReport, Transaction} from '../../types/domain/treasury';
import {TreasuryModel} from '../../models/TreasuryModel';
import {TreasuryReportService} from '../../services/reports/TreasuryReportService';
import {useAppSelector} from '../../store';
import {selectGroupById} from '../../store/slices/groupsSlice';
import {selectIsTreasurerForGroup} from '../../store/slices/servicePositionsSlice';
import {useTrialStatus} from '../../hooks/useTrialStatus';
import {logError} from '../../utils/crashlytics';

type TreasuryReportScreenRouteProp = RouteProp<
  GroupStackParamList,
  'TreasuryReport'
>;

type TreasuryReportScreenNavigationProp = StackNavigationProp<
  GroupStackParamList,
  'TreasuryReport'
>;

type ReportData = Omit<FinancialReport, 'id' | 'createdBy' | 'createdAt'>;

// Format currency helper (module-scope so TransactionItem can share it)
const formatCurrency = (amount: number) => `$${Math.abs(amount).toFixed(2)}`;

interface TransactionItemProps {
  tx: Transaction;
}

const TransactionItem: React.FC<TransactionItemProps> = React.memo(({tx}) => (
  <View style={styles.transactionItem}>
    <View style={styles.transactionLeft}>
      <Text style={styles.transactionDate}>
        {tx.createdAt ? format(tx.createdAt, 'MMM d') : 'N/A'}
      </Text>
      <View style={styles.transactionInfo}>
        <Text style={styles.transactionCategory}>{tx.category}</Text>
        {tx.description && (
          <Text style={styles.transactionDescription} numberOfLines={1}>
            {tx.description}
          </Text>
        )}
      </View>
    </View>
    <Text
      style={[
        styles.transactionAmount,
        {color: tx.type === 'income' ? '#4CAF50' : '#F44336'},
      ]}>
      {tx.type === 'income' ? '+' : '-'}
      {formatCurrency(tx.amount)}
    </Text>
  </View>
));

const TreasuryReportScreen: React.FC = () => {
  const route = useRoute<TreasuryReportScreenRouteProp>();
  const navigation = useNavigation<TreasuryReportScreenNavigationProp>();
  const {groupId, groupName, savedReportId} = route.params;
  const currentUser = auth().currentUser;

  // State
  const [selectedDate, setSelectedDate] = useState(new Date());
  const [isGenerating, setIsGenerating] = useState(false);
  const [report, setReport] = useState<ReportData | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [isSharing, setIsSharing] = useState(false);
  const [viewingSavedReport, setViewingSavedReport] =
    useState<FinancialReport | null>(null);

  // Redux selectors
  const group = useAppSelector(state => selectGroupById(state, groupId));
  const isTreasurerFromPosition = useAppSelector(state =>
    selectIsTreasurerForGroup(state, groupId, currentUser?.uid || ''),
  );

  // Check permissions
  const isAdmin = group?.admins.includes(currentUser?.uid || '') ?? false;
  const isTreasurer =
    isTreasurerFromPosition ||
    (group?.treasurers?.includes(currentUser?.uid || '') ?? false);
  const canAccessTreasury = isAdmin || isTreasurer;

  const trialStatus = useTrialStatus(groupId);
  const isSubscriptionActive =
    (trialStatus.isInTrial && !trialStatus.isExpired) || trialStatus.isActive;

  // Memoize date boundaries — date-fns returns a new object every call,
  // which would cause generateReport's useCallback to get a new reference
  // every render, triggering an infinite effect loop.
  const startDate = useMemo(() => startOfMonth(selectedDate), [selectedDate]);
  const endDate = useMemo(() => endOfMonth(selectedDate), [selectedDate]);

  // Generate the report
  const generateReport = useCallback(async () => {
    if (!canAccessTreasury) {
      Alert.alert('Error', 'You do not have permission to generate reports');
      return;
    }

    if (!isSubscriptionActive) {
      navigation.navigate('SubscriptionUpgrade', {groupId, groupName});
      return;
    }

    setIsGenerating(true);
    try {
      const reportData = await TreasuryModel.generateReport(
        groupId,
        startDate,
        endDate,
      );
      setReport(reportData);
    } catch (error: unknown) {
      logError(
        error instanceof Error ? error : new Error(String(error)),
        'TreasuryReport.generateReport',
      );
      const message =
        error instanceof Error
          ? error.message
          : 'Failed to generate report. Please try again.';
      Alert.alert('Error', message);
    } finally {
      setIsGenerating(false);
    }
  }, [
    groupId,
    groupName,
    startDate,
    endDate,
    canAccessTreasury,
    isSubscriptionActive,
    navigation,
  ]);

  // Load saved report or generate fresh report on initial load
  useEffect(() => {
    const loadInitialReport = async () => {
      if (!isSubscriptionActive) {
        navigation.navigate('SubscriptionUpgrade', {groupId, groupName});
        return;
      }
      if (savedReportId) {
        setIsGenerating(true);
        try {
          const savedReports = await TreasuryModel.getSavedReports(groupId);
          const savedReport = savedReports.find(r => r.id === savedReportId);
          if (savedReport) {
            setViewingSavedReport(savedReport);
            setReport(savedReport);
            setSelectedDate(savedReport.startDate);
          } else {
            Alert.alert('Error', 'Saved report not found');
            generateReport();
          }
        } catch (error) {
          logError(
            error instanceof Error ? error : new Error(String(error)),
            'TreasuryReport.loadSavedReport',
          );
          Alert.alert('Error', 'Failed to load saved report');
          generateReport();
        }
        setIsGenerating(false);
      } else {
        generateReport();
      }
    };
    loadInitialReport();
  }, [
    savedReportId,
    isSubscriptionActive,
    groupId,
    groupName,
    navigation,
    generateReport,
  ]);

  // Save the report
  const handleSaveReport = async () => {
    if (!report) return;

    setIsSaving(true);
    try {
      await TreasuryModel.saveReport({
        ...report,
        createdBy: currentUser?.uid || '',
      });
      Alert.alert('Success', 'Report saved successfully');
    } catch (error: unknown) {
      logError(
        error instanceof Error ? error : new Error(String(error)),
        'TreasuryReport.saveReport',
      );
      const message =
        error instanceof Error ? error.message : 'Failed to save report';
      Alert.alert('Error', message);
    } finally {
      setIsSaving(false);
    }
  };

  // Share as text
  const handleShareText = async () => {
    if (!report) return;

    setIsSharing(true);
    try {
      await TreasuryReportService.shareAsText(report, groupName);
    } catch (error: unknown) {
      logError(
        error instanceof Error ? error : new Error(String(error)),
        'TreasuryReport.shareReport',
      );
      const message =
        error instanceof Error ? error.message : 'Failed to share report';
      // Don't show error for user cancellation
      if (message !== 'User did not share') {
        Alert.alert('Error', message);
      }
    }
    // Always reset loading state after share completes or is dismissed
    setIsSharing(false);
  };

  // Share as PDF
  const handleSharePDF = async () => {
    if (!report) return;

    setIsSharing(true);
    try {
      await TreasuryReportService.shareAsPDF(
        report,
        groupName,
        currentUser?.displayName || undefined,
      );
    } catch (error: unknown) {
      logError(
        error instanceof Error ? error : new Error(String(error)),
        'TreasuryReport.sharePDF',
      );
      const message =
        error instanceof Error ? error.message : 'Failed to generate PDF';
      // Don't show error for user cancellation
      if (message !== 'User did not share') {
        Alert.alert('Error', message);
      }
    }
    // Always reset loading state after share completes or is dismissed
    setIsSharing(false);
  };

  // Navigate months
  const goToPreviousMonth = () => {
    const newDate = subMonths(selectedDate, 1);
    setSelectedDate(newDate);
    setReport(null);
    setViewingSavedReport(null);
  };

  const goToNextMonth = () => {
    const now = new Date();
    const newDate = addMonths(selectedDate, 1);
    if (newDate <= now) {
      setSelectedDate(newDate);
      setReport(null);
      setViewingSavedReport(null);
    }
  };

  // Clear saved report view and generate fresh
  const handleGenerateFresh = () => {
    setViewingSavedReport(null);
    setReport(null);
    generateReport();
  };

  // Render category breakdown
  const renderCategoryBreakdown = (
    categories: {[key: string]: number} | undefined,
    type: 'income' | 'expense',
  ) => {
    const entries = Object.entries(categories || {}).filter(
      ([_, amount]) => amount > 0,
    );

    if (entries.length === 0) {
      return (
        <Text style={styles.noDataText}>
          No {type === 'income' ? 'income' : 'expenses'} this period
        </Text>
      );
    }

    return entries.map(([category, amount]) => (
      <View key={category} style={styles.categoryRow}>
        <Text style={styles.categoryName}>{category}</Text>
        <Text
          style={[
            styles.categoryAmount,
            {color: type === 'income' ? '#4CAF50' : '#F44336'},
          ]}>
          {formatCurrency(amount as number)}
        </Text>
      </View>
    ));
  };

  if (!canAccessTreasury) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.errorContainer}>
          <Icon name="lock" size={48} color="#9E9E9E" />
          <Text style={styles.errorTitle}>Access Denied</Text>
          <Text style={styles.errorText}>
            Only treasurers and admins can generate treasury reports.
          </Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      {/* Header with Month Selector and Saved Reports Button */}
      <View style={styles.headerContainer}>
        <View style={styles.monthSelector}>
          <TouchableOpacity
            style={styles.monthNavButton}
            onPress={goToPreviousMonth}>
            <Icon name="chevron-left" size={28} color="#1976D2" />
          </TouchableOpacity>

          <View style={styles.monthDisplay}>
            <Text style={styles.monthText}>
              {format(selectedDate, 'MMMM yyyy')}
            </Text>
          </View>

          <TouchableOpacity
            style={styles.monthNavButton}
            onPress={goToNextMonth}
            disabled={addMonths(selectedDate, 1) > new Date()}>
            <Icon
              name="chevron-right"
              size={28}
              color={
                addMonths(selectedDate, 1) > new Date() ? '#E0E0E0' : '#1976D2'
              }
            />
          </TouchableOpacity>
        </View>
      </View>

      {/* Viewing Saved Report Indicator */}
      {viewingSavedReport && (
        <View style={styles.savedReportBanner}>
          <Icon name="file-document-outline" size={16} color="#FF9800" />
          <Text style={styles.savedReportBannerText}>
            Viewing saved report from{' '}
            {format(viewingSavedReport.createdAt, 'MMM d, yyyy')}
          </Text>
          <TouchableOpacity onPress={handleGenerateFresh}>
            <Text style={styles.regenerateLink}>Regenerate</Text>
          </TouchableOpacity>
        </View>
      )}

      {/* Generate Button */}
      {!report && !isGenerating && (
        <View style={styles.generateContainer}>
          <TouchableOpacity
            style={styles.generateButton}
            onPress={generateReport}>
            <Icon name="file-chart" size={24} color="#FFFFFF" />
            <Text style={styles.generateButtonText}>Generate Report</Text>
          </TouchableOpacity>
          <Text style={styles.generateHint}>
            Generate a treasury report for {format(selectedDate, 'MMMM yyyy')}
          </Text>
        </View>
      )}

      {/* Loading State */}
      {isGenerating && (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#1976D2" />
          <Text style={styles.loadingText}>Generating report...</Text>
        </View>
      )}

      {/* Report Content */}
      {report && !isGenerating && (
        <ScrollView style={styles.scrollView}>
          {/* Summary Section */}
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Summary</Text>
            <View style={styles.summaryGrid}>
              <View style={styles.summaryItem}>
                <Text style={styles.summaryLabel}>Starting Balance</Text>
                <Text style={styles.summaryValue}>
                  {formatCurrency(report.startingBalance)}
                </Text>
              </View>
              <View style={styles.summaryItem}>
                <Text style={styles.summaryLabel}>Ending Balance</Text>
                <Text style={styles.summaryValue}>
                  {formatCurrency(report.endingBalance)}
                </Text>
              </View>
            </View>
            <View style={styles.summaryGrid}>
              <View style={styles.summaryItem}>
                <Text style={styles.summaryLabel}>Total Income</Text>
                <Text style={[styles.summaryValue, styles.incomeText]}>
                  +{formatCurrency(report.totalIncome)}
                </Text>
              </View>
              <View style={styles.summaryItem}>
                <Text style={styles.summaryLabel}>Total Expenses</Text>
                <Text style={[styles.summaryValue, styles.expenseText]}>
                  -{formatCurrency(report.totalExpenses)}
                </Text>
              </View>
            </View>
            <View style={styles.divider} />
            <View style={styles.summaryGrid}>
              <View style={styles.summaryItem}>
                <Text style={styles.summaryLabel}>Prudent Reserve</Text>
                <Text style={styles.summaryValue}>
                  {formatCurrency(report.prudentReserve)}
                </Text>
              </View>
              <View style={styles.summaryItem}>
                <Text style={styles.summaryLabel}>Available Funds</Text>
                <Text
                  style={[
                    styles.summaryValue,
                    report.endingBalance - report.prudentReserve >= 0
                      ? styles.incomeText
                      : styles.expenseText,
                  ]}>
                  {formatCurrency(report.endingBalance - report.prudentReserve)}
                </Text>
              </View>
            </View>
          </View>

          {/* Income Breakdown */}
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Income Breakdown</Text>
            {renderCategoryBreakdown(report.incomeByCategory, 'income')}
          </View>

          {/* Expense Breakdown */}
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Expense Breakdown</Text>
            {renderCategoryBreakdown(report.expensesByCategory, 'expense')}
          </View>

          {/* Transactions */}
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>
              Transactions ({report.transactions.length})
            </Text>
            {report.transactions.length > 0 ? (
              [...report.transactions]
                .sort(
                  (a, b) =>
                    (a.createdAt?.getTime() || 0) -
                    (b.createdAt?.getTime() || 0),
                )
                .map((tx, index) => (
                  <TransactionItem key={tx.id || index} tx={tx} />
                ))
            ) : (
              <Text style={styles.noDataText}>
                No transactions during this period
              </Text>
            )}
          </View>

          {/* Actions */}
          <View style={styles.actionsSection}>
            <TouchableOpacity
              style={[styles.actionButton, styles.primaryButton]}
              onPress={handleSharePDF}
              disabled={isSharing}>
              {isSharing ? (
                <ActivityIndicator size="small" color="#FFFFFF" />
              ) : (
                <>
                  <Icon name="file-pdf-box" size={20} color="#FFFFFF" />
                  <Text style={styles.primaryButtonText}>Share as PDF</Text>
                </>
              )}
            </TouchableOpacity>

            <View style={styles.secondaryActions}>
              <TouchableOpacity
                style={[styles.actionButton, styles.secondaryButton]}
                onPress={handleShareText}
                disabled={isSharing}>
                <Icon name="share-variant" size={20} color="#1976D2" />
                <Text style={styles.secondaryButtonText}>Share Text</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.actionButton, styles.secondaryButton]}
                onPress={handleSaveReport}
                disabled={isSaving}>
                {isSaving ? (
                  <ActivityIndicator size="small" color="#1976D2" />
                ) : (
                  <>
                    <Icon name="content-save" size={20} color="#1976D2" />
                    <Text style={styles.secondaryButtonText}>Save Report</Text>
                  </>
                )}
              </TouchableOpacity>
            </View>
          </View>

          {/* Footer */}
          <View style={styles.footer}>
            <Text style={styles.footerText}>
              Report generated: {format(new Date(), 'MMM d, yyyy h:mm a')}
            </Text>
          </View>
        </ScrollView>
      )}
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F5F5F5',
  },
  scrollView: {
    flex: 1,
  },
  headerContainer: {
    backgroundColor: '#FFFFFF',
    borderBottomWidth: 1,
    borderBottomColor: '#E0E0E0',
    paddingBottom: 12,
  },
  monthSelector: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 16,
  },
  monthNavButton: {
    padding: 8,
  },
  monthDisplay: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 8,
    backgroundColor: '#F5F5F5',
    borderRadius: 8,
    marginHorizontal: 16,
  },
  monthText: {
    fontSize: 18,
    fontWeight: '600',
    color: '#212121',
    marginRight: 8,
  },
  generateContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 32,
  },
  generateButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#1976D2',
    paddingHorizontal: 24,
    paddingVertical: 14,
    borderRadius: 8,
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: {width: 0, height: 2},
    shadowOpacity: 0.1,
    shadowRadius: 4,
  },
  generateButtonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '600',
    marginLeft: 8,
  },
  generateHint: {
    marginTop: 16,
    fontSize: 14,
    color: '#757575',
    textAlign: 'center',
  },
  loadingContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  loadingText: {
    marginTop: 16,
    fontSize: 16,
    color: '#757575',
  },
  section: {
    backgroundColor: '#FFFFFF',
    marginTop: 12,
    marginHorizontal: 12,
    padding: 16,
    borderRadius: 8,
    elevation: 1,
    shadowColor: '#000',
    shadowOffset: {width: 0, height: 1},
    shadowOpacity: 0.05,
    shadowRadius: 2,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#1976D2',
    marginBottom: 16,
  },
  summaryGrid: {
    flexDirection: 'row',
    marginBottom: 12,
  },
  summaryItem: {
    flex: 1,
  },
  summaryLabel: {
    fontSize: 12,
    color: '#757575',
    marginBottom: 4,
  },
  summaryValue: {
    fontSize: 18,
    fontWeight: '600',
    color: '#212121',
  },
  incomeText: {
    color: '#4CAF50',
  },
  expenseText: {
    color: '#F44336',
  },
  divider: {
    height: 1,
    backgroundColor: '#E0E0E0',
    marginVertical: 12,
  },
  categoryRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#F5F5F5',
  },
  categoryName: {
    fontSize: 14,
    color: '#424242',
  },
  categoryAmount: {
    fontSize: 14,
    fontWeight: '600',
  },
  noDataText: {
    fontSize: 14,
    color: '#9E9E9E',
    fontStyle: 'italic',
    textAlign: 'center',
    paddingVertical: 16,
  },
  transactionItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#F5F5F5',
  },
  transactionLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  transactionDate: {
    fontSize: 12,
    color: '#757575',
    width: 50,
  },
  transactionInfo: {
    flex: 1,
    marginLeft: 8,
  },
  transactionCategory: {
    fontSize: 14,
    fontWeight: '500',
    color: '#212121',
  },
  transactionDescription: {
    fontSize: 12,
    color: '#757575',
    marginTop: 2,
  },
  transactionAmount: {
    fontSize: 14,
    fontWeight: '600',
    marginLeft: 12,
  },
  actionsSection: {
    padding: 16,
    marginTop: 8,
  },
  actionButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 14,
    paddingHorizontal: 20,
    borderRadius: 8,
  },
  primaryButton: {
    backgroundColor: '#1976D2',
    marginBottom: 12,
  },
  primaryButtonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '600',
    marginLeft: 8,
  },
  secondaryActions: {
    flexDirection: 'row',
    gap: 12,
  },
  secondaryButton: {
    flex: 1,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#1976D2',
  },
  secondaryButtonText: {
    color: '#1976D2',
    fontSize: 14,
    fontWeight: '600',
    marginLeft: 6,
  },
  footer: {
    padding: 24,
    alignItems: 'center',
  },
  footerText: {
    fontSize: 12,
    color: '#9E9E9E',
  },
  errorContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 32,
  },
  errorTitle: {
    fontSize: 20,
    fontWeight: '600',
    color: '#424242',
    marginTop: 16,
    marginBottom: 8,
  },
  errorText: {
    fontSize: 14,
    color: '#757575',
    textAlign: 'center',
  },
  savedReportBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#FFF3E0',
    paddingVertical: 10,
    paddingHorizontal: 16,
    gap: 8,
  },
  savedReportBannerText: {
    fontSize: 13,
    color: '#E65100',
    flex: 1,
  },
  regenerateLink: {
    color: '#1976D2',
    fontSize: 13,
    fontWeight: '600',
  },
});

export default TreasuryReportScreen;
