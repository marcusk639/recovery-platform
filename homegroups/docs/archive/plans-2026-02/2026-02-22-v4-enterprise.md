---
archived: true
archived_at: 2026-05-25
archived_reason: Plan shipped; tracked DONE in docs/plans/README.md (with PR# or commit ref). Preserved for historical reference.
original_path: docs/plans/2026-02-22-v4-enterprise.md
---

# V4.4 Implementation Plan: Enterprise Features

**Goal:** Extend RecoveryConnect upmarket into intergroups, districts, and treatment centers — organizations that sponsor multiple groups and have compliance, reporting, and branding requirements. This is the B2B / institutional revenue segment.

**Theme: "The Platform for Recovery Organizations"**

Individual homegroups are the product's foundation. Enterprise organizations — intergroups, districts, treatment centers, and sober living facilities — are a multiplier. A single intergroup sale is worth 10-30 group subscriptions worth of revenue, and it brings all affiliated groups onto the platform as a bundle.

**The Enterprise Adoption Argument:**

| Customer Type | Pain Point | RecoveryConnect Answer |
|---|---|---|
| Intergroup / District | Manually aggregates reports from 15+ groups via email | Unified dashboard with live data from all affiliated groups |
| Treatment center | Needs compliance reports for licensing and grants | Automated sobriety stats exports with audit trail |
| Large secular recovery org | Wants branded experience for members | Custom theme and logo applied at app startup |
| Any enterprise org | GDPR obligations; fear of vendor lock-in | Full data export on demand + scheduled monthly backups |
| Corporate recovery program | Internal SSO; wants `@company.com` sign-in | Email domain mapping to auto-join a specific group |

**Architecture:** All new collections follow the established Firestore patterns in `mobile/src/types/schema.ts`. New Redux slices use entity adapters (consistent with existing 21 slices). New Cloud Functions use `functions.https.onCall` with `CallableRequest<T>` (matching all existing callable functions). Two new Stripe products are needed alongside the existing `productIdGroup`.

**Estimated Effort:** ~20-26 hours

---

## Section Overview

| Section | Features | Effort | Key Dependency |
|---------|----------|--------|----------------|
| V4.4.1 | Intergroup / District Accounts | 6-8 hrs | None — establishes foundation for all others |
| V4.4.2 | Treatment Center Integration | 4-5 hrs | Depends on V4.4.1 (IntergroupDocument pattern) |
| V4.4.3 | White-Label / Custom Branding | 3-4 hrs | None — self-contained |
| V4.4.4 | Data Export & Portability | 4-5 hrs | None — self-contained; reuses existing exportUserData.ts pattern |
| V4.4.5 | SSO / Organization Sign-In | 3-4 hrs | Depends on V4.4.1 (orgId on groups) |

**Implementation order rationale:** V4.4.1 first because `IntergroupDocument` defines `orgId` that V4.4.2 and V4.4.5 reference. V4.4.3 and V4.4.4 are independent and can be built in parallel with V4.4.2. V4.4.5 last because it requires the most Firebase Auth configuration and is the hardest to test without a real org.

---

## V4.4.1: Intergroup / District Accounts

**Why first:** This section creates the `intergroups` Firestore collection and the two new Stripe product tiers that anchor all enterprise billing. V4.4.2 (treatment centers) reuses `IntergroupDocument` as its organizational wrapper. V4.4.5 (SSO) references `orgId` stored on affiliated groups.

**Business model:**
- **Tier A — Intergroup (up to 10 groups):** $99/year. Covers 10 affiliated group subscriptions bundled. Individual groups within the intergroup do not pay separately.
- **Tier B — Intergroup Unlimited:** $199/year. Covers unlimited affiliated groups.
- Intergroup admins manage billing; affiliated group admins manage their own groups day-to-day.

---

### Task 1.1: Intergroup Firestore Schema & Stripe Products

**Files to modify:**
- `mobile/src/types/schema.ts` — add `IntergroupDocument`, `IntergroupMemberDocument`, `IntergroupTier` type; add `INTERGROUP_*` paths to `COLLECTION_PATHS`
- `functions/src/utils/stripe.ts` — add `productIdIntergroupTierA`, `productIdIntergroupTierB` constants and env var names

**New Stripe products (create in Stripe dashboard, store IDs in env):**

| Product | Stripe Product ID env var | Price | Description |
|---|---|---|---|
| Intergroup Tier A | `STRIPE_PRODUCT_ID_INTERGROUP_A` | $99/yr | Up to 10 affiliated groups |
| Intergroup Tier B | `STRIPE_PRODUCT_ID_INTERGROUP_B` | $199/yr | Unlimited affiliated groups |

**`functions/src/utils/stripe.ts` additions:**

```typescript
// Add alongside existing productIdGroup constants:
const STRIPE_PRODUCT_ID_INTERGROUP_A_ENV = "STRIPE_PRODUCT_ID_INTERGROUP_A";
const STRIPE_PRODUCT_ID_INTERGROUP_B_ENV = "STRIPE_PRODUCT_ID_INTERGROUP_B";
const STRIPE_TEST_PRODUCT_ID_INTERGROUP_A_ENV = "STRIPE_TEST_PRODUCT_ID_INTERGROUP_A";
const STRIPE_TEST_PRODUCT_ID_INTERGROUP_B_ENV = "STRIPE_TEST_PRODUCT_ID_INTERGROUP_B";

export const productIdIntergroupA = isTestMode
  ? process.env[STRIPE_TEST_PRODUCT_ID_INTERGROUP_A_ENV]
  : process.env[STRIPE_PRODUCT_ID_INTERGROUP_A_ENV];

export const productIdIntergroupB = isTestMode
  ? process.env[STRIPE_TEST_PRODUCT_ID_INTERGROUP_B_ENV]
  : process.env[STRIPE_PRODUCT_ID_INTERGROUP_B_ENV];
```

**Firestore schema additions in `mobile/src/types/schema.ts`:**

```typescript
export type IntergroupTier = 'tier_a' | 'tier_b'; // tier_a: up to 10 groups, tier_b: unlimited

/**
 * Intergroup / District Document
 * Collection: intergroups/{intergroupId}
 */
export interface IntergroupDocument {
  id: string;
  name: string;               // e.g., "Greater Atlanta Area Intergroup"
  type: 'intergroup' | 'district' | 'area' | 'treatment_center';
  description?: string;
  contactEmail?: string;
  contactPhone?: string;
  website?: string;
  state?: string;
  country?: string;

  // Affiliated groups — list of groupIds this intergroup manages
  affiliatedGroupIds: string[];  // Max 10 for tier_a, unlimited for tier_b
  maxGroups: number;             // 10 for tier_a, 9999 for tier_b (sentinel for unlimited)

  // Admins
  adminUids: string[];           // UIDs of intergroup-level admins

  // Stripe subscription (paid by intergroup org, not individual groups)
  stripeCustomerId?: string;
  stripeSubscriptionId?: string;
  stripeSubscriptionItemId?: string;
  stripePriceIdIntergroup?: string;
  stripeProductIdIntergroup?: string;  // productIdIntergroupA or productIdIntergroupB
  subscriptionStatus?: SubscriptionStatus;
  subscriptionExpiresAt?: Timestamp | null;
  tier?: IntergroupTier;

  // Branding (populated by V4.4.3)
  brandingId?: string;           // Reference to branding/{brandingId}

  // SSO domain (populated by V4.4.5)
  emailDomains?: string[];       // e.g., ["treehouserecovery.org"]
  ssoAutoJoinGroupId?: string;   // Group new SSO users are auto-joined to

  createdAt: Timestamp;
  updatedAt: Timestamp;
  createdBy: string;             // UID of founding admin
}

/**
 * Intergroup Member Document
 * Collection: intergroups/{intergroupId}/members/{userId}
 * Tracks which users have intergroup-level admin access.
 */
export interface IntergroupMemberDocument {
  userId: string;
  displayName: string;
  email?: string;
  role: 'owner' | 'admin' | 'viewer';  // owner: full control, admin: manage groups/announcements, viewer: read-only dashboard
  addedAt: Timestamp;
  addedBy: string;
}

// Add to COLLECTION_PATHS:
INTERGROUPS: 'intergroups',
INTERGROUP_MEMBERS: (intergroupId: string) => `intergroups/${intergroupId}/members`,
INTERGROUP_ANNOUNCEMENTS: (intergroupId: string) => `intergroups/${intergroupId}/announcements`,
```

**Firestore rules additions to `firestore.rules`:**

```javascript
match /intergroups/{intergroupId} {
  allow read: if request.auth != null
    && (request.auth.uid in resource.data.adminUids
        || isIntergroupMember(intergroupId));
  allow create: if request.auth != null;  // CF-gated; direct create blocked by validation
  allow update, delete: if false;         // Only via Cloud Functions
}

match /intergroups/{intergroupId}/members/{userId} {
  allow read: if isIntergroupAdmin(intergroupId);
  allow write: if false;  // Only via Cloud Functions
}

function isIntergroupAdmin(intergroupId) {
  return request.auth != null
    && request.auth.uid in get(/databases/$(database)/documents/intergroups/$(intergroupId)).data.adminUids;
}

function isIntergroupMember(intergroupId) {
  return request.auth != null
    && exists(/databases/$(database)/documents/intergroups/$(intergroupId)/members/$(request.auth.uid));
}
```

---

### Task 1.2: `createIntergroup` Cloud Function

**File to create:** `functions/src/callable/createIntergroup.ts`

```typescript
import { onCall, CallableRequest, HttpsError } from "firebase-functions/v2/https";
import { db } from "../utils/firebase";
import { stripe, productIdIntergroupA, productIdIntergroupB, getDefaultPriceForProduct } from "../utils/stripe";
import * as admin from "firebase-admin";

interface CreateIntergroupData {
  name: string;
  type: 'intergroup' | 'district' | 'area' | 'treatment_center';
  tier: 'tier_a' | 'tier_b';
  description?: string;
  contactEmail?: string;
  state?: string;
  country?: string;
}

interface CreateIntergroupResult {
  intergroupId: string;
  checkoutUrl: string;  // Stripe Checkout URL to complete payment
}

export const createIntergroup = onCall(
  { region: "us-central1" },
  async (request: CallableRequest<CreateIntergroupData>): Promise<CreateIntergroupResult> => {
    if (!request.auth) throw new HttpsError("unauthenticated", "Must be signed in");

    const { name, type, tier, description, contactEmail, state, country } = request.data;
    if (!name || !tier) throw new HttpsError("invalid-argument", "name and tier are required");

    const uid = request.auth.uid;
    const productId = tier === 'tier_a' ? productIdIntergroupA : productIdIntergroupB;
    if (!productId) throw new HttpsError("internal", "Intergroup product not configured");

    const priceId = await getDefaultPriceForProduct(productId);
    const maxGroups = tier === 'tier_a' ? 10 : 9999;

    // Create Stripe customer
    const userDoc = await db.collection("users").doc(uid).get();
    const userEmail = userDoc.data()?.email ?? request.auth.token.email ?? undefined;

    const customer = await stripe.customers.create({
      email: userEmail,
      metadata: { uid, intergroupName: name },
    });

    // Create Firestore document (subscription status starts as 'incomplete' until checkout)
    const intergroupRef = db.collection("intergroups").doc();
    const intergroupId = intergroupRef.id;

    await intergroupRef.set({
      id: intergroupId,
      name,
      type,
      tier,
      description: description ?? null,
      contactEmail: contactEmail ?? null,
      state: state ?? null,
      country: country ?? null,
      affiliatedGroupIds: [],
      maxGroups,
      adminUids: [uid],
      stripeCustomerId: customer.id,
      stripeProductIdIntergroup: productId,
      subscriptionStatus: 'incomplete',
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      createdBy: uid,
    });

    // Add creator as owner member
    await intergroupRef.collection("members").doc(uid).set({
      userId: uid,
      displayName: userDoc.data()?.displayName ?? '',
      email: userEmail ?? null,
      role: 'owner',
      addedAt: admin.firestore.FieldValue.serverTimestamp(),
      addedBy: uid,
    });

    // Create Stripe Checkout Session
    const session = await stripe.checkout.sessions.create({
      customer: customer.id,
      mode: 'subscription',
      payment_method_types: ['card'],
      line_items: [{ price: priceId, quantity: 1 }],
      success_url: `https://homegroups-app.com/intergroup-success?intergroupId=${intergroupId}`,
      cancel_url: `https://homegroups-app.com/intergroup-cancel`,
      metadata: { intergroupId, uid, tier },
    });

    return { intergroupId, checkoutUrl: session.url! };
  }
);
```

**Webhook handler:** Add `handleIntergroupCheckoutCompleted` to `stripeUtils.ts` alongside `handleCheckoutSessionCompleted`. It reads `metadata.intergroupId` (set in Checkout session metadata above) and updates the `intergroups` document with `subscriptionStatus`, `stripeSubscriptionId`, `stripePriceIdIntergroup`, and `subscriptionExpiresAt`.

---

### Task 1.3: `affiliateGroup` / `deaffiliateGroup` Cloud Functions

**Files to create:**
- `functions/src/callable/affiliateGroupToIntergroup.ts`
- `functions/src/callable/deaffiliateGroupFromIntergroup.ts`

**`affiliateGroupToIntergroup` input/output:**
```typescript
interface AffiliateGroupData {
  intergroupId: string;
  groupId: string;
}
// Auth: must be owner or admin of the intergroup AND admin of the group
// Validates: intergroup.affiliatedGroupIds.length < intergroup.maxGroups
// Writes: intergroups/{intergroupId} — adds groupId to affiliatedGroupIds
// Writes: groups/{groupId} — adds field orgId: intergroupId (for SSO, branding lookup)
// Error: if tier_a and already at 10 groups → HttpsError('resource-exhausted', 'Upgrade to Unlimited tier')
interface AffiliateGroupResult { success: boolean }
```

**`deaffiliateGroupFromIntergroup` input/output:**
```typescript
interface DeaffiliateGroupData {
  intergroupId: string;
  groupId: string;
}
// Auth: must be owner of the intergroup
// Writes: removes groupId from affiliatedGroupIds
// Writes: removes orgId from groups/{groupId}
interface DeaffiliateGroupResult { success: boolean }
```

**`GroupDocument` schema addition** in `mobile/src/types/schema.ts`:
```typescript
// Add to GroupDocument interface:
orgId?: string;       // Set when group is affiliated with an intergroup
orgName?: string;     // Denormalized for display without extra read
```

---

### Task 1.4: Intergroup Dashboard Screen

**Files to create:**
- `mobile/src/screens/intergroup/IntergroupDashboardScreen.tsx`
- `mobile/src/screens/intergroup/IntergroupGroupsScreen.tsx`  (list of affiliated groups with summary stats)
- `mobile/src/screens/intergroup/IntergroupAnnouncementScreen.tsx`  (compose broadcast announcement)
- `mobile/src/store/slices/intergroupSlice.ts`

**Files to modify:**
- `mobile/src/navigation/AppNavigator.tsx` — add `IntergroupNavigator` stack accessible from top level
- `mobile/src/types/navigation/index.ts` — add `IntergroupStackParamList`

**`IntergroupStackParamList`:**
```typescript
export type IntergroupStackParamList = {
  IntergroupDashboard: { intergroupId: string };
  IntergroupGroups: { intergroupId: string };
  IntergroupGroupDetail: { intergroupId: string; groupId: string };
  IntergroupAnnouncement: { intergroupId: string };
  IntergroupSettings: { intergroupId: string };
  IntergroupBilling: { intergroupId: string };
  IntergroupUpgrade: { intergroupId: string; currentTier: IntergroupTier };
};
```

**`IntergroupDashboardScreen` layout:**
```
[Header: Intergroup name]   [Settings gear]

[Tier badge: "Intergroup Tier A — 7/10 groups"]

[Summary cards row]:
  [Total Members: 247]   [Active Groups: 7]   [Meetings This Week: 23]

[Section: Affiliated Groups]
  [Group card: "Tuesday Night Beginners"]
    Members: 18  |  Status: Active  |  Last meeting: Tue
  [Group card: ...]
  [+ Affiliate Another Group]  (opens IntergroupGroupsScreen to search/select)

[Section: Recent Announcements]
  [Broadcast Announcement button]

[Section: Subscription]
  [Tier A — $99/yr — renews Jan 1, 2027]
  [Upgrade to Unlimited →]
```

**`intergroupSlice.ts` (entity adapter):**
```typescript
// State:
//   intergroup: IntergroupDocument | null
//   affiliatedGroups: EntityState<GroupDocument>  (loaded from affiliatedGroupIds)
//   status: 'idle' | 'loading' | 'succeeded' | 'failed'
//
// Thunks:
//   loadIntergroup(intergroupId)
//   loadAffiliatedGroups(intergroupId)
//   affiliateGroup({ intergroupId, groupId })
//   deaffiliateGroup({ intergroupId, groupId })
//
// Selectors:
//   selectIntergroup
//   selectAffiliatedGroups
//   selectIntergroupGroupCount
//   selectIsAtGroupLimit  → affiliatedGroupIds.length >= maxGroups
```

---

### Task 1.5: `sendIntergroupAnnouncement` Cloud Function

**File to create:** `functions/src/callable/sendIntergroupAnnouncement.ts`

```typescript
interface SendIntergroupAnnouncementData {
  intergroupId: string;
  title: string;
  content: string;
  targetGroupIds?: string[];  // Optional: subset of affiliated groups; default = all
}
interface SendIntergroupAnnouncementResult {
  sentToGroupCount: number;
  notificationsSent: number;
}
// Auth: must be owner or admin of the intergroup (subscriptionStatus must be 'active')
// For each target group:
//   1. Write AnnouncementDocument to groups/{groupId}/announcements subcollection
//      with createdBy = intergroupId (for attribution), mark authorName = intergroup.name
//   2. Look up group's member FCM tokens
//   3. Batch send FCM notification: "[Intergroup Name]: [title]"
// Returns: { sentToGroupCount: N, notificationsSent: M }
```

**`IntergroupAnnouncementScreen` layout:**
```
[Back]   [Compose Announcement]

[Title field]

[Content multiline field]

[Section: Send to]
  [All Affiliated Groups (default)] ← toggle
  [Select Specific Groups]
    [Checkboxes: group list]

[Preview]   [Send to X groups]
```

---

## V4.4.2: Treatment Center Integration

**Why:** Treatment centers run multiple 12-step meetings on-site (often daily) and need:
1. A facility-level admin who oversees multiple meeting groups
2. Anonymized sobriety statistics (counts, not names) for licensing and grant compliance
3. A compliance-grade export they can attach to regulatory filings

**Architecture:** A treatment center is modeled as an `IntergroupDocument` with `type: 'treatment_center'` plus a `FacilityStatsDocument` subcollection that aggregates sobriety data. No new top-level collection is needed — the intergroup model already provides multi-group management.

---

### Task 2.1: Facility Stats Aggregation

**Files to create:**
- `functions/src/callable/getFacilityStats.ts`
- `functions/src/triggers/firestore/onMilestoneWrite.ts` — updates facility aggregate on milestone changes

**Files to modify:**
- `mobile/src/types/schema.ts` — add `FacilityStatsDocument`

**Firestore schema addition:**
```typescript
/**
 * Facility Stats Document — anonymized aggregate for treatment centers
 * Path: intergroups/{intergroupId}/facilityStats/current  (singleton)
 * Written exclusively by Cloud Functions — never directly by client.
 */
export interface FacilityStatsDocument {
  // Counts only — no names, no UIDs, no identifying data
  totalActiveMemberCount: number;         // Current members across all affiliated groups
  totalMilestonesAwarded: number;         // All time
  milestonesThisMonth: number;
  milestonesThisYear: number;

  // Sobriety distribution (count of members in each bucket)
  sobrietyBuckets: {
    under30Days: number;
    thirtyToNinetyDays: number;
    ninetyDaysToOneYear: number;
    oneToTwoYears: number;
    twoToFiveYears: number;
    fiveYearsPlus: number;
  };

  // Meeting attendance aggregates
  totalMeetingsThisMonth: number;        // Count of meeting instances held
  totalAttendanceThisMonth: number;      // Sum of attendee counts across all instances
  averageAttendancePerMeeting: number;   // Derived field, recomputed on write

  lastUpdated: Timestamp;
  generatedBy: string;                   // CF name that last wrote this document
}
```

**`getFacilityStats` CF:**
```typescript
interface GetFacilityStatsData {
  intergroupId: string;
  forceRefresh?: boolean;  // If true, recomputes from source data (expensive — rate limited to once/day)
}
interface GetFacilityStatsResult {
  stats: FacilityStatsDocument;
  dataAsOf: string;  // ISO timestamp of last computation
  isStale: boolean;  // True if lastUpdated > 24 hours ago
}
// Auth: must be admin of the intergroup with type == 'treatment_center'
// Normal path: reads intergroups/{intergroupId}/facilityStats/current and returns it
// forceRefresh path: recomputes by scanning all affiliated groups' milestones
//   and meetingInstances subcollections, writes new FacilityStatsDocument, returns it
// Rate limit forceRefresh: check lastUpdated timestamp; reject if < 24 hours ago
```

**`onMilestoneWrite` trigger** (incremental updates — avoids full scans on every change):
```typescript
// Trigger: onDocumentWritten("groups/{groupId}/milestones/{memberId}")
// Looks up groups/{groupId}.orgId → if set, increments/decrements counters
// in intergroups/{orgId}/facilityStats/current using FieldValue.increment
// Only updates the bucket counts and totalMilestonesAwarded counter
// Does NOT store any member PII — purely numeric increments
```

---

### Task 2.2: Compliance Report Export

**Files to create:**
- `functions/src/callable/exportFacilityComplianceReport.ts`

**CF signature:**
```typescript
interface ExportFacilityComplianceReportData {
  intergroupId: string;
  reportPeriod: {
    startDate: string;  // ISO date YYYY-MM-DD
    endDate: string;    // ISO date YYYY-MM-DD
  };
  format: 'pdf' | 'csv';
  includeAttendance: boolean;
  includeMilestones: boolean;
  includeMeetingSchedule: boolean;
}
interface ExportFacilityComplianceReportResult {
  downloadUrl: string;   // Signed Firebase Storage URL, valid for 1 hour
  expiresAt: string;     // ISO timestamp
  reportId: string;      // Stored in intergroups/{intergroupId}/complianceReports/{reportId}
}
// Auth: must be owner or admin of the intergroup with type == 'treatment_center'
// 1. Reads FacilityStatsDocument for the period (or recomputes for date-ranged queries)
// 2. Generates PDF or CSV using the same HTML→PDF pattern as TreasuryReportService
// 3. Uploads to Firebase Storage: `compliance-reports/{intergroupId}/{reportId}.pdf`
// 4. Creates a signed URL valid for 1 hour
// 5. Writes a ComplianceReportLogDocument for audit trail
```

**Report content (PDF):**
```
[Facility Name]  |  [Date Range]  |  Generated: [date]

CONFIDENTIALITY NOTICE: This report contains anonymized aggregate statistics only.
No individual identifying information is included.

SECTION 1 — Active Members
  Total active members: [N]
  [Groups table: Group Name | Active Members | Meetings/Month]

SECTION 2 — Recovery Milestones
  Total milestones awarded in period: [N]
  30-day milestones: [N]   90-day milestones: [N]   1-year milestones: [N]

SECTION 3 — Sobriety Distribution (as of report date)
  [Chart placeholder row: Under 30 days: N | 30-90 days: N | ...]

SECTION 4 — Meeting Attendance
  Total meetings held: [N]   Total attendance events: [N]
  Average attendance per meeting: [N]

[Footer: Report ID | Generated by RecoveryConnect | Not a clinical assessment]
```

---

### Task 2.3: Facility Dashboard Screen

**Files to create:**
- `mobile/src/screens/intergroup/FacilityDashboardScreen.tsx`

**Files to modify:**
- `mobile/src/navigation/AppNavigator.tsx` — `FacilityDashboard` route added to `IntergroupStackParamList`

**Screen layout:**
```
[Header: "Facility Dashboard"]   [Export Report button]

[Stats row]:
  [Active Members: 142]   [Milestones This Month: 8]   [Avg Attendance: 11]

[Section: Sobriety Distribution]
  [Horizontal bar chart — shows bucket counts, NO names]
  Under 30 days: ████ 23
  30-90 days:    ████████ 41
  ...

[Section: Meeting Activity]
  [Meetings this month: 47 | Total attendance: 312]
  [Average per meeting: 6.6]

[Section: Groups]
  [Same affiliated group cards as IntergroupDashboard]

[Export Compliance Report button]  → opens date-picker + format selector modal
```

---

## V4.4.3: White-Label / Custom Branding

**Why:** Large intergroups and treatment centers want members to feel like they're using the organization's tool, not a third-party app. A branded experience reduces friction for member adoption and enables the org to present RecoveryConnect as part of their program — not an outside technology.

**Architecture:** A `BrandingDocument` lives in a top-level `branding` collection keyed by `brandingId`. At app startup (in `AppNavigator` or a theme provider), if the current user is a member of a group with `orgId` set, and that intergroup has a `brandingId`, the branding document is fetched once and applied to the app's theme.

---

### Task 3.1: Branding Firestore Schema

**Files to modify:**
- `mobile/src/types/schema.ts` — add `BrandingDocument`
- `mobile/src/types/schema.ts` — add `BRANDING` path to `COLLECTION_PATHS`

```typescript
/**
 * Branding Document
 * Collection: branding/{brandingId}
 * Referenced by IntergroupDocument.brandingId
 */
export interface BrandingDocument {
  id: string;
  intergroupId: string;   // Owner intergroup (only they can modify)
  orgName: string;        // Display name override (e.g., "Treehouse Recovery")
  logoUrl?: string;       // Firebase Storage URL to logo PNG (max 512x512, max 200 KB)
  primaryColor: string;   // Hex color (e.g., "#1A73E8") — used for buttons, headers
  accentColor: string;    // Hex color — used for highlights, badges
  backgroundColor?: string;  // Optional override for screen backgrounds
  headerTextColor?: string;  // For contrast on colored headers
  // Optional: custom welcome message shown on group overview
  welcomeMessage?: string;   // Max 140 chars
  // Approval state — branding must be approved by platform admin before display
  status: 'pending' | 'approved' | 'rejected';
  submittedAt: Timestamp;
  reviewedAt?: Timestamp;
  reviewedBy?: string;    // Platform admin UID
  rejectionReason?: string;
  createdAt: Timestamp;
  updatedAt: Timestamp;
}
```

**Firestore rules:**
```javascript
match /branding/{brandingId} {
  // Any authenticated user can read approved branding (needed at app startup)
  allow read: if request.auth != null && resource.data.status == 'approved';
  // Only intergroup admins can read pending/rejected (to see their own submission)
  allow read: if isIntergroupAdmin(resource.data.intergroupId);
  allow write: if false;  // Only via Cloud Functions
}
```

---

### Task 3.2: `submitBranding` Cloud Function

**File to create:** `functions/src/callable/submitBranding.ts`

```typescript
interface SubmitBrandingData {
  intergroupId: string;
  orgName: string;
  primaryColor: string;   // Must be valid hex: /^#[0-9A-Fa-f]{6}$/
  accentColor: string;
  backgroundColor?: string;
  headerTextColor?: string;
  welcomeMessage?: string;
  // Logo is uploaded separately to Firebase Storage before calling this CF.
  // The client gets a Storage upload token from uploadBrandingLogo CF,
  // uploads the file, then passes the resulting logoUrl here.
  logoUrl?: string;
}
interface SubmitBrandingResult {
  brandingId: string;
  status: 'pending';  // Always pending until platform admin approves
}
// Auth: must be owner of the intergroup AND intergroup.subscriptionStatus == 'active'
// Validates: hex color format, welcomeMessage <= 140 chars
// Creates branding/{brandingId} with status: 'pending'
// Updates intergroups/{intergroupId}.brandingId = brandingId
// Sends notification to platform super admin (via admin_notifications Firestore collection)
```

**File to create:** `functions/src/callable/uploadBrandingLogo.ts`

```typescript
interface UploadBrandingLogoData {
  intergroupId: string;
  fileExtension: 'png' | 'jpg';  // Only PNG/JPG accepted
}
interface UploadBrandingLogoResult {
  uploadUrl: string;   // Signed Storage upload URL, valid for 5 minutes
  logoUrl: string;     // The final public Storage URL to pass to submitBranding
}
// Auth: must be owner of the intergroup
// Uses admin.storage().bucket().file().getSignedUrl({ action: 'write', expires: ... })
// Path: branding-logos/{intergroupId}/logo.{ext}
```

---

### Task 3.3: App-Level Theme Provider

**Files to create:**
- `mobile/src/context/BrandingContext.tsx` — React context providing current branding
- `mobile/src/hooks/useBranding.ts` — hook that returns current branding or defaults
- `mobile/src/store/slices/brandingSlice.ts` — loads and caches BrandingDocument

**Files to modify:**
- `mobile/src/navigation/AppNavigator.tsx` — wrap with `<BrandingProvider>`
- `mobile/src/navigation/GroupStackNavigator.tsx` — apply themed header colors

**`BrandingContext.tsx` pattern:**
```typescript
// At app startup, after auth is resolved:
// 1. Check if user's groups (UserDocument.homeGroups) includes any group with orgId set
// 2. If so, load intergroups/{orgId} to get brandingId
// 3. If brandingId exists and status == 'approved', load branding/{brandingId}
// 4. Store in Redux brandingSlice
// 5. BrandingContext.Provider provides { primaryColor, accentColor, orgName, logoUrl }
// Fallback (no branding): uses app defaults (#2196F3, #4CAF50)

export const DEFAULT_BRANDING: BrandingConfig = {
  primaryColor: '#2196F3',
  accentColor: '#4CAF50',
  orgName: 'RecoveryConnect',
  logoUrl: undefined,
};

interface BrandingConfig {
  primaryColor: string;
  accentColor: string;
  orgName: string;
  logoUrl?: string;
  welcomeMessage?: string;
}

export const BrandingContext = React.createContext<BrandingConfig>(DEFAULT_BRANDING);
export const useBranding = () => React.useContext(BrandingContext);
```

**`brandingSlice.ts`:**
```typescript
// State: { branding: BrandingDocument | null, status: 'idle' | 'loading' | 'succeeded' | 'failed' }
// Thunks: loadBrandingForUser()  — resolves branding based on user's groups' orgId
// Selectors: selectBranding, selectPrimaryColor, selectAccentColor, selectOrgName
```

---

## V4.4.4: Data Export & Portability

**Why:** Traditional recovery groups worry about vendor lock-in. A credible, easy-to-use export addresses the "what if the company shuts down?" objection. It also satisfies GDPR-inspired right-to-export principles. Monthly automated backups to Firebase Storage give enterprise orgs a compliance paper trail.

**Architecture:** Reuses the pattern established by the existing `exportUserData.ts` CF. Group-level export writes a JSON or CSV file to Firebase Storage and returns a signed download URL. Scheduled backups use a Pub/Sub trigger.

---

### Task 4.1: `exportGroupData` Cloud Function

**File to create:** `functions/src/callable/exportGroupData.ts`

**Signature:**
```typescript
interface ExportGroupDataData {
  groupId: string;
  format: 'json' | 'csv';
  sections: Array<
    | 'members'
    | 'transactions'
    | 'meetings'
    | 'announcements'
    | 'milestones'
    | 'service_positions'
    | 'business_meetings'
  >;
}
interface ExportGroupDataResult {
  downloadUrl: string;   // Signed Firebase Storage URL, valid for 1 hour
  expiresAt: string;     // ISO timestamp
  exportId: string;
  fileSizeBytes: number;
}
// Auth: must be admin of groupId AND group.subscriptionStatus == 'active'
// Rate limit: max 3 exports per group per 24 hours (check exports/{groupId}/exports collection)
// For each requested section:
//   members: group_members where groupId == groupId (omit sensitive fields: fcmTokens)
//   transactions: transactions where groupId == groupId
//   meetings: meetings where groupId == groupId + meetingInstances where groupId == groupId
//   announcements: groups/{groupId}/announcements subcollection
//   milestones: groups/{groupId}/milestones subcollection (anonymized by default:
//               omit userId, only include displayName + milestone dates)
//   service_positions: groups/{groupId}/servicePositions subcollection
//   business_meetings: business_meetings where groupId == groupId
// Assembles into JSON bundle or CSV zip (one file per section)
// Uploads to: group-exports/{groupId}/{exportId}.json (or .zip for CSV)
// Creates signed URL valid for 1 hour
// Logs to: exports/{groupId}/{exportId} with timestamp and requestedBy
```

**JSON export structure:**
```json
{
  "exportVersion": "1.0",
  "exportedAt": "2026-02-22T10:00:00Z",
  "groupId": "abc123",
  "groupName": "Tuesday Night Beginners",
  "sections": {
    "members": [ { "displayName": "...", "joinedAt": "...", "roles": [...] } ],
    "transactions": [ { "type": "income", "amount": 45.00, "date": "..." } ],
    "meetings": [ { "name": "...", "day": "Tuesday", "time": "7:00 PM" } ],
    "announcements": [ { "title": "...", "content": "...", "createdAt": "..." } ],
    "milestones": [ { "displayName": "...", "days": 365, "chipGivenAt": "..." } ],
    "service_positions": [ { "name": "Secretary", "currentHolderName": "..." } ],
    "business_meetings": [ { "date": "...", "status": "completed" } ]
  }
}
```

---

### Task 4.2: Group Data Export Screen

**Files to create:**
- `mobile/src/screens/homegroup/GroupDataExportScreen.tsx`

**Files to modify:**
- `mobile/src/navigation/GroupStackNavigator.tsx` — add `GroupDataExport` route
- `mobile/src/types/navigation/index.ts` — add to `GroupStackParamList`
- `mobile/src/screens/homegroup/GroupOverviewScreen.tsx` — add "Export Group Data" item in admin settings section

**Route params:** `GroupDataExport: { groupId: string; groupName: string }`

**Screen layout:**
```
[Back]   [Export Group Data]

[Info banner]:
  Download a complete backup of your group data.
  Useful for migration, record-keeping, or compliance.

[Section: What to include]
  [✓] Members (names, join dates, roles)
  [✓] Transactions & treasury history
  [✓] Meetings & schedule
  [✓] Announcements
  [✓] Sobriety milestones
  [ ] Service positions
  [ ] Business meeting minutes

[Section: Format]
  (•) JSON   ( ) CSV (ZIP)

[Export button: "Generate Export"]

[Previous exports (last 3)]:
  Feb 22, 2026 — JSON — [Download] (expires in 47 min)
  Jan 1, 2026  — JSON — [Expired]
```

**Implementation notes:** Calls `exportGroupData` CF, then uses React Native's `Linking.openURL(downloadUrl)` to open the signed URL in the browser for download. No native download manager needed.

---

### Task 4.3: Scheduled Monthly Group Backup

**File to create:** `functions/src/triggers/pubsub/scheduledGroupBackups.ts`

```typescript
// Pub/Sub trigger: runs 1st day of each month at 02:00 UTC
// export const scheduledGroupBackups = onSchedule("0 2 1 * *", async () => { ... });

// For each group where subscriptionStatus == 'active':
//   1. Run the same export logic as exportGroupData (all sections, JSON format)
//   2. Upload to: group-backups/{groupId}/YYYY-MM.json
//   3. Keep last 13 months (delete older files from Storage)
//   4. Write backup log: groups/{groupId}/backups/{YYYY-MM} with filePath, sizeBytes, completedAt
// Batch in groups of 10 with 200ms delay between batches to avoid Firestore read exhaustion
// Log total groups backed up and any failures to Cloud Logging
```

**Firestore schema addition (backup log):**
```typescript
// Path: groups/{groupId}/backups/{YYYY-MM}  (e.g., "2026-02")
export interface GroupBackupLogDocument {
  period: string;         // "YYYY-MM"
  filePath: string;       // Storage path
  fileSizeBytes: number;
  completedAt: Timestamp;
  status: 'success' | 'failed';
  errorMessage?: string;
}
```

**`COLLECTION_PATHS` addition:**
```typescript
GROUP_BACKUPS: (groupId: string) => `groups/${groupId}/backups`,
```

---

### Task 4.4: Intergroup-Level Export

**File to create:** `functions/src/callable/exportIntergroupData.ts`

```typescript
interface ExportIntergroupDataData {
  intergroupId: string;
  format: 'json' | 'csv';
  includeGroupDetails: boolean;  // If true, each affiliated group's full export is nested
}
interface ExportIntergroupDataResult {
  downloadUrl: string;
  expiresAt: string;
  exportId: string;
}
// Auth: must be owner of the intergroup
// Assembles: intergroup metadata + all affiliated groups' member/transaction/meeting data
// (same privacy filters as exportGroupData — no fcmTokens, no private user data)
// Uploads to: intergroup-exports/{intergroupId}/{exportId}.json
```

---

## V4.4.5: SSO / Organization Sign-In

**Why:** Corporate recovery programs, large sober living networks, and treatment centers manage staff and residents using a shared email domain. Automatic group joining based on email domain removes the friction of invite codes and manual admin approval for every new member.

**Architecture:** Uses Firebase Auth custom claims. When a user signs up or signs in, a trigger checks their email domain against the `intergroups` collection's `emailDomains` array. If matched, the user is auto-joined to the intergroup's designated `ssoAutoJoinGroupId`. This is additive — users can still join other groups normally.

**Security boundary:** Email domain matching only applies to groups explicitly configured by an intergroup admin who is already authenticated and has an active subscription. There is no way for an arbitrary user to create an email domain rule.

---

### Task 5.1: `configureSSO` Cloud Function

**File to create:** `functions/src/callable/configureSSO.ts`

```typescript
interface ConfigureSSOData {
  intergroupId: string;
  emailDomains: string[];     // e.g., ["treehouserecovery.org", "treehouse.com"]
  autoJoinGroupId: string;    // Must be in intergroup.affiliatedGroupIds
  autoJoinRole?: 'member';    // Future: could support 'member' | 'admin' — default 'member'
  enabled: boolean;           // Can be used to disable SSO without clearing config
}
interface ConfigureSSOResult {
  success: boolean;
  configuredDomains: string[];
}
// Auth: must be owner of the intergroup AND intergroup.subscriptionStatus == 'active'
//       AND intergroup.tier == 'tier_b' (SSO is Tier B only — unlimited plan)
// Validates:
//   - Each domain matches /^[a-zA-Z0-9][a-zA-Z0-9-]{0,61}[a-zA-Z0-9]\.[a-zA-Z]{2,}$/
//   - autoJoinGroupId is in intergroup.affiliatedGroupIds
//   - Max 5 domains per intergroup
// Writes to intergroups/{intergroupId}: { emailDomains, ssoAutoJoinGroupId, ssoEnabled: enabled }
// Also writes to sso_domain_index/{domain} → { intergroupId, autoJoinGroupId }
//   (top-level collection for fast lookup by domain in the auth trigger)
```

**New Firestore collection for fast domain lookup:**
```typescript
/**
 * SSO Domain Index Document
 * Collection: sso_domain_index/{domain}  (e.g., "treehouserecovery.org")
 * Written by configureSSO CF. Read by onUserCreated trigger.
 */
export interface SSODomainIndexDocument {
  domain: string;
  intergroupId: string;
  autoJoinGroupId: string;
  intergroupName: string;   // Denormalized for notification copy
  enabled: boolean;
  configuredAt: Timestamp;
  configuredBy: string;     // UID of admin who configured it
}
```

**`COLLECTION_PATHS` addition:**
```typescript
SSO_DOMAIN_INDEX: 'sso_domain_index',
```

**Firestore rules for SSO index:**
```javascript
match /sso_domain_index/{domain} {
  allow read: if false;   // Only readable by Cloud Functions (admin SDK)
  allow write: if false;
}
```

---

### Task 5.2: `onUserCreated` Auth Trigger (Domain Auto-Join)

**File to create:** `functions/src/triggers/auth/onUserCreated.ts`

```typescript
import { auth } from "firebase-functions/v2";
import { db } from "../../utils/firebase";
import * as admin from "firebase-admin";

export const onUserCreated = auth.user().onCreate(async (user) => {
  const email = user.email;
  if (!email || !email.includes('@')) return;

  const domain = email.split('@')[1].toLowerCase();

  // Check SSO domain index
  const ssoDoc = await db.collection("sso_domain_index").doc(domain).get();
  if (!ssoDoc.exists || !ssoDoc.data()?.enabled) return;

  const { intergroupId, autoJoinGroupId, intergroupName } = ssoDoc.data()!;

  // Auto-join the group (same logic as joinGroupByInviteCode)
  const groupRef = db.collection("groups").doc(autoJoinGroupId);
  const groupSnap = await groupRef.get();
  if (!groupSnap.exists) {
    console.warn(`SSO auto-join: group ${autoJoinGroupId} not found for domain ${domain}`);
    return;
  }

  const memberId = `${autoJoinGroupId}_${user.uid}`;
  await db.collection("members").doc(memberId).set({
    id: memberId,
    groupId: autoJoinGroupId,
    userId: user.uid,
    displayName: user.displayName ?? email.split('@')[0],
    showPhoneNumber: false,
    joinedAt: admin.firestore.FieldValue.serverTimestamp(),
    isAdmin: false,
    isTreasurer: false,
    roles: ['member'],
    showSobrietyDate: false,
  });

  // Sync user document: add group to homeGroups
  await db.collection("users").doc(user.uid).set(
    {
      homeGroups: admin.firestore.FieldValue.arrayUnion(autoJoinGroupId),
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    },
    { merge: true }
  );

  // Set custom claim: group membership (triggers onMemberWrite claims sync)
  // The existing onMemberWrite trigger handles custom claim propagation —
  // no direct custom claim write needed here.

  console.log(`SSO: auto-joined user ${user.uid} (domain: ${domain}) to group ${autoJoinGroupId} via intergroup ${intergroupId}`);
});
```

**Files to modify:**
- `functions/src/index.ts` — export `onUserCreated`

**Dependency note:** This trigger relies on the existing `onMemberWrite` trigger in `functions/src/triggers/firestore/onMemberWrite.ts` to propagate group membership to custom JWT claims. The trigger chain is: `onUserCreated` writes to `members/` → `onMemberWrite` updates custom claims → client gets correct access on next token refresh.

---

### Task 5.3: SSO Configuration Screen

**Files to create:**
- `mobile/src/screens/intergroup/IntergroupSSOScreen.tsx`

**Files to modify:**
- `mobile/src/types/navigation/index.ts` — add `IntergroupSSO` to `IntergroupStackParamList`
- `mobile/src/screens/intergroup/IntergroupDashboardScreen.tsx` — add SSO settings link in Settings section

**Route params:** `IntergroupSSO: { intergroupId: string }`

**Screen layout:**
```
[Back]   [SSO / Auto-Join Settings]

[Tier badge: "Unlimited Plan Required"]
(If tier_a: shows lock overlay with "Upgrade to Unlimited to enable SSO")

[Section: How it works]
  When a new member signs up with an email from your organization's
  domain, they're automatically added to your designated group.
  No invite codes needed.

[Section: Email Domains]
  [Domain 1: treehouserecovery.org]  [Remove]
  [Domain 2: treehouse.com]          [Remove]
  [+ Add Domain]  (text input → validates format → calls configureSSO)

[Section: Auto-Join Group]
  [Picker: select from affiliated groups]
  Currently: "Main Facility Group (47 members)"

[Toggle: SSO Enabled / Disabled]

[Save Changes]

[Section: Recent Auto-Joins]
  [Last 10 users auto-joined, showing date and display name only]
  (Read from sso_join_log/{intergroupId}/events — written by onUserCreated trigger)
```

**SSO join log** (needed for the audit list in the screen):
```typescript
// Written by onUserCreated trigger:
// Path: sso_join_log/{intergroupId}/events/{auto-generated}
export interface SSOJoinLogDocument {
  userId: string;       // Needed for deduplication — do not display in UI
  displayName: string;  // Display only
  domain: string;
  joinedAt: Timestamp;
  groupId: string;
}
// Security rule: readable only by intergroup admins
```

---

## Stripe Webhook Handler Updates

**File to modify:** `functions/src/utils/stripeUtils.ts`

Add handling for intergroup checkout sessions in `handleCheckoutSessionCompleted`:

```typescript
// In handleCheckoutSessionCompleted, add after existing groupId check:
const intergroupId = session.metadata?.intergroupId;

if (intergroupId) {
  // Handle intergroup subscription activation
  const subscription = await stripe.subscriptions.retrieve(
    subscriptionId as string,
    { expand: ["items"] }
  );
  const intergroupRef = db.collection("intergroups").doc(intergroupId);
  await intergroupRef.update({
    stripeCustomerId: customerId,
    stripeSubscriptionId: subscriptionId,
    subscriptionStatus: subscription.status,
    stripePriceIdIntergroup: subscription.items.data[0]?.price?.id ?? null,
    stripeSubscriptionItemId: findSubscriptionItemId(subscription),
    subscriptionExpiresAt: (subscription as any).current_period_end
      ? admin.firestore.Timestamp.fromMillis(
          (subscription as any).current_period_end * 1000,
        )
      : null,
    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
  });
  console.log(`Intergroup ${intergroupId} subscription activated`);
  return;
}
// ... existing group handling continues below
```

Also add `handleIntergroupSubscriptionUpdated` and `handleIntergroupSubscriptionDeleted` following the exact same patterns as their `group` equivalents, but targeting the `intergroups` collection.

---

## Implementation Order

```
V4.4.1 (Intergroup accounts)
  → V4.4.2 (Treatment centers)   [depends on IntergroupDocument + affiliatedGroupIds]
  → V4.4.5 (SSO)                 [depends on orgId on groups + sso_domain_index collection]

V4.4.3 (White-label branding)    [independent — start in parallel with V4.4.2]
V4.4.4 (Data export)             [independent — start in parallel with V4.4.2]
```

Recommended sequencing for a single developer:

1. **V4.4.1 Tasks 1.1 + 1.2** — Schema and `createIntergroup` CF: establishes all Firestore collections and Stripe products. No UI yet. (~2 hrs)
2. **V4.4.1 Task 1.3** — Affiliate/deaffiliate CFs: completes the group management primitives. (~1 hr)
3. **V4.4.1 Tasks 1.4 + 1.5** — Dashboard screen and broadcast CF: first visible UI. (~2.5 hrs)
4. **V4.4.4 Tasks 4.1 + 4.2** — `exportGroupData` CF and export screen: self-contained, high-trust-building feature. (~2.5 hrs)
5. **V4.4.3 Tasks 3.1 + 3.2 + 3.3** — Branding schema, CF, and theme provider: requires V4.4.1 for `orgId` reference. (~3 hrs)
6. **V4.4.2 Tasks 2.1 + 2.2 + 2.3** — Facility stats, compliance report, dashboard screen. (~4 hrs)
7. **V4.4.4 Tasks 4.3 + 4.4** — Scheduled backups and intergroup export. (~2 hrs)
8. **V4.4.5 Tasks 5.1 + 5.2 + 5.3** — SSO config CF, auth trigger, settings screen. (~3.5 hrs)

---

## File Reference

**New Cloud Functions:**
- `functions/src/callable/createIntergroup.ts`
- `functions/src/callable/affiliateGroupToIntergroup.ts`
- `functions/src/callable/deaffiliateGroupFromIntergroup.ts`
- `functions/src/callable/sendIntergroupAnnouncement.ts`
- `functions/src/callable/getFacilityStats.ts`
- `functions/src/callable/exportFacilityComplianceReport.ts`
- `functions/src/callable/submitBranding.ts`
- `functions/src/callable/uploadBrandingLogo.ts`
- `functions/src/callable/exportGroupData.ts`
- `functions/src/callable/exportIntergroupData.ts`
- `functions/src/callable/configureSSO.ts`
- `functions/src/triggers/firestore/onMilestoneWrite.ts`
- `functions/src/triggers/pubsub/scheduledGroupBackups.ts`
- `functions/src/triggers/auth/onUserCreated.ts`

**New Screens:**
- `mobile/src/screens/intergroup/IntergroupDashboardScreen.tsx`
- `mobile/src/screens/intergroup/IntergroupGroupsScreen.tsx`
- `mobile/src/screens/intergroup/IntergroupAnnouncementScreen.tsx`
- `mobile/src/screens/intergroup/IntergroupSSOScreen.tsx`
- `mobile/src/screens/intergroup/FacilityDashboardScreen.tsx`
- `mobile/src/screens/homegroup/GroupDataExportScreen.tsx`

**New Redux Slices:**
- `mobile/src/store/slices/intergroupSlice.ts`
- `mobile/src/store/slices/brandingSlice.ts`

**New Context / Hooks:**
- `mobile/src/context/BrandingContext.tsx`
- `mobile/src/hooks/useBranding.ts`

**New Firestore Collections:**
- `intergroups/{intergroupId}` — intergroup documents
- `intergroups/{intergroupId}/members/{userId}` — intergroup-level admins
- `intergroups/{intergroupId}/announcements/{announcementId}` — broadcast announcements
- `intergroups/{intergroupId}/facilityStats/current` — anonymized aggregate (treatment centers)
- `intergroups/{intergroupId}/complianceReports/{reportId}` — export audit log
- `branding/{brandingId}` — white-label theme documents
- `sso_domain_index/{domain}` — email domain → intergroup mapping
- `sso_join_log/{intergroupId}/events/{eventId}` — SSO auto-join audit trail
- `groups/{groupId}/backups/{YYYY-MM}` — monthly backup logs
- `exports/{groupId}/{exportId}` — on-demand export log

**Modified Files:**
- `mobile/src/types/schema.ts` — new document types and `COLLECTION_PATHS` entries
- `mobile/src/types/navigation/index.ts` — `IntergroupStackParamList`
- `mobile/src/navigation/AppNavigator.tsx` — `IntergroupNavigator` stack
- `functions/src/utils/stripe.ts` — `productIdIntergroupA`, `productIdIntergroupB` exports
- `functions/src/utils/stripeUtils.ts` — intergroup subscription webhook handlers
- `functions/src/index.ts` — export all new CFs and triggers
- `firestore.rules` — intergroup read/write rules, branding rules, SSO index rules
- `mobile/src/screens/homegroup/GroupOverviewScreen.tsx` — "Export Group Data" link

---

## V4.4 Success Metrics

| Metric | Target | How it's measured |
|---|---|---|
| Intergroup accounts created | 5 paying within 90 days of launch | `intergroups` collection count with `subscriptionStatus == 'active'` |
| Average affiliated groups per intergroup | > 6 | `affiliatedGroupIds.length` average across active intergroups |
| Compliance report exports | > 2/month per treatment center | `complianceReports` subcollection write count |
| Branding submissions approved | 3 within 60 days | `branding` collection count with `status == 'approved'` |
| Data export usage | > 15% of active groups export at least once | `exports` collection group count |
| SSO auto-joins | > 10 per configured domain per month | `sso_join_log` event count |
| Monthly automated backup success rate | > 99% | Cloud Logging + `groups/{groupId}/backups` success count |
