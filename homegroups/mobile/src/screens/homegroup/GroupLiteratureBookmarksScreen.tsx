// mobile/src/screens/homegroup/GroupLiteratureBookmarksScreen.tsx
import React, {useEffect} from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  ActivityIndicator,
} from 'react-native';
import {SafeAreaView} from 'react-native-safe-area-context';
import {RouteProp, useRoute, useNavigation} from '@react-navigation/native';
import {StackNavigationProp} from '@react-navigation/stack';
import {GroupStackParamList, ProfileStackParamList} from '../../types/navigation';
import {useAppDispatch, useAppSelector} from '../../store';
import {
  loadGroupBookmarks,
  selectGroupBookmarks,
  selectLiteratureById,
  selectLiteratureStatus,
} from '../../store/slices/literatureSlice';
import {GroupLiteratureBookmarkDocument, LiteratureIndexDocument} from '../../types/schema';
import Icon from 'react-native-vector-icons/Ionicons';
import {RootState} from '../../store/types';
import {useAppSelector as useSelector} from '../../store';

type GroupLiteratureBookmarksRouteProp = RouteProp<
  GroupStackParamList,
  'GroupLiteratureBookmarks'
>;
type GroupLiteratureNavProp = StackNavigationProp<GroupStackParamList>;

// Each row is a real component so the useSelector hook is called inside React's
// render tree. Calling the hook directly inside FlatList's renderItem callback
// violated the Rules of Hooks (hook count varied with list length -> crash).
const BookmarkRow: React.FC<{item: GroupLiteratureBookmarkDocument}> = ({
  item,
}) => {
  const literatureItem = useSelector((state: RootState) =>
    selectLiteratureById(state, item.literatureId),
  );

  return (
    <View style={styles.row}>
      <View style={styles.rowContent}>
        <Text style={styles.rowTitle}>
          {literatureItem?.title || item.literatureId}
        </Text>
        {literatureItem?.summary && (
          <Text style={styles.rowSummary} numberOfLines={2}>
            {literatureItem.summary}
          </Text>
        )}
        {item.note && <Text style={styles.rowNote}>Note: {item.note}</Text>}
        <Text style={styles.rowMeta}>Added by {item.addedByName}</Text>
      </View>
      <Icon name="chevron-forward" size={18} color="#9E9E9E" />
    </View>
  );
};

const GroupLiteratureBookmarksScreen: React.FC = () => {
  const route = useRoute<GroupLiteratureBookmarksRouteProp>();
  const navigation = useNavigation<GroupLiteratureNavProp>();
  const dispatch = useAppDispatch();
  const {groupId, groupName} = route.params;

  const bookmarks = useAppSelector(state =>
    selectGroupBookmarks(state, groupId),
  );
  const status = useAppSelector(selectLiteratureStatus);

  useEffect(() => {
    dispatch(loadGroupBookmarks(groupId));
  }, [dispatch, groupId]);

  const renderItem = ({item}: {item: GroupLiteratureBookmarkDocument}) => (
    <BookmarkRow item={item} />
  );

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>{groupName}</Text>
        <Text style={styles.headerSubtitle}>Group Literature Library</Text>
      </View>

      {status === 'loading' ? (
        <ActivityIndicator size="large" color="#7B1FA2" style={{marginTop: 40}} />
      ) : (
        <FlatList
          data={bookmarks}
          keyExtractor={item => item.literatureId}
          renderItem={renderItem}
          contentContainerStyle={styles.listContent}
          ListEmptyComponent={
            <View style={styles.emptyState}>
              <Icon name="library-outline" size={48} color="#CE93D8" />
              <Text style={styles.emptyTitle}>No Bookmarks Yet</Text>
              <Text style={styles.emptyBody}>
                Group admins can bookmark resources from the Literature Index to
                share with the group.
              </Text>
            </View>
          }
          ListFooterComponent={
            <TouchableOpacity
              style={styles.browseButton}
              onPress={() => {
                // Navigate to ProfileStack LiteratureIndex would require cross-navigator nav
                // For now, show a helpful message
              }}>
              <Icon name="search-outline" size={18} color="#7B1FA2" />
              <Text style={styles.browseButtonText}>
                Browse Literature to Add
              </Text>
            </TouchableOpacity>
          }
        />
      )}
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {flex: 1, backgroundColor: '#F5F5F5'},
  header: {
    backgroundColor: '#fff',
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#E0E0E0',
  },
  headerTitle: {fontSize: 16, fontWeight: '700', color: '#212121'},
  headerSubtitle: {fontSize: 13, color: '#9E9E9E', marginTop: 2},
  listContent: {padding: 12, paddingBottom: 32},
  row: {
    backgroundColor: '#fff',
    borderRadius: 10,
    padding: 14,
    marginBottom: 10,
    flexDirection: 'row',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: {width: 0, height: 1},
    shadowOpacity: 0.06,
    shadowRadius: 2,
    elevation: 1,
  },
  rowContent: {flex: 1},
  rowTitle: {fontSize: 15, fontWeight: '600', color: '#212121', marginBottom: 4},
  rowSummary: {fontSize: 13, color: '#616161', lineHeight: 18, marginBottom: 4},
  rowNote: {fontSize: 13, color: '#7B1FA2', fontStyle: 'italic', marginBottom: 4},
  rowMeta: {fontSize: 12, color: '#9E9E9E'},
  browseButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 16,
    gap: 8,
  },
  browseButtonText: {color: '#7B1FA2', fontSize: 15, fontWeight: '600'},
  emptyState: {alignItems: 'center', padding: 40},
  emptyTitle: {fontSize: 18, fontWeight: '600', color: '#616161', marginTop: 16, marginBottom: 8},
  emptyBody: {fontSize: 14, color: '#9E9E9E', textAlign: 'center', lineHeight: 20},
});

export default GroupLiteratureBookmarksScreen;
