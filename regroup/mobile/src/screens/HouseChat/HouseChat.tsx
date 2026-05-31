// Phase 3.3: Migrated from 2 HOC layers to Context hooks
// Removed: withRats (unused), withPopover
// Added: useNotification hook
import React, { useState, useEffect, useCallback, useRef } from 'react';
import { Message } from '../../entities/Message';
import {
  subscribeToHouseChat,
  loadChat,
  sendMessageToHouseChat,
} from '../../services/message';
import RatsLoadingIndicator from '../../components/rats-loading-indicator/rats-loading-indicator';
import { Alert } from 'react-native';
import BaseChat, { ChatProps } from '../DirectChat/BaseChat';
import { useNotification } from '../../context';
import { useAppSelector, useAppDispatch } from '../../state/store';
import { useSelectedHouse } from '../../hooks/useSelectedHouse';
import { useSelectedGuest } from '../../hooks/useSelectedGuest';
import { addMessageToConversation } from '../../state/slices/chatSlice';
import { House } from '../../entities/House';

interface HouseChatProps {
  navigation?: any; // From navigation
}

/**
 * House Chat Screen
 *
 * Group chat for all members of a house (guests and admins).
 *
 * @migrated Phase 2.2 - Partially converted from old Redux to RTK
 * Changes:
 * - Removed unused old Redux imports (chatActions, navActions)
 * - Fixed import path: ../../state/hooks → ../../state/store
 * - Updated 5 selectors to use RTK state (removed 'as any' casts)
 * - NOTE: Chat actions not fully migrated - needs Redux thunks for sendChatMessage
 *
 * @migrated Phase 3.3 - Replaced HOCs with Context hooks
 * Changes:
 * - Removed 2 HOC layers (withRats unused, withPopover)
 * - Added useNotification hook for popover functionality
 * - NOTE: Component needs further refactoring for chat message handling
 */
const HouseChat: React.FC<HouseChatProps> = props => {
  // Context hooks (replaces withPopover)
  const { showPopover, setPopoverRef } = useNotification();
  const [loading, setLoading] = useState(true);
  // Hold the real Firestore unsubscribe function returned by
  // subscribeToHouseChat. Previously this was discarded and the cleanup
  // passed a no-op (() => {}), leaking a live snapshot listener on every
  // mount / houseId change.
  const unsubscribeRef = useRef<(() => void) | null>(null);

  const dispatch = useAppDispatch();
  const { house } = useSelectedHouse();
  const conversationId = house?.id;
  const messages = useAppSelector(state =>
    conversationId ? state.chat.conversations[conversationId] || [] : [],
  );
  const user = useAppSelector(state => state.user.user);
  const userAsAdmin = useAppSelector(state => state.admin.userAsAdmin);
  const { guest: selectedGuest } = useSelectedGuest();

  // Add chat message handler
  const addChatMessage = useCallback(
    (messages: Message[]) => {
      if (!house?.id) return;
      messages.forEach(message => {
        dispatch(
          addMessageToConversation({ conversationId: house.id, message }),
        );
      });
    },
    [dispatch, house?.id],
  );

  const loadMore = useCallback(
    async (messages: Message[]) => {
      if (!house?.id) return;
      const lastMessageId = messages[messages.length - 1]?.id;
      if (lastMessageId) {
        await loadChat(house.id, addChatMessage, lastMessageId);
      }
    },
    [house, addChatMessage],
  );

  // Consolidated lifecycle: one effect keyed on house?.id that tears
  // down any previous listener and starts a new one. Captures the real
  // Firestore unsubscribe function so the cleanup is effective.
  useEffect(() => {
    if (!house?.id) {
      return;
    }
    setLoading(true);
    unsubscribeRef.current?.();
    unsubscribeRef.current = subscribeToHouseChat(house.id, addChatMessage);
    setLoading(false);
    return () => {
      unsubscribeRef.current?.();
      unsubscribeRef.current = null;
    };
  }, [house?.id, addChatMessage]);

  const createMessage = useCallback(
    (text: string): Message => {
      const now = new Date();
      return {
        id: `${house?.id}_${now.getTime()}`,
        houseId: house?.id || '',
        guestId: user?.guestId,
        adminId: user?.adminId,
        text,
        senderId: user?.uid || '',
        user: {
          _id: user?.uid || '',
          name: `${user?.firstName || ''} ${user?.lastName || ''}`,
          avatar: user?.avatar,
        },
        createdAt: now,
        sortKey: now.getTime().toString(),
        read: false,
      } as any as Message;
    },
    [house, user],
  );

  const renderHelp = useCallback(() => {
    showPopover(
      'HOUSE CHAT',
      'Here you can chat with other members of the house.',
    );
  }, [showPopover]);

  const sendChatMessage = useCallback(
    async (houseId: string, messages: Message[]) => {
      const results = await sendMessageToHouseChat(houseId, messages);

      // Dispatch successfully written messages to local state
      results.forEach((result, index) => {
        if (result.status === 'fulfilled') {
          dispatch(
            addMessageToConversation({
              conversationId: houseId,
              message: messages[index],
            }),
          );
        }
      });

      // If every message failed to write, surface an error to the caller
      const allFailed = results.every(r => r.status === 'rejected');
      if (allFailed) {
        throw new Error('Failed to send messages to house chat');
      }
    },
    [dispatch],
  );

  const onSend = useCallback(
    async (text: string) => {
      if (!house?.id) return;
      const message = createMessage(text);
      try {
        await sendChatMessage(house.id, [message]);
      } catch (error) {
        Alert.alert(
          'Failed to send message! Check your network connection and try again.',
        );
      }
    },
    [house, createMessage, sendChatMessage],
  );

  if (loading || !house || !user) {
    return <RatsLoadingIndicator />;
  }

  // This component extends BaseChat in the original
  // For the migration, we're temporarily wrapping BaseChat
  // BaseChat itself needs to be migrated separately
  const baseChatProps: ChatProps = {
    house: house as House,
    guest: selectedGuest || ({} as any),
    guests: {},
    addDirectMessage: () => {},
    sendDirectMessage: () => {},
    startConversation: () => {},
    selectGuest: () => {},
    user: user as any,
    admins: {},
    userAsAdmin: userAsAdmin || ({} as any),
    recipient: {} as any,
    messages: messages,
    conversationId: house.id,
    addChatMessage: addChatMessage,
    sendChatMessage: sendChatMessage,
    updateNavigationTitle: () => {},
    markMessageRead: () => {},
    conversations: {},
    navigation: props.navigation,
    setRef: setPopoverRef,
    renderHelp: renderHelp,
    onSend: onSend,
    loadMore: loadMore,
  } as any;

  // Since BaseChat is still a class component, we need to create an instance
  // This is a temporary solution until BaseChat is migrated
  return <BaseChat {...baseChatProps} />;
};

export default HouseChat;
