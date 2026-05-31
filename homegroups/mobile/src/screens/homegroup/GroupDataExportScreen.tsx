import React, {useState} from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Switch,
  Alert,
  ActivityIndicator,
  Linking,
} from 'react-native';
import {RouteProp, useRoute} from '@react-navigation/native';
import functions from '@react-native-firebase/functions';
import {GroupStackParamList} from '../../types/navigation';

type Route = RouteProp<GroupStackParamList, 'GroupDataExport'>;

type Section = {
  key: string;
  label: string;
  defaultOn: boolean;
};

const SECTIONS: Section[] = [
  {key: 'members', label: 'Members (names, join dates, roles)', defaultOn: true},
  {key: 'transactions', label: 'Transactions & treasury history', defaultOn: true},
  {key: 'meetings', label: 'Meetings & schedule', defaultOn: true},
  {key: 'announcements', label: 'Announcements', defaultOn: true},
  {key: 'milestones', label: 'Sobriety milestones', defaultOn: true},
  {key: 'service_positions', label: 'Service positions', defaultOn: false},
  {key: 'business_meetings', label: 'Business meeting minutes', defaultOn: false},
];

interface PreviousExport {
  exportId: string;
  format: string;
  createdAt: string;
  downloadUrl?: string;
  expired: boolean;
}

const GroupDataExportScreen: React.FC = () => {
  const route = useRoute<Route>();
  const {groupId, groupName} = route.params;

  const [selectedSections, setSelectedSections] = useState<Record<string, boolean>>(
    Object.fromEntries(SECTIONS.map(s => [s.key, s.defaultOn])),
  );
  const [format, setFormat] = useState<'json' | 'csv'>('json');
  const [exporting, setExporting] = useState(false);
  const [recentExports, setRecentExports] = useState<PreviousExport[]>([]);

  const toggleSection = (key: string) => {
    setSelectedSections(prev => ({...prev, [key]: !prev[key]}));
  };

  const handleExport = async () => {
    const sections = SECTIONS.filter(s => selectedSections[s.key]).map(s => s.key);
    if (sections.length === 0) {
      Alert.alert('Error', 'Select at least one section to export');
      return;
    }

    setExporting(true);
    try {
      const result = await functions().httpsCallable('exportGroupData')({
        groupId,
        format,
        sections,
      });
      const data = result.data as {
        downloadUrl: string;
        expiresAt: string;
        exportId: string;
        fileSizeBytes: number;
      };

      // Add to recent exports list
      const expiresDate = new Date(data.expiresAt);
      setRecentExports(prev => [
        {
          exportId: data.exportId,
          format,
          createdAt: new Date().toLocaleDateString(),
          downloadUrl: data.downloadUrl,
          expired: false,
        },
        ...prev.slice(0, 2),
      ]);

      Alert.alert(
        'Export Ready',
        `Export created (${Math.round(data.fileSizeBytes / 1024)} KB). Expires in 1 hour.`,
        [
          {text: 'Cancel', style: 'cancel'},
          {
            text: 'Download',
            onPress: () => Linking.openURL(data.downloadUrl),
          },
        ],
      );
    } catch (err: any) {
      Alert.alert('Error', err.message || 'Failed to generate export');
    } finally {
      setExporting(false);
    }
  };

  return (
    <ScrollView style={styles.container}>
      {/* Info Banner */}
      <View style={styles.infoBanner}>
        <Text style={styles.infoText}>
          Download a complete backup of your group data. Useful for migration, record-keeping,
          or compliance.
        </Text>
      </View>

      {/* What to include */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>What to include</Text>
        {SECTIONS.map(s => (
          <View key={s.key} style={styles.toggleRow}>
            <Text style={styles.toggleLabel}>{s.label}</Text>
            <Switch
              value={selectedSections[s.key]}
              onValueChange={() => toggleSection(s.key)}
              trackColor={{false: '#e0e0e0', true: '#2196F3'}}
            />
          </View>
        ))}
      </View>

      {/* Format */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Format</Text>
        <TouchableOpacity
          style={[styles.formatOption, format === 'json' && styles.formatOptionSelected]}
          onPress={() => setFormat('json')}>
          <Text style={styles.formatRadio}>{format === 'json' ? '(•)' : '( )'}</Text>
          <Text style={styles.formatLabel}>JSON</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.formatOption, format === 'csv' && styles.formatOptionSelected]}
          onPress={() => setFormat('csv')}>
          <Text style={styles.formatRadio}>{format === 'csv' ? '(•)' : '( )'}</Text>
          <Text style={styles.formatLabel}>CSV (ZIP)</Text>
        </TouchableOpacity>
      </View>

      {/* Export Button */}
      <View style={styles.exportSection}>
        <TouchableOpacity
          style={[styles.exportButton, exporting && styles.exportButtonDisabled]}
          onPress={handleExport}
          disabled={exporting}>
          {exporting ? (
            <ActivityIndicator size="small" color="#fff" />
          ) : (
            <Text style={styles.exportButtonText}>Generate Export</Text>
          )}
        </TouchableOpacity>
      </View>

      {/* Previous Exports */}
      {recentExports.length > 0 && (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Previous exports (this session)</Text>
          {recentExports.map(exp => (
            <View key={exp.exportId} style={styles.exportRow}>
              <View style={styles.exportInfo}>
                <Text style={styles.exportDate}>{exp.createdAt}</Text>
                <Text style={styles.exportFormat}>{exp.format.toUpperCase()}</Text>
              </View>
              {exp.expired ? (
                <Text style={styles.expiredText}>Expired</Text>
              ) : (
                <TouchableOpacity
                  onPress={() => exp.downloadUrl && Linking.openURL(exp.downloadUrl)}>
                  <Text style={styles.downloadText}>Download</Text>
                </TouchableOpacity>
              )}
            </View>
          ))}
        </View>
      )}
    </ScrollView>
  );
};

const styles = StyleSheet.create({
  container: {flex: 1, backgroundColor: '#f5f5f5'},
  infoBanner: {
    margin: 16,
    backgroundColor: '#E3F2FD',
    borderRadius: 8,
    padding: 14,
  },
  infoText: {fontSize: 14, color: '#1565C0', lineHeight: 20},
  section: {
    backgroundColor: '#fff',
    margin: 16,
    marginTop: 0,
    borderRadius: 8,
    padding: 16,
    elevation: 1,
  },
  sectionTitle: {fontSize: 15, fontWeight: '700', color: '#1a1a1a', marginBottom: 12},
  toggleRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#f5f5f5',
  },
  toggleLabel: {flex: 1, fontSize: 14, color: '#333', marginRight: 8},
  formatOption: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 10,
    borderWidth: 1,
    borderColor: '#e0e0e0',
    borderRadius: 6,
    marginBottom: 8,
    gap: 8,
  },
  formatOptionSelected: {borderColor: '#2196F3', backgroundColor: '#E3F2FD'},
  formatRadio: {fontSize: 14, color: '#2196F3'},
  formatLabel: {fontSize: 14, color: '#1a1a1a'},
  exportSection: {margin: 16, marginTop: 0},
  exportButton: {
    backgroundColor: '#2196F3',
    borderRadius: 8,
    padding: 16,
    alignItems: 'center',
  },
  exportButtonDisabled: {backgroundColor: '#90CAF9'},
  exportButtonText: {color: '#fff', fontWeight: '700', fontSize: 15},
  exportRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#f0f0f0',
  },
  exportInfo: {flex: 1},
  exportDate: {fontSize: 14, color: '#1a1a1a'},
  exportFormat: {fontSize: 12, color: '#666'},
  expiredText: {fontSize: 13, color: '#999'},
  downloadText: {fontSize: 13, color: '#2196F3', fontWeight: '600'},
});

export default GroupDataExportScreen;
