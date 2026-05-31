import React, {useState, useEffect, useCallback} from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  RefreshControl,
  Alert,
  ActivityIndicator,
} from 'react-native';
import {RouteProp, useRoute, useNavigation} from '@react-navigation/native';
import {StackNavigationProp} from '@react-navigation/stack';
import firestore from '@react-native-firebase/firestore';
import functions from '@react-native-firebase/functions';
import {GroupStackParamList} from '../../types/navigation';
import {IntergroupReportDocument} from '../../types/schema';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import {format} from 'date-fns';

type IntergroupReportHistoryRouteProp = RouteProp<
  GroupStackParamList,
  'IntergroupReportHistory'
>;
type IntergroupReportHistoryNavigationProp = StackNavigationProp<GroupStackParamList>;

const IntergroupReportHistoryScreen: React.FC = () => {
  const route = useRoute<IntergroupReportHistoryRouteProp>();
  const navigation = useNavigation<IntergroupReportHistoryNavigationProp>();
  const {groupId, groupName} = route.params;

  const [reports, setReports] = useState<IntergroupReportDocument[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [generating, setGenerating] = useState(false);

  const currentMonthKey = format(new Date(), 'yyyy-MM');

  const loadReports = useCallback(async () => {
    setRefreshing(true);
    try {
      const snap = await firestore()
        .collection('intergroup_reports')
        .where('groupId', '==', groupId)
        .orderBy('reportMonth', 'desc')
        .get();
      const loaded = snap.docs.map(d => d.data() as IntergroupReportDocument);
      setReports(loaded);
    } catch (error) {
      console.error('Error loading intergroup report history:', error);
      Alert.alert('Error', 'Failed to load report history.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [groupId]);

  useEffect(() => {
    loadReports();
  }, [loadReports]);

  const handleGenerateThisMonth = async () => {
    // Check if current month report already exists
    const existing = reports.find(r => r.reportMonth === currentMonthKey);
    if (existing) {
      navigation.navigate('IntergroupReport', {
        groupId,
        groupName,
        reportMonth: currentMonthKey,
        reportId: existing.id,
      });
      return;
    }

    setGenerating(true);
    try {
      const result = await functions().httpsCallable('generateIntergroupReport')({
        groupId,
        reportMonth: currentMonthKey,
      });
      const data = result.data as {reportId: string; reportData: IntergroupReportDocument};
      navigation.navigate('IntergroupReport', {
        groupId,
        groupName,
        reportMonth: currentMonthKey,
        reportId: data.reportId,
      });
    } catch (error: any) {
      Alert.alert('Error', error?.message || 'Failed to generate report.');
    } finally {
      setGenerating(false);
    }
  };

  const formatReportMonth = (reportMonth: string): string => {
    try {
      const [year, month] = reportMonth.split('-').map(Number);
      return format(new Date(year, month - 1, 1), 'MMMM yyyy');
    } catch {
      return reportMonth;
    }
  };

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#2196F3" />
      </View>
    );
  }

  return (
    <View style={styles.container} testID="intergroup-report-history-screen">
      {/* Generate This Month Button */}
      <TouchableOpacity
        style={[styles.generateButton, generating && styles.buttonDisabled]}
        onPress={handleGenerateThisMonth}
        disabled={generating}
        testID="intergroup-history-generate-btn">
        {generating ? (
          <ActivityIndicator color="#FFFFFF" />
        ) : (
          <>
            <Icon name="plus-circle" size={18} color="#FFFFFF" style={styles.btnIcon} />
            <Text style={styles.generateButtonText}>
              Generate Report for {formatReportMonth(currentMonthKey)}
            </Text>
          </>
        )}
      </TouchableOpacity>

      <FlatList
        data={reports}
        keyExtractor={item => item.id}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={loadReports} />
        }
        contentContainerStyle={styles.listContent}
        renderItem={({item}) => {
          const isSubmitted = item.status === 'submitted';
          return (
            <TouchableOpacity
              style={styles.row}
              onPress={() =>
                navigation.navigate('IntergroupReport', {
                  groupId,
                  groupName,
                  reportMonth: item.reportMonth,
                  reportId: item.id,
                })
              }
              testID={`intergroup-history-row-${item.id}`}>
              <View style={styles.rowContent}>
                <Text style={styles.rowMonth}>
                  {formatReportMonth(item.reportMonth)}
                </Text>
                <Text style={styles.rowMeta}>
                  Avg attendance: {item.averageAttendance || '—'}
                  {'  '}
                  7th: ${item.totalSeventhTraditionCollected?.toFixed(2) || '—'}
                </Text>
              </View>
              <View style={styles.rowRight}>
                <View
                  style={[
                    styles.statusBadge,
                    {backgroundColor: isSubmitted ? '#4CAF50' : '#FF9800'},
                  ]}>
                  <Text style={styles.statusBadgeText}>
                    {isSubmitted ? 'SUBMITTED' : 'DRAFT'}
                  </Text>
                </View>
                <Icon name="chevron-right" size={18} color="#9E9E9E" />
              </View>
            </TouchableOpacity>
          );
        }}
        ListEmptyComponent={
          <View style={styles.emptyContainer}>
            <Icon name="file-chart-outline" size={48} color="#BDBDBD" />
            <Text style={styles.emptyText}>No GSR reports yet.</Text>
            <Text style={styles.emptySubtext}>
              Tap "Generate Report" above to create your first monthly report.
            </Text>
          </View>
        }
      />
    </View>
  );
};

const styles = StyleSheet.create({
  container: {flex: 1, backgroundColor: '#F5F5F5'},
  loadingContainer: {flex: 1, justifyContent: 'center', alignItems: 'center'},
  generateButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#3949AB',
    margin: 12,
    borderRadius: 8,
    paddingVertical: 14,
  },
  generateButtonText: {
    color: '#FFFFFF',
    fontWeight: '700',
    fontSize: 15,
  },
  btnIcon: {marginRight: 8},
  buttonDisabled: {opacity: 0.5},
  listContent: {paddingHorizontal: 12, paddingBottom: 32},
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderRadius: 8,
    padding: 14,
    marginBottom: 8,
    shadowColor: '#000',
    shadowOffset: {width: 0, height: 1},
    shadowOpacity: 0.06,
    shadowRadius: 2,
    elevation: 1,
  },
  rowContent: {flex: 1},
  rowMonth: {fontSize: 16, fontWeight: '600', color: '#212121'},
  rowMeta: {fontSize: 13, color: '#9E9E9E', marginTop: 2},
  rowRight: {flexDirection: 'row', alignItems: 'center', gap: 8},
  statusBadge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 4,
  },
  statusBadgeText: {fontSize: 11, color: '#FFF', fontWeight: '700'},
  emptyContainer: {
    alignItems: 'center',
    paddingTop: 60,
    paddingHorizontal: 32,
    gap: 12,
  },
  emptyText: {fontSize: 18, color: '#757575', fontWeight: '600', textAlign: 'center'},
  emptySubtext: {fontSize: 14, color: '#9E9E9E', textAlign: 'center'},
});

export default IntergroupReportHistoryScreen;
