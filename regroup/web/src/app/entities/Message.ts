import { BaseEntity } from './BaseEntity';

/**
 * Message entity
 * Implements react-native-gifted-chat's IMessage interface for ease of use
 */
export class Message extends BaseEntity {
  _id: any;
  houseId: string;
  text: string;
  createdAt: any;
  sortKey: string | number; // sort key for realtime database, so we can get messages back in descending order
  senderName: string;
  image?: string;
  guestId: string;
  adminId: string;
  read: boolean = false;
  key: string;
  user: {
    _id: any;
    name: string;
    avatar: string;
  };
}

// export interface User {
//    _id: any;
//    name?: string;
//    avatar?: string | renderFunction;
// }

// export interface IMessage {
//    _id: any;
//    text: string;
//    createdAt: Date | number;
//    user: User;
//    image?: string;
//    video?: string;
//    audio?: string;
//    system?: boolean;
//    sent?: boolean;
//    received?: boolean;
//    pending?: boolean;
//    quickReplies?: QuickReplies;
// }
