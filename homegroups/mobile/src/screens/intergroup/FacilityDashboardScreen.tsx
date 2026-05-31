import React, {useEffect, useState} from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
  Modal,
  TextInput,
  DimensionValue,
} from 'react-native';
import {RouteProp, useRoute, useNavigation} from '@react-navigation/native';
import {StackNavigationProp} from '@react-navigation/stack';
import functions from '@react-native-firebase/functions';
import {IntergroupStackParamList} from '../../types/navigation';
import {FacilityStatsDocument} from '../../types/schema';

type Route = RouteProp<IntergroupStackParamList, 'FacilityDashboard'>;
type Nav = StackNavigationProp<IntergroupStackParamList, 'FacilityDashboard'>;

const FacilityDashboardScreen: React.FC = () => {
  const route = useRoute<Route>();
  const navigation = useNavigation<Nav>();
  const {intergroupId} = route.params;

  const [stats, setStats] = useState<FacilityStatsDocument | null>(null);
  const [dataAsOf, setDataAsOf] = useState<string>('');
  const [loading, setLoading] = useState(true);
  const [exportModalVisible, setExportModalVisible] = useState(false);
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [exporting, setExporting] = useState(false);

  useEffect(() => {
    const loadStats = async () => {
      try {
        const result = await functions().httpsCallable('getFacilityStats')({
          intergroupId,
          forceRefresh: false,
        });
        const data = result.data as {
          stats: FacilityStatsDocument;
          dataAsOf: string;
        };
        setStats(data.stats);
        setDataAsOf(data.dataAsOf);
      } catch (err: any) {
        Alert.alert('Error', err.message || 'Failed to load facility stats');
      } finally {
        setLoading(false);
      }
    };
    loadStats();
  }, [intergroupId]);

  const handleExport = async () => {
    if (!startDate || !endDate) {
      Alert.alert('Error', 'Please enter start and end dates');
      return;
    }
    setExporting(true);
    try {
      const result = await functions().httpsCallable(
        'exportFacilityComplianceReport',
      )({
        intergroupId,
        reportPeriod: {startDate, endDate},
        format: 'csv',
        includeAttendance: true,
        includeMilestones: true,
        includeMeetingSchedule: true,
      });
      const data = result.data as {downloadUrl: string; reportId: string};
      Alert.alert(
        'Report Ready',
        `Report ID: ${data.reportId}\n\nThe report is ready for download.`,
        [
          {text: 'Cancel', style: 'cancel'},
          {
            text: 'Open',
            onPress: () => {
              const {Linking} = require('react-native');
              Linking.openURL(data.downloadUrl);
            },
          },
        ],
      );
      setExportModalVisible(false);
    } catch (err: any) {
      Alert.alert('Error', err.message || 'Failed to generate report');
    } finally {
      setExporting(false);
    }
  };

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color="#2196F3" />
      </View>
    );
  }

  if (!stats) {
    return (
      <View style={styles.center}>
        <Text style={styles.emptyText}>No stats available yet</Text>
      </View>
    );
  }

  const buckets = stats.sobrietyBuckets;
  const maxBucket = Math.max(
    buckets.under30Days,
    buckets.thirtyToNinetyDays,
    buckets.ninetyDaysToOneYear,
    buckets.oneToTwoYears,
    buckets.twoToFiveYears,
    buckets.fiveYearsPlus,
    1,
  );

  const BucketBar = ({label, count}: {label: string; count: number}) => {
    const width: DimensionValue = `${Math.round((count / maxBucket) * 100)}%`;
    return (
      <View style={styles.bucketRow}>
        <Text style={styles.bucketLabel}>{label}</Text>
        <View style={styles.bucketBarContainer}>
          <View style={[styles.bucketBar, {width}]} />
        </View>
        <Text style={styles.bucketCount}>{count}</Text>
      </View>
    );
  };

  return (
    <>
      <ScrollView style={styles.container}>
        {/* Header stats */}
        <View style={styles.cardRow}>
          <View style={styles.statCard}>
            <Text style={styles.statNumber}>
              {stats.totalActiveMemberCount}
            </Text>
            <Text style={styles.statLabel}>Active Members</Text>
          </View>
          <View style={styles.statCard}>
            <Text style={styles.statNumber}>{stats.milestonesThisMonth}</Text>
            <Text style={styles.statLabel}>Milestones This Month</Text>
          </View>
          <View style={styles.statCard}>
            <Text style={styles.statNumber}>
              {stats.averageAttendancePerMeeting}
            </Text>
            <Text style={styles.statLabel}>Avg Attendance</Text>
          </View>
        </View>

        {/* Sobriety Distribution */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Sobriety Distribution</Text>
          <Text style={styles.privacyNote}>
            No names — anonymized counts only
          </Text>
          <BucketBar label="Under 30 days" count={buckets.under30Days} />
          <BucketBar label="30-90 days" count={buckets.thirtyToNinetyDays} />
          <BucketBar
            label="90 days-1 year"
            count={buckets.ninetyDaysToOneYear}
          />
          <BucketBar label="1-2 years" count={buckets.oneToTwoYears} />
          <BucketBar label="2-5 years" count={buckets.twoToFiveYears} />
          <BucketBar label="5+ years" count={buckets.fiveYearsPlus} />
        </View>

        {/* Meeting Activity */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Meeting Activity</Text>
          <View style={styles.metaRow}>
            <Text style={styles.metaLabel}>Meetings this month:</Text>
            <Text style={styles.metaValue}>{stats.totalMeetingsThisMonth}</Text>
          </View>
          <View style={styles.metaRow}>
            <Text style={styles.metaLabel}>Total attendance:</Text>
            <Text style={styles.metaValue}>
              {stats.totalAttendanceThisMonth}
            </Text>
          </View>
          <View style={styles.metaRow}>
            <Text style={styles.metaLabel}>Average per meeting:</Text>
            <Text style={styles.metaValue}>
              {stats.averageAttendancePerMeeting}
            </Text>
          </View>
        </View>

        {dataAsOf && (
          <Text style={styles.dataAsOf}>
            Data as of: {new Date(dataAsOf).toLocaleDateString()}
          </Text>
        )}

        {/* Export Button */}
        <View style={styles.exportSection}>
          <TouchableOpacity
            style={styles.exportButton}
            onPress={() => setExportModalVisible(true)}>
            <Text style={styles.exportButtonText}>
              Export Compliance Report
            </Text>
          </TouchableOpacity>
        </View>
      </ScrollView>

      {/* Export Modal */}
      <Modal
        visible={exportModalVisible}
        transparent
        animationType="slide"
        onRequestClose={() => setExportModalVisible(false)}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>Export Compliance Report</Text>
            <Text style={styles.modalLabel}>Start Date (YYYY-MM-DD)</Text>
            <TextInput
              style={styles.modalInput}
              value={startDate}
              onChangeText={setStartDate}
              placeholder="2026-01-01"
              keyboardType="numbers-and-punctuation"
            />
            <Text style={styles.modalLabel}>End Date (YYYY-MM-DD)</Text>
            <TextInput
              style={styles.modalInput}
              value={endDate}
              onChangeText={setEndDate}
              placeholder="2026-03-31"
              keyboardType="numbers-and-punctuation"
            />
            <View style={styles.modalActions}>
              <TouchableOpacity
                style={styles.cancelButton}
                onPress={() => setExportModalVisible(false)}>
                <Text style={styles.cancelButtonText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[
                  styles.generateButton,
                  exporting && styles.generateButtonDisabled,
                ]}
                onPress={handleExport}
                disabled={exporting}>
                {exporting ? (
                  <ActivityIndicator size="small" color="#fff" />
                ) : (
                  <Text style={styles.generateButtonText}>Generate</Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </>
  );
};

const styles = StyleSheet.create({
  container: {flex: 1, backgroundColor: '#f5f5f5'},
  center: {flex: 1, justifyContent: 'center', alignItems: 'center'},
  emptyText: {color: '#999', fontSize: 16},
  cardRow: {
    flexDirection: 'row',
    margin: 16,
    gap: 8,
  },
  statCard: {
    flex: 1,
    backgroundColor: '#fff',
    borderRadius: 8,
    padding: 12,
    alignItems: 'center',
    elevation: 1,
  },
  statNumber: {fontSize: 22, fontWeight: '700', color: '#2196F3'},
  statLabel: {fontSize: 10, color: '#666', marginTop: 2, textAlign: 'center'},
  section: {
    backgroundColor: '#fff',
    margin: 16,
    marginTop: 0,
    borderRadius: 8,
    padding: 16,
    elevation: 1,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#1a1a1a',
    marginBottom: 4,
  },
  privacyNote: {
    fontSize: 11,
    color: '#999',
    marginBottom: 12,
    fontStyle: 'italic',
  },
  bucketRow: {flexDirection: 'row', alignItems: 'center', marginBottom: 8},
  bucketLabel: {fontSize: 12, color: '#555', width: 110},
  bucketBarContainer: {
    flex: 1,
    height: 16,
    backgroundColor: '#E3F2FD',
    borderRadius: 4,
    marginHorizontal: 6,
    overflow: 'hidden',
  },
  bucketBar: {height: '100%', backgroundColor: '#2196F3', borderRadius: 4},
  bucketCount: {fontSize: 12, color: '#333', width: 30, textAlign: 'right'},
  metaRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 6,
  },
  metaLabel: {fontSize: 14, color: '#555'},
  metaValue: {fontSize: 14, fontWeight: '600', color: '#1a1a1a'},
  dataAsOf: {
    fontSize: 11,
    color: '#999',
    textAlign: 'center',
    marginBottom: 8,
    fontStyle: 'italic',
  },
  exportSection: {margin: 16, marginTop: 0},
  exportButton: {
    backgroundColor: '#4CAF50',
    borderRadius: 8,
    padding: 16,
    alignItems: 'center',
  },
  exportButtonText: {color: '#fff', fontWeight: '700', fontSize: 15},
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'flex-end',
  },
  modalContent: {
    backgroundColor: '#fff',
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    padding: 24,
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: '700',
    marginBottom: 16,
    color: '#1a1a1a',
  },
  modalLabel: {fontSize: 13, fontWeight: '600', color: '#555', marginBottom: 6},
  modalInput: {
    borderWidth: 1,
    borderColor: '#e0e0e0',
    borderRadius: 6,
    padding: 10,
    fontSize: 15,
    marginBottom: 14,
  },
  modalActions: {flexDirection: 'row', gap: 12},
  cancelButton: {
    flex: 1,
    padding: 14,
    borderWidth: 1,
    borderColor: '#e0e0e0',
    borderRadius: 8,
    alignItems: 'center',
  },
  cancelButtonText: {color: '#555', fontWeight: '600'},
  generateButton: {
    flex: 1,
    padding: 14,
    backgroundColor: '#4CAF50',
    borderRadius: 8,
    alignItems: 'center',
  },
  generateButtonDisabled: {backgroundColor: '#A5D6A7'},
  generateButtonText: {color: '#fff', fontWeight: '700'},
});

export default FacilityDashboardScreen;
