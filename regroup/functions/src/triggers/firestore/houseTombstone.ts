import { onDocumentDeleted } from "firebase-functions/v2/firestore";
import { houseTombstoneCollection } from "../../api/firestore";

/**
 * Records a tombstone when a house is deleted so createHouses can never mint a
 * fresh house (and superAdmin on it) under a deleted id. houseTombstones has no
 * client rule, so it is server-only (default deny).
 */
export const onHouseDeleted = onDocumentDeleted(
  "/houses/{houseId}",
  async (event) => {
    await houseTombstoneCollection
      .doc(event.params.houseId)
      .set({ deletedAt: new Date().toISOString() });
  },
);
