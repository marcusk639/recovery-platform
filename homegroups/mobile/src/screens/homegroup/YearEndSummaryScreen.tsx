// mobile/src/screens/homegroup/YearEndSummaryScreen.tsx
import React, {useState} from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  Alert,
  Share,
} from 'react-native';
import {useRoute, RouteProp} from '@react-navigation/native';
import {GroupStackParamList} from '../../types/navigation';
import {TreasuryModel} from '../../models/TreasuryModel';
import {FinancialReport} from '../../types/domain/treasury';

type RouteProps = RouteProp<GroupStackParamList, 'YearEndSummary'>;

type ReportData = Omit<FinancialReport, 'id' | 'createdBy' | 'createdAt'>;

const YearEndSummaryScreen: React.FC = () => {
  const route = useRoute<RouteProps>();
  const {groupId, groupName} = route.params;

  const currentYear = new Date().getFullYear();
  const [selectedYear, setSelectedYear] = useState(currentYear);
  const [report, setReport] = useState<ReportData | null>(null);
  const [loading, setLoading] = useState(false);

  const years = Array.from({length: 5}, (_, i) => currentYear - i);

  const generateReport = async () => {
    setLoading(true);
    try {
      const startDate = new Date(selectedYear, 0, 1); // Jan 1
      const endDate = new Date(selectedYear, 11, 31, 23, 59, 59); // Dec 31
      const generated = await TreasuryModel.generateReport(
        groupId,
        startDate,
        endDate,
      );
      setReport(generated as ReportData);
    } catch (error: any) {
      Alert.alert('Error', error.message || 'Failed to generate report.');
    } finally {
      setLoading(false);
    }
  };

  const handleShare = async () => {
    if (!report) return;
    const lines = [
      `${groupName} — ${selectedYear} Year-End Summary`,
      '',
      `Starting Balance:  $${report.startingBalance.toFixed(2)}`,
      `Total Income:      $${report.totalIncome.toFixed(2)}`,
      `Total Expenses:    $${report.totalExpenses.toFixed(2)}`,
      `Ending Balance:    $${report.endingBalance.toFixed(2)}`,
      `Prudent Reserve:   $${report.prudentReserve.toFixed(2)}`,
      '',
      '-- Income by Category --',
      ...Object.entries(report.incomeByCategory)
        .filter(([, v]) => v && (v as number) > 0)
        .map(([k, v]) => `  ${k}: $${(v as number).toFixed(2)}`),
      '',
      '-- Expenses by Category --',
      ...Object.entries(report.expensesByCategory)
        .filter(([, v]) => v && (v as number) > 0)
        .map(([k, v]) => `  ${k}: $${(v as number).toFixed(2)}`),
    ];
    await Share.share({message: lines.join('\n')});
  };

  return (
    <ScrollView style={styles.container} contentContainerStyle={{padding: 16}}>
      <Text style={styles.heading}>Year-End Summary</Text>

      {/* Year picker */}
      <View style={styles.yearRow}>
        {years.map(y => (
          <TouchableOpacity
            key={y}
            style={[styles.yearBtn, selectedYear === y && styles.yearBtnActive]}
            onPress={() => {
              setSelectedYear(y);
              setReport(null);
            }}>
            <Text
              style={[
                styles.yearBtnText,
                selectedYear === y && styles.yearBtnTextActive,
              ]}>
              {y}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      <TouchableOpacity
        style={[styles.generateBtn, loading && {opacity: 0.6}]}
        onPress={generateReport}
        disabled={loading}>
        <Text style={styles.generateBtnText}>
          {loading ? 'Generating...' : `Generate ${selectedYear} Report`}
        </Text>
      </TouchableOpacity>

      {loading && <ActivityIndicator style={{marginTop: 24}} />}

      {report && !loading && (
        <View style={styles.reportCard}>
          <Text style={styles.reportTitle}>{selectedYear} Financial Summary</Text>
          <View style={styles.summaryRow}>
            <Text style={styles.summaryLabel}>Starting Balance</Text>
            <Text style={styles.summaryValue}>
              ${report.startingBalance.toFixed(2)}
            </Text>
          </View>
          <View style={styles.summaryRow}>
            <Text style={styles.summaryLabel}>Total Income</Text>
            <Text style={[styles.summaryValue, {color: '#27ae60'}]}>
              +${report.totalIncome.toFixed(2)}
            </Text>
          </View>
          <View style={styles.summaryRow}>
            <Text style={styles.summaryLabel}>Total Expenses</Text>
            <Text style={[styles.summaryValue, {color: '#e74c3c'}]}>
              -${report.totalExpenses.toFixed(2)}
            </Text>
          </View>
          <View style={[styles.summaryRow, styles.summaryRowBold]}>
            <Text style={styles.summaryLabelBold}>Ending Balance</Text>
            <Text style={styles.summaryValueBold}>
              ${report.endingBalance.toFixed(2)}
            </Text>
          </View>
          <View style={styles.summaryRow}>
            <Text style={styles.summaryLabel}>Prudent Reserve</Text>
            <Text style={styles.summaryValue}>
              ${report.prudentReserve.toFixed(2)}
            </Text>
          </View>

          <Text style={styles.sectionTitle}>Income by Category</Text>
          {Object.entries(report.incomeByCategory)
            .filter(([, v]) => v && (v as number) > 0)
            .map(([k, v]) => (
              <View key={k} style={styles.catRow}>
                <Text style={styles.catLabel}>{k}</Text>
                <Text style={styles.catValue}>
                  ${(v as number).toFixed(2)}
                </Text>
              </View>
            ))}

          <Text style={styles.sectionTitle}>Expenses by Category</Text>
          {Object.entries(report.expensesByCategory)
            .filter(([, v]) => v && (v as number) > 0)
            .map(([k, v]) => (
              <View key={k} style={styles.catRow}>
                <Text style={styles.catLabel}>{k}</Text>
                <Text style={[styles.catValue, {color: '#e74c3c'}]}>
                  ${(v as number).toFixed(2)}
                </Text>
              </View>
            ))}

          <TouchableOpacity style={styles.shareBtn} onPress={handleShare}>
            <Text style={styles.shareBtnText}>Share Summary</Text>
          </TouchableOpacity>
        </View>
      )}
    </ScrollView>
  );
};

const styles = StyleSheet.create({
  container: {flex: 1, backgroundColor: '#F5F5F5'},
  heading: {fontSize: 22, fontWeight: '700', color: '#333', marginBottom: 16},
  yearRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 16,
  },
  yearBtn: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: '#DDD',
    backgroundColor: '#fff',
  },
  yearBtnActive: {backgroundColor: '#2196F3', borderColor: '#2196F3'},
  yearBtnText: {color: '#555'},
  yearBtnTextActive: {color: '#fff', fontWeight: '600'},
  generateBtn: {
    backgroundColor: '#2196F3',
    borderRadius: 8,
    padding: 14,
    alignItems: 'center',
    marginBottom: 16,
  },
  generateBtnText: {color: '#fff', fontWeight: '700', fontSize: 16},
  reportCard: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 16,
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: {width: 0, height: 1},
    shadowOpacity: 0.1,
    shadowRadius: 2,
  },
  reportTitle: {
    fontSize: 17,
    fontWeight: '700',
    color: '#333',
    marginBottom: 12,
  },
  summaryRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  summaryRowBold: {
    borderTopWidth: 1,
    borderTopColor: '#EEE',
    paddingTop: 8,
    marginTop: 4,
  },
  summaryLabel: {fontSize: 14, color: '#555'},
  summaryValue: {fontSize: 14, color: '#333', fontWeight: '500'},
  summaryLabelBold: {fontSize: 15, color: '#333', fontWeight: '700'},
  summaryValueBold: {fontSize: 15, color: '#333', fontWeight: '700'},
  sectionTitle: {
    fontSize: 15,
    fontWeight: '600',
    color: '#333',
    marginTop: 16,
    marginBottom: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#EEE',
    paddingBottom: 4,
  },
  catRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 6,
  },
  catLabel: {fontSize: 13, color: '#555', flex: 1},
  catValue: {fontSize: 13, color: '#27ae60', fontWeight: '500'},
  shareBtn: {
    backgroundColor: '#34495e',
    borderRadius: 8,
    padding: 12,
    alignItems: 'center',
    marginTop: 16,
  },
  shareBtnText: {color: '#fff', fontWeight: '600'},
});

export default YearEndSummaryScreen;
