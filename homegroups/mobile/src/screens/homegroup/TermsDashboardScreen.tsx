import React, {useState, useEffect, useCallback} from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  RefreshControl,
  Alert,
  ActivityIndicator,
} from 'react-native';
import {RouteProp, useRoute, useNavigation} from '@react-navigation/native';
import {StackNavigationProp} from '@react-navigation/stack';
import auth from '@react-native-firebase/auth';
import firestore from '@react-native-firebase/firestore';
import {GroupStackParamList} from '../../types/navigation';
import {ServicePositionDocument} from '../../types/schema';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import {format, differenceInDays} from 'date-fns';

type TermsDashboardRouteProp = RouteProp<GroupStackParamList, 'TermsDashboard'>;
type TermsDashboardNavigationProp = StackNavigationProp<GroupStackParamList>;

interface PositionWithId extends ServicePositionDocument {
  id: string;
}

const TermsDashboardScreen: React.FC = () => {
  const route = useRoute<TermsDashboardRouteProp>();
  const navigation = useNavigation<TermsDashboardNavigationProp>();
  const {groupId, groupName} = route.params;

  const [positions, setPositions] = useState<PositionWithId[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const loadData = useCallback(async () => {
    setRefreshing(true);
    try {
      const snapshot = await firestore()
        .collection('groups')
        .doc(groupId)
        .collection('servicePositions')
        .get();

      const loaded: PositionWithId[] = snapshot.docs.map(doc => ({
        id: doc.id,
        ...(doc.data() as ServicePositionDocument),
      }));

      // Sort by termEndDate ascending (positions expiring soonest first)
      loaded.sort((a, b) => {
        const aEnd = a.termEndDate
          ? (typeof (a.termEndDate as any).toDate === 'function'
              ? (a.termEndDate as any).toDate()
              : new Date(a.termEndDate as any)
            ).getTime()
          : Infinity;
        const bEnd = b.termEndDate
          ? (typeof (b.termEndDate as any).toDate === 'function'
              ? (b.termEndDate as any).toDate()
              : new Date(b.termEndDate as any)
            ).getTime()
          : Infinity;
        return aEnd - bEnd;
      });

      setPositions(loaded);
    } catch (error) {
      console.error('Error loading positions:', error);
      Alert.alert('Error', 'Failed to load service positions.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [groupId]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const toDate = (ts: any): Date | null => {
    try {
      if (!ts) return null;
      return typeof ts?.toDate === 'function' ? ts.toDate() : new Date(ts);
    } catch {
      return null;
    }
  };

  const formatDate = (ts: any): string => {
    const d = toDate(ts);
    if (!d) return '—';
    return format(d, 'MMM d, yyyy');
  };

  const getDaysUntilExpiry = (ts: any): number | null => {
    const d = toDate(ts);
    if (!d) return null;
    return differenceInDays(d, new Date());
  };

  const getUrgencyColor = (daysLeft: number | null): string => {
    if (daysLeft === null) return '#9E9E9E';
    if (daysLeft <= 7) return '#F44336';
    if (daysLeft <= 30) return '#FF9800';
    return '#FFC107';
  };

  const now = new Date();
  const in60Days = new Date(now.getTime() + 60 * 24 * 60 * 60 * 1000);

  const expiringPositions = positions.filter(p => {
    if (!p.currentHolderId || !p.termEndDate) return false;
    const d = toDate(p.termEndDate);
    if (!d) return false;
    return d >= now && d <= in60Days;
  });

  const activePositions = positions.filter(
    p => p.currentHolderId && p.termEndDate,
  );

  const vacantPositions = positions.filter(
    p => !p.currentHolderId || !p.currentHolderName,
  );

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#2196F3" />
      </View>
    );
  }

  const renderPositionCard = (position: PositionWithId, showUrgency = false) => {
    const daysLeft = showUrgency ? getDaysUntilExpiry(position.termEndDate) : null;
    const urgencyColor = showUrgency ? getUrgencyColor(daysLeft) : '#9E9E9E';
    const remindersSent = position.remindersSent;

    return (
      <View
        key={position.id}
        style={[
          styles.positionCard,
          showUrgency && {borderLeftColor: urgencyColor},
        ]}
        testID={`position-card-${position.id}`}>
        <View style={styles.positionCardHeader}>
          <Text style={styles.positionName}>{position.name}</Text>
          {showUrgency && daysLeft !== null && (
            <View
              style={[styles.urgencyBadge, {backgroundColor: urgencyColor}]}>
              <Text style={styles.urgencyBadgeText}>
                {daysLeft <= 0
                  ? 'EXPIRED'
                  : daysLeft === 1
                  ? '1 day'
                  : `${daysLeft} days`}
              </Text>
            </View>
          )}
        </View>
        <Text style={styles.holderName}>
          {position.currentHolderName || '—'}
        </Text>
        {position.termEndDate && (
          <Text style={styles.termDate}>
            Term ends: {formatDate(position.termEndDate)}
          </Text>
        )}
        {position.termStartDate && (
          <Text style={styles.termDate}>
            Started: {formatDate(position.termStartDate)}
          </Text>
        )}
        {showUrgency && remindersSent && (
          <View style={styles.reminderRow}>
            <Icon name="bell-outline" size={13} color="#9E9E9E" />
            <Text style={styles.reminderText}>
              Reminders sent:{' '}
              {[
                remindersSent.thirtyDay && '30-day',
                remindersSent.sevenDay && '7-day',
                remindersSent.oneDay && '1-day',
              ]
                .filter(Boolean)
                .join(', ') || 'None'}
            </Text>
          </View>
        )}
      </View>
    );
  };

  return (
    <ScrollView
      style={styles.container}
      refreshControl={
        <RefreshControl refreshing={refreshing} onRefresh={loadData} />
      }
      testID="terms-dashboard-screen">
      <View style={styles.pageHeader}>
        <Icon name="account-clock" size={28} color="#2196F3" />
        <Text style={styles.pageHeaderTitle}>Trusted Servant Terms</Text>
        <Text style={styles.pageHeaderSubtitle}>
          Track officer terms and upcoming expirations
        </Text>
      </View>

      {/* Expiring Within 60 Days */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>
          Expiring Within 60 Days ({expiringPositions.length})
        </Text>
        {expiringPositions.length === 0 ? (
          <Text style={styles.emptyText}>No terms expiring in the next 60 days.</Text>
        ) : (
          expiringPositions.map(p => renderPositionCard(p, true))
        )}
      </View>

      {/* All Active Terms */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>
          All Active Terms ({activePositions.length})
        </Text>
        {activePositions.length === 0 ? (
          <Text style={styles.emptyText}>No positions with active terms.</Text>
        ) : (
          activePositions.map(p => renderPositionCard(p, false))
        )}
      </View>

      {/* Positions Without Holders */}
      {vacantPositions.length > 0 && (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>
            Positions Without Holders ({vacantPositions.length})
          </Text>
          {vacantPositions.map(p => (
            <View key={p.id} style={[styles.positionCard, styles.vacantCard]}>
              <View style={styles.vacantCardHeader}>
                <View>
                  <Text style={styles.positionName}>{p.name}</Text>
                  <Text style={styles.vacantLabel}>Vacant</Text>
                </View>
                <TouchableOpacity
                  style={styles.electionButton}
                  onPress={() =>
                    navigation.navigate('GroupElections', {groupId, groupName})
                  }
                  testID={`start-election-${p.id}`}>
                  <Icon name="ballot" size={14} color="#2196F3" />
                  <Text style={styles.electionButtonText}>Start Election</Text>
                </TouchableOpacity>
              </View>
            </View>
          ))}
        </View>
      )}

      <View style={{height: 32}} />
    </ScrollView>
  );
};

const styles = StyleSheet.create({
  container: {flex: 1, backgroundColor: '#F5F5F5'},
  loadingContainer: {flex: 1, justifyContent: 'center', alignItems: 'center'},
  pageHeader: {
    backgroundColor: '#FFFFFF',
    padding: 20,
    alignItems: 'center',
    borderBottomWidth: 1,
    borderBottomColor: '#E0E0E0',
  },
  pageHeaderTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: '#212121',
    marginTop: 8,
  },
  pageHeaderSubtitle: {fontSize: 14, color: '#757575', marginTop: 4},
  section: {
    backgroundColor: '#FFFFFF',
    margin: 12,
    borderRadius: 8,
    padding: 16,
    shadowColor: '#000',
    shadowOffset: {width: 0, height: 1},
    shadowOpacity: 0.1,
    shadowRadius: 2,
    elevation: 2,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#212121',
    marginBottom: 12,
  },
  emptyText: {
    fontSize: 14,
    color: '#9E9E9E',
    fontStyle: 'italic',
    textAlign: 'center',
    padding: 12,
  },
  positionCard: {
    backgroundColor: '#F9F9F9',
    borderRadius: 8,
    padding: 12,
    marginBottom: 10,
    borderLeftWidth: 4,
    borderLeftColor: '#9E9E9E',
  },
  positionCardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 4,
  },
  positionName: {fontSize: 15, fontWeight: '700', color: '#212121'},
  holderName: {fontSize: 14, color: '#424242', marginBottom: 2},
  termDate: {fontSize: 12, color: '#757575'},
  urgencyBadge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 4,
  },
  urgencyBadgeText: {fontSize: 11, color: '#FFF', fontWeight: '700'},
  reminderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 6,
    gap: 4,
  },
  reminderText: {fontSize: 12, color: '#9E9E9E'},
  vacantCard: {borderLeftColor: '#E0E0E0'},
  vacantCardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  vacantLabel: {fontSize: 13, color: '#9E9E9E', fontStyle: 'italic'},
  electionButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#E3F2FD',
    borderRadius: 6,
    paddingHorizontal: 10,
    paddingVertical: 6,
    gap: 4,
  },
  electionButtonText: {fontSize: 13, color: '#2196F3', fontWeight: '600'},
});

export default TermsDashboardScreen;
