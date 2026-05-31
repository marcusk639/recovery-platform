import admin from "firebase-admin";

const app = admin.initializeApp({
  credential: admin.credential.cert(require("./recovery-connect.json")),
});

const db = app.firestore();

const GROUP_ID = "VkIApNXMxkTsx1nHELBH";
const MEMBER_ID = "VkIApNXMxkTsx1nHELBH_XkhuCExtMKW9PZwkggVmSp2aRMH3";
const USER_ID = MEMBER_ID.split("_")[1];

// Sample sponsor data
const SPONSORS = [
  {
    id: "sponsor1",
    uid: "sponsor1", // Firebase Auth UID
    displayName: "John Smith",
    email: "john@example.com",
    sobrietyStartDate: new Date("2020-01-01"),
    sponsorSettings: {
      isAvailable: true,
      maxSponsees: 3,
      requirements: [
        "30 days sober",
        "Working the steps",
        "Regular meeting attendance",
      ],
      bio: "I have been sober since 2020 and have sponsored many people through the program.",
    },
  },
  {
    id: "sponsor2",
    uid: "sponsor2",
    displayName: "Sarah Johnson",
    email: "sarah@example.com",
    sobrietyStartDate: new Date("2019-06-15"),
    sponsorSettings: {
      isAvailable: true,
      maxSponsees: 2,
      requirements: ["60 days sober", "Working the steps", "Daily meditation"],
      bio: "I focus on helping newcomers establish a strong foundation in recovery.",
    },
  },
  {
    id: "sponsor3",
    uid: "sponsor3",
    displayName: "Michael Brown",
    email: "michael@example.com",
    sobrietyStartDate: new Date("2018-03-20"),
    sponsorSettings: {
      isAvailable: true,
      maxSponsees: 4,
      requirements: [
        "90 days sober",
        "Working the steps",
        "Regular service work",
      ],
      bio: "I specialize in working with people who have relapsed and are coming back.",
    },
  },
];

// Member data
const MEMBER = {
  id: MEMBER_ID,
  uid: MEMBER_ID,
  displayName: "Test Member",
  email: "test@example.com",
  sobrietyStartDate: new Date("2023-01-15"),
};

async function createUser(userData: any) {
  const now = admin.firestore.FieldValue.serverTimestamp();
  const userDoc = {
    id: userData.id,
    uid: userData.uid,
    email: userData.email,
    displayName: userData.displayName,
    photoUrl: null,
    createdAt: now,
    updatedAt: now,
    lastLogin: now,
    phoneNumber: null,
    showPhoneNumber: false,
    sobrietyStartDate: admin.firestore.Timestamp.fromDate(
      userData.sobrietyStartDate
    ),
    showSobrietyDate: true,
    notificationSettings: {
      meetings: true,
      announcements: true,
      celebrations: true,
      groupChatMentions: true,
      allowPushNotifications: true,
    },
    privacySettings: {
      allowDirectMessages: true,
      showRecoveryDate: true,
      showPhoneNumber: false,
    },
    homeGroups: [GROUP_ID],
    role: "user",
    favoriteMeetings: [],
    fcmTokens: [],
    subscriptionTier: "free",
    subscriptionValidUntil: null,
    stripeCustomerId: null,
    sponsorSettings: {
      ...userData.sponsorSettings,
      isAvailable: true,
    },
  };

  await db.collection("users").doc(userData.id).set(userDoc);
}

async function createGroupMember(userData: any) {
  const now = admin.firestore.FieldValue.serverTimestamp();
  const memberDoc = {
    id: userData.id,
    groupId: GROUP_ID,
    displayName: userData.displayName,
    showPhoneNumber: false,
    userId: userData.uid,
    phoneNumber: null,
    email: userData.email,
    photoURL: null,
    joinedAt: now,
    sobrietyDate: admin.firestore.Timestamp.fromDate(
      userData.sobrietyStartDate
    ),
    position: null,
    isAdmin: false,
    showSobrietyDate: true,
  };

  await db
    .collection("groups")
    .doc(GROUP_ID)
    .collection("members")
    .doc(`${GROUP_ID}_${userData.id}`)
    .set(memberDoc);

  await addUserToGroup(userData.id);
}

async function addUserToGroup(userId: string) {
  const groupRef = db.collection("groups").doc(GROUP_ID);
  await groupRef.update({
    members: admin.firestore.FieldValue.arrayUnion(userId),
  });
}

async function populateSponsorships() {
  try {
    // Create user documents for sponsors
    for (const sponsor of SPONSORS) {
      await createUser(sponsor);
      await createGroupMember(sponsor);
    }

    // Create user document for member
    await createUser(MEMBER);
    await createGroupMember(MEMBER);

    // Create sponsorships and related data
    for (const sponsor of SPONSORS) {
      // Create sponsorship document
      const sponsorshipRef = await db
        .collection("groups")
        .doc(GROUP_ID)
        .collection("sponsorships")
        .add({
          sponsorId: sponsor.id,
          sponseeId: USER_ID,
          status: "active",
          startDate: admin.firestore.FieldValue.serverTimestamp(),
          createdAt: admin.firestore.FieldValue.serverTimestamp(),
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        });

      // Create sponsorship request
      const requestRef = await db
        .collection("groups")
        .doc(GROUP_ID)
        .collection("sponsorshipRequests")
        .add({
          sponsorId: sponsor.id,
          sponseeId: USER_ID,
          sponseeName: MEMBER.displayName,
          message: `Hi, I'm ${MEMBER.displayName}. I have been sober for 2 years and am looking for a sponsor.`,
          status: "pending",
          createdAt: admin.firestore.FieldValue.serverTimestamp(),
        });

      // Create chat messages
      await db
        .collection("groups")
        .doc(GROUP_ID)
        .collection("sponsorChats")
        .doc(`${sponsor.id}_${MEMBER.id}`)
        .collection("messages")
        .add({
          text: `Hi ${sponsor.displayName}, I'm interested in working with you as my sponsor.`,
          senderId: MEMBER.id,
          timestamp: admin.firestore.FieldValue.serverTimestamp(),
          isRead: false,
        });

      // Create challenges and solutions
      await db
        .collection("groups")
        .doc(GROUP_ID)
        .collection("sponsorChallenges")
        .add({
          sponsorId: sponsor.id,
          sponseeId: USER_ID,
          title: "First Step",
          description: "Complete the first step inventory",
          dueDate: admin.firestore.Timestamp.fromDate(
            new Date(Date.now() + 7 * 24 * 60 * 60 * 1000)
          ),
          status: "pending",
          createdAt: admin.firestore.FieldValue.serverTimestamp(),
        });

      await db
        .collection("groups")
        .doc(GROUP_ID)
        .collection("sponsorSolutions")
        .add({
          sponsorId: sponsor.id,
          sponseeId: USER_ID,
          title: "Daily Check-in",
          description: "Call your sponsor every day",
          frequency: "daily",
          createdAt: admin.firestore.FieldValue.serverTimestamp(),
        });
    }

    console.log("Successfully populated sponsorship data");
  } catch (error) {
    console.error("Error populating sponsorship data:", error);
    throw error;
  }
}

// Run the population script
populateSponsorships();
