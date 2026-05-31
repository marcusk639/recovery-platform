import {BaseEntity} from "./BaseEntity";

/**
 * Message entity
 * Implements react-native-gifted-chat's IMessage interface for ease of use
 */
export class Message extends BaseEntity {
  _id: any;
  houseId = "";
  text = "";
  createdAt: any;
  senderName = "";
  image?: string;
  user: {
    _id: any;
    name: string;
    avatar: string;
  } = {
      _id: "",
      name: "",
      avatar: "",
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
