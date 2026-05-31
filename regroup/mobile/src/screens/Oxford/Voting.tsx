import React, { useCallback, useState } from 'react';
import {
  View,
  FlatList,
  Alert,
  ActivityIndicator,
  RefreshControl,
  Switch,
  TextInput,
  TouchableOpacity,
} from 'react-native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { format, parseISO } from 'date-fns';
import { RootStackParamList } from '../../navigation/types';

import RatsScrollView from '../../components/rats-scroll-view';
import ScreenHeader from '../../components/screen-header';
import RatsButton from '../../components/rats-button/rats-button';
import { RatsText } from '../../components/rats-text';

import { useAppSelector } from '../../state/store';
import { useOxfordGate } from '../../hooks/useOxfordGate';
import { Vote, VoteType } from '../../entities/oxford/Vote';
import { calculateResult, VoteResult } from '../../services/oxford/votes';
import {
  useHouseVotes,
  useCreateHouseVote,
  useCastHouseVote,
} from '../../state/queries/oxfordQueries';
import { logException } from '../../util/logging';
import { color, normalize, fontSize, CARD_STYLE } from '../../styles/theme';

interface Props {
  navigation: NativeStackNavigationProp<RootStackParamList>;
}

const THRESHOLD = 0.8;

const RESULT_CONFIG: Record<VoteResult, { bg: string; label: string }> = {
  passed: { bg: color.green, label: 'PASSED' },
  failed: { bg: color.red, label: 'FAILED' },
  pending: { bg: color.grey, label: 'PENDING' },
};

const Voting: React.FC<Props> = ({ navigation }) => {
  const { allowed, houseId } = useOxfordGate();
  const user = useAppSelector(state => state.user.user);
  const userAsGuest = useAppSelector(state => state.guests.userAsGuest);

  const [showCreateForm, setShowCreateForm] = useState(false);
  const [topic, setTopic] = useState('');
  const [description, setDescription] = useState('');
  const [isAnonymous, setIsAnonymous] = useState(false);

  const {
    data: votes = [],
    isLoading,
    isFetching,
    refetch,
  } = useHouseVotes(houseId, allowed);

  const createMutation = useCreateHouseVote();
  const castMutation = useCastHouseVote();

  const handleCreate = async () => {
    if (!houseId) {
      return;
    }
    if (!topic.trim()) {
      Alert.alert('Validation', 'Please enter a topic.');
      return;
    }

    try {
      await createMutation.mutateAsync({
        houseId,
        vote: {
          houseId,
          topic: topic.trim(),
          description: description.trim(),
          type: 'general' as VoteType,
          options: ['yes', 'no', 'abstain'],
          results: {},
          individualVotes: {},
          threshold: THRESHOLD,
          isAnonymous,
          passed: false,
          createdAt: new Date().toISOString(),
        },
      });
      setTopic('');
      setDescription('');
      setIsAnonymous(false);
      setShowCreateForm(false);
    } catch (err) {
      logException(err);
      Alert.alert('Error', 'Failed to create vote. Please try again.');
    }
  };

  const handleCastVote = useCallback(
    async (vote: Vote, choice: 'yes' | 'no' | 'abstain') => {
      if (!houseId || !userAsGuest?.id) {
        Alert.alert('Error', 'You must be a resident to vote.');
        return;
      }
      if (vote.closedAt) {
        Alert.alert('Vote Closed', 'This vote has already been closed.');
        return;
      }

      try {
        await castMutation.mutateAsync({
          houseId,
          voteId: vote.id,
          guestId: userAsGuest.id,
          choice,
        });
      } catch (err) {
        logException(err);
        Alert.alert('Error', 'Failed to cast vote. Please try again.');
      }
    },
    [houseId, userAsGuest?.id, castMutation],
  );

  const getTally = (
    vote: Vote,
  ): { yes: number; no: number; abstain: number; total: number } => {
    const yes = vote.results['yes'] || 0;
    const no = vote.results['no'] || 0;
    const abstain = vote.results['abstain'] || 0;
    return { yes, no, abstain, total: yes + no + abstain };
  };

  const getYesPercent = (vote: Vote): number => {
    const { yes, total } = getTally(vote);
    if (total === 0) {
      return 0;
    }
    return Math.round((yes / total) * 100);
  };

  const getCurrentVoterChoice = (vote: Vote): string | undefined => {
    if (!userAsGuest?.id) {
      return undefined;
    }
    return vote.individualVotes[userAsGuest.id];
  };

  // Wrap in useCallback so FlatList cell memoization isn't invalidated on
  // every parent re-render — particularly important here because the parent
  // re-renders whenever useHouseVotes returns a new data array (on refetch).
  const renderVote = useCallback(
    ({ item }: { item: Vote }) => {
      const result = calculateResult(item, THRESHOLD);
      const resultConfig = RESULT_CONFIG[result];
      const tally = getTally(item);
      const yesPercent = getYesPercent(item);
      const currentChoice = getCurrentVoterChoice(item);
      const isClosed = !!item.closedAt;

      return (
        <View
          style={[
            CARD_STYLE,
            {
              marginBottom: normalize(12),
              backgroundColor: color.white,
              padding: normalize(14),
              borderLeftWidth: 4,
              borderLeftColor:
                result === 'passed'
                  ? color.green
                  : result === 'failed'
                    ? color.red
                    : color.baby_blue,
            },
          ]}>
          {/* Header */}
          <View
            style={{
              flexDirection: 'row',
              justifyContent: 'space-between',
              alignItems: 'flex-start',
            }}>
            <View style={{ flex: 1, marginRight: normalize(8) }}>
              <RatsText
                text={item.topic}
                style={{ fontSize: fontSize.medium, color: color.black }}
              />
              <RatsText
                text={item.type.replace('_', ' ')}
                style={{
                  fontSize: fontSize.small,
                  color: color.grey,
                  marginTop: normalize(2),
                }}
              />
            </View>
            <View
              style={{
                backgroundColor: resultConfig.bg,
                paddingHorizontal: normalize(10),
                paddingVertical: normalize(4),
                borderRadius: normalize(4),
              }}>
              <RatsText
                text={resultConfig.label}
                style={{ color: color.white, fontSize: fontSize.small }}
              />
            </View>
          </View>

          {/* Description */}
          {!!item.description && (
            <RatsText
              text={item.description}
              style={{
                color: color.dark_grey,
                fontSize: fontSize.regular,
                marginTop: normalize(8),
              }}
            />
          )}

          {/* Progress Bar */}
          <View style={{ marginTop: normalize(12) }}>
            <View
              style={{
                flexDirection: 'row',
                justifyContent: 'space-between',
                marginBottom: normalize(4),
              }}>
              <RatsText
                text={`Yes: ${yesPercent}% (need ${Math.round(
                  THRESHOLD * 100,
                )}%)`}
                style={{ fontSize: fontSize.small, color: color.dark_grey }}
              />
              <RatsText
                text={`${tally.total} votes`}
                style={{ fontSize: fontSize.small, color: color.dark_grey }}
              />
            </View>
            <View
              style={{
                height: normalize(8),
                backgroundColor: color.light_grey,
                borderRadius: normalize(4),
                overflow: 'hidden',
              }}>
              <View
                style={{
                  height: '100%',
                  width: `${yesPercent}%`,
                  backgroundColor:
                    yesPercent >= THRESHOLD * 100
                      ? color.green
                      : color.baby_blue,
                  borderRadius: normalize(4),
                }}
              />
            </View>
            <View style={{ flexDirection: 'row', marginTop: normalize(4) }}>
              <RatsText
                text={`Yes: ${tally.yes}  No: ${tally.no}  Abstain: ${tally.abstain}`}
                style={{ fontSize: fontSize.extraSmall, color: color.grey }}
              />
            </View>
          </View>

          {/* Threshold indicator */}
          <RatsText
            text={`Threshold: 80% yes votes required`}
            style={{
              fontSize: fontSize.extraSmall,
              color: color.grey,
              marginTop: normalize(2),
            }}
          />

          {/* Vote buttons */}
          {!isClosed && userAsGuest && (
            <View style={{ marginTop: normalize(12) }}>
              {!item.isAnonymous && currentChoice ? (
                <RatsText
                  translate={false}
                  text={`Your vote: ${currentChoice.toUpperCase()}`}
                  style={{
                    fontSize: fontSize.small,
                    color: color.dark_grey,
                    marginBottom: normalize(8),
                  }}
                />
              ) : (
                <RatsText
                  text="Cast your vote:"
                  style={{
                    fontSize: fontSize.small,
                    color: color.dark_grey,
                    marginBottom: normalize(8),
                  }}
                />
              )}
              <View
                style={{
                  flexDirection: 'row',
                  justifyContent: 'space-between',
                }}>
                {(['yes', 'no', 'abstain'] as const).map(choice => (
                  <TouchableOpacity
                    key={choice}
                    onPress={() => handleCastVote(item, choice)}
                    style={{
                      flex: 1,
                      marginHorizontal: normalize(4),
                      paddingVertical: normalize(8),
                      borderRadius: normalize(4),
                      alignItems: 'center',
                      backgroundColor:
                        currentChoice === choice
                          ? choice === 'yes'
                            ? color.green
                            : choice === 'no'
                              ? color.red
                              : color.grey
                          : color.light_grey,
                      borderWidth: 1,
                      borderColor:
                        choice === 'yes'
                          ? color.green
                          : choice === 'no'
                            ? color.red
                            : color.grey,
                    }}>
                    <RatsText
                      text={choice.toUpperCase()}
                      style={{
                        fontSize: fontSize.small,
                        color:
                          currentChoice === choice
                            ? color.white
                            : color.dark_grey,
                      }}
                    />
                  </TouchableOpacity>
                ))}
              </View>
            </View>
          )}

          {isClosed && (
            <RatsText
              text={`Closed: ${format(
                parseISO(item.closedAt!),
                'MMM d, yyyy',
              )}`}
              style={{
                color: color.grey,
                fontSize: fontSize.extraSmall,
                marginTop: normalize(8),
              }}
            />
          )}
        </View>
      );
    },
    [userAsGuest, handleCastVote],
  );

  if (!allowed) {
    return (
      <RatsScrollView>
        <ScreenHeader header="Oxford Voting" renderBackButton />
        <View style={{ padding: normalize(24), alignItems: 'center' }}>
          <RatsText
            text="Oxford House features are not enabled for this house."
            style={{ color: color.dark_grey, fontSize: fontSize.regular }}
            translate={false}
          />
        </View>
      </RatsScrollView>
    );
  }

  if (isLoading) {
    return (
      <RatsScrollView>
        <ScreenHeader header="Oxford Voting" renderBackButton />
        <ActivityIndicator
          color={color.baby_blue}
          style={{ marginTop: normalize(40) }}
        />
      </RatsScrollView>
    );
  }

  return (
    <RatsScrollView
      refreshControl={
        <RefreshControl
          refreshing={isFetching && !isLoading}
          onRefresh={refetch}
        />
      }>
      <ScreenHeader header="Oxford Voting" />
      <View style={{ padding: normalize(16) }}>
        {showCreateForm ? (
          <View
            style={[
              CARD_STYLE,
              {
                backgroundColor: color.white,
                padding: normalize(16),
                marginBottom: normalize(16),
              },
            ]}>
            <RatsText
              text="Create New Vote"
              style={{
                fontSize: fontSize.medium,
                color: color.black,
                marginBottom: normalize(12),
              }}
            />
            <RatsText
              text="Topic"
              style={{
                fontSize: fontSize.small,
                color: color.dark_grey,
                marginBottom: normalize(4),
              }}
            />
            <TextInput
              value={topic}
              onChangeText={setTopic}
              placeholder="e.g. Accept new applicant"
              placeholderTextColor={color.grey}
              style={{
                borderWidth: 1,
                borderColor: color.medium_grey,
                borderRadius: normalize(4),
                padding: normalize(10),
                fontSize: fontSize.regular,
                color: color.black,
                marginBottom: normalize(12),
              }}
            />
            <RatsText
              text="Description (optional)"
              style={{
                fontSize: fontSize.small,
                color: color.dark_grey,
                marginBottom: normalize(4),
              }}
            />
            <TextInput
              value={description}
              onChangeText={setDescription}
              placeholder="Additional details..."
              placeholderTextColor={color.grey}
              multiline
              numberOfLines={3}
              style={{
                borderWidth: 1,
                borderColor: color.medium_grey,
                borderRadius: normalize(4),
                padding: normalize(10),
                fontSize: fontSize.regular,
                color: color.black,
                marginBottom: normalize(16),
                textAlignVertical: 'top',
              }}
            />
            <View
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                marginBottom: normalize(12),
              }}>
              <Switch
                testID="anonymous-toggle"
                value={isAnonymous}
                onValueChange={setIsAnonymous}
                trackColor={{ false: color.light_grey, true: color.baby_blue }}
                ios_backgroundColor={color.light_grey}
                style={{ marginRight: normalize(8) }}
              />
              <RatsText
                translate={false}
                text="Anonymous voting"
                style={{ color: color.dark_grey, fontSize: fontSize.regular }}
              />
            </View>
            <RatsText
              text={`Requires 80% yes votes to pass`}
              style={{
                color: color.grey,
                fontSize: fontSize.small,
                marginBottom: normalize(12),
              }}
            />
            <RatsButton
              title={createMutation.isPending ? 'Creating...' : 'Open Vote'}
              disabled={createMutation.isPending}
              onPress={handleCreate}
              containerStyle={{ marginBottom: normalize(8) }}
            />
            <RatsButton
              title="Cancel"
              light
              onPress={() => setShowCreateForm(false)}
            />
          </View>
        ) : (
          <RatsButton
            title="Open New Vote"
            onPress={() => setShowCreateForm(true)}
            containerStyle={{ marginBottom: normalize(16) }}
          />
        )}

        <FlatList
          data={votes}
          keyExtractor={item => item.id}
          renderItem={renderVote}
          scrollEnabled={false}
          ListEmptyComponent={
            <View style={{ alignItems: 'center', marginTop: normalize(32) }}>
              <RatsText
                text="No votes open at this time."
                style={{ color: color.dark_grey, fontSize: fontSize.regular }}
              />
            </View>
          }
        />
      </View>
    </RatsScrollView>
  );
};

export default Voting;
