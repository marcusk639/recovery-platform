// setup-super-admin.js
const admin = require("firebase-admin");
const serviceAccount = require("./recovery-connect.json");

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
});

// Replace with the UID of the user you want to make super admin
const uids = ["XkhuCExtMKW9PZwkggVmSp2aRMH3", "ZiQGmqkCJYa0pXl9leKedar3Eno1"];

async function setSuperAdmins() {
  try {
    // Set custom claim
    for (const uid of uids) {
      await admin.auth().setCustomUserClaims(uid, { superAdmin: true });
      // Update Firestore document
      await admin.firestore().collection("users").doc(uid).update({
        role: "superAdmin",
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      });

      console.log(`User ${uid} has been set as super admin`);
    }
  } catch (error) {
    console.error("Error setting super admin:", error);
  }
  process.exit();
}

setSuperAdmins();
