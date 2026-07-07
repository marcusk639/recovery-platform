export {}; // Ensure isolated module

jest.mock("firebase-functions", () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn() },
}));

jest.mock("firebase-functions/v1", () => ({
  firestore: {
    document: (path: string) => ({
      onCreate: (handler: any) => handler,
    }),
  },
}));

const mockSendEachForMulticast = jest
  .fn()
  .mockResolvedValue({ successCount: 0, failureCount: 0 });
const mockCollection = jest.fn();

jest.mock("../utils/firebase", () => ({
  db: { collection: mockCollection },
  messaging: { sendEachForMulticast: mockSendEachForMulticast },
}));

import { onMemberCreate } from "../triggers/firestore/onMemberCreate";

function makeUserDoc(id: string, fcmTokens: string[] = ["tok"]) {
  return {
    exists: true,
    id,
    data: () => ({
      fcmTokens,
      notificationSettings: {
        allowPushNotifications: true,
        newMemberNotifications: true,
      },
    }),
  };
}

describe("onMemberCreate — batched FCM token lookup", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockSendEachForMulticast.mockResolvedValue({
      successCount: 0,
      failureCount: 0,
    });
  });

  it("batches user lookups in groups of 10 via 'in' queries instead of one get() per member", async () => {
    // 25 existing members + the new joining member = 26 member docs.
    const memberDocs = Array.from({ length: 26 }, (_, i) => ({
      data: () => ({ userId: `user-${i}`, groupId: "group-1" }),
    }));
    const membersGet = jest.fn().mockResolvedValue({
      size: 26,
      docs: memberDocs,
    });
    const usersWhereGet = jest.fn().mockResolvedValue({ docs: [] });

    mockCollection.mockImplementation((name: string) => {
      if (name === "groups") {
        return {
          doc: () => ({
            get: jest.fn().mockResolvedValue({
              exists: true,
              data: () => ({ name: "Test Group" }),
            }),
          }),
        };
      }
      if (name === "members") {
        return { where: () => ({ get: membersGet }) };
      }
      if (name === "users") {
        return { where: () => ({ get: usersWhereGet }) };
      }
      throw new Error(`Unexpected collection: ${name}`);
    });

    const snap = { data: () => ({ userId: "user-0", groupId: "group-1" }) };
    const context = { params: { memberId: "group-1_user-0" } };

    await (onMemberCreate as any)(snap, context);

    // 25 existing members (user-1..user-24 + none excluded further) batched
    // into chunks of 10 => 3 batched 'in' query calls, never 25 individual gets.
    expect(usersWhereGet).toHaveBeenCalledTimes(3);
  });
});
