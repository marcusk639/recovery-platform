import React, {
  useState,
  useEffect,
  useCallback,
  useRef,
  Fragment,
} from 'react';
import { Guest } from '../../entities/Guest';
import Admin from '../../entities/Admin';
import { Guests, Admins } from '../../types';
import { House } from '../../entities/House';
import { User } from '../../entities/User';
import { each, map } from 'lodash';
import {
  ROW,
  normalize,
  fontSize,
  color,
  CARD_STYLE,
  fontFamily,
  elevateStyle,
} from '../../styles/theme';
import { View, TouchableOpacity, TextStyle } from 'react-native';
import Collapsible from 'react-native-collapsible';
import RatsScrollView from '../../components/rats-scroll-view';
import ScreenHeader from '../../components/screen-header';
import { RatsIcon } from '../../components/rats-icon';
import RatsAvatar from '../../components/rats-avatar';
import { RatsText } from '../../components/rats-text';
import BoxedIcon from '../../components/rats-icon/boxed-icon';
import { callNumber } from '../../util/phone';
import { Routes, RootStackParamList } from '../../navigation/types';
import RatsSearchBar from '../../components/rats-search-bar';
// Phase 3.3: Migrated from 2 HOC layers to Context hooks
// Removed: withFormModal, withPopover
// Added: useModal, useNotification hooks
import { useModal, useNotification } from '../../context';
import { ContactFilterForm, ContactFilterFormValues } from './ContactForm';
import { IOS } from '../../util/platform';
import {
  subscribeToDirectChat,
  CHAT_ID,
  unsubscribeFromDirectChat,
} from '../../services/message';
import { Message } from '../../entities/Message';
import { Conversations } from '../../entities/DirectConversation';

import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useAppSelector, useAppDispatch } from '../../state/store';
import { useSelectedHouse } from '../../hooks/useSelectedHouse';
import { useGuests } from '../../state/queries/guestQueries';
import {
  setActiveConversation,
  setRecipient,
  addMessageToConversation,
} from '../../state/slices/chatSlice';

interface Props {
  navigation: NativeStackNavigationProp<RootStackParamList>;
}

/**
 * Contact Screen
 *
 * Displays house members (guests and admins) with chat and call functionality.
 *
 * @migrated Phase 2.2 - Converted from old Redux to RTK
 * Changes:
 * - Replaced old Redux actions with RTK thunks
 * - Added typed selectors (removed 9 'as any' casts)
 * - Kept HOCs (will be removed in Phase 3)
 */
const ContactScreen: React.FC<Props> = ({ navigation }) => {
  // Context hooks (replaces 2 HOC layers)
  const { showFormModal, dismissFormModal } = useModal();
  const { showPopover, setPopoverRef } = useNotification();
  const [collapsedUsers, setCollapsedUsers] = useState<{
    [id: string]: boolean;
  }>({});
  const [searchTerm, setSearchTermState] = useState('');
  const [filters, setFilters] = useState<ContactFilterFormValues>(
    new ContactFilterFormValues(),
  );

  const dispatch = useAppDispatch();

  // RTK Typed Selectors (no more 'as any')
  const user = useAppSelector(state => state.user.user);
  const { house } = useSelectedHouse();
  // React Query is the source of truth for guests; see .full-review [A2].
  const { data: guests = {} } = useGuests(house?.id ?? '');
  const admins = useAppSelector(state => state.admin.houseAdmins || {});
  const conversations = useAppSelector(state => state.chat.conversations);
  // Phase C removed the admin/guest async thunks that wrote to
  // state.admin.loading and state.guests.status, so those reads are
  // permanently falsy. Since both participant lists now come directly
  // from Redux selectors that are already populated synchronously
  // (no async fetch on this screen), treat this as "not requesting"
  // — the loading branch was always a no-op after Phase C.
  const requestingChatParticipants = false;
  const loggingOut = useAppSelector(state => state.user.loggingOut);

  // Redux actions
  const addDirectMessage = useCallback(
    (messages: Message[], chatId: string) => {
      messages.forEach(message => {
        dispatch(addMessageToConversation({ conversationId: chatId, message }));
      });
    },
    [dispatch],
  );

  const startConversation = useCallback(
    (conversationId: string) => {
      dispatch(setActiveConversation(conversationId));
    },
    [dispatch],
  );

  const setChatRecipient = useCallback(
    (recipient: Guest | Admin) => {
      dispatch(setRecipient(recipient));
    },
    [dispatch],
  );

  // Hold every Firestore unsubscribe function returned by
  // subscribeToDirectChat. Previously these were discarded and the
  // "unsubscribeAll" call passed a no-op, leaking N + M listeners
  // per house mount (one per guest + one per admin). Store the real
  // unsubscribes in a ref so cleanup actually closes them.
  const unsubscribesRef = useRef<Array<() => void>>([]);

  const initializeChatListeners = useCallback(() => {
    if (!user) return;
    const userParticipantId = user.adminId || user.guestId;
    if (!userParticipantId) return;
    const subs: Array<() => void> = [];
    each(guests, guest => {
      subs.push(
        subscribeToDirectChat(
          [userParticipantId, guest.id],
          (messages: Message[], chatId?: string) => {
            if (chatId) {
              addDirectMessage(messages, chatId);
            }
          },
        ),
      );
    });
    each(admins, admin => {
      subs.push(
        subscribeToDirectChat(
          [userParticipantId, admin.id],
          (messages: Message[], chatId?: string) => {
            if (chatId) {
              addDirectMessage(messages, chatId);
            }
          },
        ),
      );
    });
    unsubscribesRef.current = subs;
  }, [user, guests, admins, addDirectMessage]);

  const unsubscribeAll = useCallback(() => {
    unsubscribesRef.current.forEach(unsub => {
      // Defensive: old or mocked subscribe paths may not return a
      // function — don't throw during cleanup.
      if (typeof unsub === 'function') {
        unsub();
      }
    });
    unsubscribesRef.current = [];
  }, []);

  useEffect(() => {
    // Drop the loading flag from the dep array — it toggles once on load
    // and would otherwise cause a re-subscription cycle.
    initializeChatListeners();
    return () => {
      unsubscribeAll();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [house?.id, initializeChatListeners]);

  const toggleCollapsible = useCallback(
    (user: Guest | Admin) => () => {
      setCollapsedUsers(prevState => {
        const newCollapsedUsers: { [id: string]: boolean } = {};
        Object.keys(prevState).forEach(key => {
          if (prevState[key] && key !== user.id) {
            newCollapsedUsers[key] = false;
          }
        });
        newCollapsedUsers[user.id] =
          prevState[user.id] === undefined ||
          prevState[user.id] === null ||
          prevState[user.id] === true
            ? false
            : true;
        return newCollapsedUsers;
      });
    },
    [],
  );

  const latestMessage = useCallback(
    (_user: Guest | Admin) => {
      if (!user) return undefined;
      const userParticipantId = user.adminId || user.guestId;
      if (!userParticipantId) return undefined;
      const id = CHAT_ID([_user.id, userParticipantId]);
      if (conversations && conversations[id]) {
        const messages = conversations[id];
        if (messages && messages[0]) {
          return messages[0];
        }
      }
    },
    [conversations, user],
  );

  const renderAvatarItem = (user: Guest | Admin, type: 'Guest' | 'Admin') => {
    const message = latestMessage(user);
    const isFromUser = message ? message.senderId === user.uid : false;
    const read = message ? message.read : true;
    const text = (message && message.text) || 'No messages...';
    const { firstName, lastName } = user;
    return (
      <View style={[ROW]}>
        <RatsAvatar
          name={firstName + ' ' + lastName}
          style={{
            height: normalize(45),
            width: normalize(45),
            borderRadius: IOS ? normalize(22) : normalize(45),
            marginRight: normalize(15),
          }}
          source={{ uri: user.avatar }}
          resizeMethod="resize"
          resizeMode="cover"
        />
        <View style={{ width: '85%' }}>
          <RatsText
            text={firstName + ' ' + lastName}
            translate={false}
            style={{
              fontSize: fontSize.medium,
              fontFamily:
                read || isFromUser ? fontFamily.roboto : fontFamily.bold,
            }}
          />
          <RatsText
            text={text}
            translate={false}
            style={{
              fontSize: fontSize.regular,
              color: color.dark_grey,
              fontFamily:
                read || isFromUser ? fontFamily.roboto : fontFamily.bold,
              width: '95%',
            }}
            {...({ numberOfLines: 1 } as any)}
          />
        </View>
      </View>
    );
  };

  const renderContent = (_user: Guest | Admin) => {
    if (!user) return null;
    const userParticipantId = user.adminId || user.guestId;
    if (!userParticipantId) return null;
    const container = {
      marginRight: normalize(10),
      height: normalize(40),
      width: normalize(40),
    };
    const iconSize = normalize(20);
    return (
      <View style={[ROW]}>
        <BoxedIcon
          iconSize={iconSize}
          onPress={() => callNumber(_user.phoneNumber ?? '')}
          container={container}
          name="phone"
          backgroundColor={color.green}
        />
        <BoxedIcon
          iconSize={iconSize}
          onPress={() => {
            setChatRecipient(_user);
            startConversation(CHAT_ID([userParticipantId, _user.id]));
            navigation.navigate(Routes.DirectMessage);
          }}
          container={container}
          name="comment"
          backgroundColor={color.cobalt}
        />
      </View>
    );
  };

  const shouldShowUser = useCallback(
    (user: Guest | Admin) => {
      if (filters.type === 'all') {
        return true;
      }
      if (filters.type === 'admin') {
        return user instanceof Admin;
      }
      if (filters.type === 'guest') {
        return user instanceof Guest;
      }
      if (filters.type === 'operator') {
        return user instanceof Admin && user.superAdmin;
      }
    },
    [filters],
  );

  const renderUserCollapsible = (_user: Guest | Admin) => {
    if (!user) return null;
    const userParticipantId = user.adminId || user.guestId;
    if (!userParticipantId) return null;
    return (
      <View
        key={_user.id}
        style={[ROW, CARD_STYLE, { marginBottom: 1, padding: normalize(15) }]}>
        <View>
          <TouchableOpacity
            onPress={() => {
              setChatRecipient(_user);
              startConversation(CHAT_ID([userParticipantId, _user.id]));
              navigation.navigate(Routes.DirectMessage);
            }}>
            {renderAvatarItem(_user, (_user as any).phase ? 'Guest' : 'Admin')}
          </TouchableOpacity>
          <Collapsible
            style={{
              marginLeft: normalize(60),
              paddingTop: normalize(10),
              flex: 1,
            }}
            collapsed={collapsedUsers[_user.id]}>
            {renderContent(_user)}
          </Collapsible>
        </View>
      </View>
    );
  };

  const renderCollapsibles = () => {
    const Collapsibles: JSX.Element[] = [];
    const HEADER: TextStyle = {
      fontSize: fontSize.regular,
      fontFamily: fontFamily.bold,
      color: color.dark_grey,
      padding: normalize(15),
    };
    Collapsibles.push(
      <Fragment key={1}>
        <RatsText text="ADMIN" style={HEADER} />
        {map(admins, admin => {
          return shouldShowUser(admin) && renderUserCollapsible(admin);
        })}
      </Fragment>,
    );
    Collapsibles.push(
      <Fragment key={2}>
        <RatsText text="GUEST" style={HEADER} />
        {map(guests, guest => {
          return shouldShowUser(guest) && renderUserCollapsible(guest);
        })}
      </Fragment>,
    );
    return Collapsibles;
  };

  const setSearchTerm = useCallback((searchTerm: string) => {
    setSearchTermState(searchTerm);
  }, []);

  const setSearchFilters = useCallback((filters: ContactFilterFormValues) => {
    setFilters(filters);
  }, []);

  const openFilters = useCallback(() => {
    showFormModal(
      <ContactFilterForm
        dismissModal={dismissFormModal}
        setSearchFilters={setSearchFilters}
        filters={filters}
      />,
    );
  }, [showFormModal, dismissFormModal, setSearchFilters, filters]);

  const executeSearch = useCallback(() => {}, []);

  const renderSearch = () => {
    return (
      <RatsSearchBar
        container={{ marginBottom: 5 }}
        onSubmitEditing={executeSearch}
        value={searchTerm}
        onChangeText={setSearchTerm}
        onFilter={openFilters}
        placeholder="Search contacts..."
      />
    );
  };

  const renderHelp = useCallback(() => {
    showPopover(
      'HOUSE MEMBERS',
      'Here you can view a list of house administrators and residents. Select someone to begin chatting with them.',
    );
  }, [showPopover]);

  if (loggingOut || !user || !house) {
    return null;
  }

  return (
    <View style={{ flex: 1, backgroundColor: color.light_grey }}>
      <ScreenHeader
        container={{ marginBottom: 1, ...elevateStyle }}
        icon={
          <TouchableOpacity
            ref={ref => setPopoverRef(ref)}
            onPress={renderHelp}>
            <RatsIcon
              name="question-circle"
              solid
              size={30}
              style={{ color: color.baby_blue }}
            />
          </TouchableOpacity>
        }
        header="House Members"
      />
      <RatsScrollView contentContainerStyle={{}}>
        {renderCollapsibles()}
      </RatsScrollView>
    </View>
  );
};

export default ContactScreen;
