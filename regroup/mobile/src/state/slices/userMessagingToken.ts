import { createAsyncThunk } from "@reduxjs/toolkit";
import { User } from "../../entities/User";
import * as messagingTokenService from "../../services/messagingToken";

/**
 * Saves this device's FCM token for the user. The write adds to the stored
 * array (see services/messagingToken.ts), so it never drops a token another
 * device saved. userSlice adds the token to the app's copy of the user once
 * the write lands.
 */
export const addMessagingToken = createAsyncThunk(
  "user/addMessagingToken",
  async ({ user, token }: { user: User; token: string }) => {
    await messagingTokenService.addMessagingToken(user.id, token);
    return token;
  },
);
