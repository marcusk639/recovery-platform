I'll compile the contents of our conversation into a document format. This will include all of our discussion about the Homegroups app, including the requirements, design, and implementation details for both the frontend and backend components.

# Homegroups App Development Document

## Executive Summary

Homegroups is a mobile application designed to streamline the management of 12-step homegroups while respecting the traditions of anonymity and group autonomy. The MVP focuses on core functionality that solves immediate pain points for homegroups with a privacy-first approach. The app will be available on iOS and Android platforms with a minimal $1/month fee for groups wishing to access premium features.

## Core Problem Statement

12-step recovery groups face challenges with:

- Meeting coordination and announcements
- Maintaining financial records between rotating treasurers
- Preserving anonymity while enabling digital connection
- Communication without relying on social media platforms

## MVP Feature Set

### 1. Meeting Directory & Management

- **Simple meeting finder** with location-based search
- **Offline meeting list** for travelers
- **Personal meeting schedule** with optional reminders
- **Meeting details page** with format information, directions
- **Join group** functionality to connect to homegroups

### 2. Group Communication

- **Announcements channel** for official group communications
- **Basic group chat** with privacy protections
- **Direct messaging** between members (securely transmitted via TLS)
- **Celebration notifications** (sobriety anniversaries, events)

### 3. Treasury Management

- **Basic income/expense tracking** with categories
- **7th Tradition record keeping**
- **Balance and prudent reserve monitoring**
- **Simple financial reports** for business meetings
- **Seamless treasurer transition** capability

### 4. Privacy & Security

- **First name/initial only** display options
- **TLS encryption** for all communications
- **No social media integration**
- **Granular privacy controls**
- **Local data storage** where possible

## Technical Architecture

### Frontend

- React Native for cross-platform mobile development
- Clean, accessible UI with offline capabilities
- Simple onboarding flow focused on privacy

### Backend

- Firebase/Firestore for authentication and data storage
- Secure data transmission via TLS
- Serverless architecture for scalability

### User Roles

- **Group Members**: Access group information, participate in discussions
- **Group Administrators**: Manage announcements, meeting details, treasury
- **App Administrators**: Verify meeting information, provide support

### Monetization Model

- Basic features free for all users
- $1/month premium tier for groups (billed annually at $12)
- Premium features include treasury management, advanced reporting

## Implementation

### React Native Frontend Components

#### Authentication Flow

```typescript
// SplashScreen.tsx
import React, { useEffect, useRef } from "react";
import { View, Text, StyleSheet, Animated, Easing } from "react-native";

const SplashScreen = ({ navigation }) => {
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const loadingAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    // Start fade-in animation
    Animated.timing(fadeAnim, {
      toValue: 1,
      duration: 1000,
      easing: Easing.ease,
      useNativeDriver: true,
    }).start();

    // Start loading bar animation
    Animated.timing(loadingAnim, {
      toValue: 1,
      duration: 1800,
      easing: Easing.linear,
      useNativeDriver: false,
    }).start();

    // Navigate to Auth screen after a delay
    const timer = setTimeout(() => {
      navigation.replace("Auth");
    }, 2000);

    return () => clearTimeout(timer);
  }, [fadeAnim, loadingAnim, navigation]);

  // Component render method continues...
};
```

#### Home Screen

```typescript
import React, { useEffect, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  RefreshControl,
  SafeAreaView,
  Alert,
  FlatList,
} from "react-native";
import auth from "@react-native-firebase/auth";
import firestore from "@react-native-firebase/firestore";

const HomeScreen = ({ navigation }) => {
  const [announcements, setAnnouncements] = useState([]);
  const [upcomingMeetings, setUpcomingMeetings] = useState([]);
  const [celebrations, setCelebrations] = useState([]);
  const [homeGroups, setHomeGroups] = useState([]);
  const [refreshing, setRefreshing] = useState(false);
  const [userName, setUserName] = useState("");

  // Implementation includes loading data, navigating to groups, and rendering UI components
};
```

#### HomeGroup Screen

```typescript
import React, { useState, useEffect } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Image,
  SafeAreaView,
  RefreshControl,
  Alert,
  Modal,
  TextInput,
} from "react-native";

const HomeGroupScreen = ({ route, navigation }) => {
  const { groupId } = route.params;
  const [refreshing, setRefreshing] = useState(false);
  const [activeTab, setActiveTab] = useState("home");

  // States for group data, members, announcements, events, etc.

  // Methods for managing group content, toggling tabs, etc.

  return (
    <SafeAreaView style={styles.container}>
      {/* Group Header */}
      <View style={styles.header}>
        <TouchableOpacity
          style={styles.backButton}
          onPress={() => navigation.goBack()}
        >
          <Text style={styles.backButtonText}>←</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>{group.name}</Text>
        <TouchableOpacity
          style={styles.menuButton}
          onPress={() => Alert.alert("Menu", "Group options would appear here")}
        >
          <Text style={styles.menuButtonText}>⋮</Text>
        </TouchableOpacity>
      </View>

      {/* Tab Navigation */}
      <View style={styles.tabBar}>
        {/* Tab buttons for Home, Members, Literature */}
      </View>

      {/* Main Content - Renders different content based on active tab */}
      <ScrollView>
        {activeTab === "home" && renderHomeTab()}
        {activeTab === "members" && renderMembersTab()}
        {activeTab === "literature" && renderLiteratureTab()}
      </ScrollView>

      {/* Modals for adding announcements, events, etc. */}
    </SafeAreaView>
  );
};
```

### Firebase/Firestore Backend

#### Firestore Data Schema

```javascript
// Collection: users
{
  uid: string,          // Firebase Auth UID
  email: string,        // User's email address
  displayName: string,  // First name or initial
  recoveryDate: string | null,  // YYYY-MM-DD (optional)
  createdAt: timestamp,
  updatedAt: timestamp,
  lastLogin: timestamp,

  notificationSettings: {
    meetings: boolean,      // default: true
    announcements: boolean, // default: true
    celebrations: boolean   // default: true
  },

  privacySettings: {
    showRecoveryDate: boolean,    // default: false
    allowDirectMessages: boolean  // default: true
  },

  homeGroups: [string],  // Array of group IDs
  role: 'user' | 'admin' // default: 'user'
}

// Collection: groups
{
  id: string,
  name: string,
  description: string,
  meetingDay: string,
  meetingTime: string,
  location: string,
  address: string | null,
  format: string,
  isOnline: boolean,
  onlineLink: string | null,
  createdAt: timestamp,
  updatedAt: timestamp,
  foundedDate: string | null,  // YYYY-MM-DD
  memberCount: number,         // For quick access
  admins: [string]             // Array of admin user IDs
}

// Sub-collections for groups include: members, announcements, events, transactions
```

#### Group Service Implementation

```typescript
import * as firestoreUtils from "../utils/firestore";
import { ApiError } from "../middleware/error";
import { STATUS_CODES, ERROR_MESSAGES } from "../utils/constants";
import { GroupCreationData, GroupUpdateData } from "../types/group";
import logger from "../utils/logger";

/**
 * Create a new group
 */
export const createGroup = async (
  userId: string,
  groupData: GroupCreationData
) => {
  try {
    // Generate a unique ID for the group
    const groupId = firestoreUtils.generateId();

    // Prepare the group document
    const newGroup = {
      ...groupData,
      id: groupId,
      memberCount: 1,
      admins: [userId],
    };

    // Run in a transaction to ensure consistency
    await firestoreUtils.runTransaction(async (transaction) => {
      // Implementation details...
    });

    // Get the newly created group
    const group = await firestoreUtils.getDoc(`groups/${groupId}`);

    return { ...group, isAdmin: true };
  } catch (error) {
    // Error handling...
  }
};

// Additional methods for managing groups, members, announcements, events, etc.
```

#### Treasury Service Implementation

```typescript
import * as firestoreUtils from "../utils/firestore";
import { ApiError } from "../middleware/error";
import { STATUS_CODES, ERROR_MESSAGES } from "../utils/constants";
import logger from "../utils/logger";
import { TransactionType, TransactionCategory } from "../types/treasury";
import { getGroupById } from "./groupService";

/**
 * Get all transactions for a group
 */
export const getGroupTransactions = async (
  userId: string,
  groupId: string,
  limit: number = 50,
  startAfter?: string
) => {
  try {
    // Verify the group exists and user is a member
    await getGroupById(userId, groupId);

    // Build the query
    let query = firestoreUtils
      .colRef(`groups/${groupId}/transactions`)
      .orderBy("date", "desc")
      .limit(limit);

    // Implementation details...

    return transactions;
  } catch (error) {
    // Error handling...
  }
};

// Methods for creating, updating, deleting transactions and managing treasury overview
```

#### API Controller Implementation

```typescript
import { Request, Response } from "express";
import { AuthRequest } from "../types/auth";
import * as groupService from "../services/groupService";
import { asyncHandler } from "../middleware/error";
import { STATUS_CODES, SUCCESS_MESSAGES } from "../utils/constants";
import logger from "../utils/logger";

/**
 * @desc    Create a new group
 * @route   POST /api/v1/groups
 * @access  Private
 */
export const createGroup = asyncHandler(
  async (req: AuthRequest, res: Response) => {
    const userId = req.user!.uid;
    const groupData = req.body;

    const group = await groupService.createGroup(userId, groupData);

    res.status(STATUS_CODES.CREATED).json({
      success: true,
      message: SUCCESS_MESSAGES.GROUP_CREATED,
      data: group,
    });
  }
);

// Additional controller methods for groups, members, announcements, events, etc.
```

## Development Roadmap

1. **Core Infrastructure** (4 weeks)

   - User authentication system
   - Meeting directory and search functionality
   - Basic group profile pages
   - Privacy controls implementation

2. **Communication Tools** (3 weeks)

   - Group announcements system
   - Direct messaging infrastructure
   - Group chat functionality
   - Push notification system

3. **Treasury Features** (3 weeks)

   - Basic financial tracking
   - Income/expense entry
   - Reporting functionality
   - Treasurer transition tools

4. **Testing & Refinement** (2 weeks)
   - Beta testing with select recovery groups
   - Bug fixes and UI refinements
   - Performance optimization
   - Privacy and security audit

## Future Enhancements

- Business meeting tools and agenda management
- Service commitment tracking and rotation reminders
- Literature reference integration
- Advanced treasury features (digital 7th tradition)
- Additional fellowship-specific customizations

## Conclusion

Homegroups provides a comprehensive digital platform for 12-step recovery groups while maintaining the privacy and anonymity traditions that are central to these programs. The application balances modern technology with recovery principles to create a tool that enhances group management without compromising core values.
