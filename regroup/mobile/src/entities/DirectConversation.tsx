import { Message } from './Message';
export type { ChatParticipant } from './Message';

export class DirectMessage extends Message {
  message!: Message;
}

export class Conversations {
  [key: string]: DirectMessage[];
}
