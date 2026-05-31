/**
 * Test Script for Chat Functionality
 *
 * This script tests the chat functionality for a specific group
 * using Firestore with the same collection structure as the ChatModel.
 *
 * Usage:
 * 1. Make sure you have Firebase credentials set up
 * 2. Run: npx ts-node testChatFunctionality.ts
 */

import * as admin from "firebase-admin";
import * as path from "path";
import * as fs from "fs";

// Types for our app data
interface ChatMessage {
  id?: string;
  groupId: string;
  senderId: string;
  senderName: string;
  senderPhotoURL?: string;
  text: string;
  sentAt: admin.firestore.Timestamp | Date;
  readBy: { [userId: string]: boolean };
  attachments?: {
    type: "image" | "file" | "voice";
    url: string;
    name?: string;
    size?: number;
    duration?: number;
  }[];
  reactions?: {
    [reactionType: string]: string[];
  };
  replyTo?: {
    messageId: string;
    text: string;
    senderId: string;
    senderName: string;
  };
}

interface GroupChat {
  id?: string;
  groupId: string;
  lastMessage: {
    text: string;
    senderId: string;
    senderName: string;
    sentAt: admin.firestore.Timestamp | Date;
  };
  participantCount: number;
  createdAt: admin.firestore.Timestamp | Date;
  updatedAt: admin.firestore.Timestamp | Date;
}

// Define collection paths to match the ones used in ChatModel
const COLLECTION_PATHS = {
  GROUP_CHATS: "group_chats",
  CHAT_MESSAGES: (groupId: string) => `group_chats/${groupId}/messages`,
};

// Find service account file in current directory
const serviceAccountPath = path.join(__dirname, "recovery-connect.json");

// Initialize Firebase Admin
if (fs.existsSync(serviceAccountPath)) {
  const serviceAccount = require(serviceAccountPath);

  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
  });
} else {
  console.error("Service account file not found at:", serviceAccountPath);
  console.error(
    "Please place your Firebase service account JSON in the scripts directory"
  );
  process.exit(1);
}

// Constants
const GROUP_ID = "VkIApNXMxkTsx1nHELBH";
const TEST_USER_UID = "test-user-" + Date.now().toString().slice(-6);

// Firestore references
const db = admin.firestore();
const chatRef = db.collection(COLLECTION_PATHS.GROUP_CHATS).doc(GROUP_ID);
const messagesRef = db.collection(COLLECTION_PATHS.CHAT_MESSAGES(GROUP_ID));

// Test functions
async function initializeGroupChat() {
  console.log("🔵 Initializing group chat...");

  // Check if chat exists
  const chatDoc = await chatRef.get();

  if (!chatDoc.exists) {
    // Create chat document
    await chatRef.set({
      groupId: GROUP_ID,
      lastMessage: {
        text: "Chat created by test script",
        senderId: TEST_USER_UID,
        senderName: "Test User",
        sentAt: admin.firestore.FieldValue.serverTimestamp(),
      },
      participantCount: 1,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    });

    console.log("✅ Chat initialized successfully");
  } else {
    console.log("✅ Chat already exists, skipping initialization");
  }

  return chatDoc.id;
}

async function sendTestMessage(text = "Test message", isSystemMessage = false) {
  console.log(
    `🔵 Sending ${isSystemMessage ? "system" : "user"} message: "${text}"...`
  );

  const timestamp = admin.firestore.Timestamp.now();
  const senderId = isSystemMessage ? "system" : TEST_USER_UID;
  const senderName = isSystemMessage ? "System" : "Test User";

  // Message data
  const messageData: Omit<ChatMessage, "id"> = {
    groupId: GROUP_ID,
    senderId,
    senderName,
    text,
    sentAt: timestamp,
    readBy: {
      [TEST_USER_UID]: true,
    },
  };

  // Save the message
  const messageRef = await messagesRef.add(messageData);

  // Update the last message in the chat
  await chatRef.update({
    lastMessage: {
      text,
      senderId,
      senderName,
      sentAt: timestamp,
    },
    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
  });

  console.log(`✅ Message sent with ID: ${messageRef.id}`);
  return messageRef.id;
}

async function getRecentMessages(limit = 20) {
  console.log(`🔵 Fetching ${limit} recent messages...`);

  // Query messages ordered by sentAt in descending order
  const snapshot = await messagesRef
    .orderBy("sentAt", "desc")
    .limit(limit)
    .get();

  const messages: ChatMessage[] = [];
  snapshot.forEach((doc) => {
    messages.push({
      id: doc.id,
      ...doc.data(),
    } as ChatMessage);
  });

  // Convert to chronological order (oldest first)
  messages.reverse();

  console.log(`✅ Fetched ${messages.length} messages`);
  console.log(
    messages
      .map((m) => {
        const date =
          m.sentAt instanceof admin.firestore.Timestamp
            ? m.sentAt.toDate()
            : m.sentAt;
        return `- [${date.toLocaleTimeString()}] ${m.senderName}: ${m.text}`;
      })
      .join("\n")
  );

  return messages;
}

async function addReaction(
  messageId: string | null,
  reactionType = "thumbsup"
) {
  if (!messageId) {
    console.error("❌ Invalid message ID");
    return;
  }

  console.log(
    `🔵 Adding reaction "${reactionType}" to message ${messageId}...`
  );

  const messageRef = messagesRef.doc(messageId);

  // Check if message exists
  const messageDoc = await messageRef.get();
  if (!messageDoc.exists) {
    console.error("❌ Message not found");
    return;
  }

  // Update the reactions array for this reaction type
  await messageRef.update({
    [`reactions.${reactionType}`]:
      admin.firestore.FieldValue.arrayUnion(TEST_USER_UID),
  });

  console.log("✅ Reaction added successfully");
}

async function testRealTimeListener(): Promise<void> {
  console.log("🔵 Setting up real-time message listener...");

  return new Promise<void>((resolve) => {
    // Listen for new messages
    const unsubscribe = messagesRef
      .orderBy("sentAt", "desc")
      .limit(1)
      .onSnapshot((snapshot) => {
        snapshot.docChanges().forEach((change) => {
          if (change.type === "added") {
            const message = {
              id: change.doc.id,
              ...change.doc.data(),
            } as ChatMessage;
            const date =
              message.sentAt instanceof admin.firestore.Timestamp
                ? message.sentAt.toDate()
                : message.sentAt;
            console.log(
              `📩 New message received: "${message.text}" from ${
                message.senderName
              } at ${date.toLocaleTimeString()}`
            );
          }
        });

        // Clean up and resolve after receiving changes
        setTimeout(() => {
          unsubscribe();
          resolve();
        }, 1000);
      });

    // Send a message to trigger the listener
    setTimeout(async () => {
      await sendTestMessage(
        "This message should trigger the real-time listener"
      );
    }, 2000);

    console.log("👂 Listening for new messages...");
  });
}

async function markMessageAsRead(messageId: string | null) {
  if (!messageId) {
    console.error("❌ Invalid message ID");
    return;
  }

  console.log(`🔵 Marking message ${messageId} as read...`);

  await messagesRef.doc(messageId).update({
    [`readBy.${TEST_USER_UID}`]: true,
  });

  console.log("✅ Message marked as read");
}

async function cleanupTestMessages() {
  console.log("🔵 Cleaning up test messages (optional)...");

  // Get messages created by our test user
  const snapshot = await messagesRef
    .where("senderId", "==", TEST_USER_UID)
    .get();

  let count = 0;
  const batch = db.batch();

  snapshot.forEach((doc) => {
    // Add deletion to batch
    batch.delete(doc.ref);
    count++;
  });

  if (count > 0) {
    await batch.commit();
  }

  console.log(`✅ Removed ${count} test messages`);
}

// Main test execution
async function runTests() {
  console.log("🚀 Starting chat functionality tests");
  console.log("--------------------------------------");
  console.log(`Using Group ID: ${GROUP_ID}`);
  console.log(`Test User ID: ${TEST_USER_UID}`);
  console.log("--------------------------------------");

  try {
    // Initialize chat
    await initializeGroupChat();

    // Send test messages
    const messageId1 = await sendTestMessage("Hello from test script!");
    const messageId2 = await sendTestMessage("Another test message");
    await sendTestMessage("System announcement", true);

    // Get recent messages
    const messages = await getRecentMessages();

    // Add reaction to a message
    if (messageId1) {
      await addReaction(messageId1, "heart");
    }

    // Mark a message as read
    if (messageId2) {
      await markMessageAsRead(messageId2);
    }

    // Test real-time listener
    await testRealTimeListener();

    // Optional: clean up test messages (uncomment to use)
    // await cleanupTestMessages();

    console.log("--------------------------------------");
    console.log("✅ All tests completed successfully!");
  } catch (error) {
    console.error("❌ Test failed:", error);
  } finally {
    // Ensure Firebase connection is closed
    setTimeout(() => {
      admin
        .app()
        .delete()
        .then(() => {
          console.log("👋 Firebase connection closed");
          process.exit(0);
        });
    }, 2000);
  }
}

// Run the tests
runTests();
