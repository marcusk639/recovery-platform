import { BaseEntity } from './BaseEntity';

/**
 * Chat participant information
 */
export interface ChatParticipant {
  id: string;
  name?: string;
  avatar?: string;
  role?: 'admin' | 'guest';
  type?: 'admin' | 'guest';
}

/**
 * Message User (sender information for chat UI)
 */
export interface MessageUser {
  _id: string; // Kept as _id for react-native-gifted-chat compatibility
  name: string;
  avatar?: string;
}

/**
 * Message Entity
 * Represents a chat message in the system
 *
 * NOTE: This entity uses both `id` and `_id`:
 * - `id`: Firestore document ID (from BaseEntity)
 * - `_id`: Required by react-native-gifted-chat library
 * These are kept synchronized via getter/setter
 */
export class Message extends BaseEntity {
  // Chat library compatibility field
  _id: string = '';

  // Message content
  text: string = '';
  image?: string;

  // Context
  houseId: string = '';

  // Participants
  senderId?: string;
  senderName: string = '';
  recipientId?: string;
  guestId?: string;
  adminId?: string;
  participants?: ChatParticipant[];

  // User object for chat UI (react-native-gifted-chat)
  user: MessageUser = {
    _id: '',
    name: '',
    avatar: '',
  };

  // Metadata
  sortKey: number = Date.now(); // Numeric timestamp for sorting
  read: boolean = false;
  key?: string; // Legacy Firebase Realtime DB key

  /**
   * Constructor
   */
  constructor(
    text: string = '',
    senderId: string = '',
    senderName: string = '',
  ) {
    super();
    this.text = text;
    this.senderId = senderId;
    this.senderName = senderName;
    this.sortKey = Date.now();

    // Set user object for chat UI
    this.user = {
      _id: senderId,
      name: senderName,
      avatar: '',
    };

    // Synchronize _id with id
    this._id = this.id;
  }
}

/**
 * Type guard: Check if message is from admin
 */
export function isAdminMessage(message: Message): boolean {
  return !!message.adminId;
}

/**
 * Type guard: Check if message is from guest
 */
export function isGuestMessage(message: Message): boolean {
  return !!message.guestId;
}

/**
 * Type guard: Check if message is direct (has recipientId)
 */
export function isDirectMessage(message: Message): boolean {
  return !!message.recipientId;
}

/**
 * Type guard: Check if message is house-wide broadcast
 */
export function isHouseMessage(message: Message): boolean {
  return !message.recipientId && !!message.houseId;
}

/**
 * Helper: Create a Message from Firestore document
 */
export function createMessageFromFirestore(docId: string, data: any): Message {
  const message = new Message(data.text, data.senderId, data.senderName);
  message.id = docId;
  message._id = docId;
  message.houseId = data.houseId || '';
  message.recipientId = data.recipientId;
  message.guestId = data.guestId;
  message.adminId = data.adminId;
  message.image = data.image;
  message.read = data.read || false;
  message.participants = data.participants;

  // Handle timestamps
  if (data.sortKey) {
    message.sortKey =
      typeof data.sortKey === 'number'
        ? data.sortKey
        : parseInt(data.sortKey, 10);
  }

  if (data.createdAt) {
    message.createdAt = data.createdAt;
  }

  // Set user object
  message.user = {
    _id: data.senderId || data.user?._id || '',
    name: data.senderName || data.user?.name || '',
    avatar: data.user?.avatar || '',
  };

  return message;
}
