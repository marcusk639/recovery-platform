import React, {useEffect, useState, useCallback} from 'react';
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  StyleSheet,
  RefreshControl,
  ActivityIndicator,
} from 'react-native';
import {useNavigation, useFocusEffect} from '@react-navigation/native';
import {StackNavigationProp} from '@react-navigation/stack';
import FastImage from 'react-native-fast-image';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import auth from '@react-native-firebase/auth';
import firestore from '@react-native-firebase/firestore';
import {MessagesStackParamList} from '../../types/navigation';
import {COLLECTION_PATHS} from '../../types/schema';
import {useAppDispatch, useAppSelector} from '../../store';
import {
  fetchConversations,
  selectAllConversations,
  selectDirectMessagesStatus,
  selectDirectMessagesError,
  selectHasMoreConversations,
  selectLastConversationThreadId,
  DirectConversationEntity,
} from '../../store/slices/directMessagesSlice';
import {formatTimestamp} from '../../utils/chatUtils';

type ConversationsListScreenNavigationProp = StackNavigationProp<
  MessagesStackParamList,
  'DirectMessage'
>;

const ConversationsListScreen: React.FC = () => {
  const navigation = useNavigation<ConversationsListScreenNavigationProp>();
  const dispatch = useAppDispatch();
  const conversations = useAppSelector(selectAllConversations);
  const status = useAppSelector(selectDirectMessagesStatus);
  const error = useAppSelector(selectDirectMessagesError);
  const hasMore = useAppSelector(selectHasMoreConversations);
  const lastThreadId = useAppSelector(selectLastConversationThreadId);
  const [refreshing, setRefreshing] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [mutedThreads, setMutedThreads] = useState<string[]>([]);

  // Load muted threads for the current user
  const loadMutedThreads = useCallback(() => {
    const currentUser = auth().currentUser;
    if (!currentUser) return;
    firestore()
      .collection('users')
      .doc(currentUser.uid)
      .get()
      .then(doc => setMutedThreads(doc.data()?.mutedThreads || []))
      .catch(() => {});
  }, []);

  useEffect(() => {
    loadConversations();
    loadMutedThreads();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Refresh conversations and mute state when screen comes into focus
  useFocusEffect(
    useCallback(() => {
      loadConversations();
      loadMutedThreads();
    }, [loadMutedThreads]),
  );

  // Set up real-time listener for thread updates with debouncing
  useEffect(() => {
    const currentUser = auth().currentUser;
    if (!currentUser) return;

    const threadsRef = firestore().collection(
      COLLECTION_PATHS.DIRECT_MESSAGE_THREADS,
    );

    let debounceTimer: NodeJS.Timeout | null = null;
    let isFirstSnapshot = true;

    const unsubscribe = threadsRef
      .where('participants', 'array-contains', currentUser.uid)
      .onSnapshot(
        async snapshot => {
          // Skip the initial snapshot (we already loaded conversations)
          if (isFirstSnapshot) {
            isFirstSnapshot = false;
            return;
          }

          // Debounce to prevent rapid refreshes
          if (debounceTimer) {
            clearTimeout(debounceTimer);
          }

          debounceTimer = setTimeout(async () => {
            try {
              await dispatch(fetchConversations(undefined)).unwrap();
            } catch (err) {
              console.error('Error refreshing conversations:', err);
            }
          }, 500); // 500ms debounce
        },
        error => {
          console.error('Error in conversations listener:', error);
        },
      );

    return () => {
      if (debounceTimer) {
        clearTimeout(debounceTimer);
      }
      unsubscribe();
    };
  }, [dispatch]);

  const loadConversations = async (reset: boolean = false) => {
    try {
      if (reset) {
        // Reset pagination state by passing undefined
        await dispatch(fetchConversations(undefined)).unwrap();
      } else {
        await dispatch(fetchConversations()).unwrap();
      }
    } catch (err) {
      console.error('Error loading conversations:', err);
    }
  };

  const loadMoreConversations = async () => {
    if (loadingMore || !hasMore || !lastThreadId) return;

    try {
      setLoadingMore(true);
      await dispatch(
        fetchConversations({
          limit: 20,
          lastThreadId,
        }),
      ).unwrap();
    } catch (err) {
      console.error('Error loading more conversations:', err);
    } finally {
      setLoadingMore(false);
    }
  };

  const handleRefresh = async () => {
    setRefreshing(true);
    await loadConversations(true);
    setRefreshing(false);
  };

  const handleConversationPress = (conversation: DirectConversationEntity) => {
    navigation.navigate('DirectMessage', {
      threadId: conversation.threadId,
      otherUserId: conversation.otherUserId,
      otherUserName: conversation.otherUserName,
      otherUserPhotoURL: conversation.otherUserPhotoURL,
    });
  };

  const renderConversation = ({item}: {item: DirectConversationEntity}) => {
    const timeAgo = formatTimestamp(item.lastMessage.sentAt.getTime());
    const isUnread = item.unreadCount > 0;
    const isMuted = mutedThreads.includes(item.threadId);

    return (
      <TouchableOpacity
        style={styles.conversationItem}
        testID={`conversation-item-${item.threadId}`}
        onPress={() => handleConversationPress(item)}>
        <View style={styles.avatarContainer}>
          {item.otherUserPhotoURL ? (
            <FastImage
              source={{uri: item.otherUserPhotoURL}}
              style={styles.avatar}
            />
          ) : (
            <View style={[styles.avatar, styles.defaultAvatar]}>
              <Text style={styles.avatarText}>
                {item.otherUserName.charAt(0).toUpperCase()}
              </Text>
            </View>
          )}
          {isUnread && <View style={styles.unreadBadge} />}
        </View>

        <View style={styles.conversationContent}>
          <View style={styles.conversationHeader}>
            <View style={styles.nameRow}>
              <Text
                style={[styles.conversationName, isUnread && styles.unreadName]}>
                {item.otherUserName}
              </Text>
              {isMuted && (
                <Icon
                  name="bell-off"
                  size={14}
                  color="#9E9E9E"
                  style={{marginLeft: 4}}
                />
              )}
            </View>
            <Text style={styles.conversationTime}>{timeAgo}</Text>
          </View>
          <Text
            style={[styles.lastMessage, isUnread && styles.unreadMessage]}
            numberOfLines={1}>
            {item.lastMessage.text}
          </Text>
          {isUnread && (
            <View style={styles.unreadCountBadge}>
              <Text style={styles.unreadCountText}>{item.unreadCount}</Text>
            </View>
          )}
        </View>
      </TouchableOpacity>
    );
  };

  if (status === 'loading' && conversations.length === 0) {
    return (
      <View style={styles.loadingContainer} testID="conversations-loader">
        <ActivityIndicator size="large" color="#2196F3" />
        <Text style={styles.loadingText}>Loading conversations...</Text>
      </View>
    );
  }

  return (
    <View style={styles.container} testID="conversations-list-screen">
      <FlatList
        testID="conversations-list"
        data={conversations}
        renderItem={renderConversation}
        keyExtractor={item => item.threadId}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={handleRefresh} />
        }
        ListEmptyComponent={
          <View style={styles.emptyContainer} testID="conversations-empty-state">
            <Text style={styles.emptyText}>No conversations yet</Text>
            <Text style={styles.emptySubtext}>
              Start a conversation by messaging a group member
            </Text>
          </View>
        }
        ListFooterComponent={
          hasMore ? (
            <TouchableOpacity
              style={styles.loadMoreButton}
              onPress={loadMoreConversations}
              disabled={loadingMore}>
              {loadingMore ? (
                <ActivityIndicator size="small" color="#2196F3" />
              ) : (
                <Text style={styles.loadMoreText}>Load More</Text>
              )}
            </TouchableOpacity>
          ) : null
        }
        onEndReached={loadMoreConversations}
        onEndReachedThreshold={0.5}
      />
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#FFFFFF',
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingText: {
    marginTop: 8,
    fontSize: 16,
    color: '#757575',
  },
  conversationItem: {
    flexDirection: 'row',
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#E0E0E0',
  },
  avatarContainer: {
    marginRight: 12,
    position: 'relative',
  },
  avatar: {
    width: 50,
    height: 50,
    borderRadius: 25,
  },
  defaultAvatar: {
    backgroundColor: '#2196F3',
    justifyContent: 'center',
    alignItems: 'center',
  },
  avatarText: {
    color: '#FFFFFF',
    fontSize: 20,
    fontWeight: 'bold',
  },
  unreadBadge: {
    position: 'absolute',
    top: 0,
    right: 0,
    width: 12,
    height: 12,
    borderRadius: 6,
    backgroundColor: '#4CAF50',
    borderWidth: 2,
    borderColor: '#FFFFFF',
  },
  conversationContent: {
    flex: 1,
    justifyContent: 'center',
  },
  conversationHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 4,
  },
  nameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  conversationName: {
    fontSize: 16,
    fontWeight: '500',
    color: '#212121',
  },
  unreadName: {
    fontWeight: 'bold',
  },
  conversationTime: {
    fontSize: 12,
    color: '#9E9E9E',
  },
  lastMessage: {
    fontSize: 14,
    color: '#757575',
  },
  unreadMessage: {
    color: '#212121',
    fontWeight: '500',
  },
  unreadCountBadge: {
    position: 'absolute',
    right: 0,
    top: 20,
    backgroundColor: '#2196F3',
    borderRadius: 10,
    minWidth: 20,
    height: 20,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 6,
  },
  unreadCountText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: 'bold',
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
    marginTop: 100,
  },
  emptyText: {
    fontSize: 18,
    fontWeight: '600',
    color: '#757575',
    marginBottom: 8,
  },
  emptySubtext: {
    fontSize: 14,
    color: '#9E9E9E',
    textAlign: 'center',
  },
  loadMoreButton: {
    padding: 16,
    alignItems: 'center',
  },
  loadMoreText: {
    fontSize: 14,
    color: '#2196F3',
    fontWeight: '500',
  },
});

export default ConversationsListScreen;
