import type { Timestamp } from 'firebase-admin/firestore';

// Stored values are canonical app-ids (see config/apps.ts). Display names and
// the legacy 'sober-living' alias are resolved away before persistence.
export interface Referral {
  fromApp: 'homegroups' | 'phoenix-cleanhouse' | 'nextstep-recovery';
  toApp: 'homegroups' | 'phoenix-cleanhouse' | 'nextstep-recovery' | 'treatment-center';
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
