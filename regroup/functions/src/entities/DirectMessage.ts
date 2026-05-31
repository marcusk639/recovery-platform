import { Message } from './Message';

export class DirectMessage extends Message {
  id: string = '';
  participants: ChatParticipant[] = [];
  houseId: string = '';
  recipientId: string = '';
  senderId: string = '';
  senderName: string = '';
}

export interface ChatParticipant {
  type: 'admin' | 'guest';
  id: string;
}
