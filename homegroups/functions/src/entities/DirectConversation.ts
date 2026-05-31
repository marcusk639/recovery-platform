import {Message} from "./Message";

export class DirectConversation {
  id = "";
  participants: ChatParticipant[] = [];
  houseId = "";
  messages: Message[] = [];
}

export class ChatParticipant {
  type: "admin" | "guest" = "guest";
  id = "";
}
