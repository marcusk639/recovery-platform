import { Message } from './Message';
import { ChatParticipant } from './DirectMessage';

export interface DirectConversation {
  id: string;
  participants: ChatParticipant[];
  houseId: string;
  messages: Message[];
}
