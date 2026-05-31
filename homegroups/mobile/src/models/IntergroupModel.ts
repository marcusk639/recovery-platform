import {IntergroupDocument} from '../types/schema';

/**
 * Domain-level `Intergroup` type as exposed to the app layer. Mirrors
 * `IntergroupDocument` but with the `id` ensured as a top-level field.
 *
 * NOTE: Stub — most reads currently go through `intergroupSlice` thunks. This
 * model is the future home for direct Firestore access following the same
 * static-class pattern as `GroupModel`.
 */
export type Intergroup = IntergroupDocument;

/**
 * Intergroup model — Firestore data access for the `intergroups` collection.
 *
 * Stub class: methods are placeholders to centralize the interface. Callers
 * should migrate from inline Firestore queries / callable wrappers onto these
 * methods over time.
 */
export class IntergroupModel {
  /**
   * Get an intergroup by ID.
   * @param intergroupId Document ID under the `intergroups` collection.
   * @returns The intergroup, or null if not found.
   */
  // TODO: implement — fetch `intergroups/{intergroupId}` and convert document.
  static async getIntergroup(intergroupId: string): Promise<Intergroup | null> {
    // TODO: implement
    return null;
  }

  /**
   * Get all intergroups the given user is a member or admin of.
   * @param userId Firebase Auth UID.
   * @returns Array of intergroups the user belongs to. Empty if none.
   */
  // TODO: implement — query `intergroups` where `adminUids` contains userId,
  // and/or scan `intergroups/{id}/members/{userId}` membership docs.
  static async getMyIntergroups(userId: string): Promise<Intergroup[]> {
    // TODO: implement
    return [];
  }
}
