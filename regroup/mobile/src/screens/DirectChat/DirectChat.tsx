import React, { useState, useCallback, useEffect } from 'react';
// Phase 3.3: Removed withRats HOC (translation/theme available globally via useTranslation and ThemeProvider)
import { useAppSelector, useAppDispatch } from '../../state/store';
import { useSelectedHouse } from '../../hooks/useSelectedHouse';
import { useSelectedGuest } from '../../hooks/useSelectedGuest';
import { useGuests } from '../../state/queries/guestQueries';
import { Message } from '../../entities/Message';

import { loadDirectChat } from '../../services/message';
import {
  sendDirectMessage as sendDirectMessageThunk,
  addMessageToConversation,
  markMessagesAsRead,
  setActiveConversation,
} from '../../state/slices/chatSlice';
import { selectGuest as selectGuestThunk } from '../../state/slices/guestsSlice';
import {
  ChatParticipant,
  DirectMessage,
} from '../../entities/DirectConversation';
import RatsLoadingIndicator from '../../components/rats-loading-indicator/rats-loading-indicator';
import {
  Alert,
  View,
  TouchableOpacity,
  TextInput,
  Dimensions,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import {
  color,
  normalize,
  fontSize,
  elevateStyle,
  ROW,
  fontFamily,
} from '../../styles/theme';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { RootStackParamList } from '../../navigation/types';
import RatsButton from '../../components/rats-button/rats-button';
import { RatsIcon } from '../../components/rats-icon';
import RatsAvatar from '../../components/rats-avatar';
import { RatsText } from '../../components/rats-text';
import { Icon } from '../../components/rats-icon';
import { callNumber } from '../../util/phone';
import { dateAndTime } from '../../util/display';
import { toDateSafe } from '../../util/firestore';
import { House } from '../../entities/House';
import { Guest } from '../../entities/Guest';
import { Guests, Admins } from '../../types';
import Admin from '../../entities/Admin';
import { User } from '../../entities/User';
import { Routes } from '../../navigation/types';
import { KeyboardAwareFlatList } from 'react-native-keyboard-aware-scroll-view';
import { IOS } from '../../util/platform';
import * as uuid from 'uuid';

export interface ChatProps {
  house: House;
  guest: Guest;
  guests: Guests;
  addDirectMessage: any;
  sendDirectMessage: any;
  startConversation: any;
  selectGuest: any;
  user: User;
  admins: Admins;
  userAsAdmin: Admin;
  recipient: Guest | Admin;
  messages: DirectMessage[] | Message[];
  conversationId: string;
  addChatMessage: any;
  sendChatMessage: any;
  updateNavigationTitle: any;
  markMessageRead: any;
  conversations: any;
  navigation: NativeStackNavigationProp<RootStackParamList>;
}

const DirectChatInner: React.FC<ChatProps> = props => {
  const [loadingNewConversation, setLoadingNewConversation] = useState(false);
  const [text, setText] = useState('');

  const receiveMessages = useCallback(
    (msgs: Message[], chatId: string, loading: boolean = false) => {
      props.addDirectMessage(msgs, chatId, loading);
    },
    [props.addDirectMessage],
  );

  const markLatestMessageRead = useCallback(
    (msgs: Message[]) => {
      if (msgs && msgs.length && !msgs[0].read && msgs[0].key) {
        props.markMessageRead(props.conversationId, msgs[0].key);
      }
    },
    [props.markMessageRead, props.conversationId],
  );

  useEffect(() => {
    const initChat = async () => {
      setLoadingNewConversation(true);
      const msgs = await loadDirectChat(
        props.conversationId,
        receiveMessages as any,
      );
      markLatestMessageRead(msgs);
      setLoadingNewConversation(false);
    };

    initChat();
  }, [props.conversationId, receiveMessages, markLatestMessageRead]);

  useEffect(() => {
    if (props.messages && props.messages.length) {
      markLatestMessageRead(props.messages as Message[]);
    }
  }, [props.messages, markLatestMessageRead]);

  const loadMore = useCallback(
    async (msgs: Message[]) => {
      if (msgs && msgs.length) {
        const lastMessage = msgs[msgs.length - 1];
        const lastMessageId = lastMessage?.id || undefined;
        await loadDirectChat(
          props.conversationId,
          receiveMessages as any,
          lastMessageId,
        );
      }
    },
    [props.conversationId, receiveMessages],
  );

  const createMessage = useCallback(
    (messageText: string): Message[] => {
      const { house, user, userAsAdmin: admin, guest, recipient } = props;
      const participants: ChatParticipant[] = [
        {
          type: user.isAdmin ? 'admin' : 'guest',
          id: (user.isAdmin ? admin?.id : guest?.id) || '',
        },
        {
          type: admin && recipient?.id === admin.id ? 'admin' : 'guest',
          id: recipient?.id || '',
        },
      ];

      const messageId = uuid.v4();
      const message: Message = {
        id: messageId,
        user: {
          _id: user && user.uid,
          name: `${user.firstName} ${user.lastName}`,
          avatar: user.avatar,
        },
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        _id: messageId,
        text: messageText,
        houseId: house?.id || '',
        senderId: user?.uid || '',
        recipientId: recipient ? recipient.userId : undefined,
        sortKey: 0 - Date.now(),
        senderName: `${user?.firstName || ''} ${user?.lastName || ''}`,
        read: false,
        participants: participants as any, // DirectConversation.ChatParticipant vs Message.ChatParticipant type mismatch
      };

      return [message];
    },
    [props],
  );

  const onSend = useCallback(
    async (messageText: string) => {
      const { sendDirectMessage, conversationId } = props;
      setText('');
      const newMessages = createMessage(messageText);
      try {
        // DirectMessage and Message types are compatible for this operation
        await sendDirectMessage(conversationId, newMessages as any);
      } catch (error) {
        Alert.alert(
          'Failed to send the message! Please check your network connection and try again.',
        );
      }
    },
    [props.sendDirectMessage, props.conversationId, createMessage],
  );

  const renderMessage = useCallback(
    (message: Message) => {
      const { user } = props;
      const currentMessage = message;
      const messageIsFromThisUser =
        user && currentMessage?.user?._id === user.uid;

      const CONTAINER = {
        width: '60%',
        marginHorizontal: normalize(15),
        marginBottom: normalize(10),
        alignSelf: messageIsFromThisUser
          ? ('flex-end' as const)
          : ('flex-start' as const),
      };

      const MESSAGE_CONTAINER = {
        padding: normalize(10),
        borderRadius: 5,
        backgroundColor: messageIsFromThisUser ? color.chat_blue : color.white,
        marginBottom: normalize(5),
      };

      const name = currentMessage.user.name.split(' ');
      const firstName = name.length ? name[0] : 'Unknown';

      return (
        <View style={CONTAINER as any}>
          <View style={MESSAGE_CONTAINER}>
            <RatsText
              translate={false}
              text={currentMessage.text}
              style={{
                color: messageIsFromThisUser ? color.white : color.black,
                fontSize: fontSize.medium,
              }}
            />
          </View>
          <View
            style={{
              ...ROW,
              alignSelf: messageIsFromThisUser
                ? ('flex-end' as const)
                : ('flex-start' as const),
            }}>
            <RatsText
              translate={false}
              text={(() => {
                const d = toDateSafe(currentMessage.createdAt);
                return d ? dateAndTime(d) : '';
              })()}
              style={{ color: color.grey }}
            />
          </View>
        </View>
      );
    },
    [props.user],
  );

  // Stable renderItem for the FlatList so cell memoization isn't
  // invalidated on every parent re-render by an inline arrow.
  const renderItem = useCallback(
    (info: { item: Message }) => renderMessage(info.item),
    [renderMessage],
  );

  const renderHeader = useCallback(() => {
    const { recipient, admins, navigation } = props;
    const name = recipient
      ? `${recipient.firstName} ${recipient.lastName}`
      : '';
    const recipientIsAdmin = admins && admins[recipient?.id!];
    const avatar = recipient ? recipient.avatar : '';

    return (
      <View
        style={{
          height: normalize(60),
          width: '100%',
          backgroundColor: color.white,
          paddingVertical: normalize(5),
          paddingHorizontal: normalize(15),
          ...elevateStyle,
        }}>
        <View style={{ flexDirection: 'row', flex: 1, alignItems: 'center' }}>
          <TouchableOpacity
            onPress={() => navigation.goBack()}
            style={{ marginRight: normalize(15) }}>
            <RatsIcon
              name="arrow-left"
              size={fontSize.large}
              style={{ color: color.baby_blue }}
            />
          </TouchableOpacity>
          {avatar && (
            <RatsAvatar
              name={name}
              style={{
                height: normalize(45),
                width: normalize(45),
                borderRadius: IOS ? normalize(22) : normalize(45),
                marginRight: normalize(15),
              }}
              source={{ uri: avatar }}
              resizeMethod="resize"
              resizeMode="cover"
            />
          )}
          <RatsText
            style={{ fontSize: fontSize.medium }}
            translate={false}
            text={name}
          />
          <View
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              marginLeft: 'auto',
            }}>
            <TouchableOpacity
              style={{ paddingRight: !recipientIsAdmin ? normalize(20) : 0 }}
              onPress={() =>
                recipient?.phoneNumber && callNumber(recipient.phoneNumber)
              }>
              <Icon
                style={{ color: color.baby_blue }}
                name="phone"
                size={normalize(25)}
              />
            </TouchableOpacity>
            {!recipientIsAdmin && recipient?.id && (
              <TouchableOpacity
                onPress={() => {
                  props.selectGuest(recipient.id);
                  navigation.navigate(Routes.Guest);
                }}>
                <Icon
                  solid
                  style={{ color: color.baby_blue }}
                  name="info-circle"
                  size={normalize(25)}
                />
              </TouchableOpacity>
            )}
          </View>
        </View>
      </View>
    );
  }, [props.recipient, props.admins, props.navigation, props.selectGuest]);

  if (loadingNewConversation) {
    return <RatsLoadingIndicator />;
  }

  const messages = props.messages || [];
  const inputViewHeight = normalize(50);

  return (
    <SafeAreaView
      edges={['bottom']}
      style={{ backgroundColor: color.white, flex: 1 }}>
      {renderHeader()}
      <View style={{ flex: 1, backgroundColor: color.light_grey }}>
        <KeyboardAwareFlatList
          style={{ marginBottom: inputViewHeight }}
          contentContainerStyle={{
            flexGrow: 1,
            paddingTop: 0,
            paddingBottom: 0,
          }}
          data={messages}
          renderItem={renderItem}
          keyboardShouldPersistTaps="handled"
          removeClippedSubviews={false}
          initialNumToRender={5}
          maxToRenderPerBatch={1}
          updateCellsBatchingPeriod={100}
          windowSize={7}
          inverted
          onEndReachedThreshold={0.25}
          onEndReached={() => loadMore(messages as Message[])}
          extraScrollHeight={normalize(30)}
          keyboardOpeningTime={0}
          enableOnAndroid
        />
        <View
          style={{
            width: '100%',
            height: normalize(50),
            paddingHorizontal: normalize(10),
            backgroundColor: color.white,
            paddingTop: normalize(5),
            bottom: 0,
            position: 'absolute',
          }}>
          <View style={[ROW, { flex: 1, justifyContent: 'space-between' }]}>
            <TextInput
              placeholder="Type a message"
              placeholderTextColor={color.grey}
              multiline
              onChangeText={setText}
              style={{
                backgroundColor: color.white,
                height: normalize(40),
                width: '80%',
                borderRadius: 5,
                borderWidth: 1,
                borderColor: color.dark_grey,
                fontSize: normalize(15),
                paddingTop: normalize(10),
                paddingLeft: normalize(5),
                fontFamily: fontFamily.roboto,
              }}
              value={text}
              enablesReturnKeyAutomatically
              underlineColorAndroid="transparent"
            />
            <View
              style={{
                flex: 1,
                marginTop: normalize(5),
                marginLeft: normalize(10),
              }}>
              <RatsButton
                title="SEND"
                disabled={!text}
                style={{
                  fontSize: fontSize.small,
                  fontFamily: fontFamily.bold,
                }}
                onPress={() => onSend(text)}
                containerStyle={{
                  height: normalize(30),
                  width: normalize(55),
                  backgroundColor: color.chat_blue,
                }}
              />
            </View>
          </View>
        </View>
      </View>
    </SafeAreaView>
  );
};

/**
 * Direct Chat Screen - Wrapper Component
 *
 * @migrated Phase 2.2 - Converted from old Redux to RTK
 * Changes:
 * - Replaced old Redux actions with RTK thunks
 * - Added typed selectors (removed 7 'as any' casts)
 * - Kept HOCs (will be removed in Phase 3)
 */
const DirectChat: React.FC<any> = props => {
  const dispatch = useAppDispatch();

  // RTK Typed Selectors (no more 'as any')
  const { house } = useSelectedHouse();
  const { guest } = useSelectedGuest();
  // React Query is the source of truth for guests; see .full-review [A2].
  const { data: guests = {} } = useGuests(house?.id ?? '');
  const user = useAppSelector(state => state.user.user);
  const admins = useAppSelector(state => state.admin.houseAdmins);
  const userAsAdmin = useAppSelector(state => state.admin.userAsAdmin);
  const conversationId = useAppSelector(
    state => state.chat.activeConversationId,
  );
  const recipient = useAppSelector(state => state.chat.recipient);
  const messages = useAppSelector(state =>
    conversationId ? state.chat.conversations[conversationId] : [],
  );

  return (
    <DirectChatInner
      {...props}
      house={house || {}}
      guest={guest}
      guests={guests || {}}
      user={user}
      admins={admins || {}}
      userAsAdmin={userAsAdmin}
      messages={messages}
      conversationId={conversationId || ''}
      recipient={recipient}
      addDirectMessage={(
        messages: Message[],
        chatId: string,
        loading?: boolean,
      ) => {
        // Add each message to conversation
        messages.forEach(message => {
          dispatch(
            addMessageToConversation({ conversationId: chatId, message }),
          );
        });
      }}
      sendDirectMessage={async (
        conversationId: string,
        messages: DirectMessage[],
      ) => {
        // Send the first message (typically only one message per send)
        const message = messages[0];
        if (message) {
          await dispatch(
            sendDirectMessageThunk({
              conversationId,
              text: message.text,
              senderId: message.senderId || '',
              senderName: message.senderName,
              recipientId: message.recipientId || '',
              houseId: message.houseId,
            }),
          );
        }
      }}
      startConversation={(conversationId: string) =>
        dispatch(setActiveConversation(conversationId))
      }
      selectGuest={(id: string) =>
        dispatch(selectGuestThunk({ guestId: id, guests: guests || null }))
      }
      addChatMessage={(messages: Message[]) => {
        // Add each message to conversation
        messages.forEach(message => {
          dispatch(
            addMessageToConversation({
              conversationId: conversationId || '',
              message,
            }),
          );
        });
      }}
      sendChatMessage={async (houseId: string, messages: Message[]) => {
        // House chat functionality - send first message
        const message = messages[0];
        if (message) {
          await dispatch(
            sendDirectMessageThunk({
              conversationId: houseId,
              text: message.text,
              senderId: message.senderId || '',
              senderName: message.senderName || '',
              recipientId: message.recipientId || '',
              houseId: message.houseId || '',
            }),
          );
        }
      }}
      updateNavigationTitle={(title: string) => {
        // Navigation title update - keeping as-is for now
        dispatch({ type: 'UPDATE_TITLE', title } as any);
      }}
      markMessageRead={(conversationId: string, messageKey: string) =>
        dispatch(
          markMessagesAsRead({ conversationId, messageIds: [messageKey] }),
        )
      }
      conversations={{}}
    />
  );
};

export default DirectChat;
