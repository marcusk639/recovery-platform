import React, {useState, useEffect, useCallback} from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  TextInput,
  Alert,
  ActivityIndicator,
  Switch,
} from 'react-native';
import {RouteProp, useRoute, useNavigation} from '@react-navigation/native';
import {StackNavigationProp} from '@react-navigation/stack';
import auth from '@react-native-firebase/auth';
import firestore from '@react-native-firebase/firestore';
import functions from '@react-native-firebase/functions';
import {GroupStackParamList} from '../../types/navigation';
import {IntergroupReportDocument} from '../../types/schema';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import {format} from 'date-fns';
import {IntergroupReportService} from '../../services/reports/IntergroupReportService';

type IntergroupReportRouteProp = RouteProp<GroupStackParamList, 'IntergroupReport'>;
type IntergroupReportNavigationProp = StackNavigationProp<GroupStackParamList>;

const IntergroupReportScreen: React.FC = () => {
  const route = useRoute<IntergroupReportRouteProp>();
  const navigation = useNavigation<IntergroupReportNavigationProp>();
  const {groupId, groupName, reportMonth, reportId} = route.params;

  const [report, setReport] = useState<IntergroupReportDocument | null>(null);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [saving, setSaving] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [sharingPdf, setSharingPdf] = useState(false);

  // Editable fields
  const [gsrName, setGsrName] = useState('');
  const [gsrPhone, setGsrPhone] = useState('');
  const [numberOfMeetings, setNumberOfMeetings] = useState('');
  const [avgAttendance, setAvgAttendance] = useState('');
  const [seventhTradition, setSeventhTradition] = useState('');
  const [groupNotes, setGroupNotes] = useState('');

  const displayMonth = (() => {
    try {
      const [year, month] = reportMonth.split('-').map(Number);
      return format(new Date(year, month - 1, 1), 'MMMM yyyy');
    } catch {
      return reportMonth;
    }
  })();

  const loadReport = useCallback(async () => {
    setLoading(true);
    try {
      const docId = reportId || `${groupId}_${reportMonth}`;
      const snap = await firestore()
        .collection('intergroup_reports')
        .doc(docId)
        .get();
      if (snap.exists) {
        const data = snap.data() as IntergroupReportDocument;
        setReport(data);
        populateFields(data);
      }
    } catch (error) {
      console.error('Error loading intergroup report:', error);
    } finally {
      setLoading(false);
    }
  }, [groupId, reportMonth, reportId]);

  const populateFields = (data: IntergroupReportDocument) => {
    setGsrName(data.gsrName || '');
    setGsrPhone(data.gsrPhoneNumber || '');
    setNumberOfMeetings(String(data.numberOfMeetingsHeld));
    setAvgAttendance(String(data.averageAttendance));
    setSeventhTradition(String(data.totalSeventhTraditionCollected));
    setGroupNotes(data.groupNotes || '');
  };

  useEffect(() => {
    loadReport();
    navigation.setOptions({
      title: `GSR Report — ${displayMonth}`,
      headerRight: () => (
        <TouchableOpacity
          onPress={handleSharePdf}
          style={{marginRight: 16}}
          testID="intergroup-report-share-pdf-btn">
          <Icon name="share-variant" size={24} color="#2196F3" />
        </TouchableOpacity>
      ),
    });
  }, [loadReport]);

  const handleGenerate = async () => {
    setGenerating(true);
    try {
      const result = await functions().httpsCallable('generateIntergroupReport')({
        groupId,
        reportMonth,
      });
      const data = result.data as {reportId: string; reportData: IntergroupReportDocument};
      setReport(data.reportData);
      populateFields(data.reportData);
      Alert.alert('Report Generated', 'App data has been loaded. Review and edit as needed.');
    } catch (error: any) {
      Alert.alert('Error', error?.message || 'Failed to generate report.');
    } finally {
      setGenerating(false);
    }
  };

  const buildUpdatedReport = (): Partial<IntergroupReportDocument> => ({
    gsrName: gsrName.trim() || undefined,
    gsrPhoneNumber: gsrPhone.trim() || undefined,
    numberOfMeetingsHeld: parseInt(numberOfMeetings, 10) || 0,
    averageAttendance: parseFloat(avgAttendance) || 0,
    totalSeventhTraditionCollected: parseFloat(seventhTradition) || 0,
    groupNotes: groupNotes.trim() || undefined,
    updatedAt: firestore.Timestamp.now() as any,
  });

  const handleSaveDraft = async () => {
    if (!report) {
      Alert.alert('Generate First', 'Please generate the report from app data before saving.');
      return;
    }
    setSaving(true);
    try {
      const docId = `${groupId}_${reportMonth}`;
      await firestore()
        .collection('intergroup_reports')
        .doc(docId)
        .update(buildUpdatedReport());
      await loadReport();
      Alert.alert('Saved', 'Draft saved successfully.');
    } catch (error: any) {
      Alert.alert('Error', error?.message || 'Failed to save draft.');
    } finally {
      setSaving(false);
    }
  };

  const handleMarkSubmitted = async () => {
    if (!report) return;
    Alert.alert(
      'Mark as Submitted',
      'This will mark the report as submitted to intergroup. Continue?',
      [
        {text: 'Cancel', style: 'cancel'},
        {
          text: 'Submit',
          onPress: async () => {
            setSubmitting(true);
            try {
              const docId = `${groupId}_${reportMonth}`;
              await firestore()
                .collection('intergroup_reports')
                .doc(docId)
                .update({...buildUpdatedReport(), status: 'submitted'});
              await loadReport();
              Alert.alert('Submitted', 'Report marked as submitted to intergroup.');
            } catch (error: any) {
              Alert.alert('Error', error?.message || 'Failed to submit report.');
            } finally {
              setSubmitting(false);
            }
          },
        },
      ],
    );
  };

  const handleSharePdf = async () => {
    if (!report) {
      Alert.alert('No Report', 'Generate a report first.');
      return;
    }
    setSharingPdf(true);
    try {
      await IntergroupReportService.generateAndShare(report);
    } catch (error: any) {
      Alert.alert('Error', error?.message || 'Failed to generate PDF.');
    } finally {
      setSharingPdf(false);
    }
  };

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#2196F3" />
      </View>
    );
  }

  const statusColor = report?.status === 'submitted' ? '#4CAF50' : '#FF9800';
  const statusLabel = report?.status === 'submitted' ? 'SUBMITTED' : 'DRAFT';

  return (
    <ScrollView
      style={styles.container}
      testID="intergroup-report-screen"
      keyboardShouldPersistTaps="handled">
      {/* Status Row */}
      {report && (
        <View style={styles.statusRow}>
          <View style={[styles.statusBadge, {backgroundColor: statusColor}]}>
            <Text style={styles.statusBadgeText}>{statusLabel}</Text>
          </View>
        </View>
      )}

      {/* Generate Button */}
      <TouchableOpacity
        style={[styles.generateButton, generating && styles.buttonDisabled]}
        onPress={handleGenerate}
        disabled={generating}
        testID="intergroup-report-generate-btn">
        {generating ? (
          <ActivityIndicator color="#FFFFFF" />
        ) : (
          <>
            <Icon name="refresh" size={18} color="#FFFFFF" style={styles.btnIcon} />
            <Text style={styles.generateButtonText}>
              {report ? 'Refresh from App Data' : 'Generate from App Data'}
            </Text>
          </>
        )}
      </TouchableOpacity>

      {/* Group Info Section */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Group Info</Text>
        <View style={styles.infoRow}>
          <Text style={styles.infoLabel}>Group Name</Text>
          <Text style={styles.infoValue}>{groupName}</Text>
        </View>
        {report && (
          <>
            <View style={styles.infoRow}>
              <Text style={styles.infoLabel}>Type</Text>
              <Text style={styles.infoValue}>{report.groupType || '—'}</Text>
            </View>
            <View style={styles.infoRow}>
              <Text style={styles.infoLabel}>Meets</Text>
              <Text style={styles.infoValue}>
                {[report.meetingDay, report.meetingTime].filter(Boolean).join(' at ') || '—'}
              </Text>
            </View>
            <View style={styles.infoRow}>
              <Text style={styles.infoLabel}>Location</Text>
              <Text style={styles.infoValue}>
                {report.meetingLocation || (report.isOnlineMeeting ? 'Online' : '—')}
              </Text>
            </View>
          </>
        )}
        <Text style={styles.fieldLabel}>GSR Name</Text>
        <TextInput
          style={styles.input}
          value={gsrName}
          onChangeText={setGsrName}
          placeholder="GSR Name"
          placeholderTextColor="#9E9E9E"
          testID="intergroup-report-gsr-name"
        />
        <Text style={styles.fieldLabel}>GSR Phone</Text>
        <TextInput
          style={styles.input}
          value={gsrPhone}
          onChangeText={setGsrPhone}
          placeholder="Phone Number"
          placeholderTextColor="#9E9E9E"
          keyboardType="phone-pad"
          testID="intergroup-report-gsr-phone"
        />
      </View>

      {/* Attendance Section */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Attendance</Text>
        <Text style={styles.fieldLabel}>Meetings Held This Month</Text>
        <TextInput
          style={styles.input}
          value={numberOfMeetings}
          onChangeText={setNumberOfMeetings}
          placeholder="0"
          placeholderTextColor="#9E9E9E"
          keyboardType="number-pad"
          testID="intergroup-report-meetings-held"
        />
        <Text style={styles.fieldLabel}>Average Attendance</Text>
        <TextInput
          style={styles.input}
          value={avgAttendance}
          onChangeText={setAvgAttendance}
          placeholder="0"
          placeholderTextColor="#9E9E9E"
          keyboardType="decimal-pad"
          testID="intergroup-report-avg-attendance"
        />
      </View>

      {/* 7th Tradition Section */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>7th Tradition</Text>
        <Text style={styles.fieldLabel}>Total Collected This Month ($)</Text>
        <TextInput
          style={styles.input}
          value={seventhTradition}
          onChangeText={setSeventhTradition}
          placeholder="0.00"
          placeholderTextColor="#9E9E9E"
          keyboardType="decimal-pad"
          testID="intergroup-report-seventh-tradition"
        />
      </View>

      {/* Sobriety Birthdays Section */}
      {report && report.sobrietyBirthdays && report.sobrietyBirthdays.length > 0 && (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Sobriety Birthdays This Month</Text>
          <View style={styles.chipsContainer}>
            {report.sobrietyBirthdays.map((b, idx) => (
              <View key={idx} style={styles.birthdayChip}>
                <Icon name="cake-variant" size={14} color="#7B1FA2" style={{marginRight: 4}} />
                <Text style={styles.birthdayChipText}>
                  {b.memberName} — {b.years} yr{b.years !== 1 ? 's' : ''}
                </Text>
              </View>
            ))}
          </View>
          <Text style={styles.helperText}>
            Birthdays are pulled from app milestone data.
          </Text>
        </View>
      )}

      {/* Officers Section */}
      {report && report.officers && report.officers.length > 0 && (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Current Officers</Text>
          {report.officers.map((o, idx) => (
            <View key={idx} style={styles.officerRow}>
              <Text style={styles.officerPosition}>{o.positionName}:</Text>
              <Text style={styles.officerName}>{o.holderName}</Text>
            </View>
          ))}
          <Text style={styles.helperText}>
            Officers are pulled from service positions.
          </Text>
        </View>
      )}

      {/* Group Notes Section */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Group Notes</Text>
        <TextInput
          style={[styles.input, styles.notesInput]}
          value={groupNotes}
          onChangeText={setGroupNotes}
          placeholder="Any special announcements, new meetings, GSO contributions, etc."
          placeholderTextColor="#9E9E9E"
          multiline
          textAlignVertical="top"
          testID="intergroup-report-notes"
        />
      </View>

      {/* Footer Buttons */}
      <View style={styles.footerButtons}>
        <TouchableOpacity
          style={[styles.footerBtn, styles.saveDraftBtn, saving && styles.buttonDisabled]}
          onPress={handleSaveDraft}
          disabled={saving || !report}
          testID="intergroup-report-save-draft-btn">
          {saving ? (
            <ActivityIndicator color="#2196F3" />
          ) : (
            <Text style={styles.saveDraftBtnText}>Save Draft</Text>
          )}
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.footerBtn, styles.sharePdfBtn, sharingPdf && styles.buttonDisabled]}
          onPress={handleSharePdf}
          disabled={sharingPdf || !report}
          testID="intergroup-report-share-btn">
          {sharingPdf ? (
            <ActivityIndicator color="#FFFFFF" />
          ) : (
            <Text style={styles.sharePdfBtnText}>Share PDF</Text>
          )}
        </TouchableOpacity>

        <TouchableOpacity
          style={[
            styles.footerBtn,
            styles.submitBtn,
            (submitting || !report || report.status === 'submitted') && styles.buttonDisabled,
          ]}
          onPress={handleMarkSubmitted}
          disabled={submitting || !report || report.status === 'submitted'}
          testID="intergroup-report-submit-btn">
          {submitting ? (
            <ActivityIndicator color="#FFFFFF" />
          ) : (
            <Text style={styles.submitBtnText}>
              {report?.status === 'submitted' ? 'Submitted' : 'Mark as Submitted'}
            </Text>
          )}
        </TouchableOpacity>
      </View>

      <View style={{height: 32}} />
    </ScrollView>
  );
};

const styles = StyleSheet.create({
  container: {flex: 1, backgroundColor: '#F5F5F5'},
  loadingContainer: {flex: 1, justifyContent: 'center', alignItems: 'center'},
  statusRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    padding: 12,
  },
  statusBadge: {
    paddingHorizontal: 16,
    paddingVertical: 6,
    borderRadius: 16,
  },
  statusBadgeText: {fontSize: 13, fontWeight: '700', color: '#FFF'},
  generateButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#2196F3',
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
  section: {
    backgroundColor: '#FFFFFF',
    marginHorizontal: 12,
    marginBottom: 12,
    borderRadius: 8,
    padding: 16,
    shadowColor: '#000',
    shadowOffset: {width: 0, height: 1},
    shadowOpacity: 0.08,
    shadowRadius: 2,
    elevation: 2,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#212121',
    marginBottom: 12,
  },
  infoRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 6,
    borderBottomWidth: 1,
    borderBottomColor: '#F5F5F5',
  },
  infoLabel: {fontSize: 14, color: '#757575'},
  infoValue: {fontSize: 14, color: '#212121', fontWeight: '500', maxWidth: '60%', textAlign: 'right'},
  fieldLabel: {
    fontSize: 13,
    color: '#757575',
    marginTop: 10,
    marginBottom: 4,
  },
  input: {
    borderWidth: 1,
    borderColor: '#E0E0E0',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 14,
    color: '#212121',
    backgroundColor: '#FAFAFA',
  },
  notesInput: {
    minHeight: 100,
    textAlignVertical: 'top',
  },
  chipsContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 8,
  },
  birthdayChip: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F3E5F5',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 16,
  },
  birthdayChipText: {fontSize: 13, color: '#7B1FA2'},
  officerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 6,
    borderBottomWidth: 1,
    borderBottomColor: '#F5F5F5',
  },
  officerPosition: {
    fontSize: 14,
    color: '#757575',
    width: 140,
  },
  officerName: {fontSize: 14, color: '#212121', fontWeight: '500', flex: 1},
  helperText: {
    fontSize: 12,
    color: '#9E9E9E',
    fontStyle: 'italic',
    marginTop: 8,
  },
  footerButtons: {
    marginHorizontal: 12,
    gap: 10,
  },
  footerBtn: {
    borderRadius: 8,
    paddingVertical: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  saveDraftBtn: {
    borderWidth: 1,
    borderColor: '#2196F3',
  },
  saveDraftBtnText: {
    fontSize: 15,
    fontWeight: '600',
    color: '#2196F3',
  },
  sharePdfBtn: {
    backgroundColor: '#37474F',
  },
  sharePdfBtnText: {
    fontSize: 15,
    fontWeight: '600',
    color: '#FFFFFF',
  },
  submitBtn: {
    backgroundColor: '#4CAF50',
  },
  submitBtnText: {
    fontSize: 15,
    fontWeight: '600',
    color: '#FFFFFF',
  },
});

export default IntergroupReportScreen;
