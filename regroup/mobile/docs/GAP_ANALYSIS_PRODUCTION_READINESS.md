# RATS App Gap Analysis: Production Readiness

> **⚠️ Historical Document — December 2025 Snapshot**
> This document was written on December 25, 2025 and reflects the app at ~70-75% production readiness.
> As of May 2026 the app is at **~90%**. For the current state, see [`docs/plans/ACTIVE_PLAN.md`](../plans/ACTIVE_PLAN.md).
> This file is preserved as a historical record of the gap analysis that drove Sprints 1–4.

**Date:** December 25, 2025  
**Purpose:** Identify gaps between current implementation and production-ready state for client distribution  
**Scope:** Mobile app (React Native), Cloud Functions (Firebase), and Core Requirements alignment

---

## Executive Summary

The RATS (Regroup) sober living management app has **70-75% of core functionality working** but has **critical gaps** that must be addressed before confident distribution to paying clients. This document provides a comprehensive analysis of:

1. **Critical Gaps** - Blocks revenue generation or client acquisition
2. **High Priority Gaps** - Core requirements from industry standards not met
3. **Technical Debt** - Issues that will cause problems at scale
4. **Lower Priority Gaps** - Features and improvements for future phases

### Overall Readiness Score

| Category             | Status                     | Score |
| -------------------- | -------------------------- | ----- |
| Core Features        | ✅ Mostly implemented      | 75%   |
| Payment System       | ⚠️ Operator billing only   | 30%   |
| Testing              | ❌ Near zero coverage      | 5%    |
| Error Handling       | ⚠️ Inconsistent            | 40%   |
| Offline Support      | ❌ Not implemented         | 10%   |
| Security             | ⚠️ Basic issues exist      | 60%   |
| Documentation        | ✅ Extensive internal docs | 85%   |
| Oxford House Support | ❌ Not started             | 0%    |

**Bottom Line:** 8-10 weeks of focused development needed before controlled client distribution.

---

## Table of Contents

1. [Critical Gaps (Blocks Revenue/Distribution)](#1-critical-gaps-blocks-revenuedistribution)
2. [High Priority Gaps (Core Requirements Missing)](#2-high-priority-gaps-core-requirements-missing)
3. [Technical Debt (Medium Priority)](#3-technical-debt-medium-priority)
4. [Lower Priority Gaps](#4-lower-priority-gaps)
5. [Security Concerns](#5-security-concerns)
6. [Cloud Functions Issues](#6-cloud-functions-issues)
7. [Mobile App Issues](#7-mobile-app-issues)
8. [Recommended Prioritization](#8-recommended-prioritization)
9. [Resource Requirements](#9-resource-requirements)

---

## 1. Critical Gaps (Blocks Revenue/Distribution)

These issues must be resolved before the app can be sold to clients.

### 1.1 Payment System Incomplete

**Current State:**

- Stripe integration exists for **operator subscription billing only**
- Cloud functions handle operator charges (`updateSubscriptionGuests`, `updateSubscriptionHouses`)
- No resident-facing payment capability

**What's Missing:**

| Feature                | Description                             | Priority |
| ---------------------- | --------------------------------------- | -------- |
| Resident Payment UI    | Interface for residents to pay rent/EES | P0       |
| Payment Method Storage | Save cards/ACH for residents            | P0       |
| Rent Invoicing         | Generate and send invoices              | P0       |
| Payment Reminders      | Automated reminders before due date     | P0       |
| Late Fee Calculation   | Automatic late fee application          | P1       |
| Payment History        | View past payments and receipts         | P1       |
| Digital Receipts       | Generate PDF receipts                   | P1       |
| Recurring Payments     | Auto-pay setup for residents            | P2       |

**Technical Details:**

Current Stripe implementation in `regroup-functions/functions/src/api/stripe.ts`:

```typescript
// Current: Only operator billing
export const createSubscription = async (customerId, newOperator) => {
  return stripe.subscriptions.create({
    customer: customerId,
    items: [
      { plan: planIds.house, quantity: 0 },
      { plan: planIds.guest, quantity: 0 },
    ],
    trial_period_days: 30,
  });
};

// MISSING: Resident payment collection
// MISSING: One-time payment processing
// MISSING: Rent/EES tracking per resident
```

**Impact:** Cannot generate revenue from the #1 feature operators need (rent collection).

---

### 1.2 Test Coverage Near Zero

**Current State:**

```
Total test files found: 2
- src/services/__tests__/ValidationService.test.ts
- src/navigation/__tests__/migration.test.ts
```

**What's Missing:**

| Test Type             | Current  | Target    | Gap      |
| --------------------- | -------- | --------- | -------- |
| Unit Tests (Services) | ~2 files | 25+ files | 23 files |
| Unit Tests (Utils)    | 0 files  | 15+ files | 15 files |
| Integration Tests     | 0 files  | 10+ files | 10 files |
| Component Tests       | 0 files  | 20+ files | 20 files |
| E2E Tests             | 0 files  | 5+ flows  | 5 flows  |

**Critical Paths Untested:**

1. Authentication flow (sign up, sign in, password reset)
2. Guest creation and management
3. Activity logging (meetings, chores, work)
4. Dispute system
5. Payment processing (when implemented)
6. GPS meeting verification
7. Real-time chat

**Impact:**

- Any code change risks breaking existing features
- No confidence in deployment stability
- Increased bug rate in production

---

### 1.3 Error Handling Inconsistent

**Current State:**

Error handling exists in some areas but is inconsistent:

```typescript
// GOOD: EnhancedAuthService has structured error handling
static async signInWithEmail(email, password): Promise<AuthResult> {
  try {
    // ... logic
  } catch (error: any) {
    switch (error.code) {
      case 'auth/email-already-in-use':
        return { success: false, error: 'An account with this email already exists.' };
      // ... more cases
    }
  }
}

// BAD: Many services have no error handling
export const createIssue = (issue: HouseIssue) => {
  return crud.create<HouseIssue>(issuesCollection, issue, issue.id);
  // No try/catch, no error transformation
};
```

**What's Missing:**

| Area                        | Issue                                      |
| --------------------------- | ------------------------------------------ |
| Centralized Error Reporting | Sentry configured but not verified working |
| Network Error Handling      | No retry logic or offline queue            |
| User-Facing Messages        | Generic or missing error messages          |
| Error Boundaries            | Only at root level                         |
| Firebase Error Mapping      | Not all error codes handled                |

**Files Needing Error Handling Review:**

- `src/services/crud.tsx`
- `src/services/guest.tsx`
- `src/services/house.tsx`
- `src/services/issues.ts`
- `src/services/complaints.ts`
- `src/services/dispute.tsx`
- `src/services/message.tsx`

---

### 1.4 Offline Support Missing

**Current State:**

- No `@react-native-community/netinfo` usage found
- No offline queue implementation
- No explicit Firestore offline persistence configuration

**What's Missing:**

| Feature                  | Description                       | Priority |
| ------------------------ | --------------------------------- | -------- |
| Network Status Detection | Know when device is offline       | P0       |
| Offline Queue            | Queue operations for later sync   | P1       |
| Optimistic Updates       | Update UI immediately, sync later | P1       |
| Conflict Resolution      | Handle sync conflicts             | P2       |
| Offline Indicators       | Show user when operating offline  | P0       |

**Impact:** Users in rural areas or facilities with poor connectivity will have degraded experience or data loss.

---

## 2. High Priority Gaps (Core Requirements Missing)

These gaps represent features that operators expect based on industry standards (per `CORE_REQUIREMENTS.md`).

### 2.1 Rent and Payment Tracking

**Requirement:**

> "Rent and payment tracking: Invoices, balances, online payments, and receipts, with alerts for late or missed payments."

**Current State:**

- `Guest.rentOwed: number` field exists
- `Guest.choreFees: number` field exists
- No invoice system
- No payment tracking UI
- No automated alerts

**Missing Components:**

| Component                       | Status     | Location Needed                  |
| ------------------------------- | ---------- | -------------------------------- |
| Invoice Entity                  | ❌ Missing | `src/entities/Invoice.ts`        |
| Payment Entity                  | ❌ Missing | `src/entities/Payment.ts`        |
| Invoice Service                 | ❌ Missing | `src/services/invoice.ts`        |
| Payment Service                 | ❌ Missing | `src/services/payment.ts`        |
| Payment Screen (Resident)       | ❌ Missing | `src/screens/Payments/`          |
| Payment Dashboard (Admin)       | ❌ Missing | `src/screens/Admin/Payments/`    |
| Payment Reminder Cloud Function | ❌ Missing | `functions/src/util/payments.ts` |

---

### 2.2 Reporting & Outcomes

**Requirement:**

> "Reporting & outcomes: Basic dashboards for occupancy, length of stay, infractions, discharges, and key outcomes"

**Current State:**

- `WeeklyReport` entity exists but only for individual guest stats
- No admin-facing reporting dashboard
- No export functionality

**Missing Components:**

| Report Type       | Status     | Description                                |
| ----------------- | ---------- | ------------------------------------------ |
| Occupancy Report  | ❌ Missing | Beds filled vs available over time         |
| Length of Stay    | ❌ Missing | Average/median stay duration               |
| Compliance Report | ❌ Missing | Meeting attendance, chore completion rates |
| Financial Report  | ❌ Missing | Rent collection, outstanding balances      |
| Discharge Report  | ❌ Missing | Reasons, outcomes, destinations            |
| PDF Export        | ❌ Missing | Download reports as PDF                    |
| CSV Export        | ❌ Missing | Export raw data for analysis               |
| Scheduled Reports | ❌ Missing | Auto-email weekly/monthly reports          |

---

### 2.3 Document & Form Management

**Requirement:**

> "Document & form management: E-sign intake packets, house agreements, and policy docs; store everything in the resident chart"

**Current State:**

- No document management system
- No form builder
- No e-signature capability

**Missing Components:**

| Component                                       | Status     | Priority |
| ----------------------------------------------- | ---------- | -------- |
| Document Upload UI                              | ❌ Missing | P1       |
| Document Storage (Firebase Storage integration) | ❌ Missing | P1       |
| Document Viewer                                 | ❌ Missing | P1       |
| E-Signature Integration                         | ❌ Missing | P2       |
| Form Templates                                  | ❌ Missing | P2       |
| Document Expiration Tracking                    | ❌ Missing | P2       |

---

### 2.4 Staff Notes & Shift Logs

**Requirement:**

> "Staff notes & shift logs: Shared notes per resident and per house (shift reports, incident follow-up, case updates)"

**Current State:**

- Only `Message` entity exists for chat
- No structured notes system
- No shift handoff capability

**Missing Components:**

| Component               | Status     | Description                                    |
| ----------------------- | ---------- | ---------------------------------------------- |
| StaffNote Entity        | ❌ Missing | Structured note with type, severity, follow-up |
| ShiftLog Entity         | ❌ Missing | Shift start/end, incidents, handoff items      |
| Notes Service           | ❌ Missing | CRUD for notes                                 |
| Notes UI (per resident) | ❌ Missing | View/add notes on resident profile             |
| Shift Handoff UI        | ❌ Missing | End-of-shift summary and handoff               |
| Note Search             | ❌ Missing | Find notes by keyword, date, type              |

---

### 2.5 Announcements System

**Requirement:**

> "Announcements & messaging (lightweight): House-wide announcements and reminders"

**Current State:**

- House group chat exists
- No dedicated announcements feature

**Missing Components:**

| Component                            | Status     | Description                                   |
| ------------------------------------ | ---------- | --------------------------------------------- |
| Announcement Entity                  | ❌ Missing | Pinned, priority, expiration                  |
| Announcement UI                      | ❌ Missing | Create/view announcements                     |
| Push Notifications for Announcements | ⚠️ Partial | Notifications exist but not for announcements |
| Announcement Templates               | ❌ Missing | Common announcement types                     |

---

## 3. Technical Debt (Medium Priority)

These issues won't block launch but will cause problems at scale.

### 3.1 Data Model Issues

#### Guest Embeds Week Objects (Anti-Pattern)

**Problem:**

```typescript
// Current problematic structure in src/entities/Guest.tsx
export class Guest extends BaseEntity {
  id: string;
  houseId: string;
  // ...
  currentWeek: Week; // 🔴 Embedded object
  previousWeek: Week; // 🔴 Embedded object
  nextWeek: Week; // 🔴 Embedded object
}
```

**Issues:**

- Firestore documents have 1MB limit - embedding Weeks can hit this
- Concurrent updates to same Guest doc cause race conditions
- Inefficient queries - must fetch entire Guest to get Week data
- Difficult to query activities across all guests

**Impact:** HIGH - Blocks scaling to houses with 10+ residents

**Solution:** Normalize to separate `weeks` collection (documented in `ACTIVITY_SYSTEM_MIGRATION.md`)

---

#### Duplicate Activity Services

**Problem:**

```
src/services/activity.ts           // Original implementation
src/services/EnhancedActivityService.ts  // Duplicate with some enhancements
```

Both implement:

- `addActivity()`
- `getActivities()`
- `calculateHealthScore()`

**Impact:** Developer confusion, maintenance burden

**Solution:** Merge into single `ActivityService`

---

### 3.2 Redux Architecture Mixed

**Current State:**

| Pattern                    | % of Code | Example                                                                |
| -------------------------- | --------- | ---------------------------------------------------------------------- |
| Old Redux (manual actions) | ~60%      | `UPDATING_GUEST`, `UPDATING_GUEST_SUCCESSFUL`, `UPDATING_GUEST_FAILED` |
| Redux Toolkit              | ~40%      | `createAsyncThunk`, `createSlice`                                      |

**Problem:**

```typescript
// OLD PATTERN (60% of codebase) - 50+ lines per action
export const UPDATING_GUEST = 'UPDATING_GUEST';
export const UPDATING_GUEST_SUCCESSFUL = 'UPDATING_GUEST_SUCCESSFUL';
export const UPDATING_GUEST_FAILED = 'UPDATING_GUEST_FAILED';

export function updateGuest(guestId, updates) {
  return async (dispatch, getState) => {
    dispatch({ type: UPDATING_GUEST });
    try {
      await guestService.update(guestId, updates);
      dispatch({ type: UPDATING_GUEST_SUCCESSFUL });
    } catch (error) {
      dispatch({ type: UPDATING_GUEST_FAILED, error });
    }
  };
}

// NEW PATTERN (40% of codebase) - 10 lines, fully typed
export const updateGuest = createAsyncThunk(
  'guests/update',
  async ({ guestId, updates }) => {
    return await guestService.update(guestId, updates);
  },
);
```

**Impact:**

- 3x more code than necessary
- Inconsistent patterns confuse developers
- Harder to maintain

**Solution:** Gradual migration to Redux Toolkit (documented in `IMPLEMENTATION_PLAN.md`)

---

### 3.3 TypeScript Inconsistency

**Problem:**

```typescript
// BAD: Using `any` (found throughout codebase)
function mapStateToProps(state: any, props: any) {
  return {
    loggedIn: state.user.loggedIn,
    user: state.user.user,
  };
}

// GOOD: Proper types (newer code)
function mapStateToProps(state: RootState) {
  return {
    user: state.user.user,
  };
}
```

**Files with Excessive `any` Usage:**

- `src/store/actions/*.tsx`
- `src/store/reducers/*.tsx`
- `src/screens/*/*.tsx` (mapStateToProps)

**Impact:**

- Lose type safety benefits
- Harder to refactor safely
- IDE autocompletion less useful

---

### 3.4 Class vs Functional Components

**Current State:**

| Component Type        | Usage           |
| --------------------- | --------------- |
| Class Components      | ~80% of screens |
| Functional Components | ~20% of screens |

**Example:**

```typescript
// CURRENT: Most screens use class components
class OperatorSetupWizard extends PureComponent<Props, State> {
  constructor(props) {
    super(props);
    this.state = new State();
  }

  componentDidMount() { /* ... */ }
  render() { /* ... */ }
}

// MODERN: Functional components with hooks
const OperatorSetupWizard: React.FC<Props> = (props) => {
  const [state, setState] = useState(initialState);
  useEffect(() => { /* ... */ }, []);
  return (/* ... */);
};
```

**Impact:**

- Can't use hooks in class components
- More boilerplate code
- Harder to share logic between components

**Note:** This is not breaking - class components work fine. Migrate gradually when touching screens.

---

## 4. Lower Priority Gaps

These can be addressed in future phases after core functionality is stable.

### 4.1 Oxford House Features (Future Market)

Per `FEATURE_PRIORITY_ROADMAP.md`, the Oxford House market (2,500 potential customers) requires:

| Feature              | Status     | Description                                  |
| -------------------- | ---------- | -------------------------------------------- |
| House Model Selector | ❌ Missing | Traditional vs Oxford toggle                 |
| Officer Roles        | ❌ Missing | President, Treasurer, Secretary, Comptroller |
| EES Tracking         | ❌ Missing | Equal Expense Share (different from rent)    |
| Business Meetings    | ❌ Missing | Weekly mandatory meeting management          |
| Democratic Voting    | ❌ Missing | New member approval, expulsion votes         |
| Charter Compliance   | ❌ Missing | Three conditions monitoring                  |

**Timeline:** Phase 1 features (Months 1-3 after core gaps addressed)

---

### 4.2 Advanced Features

| Feature                   | Status     | Priority |
| ------------------------- | ---------- | -------- |
| Photo Verification        | ❌ Missing | P3       |
| Advanced Analytics        | ❌ Missing | P3       |
| Marketing/Lead Management | ❌ Missing | P3       |
| Alumni Network            | ❌ Missing | P4       |
| Third-Party Integrations  | ❌ Missing | P4       |
| White-Label Options       | ❌ Missing | P4       |

---

### 4.3 Chore System Limitations

**Current State:**

```typescript
// Current: One chore per week per guest
guest.currentWeek.chore = 'Kitchen';

// Expected: Multiple chores with varied frequencies
guest.chores = [
  { name: 'Kitchen', frequency: 'daily', assignedDays: ['Mon', 'Wed', 'Fri'] },
  { name: 'Trash', frequency: 'weekly', dueDay: 'Sunday' },
];
```

**Impact:** Works for most houses but limits flexibility.

---

## 5. Security Concerns

### 5.1 Hardcoded Secrets

**Critical Issue Found:**

```typescript
// regroup-functions/functions/src/api/stripe.ts
const liveModeSecret = 'sk_live_XXXX...XXXX'; // ⚠️ EXPOSED (redacted)
```

**Required Fix:**

```typescript
// Move to environment variables
const liveModeSecret = process.env.STRIPE_SECRET_KEY;
// Or use Firebase functions config
const liveModeSecret = functions.config().stripe.secret_key;
```

**Other Secrets to Review:**

- Google API keys in `google/apikeys.ts`
- Firebase configuration

---

### 5.2 No Two-Factor Authentication

**Current State:** Users can only sign in with email/password.

**Missing:**

- SMS-based 2FA
- Authenticator app support (TOTP)
- Backup codes
- Admin enforcement option

**Impact:** Security risk for operator accounts with sensitive resident data.

---

### 5.3 Rate Limiting

**Current State:**

```typescript
// Partial: Only in EnhancedAuthService
if (!SimpleValidationService.checkRateLimit(`signin_${email}`, 5, 60000)) {
  return { success: false, error: 'Too many sign-in attempts...' };
}
```

**Missing:**

- Rate limiting on API calls
- Rate limiting on cloud functions
- DDoS protection

---

## 6. Cloud Functions Issues

### 6.1 Code Organization

**Problem:** `functions/src/index.ts` is 1,041 lines

**Solution:** Split into modules:

- `functions/src/api/houses.ts`
- `functions/src/api/guests.ts`
- `functions/src/api/meetings.ts`
- `functions/src/api/payments.ts`
- `functions/src/triggers/index.ts`

---

### 6.2 Entity Duplication

**Problem:** Entities defined in both mobile and functions:

| Entity | Mobile Location          | Functions Location                |
| ------ | ------------------------ | --------------------------------- |
| Guest  | `src/entities/Guest.tsx` | `functions/src/entities/Guest.ts` |
| House  | `src/entities/House.tsx` | `functions/src/entities/House.ts` |
| Week   | `src/entities/Week.tsx`  | `functions/src/entities/Week.ts`  |
| ...    | ...                      | ...                               |

**Solution:** Create shared types package or generate from single source.

---

### 6.3 Weekly Transfer Function Coupling

**Problem:** `transferStats()` in `util/guest.ts` is tightly coupled to embedded Week model:

```typescript
// Current implementation relies on guest.currentWeek structure
export const transferStats = async (context, timezone, houseId) => {
  // ... accesses guest.currentWeek.days[date]
  // ... creates WeeklyReport from Week data
  // ... moves currentWeek to previousWeek
};
```

**Impact:** Will break when data model is normalized.

---

## 7. Mobile App Issues

### 7.1 Known Bugs

| Bug                         | Location          | Severity |
| --------------------------- | ----------------- | -------- |
| Chat input animation issues | `BaseChat.tsx`    | Medium   |
| Android keyboard handling   | Multiple screens  | Medium   |
| TODO/FIXME markers in code  | 6 locations found | Low      |

**TODO/FIXME Locations:**

```
src/util/display.tsx: 2 occurrences
src/resolvers/HouseResolver.tsx: 1 occurrence
src/entities/Phase.tsx: 1 occurrence
src/entities/Guest.tsx: 1 occurrence
src/components/rats-hoc/withRats.tsx: 1 occurrence
```

---

### 7.2 Performance Unknowns

**Missing Metrics:**

- Cold start time
- Time to interactive
- App crash rate
- Memory usage
- Battery impact

**Recommendation:** Add Firebase Performance Monitoring or similar.

---

### 7.3 Mixed Database Usage

**Current State:**

- **Firestore:** All entities except messages
- **Realtime Database:** Messages (`message.tsx` uses Realtime DB)

**Impact:**

- Inconsistent patterns
- Different caching behavior
- More complex security rules

---

## 8. Recommended Prioritization

### Phase 1: Revenue Critical (4-6 weeks)

| Task                               | Effort  | Impact               |
| ---------------------------------- | ------- | -------------------- |
| Resident payment system (Stripe)   | 3 weeks | Unlocks revenue      |
| Payment reminders and tracking     | 1 week  | Operator requirement |
| Basic reporting with PDF export    | 1 week  | Sales demo essential |
| Fix critical bugs (keyboard, chat) | 1 week  | User experience      |

**Exit Criteria:** Operators can collect rent through app.

---

### Phase 2: Production Stability (4 weeks)

| Task                             | Effort    | Impact      |
| -------------------------------- | --------- | ----------- |
| Comprehensive error handling     | 1 week    | Stability   |
| Basic offline support            | 1 week    | Reliability |
| Remove hardcoded secrets         | 0.5 week  | Security    |
| Add test coverage (60% services) | 1.5 weeks | Confidence  |

**Exit Criteria:** App is stable for controlled rollout.

---

### Phase 3: Core Requirements (6-8 weeks)

| Task                          | Effort  | Impact        |
| ----------------------------- | ------- | ------------- |
| Staff notes system            | 2 weeks | Operator need |
| Document management (basic)   | 2 weeks | Compliance    |
| Enhanced reporting/dashboards | 2 weeks | Operator need |
| Data model migration          | 2 weeks | Scalability   |

**Exit Criteria:** All CORE_REQUIREMENTS.md items addressed.

---

### Phase 4: Market Expansion (12 weeks)

| Task                           | Effort  | Impact                 |
| ------------------------------ | ------- | ---------------------- |
| Oxford House features (Tier 1) | 8 weeks | 2,500 new customers    |
| 2FA implementation             | 2 weeks | Enterprise requirement |
| Redux Toolkit migration        | 2 weeks | Developer velocity     |

**Exit Criteria:** Oxford House market accessible.

---

## 9. Resource Requirements

### Development Team (Recommended)

| Role                        | Count | Focus                       |
| --------------------------- | ----- | --------------------------- |
| Senior Full-Stack Developer | 1     | Core features, architecture |
| Mobile Developer            | 1     | React Native, UX            |
| QA Engineer                 | 0.5   | Testing, automation         |
| DevOps (Part-time)          | 0.25  | CI/CD, monitoring           |

### Estimated Timeline

| Phase                         | Duration  | Cumulative |
| ----------------------------- | --------- | ---------- |
| Phase 1: Revenue Critical     | 4-6 weeks | 6 weeks    |
| Phase 2: Production Stability | 4 weeks   | 10 weeks   |
| Phase 3: Core Requirements    | 6-8 weeks | 18 weeks   |
| Phase 4: Market Expansion     | 12 weeks  | 30 weeks   |

### Budget Considerations

| Item                  | Monthly Cost             |
| --------------------- | ------------------------ |
| 1.5 FTE Developers    | $15,000-25,000           |
| Firebase (Blaze Plan) | $200-500                 |
| Stripe Fees           | 2.9% + $0.30/transaction |
| Third-Party Services  | $100-300                 |
| **Total**             | **$15,500-26,000/month** |

---

## Appendix A: File Inventory

### Services Needing Error Handling

```
src/services/crud.tsx
src/services/guest.tsx
src/services/house.tsx
src/services/issues.ts
src/services/complaints.ts
src/services/dispute.tsx
src/services/message.tsx
src/services/activity.ts
src/services/chores.tsx
```

### Redux Files Needing Migration

```
src/store/actions/guests.ts
src/store/actions/house.ts
src/store/actions/user.tsx
src/store/actions/admin.ts
src/store/reducers/guests.tsx
src/store/reducers/houses.tsx
src/store/reducers/users.tsx
src/store/reducers/admin.tsx
```

### Cloud Functions Files Needing Review

```
functions/src/index.ts (split needed)
functions/src/api/stripe.ts (secrets)
functions/src/util/guest.ts (Week coupling)
functions/src/util/disputes.ts (Week coupling)
functions/src/util/house.ts (Week coupling)
```

---

## Appendix B: Reference Documents

| Document                                   | Purpose                       |
| ------------------------------------------ | ----------------------------- |
| `CORE_REQUIREMENTS.md`                     | Industry feature requirements |
| `CURRENT_APP_STATE.md`                     | MVP functional specification  |
| `CODEBASE_ANALYSIS_REWRITE_VS_REFACTOR.md` | Technical assessment          |
| `UI_ARCHITECTURE_ANALYSIS.md`              | UI migration strategy         |
| `CLOUD_FUNCTIONS_REVIEW.md`                | Cloud functions analysis      |
| `FEATURE_PRIORITY_ROADMAP.md`              | Product roadmap               |
| `IMPLEMENTATION_PLAN.md`                   | Development approach          |
| `ACTIVITY_SYSTEM_MIGRATION.md`             | Data model migration plan     |

---

## Document History

| Version | Date       | Author      | Changes                            |
| ------- | ---------- | ----------- | ---------------------------------- |
| 1.0     | 2025-12-25 | AI Analysis | Initial comprehensive gap analysis |

---

**Next Steps:**

1. Review and validate gaps with development team
2. Prioritize based on customer feedback
3. Create sprint plans for Phase 1
4. Begin payment system implementation

---
*Last reviewed: 2026-05-24 | Audience: developer | Type: reference*
