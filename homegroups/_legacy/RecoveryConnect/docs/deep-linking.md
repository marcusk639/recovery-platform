> ⚠️ **Legacy document.** Carried over from the standalone `RecoveryConnect` repository, archived on 2026-06-06. Historical reference only — may be outdated and is NOT part of current `homegroups` documentation.

## URL scheme inventory (DC-1)

The app uses **two distinct custom URL schemes** for different flows. Both must be registered as iOS URL Types and Android intent-filters; only one (`homegroups-app://` for the invite flow) currently has a Universal Links / App Links HTTPS counterpart.

| Scheme                                                            | Domain pair (HTTPS)                   | Source file                                                                    | Flow                                                       | Target                                                                               |
| ----------------------------------------------------------------- | ------------------------------------- | ------------------------------------------------------------------------------ | ---------------------------------------------------------- | ------------------------------------------------------------------------------------ |
| `homegroups-app://join?...`                                       | `https://homegroups-app.com/join?...` | `web/src/lib/deepLinks.js` (`WEB_ORIGIN`)                                      | Group invite link (shared by admins, opened by invitees)   | `mobile/src/navigation/AppNavigator.tsx` link config → `JoinGroupByInviteCodeScreen` |
| `recoveryconnect://checkin?groupId=G&meetingId=M&date=YYYY-MM-DD` | _(no HTTPS counterpart — QR only)_    | `mobile/src/screens/homegroup/MeetingQRCodeScreen.tsx:38` (`DEEP_LINK_SCHEME`) | QR code scanned at an in-person meeting to mark attendance | `checkInToMeeting` callable                                                          |

**Why two schemes?** Historical: `homegroups-app://` was added when the invite flow was migrated to Universal Links so the same URL works from the web (clipboard share) or from the app. The QR check-in flow was built later and chose `recoveryconnect://` to make scanning a check-in link from a non-app browser fail cleanly (no Universal Link match → "browser doesn't know how to open this"). A user without the app installed sees an error instead of being redirected to a public URL.

**iOS Associated Domains entitlement** and **Android `assetlinks.json`** only need to list `homegroups-app.com` (the invite flow's HTTPS host). The `recoveryconnect://` scheme is custom-URL-only and needs the `Info.plist` URL Types / `AndroidManifest.xml` intent-filter entry but no Universal Links setup.

**Unification path (if/when needed):** Migrate QR check-in to `https://homegroups-app.com/checkin?...` Universal Links, drop the `recoveryconnect://` scheme. This requires (a) updating `MeetingQRCodeScreen.tsx`, (b) adding a `/checkin` path handler in `web/` that detects the platform and either deep-links into the app or shows an "install the app" page, and (c) signing the check-in payload (currently unsigned — see U-8 in `mobile/CLAUDE.md`).

---

Okay, setting up deep linking involves configuration in both the native iOS/Android projects and the React Native code.

**1. Native Project Configuration (Manual Steps)**

You'll need to configure your native projects to recognize the invite links.

- **For `https://homegroups-app.com/join...` links (Recommended - Universal Links / App Links):**
  - **iOS (Universal Links):**
    1.  Host an `apple-app-site-association` (AASA) file on your `https://homegroups-app.com` domain (at `/.well-known/apple-app-site-association`). This file tells iOS which paths your app can handle.
    2.  In Xcode, go to your target's "Signing & Capabilities" tab.
    3.  Add the "Associated Domains" capability.
    4.  Add an entry like `applinks:homegroups-app.com`.
  - **Android (App Links):**
    1.  Host a `assetlinks.json` file on your `https://homegroups-app.com` domain (at `/.well-known/assetlinks.json`). This file verifies ownership.
    2.  In your `android/app/src/main/AndroidManifest.xml`, add an `<intent-filter>` to the relevant `<activity>` tag (usually `MainActivity`) with `android:autoVerify="true"` and specify the `https` scheme, your host (`homegroups-app.com`), and the path prefix (`/join`).

- **For `homegroups-app://join...` links (Custom URL Scheme - Fallback/Easier Setup):**
  - **iOS:**
    1.  In Xcode, go to your target's "Info" tab.
    2.  Expand "URL Types".
    3.  Click "+" to add a new type.
    4.  Set "Identifier" to your bundle ID (e.g., `com.yourcompany.homegroups-app`).
    5.  Set "URL Schemes" to `homegroups-app`.
  - **Android:**
    1.  In your `android/app/src/main/AndroidManifest.xml`, add an `<intent-filter>` to the relevant `<activity>` tag. Specify `android.intent.action.VIEW`, `android.intent.category.DEFAULT`, `android.intent.category.BROWSABLE`, and add a `<data>` tag with `android:scheme="homegroups-app"` and `android:host="join"`.

_References:_

- React Navigation Deep Linking Docs: [https://reactnavigation.org/docs/deep-linking/](https://reactnavigation.org/docs/deep-linking/)
- React Native Linking Docs: [https://reactnative.dev/docs/linking](https://reactnative.dev/docs/linking)

**2. React Native Linking Setup & Navigation**

We'll use React Navigation's linking capabilities to handle incoming links and navigate accordingly.

First, update your main navigation container (likely in `App.tsx` or a root navigator file) to include the linking configuration.

```typescript
// Example: mobile/src/navigation/RootNavigator.tsx or App.tsx

import React, { useEffect, useState } from "react";
import { NavigationContainer, LinkingOptions } from "@react-navigation/native";
import { createNativeStackNavigator } from "@react-navigation/native-stack";
import { Linking } from "react-native";
import auth from "@react-native-firebase/auth";
import functions from "@react-native-firebase/functions"; // For accepting invite

// Import your screens
import SplashScreen from "../screens/SplashScreen";
import AuthNavigator from "./AuthNavigator";
import MainAppNavigator from "./MainAppNavigator"; // Your main tab/stack navigator
import JoinGroupScreen from "../screens/groups/JoinGroupScreen"; // New screen needed

import { useAppDispatch } from "../store";
import { setUser } from "../store/slices/authSlice"; // Assuming you have setUser action

const RootStack = createNativeStackNavigator();

const RootNavigator: React.FC = () => {
  const [initializing, setInitializing] = useState(true);
  const [authUser, setAuthUser] = useState(auth().currentUser);
  const dispatch = useAppDispatch();

  // Handle user state changes
  function onAuthStateChanged(user) {
    setAuthUser(user);
    dispatch(setUser(user)); // Dispatch user to Redux store
    if (initializing) setInitializing(false);
  }

  useEffect(() => {
    const subscriber = auth().onAuthStateChanged(onAuthStateChanged);
    return subscriber; // unsubscribe on unmount
  }, []);

  // --- Deep Linking Configuration ---
  const linking: LinkingOptions<ReactNavigation.RootParamList> = {
    prefixes: ["https://homegroups-app.com", "homegroups-app://"], // Add both prefixes
    config: {
      screens: {
        // Define how URL paths map to screens
        JoinGroup: "join", // Matches /join?code=...
        // Add other deep link routes here if needed
        // e.g., GroupOverview: 'group/:groupId'
      },
    },
    // Optional: Function to get initial URL or handle incoming links
    // You might need more complex logic here depending on auth state
    // See React Navigation docs for advanced usage
  };
  // --- End Deep Linking Configuration ---

  if (initializing) {
    return <SplashScreen />; // Or your custom loading screen
  }

  return (
    <NavigationContainer
      linking={linking}
      fallback={<Text>Loading...</Text> /* Optional Fallback */}
    >
      <RootStack.Navigator screenOptions={{ headerShown: false }}>
        {authUser ? (
          <>
            {/* Main App Screens when logged in */}
            <RootStack.Screen name="MainApp" component={MainAppNavigator} />
            {/* Add JoinGroupScreen accessible when logged in */}
            <RootStack.Screen
              name="JoinGroup"
              component={JoinGroupScreen}
              options={{ presentation: "modal" }} // Example: show as modal
            />
          </>
        ) : (
          <>
            {/* Auth Screens when logged out */}
            <RootStack.Screen name="Auth" component={AuthNavigator} />
            {/* Also add JoinGroupScreen here if you want users to see the invite
                 before logging in, though they'll need to log in to accept */}
            <RootStack.Screen
              name="JoinGroup"
              component={JoinGroupScreen}
              options={{ presentation: "modal" }}
            />
          </>
        )}
      </RootStack.Navigator>
    </NavigationContainer>
  );
};

export default RootNavigator;
```

**3. Create `JoinGroupScreen.tsx`**

This screen will receive the invite code from the deep link parameters, fetch invite details, and allow the user to confirm.

```typescript
// mobile/src/screens/groups/JoinGroupScreen.tsx
import React, { useState, useEffect } from "react";
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
  ScrollView,
} from "react-native";
import { RouteProp, useRoute, useNavigation } from "@react-navigation/native";
import { StackNavigationProp } from "@react-navigation/stack";
import functions from "@react-native-firebase/functions";
import auth from "@react-native-firebase/auth";
import Icon from "react-native-vector-icons/MaterialCommunityIcons"; // Or your preferred icon library

// Define param list for your Root Stack if JoinGroup is part of it
type RootStackParamList = {
  // ... other screens
  JoinGroup: { code?: string }; // Code might be optional if navigated manually
  // ... maybe MainApp, Auth etc.
};

type JoinGroupScreenRouteProp = RouteProp<RootStackParamList, "JoinGroup">;
type JoinGroupScreenNavigationProp = StackNavigationProp<RootStackParamList>;

interface InviteDetails {
  groupId: string;
  groupName: string;
  isValid: boolean;
  message?: string; // e.g., "Expired", "Already used", "Already member"
}

const JoinGroupScreen: React.FC = () => {
  const route = useRoute<JoinGroupScreenRouteProp>();
  const navigation = useNavigation<JoinGroupScreenNavigationProp>();
  const inviteCode = route.params?.code;
  const currentUser = auth().currentUser;

  const [isLoading, setIsLoading] = useState(true);
  const [isJoining, setIsJoining] = useState(false);
  const [inviteDetails, setInviteDetails] = useState<InviteDetails | null>(
    null
  );
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!inviteCode) {
      setError("No invite code provided.");
      setIsLoading(false);
      return;
    }
    if (!currentUser) {
      setError("Please log in or sign up to accept invites.");
      // Optional: Redirect to Auth flow, passing the code along
      // navigation.navigate('Auth', { screen: 'Login', params: { inviteCode }});
      setIsLoading(false);
      return;
    }
    validateInviteCode();
  }, [inviteCode, currentUser]);

  const validateInviteCode = async () => {
    if (!inviteCode || !currentUser) return;

    setIsLoading(true);
    setError(null);
    try {
      const validateInviteFunction = functions().httpsCallable(
        "validateGroupInvite"
      );
      const result = await validateInviteFunction({ code: inviteCode });
      setInviteDetails(result.data as InviteDetails);
    } catch (err: any) {
      console.error("Error validating invite:", err);
      setError(err.message || "Failed to validate invite code.");
      setInviteDetails(null); // Clear details on error
    } finally {
      setIsLoading(false);
    }
  };

  const handleJoinGroup = async () => {
    if (
      !inviteCode ||
      !currentUser ||
      !inviteDetails?.isValid ||
      !inviteDetails?.groupId
    ) {
      return;
    }

    setIsJoining(true);
    setError(null);
    try {
      const acceptInviteFunction =
        functions().httpsCallable("acceptGroupInvite");
      await acceptInviteFunction({ code: inviteCode });

      Alert.alert("Success", `You have joined ${inviteDetails.groupName}!`);
      // Navigate to the group or back to the home screen
      // Need to ensure MainApp navigator is ready if navigating there directly
      navigation.popToTop(); // Go back to the root of the stack
      navigation.navigate("MainApp", {
        screen: "Groups",
        params: {
          screen: "GroupOverview",
          params: {
            groupId: inviteDetails.groupId,
            groupName: inviteDetails.groupName,
          },
        },
      }); // Navigate to the newly joined group
    } catch (err: any) {
      console.error("Error joining group:", err);
      setError(err.message || "Failed to join the group.");
    } finally {
      setIsJoining(false);
    }
  };

  const renderContent = () => {
    if (isLoading) {
      return (
        <ActivityIndicator
          size="large"
          color="#2196F3"
          style={styles.centered}
        />
      );
    }

    if (error) {
      return (
        <View style={styles.centered}>
          <Icon name="alert-circle-outline" size={60} color="#D32F2F" />
          <Text style={styles.errorText}>{error}</Text>
          <TouchableOpacity
            style={styles.closeButton}
            onPress={() => navigation.goBack()}
          >
            <Text style={styles.closeButtonText}>Close</Text>
          </TouchableOpacity>
        </View>
      );
    }

    if (!inviteDetails) {
      return (
        <View style={styles.centered}>
          <Text style={styles.errorText}>Could not load invite details.</Text>
          <TouchableOpacity
            style={styles.closeButton}
            onPress={() => navigation.goBack()}
          >
            <Text style={styles.closeButtonText}>Close</Text>
          </TouchableOpacity>
        </View>
      );
    }

    if (!inviteDetails.isValid) {
      return (
        <View style={styles.centered}>
          <Icon name="cancel" size={60} color="#757575" />
          <Text style={styles.infoText}>
            This invite for "{inviteDetails.groupName || "the group"}" is
            invalid or has expired.
          </Text>
          {inviteDetails.message && (
            <Text style={styles.infoDetailText}>{inviteDetails.message}</Text>
          )}
          <TouchableOpacity
            style={styles.closeButton}
            onPress={() => navigation.goBack()}
          >
            <Text style={styles.closeButtonText}>Close</Text>
          </TouchableOpacity>
        </View>
      );
    }

    // Valid invite
    return (
      <View style={styles.contentContainer}>
        <Icon name="account-group-outline" size={60} color="#2196F3" />
        <Text style={styles.title}>Join Group</Text>
        <Text style={styles.groupName}>{inviteDetails.groupName}</Text>
        <Text style={styles.infoText}>
          You've been invited to join this group.
        </Text>

        <TouchableOpacity
          style={[styles.joinButton, isJoining && styles.disabledButton]}
          onPress={handleJoinGroup}
          disabled={isJoining}
        >
          {isJoining ? (
            <ActivityIndicator size="small" color="#FFFFFF" />
          ) : (
            <Text style={styles.joinButtonText}>Confirm & Join Group</Text>
          )}
        </TouchableOpacity>
        <TouchableOpacity
          style={styles.cancelButton}
          onPress={() => navigation.goBack()}
        >
          <Text style={styles.cancelButtonText}>Cancel</Text>
        </TouchableOpacity>
      </View>
    );
  };

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView contentContainerStyle={styles.scrollContent}>
        {renderContent()}
      </ScrollView>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#F5F5F5",
  },
  scrollContent: {
    flexGrow: 1,
    justifyContent: "center",
    alignItems: "center",
    padding: 20,
  },
  centered: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: 30,
  },
  contentContainer: {
    alignItems: "center",
    backgroundColor: "#FFFFFF",
    padding: 30,
    borderRadius: 12,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
    width: "100%",
    maxWidth: 400,
  },
  title: {
    fontSize: 24,
    fontWeight: "bold",
    color: "#212121",
    marginTop: 15,
    marginBottom: 10,
  },
  groupName: {
    fontSize: 20,
    fontWeight: "600",
    color: "#424242",
    marginBottom: 15,
    textAlign: "center",
  },
  infoText: {
    fontSize: 16,
    color: "#757575",
    textAlign: "center",
    marginBottom: 25,
    lineHeight: 22,
  },
  infoDetailText: {
    fontSize: 14,
    color: "#616161",
    textAlign: "center",
    marginTop: -15, // Pull up slightly
    marginBottom: 25,
  },
  errorText: {
    fontSize: 16,
    color: "#D32F2F",
    textAlign: "center",
    marginTop: 15,
    marginBottom: 20,
  },
  joinButton: {
    backgroundColor: "#4CAF50", // Green for join action
    paddingVertical: 14,
    paddingHorizontal: 30,
    borderRadius: 8,
    width: "100%",
    alignItems: "center",
    marginBottom: 15,
  },
  joinButtonText: {
    color: "#FFFFFF",
    fontSize: 16,
    fontWeight: "bold",
  },
  cancelButton: {
    paddingVertical: 10,
  },
  cancelButtonText: {
    color: "#757575",
    fontSize: 15,
  },
  closeButton: {
    marginTop: 20,
    backgroundColor: "#E0E0E0",
    paddingVertical: 10,
    paddingHorizontal: 25,
    borderRadius: 8,
  },
  closeButtonText: {
    color: "#424242",
    fontSize: 15,
    fontWeight: "500",
  },
  disabledButton: {
    backgroundColor: "#BDBDBD",
  },
});

export default JoinGroupScreen;
```

**4. Backend: Cloud Functions (`validateGroupInvite`, `acceptGroupInvite`)**

Add these Cloud Functions to `functions/src/index.ts`.

```typescript
// functions/src/index.ts
import * as admin from "firebase-admin";
import * as functions from "firebase-functions";
import { HttpsError } from "firebase-functions/v1/https";

// ... (other imports and initialization) ...
const db = admin.firestore();

/**
 * Validates an invite code and returns group details if valid.
 * Checks expiry, status, and if user is already a member.
 */
export const validateGroupInvite = functions.https.onCall(
  async (data, context) => {
    const { code } = data;
    const userId = context.auth?.uid;

    if (!userId) {
      throw new HttpsError("unauthenticated", "User must be logged in.");
    }
    if (!code) {
      throw new HttpsError("invalid-argument", "Invite code is required.");
    }

    try {
      const inviteQuery = db
        .collection("groupInvites")
        .where("code", "==", code)
        .limit(1);
      const inviteSnap = await inviteQuery.get();

      if (inviteSnap.empty) {
        return { isValid: false, message: "Invite code not found." };
        // Note: Don't throw HttpsError here, return invalid status to client
      }

      const inviteData = inviteSnap.docs[0].data();
      const inviteRef = inviteSnap.docs[0].ref;
      const groupId = inviteData.groupId;

      // Check expiry
      if (inviteData.expiresAt.toDate() < new Date()) {
        // Optionally update status to 'expired'
        await inviteRef.update({ status: "expired" });
        return {
          isValid: false,
          groupName: inviteData.groupName,
          message: "This invite code has expired.",
        };
      }

      // Check status
      if (inviteData.status !== "pending") {
        return {
          isValid: false,
          groupName: inviteData.groupName,
          message: `This invite code has already been ${inviteData.status}.`,
        };
      }

      // Check if user is already in the group
      const groupRef = db.collection("groups").doc(groupId);
      const userRef = db.collection("users").doc(userId);
      const [groupSnap, userSnap] = await Promise.all([
        groupRef.get(),
        userRef.get(),
      ]);

      if (!groupSnap.exists) {
        // Group might have been deleted after invite was created
        await inviteRef.update({ status: "invalidated" }); // Mark invite unusable
        return {
          isValid: false,
          message: "The group associated with this invite no longer exists.",
        };
      }

      const groupData = groupSnap.data();
      const userData = userSnap.data();
      const userHomeGroups = userData?.homeGroups || [];

      if (userHomeGroups.includes(groupId)) {
        // User is already a member, invalidate the code for them but show success-like state
        return {
          isValid: false,
          groupName: groupData?.name,
          message: `You are already a member of ${groupData?.name}.`,
        };
      }

      // If all checks pass, the invite is valid for this user
      return { isValid: true, groupId: groupId, groupName: groupData?.name };
    } catch (error) {
      console.error("Error validating invite:", error);
      // Don't throw HttpsError for validation logic failures, only internal errors
      throw new HttpsError(
        "internal",
        "Failed to validate invite code.",
        error,
      );
    }
  },
);

/**
 * Accepts a group invite, adding the user to the group.
 * Performs validation again within a transaction.
 */
export const acceptGroupInvite = functions.https.onCall(
  async (data, context) => {
    const { code } = data;
    const userId = context.auth?.uid;

    if (!userId) {
      throw new HttpsError("unauthenticated", "User must be logged in.");
    }
    if (!code) {
      throw new HttpsError("invalid-argument", "Invite code is required.");
    }

    const userRef = db.collection("users").doc(userId);
    const inviteQuery = db
      .collection("groupInvites")
      .where("code", "==", code)
      .limit(1);

    try {
      await db.runTransaction(async (transaction) => {
        // Re-fetch invite and user within transaction
        const inviteSnap = await transaction.get(inviteQuery);
        const userSnap = await transaction.get(userRef);

        if (inviteSnap.empty) {
          throw new HttpsError(
            "not-found",
            "Invite code not found or invalid.",
          );
        }

        const inviteRef = inviteSnap.docs[0].ref;
        const inviteData = inviteSnap.docs[0].data();
        const groupId = inviteData.groupId;
        const groupRef = db.collection("groups").doc(groupId);
        const groupSnap = await transaction.get(groupRef); // Fetch group in transaction

        if (!groupSnap.exists) {
          transaction.update(inviteRef, { status: "invalidated" }); // Mark unusable
          throw new HttpsError(
            "not-found",
            "Group associated with invite no longer exists.",
          );
        }

        // Re-validate expiry and status within transaction
        if (inviteData.expiresAt.toDate() < new Date()) {
          transaction.update(inviteRef, { status: "expired" });
          throw new HttpsError(
            "failed-precondition",
            "Invite code has expired.",
          );
        }
        if (inviteData.status !== "pending") {
          throw new HttpsError(
            "failed-precondition",
            `Invite code has already been ${inviteData.status}.`,
          );
        }

        // Re-check if user is already a member
        const userData = userSnap.data();
        const userHomeGroups = userData?.homeGroups || [];
        if (userHomeGroups.includes(groupId)) {
          // Should ideally be caught by validateInvite, but double-check
          transaction.update(inviteRef, { status: "invalidated" }); // Mark unusable for this user maybe? Or just ignore.
          throw new HttpsError(
            "already-exists",
            "You are already a member of this group.",
          );
        }

        // All checks pass, perform the join operations
        // 1. Update user's homeGroups
        transaction.update(userRef, {
          homeGroups: admin.firestore.FieldValue.arrayUnion(groupId),
        });

        // 2. Update group's member count (safer than reading/writing count)
        transaction.update(groupRef, {
          memberCount: admin.firestore.FieldValue.increment(1),
          updatedAt: admin.firestore.FieldValue.serverTimestamp(), // Also update group timestamp
        });

        // 3. Update invite status to 'accepted'
        transaction.update(inviteRef, {
          status: "accepted",
          acceptedByUid: userId,
          acceptedAt: admin.firestore.FieldValue.serverTimestamp(),
        });
      });

      console.log(
        `User ${userId} successfully accepted invite ${code} and joined group ${code}`,
      ); // Use code as invite identifier
      return { success: true };
    } catch (error) {
      console.error(
        `Error accepting invite ${code} for user ${userId}:`,
        error,
      );
      if (error instanceof HttpsError) {
        throw error; // Re-throw HttpsErrors
      }
      // Log other errors for debugging
      throw new HttpsError("internal", "Failed to accept group invite.", error);
    }
  },
);

// ... (rest of your functions)
```

**Summary of Changes:**

- **Native Config:** Requires manual setup for Universal Links/App Links and/or Custom URL Schemes.
- **React Native:**
  - Configured `NavigationContainer` with `linking` prop.
  - Added `JoinGroupScreen` to handle invite logic.
  - Added a button in `GroupOverviewScreen` to open the `GroupInviteModal`.
  - `GroupInviteModal` now calls Cloud Functions (`generateGroupInvite`, `sendGroupInviteEmail`).
- **Backend:**
  - Added `generateGroupInvite` function (handles code creation, Firestore doc).
  - Added `sendGroupInviteEmail` function (handles authorization, email sending simulation).
  - Added `validateGroupInvite` function (checks code validity before showing join screen).
  - Added `acceptGroupInvite` function (performs join logic within a transaction).
- **Firestore Rules:** Added basic rules for the `groupInvites` collection.

Remember to deploy the Cloud Functions and configure your email service for the `sendGroupInviteEmail` function to actually send emails.
