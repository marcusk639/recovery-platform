import React, {useState, useEffect} from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  ActivityIndicator,
  SafeAreaView,
} from 'react-native';
import {useRoute, RouteProp, useNavigation} from '@react-navigation/native';
import {StackNavigationProp} from '@react-navigation/stack';
import auth from '@react-native-firebase/auth';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import {format} from 'date-fns';

import {GroupStackParamList} from '../../types/navigation';
import {FinancialReport} from '../../types/domain/treasury';
import {TreasuryModel} from '../../models/TreasuryModel';
import {useAppSelector} from '../../store';
import {selectGroupById} from '../../store/slices/groupsSlice';
import {selectIsTreasurerForGroup} from '../../store/slices/servicePositionsSlice';

type SavedTreasuryReportsScreenRouteProp = RouteProp<
  GroupStackParamList,
  'SavedTreasuryReports'
>;

type SavedTreasuryReportsScreenNavigationProp = StackNavigationProp<
  GroupStackParamList,
  'SavedTreasuryReports'
>;

const SavedTreasuryReportsScreen: React.FC = () => {
  const route = useRoute<SavedTreasuryReportsScreenRouteProp>();
  const navigation = useNavigation<SavedTreasuryReportsScreenNavigationProp>();
  const {groupId, groupName} = route.params;
  const currentUser = auth().currentUser;

  // State
  const [savedReports, setSavedReports] = useState<FinancialReport[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

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

  // Load saved reports
  const loadReports = async () => {
    try {
      const reports = await TreasuryModel.getSavedReports(groupId);
      setSavedReports(reports);
    } catch (error) {
      console.error('Error loading saved reports:', error);
    }
  };

  useEffect(() => {
    const load = async () => {
      setIsLoading(true);
      await loadReports();
      setIsLoading(false);
    };
    load();
  }, [groupId]);

  const onRefresh = async () => {
    setRefreshing(true);
    await loadReports();
    setRefreshing(false);
  };

  // Navigate to view a saved report
  const handleViewReport = (report: FinancialReport) => {
    navigation.navigate('TreasuryReport', {
      groupId,
      groupName,
      savedReportId: report.id,
    });
  };

  // Format currency helper
  const formatCurrency = (amount: number) => `$${Math.abs(amount).toFixed(2)}`;

  // Render report item
  const renderReportItem = ({item}: {item: FinancialReport}) => (
    <TouchableOpacity
      style={styles.reportItem}
      onPress={() => handleViewReport(item)}>
      <View style={styles.reportHeader}>
        <Text style={styles.reportPeriod}>
          {format(item.startDate, 'MMMM yyyy')}
        </Text>
        <Text style={styles.reportDate}>
          Saved {format(item.createdAt, 'MMM d, yyyy')}
        </Text>
      </View>

      <View style={styles.reportSummary}>
        <View style={styles.summaryColumn}>
          <Text style={styles.summaryLabel}>Starting</Text>
          <Text style={styles.summaryValue}>
            {formatCurrency(item.startingBalance)}
          </Text>
        </View>
        <View style={styles.summaryColumn}>
          <Text style={styles.summaryLabel}>Income</Text>
          <Text style={[styles.summaryValue, styles.incomeText]}>
            +{formatCurrency(item.totalIncome)}
          </Text>
        </View>
        <View style={styles.summaryColumn}>
          <Text style={styles.summaryLabel}>Expenses</Text>
          <Text style={[styles.summaryValue, styles.expenseText]}>
            -{formatCurrency(item.totalExpenses)}
          </Text>
        </View>
        <View style={styles.summaryColumn}>
          <Text style={styles.summaryLabel}>Ending</Text>
          <Text style={[styles.summaryValue, styles.boldText]}>
            {formatCurrency(item.endingBalance)}
          </Text>
        </View>
      </View>

      <View style={styles.reportFooter}>
        <Text style={styles.transactionCount}>
          {item.transactions.length} transaction
          {item.transactions.length !== 1 ? 's' : ''}
        </Text>
        <Icon name="chevron-right" size={20} color="#9E9E9E" />
      </View>
    </TouchableOpacity>
  );

  if (!canAccessTreasury) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.centerContainer}>
          <Icon name="lock" size={48} color="#9E9E9E" />
          <Text style={styles.errorTitle}>Access Denied</Text>
          <Text style={styles.errorText}>
            Only treasurers and admins can view treasury reports.
          </Text>
        </View>
      </SafeAreaView>
    );
  }

  if (isLoading) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.centerContainer}>
          <ActivityIndicator size="large" color="#1976D2" />
          <Text style={styles.loadingText}>Loading saved reports...</Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      {savedReports.length === 0 ? (
        <View style={styles.centerContainer}>
          <Icon name="file-document-outline" size={64} color="#E0E0E0" />
          <Text style={styles.emptyTitle}>No Saved Reports</Text>
          <Text style={styles.emptyText}>
            When you generate and save treasury reports, they'll appear here for
            future reference.
          </Text>
          <TouchableOpacity
            style={styles.generateButton}
            onPress={() =>
              navigation.navigate('TreasuryReport', {groupId, groupName})
            }>
            <Icon name="file-chart" size={20} color="#FFFFFF" />
            <Text style={styles.generateButtonText}>Generate Report</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <FlatList
          data={savedReports}
          renderItem={renderReportItem}
          keyExtractor={item => item.id}
          contentContainerStyle={styles.listContent}
          refreshing={refreshing}
          onRefresh={onRefresh}
          ItemSeparatorComponent={() => <View style={styles.separator} />}
          ListHeaderComponent={
            <View style={styles.listHeader}>
              <Text style={styles.listHeaderText}>
                {savedReports.length} saved report
                {savedReports.length !== 1 ? 's' : ''}
              </Text>
            </View>
          }
        />
      )}
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F5F5F5',
  },
  centerContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 32,
  },
  loadingText: {
    marginTop: 16,
    fontSize: 16,
    color: '#757575',
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
  emptyTitle: {
    fontSize: 20,
    fontWeight: '600',
    color: '#424242',
    marginTop: 16,
    marginBottom: 8,
  },
  emptyText: {
    fontSize: 14,
    color: '#757575',
    textAlign: 'center',
    marginBottom: 24,
  },
  generateButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#1976D2',
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderRadius: 8,
  },
  generateButtonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '600',
    marginLeft: 8,
  },
  listContent: {
    padding: 16,
  },
  listHeader: {
    marginBottom: 12,
  },
  listHeaderText: {
    fontSize: 14,
    color: '#757575',
  },
  reportItem: {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    padding: 16,
    shadowColor: '#000',
    shadowOffset: {width: 0, height: 1},
    shadowOpacity: 0.05,
    shadowRadius: 3,
    elevation: 2,
  },
  reportHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  reportPeriod: {
    fontSize: 18,
    fontWeight: '700',
    color: '#212121',
  },
  reportDate: {
    fontSize: 13,
    color: '#9E9E9E',
  },
  reportSummary: {
    flexDirection: 'row',
    backgroundColor: '#F5F5F5',
    borderRadius: 8,
    padding: 12,
    marginBottom: 12,
  },
  summaryColumn: {
    flex: 1,
    alignItems: 'center',
  },
  summaryLabel: {
    fontSize: 11,
    color: '#9E9E9E',
    marginBottom: 4,
  },
  summaryValue: {
    fontSize: 14,
    fontWeight: '500',
    color: '#424242',
  },
  incomeText: {
    color: '#4CAF50',
  },
  expenseText: {
    color: '#F44336',
  },
  boldText: {
    fontWeight: '700',
    color: '#212121',
  },
  reportFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  transactionCount: {
    fontSize: 13,
    color: '#757575',
  },
  separator: {
    height: 12,
  },
});

export default SavedTreasuryReportsScreen;

