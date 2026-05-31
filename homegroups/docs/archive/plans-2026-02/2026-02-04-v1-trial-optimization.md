---
archived: true
archived_at: 2026-05-25
archived_reason: Plan shipped; tracked DONE in docs/plans/README.md (with PR# or commit ref). Preserved for historical reference.
original_path: docs/plans/2026-02-04-v1-trial-optimization.md
---

# Trial Optimization Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Improve trial-to-paid conversion by educating users about features and reminding them before trial ends.

**Architecture:** Track trial start date, show trial status in UI, send push notifications at key moments (Day 5, Day 7), and provide clear upgrade path.

**Tech Stack:** React Native, Firebase Cloud Functions, FCM, Stripe

**Priority:** V1.1
**Estimated Effort:** 6-8 hours
**Revenue Impact:** Conversion - Reduces accidental churn from users who forget trial is ending

---

## Task 1: Add Trial Status Banner Component

**Files:**
- Create: `mobile/src/components/subscription/TrialStatusBanner.tsx`

**Step 1: Create the banner component**

```typescript
import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { useTheme } from '../../contexts/ThemeContext';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import { useNavigation } from '@react-navigation/native';

interface TrialStatusBannerProps {
  daysRemaining: number;
  onUpgrade: () => void;
}

export const TrialStatusBanner: React.FC<TrialStatusBannerProps> = ({
  daysRemaining,
  onUpgrade,
}) => {
  const { colors } = useTheme();
  const navigation = useNavigation();

  // Don't show if not in trial or already expired
  if (daysRemaining < 0) return null;

  const isUrgent = daysRemaining <= 2;
  const backgroundColor = isUrgent ? colors.error : colors.primaryLight;
  const textColor = isUrgent ? colors.white : colors.text;

  const getMessage = () => {
    if (daysRemaining === 0) return 'Trial ends today!';
    if (daysRemaining === 1) return 'Trial ends tomorrow';
    return `Day ${8 - daysRemaining} of 7-day trial`;
  };

  return (
    <View style={[styles.container, { backgroundColor }]}>
      <View style={styles.content}>
        <Icon
          name={isUrgent ? 'alert-circle' : 'clock-outline'}
          size={20}
          color={textColor}
        />
        <View style={styles.textContainer}>
          <Text style={[styles.message, { color: textColor }]}>
            {getMessage()}
          </Text>
          {daysRemaining <= 3 && (
            <Text style={[styles.submessage, { color: textColor, opacity: 0.9 }]}>
              Keep treasury, announcements & more
            </Text>
          )}
        </View>
      </View>
      <TouchableOpacity style={styles.upgradeButton} onPress={onUpgrade}>
        <Text style={[styles.upgradeText, { color: colors.primary }]}>
          {isUrgent ? 'Upgrade Now' : 'Learn More'}
        </Text>
      </TouchableOpacity>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 12,
    paddingHorizontal: 16,
  },
  content: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  textContainer: {
    marginLeft: 10,
    flex: 1,
  },
  message: {
    fontSize: 14,
    fontWeight: '600',
  },
  submessage: {
    fontSize: 12,
    marginTop: 2,
  },
  upgradeButton: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
    backgroundColor: 'white',
  },
  upgradeText: {
    fontSize: 13,
    fontWeight: '600',
  },
});

export default TrialStatusBanner;
```

**Step 2: Commit**

```bash
git add mobile/src/components/subscription/TrialStatusBanner.tsx
git commit -m "feat(trial): create TrialStatusBanner component"
```

---

## Task 2: Create Trial Status Hook

**Files:**
- Create: `mobile/src/hooks/useTrialStatus.ts`

**Step 1: Create the hook**

```typescript
import { useMemo } from 'react';
import { useSelector } from 'react-redux';
import { selectCurrentGroup } from '../store/slices/groupsSlice';

interface TrialStatus {
  isInTrial: boolean;
  daysRemaining: number;
  trialStartDate: Date | null;
  trialEndDate: Date | null;
  isExpired: boolean;
  isActive: boolean;
}

export function useTrialStatus(groupId: string): TrialStatus {
  const group = useSelector((state) => selectCurrentGroup(state, groupId));

  return useMemo(() => {
    const subscriptionStatus = group?.subscriptionStatus;
    const trialEnd = group?.subscriptionTrialEnd;

    // Not in trial
    if (subscriptionStatus !== 'trialing' || !trialEnd) {
      return {
        isInTrial: false,
        daysRemaining: -1,
        trialStartDate: null,
        trialEndDate: null,
        isExpired: subscriptionStatus === 'cancelled' || subscriptionStatus === 'past_due',
        isActive: subscriptionStatus === 'active',
      };
    }

    const now = new Date();
    const endDate = trialEnd instanceof Date ? trialEnd : trialEnd.toDate();
    const startDate = new Date(endDate.getTime() - 7 * 24 * 60 * 60 * 1000);

    const msRemaining = endDate.getTime() - now.getTime();
    const daysRemaining = Math.ceil(msRemaining / (24 * 60 * 60 * 1000));

    return {
      isInTrial: true,
      daysRemaining: Math.max(0, daysRemaining),
      trialStartDate: startDate,
      trialEndDate: endDate,
      isExpired: daysRemaining < 0,
      isActive: false,
    };
  }, [group?.subscriptionStatus, group?.subscriptionTrialEnd]);
}

export default useTrialStatus;
```

**Step 2: Commit**

```bash
git add mobile/src/hooks/useTrialStatus.ts
git commit -m "feat(trial): create useTrialStatus hook"
```

---

## Task 3: Display Trial Banner in Group Screens

**Files:**
- Modify: `mobile/src/screens/homegroup/GroupOverviewScreen.tsx`

**Step 1: Add trial banner to group overview**

```typescript
import TrialStatusBanner from '../../components/subscription/TrialStatusBanner';
import useTrialStatus from '../../hooks/useTrialStatus';

const GroupOverviewScreen: React.FC<Props> = ({ route, navigation }) => {
  const { groupId, groupName } = route.params;
  const trialStatus = useTrialStatus(groupId);

  const handleUpgrade = () => {
    navigation.navigate('SubscriptionUpgrade', { groupId, groupName });
  };

  return (
    <View style={styles.container}>
      {/* Show trial banner for admins */}
      {isAdmin && trialStatus.isInTrial && (
        <TrialStatusBanner
          daysRemaining={trialStatus.daysRemaining}
          onUpgrade={handleUpgrade}
        />
      )}

      {/* Rest of screen content */}
      <ScrollView>
        {/* ... */}
      </ScrollView>
    </View>
  );
};
```

**Step 2: Commit**

```bash
git add mobile/src/screens/homegroup/GroupOverviewScreen.tsx
git commit -m "feat(trial): display trial banner on group overview"
```

---

## Task 4: Create Trial End Reminder Cloud Function

**Files:**
- Create: `functions/src/triggers/pubsub/scheduledTrialReminders.ts`
- Modify: `functions/src/index.ts`

**Step 1: Create the scheduled function**

```typescript
import * as functions from 'firebase-functions';
import * as admin from 'firebase-admin';

const db = admin.firestore();
const messaging = admin.messaging();

/**
 * Runs daily at 10 AM UTC to send trial ending reminders
 */
export const scheduledTrialReminders = functions.pubsub
  .schedule('0 10 * * *')
  .timeZone('UTC')
  .onRun(async (context) => {
    const now = admin.firestore.Timestamp.now();
    const twoDaysFromNow = new Date(Date.now() + 2 * 24 * 60 * 60 * 1000);
    const threeDaysFromNow = new Date(Date.now() + 3 * 24 * 60 * 60 * 1000);

    // Find groups with trials ending in 2-3 days (Day 5 reminder)
    const day5Groups = await findTrialingGroups(twoDaysFromNow, threeDaysFromNow);

    // Find groups with trials ending today or tomorrow (Day 7 reminder)
    const dayOfGroups = await findTrialingGroups(
      new Date(),
      new Date(Date.now() + 1 * 24 * 60 * 60 * 1000)
    );

    // Send Day 5 reminders
    for (const group of day5Groups) {
      await sendTrialReminder(group, 'day5');
    }

    // Send Day 7 (urgent) reminders
    for (const group of dayOfGroups) {
      await sendTrialReminder(group, 'day7');
    }

    console.log(`Sent ${day5Groups.length} Day 5 reminders and ${dayOfGroups.length} Day 7 reminders`);
    return null;
  });

async function findTrialingGroups(from: Date, to: Date): Promise<any[]> {
  const fromTimestamp = admin.firestore.Timestamp.fromDate(from);
  const toTimestamp = admin.firestore.Timestamp.fromDate(to);

  const snapshot = await db
    .collection('groups')
    .where('subscriptionStatus', '==', 'trialing')
    .where('subscriptionTrialEnd', '>=', fromTimestamp)
    .where('subscriptionTrialEnd', '<=', toTimestamp)
    .get();

  return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
}

async function sendTrialReminder(group: any, type: 'day5' | 'day7') {
  // Get admin tokens
  const admins = group.admins || [];
  const tokens: string[] = [];

  for (const adminId of admins) {
    const userDoc = await db.collection('users').doc(adminId).get();
    if (userDoc.exists) {
      const userData = userDoc.data();
      if (userData?.fcmTokens?.length > 0 &&
          userData?.notificationSettings?.allowPushNotifications !== false) {
        tokens.push(...userData.fcmTokens);
      }
    }
  }

  if (tokens.length === 0) return;

  const isUrgent = type === 'day7';

  const title = isUrgent
    ? `${group.name}: Trial Ends Tomorrow!`
    : `${group.name}: 2 Days Left in Trial`;

  const body = isUrgent
    ? 'Upgrade now to keep treasury, announcements, and all admin features.'
    : 'Your free trial is almost over. Upgrade to continue using all features.';

  const message: admin.messaging.MulticastMessage = {
    tokens,
    notification: {
      title,
      body,
    },
    data: {
      type: 'trial_reminder',
      groupId: group.id,
      urgency: type,
    },
    apns: {
      payload: {
        aps: {
          sound: 'default',
          badge: 1,
          ...(isUrgent && { 'interruption-level': 'time-sensitive' }),
        },
      },
    },
    android: {
      priority: 'high',
      notification: {
        sound: 'default',
        priority: isUrgent ? 'max' : 'high',
      },
    },
  };

  try {
    await messaging.sendEachForMulticast(message);
    console.log(`Sent ${type} reminder for group ${group.id}`);
  } catch (error) {
    console.error(`Failed to send ${type} reminder for group ${group.id}:`, error);
  }
}
```

**Step 2: Export from index**

```typescript
export { scheduledTrialReminders } from './triggers/pubsub/scheduledTrialReminders';
```

**Step 3: Commit**

```bash
git add functions/src/triggers/pubsub/scheduledTrialReminders.ts functions/src/index.ts
git commit -m "feat(trial): create scheduled trial reminder notifications"
```

---

## Task 5: Create Feature Tooltips Component

**Files:**
- Create: `mobile/src/components/subscription/FeatureTooltip.tsx`

**Step 1: Create tooltip component**

```typescript
import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Modal,
  Animated,
} from 'react-native';
import { useTheme } from '../../contexts/ThemeContext';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import AsyncStorage from '@react-native-async-storage/async-storage';

interface FeatureTooltipProps {
  featureId: string;
  title: string;
  description: string;
  position?: 'top' | 'bottom';
  children: React.ReactNode;
}

export const FeatureTooltip: React.FC<FeatureTooltipProps> = ({
  featureId,
  title,
  description,
  position = 'top',
  children,
}) => {
  const { colors } = useTheme();
  const [visible, setVisible] = useState(false);
  const [dismissed, setDismissed] = useState(true);

  useEffect(() => {
    checkIfDismissed();
  }, []);

  const checkIfDismissed = async () => {
    const key = `tooltip_dismissed_${featureId}`;
    const value = await AsyncStorage.getItem(key);
    if (!value) {
      setDismissed(false);
      // Show tooltip after a short delay
      setTimeout(() => setVisible(true), 1000);
    }
  };

  const dismiss = async () => {
    setVisible(false);
    setDismissed(true);
    const key = `tooltip_dismissed_${featureId}`;
    await AsyncStorage.setItem(key, 'true');
  };

  if (dismissed) return <>{children}</>;

  return (
    <View>
      {children}
      <Modal
        visible={visible}
        transparent
        animationType="fade"
        onRequestClose={dismiss}
      >
        <TouchableOpacity
          style={styles.overlay}
          activeOpacity={1}
          onPress={dismiss}
        >
          <View style={[styles.tooltip, {
            backgroundColor: colors.primary,
            ...(position === 'bottom' ? styles.tooltipBottom : styles.tooltipTop),
          }]}>
            <View style={styles.tooltipContent}>
              <Icon name="star" size={20} color={colors.white} />
              <View style={styles.tooltipText}>
                <Text style={[styles.tooltipTitle, { color: colors.white }]}>
                  {title}
                </Text>
                <Text style={[styles.tooltipDescription, { color: colors.white }]}>
                  {description}
                </Text>
              </View>
            </View>
            <TouchableOpacity onPress={dismiss}>
              <Icon name="close" size={20} color={colors.white} />
            </TouchableOpacity>
          </View>
        </TouchableOpacity>
      </Modal>
    </View>
  );
};

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.3)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  tooltip: {
    flexDirection: 'row',
    alignItems: 'center',
    margin: 20,
    padding: 16,
    borderRadius: 12,
    maxWidth: 300,
  },
  tooltipTop: {
    marginBottom: 100,
  },
  tooltipBottom: {
    marginTop: 100,
  },
  tooltipContent: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    flex: 1,
  },
  tooltipText: {
    marginLeft: 12,
    flex: 1,
  },
  tooltipTitle: {
    fontSize: 16,
    fontWeight: '600',
  },
  tooltipDescription: {
    fontSize: 14,
    marginTop: 4,
    opacity: 0.9,
  },
});

export default FeatureTooltip;
```

**Step 2: Commit**

```bash
git add mobile/src/components/subscription/FeatureTooltip.tsx
git commit -m "feat(trial): create feature tooltip component"
```

---

## Task 6: Add Tooltips to Premium Features

**Files:**
- Modify: `mobile/src/screens/homegroup/TreasuryScreen.tsx`
- Modify: `mobile/src/screens/homegroup/AnnouncementsScreen.tsx`

**Step 1: Wrap treasury with tooltip**

```typescript
import FeatureTooltip from '../../components/subscription/FeatureTooltip';

// Wrap the add transaction button:
<FeatureTooltip
  featureId="treasury_add"
  title="Premium Feature: Treasury"
  description="Track income, expenses, and generate reports. Included in your subscription!"
>
  <TouchableOpacity onPress={handleAddTransaction}>
    <Icon name="plus" size={24} />
  </TouchableOpacity>
</FeatureTooltip>
```

**Step 2: Wrap announcements with tooltip**

```typescript
// Wrap the create announcement button:
<FeatureTooltip
  featureId="announcements_create"
  title="Premium Feature: Announcements"
  description="Send push notifications to all members instantly. Included in your subscription!"
>
  <TouchableOpacity onPress={handleCreateAnnouncement}>
    <Icon name="plus" size={24} />
  </TouchableOpacity>
</FeatureTooltip>
```

**Step 3: Commit**

```bash
git add mobile/src/screens/homegroup/TreasuryScreen.tsx mobile/src/screens/homegroup/AnnouncementsScreen.tsx
git commit -m "feat(trial): add feature tooltips to premium features"
```

---

## Task 7: Create Subscription Upgrade Screen

**Files:**
- Create: `mobile/src/screens/subscription/SubscriptionUpgradeScreen.tsx`

**Step 1: Create the upgrade screen**

```typescript
import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Alert,
  ActivityIndicator,
} from 'react-native';
import { useTheme } from '../../contexts/ThemeContext';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import { useAppDispatch } from '../../store/hooks';
import functions from '@react-native-firebase/functions';

const FEATURES = [
  { icon: 'cash-register', text: 'Treasury Management' },
  { icon: 'bullhorn', text: 'Announcements with Push' },
  { icon: 'calendar-clock', text: 'Meeting Management' },
  { icon: 'account-group', text: 'Member Directory' },
  { icon: 'badge-account', text: 'Service Positions' },
  { icon: 'chart-line', text: 'Admin Dashboard' },
];

export const SubscriptionUpgradeScreen: React.FC<Props> = ({ route, navigation }) => {
  const { groupId, groupName } = route.params;
  const { colors } = useTheme();
  const [loading, setLoading] = useState(false);

  const handleUpgrade = async () => {
    setLoading(true);
    try {
      const createCheckoutSession = functions().httpsCallable('createStripeCheckoutSession');
      const result = await createCheckoutSession({ groupId });

      // Navigate to Stripe checkout or handle WebView
      // Implementation depends on your Stripe integration
      navigation.navigate('StripeCheckout', { sessionUrl: result.data.url });
    } catch (error: any) {
      Alert.alert('Error', error.message || 'Failed to start checkout');
    } finally {
      setLoading(false);
    }
  };

  return (
    <ScrollView style={[styles.container, { backgroundColor: colors.background }]}>
      <View style={styles.header}>
        <Icon name="crown" size={48} color={colors.primary} />
        <Text style={[styles.title, { color: colors.text }]}>
          Upgrade {groupName}
        </Text>
        <Text style={[styles.subtitle, { color: colors.textSecondary }]}>
          Get full access to all admin features
        </Text>
      </View>

      <View style={[styles.priceCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
        <View style={styles.priceRow}>
          <Text style={[styles.price, { color: colors.text }]}>$12</Text>
          <Text style={[styles.priceUnit, { color: colors.textSecondary }]}>/year</Text>
        </View>
        <Text style={[styles.priceBreakdown, { color: colors.textSecondary }]}>
          That's just $1/month for your entire group
        </Text>
      </View>

      <View style={styles.featuresSection}>
        <Text style={[styles.sectionTitle, { color: colors.text }]}>
          What's Included
        </Text>
        {FEATURES.map((feature, index) => (
          <View key={index} style={styles.featureRow}>
            <Icon name="check-circle" size={20} color={colors.success} />
            <Text style={[styles.featureText, { color: colors.text }]}>
              {feature.text}
            </Text>
          </View>
        ))}
      </View>

      <View style={styles.ctaSection}>
        <TouchableOpacity
          style={[styles.ctaButton, { backgroundColor: colors.primary }]}
          onPress={handleUpgrade}
          disabled={loading}
        >
          {loading ? (
            <ActivityIndicator color={colors.white} />
          ) : (
            <>
              <Text style={[styles.ctaText, { color: colors.white }]}>
                Upgrade Now
              </Text>
              <Icon name="arrow-right" size={20} color={colors.white} />
            </>
          )}
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.secondaryButton}
          onPress={() => navigation.goBack()}
        >
          <Text style={[styles.secondaryText, { color: colors.textSecondary }]}>
            Maybe Later
          </Text>
        </TouchableOpacity>
      </View>

      <View style={styles.guarantee}>
        <Icon name="shield-check" size={20} color={colors.success} />
        <Text style={[styles.guaranteeText, { color: colors.textSecondary }]}>
          30-day money-back guarantee
        </Text>
      </View>
    </ScrollView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  header: {
    alignItems: 'center',
    padding: 24,
    paddingTop: 32,
  },
  title: {
    fontSize: 24,
    fontWeight: '700',
    marginTop: 16,
  },
  subtitle: {
    fontSize: 16,
    marginTop: 8,
  },
  priceCard: {
    margin: 16,
    padding: 24,
    borderRadius: 16,
    borderWidth: 1,
    alignItems: 'center',
  },
  priceRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
  },
  price: {
    fontSize: 48,
    fontWeight: '700',
  },
  priceUnit: {
    fontSize: 20,
    marginLeft: 4,
  },
  priceBreakdown: {
    fontSize: 14,
    marginTop: 8,
  },
  featuresSection: {
    padding: 16,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '600',
    marginBottom: 16,
  },
  featureRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
  },
  featureText: {
    fontSize: 16,
    marginLeft: 12,
  },
  ctaSection: {
    padding: 16,
    paddingTop: 24,
  },
  ctaButton: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 16,
    borderRadius: 12,
  },
  ctaText: {
    fontSize: 18,
    fontWeight: '600',
    marginRight: 8,
  },
  secondaryButton: {
    alignItems: 'center',
    padding: 16,
  },
  secondaryText: {
    fontSize: 16,
  },
  guarantee: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 16,
    paddingBottom: 32,
  },
  guaranteeText: {
    fontSize: 14,
    marginLeft: 8,
  },
});

export default SubscriptionUpgradeScreen;
```

**Step 2: Add to navigation**

```typescript
// In navigation types and navigator
<Stack.Screen
  name="SubscriptionUpgrade"
  component={SubscriptionUpgradeScreen}
  options={{ title: 'Upgrade' }}
/>
```

**Step 3: Commit**

```bash
git add mobile/src/screens/subscription/SubscriptionUpgradeScreen.tsx
git add mobile/src/types/navigation/index.ts
git add mobile/src/navigation/GroupStackNavigator.tsx
git commit -m "feat(trial): create SubscriptionUpgradeScreen"
```

---

## Task 8: Deploy and Test

**Step 1: Deploy Cloud Functions**

```bash
cd functions
npm run build
firebase deploy --only functions:scheduledTrialReminders
```

**Step 2: Test in app**

- Create a test group with trial subscription
- Verify trial banner shows with correct days remaining
- Verify tooltips appear on first use of premium features
- Test upgrade flow

**Step 3: Final commit**

```bash
git add .
git commit -m "feat(trial): complete trial optimization implementation"
```

---

## Review Prompt

Before considering this implementation complete, run this verification:

```
Review the trial optimization implementation:

1. TEST TRIAL BANNER:
   - Create/use group in trial status
   - Verify banner shows on GroupOverviewScreen
   - Verify days remaining is accurate
   - Verify banner urgency changes at 2 days remaining
   - Tap "Learn More" - should open upgrade screen

2. TEST FEATURE TOOLTIPS:
   - Clear AsyncStorage for tooltip keys
   - Navigate to Treasury - should see tooltip
   - Dismiss tooltip - should not appear again
   - Navigate to Announcements - should see different tooltip

3. TEST UPGRADE SCREEN:
   - Navigate from trial banner
   - Verify all features listed
   - Verify pricing displayed correctly
   - Test upgrade button (may need Stripe test mode)

4. TEST NOTIFICATIONS (requires Cloud Function deployment):
   - Check Firebase console for scheduledTrialReminders function
   - Verify schedule is set (0 10 * * *)
   - Create test group with trial ending in 2 days
   - Run function manually and verify notification

5. FIX ANY ISSUES found before marking complete

Report: [PASS/FAIL] with details of any fixes needed
```
