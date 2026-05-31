import React, {useEffect, useRef, useState} from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TextInput,
  TouchableOpacity,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
  Alert,
} from 'react-native';
import {useRoute, RouteProp, useNavigation} from '@react-navigation/native';
import {StackNavigationProp} from '@react-navigation/stack';
import firestore from '@react-native-firebase/firestore';
import {useAppDispatch, useAppSelector} from '../../store';
import {
  fetchSponsorChatMessages,
  sendSponsorChatMessage,
  updateSponsorshipStatus,
  selectAllSponsorships,
} from '../../store/slices/sponsorshipSlice';
import auth from '@react-native-firebase/auth';
import Icon from 'react-native-vector-icons/Ionicons';
import IconMaterial from 'react-native-vector-icons/MaterialCommunityIcons';
import {SponsorChatMessage} from '../../types/sponsorship';
import {GroupStackParamList} from '../../types/navigation';

type SponsorChatScreenRouteProp = RouteProp<GroupStackParamList, 'SponsorChat'>;
type SponsorChatScreenNavigationProp = StackNavigationProp<GroupStackParamList>;

const SponsorChatScreen: React.FC = () => {
  const route = useRoute<SponsorChatScreenRouteProp>();
  const navigation = useNavigation<SponsorChatScreenNavigationProp>();
  const {groupId, sponsorId, sponseeId, sponsorName, sponseeName} =
    route.params;
  const dispatch = useAppDispatch();
  const flatListRef = useRef<FlatList>(null);
  const [newMessage, setNewMessage] = React.useState('');
  const [showMenu, setShowMenu] = useState(false);
  const [endingSponsorship, setEndingSponsorship] = useState(false);

  const chatId = [sponsorId, sponseeId].sort().join('_');
  const messages = useAppSelector(
    state => state.sponsorship.chatMessages[chatId] || [],
  );
  const sponsorships = useAppSelector(selectAllSponsorships);
  const loading = useAppSelector(state => state.sponsorship.loading);
  const currentUser = auth().currentUser;

  // Find the active sponsorship for this pair
  const activeSponsorship = sponsorships.find(
    s =>
      s.groupId === groupId &&
      s.sponsorId === sponsorId &&
      s.sponseeId === sponseeId &&
      s.status === 'active',
  );

  const isSponsor = currentUser?.uid === sponsorId;
  const otherPersonName = isSponsor ? sponseeName : sponsorName;

  // V3.5: Check if the sponsee has granted step access to this sponsor
  const [sponseeAllowsStepAccess, setSponseeAllowsStepAccess] = useState(false);

  useEffect(() => {
    if (!isSponsor) {return;}
    // Check if sponsee's step progress document allows this sponsor access
    firestore()
      .collection('users')
      .doc(sponseeId)
      .collection('stepProgress')
      .doc('current')
      .get()
      .then(snap => {
        if (snap.exists) {
          const data = snap.data();
          if (
            data?.allowSponsorAccess === true &&
            data?.sponsorId === sponsorId
          ) {
            setSponseeAllowsStepAccess(true);
          }
        }
      })
      .catch(() => {/* best-effort */});
  }, [isSponsor, sponseeId, sponsorId]);

  useEffect(() => {
    dispatch(fetchSponsorChatMessages({groupId, sponsorId, sponseeId}));
  }, [dispatch, groupId, sponsorId, sponseeId]);

  const handleSendMessage = () => {
    if (!newMessage.trim() || !currentUser) return;

    dispatch(
      sendSponsorChatMessage({
        groupId,
        sponsorId,
        sponseeId,
        message: newMessage.trim(),
        senderId: currentUser.uid,
      }),
    );
    setNewMessage('');
  };

  const handleEndSponsorship = () => {
    setShowMenu(false);

    Alert.alert(
      'End Sponsorship',
      `Are you sure you want to end your sponsorship with ${otherPersonName}? This action cannot be undone.`,
      [
        {text: 'Cancel', style: 'cancel'},
        {
          text: 'End Sponsorship',
          style: 'destructive',
          onPress: async () => {
            if (!activeSponsorship) {
              Alert.alert('Error', 'Could not find active sponsorship.');
              return;
            }

            setEndingSponsorship(true);
            try {
              await dispatch(
                updateSponsorshipStatus({
                  groupId,
                  sponsorshipId: activeSponsorship.id,
                  status: 'terminated',
                }),
              ).unwrap();

              Alert.alert(
                'Sponsorship Ended',
                `Your sponsorship with ${otherPersonName} has been ended.`,
                [
                  {
                    text: 'OK',
                    onPress: () => navigation.goBack(),
                  },
                ],
              );
            } catch (error: any) {
              Alert.alert(
                'Error',
                error.message || 'Failed to end sponsorship. Please try again.',
              );
            } finally {
              setEndingSponsorship(false);
            }
          },
        },
      ],
    );
  };

  const renderMessage = ({item}: {item: SponsorChatMessage}) => {
    const isCurrentUser = item.senderId === currentUser?.uid;
    return (
      <View
        style={[
          styles.messageContainer,
          isCurrentUser ? styles.sentMessage : styles.receivedMessage,
        ]}>
        <Text
          style={[
            styles.messageText,
            !isCurrentUser && styles.receivedMessageText,
          ]}>
          {item.text}
        </Text>
        <Text
          style={[
            styles.timestamp,
            !isCurrentUser && styles.receivedTimestamp,
          ]}>
          {item.timestamp.toLocaleTimeString([], {
            hour: '2-digit',
            minute: '2-digit',
          })}
        </Text>
      </View>
    );
  };

  if (loading && messages.length === 0) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#2196F3" />
      </View>
    );
  }

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      keyboardVerticalOffset={Platform.OS === 'ios' ? 90 : 0}>
      <View style={styles.header}>
        <View style={styles.headerContent}>
          <Text style={styles.headerTitle}>{otherPersonName}</Text>
          <Text style={styles.headerSubtitle}>
            {isSponsor ? 'Your Sponsee' : 'Your Sponsor'}
          </Text>
        </View>

        <TouchableOpacity
          style={styles.menuButton}
          onPress={() => setShowMenu(!showMenu)}>
          <IconMaterial name="dots-vertical" size={24} color="#757575" />
        </TouchableOpacity>

        {/* Dropdown Menu */}
        {showMenu && (
          <View style={styles.menuDropdown}>
            {/* V3.5: View sponsee step progress (visible to sponsor when access granted) */}
            {isSponsor && sponseeAllowsStepAccess && (
              <TouchableOpacity
                style={styles.menuItem}
                onPress={() => {
                  setShowMenu(false);
                  navigation.navigate('SponseeStepProgress' as any, {
                    userId: sponseeId,
                    sponseeName,
                  } as any);
                }}>
                <IconMaterial name="clipboard-list-outline" size={20} color="#2196F3" />
                <Text style={styles.menuItemText}>View Step Progress</Text>
              </TouchableOpacity>
            )}
            <TouchableOpacity
              style={styles.menuItem}
              onPress={handleEndSponsorship}
              disabled={endingSponsorship}>
              {endingSponsorship ? (
                <ActivityIndicator size="small" color="#F44336" />
              ) : (
                <>
                  <IconMaterial name="account-remove" size={20} color="#F44336" />
                  <Text style={styles.menuItemTextDanger}>End Sponsorship</Text>
                </>
              )}
            </TouchableOpacity>
          </View>
        )}
      </View>

      {/* Tap outside to close menu */}
      {showMenu && (
        <TouchableOpacity
          style={styles.menuOverlay}
          activeOpacity={1}
          onPress={() => setShowMenu(false)}
        />
      )}

      <FlatList
        ref={flatListRef}
        data={messages}
        renderItem={renderMessage}
        keyExtractor={item => item.id}
        onContentSizeChange={() => flatListRef.current?.scrollToEnd()}
        style={styles.messagesList}
        ListEmptyComponent={
          <View style={styles.emptyMessagesContainer}>
            <IconMaterial name="message-text-outline" size={48} color="#BDBDBD" />
            <Text style={styles.emptyMessagesText}>No messages yet</Text>
            <Text style={styles.emptyMessagesSubtext}>
              Start the conversation with {otherPersonName}
            </Text>
          </View>
        }
      />

      <View style={styles.inputContainer}>
        <TextInput
          style={styles.input}
          value={newMessage}
          onChangeText={setNewMessage}
          placeholder="Type a message..."
          multiline
        />
        <TouchableOpacity
          style={styles.sendButton}
          onPress={handleSendMessage}
          disabled={!newMessage.trim()}>
          <Icon
            name="send"
            size={24}
            color={newMessage.trim() ? '#2196F3' : '#BDBDBD'}
          />
        </TouchableOpacity>
      </View>
    </KeyboardAvoidingView>
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
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 16,
    backgroundColor: '#FFFFFF',
    borderBottomWidth: 1,
    borderBottomColor: '#E0E0E0',
    position: 'relative',
  },
  headerContent: {
    flex: 1,
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#212121',
  },
  headerSubtitle: {
    fontSize: 13,
    color: '#757575',
    marginTop: 2,
  },
  menuButton: {
    padding: 8,
  },
  menuOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    zIndex: 1,
  },
  menuDropdown: {
    position: 'absolute',
    top: 56,
    right: 16,
    backgroundColor: '#FFFFFF',
    borderRadius: 8,
    shadowColor: '#000',
    shadowOffset: {width: 0, height: 2},
    shadowOpacity: 0.15,
    shadowRadius: 4,
    elevation: 4,
    minWidth: 180,
    zIndex: 10,
  },
  menuItem: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 14,
  },
  menuItemText: {
    fontSize: 15,
    color: '#212121',
    marginLeft: 10,
    fontWeight: '500',
  },
  menuItemTextDanger: {
    fontSize: 15,
    color: '#F44336',
    marginLeft: 10,
    fontWeight: '500',
  },
  messagesList: {
    flex: 1,
    padding: 16,
  },
  emptyMessagesContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingTop: 80,
  },
  emptyMessagesText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#757575',
    marginTop: 12,
  },
  emptyMessagesSubtext: {
    fontSize: 14,
    color: '#9E9E9E',
    marginTop: 4,
  },
  messageContainer: {
    maxWidth: '80%',
    padding: 12,
    borderRadius: 12,
    marginBottom: 8,
  },
  sentMessage: {
    alignSelf: 'flex-end',
    backgroundColor: '#2196F3',
  },
  receivedMessage: {
    alignSelf: 'flex-start',
    backgroundColor: '#FFFFFF',
  },
  messageText: {
    fontSize: 16,
    color: '#FFFFFF',
  },
  receivedMessageText: {
    color: '#212121',
  },
  timestamp: {
    fontSize: 12,
    color: 'rgba(255, 255, 255, 0.7)',
    marginTop: 4,
    alignSelf: 'flex-end',
  },
  receivedTimestamp: {
    color: '#9E9E9E',
  },
  inputContainer: {
    flexDirection: 'row',
    padding: 16,
    backgroundColor: '#FFFFFF',
    borderTopWidth: 1,
    borderTopColor: '#E0E0E0',
  },
  input: {
    flex: 1,
    backgroundColor: '#F5F5F5',
    borderRadius: 20,
    paddingHorizontal: 16,
    paddingVertical: 8,
    marginRight: 8,
    maxHeight: 100,
  },
  sendButton: {
    justifyContent: 'center',
    alignItems: 'center',
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#E3F2FD',
  },
});

export default SponsorChatScreen;
