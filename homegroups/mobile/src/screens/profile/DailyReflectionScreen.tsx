// mobile/src/screens/profile/DailyReflectionScreen.tsx
import React, {useEffect, useState} from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
} from 'react-native';
import {SafeAreaView} from 'react-native-safe-area-context';
import {RouteProp, useRoute, useNavigation} from '@react-navigation/native';
import {StackNavigationProp} from '@react-navigation/stack';
import {ProfileStackParamList} from '../../types/navigation';
import {useAppDispatch, useAppSelector} from '../../store';
import {
  loadTodayReflection,
  loadGroupDailyThought,
  selectTodayReflection,
  selectGroupDailyThought,
  selectReflectionsStatus,
} from '../../store/slices/reflectionsSlice';
import {selectUserData} from '../../store/slices/authSlice';
import Icon from 'react-native-vector-icons/Ionicons';

type DailyReflectionRouteProp = RouteProp<ProfileStackParamList, 'DailyReflection'>;
type DailyReflectionNavProp = StackNavigationProp<ProfileStackParamList>;

const DailyReflectionScreen: React.FC = () => {
  const route = useRoute<DailyReflectionRouteProp>();
  const navigation = useNavigation<DailyReflectionNavProp>();
  const dispatch = useAppDispatch();

  const params = route.params;
  const date = params?.date;
  const dayOfYear = params?.dayOfYear;

  const reflection = useAppSelector(selectTodayReflection);
  const groupThought = useAppSelector(selectGroupDailyThought);
  const status = useAppSelector(selectReflectionsStatus);
  const userData = useAppSelector(selectUserData);

  const todayStr = new Date().toISOString().split('T')[0];
  const displayDate = date || todayStr;

  useEffect(() => {
    dispatch(loadTodayReflection({date, dayOfYear}));
  }, [dispatch, date, dayOfYear]);

  useEffect(() => {
    // Load group thought if user is in a group
    const primaryGroupId = userData?.homeGroups?.[0];
    if (primaryGroupId) {
      dispatch(loadGroupDailyThought({groupId: primaryGroupId, date: displayDate}));
    }
  }, [dispatch, userData, displayDate]);

  const formattedDate = (() => {
    try {
      const d = new Date(displayDate + 'T12:00:00');
      return d.toLocaleDateString('en-US', {
        weekday: 'long',
        month: 'long',
        day: 'numeric',
        year: 'numeric',
      });
    } catch {
      return displayDate;
    }
  })();

  const isLoading = status === 'loading';

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView contentContainerStyle={styles.scrollContent}>
        {/* Header card */}
        <View style={styles.headerCard}>
          <Icon name="sunny-outline" size={28} color="#F9A825" />
          <Text style={styles.headerTitle}>Today's Reflection</Text>
          <Text style={styles.headerDate}>{formattedDate}</Text>
        </View>

        {isLoading ? (
          <ActivityIndicator size="large" color="#F9A825" style={{marginTop: 40}} />
        ) : reflection ? (
          <>
            {/* Reflection card */}
            <View style={styles.card}>
              {reflection.theme ? (
                <View style={styles.themeBadge}>
                  <Text style={styles.themeBadgeText}>
                    {reflection.theme.charAt(0).toUpperCase() +
                      reflection.theme.slice(1)}
                  </Text>
                </View>
              ) : null}
              <Text style={styles.reflectionTitle}>{reflection.title}</Text>
              <Text style={styles.reflectionBody}>{reflection.body}</Text>
            </View>

            {/* Group Thought card */}
            {groupThought ? (
              <View style={styles.card}>
                <Text style={styles.sectionLabel}>From Your Group</Text>
                <Text style={styles.groupThoughtAuthor}>
                  {groupThought.authorName}
                </Text>
                <Text style={styles.groupThoughtContent}>
                  {groupThought.content}
                </Text>
              </View>
            ) : null}

            {/* Quick Actions */}
            <View style={styles.card}>
              <Text style={styles.sectionLabel}>Daily Practice</Text>
              <TouchableOpacity
                style={styles.actionRow}
                onPress={() => navigation.navigate('GratitudeJournal')}>
                <Icon name="heart-outline" size={20} color="#2196F3" />
                <Text style={styles.actionText}>Open Gratitude Journal</Text>
                <Icon name="chevron-forward" size={16} color="#9E9E9E" />
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.actionRow}
                onPress={() =>
                  Alert.alert(
                    'Check In',
                    'Go to your Profile to check in for today.',
                  )
                }>
                <Icon name="checkmark-circle-outline" size={20} color="#4CAF50" />
                <Text style={styles.actionText}>Check In Today</Text>
                <Icon name="chevron-forward" size={16} color="#9E9E9E" />
              </TouchableOpacity>
            </View>
          </>
        ) : (
          <View style={styles.emptyState}>
            <Icon name="book-outline" size={48} color="#9E9E9E" />
            <Text style={styles.emptyTitle}>No Reflection Today</Text>
            <Text style={styles.emptyBody}>
              The daily reflection library has not been seeded yet. Check back
              soon.
            </Text>
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {flex: 1, backgroundColor: '#FFF8E1'},
  scrollContent: {padding: 16, paddingBottom: 32},
  headerCard: {
    backgroundColor: '#F9A825',
    borderRadius: 12,
    padding: 20,
    alignItems: 'center',
    marginBottom: 16,
    shadowColor: '#F9A825',
    shadowOffset: {width: 0, height: 2},
    shadowOpacity: 0.3,
    shadowRadius: 4,
    elevation: 4,
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: '#fff',
    marginTop: 8,
  },
  headerDate: {
    fontSize: 14,
    color: 'rgba(255,255,255,0.85)',
    marginTop: 4,
  },
  card: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
    shadowColor: '#000',
    shadowOffset: {width: 0, height: 1},
    shadowOpacity: 0.08,
    shadowRadius: 3,
    elevation: 2,
  },
  themeBadge: {
    alignSelf: 'flex-start',
    backgroundColor: '#FFF3E0',
    borderRadius: 12,
    paddingHorizontal: 10,
    paddingVertical: 3,
    marginBottom: 10,
  },
  themeBadgeText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#E65100',
  },
  reflectionTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: '#212121',
    marginBottom: 12,
  },
  reflectionBody: {
    fontSize: 15,
    lineHeight: 24,
    color: '#424242',
  },
  sectionLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: '#9E9E9E',
    textTransform: 'uppercase',
    letterSpacing: 0.8,
    marginBottom: 12,
  },
  groupThoughtAuthor: {
    fontSize: 14,
    fontWeight: '600',
    color: '#7B1FA2',
    marginBottom: 6,
  },
  groupThoughtContent: {
    fontSize: 15,
    lineHeight: 22,
    color: '#424242',
  },
  actionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#F5F5F5',
  },
  actionText: {
    flex: 1,
    fontSize: 15,
    color: '#212121',
    marginLeft: 12,
  },
  emptyState: {
    alignItems: 'center',
    padding: 40,
  },
  emptyTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#616161',
    marginTop: 16,
    marginBottom: 8,
  },
  emptyBody: {
    fontSize: 14,
    color: '#9E9E9E',
    textAlign: 'center',
    lineHeight: 20,
  },
});

export default DailyReflectionScreen;
