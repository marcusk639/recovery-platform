// src/screens/DrugTesting/DrugTestHistory.tsx
import React, { useMemo } from 'react';
import { View, FlatList, StyleSheet, TouchableOpacity } from 'react-native';
import { useRoute } from '@react-navigation/native';
import {
  useGuestDrugTests,
  usePositiveTestCount,
} from '../../state/queries/drugTestQueries';
import { DrugTest, DrugTestResult } from '../../entities/DrugTest';
import RatsText from '../../components/rats-text/rats-text';
import RatsLoadingIndicator from '../../components/rats-loading-indicator/rats-loading-indicator';
import ScreenHeader from '../../components/screen-header';

const RESULT_COLORS: Record<DrugTestResult, string> = {
  negative: '#4CAF50',
  positive: '#F44336',
  inconclusive: '#FF9800',
  refused: '#9E9E9E',
};

function StatCard({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.statCard}>
      <RatsText translate={false} text={label} style={styles.statLabel} />
      <RatsText translate={false} text={value} style={styles.statValue} />
    </View>
  );
}

function DrugTestRow({ test }: { test: DrugTest }) {
  const resultLabel =
    test.result.charAt(0).toUpperCase() + test.result.slice(1);

  return (
    <View style={styles.row}>
      <View style={styles.rowLeft}>
        <RatsText
          translate={false}
          text={new Date(test.testDate).toLocaleDateString()}
          style={styles.date}
        />
        <RatsText
          translate={false}
          text={test.observerName}
          style={styles.observer}
        />
        {test.result === 'positive' && test.substancesDetected.length > 0 && (
          <RatsText
            translate={false}
            text={test.substancesDetected.join(', ')}
            style={styles.substances}
          />
        )}
        {test.isRandom && (
          <RatsText
            translate={false}
            text="Random"
            style={styles.randomBadge}
          />
        )}
      </View>
      <View
        style={[
          styles.resultBadge,
          { backgroundColor: RESULT_COLORS[test.result] },
        ]}>
        <RatsText
          translate={false}
          text={resultLabel}
          style={styles.resultText}
        />
      </View>
    </View>
  );
}

export default function DrugTestHistory() {
  const route = useRoute<any>();
  const guestId = route.params?.guestId ?? '';

  const { data: tests, isLoading: testsLoading } = useGuestDrugTests(guestId);
  const { data: positiveCount, isLoading: countLoading } =
    usePositiveTestCount(guestId);

  const isLoading = testsLoading || countLoading;

  const stats = useMemo(() => {
    if (!tests) {
      return {
        totalTests: '0',
        positiveCount: '0',
        lastTestDate: 'N/A',
      };
    }

    const lastTest = tests.length > 0 ? tests[0] : null;
    const lastTestDate = lastTest
      ? new Date(lastTest.testDate).toLocaleDateString()
      : 'N/A';

    return {
      totalTests: tests.length.toString(),
      positiveCount: (positiveCount ?? 0).toString(),
      lastTestDate,
    };
  }, [tests, positiveCount]);

  if (isLoading) {
    return (
      <View style={styles.container}>
        <ScreenHeader renderBackButton title="Test History" />
        <View style={styles.center} testID="loading-indicator">
          <RatsLoadingIndicator />
        </View>
      </View>
    );
  }

  const testList = tests ?? [];

  return (
    <View style={styles.container}>
      <ScreenHeader renderBackButton title="Test History" />

      {/* Summary Stats */}
      <View style={styles.statsRow}>
        <StatCard label="Total Tests" value={stats.totalTests} />
        <StatCard label="Positive/Refused" value={stats.positiveCount} />
        <StatCard label="Last Test" value={stats.lastTestDate} />
      </View>

      {/* Drug Test List */}
      {testList.length === 0 ? (
        <View style={styles.emptyContainer}>
          <RatsText
            translate={false}
            text="No drug tests recorded"
            style={styles.emptyText}
          />
        </View>
      ) : (
        <FlatList
          data={testList}
          keyExtractor={item => item.id}
          renderItem={({ item }) => <DrugTestRow test={item} />}
          contentContainerStyle={styles.list}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#fff' },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  statsRow: {
    flexDirection: 'row',
    paddingHorizontal: 12,
    paddingVertical: 16,
    gap: 10,
  },
  statCard: {
    flex: 1,
    backgroundColor: '#f5f5f5',
    borderRadius: 8,
    padding: 12,
    alignItems: 'center',
  },
  statLabel: { fontSize: 12, color: '#666', marginBottom: 6 },
  statValue: { fontSize: 16, fontWeight: '700', color: '#333' },
  list: { paddingHorizontal: 16 },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#e0e0e0',
  },
  rowLeft: { flex: 1 },
  date: { fontSize: 15, fontWeight: '600' },
  observer: { fontSize: 13, color: '#666', marginTop: 2 },
  substances: {
    fontSize: 12,
    color: '#F44336',
    marginTop: 2,
    fontStyle: 'italic',
  },
  randomBadge: {
    fontSize: 11,
    color: '#1976D2',
    fontWeight: '600',
    marginTop: 2,
  },
  resultBadge: { paddingHorizontal: 12, paddingVertical: 4, borderRadius: 12 },
  resultText: { color: '#fff', fontSize: 13, fontWeight: '600' },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 16,
  },
  emptyText: { fontSize: 14, color: '#999', textAlign: 'center' },
});
