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
import {ElectionDocument} from '../../types/schema';
import {useAppSelector} from '../../store';
import {selectGroupById} from '../../store/slices/groupsSlice';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import {format} from 'date-fns';

type GroupElectionsRouteProp = RouteProp<GroupStackParamList, 'GroupElections'>;
type GroupElectionsNavigationProp = StackNavigationProp<GroupStackParamList>;

const GroupElectionsScreen: React.FC = () => {
  const route = useRoute<GroupElectionsRouteProp>();
  const navigation = useNavigation<GroupElectionsNavigationProp>();
  const {groupId, groupName} = route.params;
  const currentUser = auth().currentUser;

  const group = useAppSelector(state => selectGroupById(state, groupId));
  const isAdmin = group?.admins?.includes(currentUser?.uid || '') ?? false;

  const [elections, setElections] = useState<ElectionDocument[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const loadData = useCallback(async () => {
    setRefreshing(true);
    try {
      const snapshot = await firestore()
        .collection('group_elections')
        .where('groupId', '==', groupId)
        .orderBy('createdAt', 'desc')
        .get();

      const loaded: ElectionDocument[] = snapshot.docs.map(doc => ({
        id: doc.id,
        ...(doc.data() as Omit<ElectionDocument, 'id'>),
      }));
      setElections(loaded);
    } catch (error) {
      console.error('Error loading elections:', error);
      Alert.alert('Error', 'Failed to load elections.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [groupId]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const formatTimestamp = (ts: any): string => {
    try {
      const date =
        typeof ts?.toDate === 'function' ? ts.toDate() : new Date(ts);
      return format(date, 'MMM d, yyyy');
    } catch {
      return '';
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'nominations_open':
        return '#2196F3';
      case 'voting_open':
        return '#4CAF50';
      case 'closed':
        return '#9E9E9E';
      default:
        return '#9E9E9E';
    }
  };

  const getStatusLabel = (status: string) => {
    switch (status) {
      case 'nominations_open':
        return 'NOMINATIONS OPEN';
      case 'voting_open':
        return 'VOTING OPEN';
      case 'closed':
        return 'CLOSED';
      default:
        return status.toUpperCase();
    }
  };

  const activeElections = elections.filter(e => e.status !== 'closed');
  const pastElections = elections.filter(e => e.status === 'closed');

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#2196F3" />
      </View>
    );
  }

  const renderElectionCard = (election: ElectionDocument) => {
    const isClosed = election.status === 'closed';
    const nonWithdrawnNominees = (election.nominees || []).filter(
      n => !n.withdrawn,
    );
    const totalVotes = Object.keys(election.votes || {}).length;

    return (
      <TouchableOpacity
        key={election.id}
        style={[
          styles.electionCard,
          {
            borderLeftColor: getStatusColor(election.status),
          },
          isClosed && styles.electionCardClosed,
        ]}
        onPress={() =>
          navigation.navigate('ElectionDetail', {
            groupId,
            groupName,
            electionId: election.id,
          })
        }
        testID={`election-card-${election.id}`}>
        <View style={styles.cardHeader}>
          <View
            style={[
              styles.statusBadge,
              {backgroundColor: getStatusColor(election.status)},
            ]}>
            <Text style={styles.statusBadgeText}>
              {getStatusLabel(election.status)}
            </Text>
          </View>
          <Icon name="chevron-right" size={20} color="#9E9E9E" />
        </View>
        <Text style={styles.positionName}>{election.positionName}</Text>
        {!isClosed && (
          <Text style={styles.nomineeCount}>
            {nonWithdrawnNominees.length} nominee
            {nonWithdrawnNominees.length !== 1 ? 's' : ''} so far
          </Text>
        )}
        {isClosed && election.result && (
          <View style={styles.resultRow}>
            {election.result.tied ? (
              <Text style={styles.resultText}>Result: Tied</Text>
            ) : (
              <Text style={styles.resultText}>
                Result: {election.result.winnerName || 'No winner'} elected
              </Text>
            )}
          </View>
        )}
        {isClosed && (
          <Text style={styles.closedMeta}>
            {formatTimestamp(election.closedAt)}
            {election.result
              ? `  •  ${election.result.totalVotes} of ${election.result.totalEligible} voted`
              : ''}
          </Text>
        )}
      </TouchableOpacity>
    );
  };

  return (
    <ScrollView
      style={styles.container}
      refreshControl={
        <RefreshControl refreshing={refreshing} onRefresh={loadData} />
      }
      testID="group-elections-screen">
      <View style={styles.pageHeader}>
        <Icon name="ballot" size={28} color="#2196F3" />
        <Text style={styles.pageHeaderTitle}>Officer Elections</Text>
        <Text style={styles.pageHeaderSubtitle}>
          Nominate and elect trusted servants
        </Text>
      </View>

      {/* Active Elections */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>
          Active Elections ({activeElections.length})
        </Text>
        {activeElections.length > 0 ? (
          activeElections.map(renderElectionCard)
        ) : (
          <Text style={styles.emptyStateText}>No active elections.</Text>
        )}
      </View>

      {/* Past Elections */}
      {pastElections.length > 0 && (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>
            Past Elections ({pastElections.length})
          </Text>
          {pastElections.map(renderElectionCard)}
        </View>
      )}

      <View style={{height: 32}} />
    </ScrollView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F5F5F5',
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
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
  pageHeaderSubtitle: {
    fontSize: 14,
    color: '#757575',
    marginTop: 4,
  },
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
  emptyStateText: {
    fontSize: 14,
    color: '#9E9E9E',
    fontStyle: 'italic',
    textAlign: 'center',
    padding: 16,
  },
  electionCard: {
    backgroundColor: '#F9F9F9',
    borderRadius: 8,
    padding: 14,
    marginBottom: 10,
    borderLeftWidth: 4,
  },
  electionCardClosed: {
    backgroundColor: '#FAFAFA',
    borderLeftColor: '#9E9E9E',
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  statusBadge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 4,
  },
  statusBadgeText: {
    color: '#FFFFFF',
    fontSize: 11,
    fontWeight: '700',
  },
  positionName: {
    fontSize: 16,
    fontWeight: '700',
    color: '#212121',
    marginBottom: 4,
  },
  nomineeCount: {
    fontSize: 13,
    color: '#757575',
  },
  resultRow: {
    marginTop: 4,
  },
  resultText: {
    fontSize: 13,
    color: '#2E7D32',
    fontWeight: '600',
  },
  closedMeta: {
    fontSize: 12,
    color: '#9E9E9E',
    marginTop: 4,
  },
});

export default GroupElectionsScreen;
