// mobile/src/screens/profile/LiteratureDetailScreen.tsx
import React, {useEffect, useState} from 'react';
import {
  View,
  Text,
  StyleSheet,
  SafeAreaView,
  ScrollView,
  TouchableOpacity,
  Share,
  Linking,
  Alert,
  ActivityIndicator,
} from 'react-native';
import {RouteProp, useRoute} from '@react-navigation/native';
import {ProfileStackParamList} from '../../types/navigation';
import {useAppDispatch, useAppSelector} from '../../store';
import {
  loadLiteratureIndex,
  saveLiterature,
  bookmarkForGroup,
  selectLiteratureById,
  selectIsLiteratureSaved,
} from '../../store/slices/literatureSlice';
import {selectAdminGroups} from '../../store/slices/groupsSlice';
import Icon from 'react-native-vector-icons/Ionicons';

type LiteratureDetailRouteProp = RouteProp<ProfileStackParamList, 'LiteratureDetail'>;

const LiteratureDetailScreen: React.FC = () => {
  const route = useRoute<LiteratureDetailRouteProp>();
  const dispatch = useAppDispatch();
  const {literatureId} = route.params;

  const item = useAppSelector(state => selectLiteratureById(state, literatureId));
  const isSaved = useAppSelector(state => selectIsLiteratureSaved(state, literatureId));
  const adminGroups = useAppSelector(selectAdminGroups);
  const [bookmarking, setBookmarking] = useState(false);

  useEffect(() => {
    if (!item) {
      dispatch(loadLiteratureIndex());
    }
  }, [dispatch, item]);

  const handleToggleSave = async () => {
    try {
      await dispatch(saveLiterature({literatureId, save: !isSaved})).unwrap();
    } catch (err: any) {
      Alert.alert('Error', err.message || 'Failed to save item.');
    }
  };

  const handleShare = async () => {
    if (!item) return;
    const text =
      `${item.title}\n\n${item.summary}` +
      (item.externalUrl ? `\n\nRead more: ${item.externalUrl}` : '');
    try {
      await Share.share({message: text});
    } catch {
      // cancelled
    }
  };

  const handleOpenLink = () => {
    if (item?.externalUrl) {
      Linking.openURL(item.externalUrl).catch(() => {
        Alert.alert('Error', 'Could not open link.');
      });
    }
  };

  const doBookmark = async (groupId: string) => {
    setBookmarking(true);
    try {
      await dispatch(bookmarkForGroup({groupId, literatureId})).unwrap();
      Alert.alert('Added', 'This resource has been added to your group library.');
    } catch (err: any) {
      Alert.alert('Error', err.message || 'Failed to add to group library.');
    } finally {
      setBookmarking(false);
    }
  };

  const handleAddToGroupLibrary = () => {
    if (adminGroups.length === 0) return;
    if (adminGroups.length === 1) {
      const group = adminGroups[0]!;
      doBookmark(group.id);
      return;
    }
    // Multiple admin groups — let user pick
    Alert.alert(
      'Add to Group Library',
      'Choose which group to add this resource to:',
      adminGroups
        .filter((g): g is NonNullable<typeof g> => g != null)
        .map(group => ({
          text: group.name,
          onPress: () => doBookmark(group.id),
        }))
        .concat([{text: 'Cancel', onPress: () => {}} as any]),
    );
  };

  if (!item) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.emptyState}>
          <Icon name="book-outline" size={48} color="#CE93D8" />
          <Text style={styles.emptyTitle}>Loading...</Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView contentContainerStyle={styles.scrollContent}>
        {/* Header */}
        <View style={styles.headerCard}>
          <View style={styles.headerBadges}>
            <View style={styles.typeBadge}>
              <Text style={styles.typeBadgeText}>
                {item.type === 'external_link'
                  ? 'External Link'
                  : item.type.charAt(0).toUpperCase() + item.type.slice(1)}
              </Text>
            </View>
            {item.program && (
              <View style={styles.programBadge}>
                <Text style={styles.programBadgeText}>{item.program}</Text>
              </View>
            )}
          </View>
          <Text style={styles.title}>{item.title}</Text>
          {item.author && (
            <Text style={styles.author}>by {item.author}</Text>
          )}
        </View>

        {/* Tags */}
        {item.tags.length > 0 && (
          <View style={styles.tagsRow}>
            {item.tags.map(tag => (
              <View key={tag} style={styles.tag}>
                <Text style={styles.tagText}>{tag}</Text>
              </View>
            ))}
          </View>
        )}

        {/* Summary */}
        <View style={styles.card}>
          <Text style={styles.sectionLabel}>Summary</Text>
          <Text style={styles.summaryText}>{item.summary}</Text>
        </View>

        {/* Full text */}
        {item.fullText ? (
          <View style={styles.card}>
            <Text style={styles.sectionLabel}>Full Text</Text>
            <Text style={styles.fullText}>{item.fullText}</Text>
          </View>
        ) : null}

        {/* External link button */}
        {item.externalUrl ? (
          <TouchableOpacity style={styles.linkButton} onPress={handleOpenLink}>
            <Icon name="open-outline" size={18} color="#0277BD" />
            <Text style={styles.linkButtonText}>Open External Resource</Text>
          </TouchableOpacity>
        ) : null}

        {/* Action buttons */}
        <View style={styles.actionsRow}>
          <TouchableOpacity
            style={[styles.actionButton, isSaved && styles.actionButtonActive]}
            onPress={handleToggleSave}>
            <Icon
              name={isSaved ? 'bookmark' : 'bookmark-outline'}
              size={20}
              color={isSaved ? '#F9A825' : '#616161'}
            />
            <Text
              style={[styles.actionButtonText, isSaved && {color: '#F9A825'}]}>
              {isSaved ? 'Saved' : 'Save'}
            </Text>
          </TouchableOpacity>

          <TouchableOpacity style={styles.actionButton} onPress={handleShare}>
            <Icon name="share-outline" size={20} color="#616161" />
            <Text style={styles.actionButtonText}>Share</Text>
          </TouchableOpacity>
        </View>

        {/* Add to Group Library — visible only to group admins */}
        {adminGroups.length > 0 && (
          <TouchableOpacity
            style={styles.groupLibraryButton}
            onPress={handleAddToGroupLibrary}
            disabled={bookmarking}>
            {bookmarking ? (
              <ActivityIndicator size="small" color="#fff" />
            ) : (
              <>
                <Icon name="library-outline" size={18} color="#fff" />
                <Text style={styles.groupLibraryButtonText}>
                  Add to Group Library
                </Text>
              </>
            )}
          </TouchableOpacity>
        )}
      </ScrollView>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {flex: 1, backgroundColor: '#F5F5F5'},
  scrollContent: {padding: 16, paddingBottom: 40},
  headerCard: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    shadowColor: '#000',
    shadowOffset: {width: 0, height: 1},
    shadowOpacity: 0.08,
    shadowRadius: 3,
    elevation: 2,
  },
  headerBadges: {
    flexDirection: 'row',
    marginBottom: 10,
    flexWrap: 'wrap',
    gap: 6,
  },
  typeBadge: {
    backgroundColor: '#1565C0',
    borderRadius: 4,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  typeBadgeText: {fontSize: 11, color: '#fff', fontWeight: '600'},
  programBadge: {
    backgroundColor: '#E8F5E9',
    borderRadius: 4,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  programBadgeText: {fontSize: 11, color: '#2E7D32', fontWeight: '600'},
  title: {fontSize: 20, fontWeight: '700', color: '#212121', marginBottom: 4},
  author: {fontSize: 14, color: '#9E9E9E'},
  tagsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    marginBottom: 12,
  },
  tag: {
    backgroundColor: '#F3E5F5',
    borderRadius: 4,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  tagText: {fontSize: 12, color: '#7B1FA2'},
  card: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    shadowColor: '#000',
    shadowOffset: {width: 0, height: 1},
    shadowOpacity: 0.08,
    shadowRadius: 3,
    elevation: 2,
  },
  sectionLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: '#9E9E9E',
    textTransform: 'uppercase',
    letterSpacing: 0.8,
    marginBottom: 8,
  },
  summaryText: {fontSize: 15, lineHeight: 24, color: '#424242'},
  fullText: {fontSize: 15, lineHeight: 24, color: '#424242'},
  linkButton: {
    backgroundColor: '#E3F2FD',
    borderRadius: 10,
    padding: 14,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    marginBottom: 12,
  },
  linkButtonText: {
    color: '#0277BD',
    fontSize: 15,
    fontWeight: '600',
    marginLeft: 6,
  },
  actionsRow: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: 12,
  },
  actionButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#fff',
    borderRadius: 10,
    padding: 14,
    gap: 6,
    shadowColor: '#000',
    shadowOffset: {width: 0, height: 1},
    shadowOpacity: 0.06,
    shadowRadius: 2,
    elevation: 1,
  },
  actionButtonActive: {borderColor: '#F9A825', borderWidth: 1.5},
  actionButtonText: {fontSize: 14, fontWeight: '600', color: '#616161'},
  groupLibraryButton: {
    backgroundColor: '#6A1B9A',
    borderRadius: 10,
    padding: 14,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    marginBottom: 12,
  },
  groupLibraryButtonText: {
    color: '#fff',
    fontSize: 15,
    fontWeight: '600',
    marginLeft: 6,
  },
  emptyState: {alignItems: 'center', padding: 60},
  emptyTitle: {fontSize: 18, fontWeight: '600', color: '#9E9E9E', marginTop: 16},
});

export default LiteratureDetailScreen;
