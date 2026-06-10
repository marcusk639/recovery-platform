import type { Timestamp } from 'firebase-admin/firestore';
import type { OriginatorAppId } from '../config/apps';

export interface User {
  uid: string;
  appId: OriginatorAppId;
  email: string;
  displayName?: string;
  sobrietyDate?: string; // ISO date "YYYY-MM-DD"
  homeApp?: string;
  linkedProfileId?: string; // Phase 2: accountLinks doc reference
  createdAt: Timestamp;
  updatedAt: Timestamp;
}
