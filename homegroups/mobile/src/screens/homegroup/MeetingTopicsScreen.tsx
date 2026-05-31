// mobile/src/screens/homegroup/MeetingTopicsScreen.tsx
import React, {useEffect, useState} from 'react';
import {
  View,
  Text,
  StyleSheet,
  SafeAreaView,
  FlatList,
  TextInput,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
} from 'react-native';
import {RouteProp, useRoute, useNavigation} from '@react-navigation/native';
import {StackNavigationProp} from '@react-navigation/stack';
import {GroupStackParamList} from '../../types/navigation';
import firestore from '@react-native-firebase/firestore';
import functions from '@react-native-firebase/functions';
import {useAppSelector} from '../../store';
import {selectUserData} from '../../store/slices/authSlice';
import {selectMembersByGroupId} from '../../store/slices/membersSlice';
import {MeetingTopicDocument} from '../../types/schema';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';

type MeetingTopicsRouteProp = RouteProp<GroupStackParamList, 'MeetingTopics'>;
type MeetingTopicsNavProp = StackNavigationProp<GroupStackParamList>;

const FILTER_CHIPS = [
  {label: 'All', value: undefined},
  {label: 'Discussion', value: 'discussion'},
  {label: 'Step Study', value: 'step_study'},
  {label: 'Big Book', value: 'big_book_theme'},
  {label: 'Speaker', value: 'speaker_prompt'},
  {label: 'Seasonal', value: 'seasonal'},
];

const CategoryBadge: React.FC<{category: string}> = ({category}) => {
  const colorMap: Record<string, string> = {
    discussion: '#1565C0',
    step_study: '#6A1B9A',
    big_book_theme: '#2E7D32',
    speaker_prompt: '#E65100',
    seasonal: '#0277BD',
  };
  const labelMap: Record<string, string> = {
    discussion: 'Discussion',
    step_study: 'Step Study',
    big_book_theme: 'Big Book Theme',
    speaker_prompt: 'Speaker Prompt',
    seasonal: 'Seasonal',
  };
  return (
    <View
      style={[
        styles.badge,
        {backgroundColor: colorMap[category] || '#616161'},
      ]}>
      <Text style={styles.badgeText}>{labelMap[category] || category}</Text>
    </View>
  );
};

const MeetingTopicsScreen: React.FC = () => {
  const route = useRoute<MeetingTopicsRouteProp>();
  const navigation = useNavigation<MeetingTopicsNavProp>();
  const {groupId, groupName, returnToMeetingId} = route.params;

  const userData = useAppSelector(selectUserData);
  const members = useAppSelector(state => selectMembersByGroupId(state, groupId));
  const currentMember = members?.find(m => m.userId === userData?.uid);
  const isAdminOrSecretary =
    currentMember?.isAdmin ||
    currentMember?.roles?.includes('admin') ||
    currentMember?.roles?.includes('secretary');

  const [topics, setTopics] = useState<MeetingTopicDocument[]>([]);
  const [favoritedIds, setFavoritedIds] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [activeFilter, setActiveFilter] = useState<string | undefined>(undefined);

  useEffect(() => {
    loadTopics();
    loadGroupFavorites();
  }, [activeFilter]);

  const loadTopics = async () => {
    setLoading(true);
    try {
      let query: any = firestore()
        .collection('meeting_topics')
        .where('isApproved', '==', true)
        .orderBy('useCount', 'desc')
        .limit(50);

      if (activeFilter) {
        query = query.where('category', '==', activeFilter);
      }

      const snap = await query.get();
      const loadedTopics = snap.docs.map((doc: any) => ({
        ...doc.data(),
        id: doc.id,
      })) as MeetingTopicDocument[];
      setTopics(loadedTopics);
    } catch (err: any) {
      // If query fails (likely missing index), load all and filter client-side
      try {
        const snap = await firestore()
          .collection('meeting_topics')
          .where('isApproved', '==', true)
          .get();
        let loadedTopics = snap.docs.map((doc: any) => ({
          ...doc.data(),
          id: doc.id,
        })) as MeetingTopicDocument[];
        if (activeFilter) {
          loadedTopics = loadedTopics.filter(t => t.category === activeFilter);
        }
        loadedTopics.sort((a, b) => (b.useCount || 0) - (a.useCount || 0));
        setTopics(loadedTopics);
      } catch {
        setTopics([]);
      }
    } finally {
      setLoading(false);
    }
  };

  const loadGroupFavorites = async () => {
    try {
      const snap = await firestore()
        .collection('groups')
        .doc(groupId)
        .collection('topicFavorites')
        .get();
      const ids = new Set(snap.docs.map((doc: any) => doc.id));
      setFavoritedIds(ids);
    } catch {
      // silent
    }
  };

  const handleFavorite = async (topicId: string, remove: boolean) => {
    try {
      const fn = functions().httpsCallable('favoriteGroupTopic');
      await fn({groupId, topicId, remove});
      setFavoritedIds(prev => {
        const next = new Set(prev);
        if (remove) next.delete(topicId);
        else next.add(topicId);
        return next;
      });
    } catch (err: any) {
      Alert.alert('Error', err.message || 'Failed to update favorites.');
    }
  };

  const handleUseTopic = async (topic: MeetingTopicDocument) => {
    try {
      const fn = functions().httpsCallable('favoriteGroupTopic');
      await fn({groupId, topicId: topic.id, markUsed: true});
      setFavoritedIds(prev => new Set([...prev, topic.id]));

      if (returnToMeetingId) {
        // Navigate back to meeting checklist with topic pre-filled
        navigation.navigate('MeetingChecklist', {
          groupId,
          groupName,
          meetingId: returnToMeetingId,
        });
      } else {
        Alert.alert('Topic Selected', `"${topic.title}" has been marked as used.`);
      }
    } catch (err: any) {
      Alert.alert('Error', err.message || 'Failed to use topic.');
    }
  };

  const filteredTopics = topics.filter(topic => {
    if (!searchQuery) return true;
    const q = searchQuery.toLowerCase();
    return (
      topic.title.toLowerCase().includes(q) ||
      topic.description.toLowerCase().includes(q) ||
      topic.tags.some(t => t.toLowerCase().includes(q))
    );
  });

  const favoriteTopics = filteredTopics.filter(t => favoritedIds.has(t.id));
  const otherTopics = filteredTopics.filter(t => !favoritedIds.has(t.id));

  const renderTopic = (topic: MeetingTopicDocument) => (
    <View key={topic.id} style={styles.row}>
      <View style={styles.rowHeader}>
        <CategoryBadge category={topic.category} />
        {topic.category === 'step_study' && topic.stepNumber && (
          <View style={styles.stepBadge}>
            <Text style={styles.stepBadgeText}>Step {topic.stepNumber}</Text>
          </View>
        )}
      </View>
      <Text style={styles.rowTitle}>{topic.title}</Text>
      <Text style={styles.rowDesc} numberOfLines={2}>{topic.description}</Text>
      <View style={styles.rowFooter}>
        <View style={styles.tagsRow}>
          {topic.tags.slice(0, 3).map(tag => (
            <View key={tag} style={styles.tag}>
              <Text style={styles.tagText}>{tag}</Text>
            </View>
          ))}
        </View>
        <View style={styles.rowActions}>
          {isAdminOrSecretary && (
            <TouchableOpacity
              style={styles.iconButton}
              onPress={() =>
                handleFavorite(topic.id, favoritedIds.has(topic.id))
              }>
              <Icon
                name={
                  favoritedIds.has(topic.id) ? 'star' : 'star-outline'
                }
                size={20}
                color={favoritedIds.has(topic.id) ? '#F9A825' : '#9E9E9E'}
              />
            </TouchableOpacity>
          )}
          <TouchableOpacity
            style={styles.useButton}
            onPress={() => handleUseTopic(topic)}>
            <Text style={styles.useButtonText}>Use This Topic</Text>
          </TouchableOpacity>
        </View>
      </View>
    </View>
  );

  const sections = [
    ...(favoriteTopics.length > 0
      ? [{key: 'favorites-header', type: 'header', title: 'Group Favorites'}]
      : []),
    ...favoriteTopics.map(t => ({key: t.id, type: 'topic', topic: t})),
    ...(otherTopics.length > 0
      ? [{key: 'all-header', type: 'header', title: 'All Topics'}]
      : []),
    ...otherTopics.map(t => ({key: t.id, type: 'topic', topic: t})),
  ];

  return (
    <SafeAreaView style={styles.container}>
      {/* Search */}
      <View style={styles.searchContainer}>
        <Icon name="magnify" size={18} color="#9E9E9E" />
        <TextInput
          style={styles.searchInput}
          value={searchQuery}
          onChangeText={setSearchQuery}
          placeholder="Search topics..."
          placeholderTextColor="#BDBDBD"
        />
        {searchQuery.length > 0 && (
          <TouchableOpacity onPress={() => setSearchQuery('')}>
            <Icon name="close-circle" size={18} color="#9E9E9E" />
          </TouchableOpacity>
        )}
      </View>

      {/* Filter chips */}
      <View style={styles.filterRow}>
        {FILTER_CHIPS.map(chip => (
          <TouchableOpacity
            key={chip.label}
            style={[
              styles.filterChip,
              activeFilter === chip.value && styles.filterChipActive,
            ]}
            onPress={() => setActiveFilter(chip.value)}>
            <Text
              style={[
                styles.filterChipText,
                activeFilter === chip.value && styles.filterChipTextActive,
              ]}>
              {chip.label}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {loading ? (
        <ActivityIndicator size="large" color="#7B1FA2" style={{marginTop: 40}} />
      ) : (
        <FlatList
          data={sections}
          keyExtractor={item => item.key}
          renderItem={({item}) => {
            if (item.type === 'header') {
              return (
                <Text style={styles.sectionHeader}>{(item as any).title}</Text>
              );
            }
            if (item.type === 'topic' && (item as any).topic) {
              return renderTopic((item as any).topic);
            }
            return null;
          }}
          contentContainerStyle={styles.listContent}
          ListEmptyComponent={
            <View style={styles.emptyState}>
              <Icon name="lightbulb-outline" size={48} color="#CE93D8" />
              <Text style={styles.emptyTitle}>No Topics Found</Text>
              <Text style={styles.emptyBody}>
                {searchQuery
                  ? 'Try a different search term.'
                  : 'The topic library is being built. Suggest a topic using the button below.'}
              </Text>
            </View>
          }
          ListFooterComponent={
            <TouchableOpacity
              style={styles.suggestButton}
              onPress={() =>
                Alert.alert(
                  'Suggest a Topic',
                  'Feature coming soon — you will be able to contribute meeting topic ideas.',
                )
              }>
              <Icon name="plus" size={18} color="#fff" />
              <Text style={styles.suggestButtonText}>Suggest a Topic</Text>
            </TouchableOpacity>
          }
        />
      )}
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {flex: 1, backgroundColor: '#F5F5F5'},
  searchContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fff',
    margin: 12,
    marginBottom: 6,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 8,
    shadowColor: '#000',
    shadowOffset: {width: 0, height: 1},
    shadowOpacity: 0.06,
    shadowRadius: 2,
    elevation: 2,
  },
  searchInput: {flex: 1, fontSize: 15, color: '#212121', marginLeft: 8, marginRight: 8},
  filterRow: {
    flexDirection: 'row',
    paddingHorizontal: 12,
    paddingBottom: 8,
    gap: 6,
  },
  filterChip: {
    borderRadius: 16,
    paddingHorizontal: 10,
    paddingVertical: 5,
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#E0E0E0',
  },
  filterChipActive: {backgroundColor: '#7B1FA2', borderColor: '#7B1FA2'},
  filterChipText: {fontSize: 12, color: '#616161'},
  filterChipTextActive: {color: '#fff', fontWeight: '600'},
  sectionHeader: {
    fontSize: 13,
    fontWeight: '700',
    color: '#9E9E9E',
    textTransform: 'uppercase',
    letterSpacing: 0.8,
    marginBottom: 8,
    marginTop: 4,
    paddingHorizontal: 4,
  },
  listContent: {padding: 12, paddingBottom: 40},
  row: {
    backgroundColor: '#fff',
    borderRadius: 10,
    padding: 14,
    marginBottom: 10,
    shadowColor: '#000',
    shadowOffset: {width: 0, height: 1},
    shadowOpacity: 0.06,
    shadowRadius: 2,
    elevation: 1,
  },
  rowHeader: {flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 6},
  badge: {borderRadius: 4, paddingHorizontal: 7, paddingVertical: 2},
  badgeText: {fontSize: 11, color: '#fff', fontWeight: '600'},
  stepBadge: {
    backgroundColor: '#EDE7F6',
    borderRadius: 4,
    paddingHorizontal: 7,
    paddingVertical: 2,
  },
  stepBadgeText: {fontSize: 11, color: '#7B1FA2', fontWeight: '600'},
  rowTitle: {fontSize: 15, fontWeight: '700', color: '#212121', marginBottom: 4},
  rowDesc: {fontSize: 13, color: '#616161', lineHeight: 18, marginBottom: 8},
  rowFooter: {flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between'},
  tagsRow: {flexDirection: 'row', flexWrap: 'wrap', gap: 4, flex: 1},
  tag: {
    backgroundColor: '#EDE7F6',
    borderRadius: 4,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  tagText: {fontSize: 11, color: '#7B1FA2'},
  rowActions: {flexDirection: 'row', alignItems: 'center', gap: 8},
  iconButton: {padding: 4},
  useButton: {
    backgroundColor: '#7B1FA2',
    borderRadius: 6,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  useButtonText: {fontSize: 12, color: '#fff', fontWeight: '600'},
  suggestButton: {
    backgroundColor: '#7B1FA2',
    borderRadius: 10,
    padding: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    margin: 12,
  },
  suggestButtonText: {color: '#fff', fontSize: 15, fontWeight: '700'},
  emptyState: {alignItems: 'center', padding: 40},
  emptyTitle: {fontSize: 18, fontWeight: '600', color: '#616161', marginTop: 16, marginBottom: 8},
  emptyBody: {fontSize: 14, color: '#9E9E9E', textAlign: 'center', lineHeight: 20},
});

export default MeetingTopicsScreen;
