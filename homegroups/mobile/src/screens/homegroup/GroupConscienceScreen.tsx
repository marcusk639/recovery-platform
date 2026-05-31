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
import functions from '@react-native-firebase/functions';
import firestore from '@react-native-firebase/firestore';
import {GroupStackParamList} from '../../types/navigation';
import {ConscienceVoteDocument} from '../../types/schema';
import {useAppSelector} from '../../store';
import {selectGroupById} from '../../store/slices/groupsSlice';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import {format} from 'date-fns';

type GroupConscienceRouteProp = RouteProp<
  GroupStackParamList,
  'GroupConscience'
>;
type GroupConscienceNavigationProp = StackNavigationProp<GroupStackParamList>;

const GroupConscienceScreen: React.FC = () => {
  const route = useRoute<GroupConscienceRouteProp>();
  const navigation = useNavigation<GroupConscienceNavigationProp>();
  const {groupId, groupName} = route.params;
  const currentUser = auth().currentUser;

  const group = useAppSelector(state => selectGroupById(state, groupId));
  const isAdmin = group?.admins?.includes(currentUser?.uid || '') ?? false;

  const [votes, setVotes] = useState<ConscienceVoteDocument[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [castingVote, setCastingVote] = useState<string | null>(null);

  // Set header button for admins
  useEffect(() => {
    if (isAdmin) {
      navigation.setOptions({
        headerRight: () => (
          <TouchableOpacity
            style={styles.headerButton}
            onPress={() =>
              navigation.navigate('CreateConscienceVote', {groupId, groupName})
            }
            testID="new-vote-header-button">
            <Icon name="plus" size={22} color="#2196F3" />
          </TouchableOpacity>
        ),
      });
    }
  }, [navigation, isAdmin, groupId, groupName]);

  const loadVotes = useCallback(async () => {
    setRefreshing(true);
    try {
      const snapshot = await firestore()
        .collection('group_conscience_votes')
        .where('groupId', '==', groupId)
        .orderBy('openedAt', 'desc')
        .get();

      const loaded: ConscienceVoteDocument[] = snapshot.docs.map(doc => ({
        id: doc.id,
        ...(doc.data() as Omit<ConscienceVoteDocument, 'id'>),
      }));
      setVotes(loaded);
    } catch (error) {
      console.error('Error loading votes:', error);
      Alert.alert('Error', 'Failed to load votes. Please try again.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [groupId]);

  useEffect(() => {
    loadVotes();
  }, [loadVotes]);

  const handleCastVote = async (voteId: string, option: string) => {
    if (!currentUser) {
      Alert.alert('Error', 'You must be signed in to vote.');
      return;
    }

    setCastingVote(voteId);
    try {
      const castVoteFn = functions().httpsCallable('castConscienceVote');
      await castVoteFn({voteId, option});
      // Refresh to show updated selection
      await loadVotes();
    } catch (error: any) {
      console.error('Error casting vote:', error);
      Alert.alert('Error', error.message || 'Failed to cast vote.');
    } finally {
      setCastingVote(null);
    }
  };

  const handleCloseVote = async (voteId: string, voteTitle: string) => {
    Alert.alert(
      'Close Vote',
      `Are you sure you want to close the vote "${voteTitle}"? Results will be revealed to all members.`,
      [
        {text: 'Cancel', style: 'cancel'},
        {
          text: 'Close Vote',
          style: 'destructive',
          onPress: async () => {
            try {
              const closeFn = functions().httpsCallable('closeConscienceVote');
              await closeFn({voteId});
              await loadVotes();
              Alert.alert(
                'Success',
                'Vote closed and results sent to members.',
              );
            } catch (error: any) {
              console.error('Error closing vote:', error);
              Alert.alert('Error', error.message || 'Failed to close vote.');
            }
          },
        },
      ],
    );
  };

  const formatDate = (timestamp: any): string => {
    try {
      const date =
        typeof timestamp?.toDate === 'function'
          ? timestamp.toDate()
          : new Date(timestamp);
      return format(date, 'MMM d, yyyy h:mm a');
    } catch {
      return 'Unknown date';
    }
  };

  const openVotes = votes.filter(v => v.status === 'open');
  const closedVotes = votes.filter(v => v.status === 'closed');

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#2196F3" />
      </View>
    );
  }

  const renderOpenVote = (vote: ConscienceVoteDocument) => {
    const myVote = currentUser ? vote.votes?.[currentUser.uid] : undefined;
    const isCasting = castingVote === vote.id;

    return (
      <View key={vote.id} style={styles.voteCard} testID={`vote-${vote.id}`}>
        <View style={styles.voteHeader}>
          <View style={styles.statusBadge}>
            <Text style={styles.statusBadgeText}>OPEN</Text>
          </View>
          <Text style={styles.voteDate}>{formatDate(vote.openedAt)}</Text>
        </View>

        <Text style={styles.voteTitle}>{vote.title}</Text>

        {vote.description ? (
          <Text style={styles.voteDescription}>{vote.description}</Text>
        ) : null}

        {vote.quorumRequired ? (
          <Text style={styles.quorumText}>
            Quorum required: {vote.quorumRequired} votes
          </Text>
        ) : null}

        <Text style={styles.optionsLabel}>Cast your vote:</Text>

        {vote.options.map(option => {
          const isSelected = myVote === option;
          return (
            <TouchableOpacity
              key={option}
              style={[
                styles.optionButton,
                isSelected && styles.optionButtonSelected,
              ]}
              onPress={() => handleCastVote(vote.id, option)}
              disabled={isCasting}
              testID={`option-${vote.id}-${option}`}>
              <View style={styles.optionContent}>
                <View
                  style={[
                    styles.radioCircle,
                    isSelected && styles.radioCircleSelected,
                  ]}>
                  {isSelected && <View style={styles.radioInner} />}
                </View>
                <Text
                  style={[
                    styles.optionText,
                    isSelected && styles.optionTextSelected,
                  ]}>
                  {option}
                </Text>
              </View>
              {isCasting && isSelected && (
                <ActivityIndicator size="small" color="#2196F3" />
              )}
            </TouchableOpacity>
          );
        })}

        {myVote && (
          <Text style={styles.myVoteText}>
            Your vote: <Text style={styles.myVoteOption}>{myVote}</Text> (tap
            another option to change)
          </Text>
        )}

        {/* Vote count is hidden while open */}
        <Text style={styles.hiddenCountText}>
          Results hidden until vote is closed
        </Text>

        {isAdmin && (
          <TouchableOpacity
            style={styles.closeVoteButton}
            onPress={() => handleCloseVote(vote.id, vote.title)}
            testID={`close-vote-${vote.id}`}>
            <Icon
              name="lock"
              size={14}
              color="#FF5722"
              style={{marginRight: 6}}
            />
            <Text style={styles.closeVoteButtonText}>
              Close & Reveal Results
            </Text>
          </TouchableOpacity>
        )}
      </View>
    );
  };

  const renderClosedVote = (vote: ConscienceVoteDocument) => {
    const result = vote.result;
    if (!result) {
      return null;
    }

    return (
      <View
        key={vote.id}
        style={[styles.voteCard, styles.voteCardClosed]}
        testID={`vote-closed-${vote.id}`}>
        <View style={styles.voteHeader}>
          <View style={[styles.statusBadge, styles.statusBadgeClosed]}>
            <Text style={styles.statusBadgeText}>CLOSED</Text>
          </View>
          {vote.closedAt && (
            <Text style={styles.voteDate}>{formatDate(vote.closedAt)}</Text>
          )}
        </View>

        <Text style={styles.voteTitle}>{vote.title}</Text>

        {result.winner ? (
          <View style={styles.winnerBanner}>
            <Icon
              name="check-circle"
              size={18}
              color="#4CAF50"
              style={{marginRight: 6}}
            />
            <Text style={styles.winnerText}>
              Result: <Text style={styles.winnerOption}>{result.winner}</Text>
            </Text>
          </View>
        ) : (
          <View style={styles.tieBanner}>
            <Icon
              name="equal"
              size={18}
              color="#FF9800"
              style={{marginRight: 6}}
            />
            <Text style={styles.tieText}>No clear winner (tie)</Text>
          </View>
        )}

        {/* Vote counts */}
        {vote.options.map(option => {
          const count = result.counts[option] ?? 0;
          const total = result.totalVotes || 1;
          const pct = Math.round((count / total) * 100);
          const isWinner = result.winner === option;

          return (
            <View key={option} style={styles.resultRow}>
              <Text
                style={[
                  styles.resultOption,
                  isWinner && styles.resultOptionWinner,
                ]}>
                {option}
              </Text>
              <View style={styles.resultBarContainer}>
                <View
                  style={[
                    styles.resultBar,
                    {width: `${pct}%`},
                    isWinner && styles.resultBarWinner,
                  ]}
                />
              </View>
              <Text style={styles.resultCount}>
                {count} ({pct}%)
              </Text>
            </View>
          );
        })}

        <View style={styles.resultFooter}>
          <Text style={styles.resultFooterText}>
            {result.totalVotes} of {result.totalEligible} members voted
            {result.quorumMet ? '' : ' — quorum not met'}
          </Text>
        </View>
      </View>
    );
  };

  return (
    <ScrollView
      style={styles.container}
      refreshControl={
        <RefreshControl refreshing={refreshing} onRefresh={loadVotes} />
      }
      testID="group-conscience-screen">
      {/* Header */}
      <View style={styles.pageHeader}>
        <Icon name="vote" size={28} color="#2196F3" />
        <Text style={styles.pageHeaderTitle}>Group Conscience</Text>
        <Text style={styles.pageHeaderSubtitle}>
          Democratic voting for group decisions
        </Text>
      </View>

      {/* Open Votes */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>
          Active Votes ({openVotes.length})
        </Text>
        {openVotes.length > 0 ? (
          <View testID="conscience-votes-list">
            {openVotes.map(renderOpenVote)}
          </View>
        ) : (
          <Text style={styles.emptyStateText} testID="conscience-votes-empty">
            No active votes at this time.
          </Text>
        )}
        {isAdmin && (
          <TouchableOpacity
            style={styles.newVoteButton}
            onPress={() =>
              navigation.navigate('CreateConscienceVote', {groupId, groupName})
            }
            testID="new-vote-button">
            <Icon
              name="plus"
              size={18}
              color="#FFFFFF"
              style={{marginRight: 6}}
            />
            <Text style={styles.newVoteButtonText}>Start New Vote</Text>
          </TouchableOpacity>
        )}
      </View>

      {/* Past Votes */}
      {closedVotes.length > 0 && (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>
            Past Votes ({closedVotes.length})
          </Text>
          {closedVotes.map(renderClosedVote)}
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
  headerButton: {
    marginRight: 12,
    padding: 4,
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
  voteCard: {
    backgroundColor: '#F9F9F9',
    borderRadius: 8,
    padding: 16,
    marginBottom: 12,
    borderLeftWidth: 4,
    borderLeftColor: '#2196F3',
  },
  voteCardClosed: {
    borderLeftColor: '#9E9E9E',
    backgroundColor: '#FAFAFA',
  },
  voteHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  statusBadge: {
    backgroundColor: '#2196F3',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 4,
  },
  statusBadgeClosed: {
    backgroundColor: '#9E9E9E',
  },
  statusBadgeText: {
    color: '#FFFFFF',
    fontSize: 11,
    fontWeight: '700',
  },
  voteDate: {
    fontSize: 12,
    color: '#9E9E9E',
  },
  voteTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#212121',
    marginBottom: 6,
  },
  voteDescription: {
    fontSize: 14,
    color: '#616161',
    marginBottom: 8,
    lineHeight: 20,
  },
  quorumText: {
    fontSize: 12,
    color: '#FF9800',
    marginBottom: 8,
  },
  optionsLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: '#424242',
    marginBottom: 8,
    marginTop: 4,
  },
  optionButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E0E0E0',
    borderRadius: 8,
    padding: 12,
    marginBottom: 8,
  },
  optionButtonSelected: {
    borderColor: '#2196F3',
    backgroundColor: '#E3F2FD',
  },
  optionContent: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  radioCircle: {
    width: 20,
    height: 20,
    borderRadius: 10,
    borderWidth: 2,
    borderColor: '#9E9E9E',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 10,
  },
  radioCircleSelected: {
    borderColor: '#2196F3',
  },
  radioInner: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: '#2196F3',
  },
  optionText: {
    fontSize: 15,
    color: '#424242',
  },
  optionTextSelected: {
    color: '#1565C0',
    fontWeight: '600',
  },
  myVoteText: {
    fontSize: 12,
    color: '#757575',
    marginTop: 4,
    marginBottom: 8,
    fontStyle: 'italic',
  },
  myVoteOption: {
    fontWeight: '700',
    fontStyle: 'normal',
    color: '#2196F3',
  },
  hiddenCountText: {
    fontSize: 12,
    color: '#9E9E9E',
    textAlign: 'center',
    marginTop: 4,
    marginBottom: 8,
  },
  closeVoteButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#FFF3E0',
    borderWidth: 1,
    borderColor: '#FF5722',
    borderRadius: 6,
    paddingVertical: 8,
    paddingHorizontal: 12,
    marginTop: 8,
  },
  closeVoteButtonText: {
    color: '#FF5722',
    fontWeight: '600',
    fontSize: 13,
  },
  winnerBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#E8F5E9',
    borderRadius: 6,
    padding: 10,
    marginBottom: 12,
  },
  winnerText: {
    fontSize: 14,
    color: '#2E7D32',
    fontWeight: '600',
  },
  winnerOption: {
    color: '#1B5E20',
  },
  tieBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFF8E1',
    borderRadius: 6,
    padding: 10,
    marginBottom: 12,
  },
  tieText: {
    fontSize: 14,
    color: '#E65100',
    fontWeight: '600',
  },
  resultRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
  },
  resultOption: {
    fontSize: 14,
    color: '#424242',
    width: 70,
    flexShrink: 0,
  },
  resultOptionWinner: {
    fontWeight: '700',
    color: '#2E7D32',
  },
  resultBarContainer: {
    flex: 1,
    height: 12,
    backgroundColor: '#E0E0E0',
    borderRadius: 6,
    marginHorizontal: 8,
    overflow: 'hidden',
  },
  resultBar: {
    height: '100%',
    backgroundColor: '#BDBDBD',
    borderRadius: 6,
  },
  resultBarWinner: {
    backgroundColor: '#4CAF50',
  },
  resultCount: {
    fontSize: 13,
    color: '#757575',
    width: 60,
    textAlign: 'right',
  },
  resultFooter: {
    marginTop: 8,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: '#E0E0E0',
  },
  resultFooterText: {
    fontSize: 12,
    color: '#9E9E9E',
    textAlign: 'center',
  },
  newVoteButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#2196F3',
    borderRadius: 8,
    paddingVertical: 12,
    paddingHorizontal: 16,
    marginTop: 8,
  },
  newVoteButtonText: {
    color: '#FFFFFF',
    fontWeight: '600',
    fontSize: 14,
  },
});

export default GroupConscienceScreen;
