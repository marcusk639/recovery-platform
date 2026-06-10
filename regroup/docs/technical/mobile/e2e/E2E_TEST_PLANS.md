# E2E Test Plans - Critical Code Paths

**Date:** February 12, 2026 (Updated)
**Status:** Expanded - Ready for Phase 5 Implementation
**Scope:** All critical user flows requiring E2E test coverage

## Recent Updates (February 12, 2026)

**Added 4 CRITICAL Paths** that are fully implemented but had ZERO test coverage:
- **Critical Path 8:** Dispute/Challenge System - Core accountability feature
- **Critical Path 9:** Activity Verification Workflow - Essential for phase progression
- **Critical Path 10:** Authorization & Role-Based Access Control - Security and data privacy
- **Critical Path 11:** Medication Tracking - 5th activity type (was missing from original plan)

**Impact:**
- Added 26+ new test scenarios
- Expanded test coverage target from 40% to 65%+
- All CRITICAL features now have comprehensive test plans
- Includes both positive and negative test cases
- Focuses on "activities: all activities are logged correctly and readable by all house members"

---

## Overview

This document provides detailed test plans for all critical code paths in the Regroup app. Each test plan includes:
- User flow description
- Required screens/components
- testIDs needed
- Test scenarios
- Expected outcomes
- Implementation priority

---

## Critical Path 1: Sign Up

### User Flow
New user creates an account without an invitation.

### Screens Required
1. Login/Landing → SignUp screen
2. SignUp → New Account Info screen
3. New Account → House Selection/Creation

### testIDs Required

**SignUp Screen (src/screens/SignUp/SignUpFormView.tsx):**
- ✅ `signup-screen` - Main container
- ✅ `signup-email-input` - Email field
- ✅ `signup-password-input` - Password field
- ✅ `signup-first-name-input` - First name field
- ✅ `signup-last-name-input` - Last name field
- ✅ `signup-button` - Submit button
- ✅ `login-link` - Link back to login

**New Account Screen (src/screens/NewAccount/NewAccountFormView.tsx):**
- ⚠️  `new-account-screen` - Main container (NEED TO ADD)
- ⚠️  `phone-input` - Phone number field (NEED TO ADD)
- ⚠️  `role-selector` - Role selection dropdown (NEED TO ADD)
- ⚠️  `continue-button` - Continue button (NEED TO ADD)

### Test Scenarios

#### 1.1: Successful Sign Up Flow
```javascript
describe('Sign Up Flow', () => {
  it('should complete full sign up successfully', async () => {
    // Navigate to sign up from login screen
    await element(by.id('signup-link')).tap(); // Need to add this to Login

    // Fill in sign up form
    await element(by.id('signup-email-input')).typeText('newuser@test.com');
    await element(by.id('signup-password-input')).typeText('TestPass123!');
    await element(by.id('signup-first-name-input')).typeText('Test');
    await element(by.id('signup-last-name-input')).typeText('User');

    // Submit sign up
    await element(by.id('signup-button')).tap();

    // Verify new account screen appears
    await waitFor(element(by.id('new-account-screen')))
      .toBeVisible()
      .withTimeout(10000);

    // Complete account info
    await element(by.id('phone-input')).typeText('5551234567');
    await element(by.id('role-selector')).tap();
    await element(by.text('House Manager')).tap();
    await element(by.id('continue-button')).tap();

    // Verify user is created and navigated to setup
    await waitFor(element(by.id('house-setup-screen')))
      .toBeVisible()
      .withTimeout(10000);
  });
});
```

#### 1.2: Email Already Exists
```javascript
it('should show error for duplicate email', async () => {
  await element(by.id('signup-email-input')).typeText('existing@test.com');
  await element(by.id('signup-password-input')).typeText('TestPass123!');
  await element(by.id('signup-first-name-input')).typeText('Test');
  await element(by.id('signup-last-name-input')).typeText('User');
  await element(by.id('signup-button')).tap();

  // Verify error message
  await waitFor(element(by.text(/email.*already.*use/i)))
    .toBeVisible()
    .withTimeout(5000);
});
```

#### 1.3: Invalid Email Format
```javascript
it('should show validation error for invalid email', async () => {
  await element(by.id('signup-email-input')).typeText('notanemail');
  await element(by.id('signup-password-input')).typeText('TestPass123!');
  await element(by.id('signup-button')).tap();

  // Verify validation error
  await expect(element(by.text(/valid email/i))).toBeVisible();
});
```

#### 1.4: Weak Password
```javascript
it('should show error for weak password', async () => {
  await element(by.id('signup-email-input')).typeText('test@test.com');
  await element(by.id('signup-password-input')).typeText('weak');
  await element(by.id('signup-button')).tap();

  // Verify password strength error
  await expect(element(by.text(/password.*least.*characters/i))).toBeVisible();
});
```

### Priority
**HIGH** - This is the primary onboarding flow for new users.

---

## Critical Path 2: Login

### User Flow
Existing user logs into the app.

### Screens Required
1. Login screen
2. Main app (House Dashboard/Activity)

### testIDs Required

**Login Screen (src/screens/Login/Login.tsx):**
- ✅ `login-screen` - Main container
- ✅ `email-input` - Email field
- ✅ `password-input` - Password field
- ✅ `login-button` - Sign in button
- ✅ `forgot-password-link` - Forgot password link
- ✅ `reset-email-input` - Reset password email field
- ✅ `forgot-password-modal` - Reset password modal

**Main App:**
- ⚠️  `activity-screen` or `house-dashboard-screen` (NEED TO VERIFY/ADD)

### Test Scenarios

#### 2.1: Successful Login
```javascript
describe('Login Flow', () => {
  it('should log in successfully with valid credentials', async () => {
    await element(by.id('email-input')).typeText('test@rats-e2e.com');
    await element(by.id('password-input')).typeText('TestPassword123!');
    await element(by.id('login-button')).tap();

    // Verify user lands on main app
    await waitFor(element(by.id('activity-screen')))
      .toBeVisible()
      .withTimeout(15000);
  });
});
```

#### 2.2: Invalid Credentials
```javascript
it('should show error for invalid credentials', async () => {
  await element(by.id('email-input')).typeText('wrong@test.com');
  await element(by.id('password-input')).typeText('WrongPass123!');
  await element(by.id('login-button')).tap();

  // Verify error message
  await waitFor(element(by.text(/invalid.*credentials/i)))
    .toBeVisible()
    .withTimeout(5000);
});
```

#### 2.3: Empty Fields
```javascript
it('should show validation errors for empty fields', async () => {
  await element(by.id('login-button')).tap();

  // Verify validation errors appear
  await expect(element(by.text(/email.*required/i))).toBeVisible();
  await expect(element(by.text(/password.*required/i))).toBeVisible();
});
```

#### 2.4: Forgot Password Flow
```javascript
it('should initiate password reset successfully', async () => {
  await element(by.id('forgot-password-link')).tap();

  // Verify modal appears
  await waitFor(element(by.id('forgot-password-modal')))
    .toBeVisible()
    .withTimeout(2000);

  // Enter email and submit
  await element(by.id('reset-email-input')).typeText('test@test.com');
  await element(by.id('send-reset-email-button')).tap(); // Need to add testID

  // Verify success message
  await waitFor(element(by.text(/reset.*email.*sent/i)))
    .toBeVisible()
    .withTimeout(5000);
});
```

### Priority
**HIGH** - Core authentication flow used by all users.

---

## Critical Path 3: Sign Up via Invite Email

### User Flow
User receives invitation email → Opens invite link → Creates account → Joins house.

### Screens Required
1. Deep link handler
2. Signup screen (with pre-filled house info)
3. New Account screen
4. Guest/Manager role confirmation
5. House dashboard

### testIDs Required

**Signup with Invitation:**
- ✅ `signup-screen` (reused)
- ⚠️  `invitation-info` - Shows which house user is joining (NEED TO ADD)
- ⚠️  `invited-as-role` - Shows role they're invited as (NEED TO ADD)
- All signup form fields (already have testIDs)

**Role Confirmation:**
- ⚠️  `role-confirmation-screen` (NEED TO ADD)
- ⚠️  `accept-role-button` (NEED TO ADD)
- ⚠️  `decline-invitation-button` (NEED TO ADD)

### Test Scenarios

#### 3.1: Manager Invitation Acceptance
```javascript
describe('Invite Email Signup', () => {
  beforeAll(async () => {
    // Simulate deep link with manager invitation
    await device.openURL({
      url: 'rats://invite?houseId=test-house-123&role=manager&token=abc123'
    });
  });

  it('should sign up via manager invitation', async () => {
    // Verify signup screen shows invitation info
    await waitFor(element(by.id('signup-screen')))
      .toBeVisible()
      .withTimeout(5000);

    await expect(element(by.id('invitation-info'))).toBeVisible();
    await expect(element(by.id('invited-as-role'))).toHaveText('Manager');

    // Complete signup
    await element(by.id('signup-email-input')).typeText('newmanager@test.com');
    await element(by.id('signup-password-input')).typeText('TestPass123!');
    await element(by.id('signup-first-name-input')).typeText('New');
    await element(by.id('signup-last-name-input')).typeText('Manager');
    await element(by.id('signup-button')).tap();

    // Complete account info
    await waitFor(element(by.id('new-account-screen')))
      .toBeVisible()
      .withTimeout(10000);
    await element(by.id('phone-input')).typeText('5551234567');
    await element(by.id('continue-button')).tap();

    // Accept manager role
    await waitFor(element(by.id('role-confirmation-screen')))
      .toBeVisible()
      .withTimeout(5000);
    await element(by.id('accept-role-button')).tap();

    // Verify lands on house dashboard with manager access
    await waitFor(element(by.id('house-dashboard-screen')))
      .toBeVisible()
      .withTimeout(10000);
    await expect(element(by.id('manager-controls'))).toBeVisible();
  });
});
```

#### 3.2: Guest Invitation Acceptance
```javascript
it('should sign up via guest invitation', async () => {
  await device.openURL({
    url: 'rats://invite?houseId=test-house-123&role=guest&token=xyz789'
  });

  // Complete signup as guest
  await waitFor(element(by.id('signup-screen')))
    .toBeVisible()
    .withTimeout(5000);

  await expect(element(by.id('invited-as-role'))).toHaveText('Guest');

  // ... complete signup flow ...

  // Accept guest role
  await element(by.id('accept-role-button')).tap();

  // Verify lands on guest view
  await waitFor(element(by.id('guest-overview-screen')))
    .toBeVisible()
    .withTimeout(10000);
});
```

#### 3.3: Invalid/Expired Invitation
```javascript
it('should handle expired invitation link', async () => {
  await device.openURL({
    url: 'rats://invite?houseId=test-house-123&role=guest&token=expired-token'
  });

  // Verify error message
  await waitFor(element(by.text(/invitation.*expired/i)))
    .toBeVisible()
    .withTimeout(5000);

  // Verify user can still sign up normally
  await expect(element(by.id('signup-button'))).toBeVisible();
});
```

### Priority
**HIGH** - Critical for onboarding guests and managers to existing houses.

---

## Critical Path 4: Guest Stat Updates

### User Flow
Guest updates their daily stats (chores, job, sponsor, meetings).

### Sub-flows

#### 4A: Update Chore Status

**Screens:**
- Guest Overview → Chore List → Mark chore complete

**testIDs Needed:**
- ⚠️  `guest-overview-screen` (NEED TO ADD)
- ⚠️  `chores-tab` or `chores-card` (NEED TO ADD)
- ⚠️  `chore-list` (NEED TO ADD)
- ⚠️  `chore-item-{choreId}` (NEED TO ADD - dynamic)
- ⚠️  `mark-chore-complete-button` (NEED TO ADD)
- ⚠️  `chore-notes-input` (NEED TO ADD)

**Test Scenario:**
```javascript
describe('Guest Stat Updates - Chores', () => {
  it('should mark chore as complete', async () => {
    // Navigate to chores
    await element(by.id('chores-tab')).tap();

    await waitFor(element(by.id('chore-list')))
      .toBeVisible()
      .withTimeout(3000);

    // Select a chore
    const choreId = 'test-chore-123';
    await element(by.id(`chore-item-${choreId}`)).tap();

    // Mark complete
    await element(by.id('mark-chore-complete-button')).tap();

    // Optionally add notes
    await element(by.id('chore-notes-input')).typeText('Cleaned kitchen thoroughly');
    await element(by.id('save-chore-button')).tap();

    // Verify chore marked complete
    await expect(element(by.id(`chore-item-${choreId}`)))
      .toHaveText(/complete/i);
  });

  it('should un-mark chore if completed by mistake', async () => {
    const choreId = 'test-chore-123';
    await element(by.id(`chore-item-${choreId}`)).tap();
    await element(by.id('mark-chore-incomplete-button')).tap();

    await expect(element(by.id(`chore-item-${choreId}`)))
      .not.toHaveText(/complete/i);
  });
});
```

#### 4B: Update Job/Work Status

**Screens:**
- Guest Overview → Employment/Job section → Update status

**testIDs Needed:**
- ⚠️  `job-status-card` (NEED TO ADD)
- ⚠️  `update-job-button` (NEED TO ADD)
- ⚠️  `job-status-selector` - Employment, Searching, Not employed (NEED TO ADD)
- ⚠️  `employer-name-input` (NEED TO ADD)
- ⚠️  `hours-worked-input` (NEED TO ADD)

**Test Scenario:**
```javascript
describe('Guest Stat Updates - Job', () => {
  it('should update employment status to employed', async () => {
    await element(by.id('job-status-card')).tap();

    await element(by.id('job-status-selector')).tap();
    await element(by.text('Employed')).tap();

    await element(by.id('employer-name-input')).typeText('ABC Company');
    await element(by.id('hours-worked-input')).typeText('40');

    await element(by.id('save-job-button')).tap();

    // Verify saved
    await waitFor(element(by.text(/job.*updated/i)))
      .toBeVisible()
      .withTimeout(3000);
  });
});
```

#### 4C: Update Sponsor Contact

**Screens:**
- Guest Overview → Sponsor section → Log sponsor call

**testIDs Needed:**
- ⚠️  `sponsor-card` (NEED TO ADD)
- ⚠️  `log-sponsor-call-button` (NEED TO ADD)
- ⚠️  `call-date-picker` (NEED TO ADD)
- ⚠️  `call-duration-input` (NEED TO ADD)
- ⚠️  `call-notes-input` (NEED TO ADD)

**Test Scenario:**
```javascript
describe('Guest Stat Updates - Sponsor', () => {
  it('should log sponsor call', async () => {
    await element(by.id('sponsor-card')).tap();
    await element(by.id('log-sponsor-call-button')).tap();

    // Set call date
    await element(by.id('call-date-picker')).tap();
    await element(by.text('Today')).tap();

    // Enter duration and notes
    await element(by.id('call-duration-input')).typeText('30');
    await element(by.id('call-notes-input')).typeText('Discussed step work');

    await element(by.id('save-call-button')).tap();

    // Verify call logged
    await waitFor(element(by.text(/call.*logged/i)))
      .toBeVisible()
      .withTimeout(3000);
  });
});
```

#### 4D: Update Meeting Attendance

**Screens:**
- Guest Overview → Meetings section → Mark meeting attended

**testIDs Needed:**
- ⚠️  `meetings-card` (NEED TO ADD)
- ⚠️  `mark-meeting-attended-button` (NEED TO ADD)
- ⚠️  `meeting-type-selector` - AA, NA, Other (NEED TO ADD)
- ⚠️  `meeting-location-input` (NEED TO ADD)
- ⚠️  `meeting-date-picker` (NEED TO ADD)

**Test Scenario:**
```javascript
describe('Guest Stat Updates - Meetings', () => {
  it('should mark meeting attended', async () => {
    await element(by.id('meetings-card')).tap();
    await element(by.id('mark-meeting-attended-button')).tap();

    // Select meeting type
    await element(by.id('meeting-type-selector')).tap();
    await element(by.text('AA')).tap();

    // Enter details
    await element(by.id('meeting-location-input')).typeText('Church on Main St');
    await element(by.id('meeting-date-picker')).tap();
    await element(by.text('Today')).tap();

    await element(by.id('save-meeting-button')).tap();

    // Verify meeting recorded
    await waitFor(element(by.text(/meeting.*recorded/i)))
      .toBeVisible()
      .withTimeout(3000);
  });

  it('should show weekly meeting count', async () => {
    await element(by.id('meetings-card')).tap();

    // Verify weekly count is displayed
    await expect(element(by.id('weekly-meeting-count')))
      .toHaveText(/\d+.*this week/i);
  });
});
```

### Priority
**CRITICAL** - These are the core daily interactions for guests. Must be rock-solid.

---

## Critical Path 5: Inviting a Guest

### User Flow
Manager invites new guest → Guest receives email → Guest accepts → Guest onboarded.

### Screens Required
1. Guest List screen
2. Add Guest screen
3. Send Invitation screen

### testIDs Required

**Guest List Screen:**
- ✅ `guest-list-screen` (already exists)
- ⚠️  `add-guest-button` (NEED TO ADD)

**Create Guest Screen:**
- ✅ `create-guest-screen` (already exists)
- ⚠️  `guest-first-name-input` (NEED TO ADD)
- ⚠️  `guest-last-name-input` (NEED TO ADD)
- ⚠️  `guest-email-input` (NEED TO ADD)
- ⚠️  `guest-phone-input` (NEED TO ADD)
- ⚠️  `guest-bed-selector` (NEED TO ADD)
- ⚠️  `guest-move-in-date-picker` (NEED TO ADD)
- ⚠️  `send-invitation-checkbox` (NEED TO ADD)
- ⚠️  `create-guest-button` (NEED TO ADD)

### Test Scenarios

#### 5.1: Create Guest and Send Invitation
```javascript
describe('Inviting a Guest', () => {
  it('should create guest and send invitation email', async () => {
    // Navigate to guest list
    await element(by.id('guests-tab')).tap();
    await waitFor(element(by.id('guest-list-screen')))
      .toBeVisible()
      .withTimeout(3000);

    // Tap add guest
    await element(by.id('add-guest-button')).tap();

    // Fill in guest info
    await waitFor(element(by.id('create-guest-screen')))
      .toBeVisible()
      .withTimeout(2000);

    await element(by.id('guest-first-name-input')).typeText('John');
    await element(by.id('guest-last-name-input')).typeText('Doe');
    await element(by.id('guest-email-input')).typeText('john.doe@test.com');
    await element(by.id('guest-phone-input')).typeText('5559876543');

    // Select bed
    await element(by.id('guest-bed-selector')).tap();
    await element(by.text('Room 1 - Bed A')).tap();

    // Set move-in date
    await element(by.id('guest-move-in-date-picker')).tap();
    await element(by.text('Today')).tap();

    // Enable invitation
    await element(by.id('send-invitation-checkbox')).tap();

    // Create guest
    await element(by.id('create-guest-button')).tap();

    // Verify success and invitation sent
    await waitFor(element(by.text(/guest.*created/i)))
      .toBeVisible()
      .withTimeout(5000);
    await waitFor(element(by.text(/invitation.*sent/i)))
      .toBeVisible()
      .withTimeout(5000);

    // Verify guest appears in list
    await waitFor(element(by.id('guest-list-screen')))
      .toBeVisible()
      .withTimeout(3000);
    await expect(element(by.text('John Doe'))).toBeVisible();
  });
});
```

#### 5.2: Create Guest Without Invitation
```javascript
it('should create guest without sending invitation', async () => {
  await element(by.id('add-guest-button')).tap();

  await element(by.id('guest-first-name-input')).typeText('Jane');
  await element(by.id('guest-last-name-input')).typeText('Smith');
  // Don't enable send-invitation-checkbox

  await element(by.id('create-guest-button')).tap();

  // Verify guest created but no invitation sent
  await waitFor(element(by.text(/guest.*created/i)))
    .toBeVisible()
    .withTimeout(5000);
  await expect(element(by.text(/invitation.*sent/i))).not.toExist();
});
```

### Priority
**HIGH** - Core house management function for managers.

---

## Critical Path 6: Inviting Another Manager/Admin

### User Flow
Admin/Manager invites another manager → Manager receives email → Accepts → Joins house as manager.

### Screens Required
1. House Settings
2. Manager Settings screen
3. Add Manager screen

### testIDs Required

**House Settings:**
- ⚠️  `house-settings-screen` (NEED TO ADD)
- ⚠️  `managers-section` (NEED TO ADD)
- ⚠️  `add-manager-button` (NEED TO ADD)

**Add Manager Screen:**
- ⚠️  `add-manager-screen` (NEED TO ADD)
- ⚠️  `manager-email-input` (NEED TO ADD)
- ⚠️  `manager-first-name-input` (NEED TO ADD)
- ⚠️  `manager-last-name-input` (NEED TO ADD)
- ⚠️  `manager-role-selector` - Manager or Admin (NEED TO ADD)
- ⚠️  `send-manager-invite-button` (NEED TO ADD)

### Test Scenarios

#### 6.1: Invite Manager Successfully
```javascript
describe('Inviting Managers', () => {
  it('should invite new manager to house', async () => {
    // Navigate to house settings
    await element(by.id('settings-tab')).tap();
    await waitFor(element(by.id('house-settings-screen')))
      .toBeVisible()
      .withTimeout(3000);

    // Navigate to managers section
    await element(by.id('managers-section')).tap();
    await element(by.id('add-manager-button')).tap();

    // Fill in manager info
    await waitFor(element(by.id('add-manager-screen')))
      .toBeVisible()
      .withTimeout(2000);

    await element(by.id('manager-email-input')).typeText('newmanager@test.com');
    await element(by.id('manager-first-name-input')).typeText('Sarah');
    await element(by.id('manager-last-name-input')).typeText('Jones');

    // Select role
    await element(by.id('manager-role-selector')).tap();
    await element(by.text('Manager')).tap();

    // Send invitation
    await element(by.id('send-manager-invite-button')).tap();

    // Verify invitation sent
    await waitFor(element(by.text(/invitation.*sent/i)))
      .toBeVisible()
      .withTimeout(5000);

    // Verify pending manager appears in list
    await expect(element(by.text('Sarah Jones (Pending)'))).toBeVisible();
  });
});
```

#### 6.2: Invite Admin (Higher Permission)
```javascript
it('should invite admin with full permissions', async () => {
  await element(by.id('add-manager-button')).tap();

  await element(by.id('manager-email-input')).typeText('admin@test.com');
  await element(by.id('manager-first-name-input')).typeText('Admin');
  await element(by.id('manager-last-name-input')).typeText('User');

  // Select admin role
  await element(by.id('manager-role-selector')).tap();
  await element(by.text('Admin')).tap();

  await element(by.id('send-manager-invite-button')).tap();

  // Verify admin invited
  await waitFor(element(by.text(/invitation.*sent/i)))
    .toBeVisible()
    .withTimeout(5000);
});
```

### Priority
**MEDIUM-HIGH** - Important for multi-manager houses.

---

## Critical Path 7: House Creation (Operator Setup Wizard)

### User Flow
Operator (org admin) uses setup wizard to create multiple houses for their organization.

### Screens Required
1. Org Setup screen
2. House Setup wizard (multiple steps)
3. Manager assignment
4. Success confirmation

### testIDs Required

**Org Setup Screen:**
- ⚠️  `org-setup-screen` (NEED TO ADD)
- ⚠️  `org-name-input` (NEED TO ADD)
- ⚠️  `add-house-button` (NEED TO ADD)

**House Setup Wizard:**
- ⚠️  `house-setup-wizard` (NEED TO ADD)
- ⚠️  `house-name-input` (NEED TO ADD)
- ⚠️  `house-address-input` (NEED TO ADD)
- ⚠️  `house-capacity-input` (NEED TO ADD)
- ⚠️  `house-type-selector` - Oxford House, Traditional, etc. (NEED TO ADD)
- ⚠️  `next-step-button` (NEED TO ADD)
- ⚠️  `previous-step-button` (NEED TO ADD)

**Manager Assignment:**
- ⚠️  `assign-manager-screen` (NEED TO ADD)
- ⚠️  `existing-manager-selector` (NEED TO ADD)
- ⚠️  `invite-new-manager-button` (NEED TO ADD)
- ⚠️  `complete-setup-button` (NEED TO ADD)

### Test Scenarios

#### 7.1: Create Single House Successfully
```javascript
describe('House Creation - Operator Setup', () => {
  it('should create house successfully via wizard', async () => {
    // Assume operator is logged in
    await waitFor(element(by.id('org-setup-screen')))
      .toBeVisible()
      .withTimeout(3000);

    // Start house creation
    await element(by.id('add-house-button')).tap();

    // Step 1: Basic info
    await waitFor(element(by.id('house-setup-wizard')))
      .toBeVisible()
      .withTimeout(2000);

    await element(by.id('house-name-input')).typeText('Serenity House');
    await element(by.id('house-address-input')).typeText('123 Main St, City, ST 12345');
    await element(by.id('house-capacity-input')).typeText('8');

    await element(by.id('house-type-selector')).tap();
    await element(by.text('Oxford House')).tap();

    await element(by.id('next-step-button')).tap();

    // Step 2: Assign manager
    await waitFor(element(by.id('assign-manager-screen')))
      .toBeVisible()
      .withTimeout(2000);

    // Option A: Assign existing manager
    await element(by.id('existing-manager-selector')).tap();
    await element(by.text('John Manager')).tap();

    // Complete setup
    await element(by.id('complete-setup-button')).tap();

    // Verify house created
    await waitFor(element(by.text(/house.*created/i)))
      .toBeVisible()
      .withTimeout(5000);

    // Verify house appears in org list
    await waitFor(element(by.id('org-setup-screen')))
      .toBeVisible()
      .withTimeout(3000);
    await expect(element(by.text('Serenity House'))).toBeVisible();
  });
});
```

#### 7.2: Create House and Invite New Manager
```javascript
it('should create house and invite new manager', async () => {
  await element(by.id('add-house-button')).tap();

  // Fill basic house info
  await element(by.id('house-name-input')).typeText('New Horizons');
  await element(by.id('house-address-input')).typeText('456 Oak Ave, Town, ST 67890');
  await element(by.id('house-capacity-input')).typeText('6');
  await element(by.id('next-step-button')).tap();

  // Invite new manager
  await element(by.id('invite-new-manager-button')).tap();

  await element(by.id('manager-email-input')).typeText('newmanager@test.com');
  await element(by.id('manager-first-name-input')).typeText('New');
  await element(by.id('manager-last-name-input')).typeText('Manager');
  await element(by.id('send-invite-button')).tap();

  // Complete setup
  await element(by.id('complete-setup-button')).tap();

  // Verify house created and manager invited
  await waitFor(element(by.text(/house.*created/i)))
    .toBeVisible()
    .withTimeout(5000);
  await waitFor(element(by.text(/manager.*invited/i)))
    .toBeVisible()
    .withTimeout(5000);
});
```

#### 7.3: Create Multiple Houses
```javascript
it('should create multiple houses in sequence', async () => {
  const houses = [
    { name: 'House A', address: '123 A St', capacity: '8' },
    { name: 'House B', address: '456 B Ave', capacity: '6' },
    { name: 'House C', address: '789 C Blvd', capacity: '10' }
  ];

  for (const house of houses) {
    await element(by.id('add-house-button')).tap();

    await element(by.id('house-name-input')).typeText(house.name);
    await element(by.id('house-address-input')).typeText(house.address);
    await element(by.id('house-capacity-input')).typeText(house.capacity);
    await element(by.id('next-step-button')).tap();

    // Assign same manager to all
    await element(by.id('existing-manager-selector')).tap();
    await element(by.text('Regional Manager')).tap();
    await element(by.id('complete-setup-button')).tap();

    // Wait for house to be created
    await waitFor(element(by.text(/house.*created/i)))
      .toBeVisible()
      .withTimeout(5000);
  }

  // Verify all houses appear in list
  await waitFor(element(by.id('org-setup-screen')))
    .toBeVisible()
    .withTimeout(3000);

  await expect(element(by.text('House A'))).toBeVisible();
  await expect(element(by.text('House B'))).toBeVisible();
  await expect(element(by.text('House C'))).toBeVisible();
});
```

### Priority
**HIGH** - Critical for onboarding operators with multiple houses (Oxford House chapters).

---

## Critical Path 8: Dispute/Challenge System

### User Flow
The dispute system is the CORE accountability feature for recovery houses. It allows users to challenge logged activities and admins to resolve disputes.

**Flow:**
1. Guest A logs an activity (chore, meeting, etc.)
2. Guest B or Admin disputes the activity
3. Admin reviews the dispute
4. Admin approves or rejects the dispute
5. Both parties receive notifications

### Screens Required
1. Activity Screen → View activity → Dispute modal
2. Disputes Screen → View all disputes
3. Dispute Detail → Admin resolution

### testIDs Required

**Disputes Screen (src/screens/Disputes/Disputes.tsx):**
- ✅ `disputes-screen` - Main container (ALREADY EXISTS at line 81)
- ⚠️  `dispute-item-{disputeId}` - Individual dispute cards (NEED TO ADD)
- ⚠️  `dispute-activity-type-{disputeId}` - Activity type badge (NEED TO ADD)
- ⚠️  `dispute-status-{disputeId}` - Status indicator (NEED TO ADD)
- ⚠️  `dispute-message-{disputeId}` - Dispute message text (NEED TO ADD)

**Activity Screen with Dispute Action:**
- ⚠️  `activity-item-{activityId}` - Activity card (NEED TO ADD to RenderActivities)
- ⚠️  `dispute-activity-button-{activityId}` - Button to dispute activity (NEED TO ADD)
- ⚠️  `dispute-modal` - Dispute creation modal (NEED TO ADD)
- ⚠️  `dispute-message-input` - Text input for dispute reason (NEED TO ADD)
- ⚠️  `dispute-submit-button` - Submit dispute button (NEED TO ADD)

**Dispute Resolution (Admin Actions):**
- ⚠️  `resolve-dispute-button-{disputeId}` - Admin resolve button (NEED TO ADD)
- ⚠️  `reject-dispute-button-{disputeId}` - Admin reject button (NEED TO ADD)
- ⚠️  `resolution-modal` - Modal for admin resolution (NEED TO ADD)
- ⚠️  `resolution-message-input` - Admin resolution notes (NEED TO ADD)

### Test Scenarios

#### 8.1: Guest Creates Dispute on Another Guest's Activity
```javascript
describe('Dispute Creation', () => {
  it('should allow guest to dispute another guest activity', async () => {
    // Prerequisite: Guest A has logged a chore activity
    // Login as Guest B
    await loginAsTestUser('test-guest-b@rats-e2e.com', 'TestPassword123!');

    // Navigate to Activities screen
    await element(by.id('activities-tab')).tap();
    await waitFor(element(by.id('activities-screen')))
      .toBeVisible()
      .withTimeout(5000);

    // Find Guest A's activity
    const activityId = 'test-activity-123';
    await waitFor(element(by.id(`activity-item-${activityId}`)))
      .toBeVisible()
      .withTimeout(5000);

    // Tap dispute button
    await element(by.id(`dispute-activity-button-${activityId}`)).tap();

    // Verify dispute modal opens
    await waitFor(element(by.id('dispute-modal')))
      .toBeVisible()
      .withTimeout(3000);

    // Enter dispute reason
    await element(by.id('dispute-message-input'))
      .typeText('This chore was not completed properly. The kitchen was still dirty.');

    // Submit dispute
    await element(by.id('dispute-submit-button')).tap();

    // Verify success notification
    await waitFor(element(by.text(/Activity Disputed/i)))
      .toBeVisible()
      .withTimeout(5000);

    // Verify dispute appears in Disputes screen
    await element(by.id('disputes-tab')).tap();
    await waitFor(element(by.id('disputes-screen')))
      .toBeVisible()
      .withTimeout(3000);

    await expect(element(by.id(`dispute-item-${activityId}`))).toBeVisible();
    await expect(element(by.id(`dispute-status-${activityId}`)))
      .toHaveText('pending');
  });
});
```

#### 8.2: Admin Resolves Dispute (Approve)
```javascript
it('should allow admin to approve a dispute', async () => {
  // Login as admin
  await loginAsTestUser('test-manager@rats-e2e.com', 'TestPassword123!');

  // Navigate to Disputes screen
  await element(by.id('disputes-tab')).tap();
  await waitFor(element(by.id('disputes-screen')))
    .toBeVisible()
    .withTimeout(5000);

  const disputeId = 'test-dispute-123';

  // Tap on dispute to view details
  await element(by.id(`dispute-item-${disputeId}`)).tap();

  // Tap resolve button
  await element(by.id(`resolve-dispute-button-${disputeId}`)).tap();

  // Verify resolution modal
  await waitFor(element(by.id('resolution-modal')))
    .toBeVisible()
    .withTimeout(3000);

  // Enter resolution notes
  await element(by.id('resolution-message-input'))
    .typeText('Reviewed. The complaint is valid. Activity not completed to standards.');

  // Confirm resolution
  await element(by.id('confirm-resolution-button')).tap();

  // Verify success
  await waitFor(element(by.text(/Dispute Resolved/i)))
    .toBeVisible()
    .withTimeout(5000);

  // Verify status updated
  await expect(element(by.id(`dispute-status-${disputeId}`)))
    .toHaveText('resolved');
});
```

#### 8.3: Admin Rejects Dispute
```javascript
it('should allow admin to reject an invalid dispute', async () => {
  await loginAsTestUser('test-manager@rats-e2e.com', 'TestPassword123!');

  await element(by.id('disputes-tab')).tap();
  await waitFor(element(by.id('disputes-screen')))
    .toBeVisible()
    .withTimeout(5000);

  const disputeId = 'test-dispute-456';

  await element(by.id(`dispute-item-${disputeId}`)).tap();
  await element(by.id(`reject-dispute-button-${disputeId}`)).tap();

  await waitFor(element(by.id('resolution-modal')))
    .toBeVisible()
    .withTimeout(3000);

  await element(by.id('resolution-message-input'))
    .typeText('Reviewed. Activity was completed properly. Dispute is unfounded.');

  await element(by.id('confirm-rejection-button')).tap();

  await waitFor(element(by.text(/Dispute Rejected/i)))
    .toBeVisible()
    .withTimeout(5000);

  await expect(element(by.id(`dispute-status-${disputeId}`)))
    .toHaveText('rejected');
});
```

#### 8.4: Guest Cannot Dispute Own Activity (Negative Case)
```javascript
it('should NOT allow guest to dispute their own activity', async () => {
  await loginAsTestUser('test-guest-a@rats-e2e.com', 'TestPassword123!');

  await element(by.id('activities-tab')).tap();
  await waitFor(element(by.id('activities-screen')))
    .toBeVisible()
    .withTimeout(5000);

  // Try to dispute own activity
  const ownActivityId = 'test-activity-own-123';

  // Dispute button should not exist for own activities
  await expect(element(by.id(`dispute-activity-button-${ownActivityId}`)))
    .not.toExist();
});
```

#### 8.5: Guest Cannot Resolve Disputes (Negative Case)
```javascript
it('should NOT allow guest to resolve disputes', async () => {
  await loginAsTestUser('test-guest-a@rats-e2e.com', 'TestPassword123!');

  await element(by.id('disputes-tab')).tap();
  await waitFor(element(by.id('disputes-screen')))
    .toBeVisible()
    .withTimeout(5000);

  const disputeId = 'test-dispute-123';
  await element(by.id(`dispute-item-${disputeId}`)).tap();

  // Resolve/reject buttons should not exist for non-admins
  await expect(element(by.id(`resolve-dispute-button-${disputeId}`))).not.toExist();
  await expect(element(by.id(`reject-dispute-button-${disputeId}`))).not.toExist();
});
```

#### 8.6: Dispute Challenge Flow
```javascript
it('should allow guest to challenge a dispute decision', async () => {
  // Guest A's activity was disputed by Guest B, and admin rejected the dispute
  // Guest B wants to challenge the rejection
  await loginAsTestUser('test-guest-b@rats-e2e.com', 'TestPassword123!');

  await element(by.id('disputes-tab')).tap();
  await waitFor(element(by.id('disputes-screen')))
    .toBeVisible()
    .withTimeout(5000);

  const disputeId = 'test-dispute-rejected-123';
  await element(by.id(`dispute-item-${disputeId}`)).tap();

  // Challenge button should be available
  await element(by.id(`challenge-dispute-button-${disputeId}`)).tap();

  await waitFor(element(by.id('challenge-modal')))
    .toBeVisible()
    .withTimeout(3000);

  await element(by.id('challenge-message-input'))
    .typeText('I have photos that prove the chore was not done correctly.');

  await element(by.id('submit-challenge-button')).tap();

  await waitFor(element(by.text(/Dispute Challenged/i)))
    .toBeVisible()
    .withTimeout(5000);
});
```

### Required Test Data

**Pre-created activities for dispute testing:**
- `test-activity-123`: Chore activity by Guest A (can be disputed by Guest B)
- `test-activity-own-123`: Activity by current user (cannot dispute own)
- `test-activity-456`: Job activity by Guest C

**Pre-created disputes:**
- `test-dispute-123`: Pending dispute (for admin resolution)
- `test-dispute-456`: Pending dispute (for admin rejection)
- `test-dispute-rejected-123`: Rejected dispute (for challenge flow)

**Test Accounts:**
- `test-guest-a@rats-e2e.com`: Guest who logs activities
- `test-guest-b@rats-e2e.com`: Guest who disputes activities
- `test-manager@rats-e2e.com`: Admin who resolves disputes

### Priority
**CRITICAL** - This is the CORE accountability feature for recovery houses. The dispute system ensures activities are logged accurately and provides a mechanism for challenge and resolution. Without testing this, the entire accountability system is unverified.

---

## Critical Path 9: Activity Verification Workflow

### User Flow
Admins verify guest activities to ensure they were completed properly. This is essential for phase progression and house accountability.

**Flow:**
1. Guest logs an activity (unverified status)
2. Admin reviews the activity
3. Admin verifies or rejects the activity
4. Guest receives notification of verification status
5. Verified activities count toward phase requirements

### Screens Required
1. Activity List → View unverified activities
2. Activity Detail → Verify/Reject actions
3. Notifications → Verification results

### testIDs Required

**Activity List with Verification Status:**
- ⚠️  `activity-verification-badge-{activityId}` - Shows verified/unverified status (NEED TO ADD)
- ⚠️  `unverified-activities-filter` - Filter to show only unverified (NEED TO ADD)
- ⚠️  `verify-activity-button-{activityId}` - Admin verify button (NEED TO ADD)
- ⚠️  `reject-activity-button-{activityId}` - Admin reject button (NEED TO ADD)

**Batch Verification:**
- ⚠️  `select-activity-{activityId}` - Checkbox to select activity (NEED TO ADD)
- ⚠️  `batch-verify-button` - Verify multiple activities at once (NEED TO ADD)
- ⚠️  `batch-reject-button` - Reject multiple activities (NEED TO ADD)

**Verification Modal:**
- ⚠️  `verification-modal` - Modal for verification (NEED TO ADD)
- ⚠️  `verification-notes-input` - Optional notes field (NEED TO ADD)
- ⚠️  `confirm-verify-button` - Confirm verification (NEED TO ADD)
- ⚠️  `confirm-reject-button` - Confirm rejection (NEED TO ADD)

### Test Scenarios

#### 9.1: Admin Verifies Single Activity
```javascript
describe('Activity Verification', () => {
  it('should allow admin to verify a guest activity', async () => {
    await loginAsTestUser('test-manager@rats-e2e.com', 'TestPassword123!');

    // Navigate to Activities
    await element(by.id('activities-tab')).tap();
    await waitFor(element(by.id('activities-screen')))
      .toBeVisible()
      .withTimeout(5000);

    // Filter to show only unverified activities
    await element(by.id('filter-button')).tap();
    await element(by.id('unverified-activities-filter')).tap();
    await element(by.id('apply-filter-button')).tap();

    const activityId = 'test-unverified-activity-123';

    // Verify activity shows as unverified
    await expect(element(by.id(`activity-verification-badge-${activityId}`)))
      .toHaveText('Unverified');

    // Tap verify button
    await element(by.id(`verify-activity-button-${activityId}`)).tap();

    // Add optional notes
    await waitFor(element(by.id('verification-modal')))
      .toBeVisible()
      .withTimeout(3000);

    await element(by.id('verification-notes-input'))
      .typeText('Confirmed with house supervisor. Chore completed properly.');

    // Confirm verification
    await element(by.id('confirm-verify-button')).tap();

    // Verify success notification
    await waitFor(element(by.text(/Activity Verified/i)))
      .toBeVisible()
      .withTimeout(5000);

    // Verify badge updates
    await expect(element(by.id(`activity-verification-badge-${activityId}`)))
      .toHaveText('Verified');
  });
});
```

#### 9.2: Admin Rejects Activity with Reason
```javascript
it('should allow admin to reject an activity with reason', async () => {
  await loginAsTestUser('test-manager@rats-e2e.com', 'TestPassword123!');

  await element(by.id('activities-tab')).tap();
  await waitFor(element(by.id('activities-screen')))
    .toBeVisible()
    .withTimeout(5000);

  const activityId = 'test-unverified-activity-456';

  // Tap reject button
  await element(by.id(`reject-activity-button-${activityId}`)).tap();

  await waitFor(element(by.id('verification-modal')))
    .toBeVisible()
    .withTimeout(3000);

  // Rejection requires a reason
  await element(by.id('verification-notes-input'))
    .typeText('Meeting attendance could not be confirmed. No signature in logbook.');

  await element(by.id('confirm-reject-button')).tap();

  await waitFor(element(by.text(/Activity Rejected/i)))
    .toBeVisible()
    .withTimeout(5000);

  // Activity should be marked as rejected/removed
  await expect(element(by.id(`activity-item-${activityId}`))).not.toBeVisible();
});
```

#### 9.3: Batch Verification of Multiple Activities
```javascript
it('should allow admin to verify multiple activities at once', async () => {
  await loginAsTestUser('test-manager@rats-e2e.com', 'TestPassword123!');

  await element(by.id('activities-tab')).tap();
  await waitFor(element(by.id('activities-screen')))
    .toBeVisible()
    .withTimeout(5000);

  // Select multiple activities
  await element(by.id('select-activity-test-unverified-activity-1')).tap();
  await element(by.id('select-activity-test-unverified-activity-2')).tap();
  await element(by.id('select-activity-test-unverified-activity-3')).tap();

  // Verify batch verify button is enabled
  await expect(element(by.id('batch-verify-button'))).toBeVisible();

  // Tap batch verify
  await element(by.id('batch-verify-button')).tap();

  await waitFor(element(by.id('verification-modal')))
    .toBeVisible()
    .withTimeout(3000);

  await element(by.id('verification-notes-input'))
    .typeText('Verified all three activities during house walkthrough.');

  await element(by.id('confirm-verify-button')).tap();

  // Verify success for batch
  await waitFor(element(by.text(/3 Activities Verified/i)))
    .toBeVisible()
    .withTimeout(5000);
});
```

#### 9.4: Guest Cannot Verify Own Activities (Negative Case)
```javascript
it('should NOT allow guest to verify their own activities', async () => {
  await loginAsTestUser('test-guest-a@rats-e2e.com', 'TestPassword123!');

  await element(by.id('activities-tab')).tap();
  await waitFor(element(by.id('activities-screen')))
    .toBeVisible()
    .withTimeout(5000);

  const ownActivityId = 'test-guest-a-activity-123';

  // Verify/reject buttons should not exist for guests
  await expect(element(by.id(`verify-activity-button-${ownActivityId}`))).not.toExist();
  await expect(element(by.id(`reject-activity-button-${ownActivityId}`))).not.toExist();
});
```

#### 9.5: Guest Receives Verification Notification
```javascript
it('should notify guest when their activity is verified', async () => {
  // Admin verifies activity
  await loginAsTestUser('test-manager@rats-e2e.com', 'TestPassword123!');
  await element(by.id('activities-tab')).tap();

  const activityId = 'test-guest-notification-activity';
  await element(by.id(`verify-activity-button-${activityId}`)).tap();
  await element(by.id('confirm-verify-button')).tap();

  // Logout and login as guest
  await logout();
  await loginAsTestUser('test-guest-a@rats-e2e.com', 'TestPassword123!');

  // Check notifications
  await element(by.id('notifications-tab')).tap();
  await waitFor(element(by.id('notifications-screen')))
    .toBeVisible()
    .withTimeout(5000);

  // Verify notification exists
  await waitFor(element(by.text(/Activity Verified/i)))
    .toBeVisible()
    .withTimeout(5000);

  // Verify notification contains activity details
  await expect(element(by.text(/chore/i))).toBeVisible();
});
```

#### 9.6: Verified Activities Count Toward Phase Requirements
```javascript
it('should count verified activities toward phase progression', async () => {
  await loginAsTestUser('test-guest-a@rats-e2e.com', 'TestPassword123!');

  // Navigate to phase progress screen
  await element(by.id('profile-tab')).tap();
  await element(by.id('phase-progress-button')).tap();

  await waitFor(element(by.id('phase-progress-screen')))
    .toBeVisible()
    .withTimeout(5000);

  // Check current progress (e.g., 3/5 chores)
  const initialProgress = await element(by.id('chores-phase-progress')).getText();
  expect(initialProgress).toBe('3 / 5');

  // Log a new chore
  await element(by.id('activities-tab')).tap();
  await element(by.id('log-chore-button')).tap();
  // ... complete chore logging ...

  // Admin verifies the chore
  await logout();
  await loginAsTestUser('test-manager@rats-e2e.com', 'TestPassword123!');
  await element(by.id('activities-tab')).tap();
  // ... verify the new chore ...

  // Login back as guest and check progress
  await logout();
  await loginAsTestUser('test-guest-a@rats-e2e.com', 'TestPassword123!');
  await element(by.id('profile-tab')).tap();
  await element(by.id('phase-progress-button')).tap();

  // Progress should increment to 4/5
  const updatedProgress = await element(by.id('chores-phase-progress')).getText();
  expect(updatedProgress).toBe('4 / 5');
});
```

### Required Test Data

**Pre-created unverified activities:**
- `test-unverified-activity-123`: Chore by Guest A (pending verification)
- `test-unverified-activity-456`: Meeting by Guest B (pending verification)
- `test-unverified-activity-1`, `test-unverified-activity-2`, `test-unverified-activity-3`: For batch verification

**Test Accounts:**
- `test-guest-a@rats-e2e.com`: Guest with activities pending verification
- `test-manager@rats-e2e.com`: Admin who verifies activities

### Priority
**CRITICAL** - Activity verification is essential for phase progression and ensures accountability. Without verification, the phase system cannot function properly and guests could falsely claim activities.

---

## Critical Path 10: Authorization & Role-Based Access Control

### User Flow
The app has three main roles: Guest, Admin (Manager), and SuperAdmin (Operator). Each role has different permissions and access to features. Testing RBAC ensures security and prevents unauthorized access.

**Roles:**
- **Guest**: Can log own activities, view own stats, participate in house chat
- **Admin (Manager)**: Can verify activities, resolve disputes, invite users, manage house settings
- **SuperAdmin (Operator)**: Can create organizations, manage multiple houses, manage subscriptions

### testIDs Required

**Admin-Only Features:**
- ⚠️  `verify-activities-button` - Should only appear for admins (NEED TO ADD)
- ⚠️  `resolve-dispute-button` - Should only appear for admins (NEED TO ADD)
- ⚠️  `house-settings-button` - Should only appear for admins (NEED TO ADD)
- ⚠️  `invite-user-button` - Should only appear for admins (NEED TO ADD)

**SuperAdmin-Only Features:**
- ⚠️  `create-organization-button` - SuperAdmin only (NEED TO ADD)
- ⚠️  `subscription-management-button` - SuperAdmin only (NEED TO ADD)
- ⚠️  `multi-house-admin-panel` - SuperAdmin only (NEED TO ADD)

**Guest Restrictions:**
- Guest should NOT see admin features
- Guest should NOT be able to verify activities
- Guest should NOT be able to modify other guests' data
- Guest should NOT be able to resolve disputes

### Test Scenarios

#### 10.1: Guest Cannot Access Admin Features (Negative Case)
```javascript
describe('Authorization - Role-Based Access Control', () => {
  it('should NOT show admin features to guest users', async () => {
    await loginAsTestUser('test-guest-a@rats-e2e.com', 'TestPassword123!');

    // Navigate to various screens and verify admin features are hidden

    // Activities screen
    await element(by.id('activities-tab')).tap();
    await waitFor(element(by.id('activities-screen')))
      .toBeVisible()
      .withTimeout(5000);

    // Admin verify button should not exist
    await expect(element(by.id('verify-activities-button'))).not.toExist();

    // House settings should not be accessible
    await element(by.id('menu-button')).tap();
    await expect(element(by.id('house-settings-button'))).not.toExist();

    // Invite user option should not exist
    await expect(element(by.id('invite-user-button'))).not.toExist();

    // Disputes screen should not show resolution buttons
    await element(by.id('disputes-tab')).tap();
    await waitFor(element(by.id('disputes-screen')))
      .toBeVisible()
      .withTimeout(5000);

    await expect(element(by.id('resolve-dispute-button'))).not.toExist();
  });
});
```

#### 10.2: Guest Cannot View Other Guests' Private Data
```javascript
it('should NOT allow guest to view other guests private information', async () => {
  await loginAsTestUser('test-guest-a@rats-e2e.com', 'TestPassword123!');

  // Navigate to house members list
  await element(by.id('house-tab')).tap();
  await element(by.id('members-list-button')).tap();

  await waitFor(element(by.id('members-list-screen')))
    .toBeVisible()
    .withTimeout(5000);

  // Tap on another guest
  await element(by.id('member-test-guest-b')).tap();

  // Should only see limited public info (name, phase)
  await expect(element(by.id('member-name'))).toBeVisible();
  await expect(element(by.id('member-phase'))).toBeVisible();

  // Should NOT see private data
  await expect(element(by.id('member-phone'))).not.toExist();
  await expect(element(by.id('member-email'))).not.toExist();
  await expect(element(by.id('member-detailed-stats'))).not.toExist();
  await expect(element(by.id('edit-member-button'))).not.toExist();
});
```

#### 10.3: Admin Can Access Admin Features
```javascript
it('should show admin features to manager users', async () => {
  await loginAsTestUser('test-manager@rats-e2e.com', 'TestPassword123!');

  // Activities screen should show verify button
  await element(by.id('activities-tab')).tap();
  await waitFor(element(by.id('activities-screen')))
    .toBeVisible()
    .withTimeout(5000);

  await expect(element(by.id('verify-activities-button'))).toBeVisible();

  // House settings should be accessible
  await element(by.id('menu-button')).tap();
  await expect(element(by.id('house-settings-button'))).toBeVisible();

  // Invite user option should exist
  await expect(element(by.id('invite-user-button'))).toBeVisible();

  // Disputes should show resolution buttons
  await element(by.id('menu-button')).tap(); // Close menu
  await element(by.id('disputes-tab')).tap();
  await waitFor(element(by.id('disputes-screen')))
    .toBeVisible()
    .withTimeout(5000);

  // Tap on a dispute
  await element(by.id('dispute-item-test-dispute-123')).tap();

  await expect(element(by.id('resolve-dispute-button'))).toBeVisible();
  await expect(element(by.id('reject-dispute-button'))).toBeVisible();
});
```

#### 10.4: Admin Can View All Guest Data
```javascript
it('should allow admin to view all guest information', async () => {
  await loginAsTestUser('test-manager@rats-e2e.com', 'TestPassword123!');

  await element(by.id('house-tab')).tap();
  await element(by.id('members-list-button')).tap();

  await waitFor(element(by.id('members-list-screen')))
    .toBeVisible()
    .withTimeout(5000);

  // Tap on a guest
  await element(by.id('member-test-guest-a')).tap();

  // Admin should see ALL data
  await expect(element(by.id('member-name'))).toBeVisible();
  await expect(element(by.id('member-phase'))).toBeVisible();
  await expect(element(by.id('member-phone'))).toBeVisible();
  await expect(element(by.id('member-email'))).toBeVisible();
  await expect(element(by.id('member-detailed-stats'))).toBeVisible();
  await expect(element(by.id('edit-member-button'))).toBeVisible();
});
```

#### 10.5: Guest Cannot Modify House Settings (Negative Case)
```javascript
it('should NOT allow guest to modify house settings', async () => {
  await loginAsTestUser('test-guest-a@rats-e2e.com', 'TestPassword123!');

  // Try to access house settings (should not be visible in menu)
  await element(by.id('menu-button')).tap();
  await expect(element(by.id('house-settings-button'))).not.toExist();

  // Even if they somehow navigate via deep link, should be blocked
  // This tests the screen-level authorization
  // Note: Deep link testing covered in separate test
});
```

#### 10.6: Manager Cannot Access SuperAdmin Features (Negative Case)
```javascript
it('should NOT allow manager to access operator features', async () => {
  await loginAsTestUser('test-manager@rats-e2e.com', 'TestPassword123!');

  // Navigate to settings
  await element(by.id('menu-button')).tap();
  await element(by.id('settings-button')).tap();

  await waitFor(element(by.id('settings-screen')))
    .toBeVisible()
    .withTimeout(5000);

  // SuperAdmin features should not exist
  await expect(element(by.id('create-organization-button'))).not.toExist();
  await expect(element(by.id('subscription-management-button'))).not.toExist();
  await expect(element(by.id('multi-house-admin-panel'))).not.toExist();
});
```

#### 10.7: SuperAdmin Can Access Operator Features
```javascript
it('should show operator features to superadmin users', async () => {
  await loginAsTestUser('test-operator@rats-e2e.com', 'TestPassword123!');

  await element(by.id('menu-button')).tap();
  await element(by.id('settings-button')).tap();

  await waitFor(element(by.id('settings-screen')))
    .toBeVisible()
    .withTimeout(5000);

  // SuperAdmin features should be visible
  await expect(element(by.id('create-organization-button'))).toBeVisible();
  await expect(element(by.id('subscription-management-button'))).toBeVisible();
  await expect(element(by.id('multi-house-admin-panel'))).toBeVisible();
});
```

#### 10.8: Role Transitions When Switching Houses
```javascript
it('should apply correct role when user switches between houses', async () => {
  // User is Admin in House A, Guest in House B
  await loginAsTestUser('test-multi-house-user@rats-e2e.com', 'TestPassword123!');

  // Start in House A (admin role)
  await expect(element(by.id('verify-activities-button'))).toBeVisible();
  await expect(element(by.id('house-settings-button'))).toBeVisible();

  // Switch to House B
  await element(by.id('house-selector-button')).tap();
  await element(by.id('house-option-house-b')).tap();

  await waitFor(element(by.id('activities-screen')))
    .toBeVisible()
    .withTimeout(5000);

  // Admin features should now be hidden (guest role in House B)
  await expect(element(by.id('verify-activities-button'))).not.toExist();
  await element(by.id('menu-button')).tap();
  await expect(element(by.id('house-settings-button'))).not.toExist();

  // Switch back to House A
  await element(by.id('menu-button')).tap(); // Close menu
  await element(by.id('house-selector-button')).tap();
  await element(by.id('house-option-house-a')).tap();

  // Admin features should reappear
  await waitFor(element(by.id('verify-activities-button')))
    .toBeVisible()
    .withTimeout(5000);
});
```

### Required Test Data

**Test Accounts with Different Roles:**
- `test-guest-a@rats-e2e.com`: Guest role in Test House A
- `test-guest-b@rats-e2e.com`: Guest role in Test House A
- `test-manager@rats-e2e.com`: Admin role in Test House A
- `test-operator@rats-e2e.com`: SuperAdmin role (operator account)
- `test-multi-house-user@rats-e2e.com`: Admin in House A, Guest in House B

**Pre-created Houses:**
- `test-house-a`: House with both guests and admins
- `test-house-b`: House where multi-house user is a guest

### Priority
**CRITICAL** - Authorization failures could lead to serious security vulnerabilities. Guests should never be able to access admin features, modify other users' data, or bypass role restrictions. This is essential for data privacy and system security.

---

## Critical Path 11: Medication Tracking

### User Flow
Medication tracking is the 5th activity type (alongside chores, meetings, work, and supporter). Guests log their medication compliance, which counts toward phase requirements.

**Note:** Based on code review (GuestMedicationSummary.tsx:78-79), medication tracking is "currently being updated to work with the new activity system." This test plan assumes the feature will be fully integrated with the activity system.

**Flow:**
1. Guest navigates to medication tracking
2. Guest logs medication taken (with timestamp)
3. Activity is logged as MEDICATION type
4. Admin can verify medication activity
5. Medication compliance counts toward phase requirements

### Screens Required
1. Guest Medication Overview → Log medication
2. Activity Log → View medication activities
3. Phase Progress → Medication requirements

### testIDs Required

**Medication Tracking Screen:**
- ⚠️  `medication-tracking-screen` - Main container (NEED TO ADD)
- ⚠️  `log-medication-button` - Button to log medication (NEED TO ADD)
- ⚠️  `medication-name-input` - Medication name field (NEED TO ADD)
- ⚠️  `medication-dosage-input` - Dosage information (NEED TO ADD)
- ⚠️  `medication-time-input` - Time taken (NEED TO ADD)
- ⚠️  `medication-notes-input` - Optional notes (NEED TO ADD)
- ⚠️  `submit-medication-button` - Submit medication log (NEED TO ADD)

**Medication History:**
- ⚠️  `medication-history-list` - List of logged medications (NEED TO ADD)
- ⚠️  `medication-item-{activityId}` - Individual medication entry (NEED TO ADD)
- ⚠️  `medication-compliance-chart` - Visual compliance chart (NEED TO ADD)

**Phase Requirements:**
- ⚠️  `medication-phase-requirement` - Shows required medication logs (NEED TO ADD)
- ⚠️  `medication-phase-progress` - Current progress (e.g., "6 / 7") (NEED TO ADD)

### Test Scenarios

#### 11.1: Guest Logs Medication
```javascript
describe('Medication Tracking', () => {
  it('should allow guest to log medication taken', async () => {
    await loginAsTestUser('test-guest-a@rats-e2e.com', 'TestPassword123!');

    // Navigate to medication tracking
    await element(by.id('profile-tab')).tap();
    await element(by.id('medication-tracking-button')).tap();

    await waitFor(element(by.id('medication-tracking-screen')))
      .toBeVisible()
      .withTimeout(5000);

    // Tap log medication button
    await element(by.id('log-medication-button')).tap();

    // Fill in medication details
    await element(by.id('medication-name-input'))
      .typeText('Suboxone');

    await element(by.id('medication-dosage-input'))
      .typeText('8mg');

    await element(by.id('medication-time-input'))
      .typeText('08:00 AM');

    await element(by.id('medication-notes-input'))
      .typeText('Taken with food as prescribed');

    // Submit
    await element(by.id('submit-medication-button')).tap();

    // Verify success
    await waitFor(element(by.text(/Medication Logged/i)))
      .toBeVisible()
      .withTimeout(5000);

    // Verify appears in history
    await waitFor(element(by.id('medication-history-list')))
      .toBeVisible()
      .withTimeout(3000);

    await expect(element(by.text('Suboxone'))).toBeVisible();
    await expect(element(by.text('8mg'))).toBeVisible();
  });
});
```

#### 11.2: Medication Activity Appears in Activity Log
```javascript
it('should show medication as activity in activity log', async () => {
  await loginAsTestUser('test-guest-a@rats-e2e.com', 'TestPassword123!');

  // Log a medication first
  await element(by.id('profile-tab')).tap();
  await element(by.id('medication-tracking-button')).tap();
  await element(by.id('log-medication-button')).tap();
  await element(by.id('medication-name-input')).typeText('Methadone');
  await element(by.id('medication-dosage-input')).typeText('40mg');
  await element(by.id('submit-medication-button')).tap();

  // Navigate to activities
  await element(by.id('activities-tab')).tap();
  await waitFor(element(by.id('activities-screen')))
    .toBeVisible()
    .withTimeout(5000);

  // Filter by medication type
  await element(by.id('filter-button')).tap();
  await element(by.id('activity-type-medication')).tap();
  await element(by.id('apply-filter-button')).tap();

  // Verify medication activity appears
  await waitFor(element(by.text('Methadone')))
    .toBeVisible()
    .withTimeout(5000);

  await expect(element(by.text('40mg'))).toBeVisible();
});
```

#### 11.3: Admin Verifies Medication Activity
```javascript
it('should allow admin to verify medication activity', async () => {
  // Guest logs medication
  await loginAsTestUser('test-guest-a@rats-e2e.com', 'TestPassword123!');
  await element(by.id('profile-tab')).tap();
  await element(by.id('medication-tracking-button')).tap();
  await element(by.id('log-medication-button')).tap();
  await element(by.id('medication-name-input')).typeText('Naltrexone');
  await element(by.id('submit-medication-button')).tap();

  const medicationActivityId = 'test-medication-activity-123'; // Get from response

  // Logout and login as admin
  await logout();
  await loginAsTestUser('test-manager@rats-e2e.com', 'TestPassword123!');

  // Navigate to activities
  await element(by.id('activities-tab')).tap();
  await waitFor(element(by.id('activities-screen')))
    .toBeVisible()
    .withTimeout(5000);

  // Filter to medication activities
  await element(by.id('filter-button')).tap();
  await element(by.id('activity-type-medication')).tap();
  await element(by.id('unverified-activities-filter')).tap();
  await element(by.id('apply-filter-button')).tap();

  // Verify the medication activity
  await element(by.id(`verify-activity-button-${medicationActivityId}`)).tap();
  await element(by.id('verification-notes-input'))
    .typeText('Verified medication log with house nurse.');
  await element(by.id('confirm-verify-button')).tap();

  await waitFor(element(by.text(/Activity Verified/i)))
    .toBeVisible()
    .withTimeout(5000);
});
```

#### 11.4: Medication Counts Toward Phase Requirements
```javascript
it('should count verified medications toward phase progression', async () => {
  await loginAsTestUser('test-guest-a@rats-e2e.com', 'TestPassword123!');

  // Check initial medication phase progress
  await element(by.id('profile-tab')).tap();
  await element(by.id('phase-progress-button')).tap();

  await waitFor(element(by.id('phase-progress-screen')))
    .toBeVisible()
    .withTimeout(5000);

  // Assuming phase requires 7 medications per week, currently at 5/7
  const initialProgress = await element(by.id('medication-phase-progress')).getText();
  expect(initialProgress).toBe('5 / 7');

  // Log medication
  await element(by.id('back-button')).tap();
  await element(by.id('medication-tracking-button')).tap();
  await element(by.id('log-medication-button')).tap();
  await element(by.id('medication-name-input')).typeText('Suboxone');
  await element(by.id('submit-medication-button')).tap();

  // Admin verifies
  await logout();
  await loginAsTestUser('test-manager@rats-e2e.com', 'TestPassword123!');
  // ... verify medication activity ...

  // Check updated progress
  await logout();
  await loginAsTestUser('test-guest-a@rats-e2e.com', 'TestPassword123!');
  await element(by.id('profile-tab')).tap();
  await element(by.id('phase-progress-button')).tap();

  const updatedProgress = await element(by.id('medication-phase-progress')).getText();
  expect(updatedProgress).toBe('6 / 7');
});
```

#### 11.5: Medication Compliance Visualization
```javascript
it('should show medication compliance chart', async () => {
  await loginAsTestUser('test-guest-a@rats-e2e.com', 'TestPassword123!');

  await element(by.id('profile-tab')).tap();
  await element(by.id('medication-tracking-button')).tap();

  await waitFor(element(by.id('medication-tracking-screen')))
    .toBeVisible()
    .withTimeout(5000);

  // Verify compliance chart is visible
  await expect(element(by.id('medication-compliance-chart'))).toBeVisible();

  // Verify shows last 7 days
  await expect(element(by.id('chart-day-0'))).toBeVisible();
  await expect(element(by.id('chart-day-6'))).toBeVisible();

  // Days with logged medication should be marked
  // (Assuming test data has medications logged on days 0, 1, 3, 5, 6)
  await expect(element(by.id('chart-day-0-status'))).toHaveText('completed');
  await expect(element(by.id('chart-day-2-status'))).toHaveText('missing');
});
```

#### 11.6: Guest Cannot Log Medication for Others (Negative Case)
```javascript
it('should NOT allow guest to log medication for other guests', async () => {
  await loginAsTestUser('test-guest-a@rats-e2e.com', 'TestPassword123!');

  await element(by.id('profile-tab')).tap();
  await element(by.id('medication-tracking-button')).tap();

  // Should only be able to log own medication
  // Guest selector should not exist
  await expect(element(by.id('select-guest-dropdown'))).not.toExist();

  // Logged medication should automatically be for current user
  await element(by.id('log-medication-button')).tap();
  await element(by.id('medication-name-input')).typeText('Test Med');
  await element(by.id('submit-medication-button')).tap();

  // Verify it's logged for current user only
  const medicationEntry = await element(by.id('medication-item-0'));
  await expect(medicationEntry).toBeVisible();
  // Should not have "Logged by: Guest B" text
  await expect(element(by.text(/Logged by:/i))).not.toExist();
});
```

### Required Test Data

**Test Accounts:**
- `test-guest-a@rats-e2e.com`: Guest who logs medications
- `test-manager@rats-e2e.com`: Admin who verifies medications

**Phase Requirements:**
- Phase 1 requires 7 medications per week
- Pre-created medication activities to test compliance chart

### Priority
**HIGH** - Medication tracking is critical for recovery houses managing residents on Medication-Assisted Treatment (MAT). This is the 5th activity type and must be tested to ensure complete activity system coverage. Currently identified as a gap in the existing test plan.

---

## Test Data Requirements

### Firebase Test Account
For authentication and user flow tests, create test accounts:

**Manager Account:**
- Email: `test-manager@rats-e2e.com`
- Password: `TestPassword123!`
- Role: House Manager
- House: Test House (ID: `test-house-123`)

**Guest Account:**
- Email: `test-guest@rats-e2e.com`
- Password: `TestPassword123!`
- Role: Guest
- House: Test House (ID: `test-house-123`)

**Guest Account A (for dispute/verification tests):**
- Email: `test-guest-a@rats-e2e.com`
- Password: `TestPassword123!`
- Role: Guest
- House: Test House (ID: `test-house-123`)
- Purpose: Creates activities that can be disputed/verified

**Guest Account B (for dispute tests):**
- Email: `test-guest-b@rats-e2e.com`
- Password: `TestPassword123!`
- Role: Guest
- House: Test House (ID: `test-house-123`)
- Purpose: Disputes Guest A's activities

**Multi-House User (for authorization tests):**
- Email: `test-multi-house-user@rats-e2e.com`
- Password: `TestPassword123!`
- Roles:
  - Admin in Test House A (ID: `test-house-a`)
  - Guest in Test House B (ID: `test-house-b`)
- Purpose: Tests role transitions when switching houses

**Operator Account:**
- Email: `test-operator@rats-e2e.com`
- Password: `TestPassword123!`
- Role: Operator/Org Admin
- Organization: Test Org (ID: `test-org-123`)
- Purpose: Tests SuperAdmin-only features

### Test House Data
Create test houses in Firebase:

**Test House (original):**
- Name: "Test House"
- ID: `test-house-123`
- Capacity: 8 beds
- Existing guests: 3
- Existing managers: 1

**Test House A (for multi-house tests):**
- Name: "Test House A"
- ID: `test-house-a`
- Capacity: 10 beds
- Purpose: Multi-house user is Admin here

**Test House B (for multi-house tests):**
- Name: "Test House B"
- ID: `test-house-b`
- Capacity: 12 beds
- Purpose: Multi-house user is Guest here

### Test Chores
Create test chores for guest stat update tests:
- Kitchen Cleaning (ID: `test-chore-kitchen`)
- Bathroom Cleaning (ID: `test-chore-bathroom`)
- Trash Duty (ID: `test-chore-trash`)

### Test Activities (for Dispute/Verification Tests)
Pre-create activities in Firebase for testing disputes and verification:

**For Dispute Testing:**
- `test-activity-123`: Chore activity by Guest A (status: active, verified: false)
  - Type: CHORE
  - Guest: test-guest-a@rats-e2e.com
  - Description: "Cleaned kitchen"
  - Can be disputed by Guest B

- `test-activity-own-123`: Activity by current user
  - Type: CHORE
  - Guest: test-guest-a@rats-e2e.com
  - Purpose: Test that user cannot dispute own activity

- `test-activity-456`: Job activity by Guest C
  - Type: WORK
  - Guest: test-guest-c@rats-e2e.com
  - Purpose: Another disputable activity

**For Verification Testing:**
- `test-unverified-activity-123`: Unverified chore
  - Type: CHORE
  - Guest: test-guest-a@rats-e2e.com
  - verified: false
  - Purpose: Admin verification test

- `test-unverified-activity-456`: Unverified meeting
  - Type: MEETING
  - Guest: test-guest-b@rats-e2e.com
  - verified: false
  - Purpose: Admin rejection test

- `test-unverified-activity-1`, `test-unverified-activity-2`, `test-unverified-activity-3`:
  - Type: Various
  - verified: false
  - Purpose: Batch verification test

**For Medication Testing:**
- `test-medication-activity-123`: Medication log
  - Type: MEDICATION
  - Guest: test-guest-a@rats-e2e.com
  - verified: false
  - data: { name: "Naltrexone", dosage: "50mg" }

### Test Disputes
Pre-create disputes for testing resolution workflow:

- `test-dispute-123`: Pending dispute (for admin approval)
  - activityId: test-activity-123
  - status: pending
  - guestId: test-guest-a@rats-e2e.com
  - message: "This chore was not completed properly."
  - createdBy: test-guest-b@rats-e2e.com

- `test-dispute-456`: Pending dispute (for admin rejection)
  - activityId: test-activity-456
  - status: pending
  - message: "Work hours seem inflated."

- `test-dispute-rejected-123`: Rejected dispute (for challenge flow)
  - activityId: test-activity-789
  - status: rejected
  - resolvedBy: test-manager@rats-e2e.com
  - resolutionMessage: "Activity was completed properly."

### Test Notifications
Pre-create notifications for testing notification system:
- Dispute created notification
- Dispute resolved notification
- Activity verified notification
- Activity rejected notification

### Phase Requirements (for testing progression)
Configure test house phases with:
- **Chores:** 5 per week
- **Meetings:** 3 per week
- **Work Hours:** 20 hours per week
- **Sponsor Meetings:** 1 per week
- **Medications:** 7 per week (daily compliance)

---

## Implementation Order

### Phase 0: Smoke Tests (Week 1) ✅
1. ✅ Login smoke test (COMPLETED)
   - App launches
   - Login screen displays
   - Basic UI elements visible

### Phase 1: Authentication & Core Onboarding (Week 1-2)
1. ✅ Sign Up flow (Path 1)
2. ✅ Login flow (Path 2)
3. ✅ Sign up via invite (Path 3)
   - Priority: Get basic auth working end-to-end

### Phase 2: Guest Features (Week 2-3)
4. Guest stat updates - Chores (Path 4A)
5. Guest stat updates - Job (Path 4B)
6. Guest stat updates - Sponsor (Path 4C)
7. Guest stat updates - Meetings (Path 4D)
   - Priority: Core daily guest interactions

### Phase 3: House Management (Week 3-4)
8. Inviting a guest (Path 5)
9. Inviting a manager (Path 6)
   - Priority: Essential house management features

### Phase 4: Operator Features (Week 4)
10. House creation wizard (Path 7)
    - Priority: Critical for scaling to multiple houses

### Phase 5: CRITICAL ACCOUNTABILITY FEATURES (Week 5-6) **HIGH PRIORITY**
**These are fully implemented features with ZERO test coverage. Must be tested ASAP.**

11. **Dispute/Challenge System (Path 8)** - CRITICAL
    - Guest disputes activity
    - Admin resolves dispute
    - Guest challenges resolution
    - Notifications sent
    - Priority: CORE accountability feature

12. **Activity Verification (Path 9)** - CRITICAL
    - Admin verifies activities
    - Admin rejects activities
    - Batch verification
    - Verification notifications
    - Priority: Essential for phase progression

13. **Authorization & RBAC (Path 10)** - CRITICAL
    - Guest cannot access admin features
    - Admin can access all features
    - Role transitions on house switch
    - Data privacy enforcement
    - Priority: Security and data protection

14. **Medication Tracking (Path 11)** - HIGH
    - Guest logs medication
    - Medication appears in activity log
    - Admin verifies medications
    - Counts toward phase requirements
    - Priority: 5th activity type, phase requirement

---

## testID Addition Strategy

### High Priority testIDs (Add First)
These are needed for Week 1-2 tests:

**Authentication Screens:**
- ✅ Login screen (all testIDs already present)
- ✅ SignUp screen (all testIDs already present)
- ⚠️  New Account screen (need to add)
- ⚠️  Role confirmation screen (need to add)

**Guest Stats Screens:**
- ⚠️  Guest overview (need to add)
- ⚠️  Chore management (need to add)
- ⚠️  Job updates (need to add)
- ⚠️  Sponsor tracking (need to add)
- ⚠️  Meeting logging (need to add)

### Medium Priority testIDs (Add Week 3)
**House Management:**
- ⚠️  Guest list screen (exists, needs more testIDs)
- ⚠️  Create guest screen (exists, needs more testIDs)
- ⚠️  Manager settings (need to add)

### Lower Priority testIDs (Add Week 4)
**Operator Features:**
- ⚠️  Org setup (need to add)
- ⚠️  House creation wizard (need to add)

---

## Running Tests

### Run All Critical Path Tests
```bash
npx detox test e2e/critical-paths/ --configuration ios.sim.debug
```

### Run Specific Path
```bash
# Authentication only
npx detox test e2e/critical-paths/authentication.test.js --configuration ios.sim.debug

# Guest stats only
npx detox test e2e/critical-paths/guest-stats.test.js --configuration ios.sim.debug

# House management only
npx detox test e2e/critical-paths/house-management.test.js --configuration ios.sim.debug
```

### Run with Verbose Logging
```bash
npx detox test --configuration ios.sim.debug --loglevel trace
```

---

## Success Criteria

### Phase 0 (Week 1) - Smoke Tests ✅ COMPLETED
- ✅ Smoke test passing (app launches, shows login)
- ✅ 6 test cases passing
- ✅ Test coverage: ~5%

### Phase 1 (Week 1-2) - Authentication & Onboarding
- ✅ All authentication tests passing (5+ scenarios)
- ✅ Sign up flow tests passing
- ✅ Invitation flow tests passing (3+ scenarios)
- ✅ Test coverage: 15-20%

### Phase 2 (Week 2-3) - Guest Features
- ✅ All guest stat update tests passing (4 activity types)
  - Chores
  - Job/Work Hours
  - Sponsor Meetings
  - NA/AA Meetings
- ✅ Test coverage: 30%+

### Phase 3 (Week 3-4) - House Management
- ✅ Guest invitation tests passing
- ✅ Manager invitation tests passing
- ✅ Test coverage: 35%+

### Phase 4 (Week 4) - Operator Features
- ✅ Operator house creation tests passing
- ✅ Organization setup tests passing
- ✅ All 7 original critical paths have passing tests
- ✅ Test coverage: 40%+

### Phase 5 (Week 5-6) - CRITICAL ACCOUNTABILITY FEATURES ⚠️ **HIGH PRIORITY**
**GOAL: Test the fully implemented features that currently have ZERO coverage**

#### Critical Path 8: Dispute/Challenge System
- ✅ Guest can dispute activity (6 test scenarios)
- ✅ Admin can resolve disputes
- ✅ Guest can challenge dispute decisions
- ✅ Negative cases (guest cannot dispute own, guest cannot resolve)
- ✅ Notifications sent for all dispute events
- **Impact:** CORE accountability feature tested

#### Critical Path 9: Activity Verification
- ✅ Admin can verify activities (6 test scenarios)
- ✅ Admin can reject activities
- ✅ Batch verification works
- ✅ Guests receive verification notifications
- ✅ Verified activities count toward phase requirements
- ✅ Negative case: guest cannot verify own activities
- **Impact:** Phase progression system validated

#### Critical Path 10: Authorization & RBAC
- ✅ Guest cannot access admin features (8 test scenarios)
- ✅ Guest cannot view other guests' private data
- ✅ Admin can access all admin features
- ✅ Admin can view all guest data
- ✅ Manager cannot access SuperAdmin features
- ✅ SuperAdmin can access operator features
- ✅ Role transitions work when switching houses
- **Impact:** Security and data privacy enforced

#### Critical Path 11: Medication Tracking
- ✅ Guest can log medications (6 test scenarios)
- ✅ Medications appear in activity log
- ✅ Admin can verify medication activities
- ✅ Medications count toward phase requirements
- ✅ Compliance visualization works
- ✅ Negative case: guest cannot log for others
- **Impact:** 5th activity type fully tested

### Phase 5 Success Metrics
- ✅ All 4 critical accountability features tested
- ✅ 26+ new test scenarios added
- ✅ All 11 critical paths have passing tests
- ✅ Test coverage: 65%+ (up from 40%)
- ✅ Zero CRITICAL features without test coverage

### Phase 6 (Future) - Remaining Features
After Phase 5, the following features should be added to achieve 80%+ coverage:
- Issue Management System
- Complaint System
- Weekly Reports
- House Chat & Direct Messaging
- Notification System
- Meeting Search & Discovery
- Supporter Role Features
- Subscription Management
- House Search
- Multi-House Navigation (beyond authorization)

---

## Notes

### Firebase Configuration for E2E
For E2E tests to work properly with Firebase:
1. Consider using Firebase Emulator Suite for local testing
2. Or create dedicated E2E test project in Firebase
3. Ensure test accounts are pre-seeded
4. Consider mocking Firebase Auth for faster test execution

### Detox Synchronization
Some screens (like Splash with Firebase init) may require:
```javascript
await device.disableSynchronization(); // For Firebase operations
await waitFor(element(by.id('target-screen'))).toBeVisible().withTimeout(30000);
await device.enableSynchronization(); // Re-enable after screen loads
```

### Test Isolation
Each test should:
1. Start from a known state (use beforeEach to reset)
2. Clean up after itself (delete test data created)
3. Not depend on other tests running first
4. Use unique test data to avoid conflicts

---

## Summary

**This document provides a comprehensive testing roadmap for all critical code paths in the Regroup app.**

### Coverage Overview
- **11 Critical Paths** with detailed test plans
- **60+ Test Scenarios** across all paths
- **4 Priority Levels** for implementation
- **Complete Test Data Requirements** documented

### Critical Accountability Features (Phase 5 - HIGH PRIORITY)
The most important addition to this plan is Phase 5, which tests the **CORE accountability features** that are fully implemented but had ZERO test coverage:

1. **Dispute System** - Allows challenging activities and admin resolution
2. **Activity Verification** - Admin approval workflow for all activities
3. **Authorization/RBAC** - Security and permission enforcement
4. **Medication Tracking** - 5th activity type for MAT compliance

These features are **CRITICAL** because:
- They are already in production use
- They handle sensitive accountability and security concerns
- They have never been tested end-to-end
- Failures could compromise the entire house management system

### Next Steps
1. Continue with Phases 1-4 (authentication, guest features, house management, operator features)
2. **PRIORITIZE Phase 5** - Implement tests for dispute system, verification, authorization, and medication
3. Achieve 65%+ test coverage with all critical features validated
4. Expand to Phase 6 for remaining features (chat, notifications, reports, etc.)

---

**Document Status:** Comprehensive and Ready for Implementation
**Last Updated:** February 12, 2026
