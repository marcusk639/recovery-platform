#!/usr/bin/env npx ts-node

/**
 * User Claims Viewer & Cleanup Script
 * 
 * This script:
 * 1. Views custom claims for all Firebase Auth users
 * 2. Identifies orphaned Firestore user documents (no corresponding Auth user)
 * 3. Optionally deletes orphaned documents
 * 
 * Usage:
 *   npx ts-node viewAndCleanupUsers.ts                    # View claims only
 *   npx ts-node viewAndCleanupUsers.ts --cleanup          # View + delete orphans
 *   npx ts-node viewAndCleanupUsers.ts --cleanup --dry-run # Preview deletions
 *   npx ts-node viewAndCleanupUsers.ts --user <userId>    # View specific user
 */

import * as admin from "firebase-admin";
import * as path from "path";
import { program } from "commander";

// Load service account credentials
const serviceAccountPath = path.join(__dirname, "recovery-connect.json");
const serviceAccount = require(serviceAccountPath);

// Initialize Firebase Admin
admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
});

const db = admin.firestore();
const auth = admin.auth();

// CLI options
program
  .name("viewAndCleanupUsers")
  .description("View user claims and cleanup orphaned Firestore documents")
  .option("-c, --cleanup", "Delete orphaned Firestore user documents")
  .option("-d, --dry-run", "Preview deletions without applying them")
  .option("-u, --user <userId>", "View claims for a specific user")
  .option("-v, --verbose", "Show detailed output for all users")
  .option("--batch-size <number>", "Batch size for processing", "50")
  .parse(process.argv);

const options = program.opts();
const doCleanup = options.cleanup || false;
const isDryRun = options.dryRun || false;
const specificUser = options.user || null;
const isVerbose = options.verbose || false;
const BATCH_SIZE = parseInt(options.batchSize, 10);

interface Stats {
  authUsersFound: number;
  firestoreUsersFound: number;
  orphanedDocuments: number;
  orphanedDocumentsDeleted: number;
  usersWithClaims: number;
  usersWithoutClaims: number;
  errors: string[];
}

const stats: Stats = {
  authUsersFound: 0,
  firestoreUsersFound: 0,
  orphanedDocuments: 0,
  orphanedDocumentsDeleted: 0,
  usersWithClaims: 0,
  usersWithoutClaims: 0,
  errors: [],
};

function formatClaims(claims: any): string {
  if (!claims) return "(no claims)";
  
  const parts: string[] = [];
  
  if (claims.superAdmin) {
    parts.push("🔑 superAdmin");
  }
  
  if (claims.memberGroups?.length > 0) {
    parts.push(`📋 memberGroups: ${claims.memberGroups.length}`);
  }
  
  if (claims.adminGroups?.length > 0) {
    parts.push(`👑 adminGroups: ${claims.adminGroups.length}`);
  }
  
  if (claims.treasurerGroups?.length > 0) {
    parts.push(`💰 treasurerGroups: ${claims.treasurerGroups.length}`);
  }
  
  return parts.length > 0 ? parts.join(", ") : "(empty claims)";
}

/**
 * View claims for a specific user
 */
async function viewSpecificUser(userId: string): Promise<void> {
  console.log(`\n🔍 Looking up user: ${userId}\n`);
  
  // Check Firestore
  const firestoreDoc = await db.collection("users").doc(userId).get();
  const firestoreExists = firestoreDoc.exists;
  
  // Check Auth
  let authUser = null;
  try {
    authUser = await auth.getUser(userId);
  } catch (error: any) {
    if (error.code !== "auth/user-not-found") {
      throw error;
    }
  }
  
  console.log("═".repeat(60));
  console.log(`User ID: ${userId}`);
  console.log("═".repeat(60));
  
  console.log(`\n📁 Firestore Document:`);
  if (firestoreExists) {
    const data = firestoreDoc.data();
    console.log(`   ✓ Exists`);
    console.log(`   Email: ${data?.email || "(not set)"}`);
    console.log(`   Display Name: ${data?.displayName || "(not set)"}`);
    console.log(`   Home Groups: ${data?.homeGroups?.length || 0}`);
  } else {
    console.log(`   ✗ Does not exist`);
  }
  
  console.log(`\n🔐 Firebase Auth:`);
  if (authUser) {
    console.log(`   ✓ Exists`);
    console.log(`   Email: ${authUser.email || "(not set)"}`);
    console.log(`   Display Name: ${authUser.displayName || "(not set)"}`);
    console.log(`   Email Verified: ${authUser.emailVerified}`);
    console.log(`   Created: ${authUser.metadata.creationTime}`);
    console.log(`   Last Sign In: ${authUser.metadata.lastSignInTime}`);
    
    console.log(`\n📜 Custom Claims:`);
    const claims = authUser.customClaims;
    if (claims && Object.keys(claims).length > 0) {
      console.log(JSON.stringify(claims, null, 2));
    } else {
      console.log("   (no custom claims set)");
    }
  } else {
    console.log(`   ✗ Does not exist`);
    if (firestoreExists) {
      console.log(`\n   ⚠️  ORPHANED: Firestore document exists but no Auth account`);
    }
  }
  
  // Check member documents
  const membersSnapshot = await db
    .collection("members")
    .where("userId", "==", userId)
    .get();
  
  console.log(`\n👥 Group Memberships:`);
  if (membersSnapshot.empty) {
    console.log(`   (no group memberships)`);
  } else {
    for (const doc of membersSnapshot.docs) {
      const data = doc.data();
      const roles = data.roles?.join(", ") || "member";
      console.log(`   • ${data.groupId} [${roles}]`);
    }
  }
  
  console.log("");
}

/**
 * View all users and find orphans
 */
async function viewAllUsers(): Promise<void> {
  console.log("\n📊 Analyzing users...\n");
  
  // Get all Firestore user documents
  const firestoreUsersSnapshot = await db.collection("users").get();
  stats.firestoreUsersFound = firestoreUsersSnapshot.size;
  console.log(`Found ${stats.firestoreUsersFound} Firestore user documents`);
  
  // Build set of Firestore user IDs
  const firestoreUserIds = new Set<string>();
  firestoreUsersSnapshot.docs.forEach((doc) => {
    firestoreUserIds.add(doc.id);
  });
  
  // Get all Auth users
  const authUserIds = new Set<string>();
  let nextPageToken: string | undefined;
  
  console.log("Fetching Firebase Auth users...");
  do {
    const listResult = await auth.listUsers(1000, nextPageToken);
    listResult.users.forEach((user) => {
      authUserIds.add(user.uid);
      stats.authUsersFound++;
    });
    nextPageToken = listResult.pageToken;
  } while (nextPageToken);
  
  console.log(`Found ${stats.authUsersFound} Firebase Auth users`);
  
  // Find orphaned documents (in Firestore but not in Auth)
  const orphanedUserIds: string[] = [];
  firestoreUserIds.forEach((userId) => {
    if (!authUserIds.has(userId)) {
      orphanedUserIds.push(userId);
      stats.orphanedDocuments++;
    }
  });
  
  // Display Auth users with claims
  console.log("\n" + "═".repeat(60));
  console.log("🔐 Firebase Auth Users with Custom Claims");
  console.log("═".repeat(60));
  
  nextPageToken = undefined;
  do {
    const listResult = await auth.listUsers(BATCH_SIZE, nextPageToken);
    
    for (const user of listResult.users) {
      const hasClaims = user.customClaims && Object.keys(user.customClaims).length > 0;
      
      if (hasClaims) {
        stats.usersWithClaims++;
        console.log(`\n${user.email || user.uid}`);
        console.log(`   ${formatClaims(user.customClaims)}`);
        
        if (isVerbose) {
          console.log(`   Full claims: ${JSON.stringify(user.customClaims)}`);
        }
      } else {
        stats.usersWithoutClaims++;
        if (isVerbose) {
          console.log(`\n${user.email || user.uid}`);
          console.log(`   (no claims)`);
        }
      }
    }
    
    nextPageToken = listResult.pageToken;
  } while (nextPageToken);
  
  // Display orphaned documents
  if (orphanedUserIds.length > 0) {
    console.log("\n" + "═".repeat(60));
    console.log("⚠️  Orphaned Firestore Documents (no Auth account)");
    console.log("═".repeat(60));
    
    for (const userId of orphanedUserIds) {
      const doc = await db.collection("users").doc(userId).get();
      const data = doc.data();
      console.log(`\n${userId}`);
      console.log(`   Email: ${data?.email || "(not set)"}`);
      console.log(`   Display Name: ${data?.displayName || "(not set)"}`);
      
      if (doCleanup) {
        if (isDryRun) {
          console.log(`   🗑️  Would delete (dry run)`);
        } else {
          try {
            await db.collection("users").doc(userId).delete();
            stats.orphanedDocumentsDeleted++;
            console.log(`   🗑️  Deleted`);
          } catch (error) {
            const errorMessage = `Error deleting ${userId}: ${error}`;
            stats.errors.push(errorMessage);
            console.log(`   ❌ ${errorMessage}`);
          }
        }
      }
    }
  }
}

/**
 * Main function
 */
async function main(): Promise<void> {
  console.log("═".repeat(60));
  console.log("👤 User Claims Viewer & Cleanup Script");
  console.log("═".repeat(60));
  
  if (specificUser) {
    await viewSpecificUser(specificUser);
  } else {
    if (doCleanup) {
      if (isDryRun) {
        console.log("\n⚠️  DRY RUN MODE - Orphans will be listed but not deleted\n");
      } else {
        console.log("\n⚠️  CLEANUP MODE - Orphaned documents will be deleted!\n");
      }
    }
    
    await viewAllUsers();
    
    // Print summary
    console.log("\n" + "═".repeat(60));
    console.log("📊 Summary");
    console.log("═".repeat(60));
    console.log(`\nFirebase Auth Users: ${stats.authUsersFound}`);
    console.log(`  With claims: ${stats.usersWithClaims}`);
    console.log(`  Without claims: ${stats.usersWithoutClaims}`);
    console.log(`\nFirestore User Documents: ${stats.firestoreUsersFound}`);
    console.log(`  Orphaned (no Auth): ${stats.orphanedDocuments}`);
    
    if (doCleanup) {
      if (isDryRun) {
        console.log(`  Would delete: ${stats.orphanedDocuments}`);
      } else {
        console.log(`  Deleted: ${stats.orphanedDocumentsDeleted}`);
      }
    }
    
    if (stats.errors.length > 0) {
      console.log(`\n❌ Errors: ${stats.errors.length}`);
      stats.errors.forEach((err) => console.log(`  - ${err}`));
    }
    
    if (stats.orphanedDocuments > 0 && !doCleanup) {
      console.log(`\n💡 Run with --cleanup to delete orphaned documents`);
      console.log(`   Run with --cleanup --dry-run to preview deletions`);
    }
  }
  
  console.log("");
  process.exit(0);
}

main().catch((error) => {
  console.error("Fatal error:", error);
  process.exit(1);
});

