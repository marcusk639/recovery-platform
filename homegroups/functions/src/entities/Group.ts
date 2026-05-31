import { Meeting } from "./Meeting";
import * as admin from "firebase-admin"; // Import admin for Timestamp type

export interface TreasurySummary {
  balance: number;
  prudentReserve: number;
  monthlyIncome: number;
  monthlyExpenses: number;
  lastUpdated: Date;
}

export type TransactionType = "income" | "expense";

export interface Donation {
  userId: string;
  amount: number;
  createdAt: Date;
  paymentMethod: string;
  transactionId: string;
  status: "pending" | "completed" | "failed";
}

export interface Transaction {
  id: string;
  groupId: string;
  type: TransactionType;
  amount: number;
  description: string;
  category: string;
  createdBy: string;
  createdAt?: Date;
}

export interface Treasury {
  balance: number;
  prudentReserve: number;
  monthlyIncome: number;
  monthlyExpenses: number;
  summary: TreasurySummary;
  transactions: Transaction[];
}

export interface HomeGroup {
  id: string;
  name: string;
  description: string;
  location: string;
  address?: string;
  city?: string;
  state?: string;
  zip?: string;
  lat?: number;
  lng?: number;
  createdAt: admin.firestore.Timestamp | admin.firestore.FieldValue; // Allow FieldValue
  updatedAt: admin.firestore.Timestamp | admin.firestore.FieldValue; // Allow FieldValue
  foundedDate?: string;
  memberCount: number;
  admins: string[]; // Keep for backward compatibility
  isClaimed: boolean; // Flag to indicate if group has been claimed
  pendingAdminRequests?: {
    // Make optional to handle existing records
    uid: string;
    requestedAt: Date;
    message?: string;
  }[];
  treasurers: string[];
  placeName?: string;
  type: string;
  meetings: Meeting[];
  treasury: Treasury;
  stripeCustomerId?: string;
  stripeSubscriptionId?: string;
  subscriptionStatus?: string;
  stripeSubscriptionItemId?: string;
  stripePriceIdGroup?: string; // Group subscription price ID
  stripeProductIdGroup?: string; // Group subscription product ID
  publicProfileEnabled?: boolean; // default: true. Admin can set false to hide from public web page.
}
