/**
 * Types for Treasurer Handoff Flow
 *
 * The handoff flow allows treasurers to formally transfer their role
 * to another member with an audit trail, transition notes, and balance confirmation.
 */

/**
 * Status of a treasurer handoff request
 */
export type HandoffStatus =
  | 'pending' // Waiting for new treasurer to accept
  | 'accepted' // New treasurer accepted, waiting for current treasurer to confirm
  | 'completed' // Handoff finalized, roles transferred
  | 'rejected' // New treasurer declined
  | 'cancelled'; // Current treasurer cancelled before acceptance

/**
 * Treasurer Handoff record
 */
export interface TreasurerHandoff {
  id: string;
  groupId: string;
  positionId: string; // Reference to service_positions document

  // Outgoing treasurer
  previousTreasurerId: string;
  previousTreasurerName: string;

  // Incoming treasurer
  newTreasurerId: string;
  newTreasurerName: string;

  // Financial snapshot at handoff initiation
  balanceAtHandoff: number;
  prudentReserveAtHandoff: number;

  // Transition details
  transitionNotes?: string;
  rejectionReason?: string;

  // Status
  status: HandoffStatus;

  // Timestamps
  createdAt: Date;
  acceptedAt?: Date;
  completedAt?: Date;
  rejectedAt?: Date;
  cancelledAt?: Date;
}

/**
 * Data required to initiate a handoff
 */
export interface InitiateHandoffData {
  groupId: string;
  positionId: string;
  newTreasurerId: string;
  newTreasurerName: string;
  transitionNotes?: string;
}

/**
 * Summary of a handoff for display in lists
 */
export interface HandoffSummary {
  id: string;
  groupId: string;
  previousTreasurerName: string;
  newTreasurerName: string;
  balanceAtHandoff: number;
  status: HandoffStatus;
  createdAt: Date;
  completedAt?: Date;
}
