import type { Timestamp } from "firebase-admin/firestore";

export interface User {
  uid: string;
  appId: "homegroups" | "sober-living";
  email: string;
  displayName?: string;
  sobrietyDate?: string; // ISO date "YYYY-MM-DD"
  homeApp?: string;
  linkedProfileId?: string; // Phase 2: accountLinks doc reference
  createdAt: Timestamp;
  updatedAt: Timestamp;
}
