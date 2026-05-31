import { Message } from './Message';

export class DirectMessage extends Message {
  id: string = '';
  participants: ChatParticipant[] = [];
  houseId: string = '';
  message: Message;
  recipientId: string = '';
  senderId: string = '';
  senderName: string = '';
}

export class ChatParticipant {
  type: 'admin' | 'guest';
  id: string;
}

export class Conversations {
  [key: string]: DirectMessage[];
}
