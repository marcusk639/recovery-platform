import type { Timestamp } from "firebase-admin/firestore";

export interface Referral {
  fromApp: "homegroups" | "sober-living";
  toApp:
    | "treatment-center"
    | "phoenix-cleanhouse"
    | "homegroups"
    | "sober-living";
  referredBy: string; // uid
  referredByApp: string; // appId — uid alone is ambiguous across projects
  clientName: string;
  clientEmail: string;
  condition?: string;
  notes?: string;
  status: "pending" | "accepted" | "declined";
  createdAt: Timestamp;
  updatedAt?: Timestamp;
}
