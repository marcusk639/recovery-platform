/**
 * Base Entity
 * All entities should extend this class for consistent field patterns
 */
export class BaseEntity {
  /**
   * Unique identifier for this entity
   * Required field - all entities must have an ID
   */
  id: string = '';

  /**
   * ISO 8601 timestamp when entity was created
   * Example: "2026-02-04T10:30:00.000Z"
   */
  createdAt: string = new Date().toISOString();

  /**
   * ISO 8601 timestamp when entity was last updated
   * Example: "2026-02-04T10:30:00.000Z"
   */
  updatedAt: string = new Date().toISOString();

  /**
   * User ID who created this entity (for audit trail)
   * Optional - not all entities track creator
   */
  createdBy?: string;

  /**
   * User ID who last updated this entity (for audit trail)
   * Optional - not all entities track updater
   */
  updatedBy?: string;

  // --- Legacy fields for backward compatibility ---
  // TODO: Phase these out after full migration

  /**
   * @deprecated Use id instead
   * Some entities use uid for Firebase Auth user ID
   */
  uid?: string;

  /**
   * @deprecated Use createdAt instead
   * Legacy timestamp field (mixed number/string)
   */
  createdDate?: number | string;

  /**
   * @deprecated Use updatedAt instead
   * Legacy timestamp field (mixed number/string)
   */
  modifiedDate?: number | string;

  /**
   * Helper: Get current time as ISO string
   */
  protected static getCurrentTime(): string {
    return new Date().toISOString();
  }

  /**
   * Helper: Convert legacy timestamp to ISO string
   */
  protected static normalizeLegacyTimestamp(timestamp?: number | string): string {
    if (!timestamp) {
      return new Date().toISOString();
    }

    if (typeof timestamp === 'string') {
      // Already a string, try to parse and re-format
      const date = new Date(timestamp);
      return isNaN(date.getTime()) ? new Date().toISOString() : date.toISOString();
    }

    // Number timestamp
    return new Date(timestamp).toISOString();
  }
}
