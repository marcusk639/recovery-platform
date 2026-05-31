# Donation Feature Callout Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a promotional card to `AdminDashboardScreen` that surfaces the 7th Tradition donation feature (already fully built) so admins discover it exists.

**Architecture:** A single-file change to `AdminDashboardScreen.tsx`. The card lives inside the existing `ScrollView`, above the metrics. It navigates to the existing `GroupDonationScreen` using the standard `navigation.navigate` pattern. `useNavigation` is not yet imported in this screen — it needs to be added.

**Tech Stack:** React Native, React Navigation (`useNavigation`).

---

## File Structure

| File                                                    | Action | Responsibility                         |
| ------------------------------------------------------- | ------ | -------------------------------------- |
| `mobile/src/screens/homegroup/AdminDashboardScreen.tsx` | Modify | Add `useNavigation`, add donation card |

---

### Task 1: Add useNavigation and the donation card

**Files:**

- Modify: `mobile/src/screens/homegroup/AdminDashboardScreen.tsx`

- [ ] **Step 1: Add navigation imports**

Find this existing import at line 12:

```typescript
import { RouteProp, useRoute } from "@react-navigation/native";
```

Replace it with:

```typescript
import { RouteProp, useRoute, useNavigation } from "@react-navigation/native";
import { StackNavigationProp } from "@react-navigation/stack";
```

- [ ] **Step 2: Add navigation type and hook**

Find the existing route type at line 59:

```typescript
type AdminDashboardRouteProp = RouteProp<GroupStackParamList, "AdminDashboard">;
```

Add the navigation type below it:

```typescript
type AdminDashboardNavigationProp = StackNavigationProp<
  GroupStackParamList,
  "AdminDashboard"
>;
```

Inside the `AdminDashboardScreen` component function, after the existing `const {groupId, groupName} = route.params;` line, add:

```typescript
const navigation = useNavigation<AdminDashboardNavigationProp>();
```

- [ ] **Step 3: Add donation card inside the ScrollView**

Find this block inside the `ScrollView` (around line 195):

```typescript
          {metrics && (
            <>
              {/* Activity Metrics */}
```

Insert the donation card immediately before the `{metrics && (` block:

```typescript
          {/* 7th Tradition Donations Callout */}
          <TouchableOpacity
            style={styles.donationCallout}
            onPress={() => navigation.navigate('GroupDonation', {groupId, groupName})}
            testID="donation-callout">
            <View style={styles.donationCalloutContent}>
              <Text style={styles.donationCalloutTitle}>
                Accept 7th Tradition Contributions
              </Text>
              <Text style={styles.donationCalloutBody}>
                Members can contribute to your group's 7th Tradition fund
                directly through the app. Set up takes under 2 minutes.
              </Text>
              <Text style={styles.donationCalloutCta}>Set Up Donations →</Text>
            </View>
          </TouchableOpacity>

```

- [ ] **Step 4: Add the card styles**

Find the `const styles = StyleSheet.create({` declaration (around line 388). Add these entries inside it (before the closing `}`):

```typescript
  donationCallout: {
    marginHorizontal: 16,
    marginTop: 12,
    marginBottom: 4,
    backgroundColor: '#E8F5E9',
    borderRadius: 10,
    borderLeftWidth: 4,
    borderLeftColor: '#388E3C',
    padding: 14,
  },
  donationCalloutContent: {
    gap: 4,
  },
  donationCalloutTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: '#1B5E20',
  },
  donationCalloutBody: {
    fontSize: 12,
    color: '#2E7D32',
    lineHeight: 17,
  },
  donationCalloutCta: {
    fontSize: 12,
    fontWeight: '600',
    color: '#388E3C',
    marginTop: 4,
  },
```

- [ ] **Step 5: Run mobile tests**

```bash
cd mobile && npm test -- --no-coverage
```

Expected: all tests pass.

- [ ] **Step 6: Commit**

```bash
git add mobile/src/screens/homegroup/AdminDashboardScreen.tsx
git commit -m "feat: add 7th Tradition donation callout to admin dashboard"
```

---

## Acceptance Criteria

- [ ] Green card callout appears near the top of the admin dashboard scroll view
- [ ] Tapping the card navigates to `GroupDonationScreen`
- [ ] Card renders correctly — title, body, and CTA are all visible
- [ ] All existing mobile tests pass
