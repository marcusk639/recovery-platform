import {Message} from "./Message";

export class DirectMessage extends Message {
  id = "";
  participants: ChatParticipant[] = [];
  houseId = "";
  recipientId = "";
  senderId = "";
  message?: Message;
  senderName = "";
}

export class ChatParticipant {
  type: "admin" | "guest" = "guest";
  id = "";
}
