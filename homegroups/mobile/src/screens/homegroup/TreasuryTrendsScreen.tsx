import React, {useState, useEffect} from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
  Dimensions,
} from 'react-native';
import {RouteProp, useRoute, useNavigation} from '@react-navigation/native';
import {StackNavigationProp} from '@react-navigation/stack';
import functions from '@react-native-firebase/functions';
import firestore from '@react-native-firebase/firestore';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import {
  VictoryChart,
  VictoryLine,
  VictoryBar,
  VictoryPie,
  VictoryAxis,
  VictoryTheme,
  VictoryArea,
  VictoryGroup,
} from 'victory-native';
import {GroupStackParamList} from '../../types/navigation';
import {TreasuryExportService, TransactionExportDocument} from '../../services/reports/TreasuryExportService';

type TreasuryTrendsRouteProp = RouteProp<GroupStackParamList, 'TreasuryTrends'>;
type TreasuryTrendsNavProp = StackNavigationProp<GroupStackParamList>;

const SCREEN_WIDTH = Dimensions.get('window').width;
const CHART_WIDTH = SCREEN_WIDTH - 48;

interface PeriodTreasuryData {
  label: string;
  income: number;
  expenses: number;
  net: number;
  runningBalance?: number;
}

interface CategoryTotal {
  category: string;
  total: number;
  percentage: number;
  type: 'income' | 'expense';
}

interface TreasuryTrendsResult {
  groupId: string;
  granularity: 'monthly' | 'quarterly';
  periods: number;
  trend: PeriodTreasuryData[];
  expenseCategories: CategoryTotal[];
  incomeCategories: CategoryTotal[];
  currentBalance: number;
  totalIncomeAllPeriods: number;
  totalExpensesAllPeriods: number;
  computedAt: string;
}

const PIE_COLORS = [
  '#1976D2', '#4CAF50', '#F57C00', '#E91E63', '#9C27B0',
  '#00BCD4', '#FF5722', '#607D8B', '#FFC107', '#8BC34A',
];

type GranularityType = 'monthly' | 'quarterly';
type PieToggle = 'expense' | 'income';

const TreasuryTrendsScreen: React.FC = () => {
  const route = useRoute<TreasuryTrendsRouteProp>();
  const navigation = useNavigation<TreasuryTrendsNavProp>();
  const {groupId, groupName} = route.params;

  const [granularity, setGranularity] = useState<GranularityType>('monthly');
  const [periods, setPeriods] = useState(6);
  const [data, setData] = useState<TreasuryTrendsResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [pieToggle, setPieToggle] = useState<PieToggle>('expense');

  const loadData = async (gran: GranularityType, numPeriods: number) => {
    setLoading(true);
    try {
      const callable = functions().httpsCallable('getTreasuryTrends');
      const result = await callable({
        groupId,
        granularity: gran,
        periods: numPeriods,
      });
      setData(result.data as TreasuryTrendsResult);
    } catch (err: any) {
      Alert.alert('Error', err.message || 'Failed to load treasury trends.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData(granularity, periods);
  }, []);

  const handleGranularityChange = (gran: GranularityType) => {
    setGranularity(gran);
    loadData(gran, periods);
  };

  const handlePeriodsChange = (delta: number) => {
    const newPeriods = Math.min(12, Math.max(3, periods + delta));
    if (newPeriods !== periods) {
      setPeriods(newPeriods);
      loadData(granularity, newPeriods);
    }
  };

  const handleExport = async () => {
    if (!data) return;
    setExporting(true);
    try {
      // Compute rangeStart based on current data, accounting for granularity
      const rangeStart = new Date();
      if (granularity === 'quarterly') {
        rangeStart.setMonth(rangeStart.getMonth() - periods * 3);
      } else {
        rangeStart.setMonth(rangeStart.getMonth() - periods);
      }
      rangeStart.setDate(1);
      rangeStart.setHours(0, 0, 0, 0);

      const txSnap = await firestore()
        .collection('transactions')
        .where('groupId', '==', groupId)
        .where('createdAt', '>=', rangeStart)
        .orderBy('createdAt', 'asc')
        .get();

      const transactions: TransactionExportDocument[] = txSnap.docs.map(d => ({
        id: d.id,
        ...d.data(),
      })) as TransactionExportDocument[];

      const periodLabel = `Last ${periods} ${granularity === 'monthly' ? 'Months' : 'Quarters'}`;
      await TreasuryExportService.exportAndShare(
        transactions,
        groupName,
        periodLabel,
      );
    } catch (err: any) {
      Alert.alert('Export Error', err.message || 'Failed to export transactions.');
    } finally {
      setExporting(false);
    }
  };

  const formatCurrency = (amount: number) => `$${Math.abs(amount).toFixed(2)}`;

  const activePieData =
    pieToggle === 'expense'
      ? data?.expenseCategories || []
      : data?.incomeCategories || [];

  return (
    <View style={styles.container}>
      {/* Controls */}
      <View style={styles.controlsRow}>
        <View style={styles.granularityToggle}>
          {(['monthly', 'quarterly'] as GranularityType[]).map(g => (
            <TouchableOpacity
              key={g}
              style={[
                styles.granBtn,
                granularity === g && styles.granBtnActive,
              ]}
              onPress={() => handleGranularityChange(g)}
              testID={`treasury-gran-${g}`}>
              <Text
                style={[
                  styles.granBtnText,
                  granularity === g && styles.granBtnTextActive,
                ]}>
                {g === 'monthly' ? 'Monthly' : 'Quarterly'}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
        <View style={styles.periodStepper}>
          <TouchableOpacity
            style={styles.stepperBtn}
            onPress={() => handlePeriodsChange(-1)}>
            <Icon name="chevron-left" size={18} color="#424242" />
          </TouchableOpacity>
          <Text style={styles.stepperText}>Last {periods}</Text>
          <TouchableOpacity
            style={styles.stepperBtn}
            onPress={() => handlePeriodsChange(1)}>
            <Icon name="chevron-right" size={18} color="#424242" />
          </TouchableOpacity>
        </View>
      </View>

      {loading ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#F57C00" />
          <Text style={styles.loadingText}>Loading treasury trends...</Text>
        </View>
      ) : (
        <ScrollView
          style={styles.scroll}
          testID="treasury-trends-scroll">
          {data && (
            <>
              {/* INCOME vs EXPENSES */}
              <View style={styles.card}>
                <View style={styles.cardHeader}>
                  <Icon name="cash-multiple" size={20} color="#F57C00" />
                  <Text style={styles.cardTitle}>Income vs. Expenses</Text>
                </View>
                {data.trend.length > 0 ? (
                  <>
                    <VictoryChart
                      width={CHART_WIDTH}
                      height={200}
                      theme={VictoryTheme.material}
                      domainPadding={{x: 20}}>
                      <VictoryAxis
                        style={{
                          tickLabels: {fontSize: 10, fill: '#757575'},
                          grid: {stroke: 'none'},
                        }}
                      />
                      <VictoryAxis
                        dependentAxis
                        tickFormat={v => `$${v}`}
                        style={{
                          tickLabels: {fontSize: 10, fill: '#757575'},
                          grid: {stroke: '#F0F0F0'},
                        }}
                      />
                      <VictoryGroup offset={12}>
                        <VictoryBar
                          data={data.trend.map(p => ({x: p.label, y: p.income}))}
                          style={{data: {fill: '#4CAF50', width: 10}}}
                          animate={{duration: 400}}
                        />
                        <VictoryBar
                          data={data.trend.map(p => ({
                            x: p.label,
                            y: p.expenses,
                          }))}
                          style={{data: {fill: '#F44336', width: 10}}}
                          animate={{duration: 400}}
                        />
                      </VictoryGroup>
                    </VictoryChart>
                    <View style={styles.summaryRow}>
                      <Text style={styles.summaryText}>
                        Total Income:{' '}
                        <Text style={styles.summaryGreen}>
                          {formatCurrency(data.totalIncomeAllPeriods)}
                        </Text>
                      </Text>
                      <Text style={styles.summaryText}>
                        Total Expenses:{' '}
                        <Text style={styles.summaryRed}>
                          {formatCurrency(data.totalExpensesAllPeriods)}
                        </Text>
                      </Text>
                    </View>
                    <View style={styles.legendRow}>
                      <View style={styles.legendItem}>
                        <View style={[styles.legendDot, {backgroundColor: '#4CAF50'}]} />
                        <Text style={styles.legendText}>Income</Text>
                      </View>
                      <View style={styles.legendItem}>
                        <View style={[styles.legendDot, {backgroundColor: '#F44336'}]} />
                        <Text style={styles.legendText}>Expenses</Text>
                      </View>
                    </View>
                  </>
                ) : (
                  <View style={styles.emptyState}>
                    <Icon name="cash-remove" size={40} color="#BDBDBD" />
                    <Text style={styles.emptyText}>No transaction data yet.</Text>
                  </View>
                )}
              </View>

              {/* RUNNING BALANCE */}
              <View style={styles.card}>
                <View style={styles.cardHeader}>
                  <Icon name="trending-up" size={20} color="#F57C00" />
                  <Text style={styles.cardTitle}>Running Balance</Text>
                </View>
                {data.trend.some(p => p.runningBalance !== undefined) ? (
                  <>
                    <VictoryChart
                      width={CHART_WIDTH}
                      height={200}
                      theme={VictoryTheme.material}
                      domainPadding={{x: 20}}>
                      <VictoryAxis
                        style={{
                          tickLabels: {fontSize: 10, fill: '#757575'},
                          grid: {stroke: 'none'},
                        }}
                      />
                      <VictoryAxis
                        dependentAxis
                        tickFormat={v => `$${v}`}
                        style={{
                          tickLabels: {fontSize: 10, fill: '#757575'},
                          grid: {stroke: '#F0F0F0'},
                        }}
                      />
                      <VictoryArea
                        data={data.trend
                          .filter(p => p.runningBalance !== undefined)
                          .map(p => ({
                            x: p.label,
                            y: p.runningBalance,
                          }))}
                        style={{
                          data: {
                            fill: '#FFF3E0',
                            stroke: '#F57C00',
                            strokeWidth: 2,
                          },
                        }}
                        animate={{duration: 400}}
                      />
                    </VictoryChart>
                    <View style={styles.balanceBadge}>
                      <Text style={styles.balanceBadgeLabel}>
                        Current Balance
                      </Text>
                      <Text style={styles.balanceBadgeValue}>
                        {formatCurrency(data.currentBalance)}
                      </Text>
                    </View>
                  </>
                ) : (
                  <View style={styles.emptyState}>
                    <Icon name="cash-off" size={40} color="#BDBDBD" />
                    <Text style={styles.emptyText}>No balance data.</Text>
                  </View>
                )}
              </View>

              {/* CATEGORY BREAKDOWN */}
              <View style={styles.card}>
                <View style={styles.cardHeader}>
                  <Icon name="chart-pie" size={20} color="#F57C00" />
                  <Text style={styles.cardTitle}>Where Did the Money Go?</Text>
                </View>
                {/* Toggle */}
                <View style={styles.pieToggleRow}>
                  {(['expense', 'income'] as PieToggle[]).map(t => (
                    <TouchableOpacity
                      key={t}
                      style={[
                        styles.pieToggleBtn,
                        pieToggle === t && styles.pieToggleBtnActive,
                      ]}
                      onPress={() => setPieToggle(t)}
                      testID={`pie-toggle-${t}`}>
                      <Text
                        style={[
                          styles.pieToggleText,
                          pieToggle === t && styles.pieToggleTextActive,
                        ]}>
                        {t === 'expense' ? 'Expenses' : 'Income'}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>

                {activePieData.length > 0 ? (
                  <>
                    <View style={styles.chartContainer}>
                      <VictoryPie
                        width={220}
                        height={220}
                        data={activePieData.slice(0, 10).map((c, i) => ({
                          x: c.category,
                          y: c.total,
                          label: `${c.percentage}%`,
                        }))}
                        colorScale={PIE_COLORS}
                        style={{
                          labels: {fontSize: 10, fill: '#212121'},
                        }}
                        innerRadius={50}
                        animate={{duration: 400}}
                      />
                    </View>
                    {/* Legend */}
                    {activePieData.slice(0, 10).map((c, i) => (
                      <View key={c.category} style={styles.pieLegendItem}>
                        <View
                          style={[
                            styles.pieLegendDot,
                            {backgroundColor: PIE_COLORS[i % PIE_COLORS.length]},
                          ]}
                        />
                        <Text style={styles.pieLegendCategory} numberOfLines={1}>
                          {c.category}
                        </Text>
                        <Text style={styles.pieLegendPercent}>
                          {c.percentage}%
                        </Text>
                        <Text style={styles.pieLegendAmount}>
                          {formatCurrency(c.total)}
                        </Text>
                      </View>
                    ))}
                  </>
                ) : (
                  <View style={styles.emptyState}>
                    <Icon name="chart-pie-outline" size={40} color="#BDBDBD" />
                    <Text style={styles.emptyText}>No category data.</Text>
                  </View>
                )}
              </View>

              {/* EXPORT */}
              <View style={styles.card}>
                <View style={styles.cardHeader}>
                  <Icon name="export-variant" size={20} color="#F57C00" />
                  <Text style={styles.cardTitle}>Export</Text>
                </View>
                <TouchableOpacity
                  style={styles.exportBtn}
                  onPress={handleExport}
                  disabled={exporting}
                  testID="treasury-export-csv-btn">
                  {exporting ? (
                    <ActivityIndicator size="small" color="#FFFFFF" />
                  ) : (
                    <>
                      <Icon
                        name="file-delimited"
                        size={18}
                        color="#FFFFFF"
                        style={{marginRight: 8}}
                      />
                      <Text style={styles.exportBtnText}>Export as CSV</Text>
                    </>
                  )}
                </TouchableOpacity>
                <Text style={styles.exportSubtext}>
                  Exports all transactions in the selected period range
                </Text>

                <TouchableOpacity
                  style={styles.yearEndLink}
                  onPress={() =>
                    navigation.navigate('YearEndSummary', {groupId, groupName})
                  }
                  testID="year-end-report-link">
                  <Icon name="file-pdf-box" size={18} color="#F57C00" style={{marginRight: 6}} />
                  <Text style={styles.yearEndLinkText}>
                    Full Year-End Report →
                  </Text>
                </TouchableOpacity>
              </View>

              <View style={styles.footer}>
                <Text style={styles.footerText}>
                  Updated{' '}
                  {new Date(data.computedAt).toLocaleTimeString('en-US', {
                    hour: '2-digit',
                    minute: '2-digit',
                  })}
                </Text>
              </View>
            </>
          )}

          {!data && !loading && (
            <View style={styles.loadingContainer}>
              <Icon name="chart-areaspline" size={48} color="#BDBDBD" />
              <Text style={styles.emptyText}>No treasury data</Text>
            </View>
          )}
        </ScrollView>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {flex: 1, backgroundColor: '#F5F5F5'},
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingTop: 60,
  },
  loadingText: {marginTop: 12, fontSize: 14, color: '#757575'},
  controlsRow: {
    flexDirection: 'row',
    backgroundColor: '#FFFFFF',
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#E0E0E0',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  granularityToggle: {flexDirection: 'row'},
  granBtn: {
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 6,
    marginRight: 4,
    backgroundColor: '#F5F5F5',
  },
  granBtnActive: {backgroundColor: '#F57C00'},
  granBtnText: {fontSize: 13, color: '#757575', fontWeight: '500'},
  granBtnTextActive: {color: '#FFFFFF', fontWeight: '600'},
  periodStepper: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  stepperBtn: {
    padding: 6,
    backgroundColor: '#F5F5F5',
    borderRadius: 4,
  },
  stepperText: {fontSize: 13, color: '#424242', fontWeight: '500', minWidth: 50, textAlign: 'center'},
  scroll: {flex: 1},
  card: {
    backgroundColor: '#FFFFFF',
    borderRadius: 8,
    margin: 12,
    marginBottom: 0,
    padding: 16,
    shadowColor: '#000',
    shadowOffset: {width: 0, height: 1},
    shadowOpacity: 0.08,
    shadowRadius: 2,
    elevation: 2,
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 14,
  },
  cardTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#212121',
    marginLeft: 8,
  },
  summaryRow: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    marginTop: 8,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: '#F0F0F0',
  },
  summaryText: {fontSize: 12, color: '#424242'},
  summaryGreen: {color: '#2E7D32', fontWeight: '700'},
  summaryRed: {color: '#C62828', fontWeight: '700'},
  legendRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    marginTop: 8,
    gap: 24,
  },
  legendItem: {flexDirection: 'row', alignItems: 'center'},
  legendDot: {width: 12, height: 12, borderRadius: 6, marginRight: 6},
  legendText: {fontSize: 12, color: '#424242'},
  balanceBadge: {
    alignSelf: 'center',
    backgroundColor: '#FFF8E1',
    borderRadius: 8,
    padding: 12,
    alignItems: 'center',
    marginTop: 8,
  },
  balanceBadgeLabel: {fontSize: 12, color: '#F57C00', marginBottom: 2},
  balanceBadgeValue: {fontSize: 24, fontWeight: '700', color: '#E65100'},
  pieToggleRow: {
    flexDirection: 'row',
    marginBottom: 12,
    backgroundColor: '#F5F5F5',
    borderRadius: 8,
    padding: 2,
  },
  pieToggleBtn: {
    flex: 1,
    paddingVertical: 6,
    alignItems: 'center',
    borderRadius: 6,
  },
  pieToggleBtnActive: {backgroundColor: '#FFFFFF'},
  pieToggleText: {fontSize: 13, color: '#757575', fontWeight: '500'},
  pieToggleTextActive: {color: '#212121', fontWeight: '600'},
  chartContainer: {alignItems: 'center'},
  pieLegendItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 6,
    borderTopWidth: 1,
    borderTopColor: '#F5F5F5',
  },
  pieLegendDot: {
    width: 12,
    height: 12,
    borderRadius: 6,
    marginRight: 8,
  },
  pieLegendCategory: {
    flex: 1,
    fontSize: 13,
    color: '#424242',
  },
  pieLegendPercent: {
    fontSize: 13,
    color: '#757575',
    marginRight: 8,
    minWidth: 35,
    textAlign: 'right',
  },
  pieLegendAmount: {
    fontSize: 13,
    fontWeight: '600',
    color: '#212121',
    minWidth: 70,
    textAlign: 'right',
  },
  exportBtn: {
    backgroundColor: '#F57C00',
    borderRadius: 8,
    paddingVertical: 12,
    paddingHorizontal: 20,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 8,
  },
  exportBtnText: {color: '#FFFFFF', fontWeight: '600', fontSize: 15},
  exportSubtext: {fontSize: 12, color: '#9E9E9E', textAlign: 'center'},
  yearEndLink: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 12,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: '#F0F0F0',
  },
  yearEndLinkText: {color: '#F57C00', fontWeight: '500', fontSize: 14},
  emptyState: {alignItems: 'center', paddingVertical: 24},
  emptyText: {
    fontSize: 13,
    color: '#9E9E9E',
    textAlign: 'center',
    marginTop: 8,
  },
  footer: {
    alignItems: 'center',
    paddingVertical: 16,
    marginTop: 4,
  },
  footerText: {fontSize: 12, color: '#BDBDBD'},
});

export default TreasuryTrendsScreen;
