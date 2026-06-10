import type { Timestamp } from 'firebase-admin/firestore';
import type { OriginatorAppId, TargetAppId } from '../config/apps';

// Stored values are canonical app-ids (see config/apps.ts). Display names and
// the legacy 'sober-living' alias are resolved away before persistence.
export interface Referral {
  fromApp: OriginatorAppId;
  toApp: TargetAppId;
  referredBy: string; // uid
  referredByApp: string; // appId — uid alone is ambiguous across projects
  clientName: string;
  clientEmail: string;
  condition?: string;
  notes?: string;
  status: 'pending' | 'accepted' | 'declined';
  createdAt: Timestamp;
  updatedAt?: Timestamp;
}
