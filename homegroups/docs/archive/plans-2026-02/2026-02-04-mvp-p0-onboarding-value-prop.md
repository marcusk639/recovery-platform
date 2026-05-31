---
archived: true
archived_at: 2026-05-25
archived_reason: Plan shipped; tracked DONE in docs/plans/README.md (with PR# or commit ref). Preserved for historical reference.
original_path: docs/plans/2026-02-04-mvp-p0-onboarding-value-prop.md
---

# Onboarding Value Proposition Screen Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Show admins the value they get from subscribing before they reach the payment step, improving conversion.

**Architecture:** Add a new screen in the admin onboarding flow between intent selection and payment that showcases premium features with visuals and compelling copy.

**Tech Stack:** React Native, React Navigation, Lottie (optional for animations)

**Priority:** P0 - MVP Blocker
**Estimated Effort:** 2-3 hours
**Revenue Impact:** Conversion - Users abandon without understanding value; showing features before payment increases willingness to pay

---

## Task 1: Create Value Proposition Screen Component

**Files:**
- Create: `mobile/src/screens/onboarding/AdminValuePropScreen.tsx`

**Step 1: Create the screen component**

```typescript
import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Dimensions,
  SafeAreaView,
} from 'react-native';
import { useTheme } from '../../contexts/ThemeContext';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { OnboardingStackParamList } from '../../types/navigation';

type Props = NativeStackScreenProps<OnboardingStackParamList, 'AdminValueProp'>;

interface FeatureItemProps {
  icon: string;
  title: string;
  description: string;
  colors: any;
}

const FeatureItem: React.FC<FeatureItemProps> = ({ icon, title, description, colors }) => (
  <View style={styles.featureItem}>
    <View style={[styles.iconContainer, { backgroundColor: colors.primaryLight }]}>
      <Icon name={icon} size={28} color={colors.primary} />
    </View>
    <View style={styles.featureText}>
      <Text style={[styles.featureTitle, { color: colors.text }]}>{title}</Text>
      <Text style={[styles.featureDescription, { color: colors.textSecondary }]}>
        {description}
      </Text>
    </View>
  </View>
);

export const AdminValuePropScreen: React.FC<Props> = ({ navigation, route }) => {
  const { colors } = useTheme();
  const { groupId, groupName, action } = route.params || {};

  const handleContinue = () => {
    navigation.navigate('AdminPayment', { groupId, groupName, action });
  };

  const features = [
    {
      icon: 'cash-register',
      title: 'Treasury Management',
      description: 'Track income & expenses, generate reports, and manage treasurer handoffs seamlessly.',
    },
    {
      icon: 'bullhorn',
      title: 'Announcements',
      description: 'Send push notifications to all members instantly. Pin important announcements.',
    },
    {
      icon: 'calendar-clock',
      title: 'Meeting Management',
      description: 'Schedule meetings, track cancellations, and assign chairpersons with ease.',
    },
    {
      icon: 'account-group',
      title: 'Member Directory',
      description: 'Manage members, approve requests, and track service positions.',
    },
    {
      icon: 'message-text',
      title: 'Group Chat',
      description: 'Secure group messaging with mentions, reactions, and media sharing.',
    },
    {
      icon: 'shield-check',
      title: 'Admin Controls',
      description: 'Full control over group settings, member roles, and content moderation.',
    },
  ];

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]}>
      <ScrollView contentContainerStyle={styles.scrollContent}>
        {/* Header */}
        <View style={styles.header}>
          <Text style={[styles.headerTitle, { color: colors.text }]}>
            Everything Your Group Needs
          </Text>
          <Text style={[styles.headerSubtitle, { color: colors.textSecondary }]}>
            Manage your homegroup with powerful tools built for recovery communities
          </Text>
        </View>

        {/* Features List */}
        <View style={styles.featuresContainer}>
          {features.map((feature, index) => (
            <FeatureItem
              key={index}
              icon={feature.icon}
              title={feature.title}
              description={feature.description}
              colors={colors}
            />
          ))}
        </View>

        {/* Pricing Section */}
        <View style={[styles.pricingCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          <View style={styles.priceRow}>
            <Text style={[styles.price, { color: colors.text }]}>$12</Text>
            <Text style={[styles.priceUnit, { color: colors.textSecondary }]}>/year</Text>
          </View>
          <Text style={[styles.priceSubtext, { color: colors.textSecondary }]}>
            That's just $1/month for your entire group
          </Text>
          <View style={styles.trialBadge}>
            <Icon name="gift" size={16} color={colors.success} />
            <Text style={[styles.trialText, { color: colors.success }]}>
              Start with 7 days free
            </Text>
          </View>
        </View>

        {/* Social Proof */}
        <View style={styles.socialProof}>
          <Text style={[styles.socialProofText, { color: colors.textSecondary }]}>
            Trusted by recovery groups across the country
          </Text>
        </View>
      </ScrollView>

      {/* CTA Button */}
      <View style={[styles.ctaContainer, { backgroundColor: colors.background, borderTopColor: colors.border }]}>
        <TouchableOpacity
          style={[styles.ctaButton, { backgroundColor: colors.primary }]}
          onPress={handleContinue}
          activeOpacity={0.8}
        >
          <Text style={[styles.ctaText, { color: colors.white }]}>
            Start Free Trial
          </Text>
          <Icon name="arrow-right" size={20} color={colors.white} />
        </TouchableOpacity>
        <Text style={[styles.ctaSubtext, { color: colors.textSecondary }]}>
          No credit card required to start
        </Text>
      </View>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  scrollContent: {
    padding: 24,
    paddingBottom: 120,
  },
  header: {
    marginBottom: 32,
    alignItems: 'center',
  },
  headerTitle: {
    fontSize: 28,
    fontWeight: '700',
    textAlign: 'center',
    marginBottom: 12,
  },
  headerSubtitle: {
    fontSize: 16,
    textAlign: 'center',
    lineHeight: 24,
  },
  featuresContainer: {
    marginBottom: 32,
  },
  featureItem: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginBottom: 20,
  },
  iconContainer: {
    width: 48,
    height: 48,
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 16,
  },
  featureText: {
    flex: 1,
  },
  featureTitle: {
    fontSize: 17,
    fontWeight: '600',
    marginBottom: 4,
  },
  featureDescription: {
    fontSize: 14,
    lineHeight: 20,
  },
  pricingCard: {
    padding: 24,
    borderRadius: 16,
    borderWidth: 1,
    alignItems: 'center',
    marginBottom: 24,
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
  priceSubtext: {
    fontSize: 14,
    marginTop: 4,
  },
  trialBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 16,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
    backgroundColor: 'rgba(76, 175, 80, 0.1)',
  },
  trialText: {
    fontSize: 14,
    fontWeight: '600',
    marginLeft: 6,
  },
  socialProof: {
    alignItems: 'center',
  },
  socialProofText: {
    fontSize: 13,
    fontStyle: 'italic',
  },
  ctaContainer: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    padding: 16,
    paddingBottom: 32,
    borderTopWidth: 1,
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
  ctaSubtext: {
    fontSize: 12,
    textAlign: 'center',
    marginTop: 8,
  },
});

export default AdminValuePropScreen;
```

**Step 2: Commit**

```bash
git add mobile/src/screens/onboarding/AdminValuePropScreen.tsx
git commit -m "feat(onboarding): create AdminValuePropScreen with feature showcase"
```

---

## Task 2: Add Screen to Navigation

**Files:**
- Modify: `mobile/src/types/navigation/index.ts`
- Modify: `mobile/src/navigation/OnboardingNavigator.tsx`

**Step 1: Add type definition**

In `mobile/src/types/navigation/index.ts`:

```typescript
export type OnboardingStackParamList = {
  // ... existing screens ...
  AdminValueProp: {
    groupId?: string;
    groupName?: string;
    action?: 'create' | 'claim';
  };
  AdminPayment: {
    groupId?: string;
    groupName?: string;
    action?: 'create' | 'claim';
  };
};
```

**Step 2: Add screen to navigator**

In `mobile/src/navigation/OnboardingNavigator.tsx`:

```typescript
import AdminValuePropScreen from '../screens/onboarding/AdminValuePropScreen';

// In the Stack.Navigator:
<Stack.Screen
  name="AdminValueProp"
  component={AdminValuePropScreen}
  options={{
    title: 'What You Get',
    headerBackTitle: 'Back',
  }}
/>
```

**Step 3: Commit**

```bash
git add mobile/src/types/navigation/index.ts mobile/src/navigation/OnboardingNavigator.tsx
git commit -m "feat(onboarding): add AdminValuePropScreen to navigation"
```

---

## Task 3: Update Navigation Flow

**Files:**
- Modify: The screen that currently navigates to payment (likely `AdminIntentScreen.tsx` or similar)

**Step 1: Update navigation to go through value prop screen**

Find where the admin flow navigates to payment and change it:

```typescript
// Before:
navigation.navigate('AdminPayment', { groupId, groupName, action });

// After:
navigation.navigate('AdminValueProp', { groupId, groupName, action });
```

The AdminValuePropScreen will then navigate to AdminPayment when the user clicks "Start Free Trial".

**Step 2: Commit**

```bash
git add mobile/src/screens/onboarding/AdminIntentScreen.tsx
git commit -m "feat(onboarding): route admin flow through value prop screen"
```

---

## Task 4: Add Skip/Learn More Options

**Files:**
- Modify: `mobile/src/screens/onboarding/AdminValuePropScreen.tsx`

**Step 1: Add header skip button**

```typescript
// In navigation options or screen header:
useLayoutEffect(() => {
  navigation.setOptions({
    headerRight: () => (
      <TouchableOpacity onPress={handleContinue} style={{ marginRight: 16 }}>
        <Text style={{ color: colors.primary, fontSize: 16 }}>Skip</Text>
      </TouchableOpacity>
    ),
  });
}, [navigation, colors]);
```

**Step 2: Commit**

```bash
git add mobile/src/screens/onboarding/AdminValuePropScreen.tsx
git commit -m "feat(onboarding): add skip option to value prop screen"
```

---

## Task 5: Add Theme Colors for primaryLight

**Files:**
- Modify: `mobile/src/contexts/ThemeContext.tsx` (or wherever colors are defined)

**Step 1: Add primaryLight color if not present**

```typescript
const lightColors = {
  // ... existing colors ...
  primaryLight: '#E3F2FD', // Light blue background for icons
};

const darkColors = {
  // ... existing colors ...
  primaryLight: '#1E3A5F', // Dark mode version
};
```

**Step 2: Commit**

```bash
git add mobile/src/contexts/ThemeContext.tsx
git commit -m "feat(theme): add primaryLight color for feature icons"
```

---

## Task 6: Verification & Testing

**Step 1: Manual testing checklist**

Run the app and verify:

- [ ] When selecting "Admin" intent, user sees value prop screen before payment
- [ ] All 6 features are displayed with icons, titles, and descriptions
- [ ] Pricing card shows $12/year with "7 days free" badge
- [ ] "Start Free Trial" button navigates to payment screen
- [ ] Skip button in header also navigates to payment screen
- [ ] Screen scrolls properly if content exceeds viewport
- [ ] Dark mode renders correctly

**Step 2: Test navigation flow**

- [ ] Complete flow: Intent → Value Prop → Payment → Success
- [ ] Back button from Value Prop returns to Intent screen
- [ ] Back button from Payment returns to Value Prop screen

**Step 3: Visual review**

- [ ] Icons are visually distinct and meaningful
- [ ] Typography hierarchy is clear
- [ ] Spacing is consistent
- [ ] CTA button is prominent and accessible

**Step 4: Final commit**

```bash
git add .
git commit -m "feat(onboarding): complete value proposition screen implementation"
```

---

## Review Prompt

Before considering this implementation complete, run this verification:

```
Review the onboarding value proposition screen implementation:

1. TEST USER FLOW:
   - Start fresh onboarding as new user
   - Select "I'm an admin" intent
   - Verify value prop screen appears before payment
   - Verify all features are listed and readable
   - Click "Start Free Trial" - verify payment screen loads
   - Go back and click "Skip" - verify same behavior

2. CHECK VISUAL QUALITY:
   - Screenshot the screen in light mode
   - Screenshot the screen in dark mode
   - Verify icons render correctly
   - Verify text is readable and well-spaced
   - Verify CTA button is prominent

3. CHECK COPY EFFECTIVENESS:
   - Read each feature description aloud
   - Verify descriptions are clear and compelling
   - Verify pricing is prominently displayed
   - Verify "7 days free" is visible

4. CHECK CODE QUALITY:
   - Run: `npx tsc --noEmit` - fix any TypeScript errors
   - Verify no console warnings about missing keys or props

5. FIX ANY ISSUES found before marking complete

Report: [PASS/FAIL] with details of any fixes needed
```
