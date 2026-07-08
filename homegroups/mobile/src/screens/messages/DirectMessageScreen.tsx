import React, {useState, useEffect, useRef, useCallback} from 'react';
import {
  View,
  Text,
  FlatList,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
  Alert,
  StatusBar,
  Animated,
  StyleSheet,
  TouchableOpacity,
} from 'react-native';
import {SafeAreaView} from 'react-native-safe-area-context';
import {RouteProp, useRoute, useNavigation} from '@react-navigation/native';
import {StackNavigationProp} from '@react-navigation/stack';
import {
  GroupStackParamList,
  MessagesStackParamList,
} from '../../types/navigation';

// Support both navigation contexts (from Group stack or Messages stack)
type DirectMessageParamList = GroupStackParamList | MessagesStackParamList;
import auth from '@react-native-firebase/auth';
import firestore from '@react-native-firebase/firestore';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import {showMessage} from 'react-native-flash-message';
import {useAppDispatch, useAppSelector} from '../../store';
import {
  initializeThread,
  fetchRecentMessages,
  fetchEarlierMessages,
  sendMessage,
  markMessageAsRead,
  addReaction,
  deleteMessage,
  addOptimisticMessage,
  removeOptimisticMessage,
  setMessages,
  selectMessagesByThread,
  selectDirectMessagesStatus,
  selectDirectMessagesError,
} from '../../store/slices/directMessagesSlice';
import {DirectMessageModel} from '../../models/DirectMessageModel';
import {DirectMessage} from '../../types';
import MessageBubble from '../../components/chat/MessageBubble';
import MessageInput from '../../components/chat/MessageInput';
import ReactionPicker from '../../components/chat/ReactionPicker';
import ImageViewer from '../../components/chat/ImageViewer';
import ReportContentModal from '../../components/moderation/ReportContentModal';

type DirectMessageScreenRouteProp = RouteProp<
  DirectMessageParamList,
  'DirectMessage'
>;
type DirectMessageScreenNavigationProp = StackNavigationProp<
  DirectMessageParamList,
  'DirectMessage'
>;

const DirectMessageScreen: React.FC = () => {
  const route = useRoute<DirectMessageScreenRouteProp>();
  const navigation = useNavigation<DirectMessageScreenNavigationProp>();
  const {
    threadId: initialThreadId,
    otherUserId,
    otherUserName,
    otherUserPhotoURL,
  } = route.params;
  const flatListRef = useRef<FlatList>(null);
  const messageInputRef = useRef<any>(null);
  const initializationAttempted = useRef(false);
  const [initialLoadComplete, setInitialLoadComplete] = useState(false);
  const [actualThreadId, setActualThreadId] = useState<string>(initialThreadId);

  const dispatch = useAppDispatch();
  const messages = useAppSelector(state =>
    selectMessagesByThread(state, actualThreadId),
  );
  const status = useAppSelector(selectDirectMessagesStatus);
  const error = useAppSelector(selectDirectMessagesError);

  const [messageText, setMessageText] = useState('');
  const [loadingEarlier, setLoadingEarlier] = useState(false);
  const [replyingTo, setReplyingTo] = useState<DirectMessage | null>(null);
  const [selectedMessage, setSelectedMessage] = useState<string | null>(null);
  const [selectedImage, setSelectedImage] = useState<string | null>(null);
  const [reportModalVisible, setReportModalVisible] = useState(false);
  const [messageToReport, setMessageToReport] = useState<DirectMessage | null>(
    null,
  );
  const [isMuted, setIsMuted] = useState(false);

  const fadeAnim = useRef(new Animated.Value(0)).current;
  const currentUser = auth().currentUser;

  // Load mute state on mount
  useEffect(() => {
    if (!currentUser || !actualThreadId) return;
    firestore()
      .collection('users')
      .doc(currentUser.uid)
      .get()
      .then(doc => {
        const mutedThreads: string[] = doc.data()?.mutedThreads || [];
        setIsMuted(mutedThreads.includes(actualThreadId));
      })
      .catch(() => {});
  }, [currentUser?.uid, actualThreadId]);

  // Toggle mute for this thread
  const handleToggleMute = useCallback(async () => {
    if (!currentUser || !actualThreadId) return;
    const userRef = firestore().collection('users').doc(currentUser.uid);
    try {
      if (isMuted) {
        await userRef.update({
          mutedThreads: firestore.FieldValue.arrayRemove(actualThreadId),
        });
        setIsMuted(false);
      } else {
        await userRef.update({
          mutedThreads: firestore.FieldValue.arrayUnion(actualThreadId),
        });
        setIsMuted(true);
      }
    } catch {
      Alert.alert('Error', 'Failed to update mute settings.');
    }
  }, [currentUser, actualThreadId, isMuted]);

  // Mark new messages as read
  const markNewMessagesAsRead = useCallback(
    async (messagesToMark: DirectMessage[]) => {
      if (!currentUser || !actualThreadId) return;

      const unreadMessages = messagesToMark.filter(
        msg =>
          msg.senderId !== currentUser.uid &&
          (!msg.read || !msg.read[currentUser.uid]),
      );

      for (const msg of unreadMessages) {
        try {
          dispatch(
            markMessageAsRead({threadId: actualThreadId, messageId: msg.id}),
          );
        } catch (error) {
          console.error('Error marking message as read:', error);
        }
      }
    },
    [actualThreadId, dispatch, currentUser],
  );

  // Initialize thread and load messages
  useEffect(() => {
    if (initializationAttempted.current) return;
    initializationAttempted.current = true;

    const initThread = async () => {
      try {
        if (!currentUser) {
          Alert.alert('Error', 'You must be logged in');
          navigation.goBack();
          return;
        }

        // Ensure thread exists (initializeThread will create if needed or return existing)
        const threadIdFromInit = await dispatch(
          initializeThread({
            userId1: currentUser.uid,
            userId2: otherUserId,
          }),
        ).unwrap();

        // Update the actual thread ID
        setActualThreadId(threadIdFromInit);

        // Use the actual thread ID
        await dispatch(fetchRecentMessages(threadIdFromInit)).unwrap();
        setInitialLoadComplete(true);
      } catch (err: any) {
        console.error('Error initializing thread:', err);
        Alert.alert('Error', err.message || 'Failed to load conversation');
        navigation.goBack();
      }
    };

    initThread();
  }, [initialThreadId, otherUserId, currentUser, dispatch, navigation]);

  // Set up real-time listener - only after initial load completes
  useEffect(() => {
    if (!actualThreadId || !initialLoadComplete) return;

    let unsubscribe: (() => void) | null = null;

    unsubscribe = DirectMessageModel.listenForMessages(
      actualThreadId,
      updatedMessages => {
        dispatch(
          setMessages({threadId: actualThreadId, messages: updatedMessages}),
        );
        markNewMessagesAsRead(updatedMessages);
      },
      {limit: 50}, // Configurable limit for active conversations
    );

    return () => {
      if (unsubscribe) {
        unsubscribe();
      }
    };
  }, [actualThreadId, initialLoadComplete, dispatch, markNewMessagesAsRead]);

  // Set navigation title and mute button
  useEffect(() => {
    navigation.setOptions({
      title: otherUserName,
      headerRight: () => (
        <TouchableOpacity
          onPress={handleToggleMute}
          style={{marginRight: 16}}>
          <Icon
            name={isMuted ? 'bell-off' : 'bell'}
            size={22}
            color={isMuted ? '#9E9E9E' : '#2196F3'}
          />
        </TouchableOpacity>
      ),
    });
  }, [navigation, otherUserName, isMuted, handleToggleMute]);

  // Handle sending a message
  const handleSendMessage = async () => {
    const currentMessage = messageText.trim();
    if (!currentMessage) return;

    if (!currentUser) {
      Alert.alert('Error', 'You must be logged in to send messages');
      return;
    }

    try {
      if (!actualThreadId) {
        Alert.alert('Error', 'Thread not initialized');
        return;
      }

      const replyToId = replyingTo ? replyingTo.id : null;

      // Create optimistic message
      const tempId = `temp_${Date.now()}_${Math.random()
        .toString(36)
        .substr(2, 9)}`;
      const optimisticMessage: DirectMessage & {isOptimistic?: boolean} = {
        id: tempId,
        threadId: actualThreadId,
        senderId: currentUser.uid,
        senderName: currentUser.displayName || 'Anonymous',
        senderPhotoURL: currentUser.photoURL || undefined,
        text: currentMessage,
        sentAt: Date.now(),
        read: {[currentUser.uid]: true},
        attachments: [],
        reactions: {},
        replyTo: replyingTo
          ? {
              messageId: replyingTo.id,
              senderName: replyingTo.senderName,
              text: replyingTo.text || '',
            }
          : null,
        isOptimistic: true,
      };

      // Add optimistic message immediately
      dispatch(
        addOptimisticMessage({
          threadId: actualThreadId,
          message: optimisticMessage,
        }),
      );

      // Clear input immediately for better UX
      setMessageText('');
      setReplyingTo(null);

      // Scroll to show the optimistic message
      setTimeout(() => {
        flatListRef.current?.scrollToEnd({animated: true});
      }, 100);

      // Send the actual message
      try {
        await dispatch(
          sendMessage({
            threadId: actualThreadId,
            text: currentMessage,
            replyToMessageId: replyToId,
          }),
        ).unwrap();
        // Optimistic message will be replaced by the real message from the listener or thunk
      } catch (error) {
        // Remove optimistic message on error
        dispatch(
          removeOptimisticMessage({
            threadId: actualThreadId,
            messageId: tempId,
          }),
        );
        throw error;
      }
    } catch (error) {
      console.error('Error sending message:', error);
      Alert.alert('Error', 'Failed to send message. Please try again.');
    }
  };

  // Load earlier messages
  const loadEarlierMessages = async () => {
    if (loadingEarlier || messages.length === 0) return;

    try {
      setLoadingEarlier(true);
      const oldestMessage = messages[0];

      if (!actualThreadId) return;

      await dispatch(
        fetchEarlierMessages({
          threadId: actualThreadId,
          beforeMessageId: oldestMessage.id,
        }),
      ).unwrap();
    } catch (error) {
      console.error('Error loading earlier messages:', error);
    } finally {
      setLoadingEarlier(false);
    }
  };

  // Handle message long press
  const handleMessageLongPress = (messageId: string) => {
    setSelectedMessage(messageId);
    Animated.timing(fadeAnim, {
      toValue: 1,
      duration: 200,
      useNativeDriver: true,
    }).start();
  };

  // Handle adding a reaction
  const handleAddReaction = async (messageId: string, reaction: string) => {
    try {
      if (!actualThreadId) return;

      await dispatch(
        addReaction({
          threadId: actualThreadId,
          messageId,
          reactionType: reaction,
        }),
      ).unwrap();

      setSelectedMessage(null);
      fadeAnim.setValue(0);
    } catch (error) {
      console.error('Error adding reaction:', error);
      Alert.alert('Error', 'Failed to add reaction. Please try again.');
    }
  };

  // Handle message delete
  const handleDeleteMessage = async (messageId: string) => {
    Alert.alert(
      'Delete Message',
      'Are you sure you want to delete this message?',
      [
        {
          text: 'Cancel',
          style: 'cancel',
          onPress: () => {
            setSelectedMessage(null);
            fadeAnim.setValue(0);
          },
        },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            try {
              if (!actualThreadId) return;

              await dispatch(
                deleteMessage({
                  threadId: actualThreadId,
                  messageId,
                }),
              ).unwrap();

              setSelectedMessage(null);
              fadeAnim.setValue(0);
              showMessage({
                message: 'Message deleted',
                type: 'info',
                duration: 3000,
              });
            } catch (error) {
              console.error('Error deleting message:', error);
              Alert.alert(
                'Error',
                'Failed to delete message. Please try again.',
              );
            }
          },
        },
      ],
    );
  };

  // Handle reply to message
  const handleReplyToMessage = (message: DirectMessage) => {
    setReplyingTo(message);
    setSelectedMessage(null);
    fadeAnim.setValue(0);
    messageInputRef.current?.focus();
  };

  // Handle report message
  const handleReportMessage = (message: DirectMessage) => {
    setMessageToReport(message);
    setReportModalVisible(true);
    setSelectedMessage(null);
    fadeAnim.setValue(0);
  };

  // Handle image press
  const handleImagePress = (imageUrl: string) => {
    setSelectedImage(imageUrl);
  };

  // Close image viewer
  const closeImageViewer = () => {
    setSelectedImage(null);
  };

  // Close reaction picker
  const closeReactionPicker = () => {
    setSelectedMessage(null);
    Animated.timing(fadeAnim, {
      toValue: 0,
      duration: 200,
      useNativeDriver: true,
    }).start();
  };

  // Render message bubble
  const renderMessageBubble = ({item}: {item: DirectMessage}) => {
    const isCurrentUser = item.senderId === currentUser?.uid;

    return (
      <MessageBubble
        message={item}
        isCurrentUser={isCurrentUser}
        selectedMessageId={selectedMessage}
        showMentions={false}
        showReadReceipts={true}
        onLongPress={handleMessageLongPress}
        onImagePress={handleImagePress}
      />
    );
  };

  if (status === 'loading' && messages.length === 0) {
    return (
      <SafeAreaView style={{flex: 1, backgroundColor: '#FFFFFF'}}>
        <StatusBar backgroundColor="#FFFFFF" barStyle="dark-content" />
        <View
          style={{
            flex: 1,
            justifyContent: 'center',
            alignItems: 'center',
          }}>
          <ActivityIndicator size="large" color="#2196F3" />
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={{flex: 1, backgroundColor: '#FFFFFF'}} testID="direct-message-screen">
      <StatusBar backgroundColor="#FFFFFF" barStyle="dark-content" />
      <KeyboardAvoidingView
        style={{flex: 1}}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        keyboardVerticalOffset={Platform.OS === 'ios' ? 88 : 0}>
        <FlatList
          testID="dm-message-list"
          ref={flatListRef}
          data={messages}
          renderItem={renderMessageBubble}
          keyExtractor={item => item.id}
          contentContainerStyle={{padding: 12, paddingBottom: 16}}
          inverted={false}
          onScrollBeginDrag={({nativeEvent}) => {
            // Load earlier messages when user scrolls to top
            if (nativeEvent.contentOffset.y <= 0 && !loadingEarlier) {
              loadEarlierMessages();
            }
          }}
          ListHeaderComponent={
            loadingEarlier ? (
              <View style={{padding: 12, alignItems: 'center'}}>
                <ActivityIndicator size="small" color="#2196F3" />
              </View>
            ) : null
          }
          ListEmptyComponent={
            <View style={styles.emptyContainer}>
              <Icon name="message-text-outline" size={64} color="#E0E0E0" />
              <Text style={styles.emptyText}>Start the conversation</Text>
              <Text style={styles.emptySubtext}>
                Send a message to {otherUserName} to begin chatting. Your
                messages are private between the two of you.
              </Text>
            </View>
          }
        />

        <MessageInput
          value={messageText}
          onChangeText={setMessageText}
          onSend={handleSendMessage}
          onAttach={() =>
            navigation.navigate('ChatMediaPicker', {
              context: 'dm',
              threadId: actualThreadId,
              otherUserId,
              otherUserName,
            })
          }
          replyingTo={replyingTo}
          onCancelReply={() => setReplyingTo(null)}
          placeholder="Type a message..."
          showAttachButton={true}
          inputRef={messageInputRef}
        />
      </KeyboardAvoidingView>

      <ReactionPicker
        visible={!!selectedMessage}
        fadeAnim={fadeAnim}
        onReactionSelect={reaction =>
          selectedMessage && handleAddReaction(selectedMessage, reaction)
        }
        onReply={() => {
          const message = messages.find(m => m.id === selectedMessage);
          if (message) {
            handleReplyToMessage(message);
          }
        }}
        onReport={() => {
          const message = messages.find(m => m.id === selectedMessage);
          if (message && message.senderId !== currentUser?.uid) {
            handleReportMessage(message);
          }
        }}
        onDelete={() => selectedMessage && handleDeleteMessage(selectedMessage)}
        onClose={closeReactionPicker}
        canDelete={
          !!messages.find(
            m => m.id === selectedMessage && m.senderId === currentUser?.uid,
          )
        }
        canReport={
          !!messages.find(
            m => m.id === selectedMessage && m.senderId !== currentUser?.uid,
          )
        }
      />

      <ImageViewer
        visible={!!selectedImage}
        imageUri={selectedImage}
        onClose={closeImageViewer}
      />

      <ReportContentModal
        visible={reportModalVisible}
        onClose={() => {
          setReportModalVisible(false);
          setMessageToReport(null);
        }}
        contentType="message"
        contentId={messageToReport?.id || ''}
        contentSnapshot={messageToReport?.text || ''}
        reportedUserId={messageToReport?.senderId || ''}
        reportedUserName={messageToReport?.senderName || ''}
        groupId="" // Direct messages don't have a groupId
      />
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  emptyContainer: {
    flex: 1,
    padding: 32,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 60,
  },
  emptyText: {
    fontSize: 20,
    fontWeight: '600',
    color: '#616161',
    marginTop: 16,
    marginBottom: 8,
  },
  emptySubtext: {
    fontSize: 15,
    color: '#9E9E9E',
    textAlign: 'center',
    lineHeight: 22,
    paddingHorizontal: 16,
  },
});

export default DirectMessageScreen;
