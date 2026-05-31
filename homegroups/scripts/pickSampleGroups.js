// Investigate where meeting times live for scraped groups.
const admin = require("firebase-admin");
const serviceAccount = require("./recovery-connect.json");

admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });

const db = admin.firestore();

(async () => {
  // 1. List all top-level collections
  const collections = await db.listCollections();
  console.log(
    "Top-level collections:",
    collections.map((c) => c.id).join(", "),
  );

  // 2. Pick one scraped group and dump full data
  const groupDocRef = db
    .collection("groups")
    .doc("00005a07824ca170ef5046d32c9286215ffc3233963ea33f6afef71c1b9dd9ec");
  const groupSnap = await groupDocRef.get();
  const groupData = groupSnap.data();
  console.log("\n=== Full group doc ===");
  console.log(JSON.stringify(groupData, null, 2));

  // 3. List any subcollections under this group
  const groupSubs = await groupDocRef.listCollections();
  console.log(
    "\nSubcollections under this group:",
    groupSubs.map((c) => c.id).join(", ") || "(none)",
  );

  // 4. Look for a top-level meetings collection and sample one doc that refs this group
  if (collections.some((c) => c.id === "meetings")) {
    console.log("\n=== Top-level meetings ===");
    const meetingsForGroup = await db
      .collection("meetings")
      .where("groupId", "==", groupDocRef.id)
      .limit(3)
      .get();
    console.log(
      `Meetings where groupId=${groupDocRef.id.slice(0, 8)}... : ${meetingsForGroup.size}`,
    );
    meetingsForGroup.forEach((m) => {
      console.log(`  ${m.id}:`, JSON.stringify(m.data(), null, 2));
    });

    const anyMeeting = await db.collection("meetings").limit(1).get();
    if (!anyMeeting.empty) {
      console.log("\n=== Sample top-level meeting (any group) ===");
      const d = anyMeeting.docs[0].data();
      console.log(`ID: ${anyMeeting.docs[0].id}`);
      console.log(`fields: ${Object.keys(d).sort().join(", ")}`);
      console.log(JSON.stringify(d, null, 2));
    }
  }

  process.exit(0);
})().catch((err) => {
  console.error("Error:", err);
  process.exit(1);
});
