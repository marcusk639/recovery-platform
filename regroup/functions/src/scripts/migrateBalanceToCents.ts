import * as admin from "firebase-admin";
admin.initializeApp();
const db = admin.firestore();

async function migrate() {
  const guests = await db.collection("guests").get();
  let batch = db.batch();
  let count = 0;

  for (const doc of guests.docs) {
    const balance: unknown = doc.data().balance;
    if (typeof balance === "number") {
      batch.update(doc.ref, {
        rentOwed: Math.round(balance * 100),
        balance: admin.firestore.FieldValue.delete(),
      });
      count++;
      if (count % 499 === 0) {
        await batch.commit();
        batch = db.batch();
        console.log(`Committed ${count} guest docs`);
      }
    }
  }
  await batch.commit();
  console.log(`Migration complete: ${count} docs updated`);
}

migrate().catch(console.error);
