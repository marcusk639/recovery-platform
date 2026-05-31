/**
 * Ensures Firebase Admin is initialized before api/firestore is imported.
 * Standalone scripts (node lib/scripts/...) do not load src/init.ts.
 */
import dotenv from "dotenv";
import * as admin from "firebase-admin";

const serviceAccount = require("../../service-key.json")["phoenix-cleanhouse"];
dotenv.config({ path: "../../.env" });

if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
    databaseURL: "https://phoenix-cleanhouse.firebaseio.com",
  });
}
