import {FirebaseFirestoreTypes} from '@react-native-firebase/firestore';

export interface GroupMemberDocument {
  groupId: string;
  userId: string;
  displayName: string;
  email?: string;
  photoURL?: string;
  isAdmin: boolean;
  isTreasurer: boolean; // Denormalized treasurer status for efficient rule checks
  roles: string[]; // Flexible role list ["admin", "treasurer", "secretary", "member"]
  position?: string;
  sobrietyDate?: FirebaseFirestoreTypes.Timestamp;
  phoneNumber?: string;
  showSobrietyDate: boolean;
  showPhoneNumber: boolean;
  joinedAt: FirebaseFirestoreTypes.Timestamp;
}
