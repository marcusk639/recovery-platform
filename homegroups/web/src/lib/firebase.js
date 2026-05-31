import { initializeApp } from "firebase/app";
import { getAnalytics } from "firebase/analytics";
import { getFirestore } from "firebase/firestore";
import { getAuth } from "firebase/auth";
import { getFunctions } from "firebase/functions";

const firebaseConfig = {
  apiKey: "AIzaSyDOCpZXxCw7kbIzwWCiXCJwreyW74n94bA",
  authDomain: "recovery-connect-cad4b.firebaseapp.com",
  databaseURL: "https://recovery-connect-cad4b-default-rtdb.firebaseio.com",
  projectId: "recovery-connect-cad4b",
  storageBucket: "recovery-connect-cad4b.firebasestorage.app",
  messagingSenderId: "421876308052",
  appId: "1:421876308052:web:64eddf510591d077f535c1",
  measurementId: "G-0X18WFTG33",
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);
const analytics = getAnalytics(app);
const db = getFirestore(app);
const auth = getAuth(app);
const functions = getFunctions(app);

export { app, analytics, db, auth, functions };
