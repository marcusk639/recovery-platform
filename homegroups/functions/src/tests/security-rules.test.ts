/**
 * Firestore Security Rules Tests
 *
 * Run with: npm test
 * Requires Firebase Emulator Suite running
 *
 * Start emulators: firebase emulators:start
 */

import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
  RulesTestEnvironment,
} from "@firebase/rules-unit-testing";
import * as fs from "fs";
import * as path from "path";

let testEnv: RulesTestEnvironment;

// Helper to create authenticated context with custom claims
function getAuthenticatedContext(
  uid: string,
  claims: Record<string, any> = {},
) {
  return testEnv.authenticatedContext(uid, claims);
}

// Helper to create unauthenticated context
function getUnauthenticatedContext() {
  return testEnv.unauthenticatedContext();
}

beforeAll(async () => {
  // Load the security rules
  const rulesPath = path.join(__dirname, "../../../firestore.rules");
  const rules = fs.readFileSync(rulesPath, "utf8");

  testEnv = await initializeTestEnvironment({
    projectId: "recovery-connect-test",
    firestore: {
      rules,
      host: "localhost",
      port: 8080,
    },
  });
});

afterAll(async () => {
  await testEnv.cleanup();
});

beforeEach(async () => {
  await testEnv.clearFirestore();
});

describe("Users Collection", () => {
  const userId = "user123";
  const otherUserId = "user456";

  beforeEach(async () => {
    // Set up test data
    await testEnv.withSecurityRulesDisabled(async (context) => {
      const db = context.firestore();
      await db.collection("users").doc(userId).set({
        email: "test@example.com",
        displayName: "Test User",
        createdAt: new Date(),
      });
    });
  });

  test("user can read their own document", async () => {
    const db = getAuthenticatedContext(userId).firestore();
    await assertSucceeds(db.collection("users").doc(userId).get());
  });

  test("user cannot read another user's document", async () => {
    const db = getAuthenticatedContext(otherUserId).firestore();
    await assertFails(db.collection("users").doc(userId).get());
  });

  test("super admin can read any user document", async () => {
    const db = getAuthenticatedContext(otherUserId, {
      superAdmin: true,
    }).firestore();
    await assertSucceeds(db.collection("users").doc(userId).get());
  });

  test("user can create their own document", async () => {
    const newUserId = "newUser789";
    const db = getAuthenticatedContext(newUserId).firestore();
    await assertSucceeds(
      db.collection("users").doc(newUserId).set({
        email: "new@example.com",
        displayName: "New User",
      }),
    );
  });

  test("user cannot create another user's document", async () => {
    const db = getAuthenticatedContext(userId).firestore();
    await assertFails(
      db.collection("users").doc(otherUserId).set({
        email: "fake@example.com",
      }),
    );
  });

  test("user can update their own document", async () => {
    const db = getAuthenticatedContext(userId).firestore();
    await assertSucceeds(
      db.collection("users").doc(userId).update({
        displayName: "Updated Name",
      }),
    );
  });

  test("user cannot delete any document", async () => {
    const db = getAuthenticatedContext(userId).firestore();
    await assertFails(db.collection("users").doc(userId).delete());
  });

  test("unauthenticated user cannot read users", async () => {
    const db = getUnauthenticatedContext().firestore();
    await assertFails(db.collection("users").doc(userId).get());
  });
});

describe("Groups Collection", () => {
  const groupId = "group123";
  const adminUserId = "admin456";
  const memberUserId = "member789";

  beforeEach(async () => {
    await testEnv.withSecurityRulesDisabled(async (context) => {
      const db = context.firestore();
      await db
        .collection("groups")
        .doc(groupId)
        .set({
          name: "Test Group",
          admins: [adminUserId],
          memberCount: 2,
          isPublic: true,
          createdAt: new Date(),
        });
    });
  });

  test("anyone can read groups (for discovery)", async () => {
    const db = getUnauthenticatedContext().firestore();
    await assertSucceeds(db.collection("groups").doc(groupId).get());
  });

  test("group admin can update group", async () => {
    const db = getAuthenticatedContext(adminUserId, {
      adminGroups: [groupId],
    }).firestore();
    await assertSucceeds(
      db.collection("groups").doc(groupId).update({
        description: "Updated description",
      }),
    );
  });

  test("non-admin cannot update group", async () => {
    const db = getAuthenticatedContext(memberUserId, {
      memberGroups: [groupId],
    }).firestore();
    await assertFails(
      db.collection("groups").doc(groupId).update({
        description: "Hacked description",
      }),
    );
  });

  test("no one can delete groups", async () => {
    const db = getAuthenticatedContext(adminUserId, {
      adminGroups: [groupId],
      superAdmin: true,
    }).firestore();
    await assertFails(db.collection("groups").doc(groupId).delete());
  });
});

describe("Members Collection", () => {
  const groupId = "group123";
  const userId = "user456";
  const adminUserId = "admin789";
  const memberId = `${groupId}_${userId}`;

  beforeEach(async () => {
    await testEnv.withSecurityRulesDisabled(async (context) => {
      const db = context.firestore();
      await db.collection("groups").doc(groupId).set({
        name: "Test Group",
        memberCount: 2,
        createdAt: new Date(),
      });
      await db
        .collection("members")
        .doc(memberId)
        .set({
          groupId,
          userId,
          displayName: "Test Member",
          isAdmin: false,
          isTreasurer: false,
          roles: ["member"],
          joinedAt: new Date(),
        });
      await db
        .collection("members")
        .doc(`${groupId}_${adminUserId}`)
        .set({
          groupId,
          userId: adminUserId,
          displayName: "Admin Member",
          isAdmin: true,
          isTreasurer: false,
          roles: ["admin", "member"],
          joinedAt: new Date(),
        });
    });
  });

  test("group member can read other members", async () => {
    const db = getAuthenticatedContext(userId, {
      memberGroups: [groupId],
    }).firestore();
    await assertSucceeds(db.collection("members").doc(memberId).get());
  });

  test("non-member cannot read members", async () => {
    const db = getAuthenticatedContext("outsider", {
      memberGroups: [],
    }).firestore();
    await assertFails(db.collection("members").doc(memberId).get());
  });

  test("user can create their own membership", async () => {
    const newUserId = "newUser123";
    const newMemberId = `${groupId}_${newUserId}`;
    const db = getAuthenticatedContext(newUserId).firestore();
    await assertSucceeds(
      db
        .collection("members")
        .doc(newMemberId)
        .set({
          groupId,
          userId: newUserId,
          displayName: "New Member",
          isAdmin: false,
          isTreasurer: false,
          roles: ["member"],
          joinedAt: new Date(),
        }),
    );
  });

  test("user cannot create membership for another user", async () => {
    const newMemberId = `${groupId}_fakeUser`;
    const db = getAuthenticatedContext(userId).firestore();
    await assertFails(
      db.collection("members").doc(newMemberId).set({
        groupId,
        userId: "fakeUser",
        displayName: "Fake Member",
        isAdmin: false,
      }),
    );
  });

  test("member can update their own non-role fields", async () => {
    const db = getAuthenticatedContext(userId, {
      memberGroups: [groupId],
    }).firestore();
    await assertSucceeds(
      db.collection("members").doc(memberId).update({
        displayName: "Updated Name",
      }),
    );
  });

  test("member cannot update their own admin status", async () => {
    const db = getAuthenticatedContext(userId, {
      memberGroups: [groupId],
    }).firestore();
    await assertFails(
      db.collection("members").doc(memberId).update({
        isAdmin: true,
      }),
    );
  });

  test("member cannot update their own roles", async () => {
    const db = getAuthenticatedContext(userId, {
      memberGroups: [groupId],
    }).firestore();
    await assertFails(
      db
        .collection("members")
        .doc(memberId)
        .update({
          roles: ["admin", "member"],
        }),
    );
  });

  test("user cannot create membership with isAdmin true", async () => {
    const newUserId = "escalateUser";
    const newMemberId = `${groupId}_${newUserId}`;
    const db = getAuthenticatedContext(newUserId).firestore();
    await assertFails(
      db
        .collection("members")
        .doc(newMemberId)
        .set({
          groupId,
          userId: newUserId,
          displayName: "Escalated Member",
          isAdmin: true,
          isTreasurer: false,
          roles: ["admin", "member"],
          joinedAt: new Date(),
        }),
    );
  });

  test("user cannot create membership with isTreasurer true", async () => {
    const newUserId = "treasurerUser";
    const newMemberId = `${groupId}_${newUserId}`;
    const db = getAuthenticatedContext(newUserId).firestore();
    await assertFails(
      db
        .collection("members")
        .doc(newMemberId)
        .set({
          groupId,
          userId: newUserId,
          displayName: "Treasurer Member",
          isAdmin: false,
          isTreasurer: true,
          roles: ["treasurer", "member"],
          joinedAt: new Date(),
        }),
    );
  });

  test("user cannot create membership for non-existent group", async () => {
    const newUserId = "ghostUser";
    const fakeGroupId = "nonExistentGroup";
    const newMemberId = `${fakeGroupId}_${newUserId}`;
    const db = getAuthenticatedContext(newUserId).firestore();
    await assertFails(
      db
        .collection("members")
        .doc(newMemberId)
        .set({
          groupId: fakeGroupId,
          userId: newUserId,
          displayName: "Ghost Member",
          isAdmin: false,
          isTreasurer: false,
          roles: ["member"],
          joinedAt: new Date(),
        }),
    );
  });

  test("admin can update any member's fields", async () => {
    const db = getAuthenticatedContext(adminUserId, {
      adminGroups: [groupId],
    }).firestore();
    await assertSucceeds(
      db
        .collection("members")
        .doc(memberId)
        .update({
          isAdmin: true,
          roles: ["admin", "member"],
        }),
    );
  });

  test("member can leave group (delete own membership)", async () => {
    const db = getAuthenticatedContext(userId, {
      memberGroups: [groupId],
    }).firestore();
    await assertSucceeds(db.collection("members").doc(memberId).delete());
  });

  test("admin can remove members", async () => {
    const db = getAuthenticatedContext(adminUserId, {
      adminGroups: [groupId],
    }).firestore();
    await assertSucceeds(db.collection("members").doc(memberId).delete());
  });
});

describe("Announcements Collection", () => {
  const groupId = "group123";
  const announcementId = "ann123";
  const adminUserId = "admin456";
  const memberUserId = "member789";

  beforeEach(async () => {
    await testEnv.withSecurityRulesDisabled(async (context) => {
      const db = context.firestore();
      await db.collection("announcements").doc(announcementId).set({
        groupId,
        title: "Test Announcement",
        content: "Test content",
        createdBy: adminUserId,
        createdAt: new Date(),
      });
    });
  });

  test("group member can read announcements", async () => {
    const db = getAuthenticatedContext(memberUserId, {
      memberGroups: [groupId],
    }).firestore();
    await assertSucceeds(
      db.collection("announcements").doc(announcementId).get(),
    );
  });

  test("non-member cannot read announcements", async () => {
    const db = getAuthenticatedContext("outsider", {
      memberGroups: [],
    }).firestore();
    await assertFails(db.collection("announcements").doc(announcementId).get());
  });

  test("admin can create announcements", async () => {
    const db = getAuthenticatedContext(adminUserId, {
      adminGroups: [groupId],
    }).firestore();
    await assertSucceeds(
      db.collection("announcements").doc("newAnn").set({
        groupId,
        title: "New Announcement",
        content: "New content",
        createdBy: adminUserId,
        createdAt: new Date(),
      }),
    );
  });

  test("member cannot create announcements", async () => {
    const db = getAuthenticatedContext(memberUserId, {
      memberGroups: [groupId],
    }).firestore();
    await assertFails(
      db.collection("announcements").doc("newAnn").set({
        groupId,
        title: "Unauthorized Announcement",
        content: "Content",
      }),
    );
  });
});

describe("Transactions Collection", () => {
  const groupId = "group123";
  const transactionId = "trans123";
  const treasurerId = "treasurer456";
  const memberUserId = "member789";

  beforeEach(async () => {
    await testEnv.withSecurityRulesDisabled(async (context) => {
      const db = context.firestore();
      await db.collection("transactions").doc(transactionId).set({
        groupId,
        type: "income",
        amount: 100,
        description: "Donation",
        createdBy: treasurerId,
        createdAt: new Date(),
      });
    });
  });

  test("group member can read transactions", async () => {
    const db = getAuthenticatedContext(memberUserId, {
      memberGroups: [groupId],
    }).firestore();
    await assertSucceeds(
      db.collection("transactions").doc(transactionId).get(),
    );
  });

  test("treasurer can create transactions", async () => {
    const db = getAuthenticatedContext(treasurerId, {
      treasurerGroups: [groupId],
    }).firestore();
    await assertSucceeds(
      db.collection("transactions").doc("newTrans").set({
        groupId,
        type: "expense",
        amount: 50,
        description: "Rent",
        createdBy: treasurerId,
        createdAt: new Date(),
      }),
    );
  });

  test("regular member cannot create transactions", async () => {
    const db = getAuthenticatedContext(memberUserId, {
      memberGroups: [groupId],
    }).firestore();
    await assertFails(
      db.collection("transactions").doc("newTrans").set({
        groupId,
        type: "income",
        amount: 1000,
        description: "Fake donation",
      }),
    );
  });

  test("treasurer can delete transactions for corrections", async () => {
    const db = getAuthenticatedContext(treasurerId, {
      treasurerGroups: [groupId],
    }).firestore();
    await assertSucceeds(
      db.collection("transactions").doc(transactionId).delete(),
    );
  });

  test("regular member cannot delete transactions", async () => {
    const db = getAuthenticatedContext(memberUserId, {
      memberGroups: [groupId],
    }).firestore();
    await assertFails(
      db.collection("transactions").doc(transactionId).delete(),
    );
  });
});

describe("Direct Message Threads", () => {
  const threadId = "thread123";
  const user1Id = "user1";
  const user2Id = "user2";
  const outsiderId = "outsider";

  beforeEach(async () => {
    await testEnv.withSecurityRulesDisabled(async (context) => {
      const db = context.firestore();
      await db
        .collection("direct_message_threads")
        .doc(threadId)
        .set({
          participants: [user1Id, user2Id],
          lastMessage: {
            text: "Hello",
            senderId: user1Id,
            sentAt: new Date(),
            read: { [user1Id]: true, [user2Id]: false },
          },
          createdAt: new Date(),
        });
    });
  });

  test("participant can read thread", async () => {
    const db = getAuthenticatedContext(user1Id).firestore();
    await assertSucceeds(
      db.collection("direct_message_threads").doc(threadId).get(),
    );
  });

  test("non-participant cannot read thread", async () => {
    const db = getAuthenticatedContext(outsiderId).firestore();
    await assertFails(
      db.collection("direct_message_threads").doc(threadId).get(),
    );
  });

  test("user can create thread with themselves as participant", async () => {
    const db = getAuthenticatedContext(user1Id).firestore();
    await assertSucceeds(
      db
        .collection("direct_message_threads")
        .doc("newThread")
        .set({
          participants: [user1Id, outsiderId],
          lastMessage: {
            text: "Hi",
            senderId: user1Id,
            sentAt: new Date(),
          },
          createdAt: new Date(),
        }),
    );
  });

  test("user cannot create thread without being participant", async () => {
    const db = getAuthenticatedContext(user1Id).firestore();
    await assertFails(
      db
        .collection("direct_message_threads")
        .doc("newThread")
        .set({
          participants: [user2Id, outsiderId],
          createdAt: new Date(),
        }),
    );
  });

  test("thread cannot have more than 2 participants", async () => {
    const db = getAuthenticatedContext(user1Id).firestore();
    await assertFails(
      db
        .collection("direct_message_threads")
        .doc("newThread")
        .set({
          participants: [user1Id, user2Id, outsiderId],
          createdAt: new Date(),
        }),
    );
  });
});

describe("Group Chats", () => {
  const groupId = "group123";
  const messageId = "msg123";
  const senderId = "sender456";
  const memberUserId = "member789";
  const outsiderId = "outsider";

  beforeEach(async () => {
    await testEnv.withSecurityRulesDisabled(async (context) => {
      const db = context.firestore();
      await db
        .collection("group_chats")
        .doc(groupId)
        .set({
          groupId,
          lastMessage: {
            text: "Hello group",
            senderId,
            senderName: "Sender",
            sentAt: new Date(),
          },
          createdAt: new Date(),
        });
      await db
        .collection("group_chats")
        .doc(groupId)
        .collection("messages")
        .doc(messageId)
        .set({
          groupId,
          senderId,
          senderName: "Sender",
          text: "Hello group",
          sentAt: new Date(),
          readBy: {},
        });
    });
  });

  test("group member can read messages", async () => {
    const db = getAuthenticatedContext(memberUserId, {
      memberGroups: [groupId],
    }).firestore();
    await assertSucceeds(
      db
        .collection("group_chats")
        .doc(groupId)
        .collection("messages")
        .doc(messageId)
        .get(),
    );
  });

  test("non-member cannot read messages", async () => {
    const db = getAuthenticatedContext(outsiderId, {
      memberGroups: [],
    }).firestore();
    await assertFails(
      db
        .collection("group_chats")
        .doc(groupId)
        .collection("messages")
        .doc(messageId)
        .get(),
    );
  });

  test("member can send messages", async () => {
    const db = getAuthenticatedContext(memberUserId, {
      memberGroups: [groupId],
    }).firestore();
    await assertSucceeds(
      db
        .collection("group_chats")
        .doc(groupId)
        .collection("messages")
        .doc("newMsg")
        .set({
          groupId,
          senderId: memberUserId,
          senderName: "Member",
          text: "My message",
          sentAt: new Date(),
          readBy: {},
        }),
    );
  });

  test("member cannot send message as another user", async () => {
    const db = getAuthenticatedContext(memberUserId, {
      memberGroups: [groupId],
    }).firestore();
    await assertFails(
      db
        .collection("group_chats")
        .doc(groupId)
        .collection("messages")
        .doc("newMsg")
        .set({
          groupId,
          senderId: senderId, // Different from auth user
          senderName: "Spoofed",
          text: "Fake message",
          sentAt: new Date(),
        }),
    );
  });

  test("sender can delete own message", async () => {
    const db = getAuthenticatedContext(senderId, {
      memberGroups: [groupId],
    }).firestore();
    await assertSucceeds(
      db
        .collection("group_chats")
        .doc(groupId)
        .collection("messages")
        .doc(messageId)
        .delete(),
    );
  });

  test("admin can delete any message", async () => {
    const db = getAuthenticatedContext(memberUserId, {
      memberGroups: [groupId],
      adminGroups: [groupId],
    }).firestore();
    await assertSucceeds(
      db
        .collection("group_chats")
        .doc(groupId)
        .collection("messages")
        .doc(messageId)
        .delete(),
    );
  });
});

describe("Reports Collection", () => {
  const groupId = "group123";
  const reportId = "report123";
  const reporterId = "reporter456";
  const adminUserId = "admin789";

  beforeEach(async () => {
    await testEnv.withSecurityRulesDisabled(async (context) => {
      const db = context.firestore();
      await db.collection("reports").doc(reportId).set({
        groupId,
        reporterId,
        reporterName: "Reporter",
        reportedUserId: "badUser",
        reportedUserName: "Bad User",
        reason: "harassment",
        status: "pending",
        createdAt: new Date(),
      });
    });
  });

  test("admin can read reports for their group", async () => {
    const db = getAuthenticatedContext(adminUserId, {
      adminGroups: [groupId],
    }).firestore();
    await assertSucceeds(db.collection("reports").doc(reportId).get());
  });

  test("regular member cannot read reports", async () => {
    const db = getAuthenticatedContext(reporterId, {
      memberGroups: [groupId],
    }).firestore();
    await assertFails(db.collection("reports").doc(reportId).get());
  });

  test("super admin can read any report", async () => {
    const db = getAuthenticatedContext("superAdmin", {
      superAdmin: true,
    }).firestore();
    await assertSucceeds(db.collection("reports").doc(reportId).get());
  });

  test("member can create report", async () => {
    const db = getAuthenticatedContext(reporterId, {
      memberGroups: [groupId],
    }).firestore();
    await assertSucceeds(
      db.collection("reports").doc("newReport").set({
        groupId,
        reporterId,
        reporterName: "Reporter",
        reportedUserId: "anotherBadUser",
        reportedUserName: "Another Bad User",
        reason: "spam",
        status: "pending",
        createdAt: new Date(),
      }),
    );
  });

  test("reports cannot be deleted (audit trail)", async () => {
    const db = getAuthenticatedContext(adminUserId, {
      adminGroups: [groupId],
      superAdmin: true,
    }).firestore();
    await assertFails(db.collection("reports").doc(reportId).delete());
  });
});

describe("Sponsorships Collection", () => {
  const sponsorshipId = "sponsorship123";
  const sponsorId = "sponsor456";
  const sponseeId = "sponsee789";
  const outsiderId = "outsider";

  beforeEach(async () => {
    await testEnv.withSecurityRulesDisabled(async (context) => {
      const db = context.firestore();
      await db.collection("sponsorships").doc(sponsorshipId).set({
        sponsorId,
        sponseeId,
        groupId: "group123",
        status: "active",
        startDate: new Date(),
        createdAt: new Date(),
      });
    });
  });

  test("sponsor can read their sponsorship", async () => {
    const db = getAuthenticatedContext(sponsorId).firestore();
    await assertSucceeds(
      db.collection("sponsorships").doc(sponsorshipId).get(),
    );
  });

  test("sponsee can read their sponsorship", async () => {
    const db = getAuthenticatedContext(sponseeId).firestore();
    await assertSucceeds(
      db.collection("sponsorships").doc(sponsorshipId).get(),
    );
  });

  test("outsider cannot read sponsorship", async () => {
    const db = getAuthenticatedContext(outsiderId).firestore();
    await assertFails(db.collection("sponsorships").doc(sponsorshipId).get());
  });

  test("sponsor can update sponsorship status", async () => {
    const db = getAuthenticatedContext(sponsorId).firestore();
    await assertSucceeds(
      db.collection("sponsorships").doc(sponsorshipId).update({
        status: "terminated",
        endDate: new Date(),
      }),
    );
  });

  test("sponsorships cannot be deleted", async () => {
    const db = getAuthenticatedContext(sponsorId).firestore();
    await assertFails(
      db.collection("sponsorships").doc(sponsorshipId).delete(),
    );
  });
});

describe("Group Invites Collection", () => {
  const inviteId = "invite123";

  beforeEach(async () => {
    await testEnv.withSecurityRulesDisabled(async (context) => {
      const db = context.firestore();
      await db.collection("groupInvites").doc(inviteId).set({
        groupId: "group123",
        code: "ABC123",
        createdBy: "admin456",
        createdAt: new Date(),
        status: "active",
      });
    });
  });

  test("authenticated user can read invite", async () => {
    const db = getAuthenticatedContext("anyUser").firestore();
    await assertSucceeds(db.collection("groupInvites").doc(inviteId).get());
  });

  test("unauthenticated user cannot read invite", async () => {
    const db = getUnauthenticatedContext().firestore();
    await assertFails(db.collection("groupInvites").doc(inviteId).get());
  });

  test("no one can create invites directly (Cloud Function only)", async () => {
    const db = getAuthenticatedContext("admin", {
      superAdmin: true,
    }).firestore();
    await assertFails(
      db.collection("groupInvites").doc("newInvite").set({
        groupId: "group123",
        code: "XYZ789",
      }),
    );
  });

  test("no one can delete invites directly", async () => {
    const db = getAuthenticatedContext("admin", {
      superAdmin: true,
    }).firestore();
    await assertFails(db.collection("groupInvites").doc(inviteId).delete());
  });
});

describe("Admin Removal Requests Collection", () => {
  const groupId = "group123";
  const requestId = "req123";
  const targetAdminId = "admin456";
  const requesterId = "requester789";
  const memberUserId = "member999";

  beforeEach(async () => {
    await testEnv.withSecurityRulesDisabled(async (context) => {
      const db = context.firestore();
      // Seed group
      await db.collection("groups").doc(groupId).set({ name: "Test Group" });
      // Seed member docs
      await db.collection("members").doc(`${groupId}_${targetAdminId}`).set({
        groupId,
        userId: targetAdminId,
        isAdmin: true,
        isTreasurer: false,
      });
      await db.collection("members").doc(`${groupId}_${requesterId}`).set({
        groupId,
        userId: requesterId,
        isAdmin: false,
        isTreasurer: false,
      });
      await db.collection("members").doc(`${groupId}_${memberUserId}`).set({
        groupId,
        userId: memberUserId,
        isAdmin: false,
        isTreasurer: false,
      });
      // Seed admin removal request
      await db.collection("admin_removal_requests").doc(requestId).set({
        groupId,
        targetAdminId,
        requesterId,
        status: "pending",
        createdAt: new Date(),
      });
      // Seed a vote
      await db
        .collection("admin_removal_requests")
        .doc(requestId)
        .collection("votes")
        .doc(memberUserId)
        .set({ vote: "yes", votedAt: new Date() });
    });
  });

  test("group member can read admin removal request", async () => {
    const db = getAuthenticatedContext(memberUserId, {
      memberGroups: [groupId],
    }).firestore();
    await assertSucceeds(
      db.collection("admin_removal_requests").doc(requestId).get(),
    );
  });

  test("non-member cannot read admin removal request", async () => {
    const db = getAuthenticatedContext("outsider").firestore();
    await assertFails(
      db.collection("admin_removal_requests").doc(requestId).get(),
    );
  });

  test("no one can create admin removal request directly (Cloud Function only)", async () => {
    const db = getAuthenticatedContext(requesterId, {
      memberGroups: [groupId],
    }).firestore();
    await assertFails(
      db.collection("admin_removal_requests").doc("newReq").set({
        groupId,
        targetAdminId,
        requesterId,
        status: "pending",
        createdAt: new Date(),
      }),
    );
  });

  test("no one can delete admin removal request", async () => {
    const db = getAuthenticatedContext(targetAdminId, {
      adminGroups: [groupId],
      superAdmin: true,
    }).firestore();
    await assertFails(
      db.collection("admin_removal_requests").doc(requestId).delete(),
    );
  });

  test("target admin can update adminResponse and adminRespondedAt fields", async () => {
    const db = getAuthenticatedContext(targetAdminId, {
      memberGroups: [groupId],
    }).firestore();
    await assertSucceeds(
      db.collection("admin_removal_requests").doc(requestId).update({
        adminResponse: "I accept the decision.",
        adminRespondedAt: new Date(),
      }),
    );
  });

  test("non-target admin cannot update admin removal request", async () => {
    const db = getAuthenticatedContext(memberUserId, {
      memberGroups: [groupId],
    }).firestore();
    await assertFails(
      db.collection("admin_removal_requests").doc(requestId).update({
        adminResponse: "Spoofed response",
        adminRespondedAt: new Date(),
      }),
    );
  });

  test("target admin cannot update fields other than adminResponse/adminRespondedAt", async () => {
    const db = getAuthenticatedContext(targetAdminId, {
      memberGroups: [groupId],
    }).firestore();
    await assertFails(
      db.collection("admin_removal_requests").doc(requestId).update({
        status: "resolved",
      }),
    );
  });

  test("group member can read votes subcollection", async () => {
    const db = getAuthenticatedContext(requesterId, {
      memberGroups: [groupId],
    }).firestore();
    await assertSucceeds(
      db
        .collection("admin_removal_requests")
        .doc(requestId)
        .collection("votes")
        .doc(memberUserId)
        .get(),
    );
  });

  test("no one can write votes directly (Cloud Function only)", async () => {
    const db = getAuthenticatedContext(memberUserId, {
      memberGroups: [groupId],
    }).firestore();
    await assertFails(
      db
        .collection("admin_removal_requests")
        .doc(requestId)
        .collection("votes")
        .doc("newVote")
        .set({ vote: "no" }),
    );
  });
});

describe("Financial Reports Collection", () => {
  const groupId = "group123";
  const reportId = "report123";
  const treasurerId = "treasurer456";
  const adminUserId = "admin789";
  const memberUserId = "member999";

  beforeEach(async () => {
    await testEnv.withSecurityRulesDisabled(async (context) => {
      const db = context.firestore();
      await db.collection("financial_reports").doc(reportId).set({
        groupId,
        period: "2026-01",
        totalIncome: 500,
        totalExpense: 200,
        createdBy: treasurerId,
        createdAt: new Date(),
      });
    });
  });

  test("group member can read financial reports", async () => {
    const db = getAuthenticatedContext(memberUserId, {
      memberGroups: [groupId],
    }).firestore();
    await assertSucceeds(
      db.collection("financial_reports").doc(reportId).get(),
    );
  });

  test("non-member cannot read financial reports", async () => {
    const db = getAuthenticatedContext("outsider").firestore();
    await assertFails(db.collection("financial_reports").doc(reportId).get());
  });

  test("treasurer can create financial report", async () => {
    const db = getAuthenticatedContext(treasurerId, {
      treasurerGroups: [groupId],
    }).firestore();
    await assertSucceeds(
      db.collection("financial_reports").doc("newReport").set({
        groupId,
        period: "2026-02",
        totalIncome: 300,
        totalExpense: 100,
        createdBy: treasurerId,
        createdAt: new Date(),
      }),
    );
  });

  test("admin can create financial report", async () => {
    const db = getAuthenticatedContext(adminUserId, {
      adminGroups: [groupId],
    }).firestore();
    await assertSucceeds(
      db.collection("financial_reports").doc("newReport2").set({
        groupId,
        period: "2026-02",
        totalIncome: 300,
        totalExpense: 100,
        createdBy: adminUserId,
        createdAt: new Date(),
      }),
    );
  });

  test("regular member cannot create financial report", async () => {
    const db = getAuthenticatedContext(memberUserId, {
      memberGroups: [groupId],
    }).firestore();
    await assertFails(
      db.collection("financial_reports").doc("newReport3").set({
        groupId,
        period: "2026-02",
        totalIncome: 300,
        totalExpense: 100,
        createdBy: memberUserId,
        createdAt: new Date(),
      }),
    );
  });

  test("financial reports cannot be deleted (audit trail)", async () => {
    const db = getAuthenticatedContext(treasurerId, {
      treasurerGroups: [groupId],
      superAdmin: true,
    }).firestore();
    await assertFails(
      db.collection("financial_reports").doc(reportId).delete(),
    );
  });
});

describe("User Bans Collection", () => {
  const groupId = "group123";
  const banId = "ban123";
  const adminUserId = "admin456";
  const memberUserId = "member789";

  beforeEach(async () => {
    await testEnv.withSecurityRulesDisabled(async (context) => {
      const db = context.firestore();
      await db.collection("user_bans").doc(banId).set({
        groupId,
        bannedUserId: "badUser",
        bannedBy: adminUserId,
        reason: "harassment",
        createdAt: new Date(),
      });
    });
  });

  test("group admin can read user bans for their group", async () => {
    const db = getAuthenticatedContext(adminUserId, {
      adminGroups: [groupId],
    }).firestore();
    await assertSucceeds(db.collection("user_bans").doc(banId).get());
  });

  test("super admin can read any user ban", async () => {
    const db = getAuthenticatedContext("superAdmin", {
      superAdmin: true,
    }).firestore();
    await assertSucceeds(db.collection("user_bans").doc(banId).get());
  });

  test("regular member cannot read user bans", async () => {
    const db = getAuthenticatedContext(memberUserId, {
      memberGroups: [groupId],
    }).firestore();
    await assertFails(db.collection("user_bans").doc(banId).get());
  });

  test("group admin can create a ban for their group", async () => {
    const db = getAuthenticatedContext(adminUserId, {
      adminGroups: [groupId],
    }).firestore();
    await assertSucceeds(
      db.collection("user_bans").doc("newBan").set({
        groupId,
        bannedUserId: "anotherBadUser",
        bannedBy: adminUserId,
        reason: "spam",
        createdAt: new Date(),
      }),
    );
  });

  test("regular member cannot create a ban", async () => {
    const db = getAuthenticatedContext(memberUserId, {
      memberGroups: [groupId],
    }).firestore();
    await assertFails(
      db.collection("user_bans").doc("newBan").set({
        groupId,
        bannedUserId: "someone",
        bannedBy: memberUserId,
        reason: "i don't like them",
        createdAt: new Date(),
      }),
    );
  });

  test("user bans cannot be deleted", async () => {
    const db = getAuthenticatedContext(adminUserId, {
      adminGroups: [groupId],
      superAdmin: true,
    }).firestore();
    await assertFails(db.collection("user_bans").doc(banId).delete());
  });
});

console.log("Security rules tests completed!");
