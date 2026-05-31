// src/screens/DrugTesting/DrugTestingScreen.tsx
import React, { useMemo, useState } from 'react';
import { View, FlatList, StyleSheet, TouchableOpacity } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { useData } from '../../context/DataContext';
import { useHouseDrugTests } from '../../state/queries/drugTestQueries';
import { DrugTest, DrugTestResult } from '../../entities/DrugTest';
import { Routes } from '../../navigation/types';
import RatsText from '../../components/rats-text/rats-text';
import RatsLoadingIndicator from '../../components/rats-loading-indicator/rats-loading-indicator';

const RESULT_COLORS: Record<DrugTestResult, string> = {
  negative: '#4CAF50',
  positive: '#F44336',
  inconclusive: '#FF9800',
  refused: '#9E9E9E',
};

function DrugTestRow({ test }: { test: DrugTest }) {
  const navigation = useNavigation<any>();
  const resultLabel =
    test.result.charAt(0).toUpperCase() + test.result.slice(1);
  return (
    <TouchableOpacity
      style={styles.row}
      onPress={() =>
        navigation.navigate(Routes.DrugTestHistory, { guestId: test.guestId })
      }>
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
    </TouchableOpacity>
  );
}

export default function DrugTestingScreen() {
  const navigation = useNavigation<any>();
  const { currentHouse } = useData();
  const { data: tests, isLoading } = useHouseDrugTests(currentHouse?.id ?? '');

  const [filter, setFilter] = useState<DrugTestResult | 'all'>('all');

  const filteredTests = useMemo(() => {
    if (!tests) return [];
    if (filter === 'all') return tests;
    return tests.filter(t => t.result === filter);
  }, [tests, filter]);

  if (isLoading) {
    return (
      <View style={styles.center} testID="loading-indicator">
        <RatsLoadingIndicator />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <View style={styles.filterRow}>
        {(
          ['all', 'negative', 'positive', 'inconclusive', 'refused'] as const
        ).map(f => (
          <TouchableOpacity
            key={f}
            style={[styles.filterPill, filter === f && styles.filterActive]}
            onPress={() => setFilter(f)}>
            <RatsText
              translate={false}
              text={f.charAt(0).toUpperCase() + f.slice(1)}
              style={[
                styles.filterText,
                filter === f && styles.filterTextActive,
              ]}
            />
          </TouchableOpacity>
        ))}
      </View>
      <FlatList
        data={filteredTests}
        keyExtractor={item => item.id}
        renderItem={({ item }) => <DrugTestRow test={item} />}
        contentContainerStyle={styles.list}
      />
      <TouchableOpacity
        testID="fab-log-test"
        style={styles.fab}
        onPress={() => navigation.navigate(Routes.DrugTestForm, {})}>
        <RatsText translate={false} text="+" style={styles.fabText} />
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#fff' },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  filterRow: { flexDirection: 'row', padding: 12, gap: 8 },
  filterPill: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
    backgroundColor: '#f0f0f0',
  },
  filterActive: { backgroundColor: '#1976D2' },
  filterText: { fontSize: 13, color: '#666' },
  filterTextActive: { color: '#fff' },
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
  randomBadge: {
    fontSize: 11,
    color: '#1976D2',
    fontWeight: '600',
    marginTop: 2,
  },
  resultBadge: { paddingHorizontal: 12, paddingVertical: 4, borderRadius: 12 },
  resultText: { color: '#fff', fontSize: 13, fontWeight: '600' },
  fab: {
    position: 'absolute',
    right: 20,
    bottom: 30,
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: '#1976D2',
    justifyContent: 'center',
    alignItems: 'center',
    elevation: 4,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 4,
  },
  fabText: { color: '#fff', fontSize: 28, lineHeight: 30 },
});
