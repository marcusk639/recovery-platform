import React, {useEffect} from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  ActivityIndicator,
} from 'react-native';
import {useRoute, RouteProp, useNavigation} from '@react-navigation/native';
import {StackNavigationProp} from '@react-navigation/stack';
import {GroupStackParamList} from '../../types/navigation';
import {useAppDispatch, useAppSelector} from '../../store';
import {
  fetchServicePositionsForGroup,
  selectServicePositionById,
} from '../../store/slices/servicePositionsSlice';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';

type ScreenRouteProp = RouteProp<GroupStackParamList, 'PositionHistory'>;
type ScreenNavigationProp = StackNavigationProp<
  GroupStackParamList,
  'PositionHistory'
>;

const PositionHistoryScreen: React.FC = () => {
  const route = useRoute<ScreenRouteProp>();
  const navigation = useNavigation<ScreenNavigationProp>();
  const {groupId, groupName, positionId, positionName} = route.params;
  const dispatch = useAppDispatch();

  const position = useAppSelector(state =>
    selectServicePositionById(state, positionId),
  );

  useEffect(() => {
    dispatch(fetchServicePositionsForGroup(groupId));
    navigation.setOptions({title: `${positionName} - History`});
  }, [dispatch, groupId, navigation, positionName]);

  if (!position) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#2196F3" />
      </View>
    );
  }

  const formatDate = (date: Date | null | undefined) => {
    if (!date) return 'Not set';
    return date.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    });
  };

  const getDuration = () => {
    if (!position.termStartDate) return null;
    const end = position.termEndDate || new Date();
    const diffMs = end.getTime() - position.termStartDate.getTime();
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
    if (diffDays < 30) return `${diffDays} days`;
    const months = Math.round(diffDays / 30);
    return `${months} month${months !== 1 ? 's' : ''}`;
  };

  const isExpired =
    position.termEndDate && position.termEndDate < new Date();

  return (
    <ScrollView style={styles.container}>
      <View style={styles.card}>
        <Text style={styles.sectionTitle}>Current Term</Text>

        <View style={styles.row}>
          <Icon name="account-circle-outline" size={20} color="#757575" />
          <View style={styles.rowContent}>
            <Text style={styles.rowLabel}>Position Holder</Text>
            <Text style={styles.rowValue}>
              {position.currentHolderName || 'Open Position'}
            </Text>
          </View>
        </View>

        <View style={styles.row}>
          <Icon name="calendar-start" size={20} color="#757575" />
          <View style={styles.rowContent}>
            <Text style={styles.rowLabel}>Term Start</Text>
            <Text style={styles.rowValue}>
              {formatDate(position.termStartDate)}
            </Text>
          </View>
        </View>

        <View style={styles.row}>
          <Icon name="calendar-end" size={20} color="#757575" />
          <View style={styles.rowContent}>
            <Text style={styles.rowLabel}>Term End</Text>
            <Text
              style={[
                styles.rowValue,
                isExpired && styles.expiredText,
              ]}>
              {formatDate(position.termEndDate)}
              {isExpired ? ' (Expired)' : ''}
            </Text>
          </View>
        </View>

        {getDuration() && (
          <View style={styles.row}>
            <Icon name="timer-outline" size={20} color="#757575" />
            <View style={styles.rowContent}>
              <Text style={styles.rowLabel}>Duration</Text>
              <Text style={styles.rowValue}>{getDuration()}</Text>
            </View>
          </View>
        )}

        {position.commitmentLength ? (
          <View style={styles.row}>
            <Icon name="clock-outline" size={20} color="#757575" />
            <View style={styles.rowContent}>
              <Text style={styles.rowLabel}>Commitment Length</Text>
              <Text style={styles.rowValue}>
                {position.commitmentLength} month
                {position.commitmentLength !== 1 ? 's' : ''}
              </Text>
            </View>
          </View>
        ) : null}
      </View>

      {position.description ? (
        <View style={styles.card}>
          <Text style={styles.sectionTitle}>Description</Text>
          <Text style={styles.description}>{position.description}</Text>
        </View>
      ) : null}

      <View style={styles.card}>
        <Text style={styles.sectionTitle}>Reminder Status</Text>
        <View style={styles.reminderRow}>
          <Icon
            name={
              position.remindersSent?.thirtyDay
                ? 'check-circle'
                : 'circle-outline'
            }
            size={18}
            color={position.remindersSent?.thirtyDay ? '#4CAF50' : '#BDBDBD'}
          />
          <Text style={styles.reminderText}>30-day reminder</Text>
        </View>
        <View style={styles.reminderRow}>
          <Icon
            name={
              position.remindersSent?.sevenDay
                ? 'check-circle'
                : 'circle-outline'
            }
            size={18}
            color={position.remindersSent?.sevenDay ? '#4CAF50' : '#BDBDBD'}
          />
          <Text style={styles.reminderText}>7-day reminder</Text>
        </View>
        <View style={styles.reminderRow}>
          <Icon
            name={
              position.remindersSent?.oneDay
                ? 'check-circle'
                : 'circle-outline'
            }
            size={18}
            color={position.remindersSent?.oneDay ? '#4CAF50' : '#BDBDBD'}
          />
          <Text style={styles.reminderText}>1-day reminder</Text>
        </View>
      </View>
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
  card: {
    backgroundColor: '#FFFFFF',
    margin: 16,
    marginBottom: 0,
    borderRadius: 8,
    padding: 16,
    shadowColor: '#000',
    shadowOffset: {width: 0, height: 1},
    shadowOpacity: 0.1,
    shadowRadius: 2,
    elevation: 2,
  },
  sectionTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: '#757575',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 12,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginBottom: 12,
  },
  rowContent: {
    marginLeft: 10,
    flex: 1,
  },
  rowLabel: {
    fontSize: 12,
    color: '#9E9E9E',
    marginBottom: 2,
  },
  rowValue: {
    fontSize: 15,
    color: '#212121',
    fontWeight: '500',
  },
  expiredText: {
    color: '#F44336',
  },
  description: {
    fontSize: 15,
    color: '#424242',
    lineHeight: 22,
  },
  reminderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 10,
  },
  reminderText: {
    fontSize: 14,
    color: '#424242',
    marginLeft: 10,
  },
});

export default PositionHistoryScreen;
