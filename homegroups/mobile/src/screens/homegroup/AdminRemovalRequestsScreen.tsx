import React, {useEffect, useState} from 'react';
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  Alert,
  TextInput,
} from 'react-native';
import {StackNavigationProp} from '@react-navigation/stack';
import {RouteProp} from '@react-navigation/native';
import {GroupStackParamList} from '../../types/navigation';
import {useAppDispatch, useAppSelector} from '../../store';
import {RootState} from '../../store/types';
import {
  fetchAdminRemovalRequests,
  castVote,
  submitAdminResponse,
  selectRemovalRequestsByGroup,
  selectAdminRemovalStatus,
} from '../../store/slices/adminRemovalSlice';
import {AdminRemovalRequest} from '../../types/domain/admin-removal';
import auth from '@react-native-firebase/auth';

type Props = {
  navigation: StackNavigationProp<GroupStackParamList, 'AdminRemovalRequests'>;
  route: RouteProp<GroupStackParamList, 'AdminRemovalRequests'>;
};

const AdminRemovalRequestsScreen: React.FC<Props> = ({route}) => {
  const {groupId} = route.params;
  const dispatch = useAppDispatch();
  const currentUser = auth().currentUser;
  const requests = useAppSelector((state: RootState) =>
    selectRemovalRequestsByGroup(state, groupId),
  );
  const loadStatus = useAppSelector(selectAdminRemovalStatus);
  const [responseText, setResponseText] = useState('');
  const [respondingTo, setRespondingTo] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    dispatch(fetchAdminRemovalRequests(groupId));
  }, [dispatch, groupId]);

  const handleVote = (requestId: string, vote: 'yes' | 'no' | 'abstain') => {
    Alert.alert('Confirm Vote', `Vote "${vote}" on this removal request?`, [
      {text: 'Cancel', style: 'cancel'},
      {
        text: 'Confirm',
        onPress: () => {
          dispatch(castVote({requestId, vote})).then(() => {
            dispatch(fetchAdminRemovalRequests(groupId));
          });
        },
      },
    ]);
  };

  const handleSubmitResponse = async (requestId: string) => {
    if (!responseText.trim()) {
      Alert.alert('Error', 'Response cannot be empty.');
      return;
    }
    setSubmitting(true);
    try {
      await dispatch(
        submitAdminResponse({requestId, response: responseText.trim()}),
      ).unwrap();
      setRespondingTo(null);
      setResponseText('');
      dispatch(fetchAdminRemovalRequests(groupId));
    } catch (err: any) {
      Alert.alert('Error', err || 'Failed to submit response.');
    } finally {
      setSubmitting(false);
    }
  };

  const renderRequest = ({item}: {item: AdminRemovalRequest}) => {
    const isTarget = currentUser?.uid === item.targetAdminId;
    const canVote = !isTarget && item.status === 'pending';
    const threshold = Math.ceil((item.totalEligibleVoters * 2) / 3);
    const expiresDate = new Date(item.expiresAt).toLocaleDateString();

    return (
      <View style={styles.card}>
        <Text style={styles.cardTitle}>Remove {item.targetAdminName} as Admin</Text>
        <Text style={styles.reason}>Reason: {item.reason}</Text>
        <Text style={styles.meta}>
          Initiated by {item.initiatedByName} · Expires {expiresDate}
        </Text>
        <View style={styles.tallyRow}>
          <Text style={styles.tallyFor}>{item.votesFor} for</Text>
          <Text style={styles.tallyAgainst}>{item.votesAgainst} against</Text>
          <Text style={styles.tallyAbstain}>{item.votesAbstain} abstain</Text>
        </View>
        <Text style={styles.threshold}>
          Needs {threshold} yes votes of {item.totalEligibleVoters} eligible
        </Text>
        <Text
          style={[
            styles.status,
            item.status === 'approved'
              ? styles.approved
              : item.status === 'pending'
              ? styles.pending
              : styles.rejected,
          ]}>
          {item.status.toUpperCase()}
        </Text>
        {item.adminResponse && (
          <View style={styles.responseBox}>
            <Text style={styles.responseLabel}>
              {item.targetAdminName}'s response:
            </Text>
            <Text style={styles.responseText}>{item.adminResponse}</Text>
          </View>
        )}
        {canVote && (
          <View style={styles.voteRow}>
            <TouchableOpacity
              style={[styles.voteBtn, styles.voteBtnFor]}
              onPress={() => handleVote(item.id, 'yes')}>
              <Text style={styles.voteBtnText}>Vote Yes</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.voteBtn, styles.voteBtnAgainst]}
              onPress={() => handleVote(item.id, 'no')}>
              <Text style={styles.voteBtnText}>Vote No</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.voteBtn, styles.voteBtnAbstain]}
              onPress={() => handleVote(item.id, 'abstain')}>
              <Text style={styles.voteBtnText}>Abstain</Text>
            </TouchableOpacity>
          </View>
        )}
        {isTarget &&
          item.status === 'pending' &&
          !item.adminResponse &&
          (respondingTo === item.id ? (
            <View>
              <TextInput
                style={styles.responseInput}
                placeholder="Write your response to the group..."
                value={responseText}
                onChangeText={setResponseText}
                multiline
                maxLength={500}
              />
              <TouchableOpacity
                style={styles.submitBtn}
                onPress={() => handleSubmitResponse(item.id)}
                disabled={submitting}>
                <Text style={styles.submitBtnText}>
                  {submitting ? 'Submitting...' : 'Submit Response'}
                </Text>
              </TouchableOpacity>
            </View>
          ) : (
            <TouchableOpacity
              style={styles.respondBtn}
              onPress={() => setRespondingTo(item.id)}>
              <Text style={styles.respondBtnText}>Respond to Group</Text>
            </TouchableOpacity>
          ))}
      </View>
    );
  };

  if (loadStatus === 'loading' && requests.length === 0) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" />
      </View>
    );
  }

  return (
    <FlatList
      data={requests}
      keyExtractor={item => item.id}
      renderItem={renderRequest}
      contentContainerStyle={styles.list}
      ListEmptyComponent={
        <View style={styles.centered}>
          <Text style={styles.emptyText}>
            No removal requests for this group.
          </Text>
        </View>
      }
    />
  );
};

const styles = StyleSheet.create({
  list: {padding: 16, flexGrow: 1},
  centered: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 32,
  },
  emptyText: {color: '#666', textAlign: 'center'},
  card: {
    backgroundColor: '#fff',
    borderRadius: 8,
    padding: 16,
    marginBottom: 16,
    shadowColor: '#000',
    shadowOffset: {width: 0, height: 1},
    shadowOpacity: 0.1,
    shadowRadius: 2,
    elevation: 2,
  },
  cardTitle: {
    fontSize: 16,
    fontWeight: '700',
    marginBottom: 4,
    color: '#c0392b',
  },
  reason: {fontSize: 14, color: '#333', marginBottom: 4},
  meta: {fontSize: 12, color: '#888', marginBottom: 8},
  tallyRow: {flexDirection: 'row', gap: 12, marginBottom: 4},
  tallyFor: {color: '#27ae60', fontWeight: '600'},
  tallyAgainst: {color: '#e74c3c', fontWeight: '600'},
  tallyAbstain: {color: '#888', fontWeight: '600'},
  threshold: {fontSize: 12, color: '#555', marginBottom: 8},
  status: {fontWeight: '700', fontSize: 12, marginBottom: 8},
  approved: {color: '#27ae60'},
  rejected: {color: '#e74c3c'},
  pending: {color: '#f39c12'},
  responseBox: {
    backgroundColor: '#f8f8f8',
    borderRadius: 6,
    padding: 10,
    marginBottom: 8,
  },
  responseLabel: {fontSize: 12, fontWeight: '600', color: '#555', marginBottom: 4},
  responseText: {fontSize: 14, color: '#333'},
  voteRow: {flexDirection: 'row', gap: 8, marginTop: 8},
  voteBtn: {flex: 1, paddingVertical: 8, borderRadius: 6, alignItems: 'center'},
  voteBtnFor: {backgroundColor: '#27ae60'},
  voteBtnAgainst: {backgroundColor: '#e74c3c'},
  voteBtnAbstain: {backgroundColor: '#95a5a6'},
  voteBtnText: {color: '#fff', fontWeight: '600', fontSize: 13},
  responseInput: {
    borderWidth: 1,
    borderColor: '#ddd',
    borderRadius: 6,
    padding: 10,
    minHeight: 80,
    textAlignVertical: 'top',
    marginTop: 8,
    marginBottom: 8,
  },
  submitBtn: {
    backgroundColor: '#2980b9',
    borderRadius: 6,
    padding: 10,
    alignItems: 'center',
  },
  submitBtnText: {color: '#fff', fontWeight: '600'},
  respondBtn: {
    borderWidth: 1,
    borderColor: '#2980b9',
    borderRadius: 6,
    padding: 10,
    alignItems: 'center',
    marginTop: 8,
  },
  respondBtnText: {color: '#2980b9', fontWeight: '600'},
});

export default AdminRemovalRequestsScreen;
