import {
  onCall,
  CallableRequest,
  HttpsError,
} from "firebase-functions/v2/https";
import * as admin from "firebase-admin";
import { db } from "../utils/firebase";
import { requireAuth } from "../utils/callableWrapper";

interface ResponseData {
  requestId: string;
  response: string;
}

export const submitAdminRemovalResponse = onCall(
  async (
    request: CallableRequest<ResponseData>,
  ): Promise<{ success: boolean }> => {
    const { data } = request;
    const callerId = requireAuth(request);

    if (!data.requestId || !data.response?.trim()) {
      throw new HttpsError(
        "invalid-argument",
        "requestId and response are required.",
      );
    }

    const requestDoc = await db
      .collection("admin_removal_requests")
      .doc(data.requestId)
      .get();
    if (!requestDoc.exists)
      throw new HttpsError("not-found", "Request not found.");

    const removalData = requestDoc.data()!;
    if (callerId !== removalData.targetAdminId) {
      throw new HttpsError(
        "permission-denied",
        "Only the targeted admin can submit a response.",
      );
    }
    if (removalData.status !== "pending") {
      throw new HttpsError(
        "failed-precondition",
        "Cannot respond to a closed vote.",
      );
    }

    await requestDoc.ref.update({
      adminResponse: data.response.trim(),
      adminRespondedAt: admin.firestore.FieldValue.serverTimestamp(),
    });

    return { success: true };
  },
);
