# E2E Test Coverage Design

**Date:** 2026-02-13
**Branch:** fix/mvp-p1-fixes
**Status:** Approved

## Problem

Every existing e2e spec except `treasury.spec.js` and `auth.spec.js` is aspirational — it references UI elements (analytics charts, reactions, events, offline mode, backups, system logs) that don't exist in the actual app. Additionally, `helpers.js` uses the wrong testID names for the login flow, so **zero existing specs run successfully today**.

## Decision

Replace all broken specs with tests anchored to real components and real testIDs. Use a TDD-style approach: for each feature area, define testIDs → add them to components → write spec → commit.

## Navigation Structure

```
AppNavigator
├── OnboardingScreen (first launch only)
└── MainTabNavigator (tabs)
    ├── Home → GroupStackNavigator
    │   ├── GroupListScreen (group-list-screen)
    │   ├── GroupOverviewScreen (group-overview-screen-${id})
    │   ├── GroupTreasuryScreen (group-treasury-screen-${id})
    │   ├── AddTransactionScreen
    │   ├── GroupAnnouncementsScreen (group-announcements-screen-${id})
    │   ├── GroupChatScreen (group-chat-screen-${id})
    │   ├── GroupMembersScreen (group-members-screen-${id})
    │   └── ... (service positions, business meetings, handoff, etc.)
    ├── Meetings → MeetingScreen (meetings-screen)
    ├── GroupSearch → GroupSearchScreen
    ├── Messages → MessagesNavigator
    │   ├── ConversationsListScreen (no testIDs — need to add)
    │   └── DirectMessageScreen (no testIDs — need to add)
    ├── Profile → ProfileNavigator
    │   ├── ProfileScreen (2 testIDs — need more)
    │   └── SobrietyTrackerScreen
    └── AdminPanel → AdminPanelScreen (no testIDs — need to add, super admin only)
```

## TestID Status by Screen

| Screen | Current testIDs | Status |
|---|---|---|
| LoginScreen | 7 (login-screen, login-email-input, etc.) | ✅ Ready |
| RegisterScreen | 9 (register-screen, inputs, etc.) | ⚠️ Missing: next-step buttons |
| ForgotPasswordScreen | 6 | ✅ Ready |
| LandingScreen | 4 | ✅ Ready |
| MeetingScreen | 24 | ✅ Ready |
| GroupListScreen | 9 | ✅ Ready |
| GroupOverviewScreen | 40+ | ✅ Ready |
| GroupAnnouncementsScreen | 8 | ✅ Ready |
| GroupTreasuryScreen | 11 | ✅ Ready |
| GroupChatScreen | 17 | ✅ Ready |
| GroupMembersScreen | 7 | ✅ Ready |
| ConversationsListScreen | 0 | ❌ Need to add |
| DirectMessageScreen | 0 | ❌ Need to add |
| ProfileScreen | 2 | ⚠️ Need sign-out button + screen container |
| AdminPanelScreen | 0 | ❌ Need to add |

## Critical Fix: helpers.js

Current `helpers.login()` uses wrong testIDs:
- `email-input` → should be `login-email-input`
- `password-input` → should be `login-password-input`
- `login-button` → should be `login-signin-button`
- waits for `home-screen` → should wait for `group-list-screen`

Current `helpers.logout()` uses undefined tab testIDs and `settings-button` which doesn't exist. Fix: use `by.text('Profile')` for tab navigation + `profile-sign-out-button` testID (to be added to ProfileScreen).

## Test Coverage Plan (13 specs)

| File | Action | Screens |
|---|---|---|
| `e2e/helpers.js` | Fix testID mismatches + add navigateTo helper | — |
| `auth/auth.spec.js` | Rewrite | Login, Register, ForgotPassword, Logout |
| `meetings/meetings.spec.js` | Rewrite | MeetingScreen |
| `homegroup/groups.spec.js` | New | GroupListScreen |
| `homegroup/group-overview.spec.js` | New | GroupOverviewScreen |
| `homegroup/group-announcements.spec.js` | Rename + rewrite | GroupAnnouncementsScreen |
| `homegroup/treasury.spec.js` | Minor fix (remove dead test) | GroupTreasuryScreen, AddTransactionScreen |
| `homegroup/group-chat.spec.js` | New | GroupChatScreen |
| `homegroup/group-members.spec.js` | Rename + rewrite | GroupMembersScreen |
| `messages/messages.spec.js` | New | ConversationsListScreen, DirectMessageScreen |
| `profile/profile.spec.js` | Rewrite | ProfileScreen, SobrietyTrackerScreen |
| `admin/admin.spec.js` | Rewrite | AdminPanelScreen |

## Data Strategy

- All tests use the real Firebase dev environment
- Test account: `marcusk639@gmail.com` (already in a group with treasurer/admin role)
- No mocking — real-world tests against the actual backend
- Tests that require existing data (treasury transactions, group members, messages) assume pre-seeded data from the test account's normal usage
