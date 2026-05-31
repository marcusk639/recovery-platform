import React, { useState } from 'react';
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { color } from '../../styles/theme';
import { useHouseApplications } from '../../state/queries/applicationQueries';
import {
  HouseApplication,
  ApplicationStatus,
} from '../../entities/Application';
import { Routes } from '../../navigation/types';
import { useAppSelector } from '../../state/store';

type TabKey = 'pending' | 'reviewing' | 'decided';

function statusToTab(s: ApplicationStatus): TabKey {
  if (s === 'pending') return 'pending';
  if (s === 'reviewing') return 'reviewing';
  return 'decided';
}

function AppRow({
  app,
  onPress,
}: {
  app: HouseApplication;
  onPress: () => void;
}) {
  return (
    <TouchableOpacity
      style={styles.row}
      onPress={onPress}
      testID={`app-row-${app.id}`}>
      <View style={styles.rowBody}>
        <Text style={styles.rowName}>{app.applicantName}</Text>
        <Text style={styles.rowEmail}>{app.applicantEmail}</Text>
      </View>
      <Text style={styles.chevron}>›</Text>
    </TouchableOpacity>
  );
}

export default function ApplicationListScreen() {
  const navigation = useNavigation<any>();
  const houseId: string = useAppSelector(
    (s: any) => s.houses.selectedHouseId ?? '',
  );
  const [activeTab, setActiveTab] = useState<TabKey>('pending');

  const { data: apps, isLoading } = useHouseApplications(houseId);
  const filtered = (apps ?? []).filter(
    a => statusToTab(a.status) === activeTab,
  );

  const countFor = (tab: TabKey) =>
    (apps ?? []).filter(a => statusToTab(a.status) === tab).length;

  return (
    <View style={styles.container}>
      <Text style={styles.heading}>Applications</Text>

      <View style={styles.tabs}>
        {(['pending', 'reviewing', 'decided'] as TabKey[]).map(tab => {
          const count = countFor(tab);
          return (
            <TouchableOpacity
              key={tab}
              onPress={() => setActiveTab(tab)}
              style={[styles.tab, activeTab === tab && styles.tabActive]}>
              <Text
                style={
                  activeTab === tab ? styles.tabTextActive : styles.tabText
                }>
                {tab.charAt(0).toUpperCase() + tab.slice(1)}
                {count > 0 ? ` (${count})` : ''}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>

      {isLoading ? (
        <ActivityIndicator style={styles.loader} color={color.blue} />
      ) : filtered.length === 0 ? (
        <View style={styles.empty}>
          <Text style={styles.emptyText}>No {activeTab} applications</Text>
        </View>
      ) : (
        <FlatList
          data={filtered}
          keyExtractor={item => item.id}
          renderItem={({ item }) => (
            <AppRow
              app={item}
              onPress={() =>
                navigation.navigate(Routes.ApplicationDetail, {
                  houseId,
                  appId: item.id,
                })
              }
            />
          )}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: color.white },
  heading: {
    fontSize: 20,
    fontWeight: '700',
    color: color.black,
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 0,
  },
  tabs: {
    flexDirection: 'row',
    paddingHorizontal: 16,
    paddingTop: 12,
    borderBottomWidth: 1,
    borderColor: color.grey,
  },
  tab: { marginRight: 16, paddingBottom: 10 },
  tabActive: { borderBottomWidth: 2, borderColor: color.blue },
  tabText: { fontSize: 14, color: color.grey },
  tabTextActive: { fontSize: 14, color: color.blue, fontWeight: '600' },
  loader: { marginTop: 48 },
  empty: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  emptyText: { color: color.grey, fontSize: 15 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
    borderBottomWidth: 1,
    borderColor: color.grey,
  },
  rowBody: { flex: 1 },
  rowName: { fontSize: 15, fontWeight: '600', color: color.black },
  rowEmail: { fontSize: 13, color: color.grey, marginTop: 2 },
  chevron: { fontSize: 20, color: color.grey },
});
