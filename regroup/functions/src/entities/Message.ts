import { BaseEntity } from './BaseEntity';

/**
 * Message entity
 * Implements react-native-gifted-chat's IMessage interface for ease of use
 */
export class Message extends BaseEntity {
  _id: string | number = '';
  houseId: string = '';
  text: string = '';
  createdAt: Date | number = 0;
  senderName: string = '';
  image?: string;
  user: {
    _id: string | number;
    name: string;
    avatar: string;
  } = {
    _id: '',
    name: '',
    avatar: ''
  };
}
