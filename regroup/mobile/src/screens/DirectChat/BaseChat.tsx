import React, { useCallback, Fragment } from 'react';
import {
  View,
  TouchableOpacity,
  ViewStyle,
  TextInput,
  Dimensions,
} from 'react-native';
import {
  color,
  normalize,
  fontSize,
  elevateStyle,
  ROW,
  fontFamily,
  CARD_STYLE,
  CENTER,
} from '../../styles/theme';
import RatsButton from '../../components/rats-button/rats-button';
import { RatsIcon } from '../../components/rats-icon';
import RatsAvatar from '../../components/rats-avatar';
import { RatsText } from '../../components/rats-text';
import { Icon } from '../../components/rats-icon';
import { dateAndTime } from '../../util/display';
import { toDateSafe } from '../../util/firestore';
import { Message } from '../../entities/Message';
import { House } from '../../entities/House';
import { Guest } from '../../entities/Guest';
import { Guests, Admins } from '../../types';
import {
  DirectMessage,
  Conversations,
} from '../../entities/DirectConversation';
import Admin from '../../entities/Admin';
import { User } from '../../entities/User';
import { IOS, tabBarHeight } from '../../util/platform';
import { getBottomSpace } from 'react-native-iphone-x-helper';
import { SafeAreaView } from 'react-native-safe-area-context';
import { KeyboardAwareFlatList } from 'react-native-keyboard-aware-scroll-view';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { Routes, RootStackParamList } from '../../navigation/types';
// Phase 4.1: Extracted business logic to useChatLogic hook
import { useChatLogic } from './hooks/useChatLogic';

/**
 * Base Chat Props Interface
 *
 * @migrated Phase 2.2 - Converted from old Redux to RTK
 * Changes:
 * - Removed old Redux action type references
 * - Updated to use generic function types (compatible with RTK)
 */
export interface ChatProps {
  house: House;
  guest: Guest;
  guests: Guests;
  addDirectMessage: (
    messages: Message[],
    chatId: string,
    loading?: boolean,
  ) => any;
  sendDirectMessage: (conversationId: string, messages: DirectMessage[]) => any;
  startConversation: (conversationId: string) => any;
  selectGuest: (id: string, state?: any) => any;
  user: User;
  admins: Admins;
  userAsAdmin: Admin;
  recipient: Guest | Admin;
  messages: DirectMessage[] | Message[];
  conversationId: string;
  addChatMessage: (messages: Message[]) => any;
  sendChatMessage: (houseId: string, messages: Message[]) => any;
  updateNavigationTitle: (title: string) => any;
  markMessageRead: (conversationId: string, messageKey: string) => any;
  conversations: Conversations;
  navigation: NativeStackNavigationProp<RootStackParamList>;
  setRef?: (ref: any) => void;
  onSend?: (text: string) => any;
  loadMore?: (messages: Message[]) => any;
  renderHelp?: () => void;
  chatType?: 'direct' | 'group';
}

const { height, width } = Dimensions.get('window');

/**
 * Base Chat Component
 *
 * Reusable chat UI component for both direct messages and group chat.
 * Receives props from parent components that handle Redux state.
 *
 * @migrated Phase 2.2 - Converted prop types from old Redux to RTK-compatible
 * Changes:
 * - Removed old Redux action imports (chatActions, guestActions, navActions)
 * - Updated ChatProps interface to use generic function types
 * - No direct Redux usage in this component (props-based)
 *
 * @migrated Phase 4.1 - Extracted business logic to useChatLogic hook
 * Changes:
 * - Extracted keyboard management, message handling, navigation logic
 * - Component now focuses on rendering UI
 */
const BaseChat: React.FC<ChatProps> = props => {
  const {
    navigation,
    setRef,
    user,
    house,
    recipient,
    guests,
    admins,
    selectGuest,
    messages: propMessages,
    chatType: propChatType,
    onSend: propOnSend,
    loadMore: propLoadMore,
    renderHelp: propRenderHelp,
  } = props;

  // Use custom hook for keyboard management and navigation logic
  const chatLogic = useChatLogic({
    navigation,
    user,
    house,
    recipient,
    selectGuest,
  });

  const {
    keyboard,
    keyboardHeight,
    text,
    setMessage,
    dialNumber,
    navigateToGuest,
  } = chatLogic;

  // Use parent-provided callbacks if available, otherwise fallback to hook
  const onSend = useCallback(
    (messageText: string) => {
      if (propOnSend) {
        propOnSend(messageText);
      }
    },
    [propOnSend],
  );

  const loadMore = useCallback(
    (messages: Message[]) => {
      if (propLoadMore) {
        propLoadMore(messages);
      }
    },
    [propLoadMore],
  );

  const renderHeader = useCallback(
    (chatType: 'group' | 'direct') => {
      const name = recipient
        ? recipient.firstName + ' ' + recipient.lastName
        : house.name;
      const recipientIsAdmin = chatType === 'direct' && admins[recipient.id!];
      const avatar = recipient ? recipient.avatar : house.avatar;
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
            {chatType !== 'group' && (
              <TouchableOpacity
                onPress={() => navigation.goBack()}
                style={{ marginRight: normalize(15) }}>
                <RatsIcon
                  name="arrow-left"
                  size={fontSize.large}
                  style={{ color: color.baby_blue }}
                />
              </TouchableOpacity>
            )}
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
              {chatType === 'direct' && (
                <Fragment>
                  <TouchableOpacity
                    style={{
                      paddingRight: !recipientIsAdmin ? normalize(20) : 0,
                    }}
                    onPress={() => dialNumber(recipient.phoneNumber || '')}>
                    <Icon
                      style={{ color: color.baby_blue }}
                      name="phone"
                      size={normalize(25)}
                    />
                  </TouchableOpacity>
                  {!recipientIsAdmin && (
                    <TouchableOpacity
                      onPress={() => navigateToGuest(recipient.id!)}>
                      <Icon
                        solid
                        style={{ color: color.baby_blue }}
                        name="info-circle"
                        size={normalize(25)}
                      />
                    </TouchableOpacity>
                  )}
                </Fragment>
              )}
              {chatType === 'group' && (
                <TouchableOpacity
                  ref={ref => (setRef ? setRef(ref) : null)}
                  onPress={renderHelp}>
                  <RatsIcon
                    name="question-circle"
                    solid
                    size={30}
                    style={{ color: color.baby_blue }}
                  />
                </TouchableOpacity>
              )}
            </View>
          </View>
        </View>
      );
    },
    [
      recipient,
      house,
      admins,
      navigation,
      dialNumber,
      navigateToGuest,
      setRef,
      propRenderHelp,
    ],
  );

  const renderHelp = useCallback(() => {
    if (propRenderHelp) {
      propRenderHelp();
    }
  }, [propRenderHelp]);

  const renderAvatar = useCallback((avatarUrl: string, name: string) => {
    if (!avatarUrl) {
      return null;
    }
    return (
      <RatsAvatar
        name={name}
        style={{
          height: normalize(20),
          width: normalize(20),
          borderRadius: normalize(45),
          marginRight: normalize(7),
        }}
        source={{ uri: avatarUrl }}
        resizeMethod="resize"
        resizeMode="cover"
      />
    );
  }, []);

  const renderActionButton = useCallback((iconName: string) => {
    const ACTION_BUTTON_STYLE: ViewStyle = {
      height: normalize(35),
      width: normalize(35),
      borderColor: color.chat_blue,
      borderWidth: 1,
      borderRadius: 5,
      justifyContent: 'center',
      alignItems: 'center',
      marginRight: normalize(7),
    };
    return (
      <TouchableOpacity
        disabled
        style={[ACTION_BUTTON_STYLE, { opacity: 0.2 }]}
        onPress={() => null}>
        <RatsIcon
          name={iconName}
          size={20}
          style={{ color: color.chat_blue }}
        />
      </TouchableOpacity>
    );
  }, []);

  const renderMessage = useCallback(
    (message: Message, chatType: 'direct' | 'group') => {
      const currentMessage = message;
      const messageIsFromThisUser =
        user && currentMessage?.user?._id === user.uid;
      const CONTAINER: ViewStyle = {
        width: '60%',
        marginHorizontal: normalize(15),
        marginBottom: normalize(10),
        alignSelf: messageIsFromThisUser ? 'flex-end' : 'flex-start',
      };
      const MESSAGE_CONTAINER: ViewStyle = {
        padding: normalize(10),
        borderRadius: 5,
        backgroundColor: messageIsFromThisUser ? color.chat_blue : color.white,
        marginBottom: normalize(5),
      };
      const name = currentMessage.user.name.split(' ');
      const firstName = name.length ? name[0] : 'Unknown';
      const lastInitial = name.length > 1 && name[1][0] ? name[1][0] : '';
      return (
        <View style={CONTAINER}>
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
              alignSelf: messageIsFromThisUser ? 'flex-end' : 'flex-start',
            }}>
            {!messageIsFromThisUser && (
              <Fragment>
                {renderAvatar(
                  currentMessage.user.avatar as string,
                  currentMessage.user.name,
                )}
                {chatType === 'group' && (
                  <RatsText
                    translate={false}
                    text={firstName + ' ' + lastInitial}
                    style={{
                      color: color.dark_grey,
                      marginRight: normalize(5),
                    }}
                  />
                )}
              </Fragment>
            )}
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
    [user, renderAvatar],
  );

  const renderChatUI = useCallback(
    (messages: Message[], chatType: 'direct' | 'group') => {
      const inputViewHeight = normalize(50);

      const calculateInputOffset = () => {
        if (!keyboard || keyboardHeight <= 0) return 0;

        let offset = inputViewHeight;

        if (IOS) {
          if (chatType === 'direct') {
            offset += getBottomSpace();
            offset += normalize(55);
          } else {
            offset += normalize(tabBarHeight());
            offset += normalize(5);
          }
        } else {
          offset += normalize(chatType === 'direct' ? 55 : 75);
        }

        return offset;
      };

      return (
        <View style={{ flex: 1, backgroundColor: color.light_grey }}>
          <KeyboardAwareFlatList
            style={{
              marginBottom:
                keyboard && keyboardHeight > 0 ? 0 : inputViewHeight,
            }}
            contentContainerStyle={{
              flexGrow: 1,
              paddingTop:
                keyboard && keyboardHeight > 0
                  ? 0 + keyboardHeight - normalize(55)
                  : 0,
              paddingBottom: 0,
            }}
            data={messages}
            renderItem={info => renderMessage(info.item, chatType)}
            keyboardShouldPersistTaps="handled"
            removeClippedSubviews={false}
            initialNumToRender={5}
            maxToRenderPerBatch={1}
            updateCellsBatchingPeriod={100}
            windowSize={7}
            inverted
            onEndReachedThreshold={0.25}
            onEndReached={() => loadMore(messages)}
            extraScrollHeight={
              keyboard && keyboardHeight > 0 ? keyboardHeight : normalize(30)
            }
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
              transform:
                keyboard && keyboardHeight > 0
                  ? [{ translateY: -keyboardHeight + calculateInputOffset() }]
                  : [],
            }}>
            <View style={[ROW, { flex: 1, justifyContent: 'space-between' }]}>
              <TextInput
                placeholder="Type a message"
                placeholderTextColor={color.grey}
                multiline
                onChangeText={setMessage}
                style={[
                  {
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
                  },
                ]}
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
      );
    },
    [
      keyboard,
      keyboardHeight,
      text,
      setMessage,
      onSend,
      renderMessage,
      loadMore,
    ],
  );

  const renderChatView = useCallback(
    (messages: Message[], chatType: 'direct' | 'group') => {
      return (
        <SafeAreaView
          edges={['bottom']}
          style={{ backgroundColor: color.white, flex: 1 }}>
          {renderHeader(chatType)}
          {renderChatUI(messages, chatType)}
        </SafeAreaView>
      );
    },
    [renderHeader, renderChatUI],
  );

  const messages = (propMessages || []) as Message[];
  const chatType = propChatType || (recipient ? 'direct' : 'group');

  return renderChatView(messages, chatType);
};

export default BaseChat;
