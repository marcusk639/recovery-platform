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
  TextInput,
} from 'react-native';
import {RouteProp, useRoute, useNavigation} from '@react-navigation/native';
import {StackNavigationProp} from '@react-navigation/stack';
import auth from '@react-native-firebase/auth';
import functions from '@react-native-firebase/functions';
import firestore from '@react-native-firebase/firestore';
import {GroupStackParamList} from '../../types/navigation';
import {ElectionDocument, ElectionNominee} from '../../types/schema';
import {useAppSelector} from '../../store';
import {selectGroupById} from '../../store/slices/groupsSlice';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import {format} from 'date-fns';

type ElectionDetailRouteProp = RouteProp<GroupStackParamList, 'ElectionDetail'>;
type ElectionDetailNavigationProp = StackNavigationProp<GroupStackParamList>;

const ElectionDetailScreen: React.FC = () => {
  const route = useRoute<ElectionDetailRouteProp>();
  const navigation = useNavigation<ElectionDetailNavigationProp>();
  const {groupId, groupName, electionId} = route.params;
  const currentUser = auth().currentUser;

  const group = useAppSelector(state => selectGroupById(state, groupId));
  const isAdmin = group?.admins?.includes(currentUser?.uid || '') ?? false;

  const [election, setElection] = useState<ElectionDocument | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [nomineeStatement, setNomineeStatement] = useState('');

  const loadData = useCallback(async () => {
    setRefreshing(true);
    try {
      const doc = await firestore()
        .collection('group_elections')
        .doc(electionId)
        .get();

      if (doc.exists) {
        setElection({
          id: doc.id,
          ...(doc.data() as Omit<ElectionDocument, 'id'>),
        });
      }
    } catch (error) {
      console.error('Error loading election:', error);
      Alert.alert('Error', 'Failed to load election details.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [electionId]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  useEffect(() => {
    if (election) {
      navigation.setOptions({
        title: `Election: ${election.positionName}`,
        headerRight: () => {
          const status = election.status;
          const color =
            status === 'nominations_open'
              ? '#2196F3'
              : status === 'voting_open'
              ? '#4CAF50'
              : '#9E9E9E';
          const label =
            status === 'nominations_open'
              ? 'NOMINATIONS'
              : status === 'voting_open'
              ? 'VOTING'
              : 'CLOSED';
          return (
            <View style={[styles.headerBadge, {backgroundColor: color}]}>
              <Text style={styles.headerBadgeText}>{label}</Text>
            </View>
          );
        },
      });
    }
  }, [navigation, election]);

  const handleNominateSelf = async () => {
    if (!currentUser) return;
    setSubmitting(true);
    try {
      const nominateFn = functions().httpsCallable('nominateForElection');
      await nominateFn({
        electionId,
        nomineeUserId: currentUser.uid,
        nomineeStatement: nomineeStatement.trim() || undefined,
      });
      Alert.alert('Success', 'You have been nominated.');
      await loadData();
      setNomineeStatement('');
    } catch (error: any) {
      Alert.alert('Error', error.message || 'Failed to nominate.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleCastVote = async (nomineeUserId: string) => {
    setSubmitting(true);
    try {
      const voteFn = functions().httpsCallable('castElectionVote');
      await voteFn({electionId, nomineeUserId});
      await loadData();
    } catch (error: any) {
      Alert.alert('Error', error.message || 'Failed to cast vote.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleCloseElection = (assignWinner: boolean) => {
    Alert.alert(
      'Close Election',
      assignWinner
        ? 'Close election and auto-assign the winner to the service position?'
        : 'Close election and reveal results?',
      [
        {text: 'Cancel', style: 'cancel'},
        {
          text: 'Close Election',
          style: 'destructive',
          onPress: async () => {
            setSubmitting(true);
            try {
              const closeFn = functions().httpsCallable('closeElection');
              await closeFn({electionId, assignWinner});
              await loadData();
            } catch (error: any) {
              Alert.alert(
                'Error',
                error.message || 'Failed to close election.',
              );
            } finally {
              setSubmitting(false);
            }
          },
        },
      ],
    );
  };

  const handleTransitionToVoting = async () => {
    Alert.alert('Open Voting', 'Close nominations and open voting?', [
      {text: 'Cancel', style: 'cancel'},
      {
        text: 'Open Voting',
        onPress: async () => {
          setSubmitting(true);
          try {
            const openVotingFn =
              functions().httpsCallable('openElectionVoting');
            await openVotingFn({electionId, groupId});
            await loadData();
          } catch (error: any) {
            Alert.alert('Error', error.message || 'Failed to open voting.');
          } finally {
            setSubmitting(false);
          }
        },
      },
    ]);
  };

  const handleAssignWinner = async () => {
    if (!election?.result?.winnerId) return;
    setSubmitting(true);
    try {
      const batch = firestore().batch();

      const positionRef = firestore()
        .collection('groups')
        .doc(groupId)
        .collection('servicePositions')
        .doc(election.positionId);
      batch.update(positionRef, {
        currentHolderId: election.result.winnerId,
        currentHolderName: election.result.winnerName,
        updatedAt: firestore.FieldValue.serverTimestamp(),
      });

      const electionRef = firestore()
        .collection('group_elections')
        .doc(electionId);
      batch.update(electionRef, {
        winnerAssigned: true,
        updatedAt: firestore.FieldValue.serverTimestamp(),
      });

      await batch.commit();

      Alert.alert(
        'Success',
        `${election.result.winnerName} has been assigned to ${election.positionName}.`,
      );
      await loadData();
    } catch (error: any) {
      Alert.alert('Error', error.message || 'Failed to assign winner.');
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#2196F3" />
      </View>
    );
  }

  if (!election) {
    return (
      <View style={styles.loadingContainer}>
        <Text style={styles.errorText}>Election not found.</Text>
      </View>
    );
  }

  const nonWithdrawnNominees = (election.nominees || []).filter(
    n => !n.withdrawn,
  );
  const myVote = currentUser
    ? (election.votes || {})[currentUser.uid]
    : undefined;
  const iAmNominated = nonWithdrawnNominees.some(
    n => n.userId === currentUser?.uid,
  );

  return (
    <ScrollView
      style={styles.container}
      refreshControl={
        <RefreshControl refreshing={refreshing} onRefresh={loadData} />
      }
      testID="election-detail-screen">
      {/* NOMINATIONS OPEN */}
      {election.status === 'nominations_open' && (
        <>
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>
              Nominees ({nonWithdrawnNominees.length})
            </Text>
            {nonWithdrawnNominees.length === 0 ? (
              <Text style={styles.emptyText}>No nominees yet.</Text>
            ) : (
              nonWithdrawnNominees.map(nominee => (
                <View key={nominee.userId} style={styles.nomineeRow}>
                  <View style={styles.nomineeIcon}>
                    <Icon name="account-circle" size={32} color="#757575" />
                  </View>
                  <View style={styles.nomineeInfo}>
                    <Text style={styles.nomineeName}>
                      {nominee.displayName}
                    </Text>
                    {nominee.nominatedBy !== nominee.userId && (
                      <Text style={styles.nomineeBy}>Nominated by someone</Text>
                    )}
                    {nominee.nomineeStatement ? (
                      <Text style={styles.nomineeStatement}>
                        "{nominee.nomineeStatement}"
                      </Text>
                    ) : null}
                  </View>
                </View>
              ))
            )}

            {!iAmNominated && (
              <>
                <TextInput
                  style={styles.statementInput}
                  placeholder="Optional: statement of candidacy..."
                  placeholderTextColor="#9E9E9E"
                  value={nomineeStatement}
                  onChangeText={setNomineeStatement}
                  multiline
                />
                <TouchableOpacity
                  style={styles.nominateButton}
                  onPress={handleNominateSelf}
                  disabled={submitting}
                  testID="nominate-self-button">
                  {submitting ? (
                    <ActivityIndicator size="small" color="#FFFFFF" />
                  ) : (
                    <Text style={styles.nominateButtonText}>
                      Nominate Myself
                    </Text>
                  )}
                </TouchableOpacity>
              </>
            )}
          </View>

          {isAdmin && (
            <View style={styles.adminSection}>
              <Text style={styles.adminSectionTitle}>Admin Actions</Text>
              <TouchableOpacity
                style={styles.adminButton}
                onPress={handleTransitionToVoting}
                disabled={submitting}>
                <Text style={styles.adminButtonText}>
                  Close Nominations &amp; Open Voting
                </Text>
              </TouchableOpacity>
            </View>
          )}
        </>
      )}

      {/* VOTING OPEN */}
      {election.status === 'voting_open' && (
        <>
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Cast Your Vote</Text>
            {nonWithdrawnNominees.map(nominee => {
              const isSelected = myVote === nominee.userId;
              return (
                <TouchableOpacity
                  key={nominee.userId}
                  style={[
                    styles.voteOption,
                    isSelected && styles.voteOptionSelected,
                  ]}
                  onPress={() => handleCastVote(nominee.userId)}
                  disabled={submitting}
                  testID={`vote-option-${nominee.userId}`}>
                  <View style={styles.voteOptionContent}>
                    <View
                      style={[
                        styles.radioCircle,
                        isSelected && styles.radioCircleSelected,
                      ]}>
                      {isSelected && <View style={styles.radioInner} />}
                    </View>
                    <View>
                      <Text
                        style={[
                          styles.voteNomineeName,
                          isSelected && styles.voteNomineeNameSelected,
                        ]}>
                        {nominee.displayName}
                      </Text>
                      {nominee.nomineeStatement ? (
                        <Text
                          style={styles.voteNomineeStatement}
                          numberOfLines={2}>
                          "{nominee.nomineeStatement}"
                        </Text>
                      ) : null}
                    </View>
                  </View>
                </TouchableOpacity>
              );
            })}
            {myVote && (
              <Text style={styles.votedHint}>
                You voted — tap another to change
              </Text>
            )}
          </View>

          {isAdmin && (
            <View style={styles.adminSection}>
              <Text style={styles.adminSectionTitle}>Admin Actions</Text>
              <TouchableOpacity
                style={styles.adminButton}
                onPress={() => handleCloseElection(false)}
                disabled={submitting}>
                <Text style={styles.adminButtonText}>
                  Close Election &amp; Reveal Results
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.adminButton, styles.adminButtonGreen]}
                onPress={() => handleCloseElection(true)}
                disabled={submitting}>
                <Text style={styles.adminButtonText}>
                  Close &amp; Auto-Assign Winner
                </Text>
              </TouchableOpacity>
            </View>
          )}
        </>
      )}

      {/* CLOSED */}
      {election.status === 'closed' && election.result && (
        <>
          {/* Winner / Tie banner */}
          {election.result.tied ? (
            <View style={styles.tieBanner}>
              <Icon
                name="equal"
                size={20}
                color="#E65100"
                style={{marginRight: 8}}
              />
              <Text style={styles.tieBannerText}>
                Election tied — admin will determine next steps
              </Text>
            </View>
          ) : (
            <View style={styles.winnerBanner}>
              <Icon
                name="check-circle"
                size={20}
                color="#4CAF50"
                style={{marginRight: 8}}
              />
              <Text style={styles.winnerBannerText}>
                {election.result.winnerName} elected as {election.positionName}
              </Text>
            </View>
          )}

          {/* Vote counts */}
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Results</Text>
            {nonWithdrawnNominees.map(nominee => {
              const count =
                (election.result?.counts || {})[nominee.userId] ?? 0;
              const total = election.result?.totalVotes || 1;
              const pct = Math.round((count / total) * 100);
              const isWinner = election.result?.winnerId === nominee.userId;
              return (
                <View key={nominee.userId} style={styles.resultRow}>
                  <Text
                    style={[
                      styles.resultName,
                      isWinner && styles.resultNameWinner,
                    ]}>
                    {nominee.displayName}
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
            <Text style={styles.resultFooter}>
              {election.result.totalVotes} of {election.result.totalEligible}{' '}
              members voted
            </Text>
          </View>

          {/* Admin: Assign Winner */}
          {isAdmin && !election.result.tied && !election.winnerAssigned && (
            <View style={styles.adminSection}>
              <TouchableOpacity
                style={[styles.adminButton, styles.adminButtonGreen]}
                onPress={handleAssignWinner}
                disabled={submitting}>
                <Text style={styles.adminButtonText}>
                  Assign Winner to Position
                </Text>
              </TouchableOpacity>
            </View>
          )}
          {election.winnerAssigned && (
            <View style={styles.assignedBanner}>
              <Icon
                name="check"
                size={16}
                color="#4CAF50"
                style={{marginRight: 6}}
              />
              <Text style={styles.assignedBannerText}>
                Winner assigned to position
              </Text>
            </View>
          )}
        </>
      )}

      <View style={{height: 32}} />
    </ScrollView>
  );
};

const styles = StyleSheet.create({
  container: {flex: 1, backgroundColor: '#F5F5F5'},
  loadingContainer: {flex: 1, justifyContent: 'center', alignItems: 'center'},
  errorText: {color: '#9E9E9E', fontSize: 16},
  headerBadge: {
    marginRight: 12,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 4,
  },
  headerBadgeText: {color: '#FFF', fontSize: 11, fontWeight: '700'},
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
    color: '#9E9E9E',
    fontStyle: 'italic',
    textAlign: 'center',
    padding: 12,
  },
  nomineeRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    paddingVertical: 10,
    borderTopWidth: 1,
    borderTopColor: '#F0F0F0',
  },
  nomineeIcon: {marginRight: 12},
  nomineeInfo: {flex: 1},
  nomineeName: {fontSize: 15, fontWeight: '600', color: '#212121'},
  nomineeBy: {fontSize: 12, color: '#9E9E9E', marginTop: 2},
  nomineeStatement: {
    fontSize: 13,
    color: '#616161',
    fontStyle: 'italic',
    marginTop: 4,
  },
  statementInput: {
    borderWidth: 1,
    borderColor: '#E0E0E0',
    borderRadius: 6,
    padding: 10,
    marginTop: 12,
    fontSize: 14,
    color: '#212121',
    minHeight: 60,
    backgroundColor: '#FAFAFA',
  },
  nominateButton: {
    backgroundColor: '#2196F3',
    borderRadius: 8,
    paddingVertical: 12,
    alignItems: 'center',
    marginTop: 10,
  },
  nominateButtonText: {color: '#FFF', fontWeight: '600', fontSize: 14},
  adminSection: {
    marginHorizontal: 12,
    marginBottom: 12,
  },
  adminSectionTitle: {
    fontSize: 13,
    color: '#757575',
    textTransform: 'uppercase',
    fontWeight: '600',
    marginBottom: 8,
    letterSpacing: 0.5,
  },
  adminButton: {
    backgroundColor: '#FF5722',
    borderRadius: 8,
    paddingVertical: 12,
    alignItems: 'center',
    marginBottom: 8,
  },
  adminButtonGreen: {backgroundColor: '#388E3C'},
  adminButtonText: {color: '#FFF', fontWeight: '600', fontSize: 14},
  voteOption: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#E0E0E0',
    borderRadius: 8,
    padding: 12,
    marginBottom: 8,
    backgroundColor: '#FFFFFF',
  },
  voteOptionSelected: {
    borderColor: '#2196F3',
    backgroundColor: '#E3F2FD',
  },
  voteOptionContent: {flexDirection: 'row', alignItems: 'center', flex: 1},
  radioCircle: {
    width: 20,
    height: 20,
    borderRadius: 10,
    borderWidth: 2,
    borderColor: '#9E9E9E',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  radioCircleSelected: {borderColor: '#2196F3'},
  radioInner: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: '#2196F3',
  },
  voteNomineeName: {fontSize: 15, color: '#424242'},
  voteNomineeNameSelected: {color: '#1565C0', fontWeight: '600'},
  voteNomineeStatement: {fontSize: 12, color: '#9E9E9E', fontStyle: 'italic'},
  votedHint: {
    fontSize: 12,
    color: '#757575',
    fontStyle: 'italic',
    textAlign: 'center',
    marginTop: 8,
  },
  winnerBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#E8F5E9',
    margin: 12,
    borderRadius: 8,
    padding: 14,
  },
  winnerBannerText: {
    flex: 1,
    fontSize: 15,
    color: '#2E7D32',
    fontWeight: '600',
  },
  tieBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFF3E0',
    margin: 12,
    borderRadius: 8,
    padding: 14,
  },
  tieBannerText: {flex: 1, fontSize: 15, color: '#E65100', fontWeight: '600'},
  resultRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
  },
  resultName: {fontSize: 14, color: '#424242', width: 100, flexShrink: 0},
  resultNameWinner: {fontWeight: '700', color: '#2E7D32'},
  resultBarContainer: {
    flex: 1,
    height: 12,
    backgroundColor: '#E0E0E0',
    borderRadius: 6,
    marginHorizontal: 8,
    overflow: 'hidden',
  },
  resultBar: {height: '100%', backgroundColor: '#BDBDBD', borderRadius: 6},
  resultBarWinner: {backgroundColor: '#4CAF50'},
  resultCount: {fontSize: 13, color: '#757575', width: 60, textAlign: 'right'},
  resultFooter: {
    fontSize: 12,
    color: '#9E9E9E',
    textAlign: 'center',
    marginTop: 8,
    borderTopWidth: 1,
    borderTopColor: '#F0F0F0',
    paddingTop: 8,
  },
  assignedBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#E8F5E9',
    marginHorizontal: 12,
    marginBottom: 12,
    borderRadius: 8,
    padding: 12,
    justifyContent: 'center',
  },
  assignedBannerText: {fontSize: 14, color: '#2E7D32', fontWeight: '600'},
});

export default ElectionDetailScreen;
