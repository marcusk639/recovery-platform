---
archived: true
archived_at: 2026-05-25
archived_reason: Plan shipped; tracked DONE in docs/plans/README.md (with PR# or commit ref). Preserved for historical reference.
original_path: docs/plans/2026-02-04-v1-admin-dashboard.md
---

# Admin Dashboard Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Give admins visibility into group health metrics to reinforce the value of their subscription.

**Architecture:** New dashboard screen aggregating data from multiple collections (messages, announcements, transactions, members, meetings). Use Cloud Function to pre-compute metrics for performance.

**Tech Stack:** React Native, Redux Toolkit, Firebase Cloud Functions, Firestore

**Priority:** V1.0
**Estimated Effort:** 8-12 hours
**Revenue Impact:** Retention - Reinforces value at renewal time

---

## Task 1: Design Dashboard Data Model

**Files:**
- Create: `mobile/src/types/domain/dashboard.ts`

**Step 1: Define dashboard metrics types**

```typescript
export interface GroupDashboardMetrics {
  groupId: string;
  period: 'month' | 'week' | 'all_time';
  periodStart: Date;
  periodEnd: Date;

  // Activity metrics
  messageCount: number;
  announcementCount: number;
  activeMembers: number; // Members who've been active in period
  totalMembers: number;

  // Treasury metrics
  treasuryBalance: number;
  periodIncome: number;
  periodExpenses: number;
  transactionCount: number;

  // Meeting metrics
  meetingsHeld: number;
  meetingsCancelled: number;
  totalAttendance: number; // Sum of all meeting attendances

  // Growth metrics
  newMembers: number;
  membersLeft: number;

  // Computed at display time
  memberEngagementRate?: number; // activeMembers / totalMembers
  averageAttendance?: number; // totalAttendance / meetingsHeld

  // Metadata
  computedAt: Date;
}

export interface DashboardState {
  metrics: GroupDashboardMetrics | null;
  loading: boolean;
  error: string | null;
  lastFetched: Date | null;
}
```

**Step 2: Commit**

```bash
git add mobile/src/types/domain/dashboard.ts
git commit -m "feat(dashboard): define dashboard metrics types"
```

---

## Task 2: Create Metrics Aggregation Cloud Function

**Files:**
- Create: `functions/src/callable/getGroupDashboardMetrics.ts`
- Modify: `functions/src/index.ts`

**Step 1: Create the callable function**

```typescript
import * as functions from 'firebase-functions';
import * as admin from 'firebase-admin';

const db = admin.firestore();

interface DashboardRequest {
  groupId: string;
  period: 'month' | 'week' | 'all_time';
}

export const getGroupDashboardMetrics = functions.https.onCall(
  async (data: DashboardRequest, context) => {
    // Verify authentication
    if (!context.auth) {
      throw new functions.https.HttpsError('unauthenticated', 'Must be logged in');
    }

    const { groupId, period } = data;

    // Verify user is admin of this group
    const memberDoc = await db
      .collection('members')
      .doc(`${groupId}_${context.auth.uid}`)
      .get();

    if (!memberDoc.exists || !memberDoc.data()?.isAdmin) {
      throw new functions.https.HttpsError('permission-denied', 'Must be group admin');
    }

    // Calculate period boundaries
    const now = new Date();
    let periodStart: Date;

    switch (period) {
      case 'week':
        periodStart = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
        break;
      case 'month':
        periodStart = new Date(now.getFullYear(), now.getMonth(), 1);
        break;
      case 'all_time':
      default:
        periodStart = new Date(0); // Beginning of time
    }

    const periodStartTimestamp = admin.firestore.Timestamp.fromDate(periodStart);

    // Aggregate metrics in parallel
    const [
      messageCount,
      announcementCount,
      memberStats,
      treasuryStats,
      meetingStats,
    ] = await Promise.all([
      // Message count
      db.collection('group_chats').doc(groupId)
        .collection('messages')
        .where('createdAt', '>=', periodStartTimestamp)
        .count().get()
        .then(snap => snap.data().count),

      // Announcement count
      db.collection('announcements')
        .where('groupId', '==', groupId)
        .where('createdAt', '>=', periodStartTimestamp)
        .count().get()
        .then(snap => snap.data().count),

      // Member stats
      getMemberStats(groupId, periodStartTimestamp),

      // Treasury stats
      getTreasuryStats(groupId, periodStartTimestamp),

      // Meeting stats
      getMeetingStats(groupId, periodStartTimestamp),
    ]);

    return {
      groupId,
      period,
      periodStart: periodStart.toISOString(),
      periodEnd: now.toISOString(),
      messageCount,
      announcementCount,
      ...memberStats,
      ...treasuryStats,
      ...meetingStats,
      computedAt: now.toISOString(),
    };
  }
);

async function getMemberStats(groupId: string, periodStart: admin.firestore.Timestamp) {
  const membersSnapshot = await db
    .collection('members')
    .where('groupId', '==', groupId)
    .get();

  let totalMembers = 0;
  let activeMembers = 0;
  let newMembers = 0;

  membersSnapshot.docs.forEach(doc => {
    const data = doc.data();
    totalMembers++;

    // Count as active if they've had activity in period
    if (data.lastActivityAt && data.lastActivityAt >= periodStart) {
      activeMembers++;
    }

    // Count as new if joined in period
    if (data.joinedAt && data.joinedAt >= periodStart) {
      newMembers++;
    }
  });

  return { totalMembers, activeMembers, newMembers, membersLeft: 0 };
}

async function getTreasuryStats(groupId: string, periodStart: admin.firestore.Timestamp) {
  const transactionsSnapshot = await db
    .collection('transactions')
    .where('groupId', '==', groupId)
    .where('createdAt', '>=', periodStart)
    .get();

  let periodIncome = 0;
  let periodExpenses = 0;
  let transactionCount = 0;

  transactionsSnapshot.docs.forEach(doc => {
    const data = doc.data();
    transactionCount++;

    if (data.type === 'income') {
      periodIncome += data.amount;
    } else {
      periodExpenses += data.amount;
    }
  });

  // Get current balance from treasury overview
  const overviewDoc = await db
    .collection('treasury_overviews')
    .doc(groupId)
    .get();

  const treasuryBalance = overviewDoc.exists ? overviewDoc.data()?.balance || 0 : 0;

  return { treasuryBalance, periodIncome, periodExpenses, transactionCount };
}

async function getMeetingStats(groupId: string, periodStart: admin.firestore.Timestamp) {
  const now = admin.firestore.Timestamp.now();

  const instancesSnapshot = await db
    .collection('meetingInstances')
    .where('groupId', '==', groupId)
    .where('scheduledAt', '>=', periodStart)
    .where('scheduledAt', '<=', now)
    .get();

  let meetingsHeld = 0;
  let meetingsCancelled = 0;
  let totalAttendance = 0;

  instancesSnapshot.docs.forEach(doc => {
    const data = doc.data();

    if (data.isCancelled) {
      meetingsCancelled++;
    } else {
      meetingsHeld++;
      totalAttendance += data.attendees?.length || 0;
    }
  });

  return { meetingsHeld, meetingsCancelled, totalAttendance };
}
```

**Step 2: Export from index**

```typescript
export { getGroupDashboardMetrics } from './callable/getGroupDashboardMetrics';
```

**Step 3: Commit**

```bash
git add functions/src/callable/getGroupDashboardMetrics.ts functions/src/index.ts
git commit -m "feat(dashboard): create metrics aggregation Cloud Function"
```

---

## Task 3: Create Redux Slice for Dashboard

**Files:**
- Create: `mobile/src/store/slices/dashboardSlice.ts`

**Step 1: Create the slice**

```typescript
import { createSlice, createAsyncThunk } from '@reduxjs/toolkit';
import functions from '@react-native-firebase/functions';
import { GroupDashboardMetrics, DashboardState } from '../../types/domain/dashboard';

const initialState: DashboardState = {
  metrics: null,
  loading: false,
  error: null,
  lastFetched: null,
};

export const fetchDashboardMetrics = createAsyncThunk(
  'dashboard/fetchMetrics',
  async ({ groupId, period }: { groupId: string; period: 'month' | 'week' | 'all_time' }, { rejectWithValue }) => {
    try {
      const getMetrics = functions().httpsCallable('getGroupDashboardMetrics');
      const result = await getMetrics({ groupId, period });
      return result.data as GroupDashboardMetrics;
    } catch (error: any) {
      return rejectWithValue(error.message || 'Failed to fetch metrics');
    }
  }
);

const dashboardSlice = createSlice({
  name: 'dashboard',
  initialState,
  reducers: {
    clearDashboard: (state) => {
      state.metrics = null;
      state.error = null;
    },
  },
  extraReducers: (builder) => {
    builder
      .addCase(fetchDashboardMetrics.pending, (state) => {
        state.loading = true;
        state.error = null;
      })
      .addCase(fetchDashboardMetrics.fulfilled, (state, action) => {
        state.loading = false;
        state.metrics = action.payload;
        state.lastFetched = new Date();
      })
      .addCase(fetchDashboardMetrics.rejected, (state, action) => {
        state.loading = false;
        state.error = action.payload as string;
      });
  },
});

export const { clearDashboard } = dashboardSlice.actions;
export default dashboardSlice.reducer;

// Selectors
export const selectDashboardMetrics = (state: RootState) => state.dashboard.metrics;
export const selectDashboardLoading = (state: RootState) => state.dashboard.loading;
export const selectDashboardError = (state: RootState) => state.dashboard.error;
```

**Step 2: Add to store**

In `mobile/src/store/index.ts`:

```typescript
import dashboardReducer from './slices/dashboardSlice';

const rootReducer = combineReducers({
  // ... existing reducers
  dashboard: dashboardReducer,
});
```

**Step 3: Commit**

```bash
git add mobile/src/store/slices/dashboardSlice.ts mobile/src/store/index.ts
git commit -m "feat(dashboard): create Redux slice for dashboard metrics"
```

---

## Task 4: Create Dashboard Screen

**Files:**
- Create: `mobile/src/screens/homegroup/AdminDashboardScreen.tsx`

**Step 1: Create the screen component**

```typescript
import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  RefreshControl,
  TouchableOpacity,
  ActivityIndicator,
} from 'react-native';
import { useTheme } from '../../contexts/ThemeContext';
import { useAppDispatch, useAppSelector } from '../../store/hooks';
import {
  fetchDashboardMetrics,
  selectDashboardMetrics,
  selectDashboardLoading,
} from '../../store/slices/dashboardSlice';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { GroupStackParamList } from '../../types/navigation';

type Props = NativeStackScreenProps<GroupStackParamList, 'AdminDashboard'>;

interface MetricCardProps {
  icon: string;
  label: string;
  value: string | number;
  subtext?: string;
  color?: string;
  colors: any;
}

const MetricCard: React.FC<MetricCardProps> = ({
  icon,
  label,
  value,
  subtext,
  color,
  colors,
}) => (
  <View style={[styles.metricCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
    <Icon name={icon} size={24} color={color || colors.primary} />
    <Text style={[styles.metricValue, { color: colors.text }]}>{value}</Text>
    <Text style={[styles.metricLabel, { color: colors.textSecondary }]}>{label}</Text>
    {subtext && (
      <Text style={[styles.metricSubtext, { color: colors.textSecondary }]}>{subtext}</Text>
    )}
  </View>
);

export const AdminDashboardScreen: React.FC<Props> = ({ route }) => {
  const { groupId, groupName } = route.params;
  const { colors } = useTheme();
  const dispatch = useAppDispatch();

  const metrics = useAppSelector(selectDashboardMetrics);
  const loading = useAppSelector(selectDashboardLoading);

  const [period, setPeriod] = useState<'month' | 'week' | 'all_time'>('month');
  const [refreshing, setRefreshing] = useState(false);

  useEffect(() => {
    dispatch(fetchDashboardMetrics({ groupId, period }));
  }, [groupId, period, dispatch]);

  const onRefresh = async () => {
    setRefreshing(true);
    await dispatch(fetchDashboardMetrics({ groupId, period }));
    setRefreshing(false);
  };

  const formatCurrency = (amount: number) => {
    return `$${amount.toFixed(2)}`;
  };

  const formatPercent = (value: number) => {
    return `${Math.round(value * 100)}%`;
  };

  if (loading && !metrics) {
    return (
      <View style={[styles.loadingContainer, { backgroundColor: colors.background }]}>
        <ActivityIndicator size="large" color={colors.primary} />
        <Text style={[styles.loadingText, { color: colors.textSecondary }]}>
          Loading dashboard...
        </Text>
      </View>
    );
  }

  const engagementRate = metrics
    ? metrics.activeMembers / metrics.totalMembers
    : 0;

  const avgAttendance = metrics && metrics.meetingsHeld > 0
    ? metrics.totalAttendance / metrics.meetingsHeld
    : 0;

  return (
    <ScrollView
      style={[styles.container, { backgroundColor: colors.background }]}
      refreshControl={
        <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
      }
    >
      {/* Period Selector */}
      <View style={styles.periodSelector}>
        {(['week', 'month', 'all_time'] as const).map((p) => (
          <TouchableOpacity
            key={p}
            style={[
              styles.periodButton,
              period === p && { backgroundColor: colors.primary },
            ]}
            onPress={() => setPeriod(p)}
          >
            <Text
              style={[
                styles.periodButtonText,
                { color: period === p ? colors.white : colors.text },
              ]}
            >
              {p === 'all_time' ? 'All Time' : p === 'week' ? 'This Week' : 'This Month'}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* Activity Section */}
      <View style={styles.section}>
        <Text style={[styles.sectionTitle, { color: colors.text }]}>Activity</Text>
        <View style={styles.metricsGrid}>
          <MetricCard
            icon="message-text"
            label="Messages"
            value={metrics?.messageCount || 0}
            colors={colors}
          />
          <MetricCard
            icon="bullhorn"
            label="Announcements"
            value={metrics?.announcementCount || 0}
            colors={colors}
          />
        </View>
      </View>

      {/* Members Section */}
      <View style={styles.section}>
        <Text style={[styles.sectionTitle, { color: colors.text }]}>Members</Text>
        <View style={styles.metricsGrid}>
          <MetricCard
            icon="account-group"
            label="Total Members"
            value={metrics?.totalMembers || 0}
            colors={colors}
          />
          <MetricCard
            icon="account-check"
            label="Active"
            value={metrics?.activeMembers || 0}
            subtext={formatPercent(engagementRate) + ' engagement'}
            color={colors.success}
            colors={colors}
          />
          <MetricCard
            icon="account-plus"
            label="New Members"
            value={metrics?.newMembers || 0}
            color={colors.success}
            colors={colors}
          />
        </View>
      </View>

      {/* Treasury Section */}
      <View style={styles.section}>
        <Text style={[styles.sectionTitle, { color: colors.text }]}>Treasury</Text>
        <View style={styles.metricsGrid}>
          <MetricCard
            icon="wallet"
            label="Balance"
            value={formatCurrency(metrics?.treasuryBalance || 0)}
            colors={colors}
          />
          <MetricCard
            icon="arrow-down-circle"
            label="Income"
            value={formatCurrency(metrics?.periodIncome || 0)}
            color={colors.success}
            colors={colors}
          />
          <MetricCard
            icon="arrow-up-circle"
            label="Expenses"
            value={formatCurrency(metrics?.periodExpenses || 0)}
            color={colors.error}
            colors={colors}
          />
        </View>
      </View>

      {/* Meetings Section */}
      <View style={styles.section}>
        <Text style={[styles.sectionTitle, { color: colors.text }]}>Meetings</Text>
        <View style={styles.metricsGrid}>
          <MetricCard
            icon="calendar-check"
            label="Meetings Held"
            value={metrics?.meetingsHeld || 0}
            colors={colors}
          />
          <MetricCard
            icon="calendar-remove"
            label="Cancelled"
            value={metrics?.meetingsCancelled || 0}
            color={colors.error}
            colors={colors}
          />
          <MetricCard
            icon="account-multiple-check"
            label="Avg Attendance"
            value={avgAttendance.toFixed(1)}
            colors={colors}
          />
        </View>
      </View>

      {/* Subscription Status */}
      <View style={[styles.subscriptionCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
        <Icon name="crown" size={24} color={colors.primary} />
        <View style={styles.subscriptionInfo}>
          <Text style={[styles.subscriptionTitle, { color: colors.text }]}>
            Premium Subscription
          </Text>
          <Text style={[styles.subscriptionSubtext, { color: colors.textSecondary }]}>
            Renews in 47 days
          </Text>
        </View>
        <TouchableOpacity>
          <Text style={[styles.manageLink, { color: colors.primary }]}>Manage</Text>
        </TouchableOpacity>
      </View>
    </ScrollView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingText: {
    marginTop: 12,
    fontSize: 16,
  },
  periodSelector: {
    flexDirection: 'row',
    padding: 16,
    gap: 8,
  },
  periodButton: {
    flex: 1,
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 8,
    alignItems: 'center',
    backgroundColor: '#f0f0f0',
  },
  periodButtonText: {
    fontSize: 14,
    fontWeight: '500',
  },
  section: {
    padding: 16,
    paddingTop: 0,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '600',
    marginBottom: 12,
  },
  metricsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
  },
  metricCard: {
    flex: 1,
    minWidth: '30%',
    padding: 16,
    borderRadius: 12,
    borderWidth: 1,
    alignItems: 'center',
  },
  metricValue: {
    fontSize: 24,
    fontWeight: '700',
    marginTop: 8,
  },
  metricLabel: {
    fontSize: 12,
    marginTop: 4,
  },
  metricSubtext: {
    fontSize: 10,
    marginTop: 2,
  },
  subscriptionCard: {
    flexDirection: 'row',
    alignItems: 'center',
    margin: 16,
    padding: 16,
    borderRadius: 12,
    borderWidth: 1,
  },
  subscriptionInfo: {
    flex: 1,
    marginLeft: 12,
  },
  subscriptionTitle: {
    fontSize: 16,
    fontWeight: '600',
  },
  subscriptionSubtext: {
    fontSize: 14,
    marginTop: 2,
  },
  manageLink: {
    fontSize: 14,
    fontWeight: '500',
  },
});

export default AdminDashboardScreen;
```

**Step 2: Commit**

```bash
git add mobile/src/screens/homegroup/AdminDashboardScreen.tsx
git commit -m "feat(dashboard): create AdminDashboardScreen UI"
```

---

## Task 5: Add Dashboard to Navigation

**Files:**
- Modify: `mobile/src/types/navigation/index.ts`
- Modify: `mobile/src/navigation/GroupStackNavigator.tsx`

**Step 1: Add type definition**

```typescript
export type GroupStackParamList = {
  // ... existing screens
  AdminDashboard: { groupId: string; groupName: string };
};
```

**Step 2: Add screen to navigator**

```typescript
import AdminDashboardScreen from '../screens/homegroup/AdminDashboardScreen';

<Stack.Screen
  name="AdminDashboard"
  component={AdminDashboardScreen}
  options={{ title: 'Dashboard' }}
/>
```

**Step 3: Commit**

```bash
git add mobile/src/types/navigation/index.ts mobile/src/navigation/GroupStackNavigator.tsx
git commit -m "feat(dashboard): add AdminDashboard to navigation"
```

---

## Task 6: Add Dashboard Entry Point

**Files:**
- Modify: `mobile/src/screens/homegroup/GroupOverviewScreen.tsx`

**Step 1: Add dashboard button for admins**

```typescript
{isAdmin && (
  <TouchableOpacity
    style={styles.dashboardButton}
    onPress={() => navigation.navigate('AdminDashboard', { groupId, groupName })}
  >
    <Icon name="view-dashboard" size={20} color={colors.primary} />
    <Text style={[styles.dashboardButtonText, { color: colors.primary }]}>
      View Dashboard
    </Text>
  </TouchableOpacity>
)}
```

**Step 2: Commit**

```bash
git add mobile/src/screens/homegroup/GroupOverviewScreen.tsx
git commit -m "feat(dashboard): add dashboard entry point for admins"
```

---

## Task 7: Deploy and Test

**Step 1: Deploy Cloud Function**

```bash
cd functions
npm run build
firebase deploy --only functions:getGroupDashboardMetrics
```

**Step 2: Test in app**

- Open a group as admin
- Click "View Dashboard"
- Verify metrics load correctly
- Test period switching (week/month/all time)
- Test pull-to-refresh

**Step 3: Commit**

```bash
git add .
git commit -m "feat(dashboard): complete admin dashboard implementation"
```

---

## Review Prompt

Before considering this implementation complete, run this verification:

```
Review the admin dashboard implementation:

1. TEST FUNCTIONALITY:
   - Log in as group admin
   - Navigate to Dashboard from group overview
   - Verify metrics match actual data:
     - Message count (check group_chats/messages collection)
     - Member count (check members collection)
     - Treasury balance (check treasury_overview)
   - Test period switching (week, month, all time)
   - Test pull-to-refresh

2. TEST PERMISSIONS:
   - Log in as regular member (not admin)
   - Verify Dashboard button is NOT visible
   - Try calling getGroupDashboardMetrics directly - should fail

3. CHECK PERFORMANCE:
   - Measure dashboard load time
   - Should load in < 2 seconds
   - Check Cloud Functions logs for execution time

4. CHECK UI:
   - Verify all metric cards render correctly
   - Verify icons display properly
   - Test dark mode
   - Verify subscription card shows correct status

5. FIX ANY ISSUES found before marking complete

Report: [PASS/FAIL] with details of any fixes needed
```
