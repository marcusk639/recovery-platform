import { Firestore, FieldValue, Timestamp } from "@google-cloud/firestore";
import * as admin from "firebase-admin";
import * as path from "path";
import * as crypto from "crypto";

// --- Configuration ---
const SERVICE_ACCOUNT_PATH = "./recovery-connect.json";
const FIRESTORE_COLLECTION = "users";
const BATCH_SIZE = 400;
const DELAY_MS = 500;
const RETRY_LIMIT = 3;
const RETRY_DELAY_MS = 1000;

// Sample data for generating realistic members
const FIRST_NAMES = [
  "John",
  "Mary",
  "James",
  "Patricia",
  "Robert",
  "Jennifer",
  "Michael",
  "Linda",
  "William",
  "Elizabeth",
  "David",
  "Barbara",
  "Richard",
  "Susan",
  "Joseph",
  "Jessica",
  "Thomas",
  "Sarah",
  "Charles",
  "Karen",
];

const LAST_NAMES = [
  "Smith",
  "Johnson",
  "Williams",
  "Brown",
  "Jones",
  "Garcia",
  "Miller",
  "Davis",
  "Rodriguez",
  "Martinez",
  "Hernandez",
  "Lopez",
  "Gonzalez",
  "Wilson",
  "Anderson",
  "Thomas",
  "Taylor",
  "Moore",
  "Jackson",
  "Martin",
];

const CITIES = [
  "New York",
  "Los Angeles",
  "Chicago",
  "Houston",
  "Phoenix",
  "Philadelphia",
  "San Antonio",
  "San Diego",
  "Dallas",
  "San Jose",
  "Austin",
  "Jacksonville",
  "Fort Worth",
  "Columbus",
  "Charlotte",
  "San Francisco",
  "Indianapolis",
  "Seattle",
  "Denver",
  "Washington",
];

const STATES = [
  "AL",
  "AK",
  "AZ",
  "AR",
  "CA",
  "CO",
  "CT",
  "DE",
  "FL",
  "GA",
  "HI",
  "ID",
  "IL",
  "IN",
  "IA",
  "KS",
  "KY",
  "LA",
  "ME",
  "MD",
  "MA",
  "MI",
  "MN",
  "MS",
  "MO",
  "MT",
  "NE",
  "NV",
  "NH",
  "NJ",
  "NM",
  "NY",
  "NC",
  "ND",
  "OH",
  "OK",
  "OR",
  "PA",
  "RI",
  "SC",
  "SD",
  "TN",
  "TX",
  "UT",
  "VT",
  "VA",
  "WA",
  "WV",
  "WI",
  "WY",
];

const ZIP_CODES = [
  "10001",
  "90001",
  "60601",
  "77001",
  "85001",
  "19101",
  "78201",
  "92101",
  "75201",
  "95101",
  "73301",
  "32201",
  "76101",
  "43201",
  "28201",
  "94101",
  "46201",
  "98101",
  "80201",
  "20001",
];

const MEETING_TYPES = [
  "AA",
  "NA",
  "CA",
  "CMA",
  "HA",
  "MA",
  "SA",
  "SAA",
  "SLAA",
  "GA",
];

const SPONSORSHIP_STATUSES = [
  "Available",
  "Not Available",
  "Limited Availability",
];

// Define the User class structure
class User {
  id?: string;
  email: string = "";
  displayName: string = "";
  firstName: string = "";
  lastName: string = "";
  phoneNumber?: string;
  address?: string;
  city?: string;
  state?: string;
  zipCode?: string;
  sobrietyDate?: Date;
  showSobrietyDate: boolean = true;
  showPhoneNumber: boolean = true;
  meetingTypes: string[] = [];
  isAvailableToSponsor: boolean = false;
  maxSponsees: number = 0;
  sponsorRequirements?: string;
  sponsorBio?: string;
  profilePhotoURL?: string;
  createdAt: Date = new Date();
  updatedAt: Date = new Date();
  lastLoginAt?: Date;
  isAdmin: boolean = false;
  isSuspended: boolean = false;
  suspensionReason?: string;
  suspensionEndDate?: Date;
  notificationSettings = {
    meetings: true,
    announcements: true,
    urgentAnnouncements: true,
    email: true,
    push: true,
  };
}

// Helper function to generate random date within a range
function randomDate(start: Date, end: Date): Date {
  return new Date(
    start.getTime() + Math.random() * (end.getTime() - start.getTime())
  );
}

// Helper function to generate random phone number
function generatePhoneNumber(): string {
  return `(${Math.floor(Math.random() * 900) + 100}) ${
    Math.floor(Math.random() * 900) + 100
  }-${Math.floor(Math.random() * 9000) + 1000}`;
}

// Helper function to generate random email
function generateEmail(firstName: string, lastName: string): string {
  const domains = [
    "gmail.com",
    "yahoo.com",
    "hotmail.com",
    "outlook.com",
    "icloud.com",
  ];
  const domain = domains[Math.floor(Math.random() * domains.length)];
  return `${firstName.toLowerCase()}.${lastName.toLowerCase()}${Math.floor(
    Math.random() * 1000
  )}@${domain}`;
}

// Helper function to generate random meeting types
function generateMeetingTypes(): string[] {
  const count = Math.floor(Math.random() * 3) + 1; // 1-3 meeting types
  const shuffled = [...MEETING_TYPES].sort(() => 0.5 - Math.random());
  return shuffled.slice(0, count);
}

// Helper function to generate random sobriety date
function generateSobrietyDate(): Date {
  const now = new Date();
  const yearsAgo = Math.floor(Math.random() * 20) + 1; // 1-20 years sober
  const date = new Date(now);
  date.setFullYear(now.getFullYear() - yearsAgo);
  return date;
}

// Helper function to generate random sponsor requirements
function generateSponsorRequirements(): string {
  const requirements = [
    "30 days sober",
    "Working the steps",
    "Has a sponsor",
    "Regular meeting attendance",
    "Willing to work with newcomers",
    "Experience with the Big Book",
    "Experience with the 12 Steps",
    "Experience with sponsorship",
  ];
  const count = Math.floor(Math.random() * 3) + 1; // 1-3 requirements
  const shuffled = [...requirements].sort(() => 0.5 - Math.random());
  return shuffled.slice(0, count).join(", ");
}

// Helper function to generate random sponsor bio
function generateSponsorBio(yearsSober: number): string {
  const bios = [
    `Experienced sponsor with ${yearsSober} years of sobriety`,
    `Dedicated to helping others achieve sobriety`,
    `Passionate about the 12-step program`,
    `Committed to service work and sponsorship`,
    `Focus on working with newcomers`,
    `Specializes in step work and sponsorship`,
    `Emphasizes spiritual growth and recovery`,
    `Works with both men and women`,
  ];
  const count = Math.floor(Math.random() * 2) + 1; // 1-2 bio points
  const shuffled = [...bios].sort(() => 0.5 - Math.random());
  return shuffled.slice(0, count).join(". ");
}

// Function to initialize Firebase Admin SDK
function initializeFirebaseAdmin(): admin.app.App {
  if (!SERVICE_ACCOUNT_PATH) {
    throw new Error(
      "GOOGLE_APPLICATION_CREDENTIALS environment variable is not set."
    );
  }
  const serviceAccount = require(path.resolve(SERVICE_ACCOUNT_PATH));
  console.log("Initializing Firebase Admin SDK...");
  return admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
  });
}

// Function to generate a unique hash ID for a user
function generateUserHash(user: User): string {
  const userString = [
    user.email,
    user.firstName,
    user.lastName,
    user.phoneNumber || "",
    user.sobrietyDate?.toISOString() || "",
  ].join("|");

  const hash = crypto.createHash("sha1").update(userString).digest("hex");
  return hash.substring(0, 24);
}

// Function to create a random user
function createRandomUser(): User {
  const firstName = FIRST_NAMES[Math.floor(Math.random() * FIRST_NAMES.length)];
  const lastName = LAST_NAMES[Math.floor(Math.random() * LAST_NAMES.length)];
  const city = CITIES[Math.floor(Math.random() * CITIES.length)];
  const state = STATES[Math.floor(Math.random() * STATES.length)];
  const zipCode = ZIP_CODES[Math.floor(Math.random() * ZIP_CODES.length)];
  const sobrietyDate = generateSobrietyDate();
  const yearsSober = new Date().getFullYear() - sobrietyDate.getFullYear();
  const isAvailableToSponsor = Math.random() > 0.7; // 30% chance of being available to sponsor

  const user = new User();
  user.email = generateEmail(firstName, lastName);
  user.displayName = `${firstName} ${lastName}`;
  user.firstName = firstName;
  user.lastName = lastName;
  user.phoneNumber = generatePhoneNumber();
  user.address = `${Math.floor(Math.random() * 9999) + 1} Main St`;
  user.city = city;
  user.state = state;
  user.zipCode = zipCode;
  user.sobrietyDate = sobrietyDate;
  user.showSobrietyDate = Math.random() > 0.3; // 70% chance of showing sobriety date
  user.showPhoneNumber = Math.random() > 0.3; // 70% chance of showing phone number
  user.meetingTypes = generateMeetingTypes();
  user.isAvailableToSponsor = isAvailableToSponsor;
  user.maxSponsees = isAvailableToSponsor
    ? Math.floor(Math.random() * 3) + 1
    : 0;
  user.sponsorRequirements = isAvailableToSponsor
    ? generateSponsorRequirements()
    : undefined;
  user.sponsorBio = isAvailableToSponsor
    ? generateSponsorBio(yearsSober)
    : undefined;
  user.isAdmin = Math.random() > 0.95; // 5% chance of being admin
  user.isSuspended = Math.random() > 0.95; // 5% chance of being suspended
  if (user.isSuspended) {
    user.suspensionReason = "Test suspension";
    user.suspensionEndDate = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000); // 30 days from now
  }

  return user;
}

// Main function to populate members
async function populateMembers() {
  const app = initializeFirebaseAdmin();
  const db = admin.firestore(app);
  const usersCollection = db.collection(FIRESTORE_COLLECTION);
  let batch = db.batch();
  let usersInBatch = 0;
  let totalUsersCreated = 0;
  const NUM_USERS = 1000; // Number of users to create

  console.log(`Starting member population...`);

  for (let i = 0; i < NUM_USERS; i++) {
    const user = createRandomUser();
    user.id = generateUserHash(user);

    const docRef = usersCollection.doc(user.id);
    batch.set(docRef, user, { merge: true });

    usersInBatch++;
    totalUsersCreated++;

    if (usersInBatch >= BATCH_SIZE) {
      try {
        console.log(`Committing batch of ${usersInBatch} users...`);
        await batch.commit();
        console.log("Batch committed successfully.");
      } catch (error) {
        console.error("Error committing batch:", error);
      } finally {
        batch = db.batch();
        usersInBatch = 0;
      }
    }

    // Delay between operations
    await new Promise((resolve) => setTimeout(resolve, DELAY_MS));
  }

  // Commit any remaining users in the last batch
  if (usersInBatch > 0) {
    try {
      console.log(`Committing final batch of ${usersInBatch} users...`);
      await batch.commit();
      console.log("Final batch committed successfully.");
    } catch (error) {
      console.error("Error committing final batch:", error);
    }
  }

  console.log("\n--- Population Complete ---");
  console.log(`Total Users Created: ${totalUsersCreated}`);
  console.log("---------------------------\n");

  // Clean up Firebase app instance
  await app.delete();
}

// Execute the script
populateMembers()
  .then(() => {
    console.log("Script finished successfully.");
    process.exit(0);
  })
  .catch((error) => {
    console.error("Script failed with error:", error);
    process.exit(1);
  });
